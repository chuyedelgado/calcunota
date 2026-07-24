import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  esMarcadorDeElectiva,
  nombrePeriodo,
  parseAnioPeriodo,
  parseTipoPeriodo,
  periodoDeFecha,
} from "@/lib/calculos";
import AgregarMateriaForm, { type MateriaOpcion } from "./AgregarMateriaForm";

export default async function AgregarPage({
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
    select: { id: true, planId: true, universidadId: true },
  });
  if (!perfil) {
    redirect("/onboarding");
  }

  const actual = periodoDeFecha();
  const sp = await searchParams;
  const anio = sp.anio != null ? parseAnioPeriodo(sp.anio, actual.anio) : actual.anio;
  const tipo = sp.tipo != null ? parseTipoPeriodo(sp.tipo) : actual.tipo;

  // Materias del plan del perfil, con el snapshot sugerido.
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
    },
    orderBy: [{ anio: "asc" }, { orden: "asc" }],
  });

  // Materias que el perfil ya tiene en ESTE MISMO periodo (repetir en otro
  // periodo sí se permite; duplicar en el mismo, no).
  const yaEnPeriodo = await prisma.curso.findMany({
    where: { perfilId: perfil.id, periodo: { anio, tipo } },
    select: { materiaId: true },
  });
  const excluidas = new Set(yaEnPeriodo.map((c) => c.materiaId));

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
    }));

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
      <AgregarMateriaForm materias={materias} profesores={profesores} anio={anio} tipo={tipo} />
    </section>
  );
}
