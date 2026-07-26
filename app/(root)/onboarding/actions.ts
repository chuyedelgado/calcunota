"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export type EstadoOnboarding = { error?: string };

// Crea el PerfilEstudiante del usuario en sesión. Valida en el servidor
// (no sólo en el cliente) que la jerarquía plan → carrera → facultad → UTP
// sea coherente, que el año sea razonable y que el objetivo esté en rango.
export async function crearPerfil(
  _prev: EstadoOnboarding,
  formData: FormData,
): Promise<EstadoOnboarding> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/");
  }
  const userId = session.user.id;

  // userId es @unique: no debe existir un segundo perfil.
  const yaTiene = await prisma.perfilEstudiante.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (yaTiene) {
    redirect("/semestre");
  }

  const facultadId = String(formData.get("facultadId") ?? "");
  const carreraId = String(formData.get("carreraId") ?? "");
  const planId = String(formData.get("planId") ?? "");
  const anioRaw = String(formData.get("anioIngreso") ?? "");
  const objetivoRaw = String(formData.get("indiceObjetivo") ?? "").trim();

  if (!facultadId || !carreraId || !planId) {
    return { error: "Completa facultad, carrera y plan de estudio." };
  }

  // La universidad no se pregunta: hay una sola. Se asigna en el servidor.
  const utp = await prisma.universidad.findUnique({
    where: { siglas: "UTP" },
    select: { id: true },
  });
  if (!utp) {
    return { error: "No se encontró la universidad UTP en el catálogo." };
  }

  // El plan debe pertenecer a la carrera elegida, la carrera a la facultad,
  // y la facultad a la UTP. Una sola consulta trae toda la cadena.
  const plan = await prisma.planEstudio.findUnique({
    where: { id: planId },
    select: {
      carreraId: true,
      carrera: { select: { facultadId: true, facultad: { select: { universidadId: true } } } },
    },
  });
  if (
    !plan ||
    plan.carreraId !== carreraId ||
    plan.carrera.facultadId !== facultadId ||
    plan.carrera.facultad.universidadId !== utp.id
  ) {
    return { error: "La combinación de facultad, carrera y plan no es válida." };
  }

  const anioActual = new Date().getFullYear();
  const anioIngreso = Number(anioRaw);
  if (!Number.isInteger(anioIngreso) || anioIngreso < 1980 || anioIngreso > anioActual + 1) {
    return { error: `El año de ingreso debe estar entre 1980 y ${anioActual + 1}.` };
  }

  let indiceObjetivo: number | null = null;
  if (objetivoRaw !== "") {
    const n = Number(objetivoRaw);
    if (Number.isNaN(n) || n < 0 || n > 3) {
      return { error: "El índice objetivo debe estar entre 0 y 3.0." };
    }
    indiceObjetivo = n;
  }

  try {
    await prisma.perfilEstudiante.create({
      data: {
        userId,
        universidadId: utp.id,
        planId,
        anioIngreso,
        indiceObjetivo,
      },
    });
  } catch {
    // Choca sólo si se creó un perfil en paralelo (userId @unique).
    return { error: "Ya tienes un perfil creado." };
  }

  redirect("/semestre");
}
