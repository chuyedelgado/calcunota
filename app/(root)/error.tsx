"use client";

import { useEffect } from "react";
import Link from "next/link";
import EnlaceReporte from "@/components/EnlaceReporte";

// Límite de error de las páginas del sitio: atrapa fallos en tiempo de ejecución
// (por ejemplo, una consulta a la base que no responde) y muestra algo
// comprensible, con salida a la app, en vez de una pantalla rota. Se renderiza
// dentro del layout, así que la navegación sigue visible.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Deja rastro en la consola para depurar; al usuario no se le muestra.
    console.error(error);
  }, [error]);

  // Detalle técnico para el reporte (sin datos personales): mensaje y digest.
  const detalle = [error.message, error.digest ? `ref ${error.digest}` : null]
    .filter(Boolean)
    .join(" · ")
    .slice(0, 200);

  return (
    <section className="section_container max-w-md text-center">
      <div className="tarjeta p-7">
        <p className="text-[40px] leading-none mb-3" aria-hidden="true">
          ⚠️
        </p>
        <h1 className="text-24-black text-tinta mb-2">Algo salió mal</h1>
        <p className="text-16-medium !text-black-300 mb-6">
          Tuvimos un problema al cargar esto y no es tu culpa. Puedes reintentar; si sigue fallando,
          vuelve a tu semestre e inténtalo de nuevo en un momento.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center justify-center min-h-[44px] px-6 rounded-xl bg-primary !text-white font-semibold hover:bg-primary-ink transition-colors"
          >
            Reintentar
          </button>
          <Link
            href="/semestre"
            className="inline-flex items-center justify-center min-h-[44px] px-6 rounded-xl border border-hairline !text-tinta font-semibold hover:bg-crema transition-colors"
          >
            Ir a mi semestre
          </Link>
        </div>
        <p className="text-14-normal !text-black-300 mt-5">
          ¿Sigue fallando?{" "}
          <EnlaceReporte
            detalle={detalle}
            className="font-semibold !text-primary-ink underline underline-offset-2"
          >
            Repórtalo
          </EnlaceReporte>
        </p>
      </div>
    </section>
  );
}
