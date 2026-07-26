"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { CalendarDays, GraduationCap, Home, LogOut } from "lucide-react";
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
                    className={`text-16-medium ${activa ? "text-blue-800 font-bold" : "text-black"}`}
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
                      className="rounded-full border-2 border-black"
                    />
                  ) : (
                    <span className="w-9 h-9 rounded-full border-2 border-black bg-primary-100 flex items-center justify-center font-bold">
                      {usuario.nombre?.[0]?.toUpperCase() ?? "?"}
                    </span>
                  )}
                </button>
                {menuAbierto && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMenuAbierto(false)} />
                    <div className="absolute right-0 top-full mt-2 w-56 bg-white border-2 border-black rounded-xl shadow-xl p-3 z-50">
                      {usuario.nombre && (
                        <p className="text-16-medium font-semibold px-1 pb-2 truncate">{usuario.nombre}</p>
                      )}
                      <form action={cerrarSesion}>
                        <button
                          type="submit"
                          className="w-full flex items-center gap-2 text-16-medium py-2 px-1 hover:text-blue-800"
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
                <button type="submit" className="text-16-medium text-blue-800 font-semibold">
                  Iniciar sesión
                </button>
              </form>
            )}
          </div>
        </nav>
      </header>

      {/* Barra inferior de pestañas: solo móvil */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t-2 border-black flex">
        {SECCIONES.map((s) => {
          const activa = esActiva(s.href, pathname);
          const Icono = s.icono;
          return (
            <Link
              key={s.href}
              href={s.href}
              className={`flex-1 flex flex-col items-center py-2 gap-0.5 ${
                activa ? "text-blue-800" : "text-black"
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
