"use client";

import { useState } from "react";
import { formatearNota } from "@/lib/calculos";

export type CursoTrayectoria = {
  id: string;
  codigo: string;
  nombre: string;
  letra: string | null;
  notaFinal: number | null;
  creditos: number;
  /** Puntos aportados al numerador del índice: puntos-de-letra × créditos */
  puntos: number;
  /** Fundamental aprobada con D: bloquea graduación */
  fundamentalD: boolean;
};

export type PeriodoTrayectoria = {
  etiqueta: string;
  indice: number;
  acumulado: number;
  tendencia: "inicio" | "sube" | "baja" | "mantiene";
  cursos: CursoTrayectoria[];
};

// Trayectoria del índice periodo a periodo, como una progresión (línea de tiempo)
// y no como una tabla. Cada periodo se despliega para ver su detalle.
export default function Trayectoria({ periodos }: { periodos: PeriodoTrayectoria[] }) {
  return (
    <ol className="relative">
      {periodos.map((p, i) => (
        <Fila key={p.etiqueta} periodo={p} ultimo={i === periodos.length - 1} />
      ))}
    </ol>
  );
}

function Fila({ periodo, ultimo }: { periodo: PeriodoTrayectoria; ultimo: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const t = TENDENCIA[periodo.tendencia];

  return (
    <li className="relative pl-8">
      {/* Línea de tiempo: punto + conector vertical */}
      <span
        aria-hidden
        className="absolute left-[6px] top-5 w-3 h-3 rounded-full bg-primary ring-4 ring-primary-100"
      />
      {!ultimo && <span aria-hidden className="absolute left-[11px] top-8 bottom-0 w-px bg-hairline" />}

      <div className="pb-4">
        <button
          type="button"
          aria-expanded={abierto}
          onClick={() => setAbierto((v) => !v)}
          className="w-full tarjeta px-4 py-3 flex items-center justify-between gap-3 text-left hover:border-primary/40 transition-colors"
        >
          <span className="min-w-0">
            <span className="block text-16-medium font-semibold text-tinta truncate">{periodo.etiqueta}</span>
            <span className="block text-14-normal !text-black-300">
              periodo <span className="tabular-nums font-semibold">{periodo.indice.toFixed(2)}</span>
            </span>
          </span>
          <span className="flex items-center gap-3 shrink-0">
            <span className="text-right">
              <span className="block text-[11px] uppercase tracking-wide font-bold !text-black-300">acum</span>
              <span className="text-20-medium font-extrabold tabular-nums text-tinta leading-none">
                {periodo.acumulado.toFixed(2)}
              </span>
            </span>
            {periodo.tendencia !== "inicio" && (
              <span className={`text-20-medium font-bold ${t.color}`} aria-label={t.etiqueta} title={t.etiqueta}>
                {t.flecha}
              </span>
            )}
            <svg
              aria-hidden
              width="18"
              height="18"
              viewBox="0 0 20 20"
              fill="none"
              className={`text-primary transition-transform duration-200 ${abierto ? "rotate-180" : ""}`}
            >
              <path d="M5 7.5 10 12.5 15 7.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </button>

        {abierto && (
          <div className="mt-2 tarjeta p-4 space-y-3">
            <p className="text-14-normal !text-black-300">
              Índice del periodo <span className="font-semibold text-tinta tabular-nums">{periodo.indice.toFixed(2)}</span> ·
              acumulado hasta aquí{" "}
              <span className="font-semibold text-tinta tabular-nums">{periodo.acumulado.toFixed(2)}</span>
            </p>
            <ul className="space-y-2">
              {periodo.cursos.map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block text-16-medium text-tinta truncate">{c.nombre}</span>
                    <span className="block text-14-normal !text-black-300">
                      {c.codigo} · {c.creditos} cr · {c.puntos} pts al índice
                      {c.fundamentalD && (
                        <span className="!text-rojo-fuerte font-semibold"> · ⚠ fundamental con D</span>
                      )}
                    </span>
                  </span>
                  <LetraBadge letra={c.letra} notaFinal={c.notaFinal} fundamentalD={c.fundamentalD} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </li>
  );
}

const TENDENCIA: Record<
  PeriodoTrayectoria["tendencia"],
  { flecha: string; color: string; etiqueta: string }
> = {
  inicio: { flecha: "", color: "", etiqueta: "" },
  sube: { flecha: "↑", color: "!text-verde-fuerte", etiqueta: "El índice subió" },
  baja: { flecha: "↓", color: "!text-ambar-fuerte", etiqueta: "El índice bajó" },
  mantiene: { flecha: "→", color: "!text-black-300", etiqueta: "El índice se mantuvo" },
};

function LetraBadge({
  letra,
  notaFinal,
  fundamentalD,
}: {
  letra: string | null;
  notaFinal: number | null;
  fundamentalD: boolean;
}) {
  if (!letra) return null;
  // Rojo = reprobado/bloqueo (F, o fundamental aprobada con D). Ámbar = D que
  // aprueba (atención). Verde = A/B/C.
  const tono =
    letra === "F" || fundamentalD
      ? "bg-rojo-suave !text-rojo-fuerte"
      : letra === "D"
        ? "bg-ambar-suave !text-ambar-fuerte"
        : "bg-verde-suave !text-verde-fuerte";
  return (
    <span className={`shrink-0 text-14-normal font-bold rounded-full px-3 py-1 tabular-nums ${tono}`}>
      {notaFinal !== null ? `${formatearNota(notaFinal)} · ` : ""}
      {letra}
    </span>
  );
}
