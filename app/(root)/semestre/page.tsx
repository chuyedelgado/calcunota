import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { calcularEstadoMateria, formatearNota, periodoDeFecha, type Letra, type TipoPeriodo } from "@/lib/calculos";
import { calcularIndiceDesdeCursos } from "@/lib/indice";
import { generarRecomendaciones } from "@/lib/recomendaciones";
import { cargarContextoEstudiante } from "@/lib/contextoEstudiante";
import PeriodoSelector from "./PeriodoSelector";
import RecuperarBanner from "./RecuperarBanner";
import Recomendaciones from "./Recomendaciones";
import { parseAnioPeriodo, parseTipoPeriodo, periodosEnRango } from "./periodo";

export default async function SemestrePage({
  searchParams,
}: {
  searchParams: Promise<{ anio?: string; tipo?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/");
  }

  const perfil = await prisma.perfilEstudiante.findUnique({
    where: { userId: session.user.id },
    select: { id: true, anioIngreso: true, indiceObjetivo: true, plan: { select: { totalCreditos: true } } },
  });
  if (!perfil) {
    redirect("/onboarding");
  }

  const actual = periodoDeFecha();
  const sp = await searchParams;
  const anio = sp.anio != null ? parseAnioPeriodo(sp.anio, actual.anio) : actual.anio;
  const tipo = sp.tipo != null ? parseTipoPeriodo(sp.tipo) : actual.tipo;

  const cursos = await prisma.curso.findMany({
    where: { perfilId: perfil.id, periodo: { anio, tipo } },
    select: {
      id: true,
      creditos: true,
      fundamental: true,
      esRepeticion: true,
      estado: true,
      notaFinal: true,
      letraFinal: true,
      materia: { select: { codigo: true, nombre: true } },
      profesor: { select: { nombre: true } },
      secciones: {
        select: { nombre: true, porcentaje: true, cantidad: true, notas: { select: { puntaje: true, puntajeMax: true } } },
      },
    },
    orderBy: { materia: { codigo: "asc" } },
  });

  const cerradosDb = await prisma.curso.findMany({
    where: { perfilId: perfil.id, estado: { in: ["APROBADO", "REPROBADO"] } },
    select: {
      id: true,
      materiaId: true,
      creditos: true,
      fundamental: true,
      estado: true,
      notaFinal: true,
      letraFinal: true,
      periodo: { select: { anio: true, tipo: true } },
      materia: { select: { nombre: true } },
    },
  });

  const totalPlan = perfil.plan.totalCreditos;

  const toEval = (secciones: (typeof cursos)[number]["secciones"]) =>
    secciones.map((s) => ({
      nombre: s.nombre,
      porcentaje: s.porcentaje,
      cantidad: s.cantidad,
      notas: s.notas.map((n) => ({ puntaje: n.puntaje, puntajeMax: n.puntajeMax })),
    }));

  // Recomendaciones basadas en los datos reales del estudiante. Vienen ya
  // ordenadas por prioridad; se respeta ese orden.
  const ctx = await cargarContextoEstudiante({
    id: perfil.id,
    indiceObjetivo: perfil.indiceObjetivo,
    creditosPlan: totalPlan,
  });
  const recomendaciones = generarRecomendaciones(ctx);

  const enCursoDelPeriodo = cursos.filter((c) => c.estado === "EN_CURSO");
  const hayEnCurso = enCursoDelPeriodo.length > 0;
  const historialVacio = cerradosDb.length === 0;

  // Resumen del encabezado: lo que el usuario quiere ver al entrar.
  const materiasActivas = enCursoDelPeriodo.length;
  const creditosActivos = enCursoDelPeriodo.reduce((a, c) => a + c.creditos, 0);

  // Resumen de carrera (para entre semestres).
  const indice = calcularIndiceDesdeCursos(
    cerradosDb.map((c) => ({
      id: c.id,
      materiaId: c.materiaId,
      creditos: c.creditos,
      notaFinal: c.notaFinal,
      letra: c.notaFinal === null ? (c.letraFinal as Letra | null) : null,
      periodo: { anio: c.periodo.anio, tipo: c.periodo.tipo as TipoPeriodo },
    })),
  ).indice;

  // Periodos que ya tienen alguna materia cargada, para marcarlos en el selector.
  const periodosConCursos = await prisma.curso.findMany({
    where: { perfilId: perfil.id },
    select: { periodo: { select: { anio: true, tipo: true } } },
  });
  const clavesConMaterias = [
    ...new Set(periodosConCursos.map((c) => `${c.periodo.anio}:${c.periodo.tipo}`)),
  ];

  const desde = Math.min(perfil.anioIngreso, anio, actual.anio);
  const periodos = periodosEnRango(desde, actual.anio + 1);
  const clave = `${anio}:${tipo}`;
  const claveActual = `${actual.anio}:${actual.tipo}`;
  const query = `anio=${anio}&tipo=${tipo}`;

  return (
    <section className="section_container">
      {/* Encabezado: el periodo es el dato principal; "Mi semestre" es solo contexto.
          El selector se ve como control; "Cargar historial" es una acción, no un título
          ("Mi carrera" vive en la barra de navegación). */}
      <header className="max-w-3xl mx-auto mb-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide font-bold !text-black-300">Mi semestre</p>
            <div className="mt-1">
              <PeriodoSelector
                periodos={periodos}
                clave={clave}
                claveActual={claveActual}
                clavesConMaterias={clavesConMaterias}
              />
            </div>
          </div>
          <Link
            href="/historial/cargar"
            className="shrink-0 text-14-normal font-semibold !text-primary-ink bg-primary-100 rounded-xl px-3 py-2 hover:bg-primary/15 transition-colors"
          >
            Cargar historial
          </Link>
        </div>

        {/* Resumen: la razón por la que el usuario abre la app */}
        <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
          <ResumenDato valor={String(materiasActivas)} etiqueta={materiasActivas === 1 ? "materia activa" : "materias activas"} />
          <ResumenDato valor={String(creditosActivos)} etiqueta="créditos" />
          <ResumenDato valor={historialVacio ? "—" : indice.toFixed(2)} etiqueta="índice acumulado" />
        </div>
      </header>

      <RecuperarBanner query={query} />

      {historialVacio && (
        <div className="max-w-3xl mx-auto mb-8 bg-primary-100 border-2 border-primary/30 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-suave">
          <p className="text-16-medium">
            Tu índice está incompleto hasta que cargues los semestres que ya cursaste.
          </p>
          <Button asChild className="calcular_btn !text-[16px] !p-3 shrink-0">
            <Link href="/historial/cargar">Cargar historial</Link>
          </Button>
        </div>
      )}

      {/* Recomendaciones basadas en tus datos reales */}
      <Recomendaciones recomendaciones={recomendaciones} />

      {cursos.length > 0 && (
        <div className="max-w-3xl mx-auto flex flex-wrap justify-end gap-3 mb-6">
          {hayEnCurso && (
            <Button asChild className="border-2 border-black/15 bg-white !text-tinta rounded-2xl !text-[18px] p-3 shadow-suave">
              <Link href={`/semestre/cerrar?${query}`}>Cerrar semestre</Link>
            </Button>
          )}
          <Button asChild className="calcular_btn !text-[18px] !p-3">
            <Link href={`/semestre/agregar?${query}`}>Agregar materia</Link>
          </Button>
        </div>
      )}

      {cursos.length === 0 ? (
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="tarjeta p-8 text-center">
            <p className="text-20-medium mb-6">Todavía no tienes materias en este periodo.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button asChild className="calcular_btn !text-[18px] !p-3">
                <Link href={`/semestre/nuevo?${query}`}>Arma tu semestre</Link>
              </Button>
              <Button asChild className="border-2 border-black/15 bg-white !text-tinta rounded-2xl !text-[18px] p-3">
                <Link href={`/semestre/agregar?${query}`}>Agregar una materia</Link>
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <ul className="max-w-3xl mx-auto space-y-4">
          {cursos.map((c) => {
            const enCurso = c.estado === "EN_CURSO";
            const notaActual = enCurso ? calcularEstadoMateria(toEval(c.secciones)).notaActual : null;
            const aprobada = c.letraFinal && c.letraFinal !== "F";
            return (
              <li key={c.id}>
                <Link
                  href={`/semestre/${c.id}`}
                  className="tarjeta p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:border-primary/40 transition-colors"
                >
                  <div>
                    <p className="text-20-medium font-semibold">{c.materia.nombre}</p>
                    <p className="text-16-medium text-black-300">
                      {c.materia.codigo} · {c.creditos} créditos
                      {c.profesor ? ` · ${c.profesor.nombre}` : " · Sin profesor"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {c.fundamental && (
                      <span className="text-14-normal !text-black-100 bg-black/[0.06] rounded-full px-3 py-1">
                        Fundamental
                      </span>
                    )}
                    {c.esRepeticion && (
                      <span className="text-14-normal !text-black-100 bg-black/[0.06] rounded-full px-3 py-1">
                        Repetición
                      </span>
                    )}
                    {c.letraFinal ? (
                      <span
                        className={`text-14-normal font-semibold rounded-full px-3 py-1 border ${
                          aprobada
                            ? "!text-verde-fuerte bg-verde-suave border-verde-fuerte"
                            : "!text-rojo-fuerte bg-rojo-suave border-rojo-fuerte"
                        }`}
                      >
                        {c.notaFinal !== null ? formatearNota(c.notaFinal) : "—"} · {c.letraFinal}
                      </span>
                    ) : notaActual !== null ? (
                      <span className="text-16-medium font-bold tabular-nums bg-black/[0.05] rounded-full px-3 py-1 text-tinta">
                        {formatearNota(notaActual)}
                        <span className="text-14-normal !text-black-300"> / 100</span>
                      </span>
                    ) : (
                      <span className="text-14-normal !text-black-100 bg-black/[0.06] rounded-full px-3 py-1">
                        {c.estado}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// Dato compacto del resumen del encabezado. El número en casi-negro (tinta),
// la etiqueta atenuada; números tabulares para que no bailen.
function ResumenDato({ valor, etiqueta }: { valor: string; etiqueta: string }) {
  return (
    <div className="tarjeta px-3 py-2.5 text-center">
      <p className="text-[22px] sm:text-[26px] font-extrabold tabular-nums text-tinta leading-none">{valor}</p>
      <p className="text-[11px] sm:text-14-normal !text-black-300 mt-1 leading-tight">{etiqueta}</p>
    </div>
  );
}
