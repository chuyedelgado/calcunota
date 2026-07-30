import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ordenarPlanes, type PlanOpcion } from "@/lib/planes";
import ImportarHistorial from "./ImportarHistorial";

export default async function ImportarHistorialPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const perfil = await prisma.perfilEstudiante.findUnique({
    where: { userId: session.user.id },
    select: {
      id: true,
      planId: true,
      plan: {
        select: {
          carrera: {
            select: {
              nombre: true,
              planes: {
                orderBy: { version: "desc" },
                select: {
                  id: true,
                  version: true,
                  totalCreditos: true,
                  vigente: true,
                  _count: { select: { materias: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!perfil) redirect("/onboarding");

  const cursosExistentes = await prisma.curso.count({ where: { perfilId: perfil.id } });

  const planes: PlanOpcion[] = ordenarPlanes(
    perfil.plan.carrera.planes.map((p) => ({
      id: p.id,
      version: p.version,
      totalCreditos: p.totalCreditos,
      materias: p._count.materias,
      vigente: p.vigente,
    })),
  );

  return (
    <section className="section_container max-w-2xl">
      <Link
        href="/semestre"
        className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 rounded-xl bg-primary-100 text-14-normal font-semibold !text-primary-ink hover:bg-primary/15 transition-colors"
      >
        <span aria-hidden="true">←</span> Volver a mi semestre
      </Link>
      <h1 className="text-30-bold mt-4 mb-1 text-tinta">Importar mi historial</h1>
      <p className="text-16-medium text-black-300 mb-8">
        Sube el PDF de tu <strong>Historial de Notas</strong> del portal de matrícula. Lo leemos,
        emparejamos cada materia con tu plan y te dejamos revisar todo antes de guardar. El PDF no se
        almacena.
      </p>
      <ImportarHistorial
        planes={planes}
        planIdInicial={perfil.planId}
        carrera={perfil.plan.carrera.nombre}
        cursosExistentes={cursosExistentes}
      />
    </section>
  );
}
