"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { urlReporte } from "@/lib/reporte";

// Enlace a WhatsApp con el mensaje de reporte prellenado. Toma la ruta actual de
// usePathname() para dar contexto; desde una pantalla de error se le pasa además
// el detalle técnico. abre WhatsApp en otra pestaña/app.
export default function EnlaceReporte({
  detalle,
  conRuta = true,
  className,
  children,
}: {
  detalle?: string;
  conRuta?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const pathname = usePathname();
  const href = urlReporte({ ruta: conRuta ? pathname : undefined, detalle });
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children ?? "Reportar un problema"}
    </a>
  );
}
