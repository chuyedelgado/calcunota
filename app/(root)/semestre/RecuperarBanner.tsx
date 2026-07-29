"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CLAVE_MATERIA_PUBLICA } from "@/components/calculadora/tipos";

// Muestra el aviso solo si el visitante calculó una materia sin cuenta y ese
// borrador sigue en este dispositivo.
export default function RecuperarBanner({ query }: { query: string }) {
  const [hay, setHay] = useState(false);
  useEffect(() => {
    try {
      setHay(!!window.localStorage.getItem(CLAVE_MATERIA_PUBLICA));
    } catch {
      /* localStorage no disponible */
    }
  }, []);

  if (!hay) return null;

  return (
    <div className="max-w-3xl mx-auto mb-8 border border-verde-fuerte/30 bg-verde-suave rounded-2xl p-4 shadow-suave flex flex-col sm:flex-row items-center justify-between gap-3">
      <p className="text-16-medium">Tienes una materia que calculaste antes de crear tu cuenta.</p>
      <Button asChild className="calcular_btn !text-[16px] !p-3 shrink-0">
        <Link href={`/semestre/agregar?${query}&recuperar=1`}>Recuperarla</Link>
      </Button>
    </div>
  );
}
