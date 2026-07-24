// Module augmentation de NextAuth: añade el id de la base del usuario a
// `session.user.id` y al token JWT, para poder colgar consultas por usuario
// (PerfilEstudiante, cursos, etc.) con tipado válido.
import { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
    } & DefaultSession["user"]
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string
  }
}
