"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { esCalificable, nombrePeriodo, validarSecciones, type TipoPeriodo } from "@/lib/calculos";
import { crearCurso, type EstadoCrearCurso } from "../actions";
import { nombreTipoPeriodo } from "../periodo";
import {
  CLAVE_MATERIA_PUBLICA,
  borradorAEval,
  esGrupo,
  seccionesUIaBorrador,
  type BorradorSeccion,
  type SeccionUI,
} from "@/components/calculadora/tipos";
import EditorSecciones from "@/components/calculadora/EditorSecciones";
import SelectorMateria from "./SelectorMateria";

export type MateriaOpcion = {
  id: string; // MateriaPlan.id
  codigo: string;
  nombre: string;
  creditos: number;
  fundamental: boolean;
  anioSugerido: number | null;
  periodoSugerido: string | null;
  estado: "aprobada" | "en_curso" | "pendiente";
  faltanPrereqs: string[]; // códigos de prerequisitos no aprobados
};

// Plantilla inicial sugerida (árbol de secciones para el editor).
const PLANTILLA: BorradorSeccion[] = [
  { id: "s1", nombre: "Parciales", porcentaje: 40, cantidad: 2 },
  { id: "s2", nombre: "Talleres", porcentaje: 30, cantidad: 3 },
  { id: "s3", nombre: "Examen final", porcentaje: 30, cantidad: 1 },
];

const campo =
  "w-full bg-white border border-hairline rounded-xl px-4 py-3 text-tinta shadow-suave " +
  "focus:outline-none focus:ring-2 focus:ring-primary/40 " +
  "disabled:opacity-50 disabled:cursor-not-allowed";

export default function AgregarMateriaForm({
  materias,
  profesores,
  anio,
  tipo,
  bloqueSugerido = null,
  recuperar = false,
}: {
  materias: MateriaOpcion[];
  profesores: string[];
  anio: number;
  tipo: TipoPeriodo;
  bloqueSugerido?: string | null;
  recuperar?: boolean;
}) {
  const [estado, formAction, pendiente] = useActionState<EstadoCrearCurso, FormData>(
    crearCurso,
    {},
  );

  const [materiaPlanId, setMateriaPlanId] = useState("");
  const [secciones, setSecciones] = useState<BorradorSeccion[]>(PLANTILLA);

  // Recuperación: precarga el esquema que el visitante armó sin cuenta (guardado
  // en localStorage por la calculadora pública), incluyendo el laboratorio. Solo
  // el esquema; las notas se capturan en la calculadora de la materia.
  useEffect(() => {
    if (!recuperar) return;
    try {
      const raw = window.localStorage.getItem(CLAVE_MATERIA_PUBLICA);
      if (!raw) return;
      const g = JSON.parse(raw) as { secciones?: SeccionUI[] };
      if (g.secciones?.length) setSecciones(seccionesUIaBorrador(g.secciones));
      window.localStorage.removeItem(CLAVE_MATERIA_PUBLICA);
    } catch {
      /* localStorage no disponible */
    }
  }, [recuperar]);

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

  const validacion = validarSecciones(borradorAEval(secciones));
  const estructuraOk =
    secciones.length > 0 &&
    secciones.every((s) =>
      s.nombre.trim() && s.porcentaje > 0 &&
      (esGrupo(s)
        ? (s.subsecciones ?? []).every((x) => x.nombre.trim() && x.porcentaje > 0 && x.cantidad >= 1)
        : Number.isInteger(s.cantidad) && s.cantidad >= 1),
    );
  const bloquearEnvio =
    !materia || pendiente || (calificable && (!validacion.valido || !estructuraOk));

  return (
    <form
      action={formAction}
      className="max-w-2xl mx-auto tarjeta p-6 sm:p-8 space-y-6"
    >
      {/* Periodo destino (fijado desde /semestre) */}
      <input type="hidden" name="anio" value={anio} />
      <input type="hidden" name="tipo" value={tipo} />
      <p className="text-16-medium !text-black-300">
        Agregando a <span className="font-semibold text-tinta">{nombrePeriodo(anio, tipo)}</span>{" "}
        <Link
          href={`/semestre?anio=${anio}&tipo=${tipo}`}
          className="!text-primary-ink underline font-semibold"
        >
          cambiar
        </Link>
      </p>

      {/* Materia */}
      <div>
        <label className="block text-16-medium font-semibold mb-2">Materia</label>
        {materias.length === 0 ? (
          <p className="text-16-medium text-black-300">
            No quedan materias del plan por agregar en este periodo.
          </p>
        ) : (
          <>
            <SelectorMateria
              materias={materias}
              bloqueSugerido={bloqueSugerido}
              value={materiaPlanId}
              onChange={setMateriaPlanId}
            />
            {/* Valor real para el Server Action */}
            <input type="hidden" name="materiaPlanId" value={materiaPlanId} />
          </>
        )}
      </div>

      {/* Ficha de la materia elegida */}
      {materia && (
        <div className="bg-primary-100 rounded-xl p-4">
          <p className="text-16-medium text-tinta">
            <span className="font-semibold">{materia.codigo}</span> · {materia.nombre}
          </p>
          <p className="text-14-normal !text-black-300 mt-0.5">
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
        <div className="bg-crema border border-hairline rounded-xl p-4">
          <p className="text-16-medium text-tinta">
            Esta materia no tiene créditos (es un requisito). Se registrará como{" "}
            <span className="font-semibold">APROBADA</span>, sin notas.
          </p>
        </div>
      )}

      {materia && calificable && (
        <div>
          <label className="block text-16-medium font-semibold mb-3">Esquema de evaluación</label>
          <EditorSecciones secciones={secciones} onChange={setSecciones} profesores={profesores} />
          {/* Árbol de secciones serializado para el Server Action */}
          <input type="hidden" name="secciones" value={JSON.stringify(secciones)} readOnly />
        </div>
      )}

      {estado?.error && (
        <p className="!text-rojo-fuerte text-16-medium font-semibold" role="alert">
          {estado.error}
        </p>
      )}

      <Button type="submit" className="calcular_btn w-full" disabled={bloquearEnvio}>
        {pendiente ? "Guardando…" : "Agregar materia"}
      </Button>
    </form>
  );
}
