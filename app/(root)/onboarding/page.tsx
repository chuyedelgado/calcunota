import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import OnboardingForm, { type FacultadArbol } from "./OnboardingForm";

export default async function OnboardingPage() {
  const session = await auth();

  // 1. Página protegida: sin sesión, a la raíz.
  if (!session?.user?.id) {
    redirect("/");
  }

  // 2. Si ya tiene perfil, no se muestra el formulario.
  const perfil = await prisma.perfilEstudiante.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (perfil) {
    redirect("/semestre");
  }

  // 3. Árbol completo facultades → carreras → planes de la UTP en UNA consulta
  //    (~120 registros). El Client Component filtra en memoria.
  const facultadesRaw = await prisma.facultad.findMany({
    where: { universidad: { siglas: "UTP" } },
    orderBy: { nombre: "asc" },
    select: {
      id: true,
      nombre: true,
      carreras: {
        orderBy: { nombre: "asc" },
        select: {
          id: true,
          nombre: true,
          grado: true,
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
  });
  const facultades: FacultadArbol[] = facultadesRaw.map((f) => ({
    ...f,
    carreras: f.carreras.map((c) => ({
      ...c,
      planes: c.planes.map((p) => ({
        id: p.id,
        version: p.version,
        totalCreditos: p.totalCreditos,
        vigente: p.vigente,
        materias: p._count.materias,
      })),
    })),
  }));

  const anioActual = new Date().getFullYear();

  return (
    <section className="section_container">
      <h1 className="text-30-bold text-center mb-3">Completa tu perfil</h1>
      <p className="text-16-medium text-center text-black-100 mb-10 max-w-2xl mx-auto">
        Necesitamos saber qué estudias para calcular tus notas y tu índice. Podrás
        empezar a registrar materias en cuanto termines.
      </p>
      <OnboardingForm facultades={facultades} anioActual={anioActual} />
    </section>
  );
}
