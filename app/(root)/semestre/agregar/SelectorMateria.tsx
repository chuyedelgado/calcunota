"use client";

import { useMemo, useState } from "react";
import { secuenciaDePeriodo, type TipoPeriodo } from "@/lib/calculos";
import { buscar } from "@/lib/texto";
import { nombreTipoPeriodo } from "../periodo";
import type { MateriaOpcion } from "./AgregarMateriaForm";

// Selector de materia con buscador. Sin escribir, agrupa por posición del plan
// (Verano → 1er → 2do dentro de cada año) con el bloque que le toca al
// estudiante destacado arriba. Al escribir, aplana y ordena por relevancia con
// buscar(). Las aprobadas se atenúan pero no se ocultan (se pueden repetir).
export default function SelectorMateria({
  materias,
  bloqueSugerido,
  value,
  onChange,
}: {
  materias: MateriaOpcion[];
  bloqueSugerido: string | null;
  value: string;
  onChange: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const buscando = q.trim() !== "";

  const filtradas = useMemo(
    () => buscar(materias, q, (m) => `${m.codigo} ${m.nombre}`),
    [materias, q],
  );

  // Agrupa por posición curricular, ordenado por secuenciaDePeriodo. El bloque
  // sugerido se saca al principio con su propia etiqueta.
  const grupos = useMemo(() => agrupar(materias, bloqueSugerido), [materias, bloqueSugerido]);

  return (
    <div>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Busca por código o nombre…"
        aria-label="Buscar materia"
        className="w-full bg-white border border-hairline rounded-xl px-4 py-3 text-16-medium text-tinta shadow-suave focus:outline-none focus:ring-2 focus:ring-primary/40"
      />

      <div className="mt-3 max-h-[26rem] overflow-y-auto rounded-2xl border border-hairline bg-white divide-y divide-hairline">
        {buscando ? (
          filtradas.length > 0 ? (
            filtradas.map((m) => (
              <Fila key={m.id} m={m} seleccionada={m.id === value} onSelect={() => onChange(m.id)} />
            ))
          ) : (
            <p className="px-4 py-6 text-16-medium !text-black-300 text-center">
              Nada coincide con “{q.trim()}”.
            </p>
          )
        ) : (
          grupos.map((g) => (
            <div key={g.key}>
              <p
                className={`sticky top-0 z-[1] px-4 py-2 text-[11px] uppercase tracking-wide font-bold ${
                  g.sugerido ? "bg-primary-100 !text-primary-ink" : "bg-crema !text-black-300"
                }`}
              >
                {g.sugerido ? "Sugeridas · " : ""}
                {g.label}
              </p>
              {g.items.map((m) => (
                <Fila key={m.id} m={m} seleccionada={m.id === value} onSelect={() => onChange(m.id)} />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Fila({
  m,
  seleccionada,
  onSelect,
}: {
  m: MateriaOpcion;
  seleccionada: boolean;
  onSelect: () => void;
}) {
  const aprobada = m.estado === "aprobada";
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={seleccionada}
      className={`w-full text-left px-4 py-3 flex flex-col gap-1 transition-colors ${
        seleccionada ? "bg-primary-100 ring-2 ring-inset ring-primary/50" : "hover:bg-crema"
      } ${aprobada ? "opacity-60" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-16-medium font-semibold text-tinta truncate">{m.nombre}</p>
          <p className="text-14-normal !text-black-300">
            {m.codigo} · {m.creditos} cr.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
          {m.fundamental && (
            <span className="text-[11px] font-semibold !text-black-100 bg-black/[0.06] rounded-full px-2 py-0.5">
              Fundamental
            </span>
          )}
          <EstadoChip estado={m.estado} />
        </div>
      </div>

      {/* Aviso suave de prerequisitos: informa, no bloquea. */}
      {m.estado === "pendiente" && m.faltanPrereqs.length > 0 && (
        <p className="text-14-normal !text-ambar-fuerte">
          ⚠ Te faltan por aprobar: {m.faltanPrereqs.join(", ")}
        </p>
      )}
    </button>
  );
}

function EstadoChip({ estado }: { estado: MateriaOpcion["estado"] }) {
  if (estado === "aprobada") {
    return (
      <span className="text-[11px] font-semibold !text-verde-fuerte bg-verde-suave rounded-full px-2 py-0.5">
        ✓ Aprobada
      </span>
    );
  }
  if (estado === "en_curso") {
    return (
      <span className="text-[11px] font-semibold !text-ambar-fuerte bg-ambar-suave rounded-full px-2 py-0.5">
        En curso
      </span>
    );
  }
  return null;
}

type Grupo = { key: string; label: string; sugerido: boolean; items: MateriaOpcion[] };

// Devuelve los grupos ordenados por secuenciaDePeriodo, con el bloque sugerido
// al frente. Las materias sin posición en el plan caen en un grupo final.
function agrupar(materias: MateriaOpcion[], bloqueSugerido: string | null): Grupo[] {
  const claveDe = (m: MateriaOpcion) =>
    m.anioSugerido != null && m.periodoSugerido != null
      ? `${m.anioSugerido}:${m.periodoSugerido}`
      : "sin";

  const mapa = new Map<string, MateriaOpcion[]>();
  for (const m of materias) {
    const k = claveDe(m);
    const arr = mapa.get(k);
    if (arr) arr.push(m);
    else mapa.set(k, [m]);
  }

  const seqDe = (key: string) => {
    if (key === "sin") return Infinity;
    const [anio, tipo] = key.split(":");
    return secuenciaDePeriodo(Number(anio), tipo as TipoPeriodo);
  };
  const etiquetaDe = (key: string) => {
    if (key === "sin") return "Sin ubicación en el plan";
    const [anio, tipo] = key.split(":");
    return `Año ${anio} · ${nombreTipoPeriodo(tipo as TipoPeriodo)}`;
  };

  const grupos: Grupo[] = [...mapa.entries()]
    .map(([key, items]) => ({
      key,
      label: etiquetaDe(key),
      sugerido: key === bloqueSugerido,
      items: [...items].sort((a, b) => a.codigo.localeCompare(b.codigo)),
    }))
    .sort((a, b) => seqDe(a.key) - seqDe(b.key));

  // El bloque sugerido va arriba de todo.
  const i = grupos.findIndex((g) => g.sugerido);
  if (i > 0) {
    const [sug] = grupos.splice(i, 1);
    grupos.unshift(sug);
  }
  return grupos;
}
