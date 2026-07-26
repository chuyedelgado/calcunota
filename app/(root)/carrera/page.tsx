import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import {
  esMarcadorDeElectiva,
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
import { proyectarObjetivoCarrera, referenciaLetra } from "@/lib/proyeccionCarrera";

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
        <h1 className="text-30-bold mb-4">Mi carrera</h1>
        <div className="border-4 border-black bg-primary-100 rounded-2xl p-6 shadow-xl text-center">
          <p className="text-20-medium font-bold mb-2">Aún no ves tu carrera completa</p>
          <p className="text-16-medium mb-6">
            Carga tu historial y en segundos verás tu índice acumulado real, tu avance y qué te falta
            para tu objetivo. Es lo que ninguna otra herramienta te da.
          </p>
          <Button asChild className="calcular_btn w-full">
            <Link href="/historial/cargar">Cargar mi historial</Link>
          </Button>
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
  const creditosAprobados = aprobadas.reduce((a, m) => a + m.creditos, 0);
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
  const porPeriodo = clavesPeriodo.map((k) => {
    const [anio, tipo] = k.split(":");
    const seq = secuenciaDePeriodo(Number(anio), tipo as TipoPeriodo);
    const delPeriodo = paraIndice.filter(
      (c) => c.periodo.anio === Number(anio) && c.periodo.tipo === tipo,
    );
    const hastaAqui = paraIndice.filter(
      (c) => secuenciaDePeriodo(c.periodo.anio, c.periodo.tipo) <= seq,
    );
    return {
      etiqueta: nombrePeriodo(Number(anio), tipo as TipoPeriodo),
      indice: calcularIndiceDesdeCursos(delPeriodo).indice,
      acumulado: calcularIndiceDesdeCursos(hastaAqui).indice,
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
      <h1 className="text-30-bold mb-6">Mi carrera</h1>

      {/* 1. Índice acumulado — dato protagonista en casi-negro (no ciruela) */}
      <div className="tarjeta-hero p-7 text-center">
        <p className="text-[11px] uppercase tracking-wide font-bold !text-black-300">Índice acumulado</p>
        <p className="text-[72px] leading-none font-extrabold tabular-nums my-2 text-tinta">
          {acumulado.indice.toFixed(2)}
        </p>
        <p className="text-16-medium text-black-300 tabular-nums">
          {acumulado.puntos} puntos / {acumulado.creditos} créditos
        </p>
        {objetivo != null && (
          <p className="text-16-medium mt-2">
            Objetivo <span className="tabular-nums">{objetivo.toFixed(2)}</span> ·{" "}
            {distancia != null && distancia > 0 ? (
              <span className="tabular-nums">te faltan {distancia.toFixed(2)}</span>
            ) : (
              <span className="!text-verde-fuerte font-semibold">✓ ya lo alcanzaste</span>
            )}
          </p>
        )}
      </div>

      {/* 2. Avance de carrera */}
      <div className="mt-8">
        <h2 className="text-20-medium font-semibold mb-3">Avance de carrera</h2>
        <div className="flex justify-between text-16-medium mb-2">
          <span>
            {creditosAprobados} / {totalPlan} créditos
          </span>
          <span className="font-semibold">{progreso.toFixed(0)}%</span>
        </div>
        <div className="h-4 bg-gray-200 rounded-full overflow-hidden mb-4">
          <div className="h-full bg-blue-800 rounded-full" style={{ width: `${progreso}%` }} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Mini etiqueta="Aprobadas" valor={aprobadas.length} />
          <Mini etiqueta="Reprobadas" valor={reprobadas.length} />
          <Mini etiqueta="En curso" valor={enCurso.length} />
          <Mini etiqueta="Pendientes" valor={pendientes.length} />
        </div>
      </div>

      {/* 3. Índice por periodo */}
      {porPeriodo.length > 0 && (
        <div className="mt-8">
          <h2 className="text-20-medium font-semibold mb-3">Trayectoria por periodo</h2>
          <ul className="space-y-2">
            {porPeriodo.map((p, i) => {
              const prev = i > 0 ? porPeriodo[i - 1].acumulado : null;
              const flecha =
                prev === null ? "" : p.acumulado > prev + 0.005 ? "↑" : p.acumulado < prev - 0.005 ? "↓" : "→";
              return (
                <li
                  key={p.etiqueta}
                  className="border-2 border-black rounded-xl p-3 bg-white flex items-center justify-between"
                >
                  <span className="text-16-medium">{p.etiqueta}</span>
                  <span className="text-16-medium">
                    <span className="text-black-300">periodo </span>
                    <span className="font-semibold">{p.indice.toFixed(2)}</span>
                    <span className="text-black-300"> · acum </span>
                    <span className="font-bold">{p.acumulado.toFixed(2)}</span> {flecha}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* 4. Proyección al objetivo */}
      {objetivo != null && proyeccion && (
        <div className="mt-8">
          <h2 className="text-20-medium font-semibold mb-3">Para llegar a {objetivo.toFixed(2)}</h2>
          <div className="border-2 border-black rounded-2xl p-5 bg-white">
            {proyeccion.yaLogrado ? (
              <p className="text-16-medium font-semibold text-green-700">
                Ya aseguraste tu objetivo: pase lo que pase en lo que falta, te gradúas con al menos{" "}
                {objetivo.toFixed(2)}. 🎉
              </p>
            ) : proyeccion.creditosRestantes <= 0 ? (
              <p className="text-16-medium">
                Ya cursaste todos los créditos del plan. Tu índice final es{" "}
                <span className="font-bold">{proyeccion.indiceActual.toFixed(2)}</span>.
              </p>
            ) : proyeccion.alcanzable && proyeccion.puntosPromedioPorCredito != null ? (
              <p className="text-16-medium">
                Para graduarte con {objetivo.toFixed(2)} necesitas promediar{" "}
                <span className="font-bold">{referenciaLetra(proyeccion.puntosPromedioPorCredito)}</span>{" "}
                ({proyeccion.puntosPromedioPorCredito.toFixed(2)} puntos por crédito) en los{" "}
                <span className="font-bold">{proyeccion.creditosRestantes}</span> créditos que te quedan.
              </p>
            ) : (
              <p className="text-16-medium">
                Ese objetivo ya no es alcanzable: aun sacando A en los {proyeccion.creditosRestantes}{" "}
                créditos que faltan, tu índice máximo sería{" "}
                <span className="font-bold">{proyeccion.indiceMaximoAlcanzable.toFixed(2)}</span>.
              </p>
            )}
          </div>
        </div>
      )}
      {objetivo == null && (
        <div className="mt-8 border-2 border-black rounded-2xl p-4 bg-white">
          <p className="text-16-medium text-black-300">
            No definiste un índice objetivo en tu perfil. Al hacerlo verás aquí qué necesitas para
            llegar.
          </p>
        </div>
      )}

      {/* 5. Alertas de graduación */}
      {(fundamentalesConD.length > 0 || bloqueos.length > 0) && (
        <div className="mt-8">
          <h2 className="text-20-medium font-semibold mb-3">Alertas de graduación</h2>
          <div className="space-y-3">
            {fundamentalesConD.map(({ curso, sim }) => (
              <div key={curso.id} className="bg-rojo-suave border-2 border-rojo-fuerte/40 rounded-2xl p-4 shadow-suave">
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
                    <Link href="/carrera/repeticiones" className="text-blue-800 underline">
                      ver en el optimizador
                    </Link>
                  </p>
                )}
              </div>
            ))}

            {bloqueos.map((b) => (
              <div key={b.mp.materiaId} className="border-2 border-black bg-white rounded-2xl p-4">
                <p className="text-16-medium font-semibold">
                  {b.mp.materia.codigo} · {b.mp.materia.nombre}
                </p>
                <p className="text-14-normal !text-black-300 mt-1">
                  Fundamental {estadoMateria.get(b.mp.materiaId)?.estado === "reprobada" ? "reprobada" : "pendiente"}:
                  bloquea {b.dependientes} materia(s) que la tienen de prerequisito.
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {hayRepetibles && (
        <div className="mt-8 border-2 border-black rounded-2xl p-4 bg-white flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-16-medium">Mira qué debes y qué te conviene repetir, y simula tu índice.</p>
          <Button asChild className="calcular_btn !text-[16px] !p-3 shrink-0">
            <Link href="/carrera/repeticiones">Optimizador de repeticiones</Link>
          </Button>
        </div>
      )}

      <p className="mt-10 text-center">
        <Link href="/semestre" className="text-16-medium text-blue-800 underline">
          Ir a mi semestre
        </Link>
      </p>
    </section>
  );
}

function Mini({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  return (
    <div className="border-2 border-black rounded-xl p-3 bg-white text-center">
      <p className="text-30-bold leading-tight">{valor}</p>
      <p className="text-14-normal !text-black-300">{etiqueta}</p>
    </div>
  );
}
