import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { calcularEstadoMateria, nombrePeriodo, periodoDeFecha } from "@/lib/calculos";
import { parseAnioPeriodo, parseTipoPeriodo } from "../periodo";
import CerrarSemestreForm, { type CursoAcerrar } from "./CerrarSemestreForm";

export default async function CerrarSemestrePage({
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
    select: { id: true },
  });
  if (!perfil) {
    redirect("/onboarding");
  }

  const actual = periodoDeFecha();
  const sp = await searchParams;
  const anio = sp.anio != null ? parseAnioPeriodo(sp.anio, actual.anio) : actual.anio;
  const tipo = sp.tipo != null ? parseTipoPeriodo(sp.tipo) : actual.tipo;

  const cursos = await prisma.curso.findMany({
    where: { perfilId: perfil.id, estado: "EN_CURSO", periodo: { anio, tipo } },
    select: {
      id: true,
      creditos: true,
      fundamental: true,
      materia: { select: { codigo: true, nombre: true } },
      secciones: {
        select: {
          nombre: true,
          porcentaje: true,
          cantidad: true,
          notas: { select: { puntaje: true, puntajeMax: true } },
        },
      },
    },
    orderBy: { materia: { codigo: "asc" } },
  });

  const items: CursoAcerrar[] = cursos.map((c) => {
    const seccionesEval = c.secciones.map((s) => ({
      nombre: s.nombre,
      porcentaje: s.porcentaje,
      cantidad: s.cantidad,
      notas: s.notas.map((n) => ({ puntaje: n.puntaje, puntajeMax: n.puntajeMax })),
    }));
    const completa =
      seccionesEval.length > 0 &&
      seccionesEval.every((s) => s.notas.length > 0 && s.notas.every((n) => n.puntaje !== null));
    return {
      id: c.id,
      codigo: c.materia.codigo,
      nombre: c.materia.nombre,
      creditos: c.creditos,
      fundamental: c.fundamental,
      propuesta: completa ? calcularEstadoMateria(seccionesEval).notaActual : null,
    };
  });

  return (
    <section className="section_container max-w-2xl">
      <Link href={`/semestre?anio=${anio}&tipo=${tipo}`} className="text-16-medium text-blue-800 underline">
        ← Mi semestre
      </Link>
      <h1 className="text-30-bold mt-3 mb-1">Cerrar semestre</h1>
      <p className="text-16-medium text-black-300 mb-8">{nombrePeriodo(anio, tipo)}</p>

      {items.length === 0 ? (
        <div className="border-2 border-black rounded-2xl p-8 text-center">
          <p className="text-20-medium">No hay materias en curso en este periodo.</p>
        </div>
      ) : (
        <CerrarSemestreForm cursos={items} anio={anio} tipo={tipo} />
      )}
    </section>
  );
}
