import { auth } from "@/auth";
import Navbar from "@/components/Navbar";

// El <html>/<body> los define el root layout (app/layout.tsx).
// Aquí se envuelve el sitio con la navegación (que se oculta sola en la landing
// y el onboarding) y se deja espacio inferior para la barra de pestañas móvil.
export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const usuario = session?.user
    ? { nombre: session.user.name ?? null, imagen: session.user.image ?? null }
    : null;

  return (
    <>
      <Navbar usuario={usuario} />
      <main className="pb-24 md:pb-0">{children}</main>
    </>
  );
}
