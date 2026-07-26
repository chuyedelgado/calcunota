import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { calcularEstadoMateria, nombrePeriodo, periodoDeFecha, type Letra, type TipoPeriodo } from "@/lib/calculos";
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

  const hayEnCurso = cursos.some((c) => c.estado === "EN_CURSO");
  const historialVacio = cerradosDb.length === 0;

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
  const creditosAprobados = cerradosDb
    .filter((c) => c.estado === "APROBADO")
    .reduce((a, c) => a + c.creditos, 0);
  const avance = totalPlan > 0 ? Math.min(100, (creditosAprobados / totalPlan) * 100) : null;

  const desde = Math.min(perfil.anioIngreso, anio, actual.anio);
  const periodos = periodosEnRango(desde, actual.anio + 1);
  const clave = `${anio}:${tipo}`;
  const query = `anio=${anio}&tipo=${tipo}`;

  return (
    <section className="section_container">
      <h1 className="text-30-bold text-center mb-2">Mi semestre</h1>
      <p className="text-16-medium text-center text-black-300 mb-2">{nombrePeriodo(anio, tipo)}</p>
      <p className="text-center mb-8 flex flex-wrap justify-center gap-x-4 gap-y-1">
        <Link href="/carrera" className="text-16-medium !text-primary-ink underline font-semibold">
          Mi carrera
        </Link>
        <Link href="/historial/cargar" className="text-16-medium !text-primary-ink underline font-semibold">
          Cargar mi historial
        </Link>
      </p>

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

      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <PeriodoSelector periodos={periodos} clave={clave} />
        <div className="flex flex-wrap gap-3">
          {hayEnCurso && (
            <Button asChild className="border-2 border-black/15 bg-white !text-tinta rounded-2xl !text-[18px] p-3 shadow-suave">
              <Link href={`/semestre/cerrar?${query}`}>Cerrar semestre</Link>
            </Button>
          )}
          {cursos.length > 0 && (
            <Button asChild className="calcular_btn !text-[18px] !p-3">
              <Link href={`/semestre/agregar?${query}`}>Agregar materia</Link>
            </Button>
          )}
        </div>
      </div>

      {cursos.length === 0 ? (
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Entre semestres: resumen de desempeño antes de armar el siguiente */}
          {!historialVacio && (
            <div className="tarjeta-hero p-6">
              <p className="text-[11px] uppercase tracking-wide font-bold !text-black-300 text-center">Tu carrera hasta ahora</p>
              <div className="grid grid-cols-3 gap-3 mt-3 text-center">
                <div>
                  <p className="text-[32px] font-extrabold tabular-nums text-tinta leading-none">{indice.toFixed(2)}</p>
                  <p className="text-14-normal !text-black-300 mt-1">Índice</p>
                </div>
                <div>
                  <p className="text-[32px] font-extrabold tabular-nums text-tinta leading-none">{creditosAprobados}</p>
                  <p className="text-14-normal !text-black-300 mt-1">Créditos</p>
                </div>
                <div>
                  <p className="text-[32px] font-extrabold tabular-nums text-tinta leading-none">
                    {avance !== null ? `${avance.toFixed(0)}%` : "—"}
                  </p>
                  <p className="text-14-normal !text-black-300 mt-1">Avance</p>
                </div>
              </div>
            </div>
          )}
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
                        {c.notaFinal ?? "—"} · {c.letraFinal}
                      </span>
                    ) : notaActual !== null ? (
                      <span className="text-16-medium font-bold tabular-nums bg-black/[0.05] rounded-full px-3 py-1 text-tinta">
                        {notaActual.toFixed(1)}
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
