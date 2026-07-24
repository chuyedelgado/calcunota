"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  esCalificable,
  nombrePeriodo,
  nombreTipoPeriodo,
  validarSecciones,
  type TipoPeriodo,
} from "@/lib/calculos";
import { crearCurso, type EstadoCrearCurso } from "../actions";

export type MateriaOpcion = {
  id: string; // MateriaPlan.id
  codigo: string;
  nombre: string;
  creditos: number;
  fundamental: boolean;
  anioSugerido: number | null;
  periodoSugerido: string | null;
};

type Fila = { nombre: string; porcentaje: number; cantidad: number };

// Plantilla inicial sugerida.
const PLANTILLA: Fila[] = [
  { nombre: "Parciales", porcentaje: 40, cantidad: 2 },
  { nombre: "Talleres", porcentaje: 30, cantidad: 3 },
  { nombre: "Examen final", porcentaje: 30, cantidad: 1 },
];

const campo =
  "w-full border-2 border-black rounded-lg px-4 py-3 bg-white text-black " +
  "focus:outline-none focus:ring-2 focus:ring-blue-800 " +
  "disabled:opacity-50 disabled:cursor-not-allowed";

export default function AgregarMateriaForm({
  materias,
  profesores,
  anio,
  tipo,
}: {
  materias: MateriaOpcion[];
  profesores: string[];
  anio: number;
  tipo: TipoPeriodo;
}) {
  const [estado, formAction, pendiente] = useActionState<EstadoCrearCurso, FormData>(
    crearCurso,
    {},
  );

  const [materiaPlanId, setMateriaPlanId] = useState("");
  const [filas, setFilas] = useState<Fila[]>(PLANTILLA);

  const materia = materias.find((m) => m.id === materiaPlanId);
  const calificable = materia ? esCalificable(materia.creditos) : false;

  // Posición curricular dentro del plan (no una fecha del calendario):
  // combina el año y el periodo sugeridos del plan → "Año 2 · 1er semestre".
  const posicionCurricular = materia
    ? [
        materia.anioSugerido ? `Año ${materia.anioSugerido}` : null,
        materia.periodoSugerido ? nombreTipoPeriodo(materia.periodoSugerido as TipoPeriodo) : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  // validarSecciones sólo usa el porcentaje; se completa la forma con notas: [].
  const validacion = validarSecciones(
    filas.map((f) => ({ nombre: f.nombre, porcentaje: f.porcentaje, cantidad: f.cantidad, notas: [] })),
  );

  const filasIncompletas = filas.some((f) => !f.nombre.trim() || f.cantidad < 1);
  const bloquearEnvio =
    !materia || pendiente || (calificable && (!validacion.valido || filasIncompletas || filas.length === 0));

  function setFila(i: number, cambio: Partial<Fila>) {
    setFilas((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...cambio } : f)));
  }
  function agregarFila() {
    setFilas((prev) => [...prev, { nombre: "", porcentaje: 0, cantidad: 1 }]);
  }
  function quitarFila(i: number) {
    setFilas((prev) => prev.filter((_, idx) => idx !== i));
  }

  return (
    <form
      action={formAction}
      className="max-w-2xl mx-auto bg-white border-2 border-black rounded-2xl shadow-xl p-6 sm:p-10 space-y-6"
    >
      {/* Periodo destino (fijado desde /semestre) */}
      <input type="hidden" name="anio" value={anio} />
      <input type="hidden" name="tipo" value={tipo} />
      <p className="text-16-medium">
        Agregando a: <span className="font-semibold">{nombrePeriodo(anio, tipo)}</span>{" "}
        <Link href={`/semestre?anio=${anio}&tipo=${tipo}`} className="text-blue-800 underline">
          cambiar
        </Link>
      </p>

      {/* Materia */}
      <div>
        <label htmlFor="materiaPlanId" className="block text-16-medium font-semibold mb-2">
          Materia
        </label>
        <select
          id="materiaPlanId"
          name="materiaPlanId"
          className={campo}
          value={materiaPlanId}
          onChange={(e) => setMateriaPlanId(e.target.value)}
          required
        >
          <option value="">Selecciona una materia…</option>
          {materias.map((m) => (
            <option key={m.id} value={m.id}>
              {m.codigo} · {m.nombre} ({m.creditos} cr.)
            </option>
          ))}
        </select>
        {materias.length === 0 && (
          <p className="text-16-medium text-black-300 mt-2">
            No quedan materias del plan por agregar en este periodo.
          </p>
        )}
      </div>

      {/* Ficha de la materia elegida */}
      {materia && (
        <div className="recuadro_paso !bg-gray-100 rounded-xl p-4 flex-col items-start gap-1">
          <p className="text-16-medium">
            <span className="font-semibold">{materia.codigo}</span> · {materia.nombre}
          </p>
          <p className="text-16-medium text-black-300">
            {materia.creditos} créditos
            {posicionCurricular ? ` · ${posicionCurricular}` : ""}
            {materia.fundamental ? " · Fundamental" : ""}
          </p>
        </div>
      )}

      {/* Profesor (opcional, autocompletado con posibilidad de crear) */}
      <div>
        <label htmlFor="profesorNombre" className="block text-16-medium font-semibold mb-2">
          Profesor <span className="text-black-300 font-normal">(opcional)</span>
        </label>
        <input
          id="profesorNombre"
          name="profesorNombre"
          className={campo}
          list="lista-profesores"
          placeholder="Escribe o elige un profesor"
          autoComplete="off"
        />
        <datalist id="lista-profesores">
          {profesores.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </div>

      {/* Esquema de evaluación: sólo si la materia tiene créditos */}
      {materia && !calificable && (
        <div className="recuadro_paso !bg-gray-100 rounded-xl p-4 flex-col items-start">
          <p className="text-16-medium">
            Esta materia no tiene créditos (es un requisito). Se registrará como{" "}
            <span className="font-semibold">APROBADA</span>, sin notas.
          </p>
        </div>
      )}

      {materia && calificable && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="block text-16-medium font-semibold">Esquema de evaluación</label>
            <button
              type="button"
              onClick={agregarFila}
              className="text-16-medium font-semibold text-blue-800 underline"
            >
              + Agregar sección
            </button>
          </div>

          <div className="space-y-3">
            {filas.map((f, i) => (
              <div key={i} className="flex flex-wrap items-end gap-2">
                <div className="flex-1 min-w-[140px]">
                  <span className="block text-14-normal !text-black-300 mb-1">Sección</span>
                  <input
                    className={campo}
                    value={f.nombre}
                    onChange={(e) => setFila(i, { nombre: e.target.value })}
                    placeholder="Nombre"
                  />
                </div>
                <div className="w-24">
                  <span className="block text-14-normal !text-black-300 mb-1">%</span>
                  <input
                    type="number"
                    className={campo}
                    value={f.porcentaje}
                    min={0}
                    step={1}
                    onChange={(e) => setFila(i, { porcentaje: Number(e.target.value) })}
                  />
                </div>
                <div className="w-24">
                  <span className="block text-14-normal !text-black-300 mb-1"># notas</span>
                  <input
                    type="number"
                    className={campo}
                    value={f.cantidad}
                    min={1}
                    step={1}
                    onChange={(e) => setFila(i, { cantidad: Number(e.target.value) })}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => quitarFila(i)}
                  className="text-16-medium font-semibold text-red-600 pb-3 px-1"
                  aria-label="Eliminar sección"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          {/* Feedback en vivo de la suma */}
          <p
            className={`text-16-medium font-semibold mt-3 ${
              validacion.valido ? "text-green-700" : "text-red-600"
            }`}
          >
            {validacion.valido
              ? `Suman 100% ✓`
              : validacion.diferencia > 0
                ? `Suman ${validacion.suma}% · faltan ${validacion.diferencia}%`
                : `Suman ${validacion.suma}% · sobran ${Math.abs(validacion.diferencia)}%`}
          </p>

          {/* Secciones serializadas para el Server Action */}
          <input type="hidden" name="secciones" value={JSON.stringify(filas)} readOnly />
        </div>
      )}

      {estado?.error && (
        <p className="text-red-600 text-16-medium font-semibold" role="alert">
          {estado.error}
        </p>
      )}

      <Button type="submit" className="calcular_btn w-full" disabled={bloquearEnvio}>
        {pendiente ? "Guardando…" : "Agregar materia"}
      </Button>
    </form>
  );
}
