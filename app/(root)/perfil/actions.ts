"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";

export type EstadoPerfil = { ok?: boolean; error?: string; mensaje?: string };

// Actualiza el contexto académico del perfil (facultad → carrera → plan → año).
// Valida en el servidor que la cadena plan → carrera → facultad → UTP sea
// coherente, igual que el onboarding. Los cursos ya cargados NO se pierden:
// Curso apunta a Materia, no a PlanEstudio.
export async function actualizarContextoAcademico(
  _prev: EstadoPerfil,
  formData: FormData,
): Promise<EstadoPerfil> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/");
  }
  const userId = session.user.id;

  const perfil = await prisma.perfilEstudiante.findUnique({
    where: { userId },
    select: { id: true, planId: true },
  });
  if (!perfil) {
    redirect("/onboarding");
  }

  const facultadId = String(formData.get("facultadId") ?? "");
  const carreraId = String(formData.get("carreraId") ?? "");
  const planId = String(formData.get("planId") ?? "");
  const anioRaw = String(formData.get("anioIngreso") ?? "");

  if (!facultadId || !carreraId || !planId) {
    return { error: "Completa facultad, carrera y plan de estudio." };
  }

  const utp = await prisma.universidad.findUnique({
    where: { siglas: "UTP" },
    select: { id: true },
  });
  if (!utp) {
    return { error: "No se encontró la universidad UTP en el catálogo." };
  }

  // El plan debe pertenecer a la carrera elegida, la carrera a la facultad, y la
  // facultad a la UTP. Una sola consulta trae toda la cadena.
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

  await prisma.perfilEstudiante.update({
    where: { id: perfil.id },
    data: { planId, anioIngreso },
  });

  // El avance de carrera se recalcula sobre el plan nuevo.
  revalidatePath("/perfil");
  revalidatePath("/carrera");
  revalidatePath("/semestre");

  const cambioPlan = planId !== perfil.planId;
  return {
    ok: true,
    mensaje: cambioPlan
      ? "Plan actualizado. Tu avance de carrera se recalculó sobre el nuevo plan; tus cursos siguen intactos."
      : "Contexto académico guardado.",
  };
}

// Actualiza el índice objetivo. Entre 0 y 3.0, o vacío para quitarlo.
export async function actualizarObjetivo(
  _prev: EstadoPerfil,
  formData: FormData,
): Promise<EstadoPerfil> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/");
  }
  const userId = session.user.id;

  const perfil = await prisma.perfilEstudiante.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!perfil) {
    redirect("/onboarding");
  }

  const objetivoRaw = String(formData.get("indiceObjetivo") ?? "").trim();
  let indiceObjetivo: number | null = null;
  if (objetivoRaw !== "") {
    const n = Number(objetivoRaw);
    if (Number.isNaN(n) || n < 0 || n > 3) {
      return { error: "El índice objetivo debe estar entre 0 y 3.0." };
    }
    // Redondeo a un decimal, coherente con el paso 0.1 del control.
    indiceObjetivo = Math.round(n * 10) / 10;
  }

  await prisma.perfilEstudiante.update({
    where: { id: perfil.id },
    data: { indiceObjetivo },
  });

  revalidatePath("/perfil");
  revalidatePath("/carrera");
  revalidatePath("/semestre");

  return {
    ok: true,
    mensaje: indiceObjetivo === null ? "Quitaste tu índice objetivo." : "Índice objetivo guardado.",
  };
}

// Elimina la cuenta y TODOS los datos del estudiante. Borrar el User dispara la
// cascada del esquema: PerfilEstudiante → Curso → Seccion → Nota, y las cuentas
// de OAuth (Account). Las sesiones son JWT en cookie: las cierra signOut. Exige
// confirmación escrita ("ELIMINAR"), no un solo clic.
export async function eliminarCuenta(_prev: EstadoPerfil, formData: FormData): Promise<EstadoPerfil> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/");
  }
  const userId = session.user.id;

  const confirmacion = String(formData.get("confirmacion") ?? "").trim();
  if (confirmacion !== "ELIMINAR") {
    return { error: "Escribe ELIMINAR (en mayúsculas) para confirmar." };
  }

  try {
    await prisma.user.delete({ where: { id: userId } });
  } catch (e) {
    // P2025: el registro ya no existe (doble envío). Se trata como éxito y se
    // cierra la sesión igual. Cualquier otro error se reporta.
    if (!(e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2025")) {
      return { error: "No se pudo eliminar la cuenta. Intenta de nuevo." };
    }
  }

  // Borra la cookie de sesión y saca al usuario a la landing. signOut redirige
  // (lanza NEXT_REDIRECT), así que lo de abajo no se alcanza.
  await signOut({ redirectTo: "/" });
  return {};
}
