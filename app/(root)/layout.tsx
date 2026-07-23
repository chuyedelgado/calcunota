import Navbar from "@/components/Navbar";

// El <html>/<body> los define el root layout (app/layout.tsx).
// Aquí sólo se envuelve el sitio público con la barra de navegación.
export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Navbar />
      {children}
    </>
  );
}
