"use client";

import { useEffect, useRef, useState } from "react";
import {
  APROBACION_FUNDAMENTAL,
  APROBACION_NORMAL,
  distribuirObjetivo,
  notaALetra,
  notaARango,
  type Exigencia,
  type MetaEvaluacion,
  type MetaFijada,
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

// Clave estable de una meta en la lista APLANADA (seccionIndice ya viene después
// de aplanarSecciones, así que sirve tal cual para el array `fijadas`).
function claveMeta(m: { seccionIndice: number; orden: number }): string {
  return `${m.seccionIndice}-${m.orden}`;
}

type Edicion = {
  clave: string;
  texto: string;
  seccionIndice: number;
  orden: number;
  puntajeMax: number;
};

// Selector de objetivo + proyección detallada por evaluación. Compartido por la
// calculadora interna y el asistente público.
//
// La proyección es INTERACTIVA: el estudiante puede fijar cualquier meta a mano
// y el resto se reparte de nuevo para seguir cumpliendo el objetivo. Todo corre
// en el cliente; es un SIMULADOR y no guarda nada en la base.
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
  // Metas que el estudiante fijó a mano; el motor respeta estas y redistribuye
  // las demás. Se conservan al cambiar de objetivo (una nota fija no depende de
  // la meta global).
  const [fijadas, setFijadas] = useState<MetaFijada[]>([]);
  // Texto en curso del campo que se está editando, para no recalcular en cada
  // tecla (debounce) ni hacer que el input "salte".
  const [edicion, setEdicion] = useState<Edicion | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const plan = distribuirObjetivo(seccionesEval, objetivo, fijadas);

  function commitEdicion(ed: Edicion) {
    const sinEsta = (prev: MetaFijada[]) =>
      prev.filter((f) => !(f.seccionIndice === ed.seccionIndice && f.orden === ed.orden));
    if (ed.texto === "") {
      // Vaciar el campo libera la meta: vuelve al reparto automático.
      setFijadas(sinEsta);
      return;
    }
    const puntaje = Math.max(0, Math.min(ed.puntajeMax, parseInt(ed.texto, 10) || 0));
    setFijadas((prev) => [...sinEsta(prev), { seccionIndice: ed.seccionIndice, orden: ed.orden, puntaje }]);
  }

  function editar(m: MetaEvaluacion, raw: string) {
    // Cambiar de campo confirma lo que quedó pendiente en el anterior.
    if (edicion && edicion.clave !== claveMeta(m)) commitEdicion(edicion);
    // Solo enteros; se acota a [0, puntajeMax] en vivo.
    let limpio = raw.replace(/\D/g, "");
    if (limpio !== "") limpio = String(Math.min(m.puntajeMax, parseInt(limpio, 10)));
    const ed: Edicion = {
      clave: claveMeta(m),
      texto: limpio,
      seccionIndice: m.seccionIndice,
      orden: m.orden,
      puntajeMax: m.puntajeMax,
    };
    setEdicion(ed);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      commitEdicion(ed);
      setEdicion((cur) => (cur && cur.clave === ed.clave ? null : cur));
    }, 200);
  }

  function confirmarAhora(m: MetaEvaluacion) {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (edicion && edicion.clave === claveMeta(m)) {
      commitEdicion(edicion);
      setEdicion(null);
    }
  }

  function liberar(m: MetaEvaluacion) {
    setFijadas((prev) => prev.filter((f) => !(f.seccionIndice === m.seccionIndice && f.orden === m.orden)));
    setEdicion((cur) => (cur && cur.clave === claveMeta(m) ? null : cur));
  }

  function restablecer() {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    setFijadas([]);
    setEdicion(null);
  }

  function valorInput(m: MetaEvaluacion): string {
    if (edicion && edicion.clave === claveMeta(m)) return edicion.texto;
    return String(m.metaEnPuntaje);
  }

  // Sugerencia de objetivo realista cuando el actual dejó de ser alcanzable.
  const rangoTecho = !plan.alcanzable && plan.metas.length > 0 ? notaARango(plan.techoAlcanzable) : null;
  const puedeSugerir = rangoTecho !== null && rangoTecho.aprueba && rangoTecho.desde < objetivo;

  function aplicarSugerencia() {
    if (!rangoTecho) return;
    setEsPersonalizado(false);
    setPersonalizado("");
    setObjetivo(rangoTecho.desde);
  }

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
      ) : plan.metas.length === 0 ? (
        <div className="border-2 border-black/15 bg-crema rounded-2xl p-4">
          <p className="text-16-medium">{plan.mensaje}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Invitación (no advertencia) a editar. Va arriba de la lista para que
              la función se descubra sin tener que hacer scroll. */}
          <div className="flex items-start gap-2 rounded-xl bg-primary-100 border border-primary/20 px-3 py-2.5">
            <svg
              viewBox="0 0 24 24"
              className="w-4 h-4 shrink-0 mt-0.5 text-primary-ink"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
            <p className="text-14-normal !text-primary-ink">
              Toca cualquier nota para cambiarla: el resto del plan se reajusta solo para que sigas
              llegando a tu objetivo.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Leyenda de las dos cifras que trae cada fila. */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] !text-black-300">
              <span className="inline-flex items-center gap-1">
                Meta sugerida <Ayuda explicacion={EXPLICACIONES.metaSugerida} />
              </span>
              <span className="inline-flex items-center gap-1">
                Exigencia <Ayuda explicacion={EXPLICACIONES.exigencia} />
              </span>
            </div>
            {fijadas.length > 0 && (
              <button
                type="button"
                onClick={restablecer}
                className="text-14-normal !text-primary-ink font-semibold underline"
              >
                Restablecer plan
              </button>
            )}
          </div>

          {!plan.alcanzable ? (
            <div className="border-2 border-rojo-fuerte/40 bg-rojo-suave rounded-2xl p-4 space-y-3">
              <p className="text-16-medium">⚠ {plan.mensaje}</p>
              {puedeSugerir && rangoTecho && (
                <button
                  type="button"
                  onClick={aplicarSugerencia}
                  className="calcular_btn !text-16-medium !py-2.5 !px-4"
                >
                  Con esas notas, tu meta realista es {notaALetra(plan.techoAlcanzable)} — usar {rangoTecho.desde}
                </button>
              )}
            </div>
          ) : (
            fijadas.length > 0 && (
              <p className="text-14-normal !text-verde-fuerte font-semibold">✓ {plan.mensaje}</p>
            )
          )}

          <ul className="space-y-2">
            {plan.metas.map((m) => {
              const ui = EXIGENCIA_UI[m.exigencia];
              return (
                <li
                  key={claveMeta(m)}
                  className={`tarjeta p-3 flex items-center justify-between gap-3 ${
                    m.fijada ? "!border-primary border-2 bg-primary-100/50" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-16-medium font-semibold truncate">{m.etiqueta}</p>
                    <p className="text-14-normal !text-black-300">pesa {Math.round(m.peso * 10) / 10}% de la nota</p>
                    {m.fijada && (
                      <button
                        type="button"
                        onClick={() => liberar(m)}
                        className="mt-1 inline-flex items-center gap-1 text-[13px] !text-primary-ink font-semibold underline"
                      >
                        Liberar
                      </button>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span
                      className={`rounded-lg px-2.5 py-1 text-right leading-tight border ${
                        m.fijada ? "bg-primary-100 border-primary/50" : "bg-white border-hairline"
                      }`}
                    >
                      <span className="flex items-center justify-end gap-1 text-[10px] uppercase tracking-wide font-extrabold !text-primary-ink">
                        {m.fijada ? (
                          <>
                            <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                              <rect x="5" y="11" width="14" height="9" rx="2" />
                              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                            </svg>
                            tu nota
                          </>
                        ) : (
                          "meta sugerida"
                        )}
                      </span>
                      <span className="flex items-baseline justify-end gap-1">
                        <input
                          type="text"
                          inputMode="numeric"
                          aria-label={`Tu nota proyectada en ${m.etiqueta}, sobre ${m.puntajeMax}`}
                          value={valorInput(m)}
                          onChange={(e) => editar(m, e.target.value)}
                          onBlur={() => confirmarAhora(m)}
                          onFocus={(e) => e.currentTarget.select()}
                          className="w-12 text-right text-[18px] font-bold !text-primary-ink tabular-nums bg-transparent border-b-2 border-primary/40 focus:outline-none focus:border-primary"
                        />
                        <span className="text-14-normal !text-primary-ink/70">de {m.puntajeMax}</span>
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

          <p className="text-[13px] !text-black-300">
            Es un simulador: prueba escenarios sin miedo, no guarda tus notas.
          </p>
        </div>
      )}
    </div>
  );
}
