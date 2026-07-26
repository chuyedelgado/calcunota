"use server";

import { signIn, signOut } from "@/auth";

// Tras el login va a Mi semestre; si aún no hay perfil, /semestre redirige a
// /onboarding, así que el destino final depende del estado del usuario.
export async function iniciarSesion() {
  await signIn("google", { redirectTo: "/semestre" });
}

export async function cerrarSesion() {
  await signOut({ redirectTo: "/" });
}
