import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { iniciarSesion } from "./nav-actions";

const VALORES = [
  {
    titulo: "Qué notas necesitas",
    texto: "Proyecta cuánto tienes que sacar en lo que te queda para tu objetivo.",
    icono: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-5 h-5">
        <circle cx="10" cy="10" r="7" />
        <circle cx="10" cy="10" r="2.5" />
      </svg>
    ),
  },
  {
    titulo: "Tu índice de carrera",
    texto: "El acumulado real de toda la carrera, por periodo, con los créditos que arrastran.",
    icono: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-5 h-5">
        <path d="M3 14l4-5 3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13 2h4v4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    titulo: "Las reglas de la UTP",
    texto: "Materias fundamentales, la D que se borra al repetir, la F que arrastra créditos.",
    icono: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-5 h-5">
        <path d="M4 3h9a2 2 0 0 1 2 2v12H6a2 2 0 0 1-2-2V3z" strokeLinejoin="round" />
        <path d="M4 15a2 2 0 0 1 2-2h9" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    titulo: "Qué te conviene repetir",
    texto: "Cuál materia te sube más el índice, y cuánto, antes de gastar tiempo y dinero.",
    icono: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-5 h-5">
        <path d="M4 10a6 6 0 0 1 10-4.5M16 10a6 6 0 0 1-10 4.5" strokeLinecap="round" />
        <path d="M14 2v3.5h-3.5M6 18v-3.5h3.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export default async function Home() {
  const session = await auth();
  if (session?.user) {
    redirect("/semestre");
  }

  const cta = (
    <Button asChild className="calcular_btn">
      <Link href="/calcular">Calcula tu materia</Link>
    </Button>
  );

  return (
    <div className="min-h-screen">
      {/* Header propio de la landing */}
      <header className="sticky top-0 z-40 bg-white/85 backdrop-blur-sm border-b border-hairline">
        <div className="max-w-5xl mx-auto px-5 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-extrabold text-tinta tracking-tight">
            <span className="w-6 h-6 rounded-lg bg-primary shadow-hero" aria-hidden />
            CalcuNota
          </Link>
          <form action={iniciarSesion}>
            <button
              type="submit"
              className="text-16-medium font-semibold !text-primary-ink border border-hairline rounded-full px-4 py-1.5 bg-white hover:border-primary/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              Iniciar sesión
            </button>
          </form>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5">
        {/* Hero.
            El <h1> lleva el NOMBRE y la promesa, en ese orden. Antes era solo la
            promesa ("¿Vas a pasar la materia?"): el nombre existía en el <title>,
            en el rótulo de la cabecera y en el pie, pero no en el encabezado
            principal, y la verificación de marca de Google lo leyó como que el
            nombre de la página no coincidía con el de la pantalla de
            consentimiento.

            El párrafo de debajo describe el propósito de forma literal —qué es,
            para quién y qué hace— y va antes del botón para que se lea sin
            desplazarse en un móvil. */}
        <section className="text-center pt-10 sm:pt-16 pb-14">
          <p className="text-[12px] uppercase tracking-[0.12em] font-bold !text-primary-ink">
            Gratis · sin registrarte
          </p>
          <h1 className="mt-3 text-balance">
            <span className="block text-[38px] sm:text-[52px] font-extrabold leading-[1.05] tracking-tight text-tinta">
              CalcuNota
            </span>
            <span className="block text-[22px] sm:text-[28px] font-bold leading-tight tracking-tight text-tinta mt-2">
              ¿Vas a pasar la materia?
            </span>
          </h1>
          <p className="text-16-medium !text-black-300 mt-5 max-w-xl mx-auto leading-relaxed">
            CalcuNota es una herramienta gratuita para estudiantes de la{" "}
            <strong className="font-semibold text-tinta">Universidad Tecnológica de Panamá (UTP)</strong>.
            Calcula tu índice académico, proyecta qué notas necesitas para alcanzar tu objetivo y lleva
            el seguimiento de tu avance de carrera.
          </p>
          <p className="text-16-medium !text-black-300 mt-3 max-w-lg mx-auto">
            Pon tus notas y mira al instante qué necesitas en lo que te falta. En menos de un minuto,
            desde el celular.
          </p>
          <div className="mt-8">{cta}</div>
        </section>

        {/* Qué ofrece */}
        <section className="pb-14">
          <div className="grid gap-3 sm:grid-cols-2">
            {VALORES.map((v) => (
              <div key={v.titulo} className="tarjeta p-5 flex gap-4">
                <span className="w-10 h-10 shrink-0 rounded-xl bg-black/[0.04] grid place-items-center text-tinta">
                  {v.icono}
                </span>
                <div>
                  <p className="text-16-medium font-bold text-tinta">{v.titulo}</p>
                  <p className="text-14-normal !text-black-300 mt-1 leading-relaxed">{v.texto}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Segundo llamado */}
        <section className="text-center pb-20">
          <h2 className="text-30-bold text-tinta mb-6">Empieza con una materia</h2>
          {cta}
        </section>
      </main>
    </div>
  );
}
