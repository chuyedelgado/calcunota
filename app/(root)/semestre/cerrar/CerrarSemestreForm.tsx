"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatearNota, notaALetra, truncar, type TipoPeriodo } from "@/lib/calculos";
import { cerrarSemestre, type ResumenSemestre } from "../actions";

export type CursoAcerrar = {
  id: string;
  codigo: string;
  nombre: string;
  creditos: number;
  fundamental: boolean;
  propuesta: number | null;
};

type Fila = { notaStr: string; retirar: boolean };

export default function CerrarSemestreForm({
  cursos,
  anio,
  tipo,
}: {
  cursos: CursoAcerrar[];
  anio: number;
  tipo: TipoPeriodo;
}) {
  const [filas, setFilas] = useState<Fila[]>(
    cursos.map((c) => ({ notaStr: c.propuesta !== null ? formatearNota(c.propuesta) : "", retirar: false })),
  );
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [resumen, setResumen] = useState<ResumenSemestre["resumen"] | null>(null);

  function set(i: number, cambio: Partial<Fila>) {
    setFilas((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...cambio } : f)));
  }

  const listo = filas.every((f) => {
    if (f.retirar) return true;
    const n = Number(f.notaStr);
    return f.notaStr.trim() !== "" && Number.isFinite(n) && n >= 0 && n <= 100;
  });

  async function confirmar() {
    setEnviando(true);
    setError("");
    const r = await cerrarSemestre({
      anio,
      tipo,
      cierres: cursos.map((c, i) => ({
        cursoId: c.id,
        notaFinal: filas[i].retirar ? null : Number(filas[i].notaStr),
        retirar: filas[i].retirar,
      })),
    });
    setEnviando(false);
    if (r.ok && r.resumen) setResumen(r.resumen);
    else setError(r.error ?? "No se pudo cerrar el semestre.");
  }

  if (resumen) {
    return (
      <div className="space-y-6">
        <div className="bg-primary-100 border border-primary/20 rounded-2xl p-6 shadow-suave">
          <p className="text-24-black !p-0 !text-tinta">Semestre cerrado ✓</p>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <Dato etiqueta="Puntos" valor={resumen.puntos.toFixed(1)} />
            <Dato etiqueta="Créditos" valor={String(resumen.creditos)} />
            <Dato etiqueta="Índice del semestre" valor={resumen.indicePeriodo.toFixed(2)} />
            <Dato etiqueta="Índice acumulado" valor={resumen.indiceAcumulado.toFixed(2)} />
          </div>
        </div>
        <Button asChild className="calcular_btn w-full">
          <Link href={`/semestre?anio=${anio}&tipo=${tipo}`}>Volver a mi semestre</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-14-normal !text-black-300">
        Revisa la nota de cada materia. La oficial manda: edítala si tu profe curvó o redondeó.
      </p>

      <div className="space-y-3">
        {cursos.map((c, i) => {
          const f = filas[i];
          const n = Number(f.notaStr);
          const notaOk = f.notaStr.trim() !== "" && Number.isFinite(n) && n >= 0 && n <= 100;
          return (
            <div key={c.id} className="tarjeta p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-16-medium font-semibold truncate">{c.nombre}</p>
                  <p className="text-14-normal !text-black-300">
                    {c.codigo} · {c.creditos} cr.{c.fundamental ? " · fundamental" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="number"
                    inputMode="decimal"
                    disabled={f.retirar}
                    className="w-20 border border-borde rounded-lg px-2 py-2 text-16-medium disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60"
                    placeholder="—"
                    value={f.notaStr}
                    min={0}
                    max={100}
                    onChange={(e) => set(i, { notaStr: e.target.value })}
                  />
                  {!f.retirar && notaOk && (
                    <span className="text-16-medium font-bold w-6">{notaALetra(n)}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between mt-2">
                {!f.retirar && notaOk && truncar(n) !== n ? (
                  <span className="text-14-normal !text-black-300">
                    {n} se trunca a {truncar(n)} → {notaALetra(n)}
                  </span>
                ) : (
                  <span />
                )}
                <label className="text-14-normal !text-black-300 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={f.retirar}
                    onChange={(e) => set(i, { retirar: e.target.checked })}
                  />
                  Retirar
                </label>
              </div>
            </div>
          );
        })}
      </div>

      {error && <p className="text-14-normal !text-rojo-fuerte">{error}</p>}

      <Button
        type="button"
        className="calcular_btn w-full !text-[20px] !p-4"
        disabled={!listo || enviando}
        onClick={confirmar}
      >
        {enviando ? "Cerrando…" : "Cerrar semestre"}
      </Button>
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="tarjeta p-3">
      <p className="text-14-normal !text-black-300">{etiqueta}</p>
      <p className="text-30-bold leading-tight">{valor}</p>
    </div>
  );
}
