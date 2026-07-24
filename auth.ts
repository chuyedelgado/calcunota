import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"

export const { handlers, signIn, signOut, auth } = NextAuth({
  // El adapter persiste usuarios y cuentas en Postgres a través del
  // singleton de lib/prisma.ts (no se crea un PrismaClient nuevo).
  adapter: PrismaAdapter(prisma),
  providers: [Google],

  // A propósito JWT en vez del "database" que el adapter usaría por defecto:
  // más adelante habrá un middleware.ts para proteger rutas y Prisma no corre
  // en el runtime edge de Next. Con JWT el usuario igual se persiste vía adapter
  // (createUser/linkAccount se llaman en el login); lo único que NO va a la base
  // es la sesión, que vive en la cookie firmada.
  session: { strategy: "jwt" },

  callbacks: {
    // En el login inicial `user` es el registro de la base (con su id cuid);
    // en las llamadas siguientes sólo llega `token`. Se copia el id al token.
    jwt({ token, user }) {
      if (user) {
        token.id = user.id
      }
      return token
    },
    // Expone el id de la base en session.user.id para las consultas por usuario.
    session({ session, token }) {
      if (token.id) {
        session.user.id = token.id as string
      }
      return session
    },
  },
})
