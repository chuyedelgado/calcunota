import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import {
  esMarcadorDeElectiva,
  letraAPuntos,
  letraHabilitaGraduacion,
  nombrePeriodo,
  notaALetra,
  secuenciaDePeriodo,
  simularRepeticion,
  type CursoIndice,
  type Letra,
  type TipoPeriodo,
} from "@/lib/calculos";
import { calcularIndiceDesdeCursos, type CursoParaIndice } from "@/lib/indice";
import { calcularAvance } from "@/lib/avance";
import { proyectarObjetivoCarrera, referenciaLetra } from "@/lib/proyeccionCarrera";
import Trayectoria, { type PeriodoTrayectoria } from "./Trayectoria";

export default async function CarreraPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/");
  }

  const perfil = await prisma.perfilEstudiante.findUnique({
    where: { userId: session.user.id },
    select: {
      id: true,
      planId: true,
      indiceObjetivo: true,
      plan: { select: { totalCreditos: true } },
    },
  });
  if (!perfil) {
    redirect("/onboarding");
  }

  const [cursos, materiasPlan] = await Promise.all([
    prisma.curso.findMany({
      where: { perfilId: perfil.id },
      select: {
        id: true,
        materiaId: true,
        creditos: true,
        fundamental: true,
        estado: true,
        notaFinal: true,
        letraFinal: true,
        periodo: { select: { anio: true, tipo: true } },
        materia: { select: { codigo: true, nombre: true } },
      },
    }),
    prisma.materiaPlan.findMany({
      where: { planId: perfil.planId },
      select: {
        materiaId: true,
        creditos: true,
        fundamental: true,
        materia: { select: { codigo: true, nombre: true } },
        prerequisitos: { select: { materiaRequeridaId: true } },
      },
    }),
  ]);

  // --- Índice acumulado ---
  // Cuentan los cursos con resultado: por letra (historial) o por nota (semestre).
  const cerrados = cursos.filter((c) => c.notaFinal !== null || c.letraFinal !== null);

  // Estado vacío de primer uso: sin historial no hay índice que mostrar.
  if (cerrados.length === 0) {
    return (
      <section className="section_container max-w-2xl">
        <h1 className="text-30-bold text-tinta mb-4">Mi carrera</h1>
        <div className="tarjeta-hero p-7 text-center">
          <p className="text-20-medium font-bold text-tinta mb-2">Aún no ves tu carrera completa</p>
          <p className="text-16-medium !text-black-300 mb-6">
            Carga tu historial y en segundos verás tu índice acumulado real, tu avance y qué te falta
            para tu objetivo. Es lo que ninguna otra herramienta te da.
          </p>
          <Button asChild className="calcular_btn w-full">
            <Link href="/historial/importar">Cargar mi historial desde el PDF</Link>
          </Button>
          <Link
            href="/historial/cargar"
            className="inline-block mt-3 text-14-normal font-semibold !text-primary-ink underline underline-offset-2"
          >
            o márcalo a mano
          </Link>
        </div>
      </section>
    );
  }

  const letraEfectiva = (c: (typeof cursos)[number]): Letra | null =>
    c.notaFinal !== null ? (notaALetra(c.notaFinal) as Letra) : (c.letraFinal as Letra | null);

  const paraIndice: CursoParaIndice[] = cerrados.map((c) => ({
    id: c.id,
    materiaId: c.materiaId,
    creditos: c.creditos,
    notaFinal: c.notaFinal,
    letra: c.notaFinal === null ? (c.letraFinal as Letra | null) : null,
    periodo: { anio: c.periodo.anio, tipo: c.periodo.tipo as TipoPeriodo },
  }));
  const acumulado = calcularIndiceDesdeCursos(paraIndice);

  // CursoIndice[] para simularRepeticion.
  const cursosIndice: CursoIndice[] = cerrados.map((c) => ({
    id: c.id,
    materiaId: c.materiaId,
    creditos: c.creditos,
    notaFinal: c.notaFinal,
    letra: c.notaFinal === null ? (c.letraFinal as Letra | null) : null,
    secuencia: secuenciaDePeriodo(c.periodo.anio, c.periodo.tipo as TipoPeriodo),
  }));

  // --- Avance de carrera ---
  const requeridas = materiasPlan.filter((mp) => !esMarcadorDeElectiva(mp.materia.codigo));
  const totalPlan =
    perfil.plan.totalCreditos > 0
      ? perfil.plan.totalCreditos
      : materiasPlan.reduce((a, mp) => a + mp.creditos, 0);

  // Estado por materia (una materia puede tener varios intentos).
  type EstadoMat = "aprobada" | "reprobada" | "en_curso";
  const estadoMateria = new Map<string, { estado: EstadoMat; creditos: number }>();
  for (const c of cursos) {
    const prev = estadoMateria.get(c.materiaId);
    const rank = (e: EstadoMat) => (e === "aprobada" ? 3 : e === "en_curso" ? 2 : 1);
    const actual: EstadoMat =
      c.estado === "APROBADO" ? "aprobada" : c.estado === "EN_CURSO" ? "en_curso" : "reprobada";
    if (!prev || rank(actual) > rank(prev.estado)) {
      estadoMateria.set(c.materiaId, { estado: actual, creditos: c.creditos });
    }
  }
  const aprobadas = [...estadoMateria.values()].filter((m) => m.estado === "aprobada");
  const reprobadas = [...estadoMateria.values()].filter((m) => m.estado === "reprobada");
  const enCurso = [...estadoMateria.values()].filter((m) => m.estado === "en_curso");
  // El avance cuenta REQUISITOS DEL PLAN cumplidos, no cursos: una convalidación
  // es una obligación cumplida una sola vez, aunque haya dos filas (la materia
  // original que se cursó fuera del pénsum y la fila W del plan). Ver lib/avance.ts.
  const { creditos: creditosAprobados } = calcularAvance(requeridas, cursos);
  // Pendientes: materias requeridas del pénsum que no se han cursado. Los cupos
  // de electiva (marcadores) no se listan como materia pendiente.
  const pendientes = requeridas.filter((mp) => !estadoMateria.has(mp.materiaId));
  const progreso = totalPlan > 0 ? Math.min(100, (creditosAprobados / totalPlan) * 100) : 0;

  // --- Índice por periodo (cronológico) ---
  const clavesPeriodo = [...new Set(cerrados.map((c) => `${c.periodo.anio}:${c.periodo.tipo}`))].sort(
    (a, b) => {
      const [aa, at] = a.split(":");
      const [ba, bt] = b.split(":");
      return (
        secuenciaDePeriodo(Number(aa), at as TipoPeriodo) -
        secuenciaDePeriodo(Number(ba), bt as TipoPeriodo)
      );
    },
  );
  const porPeriodo: PeriodoTrayectoria[] = clavesPeriodo.map((k, i, arr) => {
    const [anio, tipo] = k.split(":");
    const seq = secuenciaDePeriodo(Number(anio), tipo as TipoPeriodo);
    const delPeriodo = paraIndice.filter(
      (c) => c.periodo.anio === Number(anio) && c.periodo.tipo === tipo,
    );
    const hastaAqui = paraIndice.filter(
      (c) => secuenciaDePeriodo(c.periodo.anio, c.periodo.tipo) <= seq,
    );
    const indice = calcularIndiceDesdeCursos(delPeriodo).indice;
    const acumulado = calcularIndiceDesdeCursos(hastaAqui).indice;

    // Tendencia del acumulado respecto al periodo anterior, para leer la
    // trayectoria como progresión.
    const prevKey = arr[i - 1];
    let acumuladoPrev: number | null = null;
    if (prevKey) {
      const [pa, pt] = prevKey.split(":");
      const seqPrev = secuenciaDePeriodo(Number(pa), pt as TipoPeriodo);
      acumuladoPrev = calcularIndiceDesdeCursos(
        paraIndice.filter((c) => secuenciaDePeriodo(c.periodo.anio, c.periodo.tipo) <= seqPrev),
      ).indice;
    }
    const tendencia: PeriodoTrayectoria["tendencia"] =
      acumuladoPrev === null
        ? "inicio"
        : acumulado > acumuladoPrev + 0.005
          ? "sube"
          : acumulado < acumuladoPrev - 0.005
            ? "baja"
            : "mantiene";

    // Detalle: materias del periodo con su letra, créditos y puntos aportados.
    const cursosDetalle = cerrados
      .filter((c) => c.periodo.anio === Number(anio) && c.periodo.tipo === tipo)
      .map((c) => {
        const letra = letraEfectiva(c);
        return {
          id: c.id,
          codigo: c.materia.codigo,
          nombre: c.materia.nombre,
          letra,
          notaFinal: c.notaFinal,
          creditos: c.creditos,
          puntos: letra ? letraAPuntos(letra) * c.creditos : 0,
          fundamentalD:
            c.fundamental && c.estado === "APROBADO" && letra !== null && !letraHabilitaGraduacion(letra, true),
        };
      });

    return {
      etiqueta: nombrePeriodo(Number(anio), tipo as TipoPeriodo),
      indice,
      acumulado,
      tendencia,
      cursos: cursosDetalle,
    };
  });

  // --- Proyección al objetivo ---
  const objetivo = perfil.indiceObjetivo;
  const proyeccion =
    objetivo != null
      ? proyectarObjetivoCarrera(acumulado.puntos, acumulado.creditos, totalPlan, objetivo)
      : null;

  // --- Alertas de graduación ---
  // Fundamentales aprobadas con D (bloquean graduación).
  const fundamentalesConD = cursos
    .filter((c) => {
      const l = letraEfectiva(c);
      return c.fundamental && c.estado === "APROBADO" && l !== null && !letraHabilitaGraduacion(l, true);
    })
    .map((c) => {
      const objetivoRepite = cursosIndice.find((ci) => ci.id === c.id);
      const sim = objetivoRepite
        ? simularRepeticion(cursosIndice, objetivoRepite, 71) // repetir sacando C
        : null;
      return { curso: c, sim };
    });

  // Grafo de prerequisitos: materia requerida -> materias que dependen de ella.
  const dependientes = new Map<string, Set<string>>();
  for (const mp of materiasPlan) {
    for (const pr of mp.prerequisitos) {
      if (!dependientes.has(pr.materiaRequeridaId)) dependientes.set(pr.materiaRequeridaId, new Set());
      dependientes.get(pr.materiaRequeridaId)!.add(mp.materiaId);
    }
  }
  const transitivos = (materiaId: string): number => {
    const visto = new Set<string>();
    const cola = [materiaId];
    while (cola.length) {
      const x = cola.pop()!;
      for (const d of dependientes.get(x) ?? []) {
        if (!visto.has(d)) {
          visto.add(d);
          cola.push(d);
        }
      }
    }
    return visto.size;
  };
  // Fundamentales pendientes o reprobadas que bloquean cadenas largas.
  const bloqueos = requeridas
    .filter((mp) => {
      const est = estadoMateria.get(mp.materiaId)?.estado;
      return mp.fundamental && (est === undefined || est === "reprobada");
    })
    .map((mp) => ({ mp, dependientes: transitivos(mp.materiaId) }))
    .filter((b) => b.dependientes > 0)
    .sort((a, b) => b.dependientes - a.dependientes);

  const distancia = objetivo != null ? objetivo - acumulado.indice : null;
  const hayRepetibles = cerrados.some((c) => {
    const l = letraEfectiva(c);
    return l === "D" || l === "F";
  });

  return (
    <section className="section_container max-w-2xl">
      <h1 className="text-30-bold text-tinta mb-6">Mi carrera</h1>

      {/* 1. Índice acumulado — protagonista absoluto, en casi-negro (no ciruela) */}
      <div className="tarjeta-hero p-8 text-center">
        <p className="text-[11px] uppercase tracking-wide font-bold !text-black-300">Índice acumulado</p>
        <p className="text-[72px] sm:text-[92px] leading-none font-extrabold tabular-nums my-3 text-tinta">
          {acumulado.indice.toFixed(2)}
        </p>
        <p className="text-16-medium !text-black-300 tabular-nums">
          {acumulado.puntos} puntos · {acumulado.creditos} créditos
        </p>
        {objetivo != null && (
          <p className="inline-flex items-center gap-1.5 mt-4 text-16-medium bg-crema border border-hairline rounded-full px-4 py-1.5">
            <span className="!text-black-300">Objetivo</span>
            <span className="tabular-nums font-bold text-tinta">{objetivo.toFixed(2)}</span>
            {distancia != null && distancia > 0 ? (
              <span className="tabular-nums !text-black-300">· te faltan {distancia.toFixed(2)}</span>
            ) : (
              <span className="!text-verde-fuerte font-semibold">· ✓ ya lo alcanzaste</span>
            )}
          </p>
        )}
      </div>

      {/* 2. Avance de carrera — anillo + desglose */}
      <div className="mt-10">
        <h2 className="text-20-medium font-semibold text-tinta mb-4">Avance de carrera</h2>
        <div className="tarjeta p-5 flex flex-col sm:flex-row items-center gap-6">
          <AnilloAvance progreso={progreso} creditosAprobados={creditosAprobados} totalPlan={totalPlan} />
          <div className="grid grid-cols-2 gap-3 w-full">
            <Mini etiqueta="Aprobadas" valor={aprobadas.length} color="!text-verde-fuerte" />
            <Mini etiqueta="En curso" valor={enCurso.length} />
            <Mini etiqueta="Reprobadas" valor={reprobadas.length} color={reprobadas.length > 0 ? "!text-ambar-fuerte" : undefined} />
            <Mini etiqueta="Pendientes" valor={pendientes.length} />
          </div>
        </div>
      </div>

      {/* 3. Trayectoria por periodo — progresión desplegable */}
      {porPeriodo.length > 0 && (
        <div className="mt-10">
          <h2 className="text-20-medium font-semibold text-tinta mb-4">Trayectoria por periodo</h2>
          <Trayectoria periodos={porPeriodo} />
        </div>
      )}

      {/* 4. Proyección al objetivo */}
      {objetivo != null && proyeccion && (
        <div className="mt-10">
          <h2 className="text-20-medium font-semibold text-tinta mb-4">Para llegar a {objetivo.toFixed(2)}</h2>
          <div
            className={`rounded-2xl p-5 shadow-suave border-2 ${
              proyeccion.yaLogrado
                ? "bg-verde-suave border-verde-fuerte/40"
                : !proyeccion.alcanzable && proyeccion.creditosRestantes > 0
                  ? "bg-ambar-suave border-ambar-fuerte/40"
                  : "bg-white border-hairline"
            }`}
          >
            {proyeccion.yaLogrado ? (
              <p className="text-16-medium font-semibold !text-verde-fuerte">
                🎉 Ya aseguraste tu objetivo: pase lo que pase en lo que falta, te gradúas con al menos{" "}
                {objetivo.toFixed(2)}.
              </p>
            ) : proyeccion.creditosRestantes <= 0 ? (
              <p className="text-16-medium text-tinta">
                Ya cursaste todos los créditos del plan. Tu índice final es{" "}
                <span className="font-bold">{proyeccion.indiceActual.toFixed(2)}</span>.
              </p>
            ) : proyeccion.alcanzable && proyeccion.puntosPromedioPorCredito != null ? (
              <p className="text-16-medium text-tinta">
                Para graduarte con {objetivo.toFixed(2)} necesitas promediar{" "}
                <span className="font-bold">{referenciaLetra(proyeccion.puntosPromedioPorCredito)}</span>{" "}
                ({proyeccion.puntosPromedioPorCredito.toFixed(2)} puntos por crédito) en los{" "}
                <span className="font-bold">{proyeccion.creditosRestantes}</span> créditos que te quedan.
              </p>
            ) : (
              <p className="text-16-medium !text-ambar-fuerte">
                Ese objetivo ya no es alcanzable: aun sacando A en los {proyeccion.creditosRestantes}{" "}
                créditos que faltan, tu índice máximo sería{" "}
                <span className="font-bold">{proyeccion.indiceMaximoAlcanzable.toFixed(2)}</span>.
              </p>
            )}
          </div>
        </div>
      )}
      {objetivo == null && (
        <div className="mt-10 tarjeta p-5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-16-medium !text-black-300">
            No definiste un índice objetivo. Al hacerlo verás aquí qué necesitas para llegar.
          </p>
          <Link
            href="/perfil"
            className="shrink-0 text-14-normal font-semibold !text-primary-ink bg-primary-100 rounded-xl px-4 py-2 hover:bg-primary/15 transition-colors"
          >
            Definir objetivo
          </Link>
        </div>
      )}

      {/* 5. Alertas de graduación — lo más accionable, destacado */}
      {(fundamentalesConD.length > 0 || bloqueos.length > 0) && (
        <div className="mt-10">
          <h2 className="text-20-medium font-semibold text-tinta mb-4">Alertas de graduación</h2>
          <div className="space-y-3">
            {fundamentalesConD.map(({ curso, sim }) => (
              <div key={curso.id} className="bg-rojo-suave border-2 border-rojo-fuerte/40 rounded-2xl p-5 shadow-suave">
                <p className="text-16-medium font-bold !text-rojo-fuerte">
                  ⚠ {curso.materia.codigo} · {curso.materia.nombre}: fundamental aprobada con D
                </p>
                <p className="text-14-normal !text-black mt-1">
                  Avanzas a las materias que la requieren, pero no puedes graduarte con ella hasta
                  subirla a C.
                </p>
                {sim && (
                  <p className="text-14-normal !text-black mt-2">
                    Repetirla sacando C subiría tu índice de {sim.antes.toFixed(2)} a{" "}
                    <span className="font-bold">{sim.despues.toFixed(2)}</span> (+
                    {sim.ganancia.toFixed(2)}).{" "}
                    <Link href="/carrera/repeticiones" className="!text-primary-ink underline font-semibold">
                      ver en el optimizador
                    </Link>
                  </p>
                )}
              </div>
            ))}

            {bloqueos.map((b) => (
              <div key={b.mp.materiaId} className="bg-rojo-suave border-2 border-rojo-fuerte/40 rounded-2xl p-5 shadow-suave">
                <p className="text-16-medium font-bold !text-rojo-fuerte">
                  ⚠ {b.mp.materia.codigo} · {b.mp.materia.nombre}
                </p>
                <p className="text-14-normal !text-black mt-1">
                  Fundamental {estadoMateria.get(b.mp.materiaId)?.estado === "reprobada" ? "reprobada" : "pendiente"}:
                  bloquea {b.dependientes} materia(s) que la tienen de prerequisito.
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {hayRepetibles && (
        <div className="mt-10 tarjeta p-5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-16-medium text-tinta">
            Mira qué debes y qué te conviene repetir, y simula tu índice.
          </p>
          <Button asChild className="calcular_btn !text-[16px] !p-3 shrink-0">
            <Link href="/carrera/repeticiones">Optimizador de repeticiones</Link>
          </Button>
        </div>
      )}

      <div className="mt-10 flex justify-center">
        <Link
          href="/semestre"
          className="btn-secundario inline-flex items-center justify-center min-h-[44px] px-6 rounded-xl"
        >
          Ir a mi semestre
        </Link>
      </div>
    </section>
  );
}

// Anillo de avance: créditos aprobados sobre el total del plan. Verde = aprobado
// (semántico), pista en hairline. El dato va en casi-negro.
function AnilloAvance({
  progreso,
  creditosAprobados,
  totalPlan,
}: {
  progreso: number;
  creditosAprobados: number;
  totalPlan: number;
}) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.min(1, Math.max(0, progreso / 100)));
  return (
    <div className="relative shrink-0" style={{ width: 132, height: 132 }}>
      <svg width="132" height="132" viewBox="0 0 132 132" className="-rotate-90">
        <circle cx="66" cy="66" r={r} fill="none" stroke="#E7E1D7" strokeWidth="12" />
        <circle
          cx="66"
          cy="66"
          r={r}
          fill="none"
          stroke="#1F6B47"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-30-bold leading-none tabular-nums text-tinta">{progreso.toFixed(0)}%</span>
        <span className="text-14-normal !text-black-300 tabular-nums mt-1">
          {creditosAprobados}/{totalPlan} cr
        </span>
      </div>
    </div>
  );
}

function Mini({ etiqueta, valor, color }: { etiqueta: string; valor: number; color?: string }) {
  return (
    <div className="bg-crema border border-hairline rounded-xl p-3 text-center">
      <p className={`text-30-bold leading-tight tabular-nums ${color ?? "text-tinta"}`}>{valor}</p>
      <p className="text-14-normal !text-black-300">{etiqueta}</p>
    </div>
  );
}
