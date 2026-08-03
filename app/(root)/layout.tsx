import { auth } from "@/auth";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

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
      {/* La barra de pestañas móvil es fija; el padding inferior deja que el pie
          quede por encima de ella al llegar al final. */}
      <div className="pb-24 md:pb-0">
        <main>{children}</main>
        <Footer />
      </div>
    </>
  );
}
