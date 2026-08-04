"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { CalendarDays, GraduationCap, Home, LogOut, UserRound } from "lucide-react";
import { cerrarSesion, iniciarSesion } from "@/app/(root)/nav-actions";

export type UsuarioNav = { nombre: string | null; imagen: string | null };

const SECCIONES = [
  { href: "/", label: "Inicio", icono: Home },
  { href: "/semestre", label: "Mi semestre", icono: CalendarDays },
  { href: "/carrera", label: "Mi carrera", icono: GraduationCap },
];

function esActiva(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Navbar({ usuario }: { usuario: UsuarioNav | null }) {
  const pathname = usePathname();
  const [menuAbierto, setMenuAbierto] = useState(false);

  // Sin navegación en la landing ni durante el onboarding.
  if (pathname === "/" || pathname.startsWith("/onboarding")) return null;

  return (
    <>
      {/* Barra superior */}
      <header className="px-5 py-3 bg-white shadow-sm sticky top-0 z-40">
        <nav className="flex justify-between items-center max-w-6xl mx-auto">
          <Link href="/semestre" aria-label="Inicio">
            <Image src="/logo.png" alt="CalcuNota" width={132} height={28} />
          </Link>

          <div className="flex items-center gap-6">
            {/* Enlaces de sección: solo escritorio */}
            <div className="hidden md:flex items-center gap-6">
              {SECCIONES.map((s) => {
                const activa = esActiva(s.href, pathname);
                return (
                  <Link
                    key={s.href}
                    href={s.href}
                    className={`text-16-medium transition-colors ${
                      activa ? "!text-primary-ink font-bold" : "!text-black-300 hover:!text-tinta"
                    }`}
                  >
                    {s.label}
                  </Link>
                );
              })}
            </div>

            {/* Sesión */}
            {usuario ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuAbierto((v) => !v)}
                  className="flex items-center gap-2"
                  aria-label="Menú de sesión"
                >
                  {usuario.imagen ? (
                    <Image
                      src={usuario.imagen}
                      alt=""
                      width={36}
                      height={36}
                      className="rounded-full border-2 border-borde"
                    />
                  ) : (
                    <span className="w-9 h-9 rounded-full border-2 border-borde bg-primary-100 flex items-center justify-center font-bold !text-primary-ink">
                      {usuario.nombre?.[0]?.toUpperCase() ?? "?"}
                    </span>
                  )}
                </button>
                {menuAbierto && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMenuAbierto(false)} />
                    <div className="absolute right-0 top-full mt-2 w-56 bg-superficie border border-hairline rounded-xl shadow-suave p-3 z-50">
                      {usuario.nombre && (
                        <p className="text-16-medium font-semibold px-1 pb-2 truncate">{usuario.nombre}</p>
                      )}
                      {/* Única entrada a /perfil desde la interfaz: sin esto la
                          pantalla solo se alcanza escribiendo la URL. */}
                      <Link
                        href="/perfil"
                        onClick={() => setMenuAbierto(false)}
                        className="w-full flex items-center gap-2 text-16-medium py-2 px-2 rounded-lg hover:bg-primary-100 hover:!text-primary-ink transition-colors"
                      >
                        <UserRound size={18} /> Mi perfil
                      </Link>
                      <form action={cerrarSesion}>
                        <button
                          type="submit"
                          className="w-full flex items-center gap-2 text-16-medium py-2 px-2 rounded-lg hover:bg-primary-100 hover:!text-primary-ink transition-colors"
                        >
                          <LogOut size={18} /> Cerrar sesión
                        </button>
                      </form>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <form action={iniciarSesion}>
                <button
                  type="submit"
                  className="text-14-normal font-semibold !text-primary-ink bg-primary-100 rounded-xl px-3 py-2 hover:bg-primary/15 transition-colors"
                >
                  Iniciar sesión
                </button>
              </form>
            )}
          </div>
        </nav>
      </header>

      {/* Barra inferior de pestañas: solo móvil */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-superficie border-t border-hairline flex">
        {SECCIONES.map((s) => {
          const activa = esActiva(s.href, pathname);
          const Icono = s.icono;
          return (
            <Link
              key={s.href}
              href={s.href}
              className={`flex-1 flex flex-col items-center py-2 gap-0.5 transition-colors ${
                activa ? "!text-primary-ink" : "!text-black-300"
              }`}
            >
              <Icono size={22} strokeWidth={activa ? 2.5 : 2} />
              <span className="text-[11px] font-medium">{s.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
