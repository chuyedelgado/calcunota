import Link from "next/link";

// Pie global: enlaces legales y de contacto. Sin interactividad, así que es un
// Server Component y el año se resuelve en el servidor.
export default function Footer() {
  const anio = new Date().getFullYear();
  return (
    <footer className="border-t border-hairline mt-16 px-5 py-8">
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-14-normal !text-black-300">
        <p>© {anio} CalcuNota</p>
        <nav className="flex items-center gap-5">
          <Link href="/privacidad" className="hover:!text-tinta transition-colors">
            Privacidad
          </Link>
          <Link href="/terminos" className="hover:!text-tinta transition-colors">
            Términos
          </Link>
        </nav>
      </div>
    </footer>
  );
}
