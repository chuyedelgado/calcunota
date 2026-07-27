import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  esMarcadorDeElectiva,
  nombrePeriodo,
  periodoDeFecha,
  secuenciaDePeriodo,
  type TipoPeriodo,
} from "@/lib/calculos";
import AgregarMateriaForm, { type MateriaOpcion } from "./AgregarMateriaForm";
import { parseAnioPeriodo, parseTipoPeriodo } from "../periodo";

export default async function AgregarPage({
  searchParams,
}: {
  searchParams: Promise<{ anio?: string; tipo?: string; recuperar?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/");
  }

  const perfil = await prisma.perfilEstudiante.findUnique({
    where: { userId: session.user.id },
    select: { id: true, planId: true, universidadId: true },
  });
  if (!perfil) {
    redirect("/onboarding");
  }

  const actual = periodoDeFecha();
  const sp = await searchParams;
  const anio = sp.anio != null ? parseAnioPeriodo(sp.anio, actual.anio) : actual.anio;
  const tipo = sp.tipo != null ? parseTipoPeriodo(sp.tipo) : actual.tipo;

  // Materias del plan del perfil, con el snapshot sugerido y sus prerequisitos.
  const materiasPlan = await prisma.materiaPlan.findMany({
    where: { planId: perfil.planId },
    select: {
      id: true,
      creditos: true,
      fundamental: true,
      anio: true,
      periodo: true,
      materiaId: true,
      materia: { select: { codigo: true, nombre: true } },
      prerequisitos: {
        select: { materiaRequeridaId: true, materiaRequerida: { select: { codigo: true } } },
      },
    },
    orderBy: [{ anio: "asc" }, { orden: "asc" }],
  });

  // Todos los cursos del perfil (cualquier periodo): dan el estado de cada
  // materia respecto al estudiante (aprobada / en curso / pendiente) y qué
  // prerequisitos tiene ya aprobados.
  const cursosPerfil = await prisma.curso.findMany({
    where: { perfilId: perfil.id },
    select: { materiaId: true, estado: true },
  });
  const aprobadas = new Set(cursosPerfil.filter((c) => c.estado === "APROBADO").map((c) => c.materiaId));
  const enCurso = new Set(cursosPerfil.filter((c) => c.estado === "EN_CURSO").map((c) => c.materiaId));

  // Materias que el perfil ya tiene en ESTE MISMO periodo (repetir en otro
  // periodo sí se permite; duplicar en el mismo, no).
  const yaEnPeriodo = await prisma.curso.findMany({
    where: { perfilId: perfil.id, periodo: { anio, tipo } },
    select: { materiaId: true },
  });
  const excluidas = new Set(yaEnPeriodo.map((c) => c.materiaId));

  const estadoDe = (materiaId: string): MateriaOpcion["estado"] =>
    aprobadas.has(materiaId) ? "aprobada" : enCurso.has(materiaId) ? "en_curso" : "pendiente";

  const materias: MateriaOpcion[] = materiasPlan
    .filter((mp) => !esMarcadorDeElectiva(mp.materia.codigo)) // huecos de electiva
    .filter((mp) => !excluidas.has(mp.materiaId))
    .map((mp) => ({
      id: mp.id,
      codigo: mp.materia.codigo,
      nombre: mp.materia.nombre,
      creditos: mp.creditos,
      fundamental: mp.fundamental,
      anioSugerido: mp.anio,
      periodoSugerido: mp.periodo,
      estado: estadoDe(mp.materiaId),
      // Prerequisitos aún no aprobados: aviso suave, no bloquea.
      faltanPrereqs: mp.prerequisitos
        .filter((p) => !aprobadas.has(p.materiaRequeridaId))
        .map((p) => p.materiaRequerida.codigo),
    }));

  // Bloque sugerido: la posición curricular más temprana (Verano → 1er → 2do)
  // que todavía tiene materias pendientes. Es el "siguiente paso" del plan.
  let mejorSeq = Infinity;
  let bloqueSugerido: string | null = null;
  for (const m of materias) {
    if (m.estado !== "pendiente" || m.anioSugerido == null || m.periodoSugerido == null) continue;
    const seq = secuenciaDePeriodo(m.anioSugerido, m.periodoSugerido as TipoPeriodo);
    if (seq < mejorSeq) {
      mejorSeq = seq;
      bloqueSugerido = `${m.anioSugerido}:${m.periodoSugerido}`;
    }
  }

  const profesores = (
    await prisma.profesor.findMany({
      where: { universidadId: perfil.universidadId },
      select: { nombre: true },
      orderBy: { nombre: "asc" },
    })
  ).map((p) => p.nombre);

  return (
    <section className="section_container">
      <h1 className="text-30-bold text-center mb-2">Agregar materia</h1>
      <p className="text-16-medium text-center text-black-100 mb-8">
        {nombrePeriodo(anio, tipo)}
      </p>
      <AgregarMateriaForm
        materias={materias}
        profesores={profesores}
        anio={anio}
        tipo={tipo}
        bloqueSugerido={bloqueSugerido}
        recuperar={sp.recuperar === "1"}
      />
    </section>
  );
}
