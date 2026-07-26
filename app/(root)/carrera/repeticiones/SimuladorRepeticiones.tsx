"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { calcularIndice, LETRAS, type CursoIndice, type Letra } from "@/lib/calculos";

export type Repetible = {
  cursoId: string;
  materiaId: string;
  codigo: string;
  nombre: string;
  creditos: number;
  periodoLabel: string;
  letraActual: Letra;
  clase: "F" | "D_FUND" | "D_OPC";
  gananciaC: number;
  gananciaB: number;
  gananciaA: number;
  metaF: Letra | null;
};

const COLOR_LETRA: Record<Letra, string> = {
  A: "bg-green-600 border-green-700 !text-white",
  B: "bg-green-500 border-green-700 !text-white",
  C: "bg-gray-300 border-black-300 !text-black",
  D: "bg-amber-400 border-amber-600 !text-black",
  F: "bg-red-500 border-red-700 !text-white",
};

function BotonesLetra({ valor, onChange }: { valor: Letra; onChange: (l: Letra) => void }) {
  return (
    <div className="flex gap-1">
      {LETRAS.map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={valor === l}
          onClick={() => onChange(l)}
          className={`w-9 h-9 rounded-lg border-2 text-16-medium font-bold ${
            valor === l ? COLOR_LETRA[l] : "bg-white border-black !text-black"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

const signo = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}`;

export default function SimuladorRepeticiones({
  indiceActual,
  base,
  obligatorias,
  opcionales,
}: {
  indiceActual: number;
  base: CursoIndice[];
  obligatorias: Repetible[];
  opcionales: Repetible[];
}) {
  const todas = [...obligatorias, ...opcionales];

  // Precarga: obligatorias activadas (hay que hacerlas igual); opcionales no.
  const [sel, setSel] = useState<Record<string, { on: boolean; letra: Letra }>>(() => {
    const m: Record<string, { on: boolean; letra: Letra }> = {};
    for (const r of obligatorias) m[r.cursoId] = { on: true, letra: r.metaF ?? "B" };
    for (const r of opcionales) m[r.cursoId] = { on: false, letra: "A" };
    return m;
  });
  const get = (id: string) => sel[id] ?? { on: false, letra: "A" as Letra };
  const set = (id: string, c: Partial<{ on: boolean; letra: Letra }>) =>
    setSel((p) => ({ ...p, [id]: { ...get(id), ...c } }));

  // El índice combinado se recalcula ENTERO con calcularIndice() sobre el set
  // completo (historial + repeticiones aplicadas). NO se suman las ganancias
  // individuales: cada repetición cambia el denominador, así que sumarlas daría
  // un número incorrecto.
  const maxSec = base.reduce((m, c) => Math.max(m, c.secuencia), 0);
  const seleccionadas = todas.filter((r) => get(r.cursoId).on);
  const repeticiones: CursoIndice[] = seleccionadas.map((r, i) => ({
    id: `${r.cursoId}-rep`,
    materiaId: r.materiaId,
    creditos: r.creditos,
    notaFinal: null,
    letra: get(r.cursoId).letra,
    secuencia: maxSec + 1 + i,
  }));
  const resultado = calcularIndice([...base, ...repeticiones]).indice;
  const delta = resultado - indiceActual;

  return (
    <div className="space-y-8">
      {/* Ancla: índice actual y simulado */}
      <div className="border-4 border-black bg-blue-800 rounded-2xl p-5 shadow-xl text-white">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-14-normal !text-white/80">Índice actual</p>
            <p className="text-[44px] leading-none font-extrabold">{indiceActual.toFixed(2)}</p>
          </div>
          <div className="text-right">
            <p className="text-14-normal !text-white/80">Con lo seleccionado</p>
            <p className="text-[44px] leading-none font-extrabold">{resultado.toFixed(2)}</p>
            <p className="text-16-medium !text-white">{signo(delta)}</p>
          </div>
        </div>
      </div>

      {/* SECCIÓN 1 — Obligatorias */}
      {obligatorias.length > 0 && (
        <div>
          <h2 className="text-20-medium font-bold">Debes repetir para graduarte</h2>
          <p className="text-14-normal !text-black-300 mb-3">
            No es opcional: son requisito de titulación, independientemente del índice.
          </p>
          <div className="space-y-3">
            {obligatorias.map((r) => (
              <FilaRepetible key={r.cursoId} r={r} estado={get(r.cursoId)} onChange={(c) => set(r.cursoId, c)} />
            ))}
          </div>
        </div>
      )}

      {/* SECCIÓN 2 — Opcionales */}
      {opcionales.length > 0 && (
        <div>
          <h2 className="text-20-medium font-bold">Podrías repetir para subir tu índice</h2>
          <p className="text-14-normal !text-black-300 mb-3">
            Ya están aprobadas y no bloquean tu graduación. Es pura conveniencia: tú decides si vale
            la pena.
          </p>
          <div className="space-y-3">
            {opcionales.map((r) => (
              <FilaRepetible key={r.cursoId} r={r} estado={get(r.cursoId)} onChange={(c) => set(r.cursoId, c)} />
            ))}
          </div>
        </div>
      )}

      <div className="border-2 border-black rounded-2xl p-4 bg-white">
        <p className="text-16-medium mb-3">
          Para repetir de verdad, agrega la materia a tu semestre en curso y captúrala como siempre.
        </p>
        <Button asChild className="calcular_btn w-full !text-[18px] !p-3">
          <Link href="/semestre/agregar">Ir a agregar materia</Link>
        </Button>
      </div>
    </div>
  );
}

function FilaRepetible({
  r,
  estado,
  onChange,
}: {
  r: Repetible;
  estado: { on: boolean; letra: Letra };
  onChange: (c: Partial<{ on: boolean; letra: Letra }>) => void;
}) {
  const razon =
    r.clase === "F"
      ? "F reprobada: imposible graduarte con ella."
      : r.clase === "D_FUND"
        ? "D en materia fundamental: avanzas, pero no te gradúas con ella hasta subirla a C."
        : "D aprobada: no bloquea nada, solo pesa en tu índice.";

  return (
    <div className="border-2 border-black rounded-2xl p-4 bg-white">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-16-medium font-semibold">
            {r.codigo} · {r.nombre}
          </p>
          <p className="text-14-normal !text-black-300">
            {r.creditos} cr. · sacaste {r.letraActual} · {r.periodoLabel}
          </p>
        </div>
        <label className="flex items-center gap-1 text-14-normal !text-black-300 shrink-0">
          <input type="checkbox" checked={estado.on} onChange={(e) => onChange({ on: e.target.checked })} />
          incluir
        </label>
      </div>

      <p className="text-14-normal !text-black mt-2">{razon}</p>

      {/* Efecto en el índice como rango */}
      <p className="text-14-normal !text-black-300 mt-2">
        Si la repites — C: {signo(r.gananciaC)} · B: {signo(r.gananciaB)} · A: {signo(r.gananciaA)}
      </p>

      {r.clase === "F" && r.metaF && (
        <p className="text-16-medium font-semibold mt-1">
          Apunta a {r.metaF} o más para que además te suba el índice.
        </p>
      )}

      {estado.on && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-14-normal !text-black-300">Nota que apuntas:</span>
          <BotonesLetra valor={estado.letra} onChange={(l) => onChange({ letra: l })} />
        </div>
      )}
    </div>
  );
}
