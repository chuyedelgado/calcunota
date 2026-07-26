"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { crearSemestre } from "../actions";
import type { TipoPeriodo } from "@/lib/calculos";
import { buscar } from "@/lib/texto";

export type MateriaSugerida = {
  materiaPlanId: string;
  codigo: string;
  nombre: string;
  creditos: number;
  fundamental: boolean;
  sugerida: boolean;
  prereqPendiente: boolean;
};

export default function ArmarSemestre({
  sugeridas,
  otras,
  anio,
  tipo,
}: {
  sugeridas: MateriaSugerida[];
  otras: MateriaSugerida[];
  anio: number;
  tipo: TipoPeriodo;
}) {
  // Precargadas: las sugeridas marcadas. El estudiante retoca, no arma de cero.
  const [seleccion, setSeleccion] = useState<Set<string>>(() => new Set(sugeridas.map((s) => s.materiaPlanId)));
  const [agregadas, setAgregadas] = useState<MateriaSugerida[]>([]);
  const [query, setQuery] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  const toggle = (id: string) =>
    setSeleccion((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const q = query.trim();
  const resultados =
    q.length < 2
      ? []
      : buscar(
          otras.filter((m) => !agregadas.some((a) => a.materiaPlanId === m.materiaPlanId)),
          q,
          (m) => `${m.codigo} ${m.nombre}`,
        ).slice(0, 8);

  function agregar(m: MateriaSugerida) {
    setAgregadas((prev) => [...prev, m]);
    setSeleccion((prev) => new Set(prev).add(m.materiaPlanId));
    setQuery("");
  }

  const lista = [...sugeridas, ...agregadas];

  async function crear() {
    setEnviando(true);
    setError("");
    const r = await crearSemestre({ anio, tipo, materiaPlanIds: [...seleccion] });
    setEnviando(false);
    if (r && !r.ok) setError(r.error ?? "No se pudo crear el semestre.");
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        {lista.map((m) => {
          const marcada = seleccion.has(m.materiaPlanId);
          return (
            <label
              key={m.materiaPlanId}
              className="border-2 border-black rounded-2xl p-4 bg-white flex items-start gap-3 cursor-pointer"
            >
              <input type="checkbox" className="mt-1" checked={marcada} onChange={() => toggle(m.materiaPlanId)} />
              <div className="min-w-0">
                <p className="text-16-medium font-semibold">
                  {m.codigo} · {m.nombre}
                </p>
                <p className="text-14-normal !text-black-300">
                  {m.creditos} cr.{m.fundamental ? " · fundamental" : ""}
                </p>
                {m.prereqPendiente && (
                  <p className="text-14-normal !text-ambar-fuerte mt-1">
                    Tiene prerequisitos que aún no apruebas. Puedes llevarla igual si los cursas en
                    paralelo o los convalidaste.
                  </p>
                )}
              </div>
            </label>
          );
        })}
        {lista.length === 0 && (
          <p className="text-16-medium text-black-300">
            No hay materias pendientes del plan para sugerir. Busca abajo para agregar.
          </p>
        )}
      </div>

      {/* Agregar otras (repeticiones, adelantos, electivas) */}
      <div className="border-2 border-black rounded-2xl p-4 bg-white">
        <p className="text-16-medium font-semibold mb-2">Agregar otra materia del plan</p>
        <input
          className="w-full border-2 border-black rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-800"
          placeholder="Código o nombre…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {resultados.length > 0 && (
          <ul className="mt-2 border-2 border-black rounded-lg divide-y divide-gray-200 max-h-56 overflow-y-auto">
            {resultados.map((m) => (
              <li key={m.materiaPlanId}>
                <button
                  type="button"
                  onClick={() => agregar(m)}
                  className="w-full text-left px-3 py-2 text-16-medium hover:bg-primary-100"
                >
                  {m.codigo} · {m.nombre}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <p className="text-14-normal !text-rojo-fuerte">{error}</p>}

      <Button
        type="button"
        className="calcular_btn w-full !text-[20px] !p-4"
        disabled={seleccion.size === 0 || enviando}
        onClick={crear}
      >
        {enviando ? "Creando…" : `Crear semestre (${seleccion.size})`}
      </Button>
    </div>
  );
}
