"use client";

import { useRouter } from "next/navigation";
import { nombrePeriodo, type TipoPeriodo } from "@/lib/calculos";
import { nombreTipoPeriodo } from "./periodo";

// El periodo es el dato principal del encabezado, pero también el control para
// cambiarlo. Se resuelve con un <select> nativo (agrupado por año, accesible y
// con el picker del móvil) invisible sobre una etiqueta grande que muestra el
// periodo actual completo — porque el trigger nativo no enseña el <optgroup>,
// y aquí el año importa. Ciruela solo en lo interactivo (chevron, foco); el
// dato va en tinta casi-negra.
export default function PeriodoSelector({
  periodos,
  clave,
  claveActual,
  clavesConMaterias,
}: {
  periodos: { anio: number; tipo: TipoPeriodo }[];
  clave: string;
  claveActual: string;
  clavesConMaterias: string[];
}) {
  const router = useRouter();
  const conMaterias = new Set(clavesConMaterias);

  // Agrupa por año preservando el orden cronológico (Verano → 1er → 2do) que ya
  // trae `periodos`.
  const porAnio: { anio: number; items: { anio: number; tipo: TipoPeriodo }[] }[] = [];
  for (const p of periodos) {
    const grupo = porAnio.find((g) => g.anio === p.anio);
    if (grupo) grupo.items.push(p);
    else porAnio.push({ anio: p.anio, items: [p] });
  }

  const [anioSel, tipoSel] = clave.split(":");
  const etiquetaActual = nombrePeriodo(Number(anioSel), tipoSel as TipoPeriodo);

  return (
    <div className="relative inline-flex max-w-full">
      {/* Etiqueta visible: el periodo actual como dato protagonista */}
      <span className="peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40 pointer-events-none flex items-center gap-2 bg-white border border-hairline rounded-xl pl-4 pr-3 py-2.5 shadow-suave max-w-full">
        <span className="truncate text-[22px] sm:text-[26px] font-extrabold text-tinta leading-none">
          {etiquetaActual}
        </span>
        <svg aria-hidden width="20" height="20" viewBox="0 0 20 20" fill="none" className="shrink-0 text-primary">
          <path
            d="M5 7.5 10 12.5 15 7.5"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>

      {/* Select real, transparente encima: aporta el picker nativo agrupado */}
      <select
        aria-label="Cambiar periodo"
        className="peer absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        value={clave}
        onChange={(e) => {
          const [anio, tipo] = e.target.value.split(":");
          router.push(`/semestre?anio=${anio}&tipo=${tipo}`);
        }}
      >
        {porAnio.map((g) => (
          <optgroup key={g.anio} label={String(g.anio)}>
            {g.items.map((p) => {
              const valor = `${p.anio}:${p.tipo}`;
              const prefijo = conMaterias.has(valor) ? "● " : "";
              const sufijo = valor === claveActual ? " — ahora" : "";
              return (
                <option key={valor} value={valor}>
                  {prefijo}
                  {nombreTipoPeriodo(p.tipo)}
                  {sufijo}
                </option>
              );
            })}
          </optgroup>
        ))}
      </select>
    </div>
  );
}
