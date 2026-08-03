import Link from "next/link";
import EnlaceReporte from "@/components/EnlaceReporte";

// Pie global: enlaces legales y de reporte. El año se resuelve en el servidor;
// el enlace de reporte es un Client Component (necesita la ruta actual).
export default function Footer() {
  const anio = new Date().getFullYear();
  return (
    <footer className="border-t border-hairline mt-16 px-5 py-8">
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-14-normal !text-black-300">
        <p>© {anio} CalcuNota</p>
        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <Link href="/privacidad" className="hover:!text-tinta transition-colors">
            Privacidad
          </Link>
          <Link href="/terminos" className="hover:!text-tinta transition-colors">
            Términos
          </Link>
          <EnlaceReporte className="hover:!text-tinta transition-colors">
            Reportar un problema
          </EnlaceReporte>
        </nav>
      </div>
    </footer>
  );
}
