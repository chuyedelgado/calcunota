"use client";

import { useRouter } from "next/navigation";
import { TIPOS_PERIODO, type PeriodoTipo } from "./periodo";

const campo =
  "border-2 border-black rounded-lg px-4 py-2 bg-white text-black " +
  "focus:outline-none focus:ring-2 focus:ring-blue-800";

// Cambia el periodo actualizando los search params; la página servidor
// re-renderiza con los cursos del periodo elegido.
export default function PeriodoSelector({
  anio,
  tipo,
  anios,
}: {
  anio: number;
  tipo: PeriodoTipo;
  anios: number[];
}) {
  const router = useRouter();

  function ir(nuevoAnio: number, nuevoTipo: string) {
    router.push(`/semestre?anio=${nuevoAnio}&tipo=${nuevoTipo}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <select
        aria-label="Año"
        className={campo}
        value={anio}
        onChange={(e) => ir(Number(e.target.value), tipo)}
      >
        {anios.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
      <select
        aria-label="Periodo"
        className={campo}
        value={tipo}
        onChange={(e) => ir(anio, e.target.value)}
      >
        {TIPOS_PERIODO.map((t) => (
          <option key={t.valor} value={t.valor}>
            {t.etiqueta}
          </option>
        ))}
      </select>
    </div>
  );
}
