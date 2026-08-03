import Link from "next/link";
import EnlaceReporte from "@/components/EnlaceReporte";

// 404 global: enlace o página que no existe. Se renderiza dentro del layout raíz
// (sin la navegación del sitio), así que se vale por sí misma y ofrece salida.
export default function NotFound() {
  return (
    <main className="min-h-screen grid place-items-center px-5">
      <div className="text-center max-w-md">
        <p className="text-[56px] font-extrabold text-tinta leading-none">404</p>
        <h1 className="text-24-black text-tinta mt-2">Esta página no existe</h1>
        <p className="text-16-medium !text-black-300 mt-2">
          El enlace no lleva a ningún lado, o la página se movió de sitio.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center min-h-[44px] px-6 mt-6 rounded-xl bg-primary !text-white font-semibold hover:bg-primary-ink transition-colors"
        >
          Volver al inicio
        </Link>
        <p className="text-14-normal !text-black-300 mt-5">
          ¿Sigue fallando?{" "}
          <EnlaceReporte detalle="404" className="font-semibold !text-primary-ink underline underline-offset-2">
            Repórtalo
          </EnlaceReporte>
        </p>
      </div>
    </main>
  );
}
