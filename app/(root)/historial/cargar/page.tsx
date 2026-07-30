import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { esMarcadorDeElectiva, type Letra, type TipoPeriodo } from "@/lib/calculos";
import CargaHistorial, { type MateriaPensum } from "./CargaHistorial";
import type { CursoGuardado } from "../actions";

export default async function CargarHistorialPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/");
  }

  const perfil = await prisma.perfilEstudiante.findUnique({
    where: { userId: session.user.id },
    select: { id: true, planId: true, universidadId: true, anioIngreso: true },
  });
  if (!perfil) {
    redirect("/onboarding");
  }

  const materiasPlan = await prisma.materiaPlan.findMany({
    where: { planId: perfil.planId },
    select: {
      id: true,
      materiaId: true,
      creditos: true,
      fundamental: true,
      anio: true,
      periodo: true,
      orden: true,
      materia: { select: { codigo: true, nombre: true } },
    },
    orderBy: [{ anio: "asc" }, { orden: "asc" }],
  });

  const pensum: MateriaPensum[] = materiasPlan
    .filter((mp) => !esMarcadorDeElectiva(mp.materia.codigo))
    .map((mp) => ({
      materiaPlanId: mp.id,
      materiaId: mp.materiaId,
      codigo: mp.materia.codigo,
      nombre: mp.materia.nombre,
      creditos: mp.creditos,
      fundamental: mp.fundamental,
      planAnio: mp.anio,
      planPeriodo: mp.periodo,
    }));

  const totalCreditos = pensum.reduce((a, m) => a + m.creditos, 0);

  const cursos = await prisma.curso.findMany({
    where: { perfilId: perfil.id, estado: { in: ["APROBADO", "REPROBADO"] } },
    select: {
      id: true,
      materiaId: true,
      creditos: true,
      fundamental: true,
      notaFinal: true,
      letraFinal: true,
      estado: true,
      periodo: { select: { anio: true, tipo: true } },
    },
  });
  const cursosExistentes: CursoGuardado[] = cursos.map((c) => ({
    id: c.id,
    materiaId: c.materiaId,
    creditos: c.creditos,
    fundamental: c.fundamental,
    notaFinal: c.notaFinal,
    letra: c.notaFinal === null ? (c.letraFinal as Letra | null) : null,
    estado: c.estado as "APROBADO" | "REPROBADO",
    anio: c.periodo.anio,
    tipo: c.periodo.tipo as TipoPeriodo,
  }));

  const profesores = (
    await prisma.profesor.findMany({
      where: { universidadId: perfil.universidadId },
      select: { nombre: true },
      orderBy: { nombre: "asc" },
    })
  ).map((p) => p.nombre);

  return (
    <section className="section_container max-w-2xl">
      <Link
        href="/semestre"
        className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 rounded-xl bg-primary-100 text-14-normal font-semibold !text-primary-ink hover:bg-primary/15 transition-colors"
      >
        <span aria-hidden="true">←</span> Volver a mi semestre
      </Link>
      <h1 className="text-30-bold mt-4 mb-1 text-tinta">Cargar mi historial</h1>
      <p className="text-16-medium text-black-300 mb-6">
        La forma más rápida es desde el PDF de tu Historial de Notas. Si no lo tienes a mano,
        márcalo a mano aquí abajo.
      </p>

      {/* Camino principal: importar el PDF. Diez veces más rápido que marcar
          materia por materia, así que va arriba y más visible. */}
      <div className="tarjeta bg-primary-100 border-2 border-primary/30 p-5 mb-8">
        <p className="text-16-medium font-semibold text-tinta mb-1">
          ¿Tienes el PDF de tu Historial de Notas?
        </p>
        <p className="text-14-normal !text-black-300 mb-4">
          Cárgalo y lo leemos en segundos: emparejamos cada materia con tu plan y solo revisas.
        </p>
        <Link
          href="/historial/importar"
          className="inline-flex items-center justify-center min-h-[44px] px-5 rounded-xl bg-primary !text-white text-16-medium font-semibold hover:bg-primary-ink transition-colors"
        >
          Importar desde el PDF
        </Link>
      </div>

      <h2 className="text-20-medium font-semibold text-tinta mb-1">O márcalo a mano</h2>
      <p className="text-14-normal !text-black-300 mb-6">
        Marca lo que ya cursaste y su nota. Ajusta el periodo una vez por semestre; se guarda a
        medida que avanzas.
      </p>
      <CargaHistorial
        pensum={pensum}
        cursosExistentes={cursosExistentes}
        profesores={profesores}
        anioIngreso={perfil.anioIngreso}
        totalCreditos={totalCreditos}
      />
    </section>
  );
}
