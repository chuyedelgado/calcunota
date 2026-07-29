"use client";

import { useState } from "react";
import {
  APROBACION_FUNDAMENTAL,
  APROBACION_NORMAL,
  distribuirObjetivo,
  type Exigencia,
  type SeccionEvaluacion,
} from "@/lib/calculos";
import Ayuda from "./Ayuda";
import { EXPLICACIONES } from "./explicaciones";

// Cada estado semántico lleva ícono + texto además del color (nunca color solo).
const EXIGENCIA_UI: Record<Exigencia, { texto: string; clase: string }> = {
  holgado: { texto: "✓ Holgado", clase: "bg-verde-suave !text-verde-fuerte border-verde-fuerte" },
  "en linea": { texto: "→ En línea", clase: "bg-black/[0.05] !text-black-100 border-black/20" },
  exigente: { texto: "▲ Exigente", clase: "bg-ambar-suave !text-ambar-fuerte border-ambar-fuerte" },
  "muy exigente": { texto: "⚠ Muy exigente", clase: "bg-rojo-suave !text-rojo-fuerte border-rojo-fuerte" },
};

// Selector de objetivo + proyección detallada por evaluación. Compartido por la
// calculadora interna y el asistente público.
export default function PanelObjetivo({
  seccionesEval,
  objetivoAprobar,
  fundamental,
}: {
  seccionesEval: SeccionEvaluacion[];
  objetivoAprobar: number;
  fundamental: boolean;
}) {
  const presets = fundamental
    ? [
        { etiqueta: "Aprobar (C)", valor: APROBACION_FUNDAMENTAL },
        { etiqueta: "B", valor: 81 },
        { etiqueta: "A", valor: 91 },
      ]
    : [
        { etiqueta: "Aprobar (D)", valor: APROBACION_NORMAL },
        { etiqueta: "C", valor: 71 },
        { etiqueta: "B", valor: 81 },
        { etiqueta: "A", valor: 91 },
      ];

  const [objetivo, setObjetivo] = useState<number>(objetivoAprobar);
  const [personalizado, setPersonalizado] = useState("");
  const [esPersonalizado, setEsPersonalizado] = useState(false);

  const plan = distribuirObjetivo(seccionesEval, objetivo);

  return (
    <div>
      <h2 className="text-20-medium font-semibold mb-3">¿Qué necesitas en lo que falta?</h2>
      <div className="flex flex-wrap gap-2 mb-2">
        {presets.map((o) => {
          const activo = !esPersonalizado && objetivo === o.valor;
          return (
            <button
              key={o.etiqueta}
              type="button"
              onClick={() => {
                setEsPersonalizado(false);
                setObjetivo(o.valor);
              }}
              className={`rounded-full px-4 py-2 text-16-medium font-semibold border-2 transition-colors ${
                activo
                  ? "bg-primary border-primary !text-white shadow-hero"
                  : "bg-white border-black/15 !text-tinta hover:border-primary/50"
              }`}
            >
              {o.etiqueta}
            </button>
          );
        })}
        <input
          type="number"
          inputMode="numeric"
          placeholder="Otra…"
          aria-label="Objetivo personalizado"
          value={personalizado}
          min={1}
          max={100}
          onChange={(e) => {
            setPersonalizado(e.target.value);
            const v = Number(e.target.value);
            if (Number.isFinite(v) && v > 0 && v <= 100) {
              setEsPersonalizado(true);
              setObjetivo(v);
            }
          }}
          className={`w-24 rounded-full px-4 py-2 text-16-medium border-2 ${
            esPersonalizado ? "border-primary bg-primary text-white placeholder:text-white/70" : "border-black/15 bg-white"
          }`}
        />
      </div>

      {plan.yaAlcanzado ? (
        <div className="border-2 border-verde-fuerte bg-verde-suave rounded-2xl p-4">
          <p className="text-16-medium !text-verde-fuerte font-semibold">✓ {plan.mensaje}</p>
        </div>
      ) : !plan.alcanzable ? (
        <div className="border-2 border-rojo-fuerte/40 bg-rojo-suave rounded-2xl p-4">
          <p className="text-16-medium">⚠ {plan.mensaje}</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-14-normal !text-black-300">
            El reparto no es parejo a propósito: te pide más donde ya vienes rindiendo mejor.
          </p>
          {/* Leyenda de las dos cifras que trae cada fila. Abre hacia arriba para
              no tapar las metas de la lista que explica. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] !text-black-300">
            <span className="inline-flex items-center gap-1">
              Meta sugerida <Ayuda explicacion={EXPLICACIONES.metaSugerida} />
            </span>
            <span className="inline-flex items-center gap-1">
              Exigencia <Ayuda explicacion={EXPLICACIONES.exigencia} />
            </span>
          </div>
          <ul className="space-y-2">
            {plan.metas.map((m) => {
              const ui = EXIGENCIA_UI[m.exigencia];
              return (
                <li key={`${m.seccionIndice}-${m.orden}`} className="tarjeta p-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-16-medium font-semibold">{m.etiqueta}</p>
                    <p className="text-14-normal !text-black-300">pesa {Math.round(m.peso * 10) / 10}% de la nota</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {/* Meta SUGERIDA: no es una nota ingresada. Acento tenue y rotulada. */}
                    <span className="bg-primary-100 rounded-lg px-2.5 py-1 text-right leading-tight">
                      <span className="block text-[10px] uppercase tracking-wide font-extrabold !text-primary-ink">
                        meta sugerida
                      </span>
                      <span className="text-[18px] font-bold !text-primary-ink tabular-nums">
                        {m.metaEnPuntaje}
                        <span className="text-14-normal !text-primary-ink/70"> de {m.puntajeMax}</span>
                      </span>
                    </span>
                    <span className={`inline-block text-14-normal border rounded-full px-2 py-0.5 ${ui.clase}`}>
                      {ui.texto}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
