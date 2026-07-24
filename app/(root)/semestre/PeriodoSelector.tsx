"use client";

import { useRouter } from "next/navigation";
import { nombrePeriodo, type TipoPeriodo } from "@/lib/calculos";

const campo =
  "border-2 border-black rounded-lg px-4 py-2 bg-white text-black " +
  "focus:outline-none focus:ring-2 focus:ring-blue-800";

// Un único select con todos los periodos (año × tipo) en orden cronológico
// (Verano → 1er → 2do dentro de cada año). Etiquetas con nombrePeriodo().
export default function PeriodoSelector({
  periodos,
  clave,
}: {
  periodos: { anio: number; tipo: TipoPeriodo }[];
  clave: string;
}) {
  const router = useRouter();

  return (
    <select
      aria-label="Periodo"
      className={campo}
      value={clave}
      onChange={(e) => {
        const [anio, tipo] = e.target.value.split(":");
        router.push(`/semestre?anio=${anio}&tipo=${tipo}`);
      }}
    >
      {periodos.map((p) => {
        const valor = `${p.anio}:${p.tipo}`;
        return (
          <option key={valor} value={valor}>
            {nombrePeriodo(p.anio, p.tipo)}
          </option>
        );
      })}
    </select>
  );
}
