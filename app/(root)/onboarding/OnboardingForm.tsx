"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { crearPerfil, type EstadoOnboarding } from "./actions";

// Árbol que llega desde el Server Component en una sola consulta.
export type FacultadArbol = {
  id: string;
  nombre: string;
  carreras: {
    id: string;
    nombre: string;
    grado: string;
    planes: { id: string; version: string; totalCreditos: number }[];
  }[];
};

const GRADO_LABEL: Record<string, string> = {
  TECNICO: "Técnico",
  LICENCIATURA: "Licenciatura",
  INGENIERIA: "Ingeniería",
  MAESTRIA: "Maestría",
  DOCTORADO: "Doctorado",
};

const campo =
  "w-full border-2 border-black rounded-lg px-4 py-3 bg-white text-black " +
  "focus:outline-none focus:ring-2 focus:ring-blue-800 " +
  "disabled:opacity-50 disabled:cursor-not-allowed";

export default function OnboardingForm({
  facultades,
  anioActual,
}: {
  facultades: FacultadArbol[];
  anioActual: number;
}) {
  const [estado, formAction, pendiente] = useActionState<EstadoOnboarding, FormData>(
    crearPerfil,
    {},
  );

  const [facultadId, setFacultadId] = useState("");
  const [carreraId, setCarreraId] = useState("");
  const [planId, setPlanId] = useState("");

  // Todo el filtrado ocurre en memoria sobre el árbol recibido.
  const facultad = facultades.find((f) => f.id === facultadId);
  const carreras = facultad?.carreras ?? [];
  const carrera = carreras.find((c) => c.id === carreraId);
  const planes = carrera?.planes ?? [];
  const planUnico = planes.length === 1 ? planes[0] : null;

  function onFacultad(v: string) {
    setFacultadId(v);
    setCarreraId("");
    setPlanId("");
  }

  function onCarrera(v: string) {
    setCarreraId(v);
    const ps = carreras.find((c) => c.id === v)?.planes ?? [];
    // Si la carrera tiene un solo plan, se selecciona solo.
    setPlanId(ps.length === 1 ? ps[0].id : "");
  }

  return (
    <form action={formAction} className="max-w-2xl mx-auto bg-white border-2 border-black rounded-2xl shadow-xl p-6 sm:p-10 space-y-6">
      {/* Facultad */}
      <div>
        <label htmlFor="facultadId" className="block text-16-medium font-semibold mb-2">
          Facultad
        </label>
        <select
          id="facultadId"
          name="facultadId"
          className={campo}
          value={facultadId}
          onChange={(e) => onFacultad(e.target.value)}
          required
        >
          <option value="">Selecciona tu facultad…</option>
          {facultades.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nombre}
            </option>
          ))}
        </select>
      </div>

      {/* Carrera */}
      <div>
        <label htmlFor="carreraId" className="block text-16-medium font-semibold mb-2">
          Carrera
        </label>
        <select
          id="carreraId"
          name="carreraId"
          className={campo}
          value={carreraId}
          onChange={(e) => onCarrera(e.target.value)}
          disabled={!facultad}
          required
        >
          <option value="">
            {facultad ? "Selecciona tu carrera…" : "Elige primero una facultad"}
          </option>
          {carreras.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre} · {GRADO_LABEL[c.grado] ?? c.grado}
            </option>
          ))}
        </select>
      </div>

      {/* Plan de estudio: oculto si la carrera tiene un solo plan */}
      {carrera && (
        <div>
          <label htmlFor="planId" className="block text-16-medium font-semibold mb-2">
            Plan de estudio
          </label>
          {planUnico ? (
            <>
              <input type="hidden" name="planId" value={planUnico.id} />
              <p className={`${campo} !bg-gray-100`}>
                {planUnico.version} · {planUnico.totalCreditos} créditos{" "}
                <span className="text-black-300">(único plan)</span>
              </p>
            </>
          ) : (
            <select
              id="planId"
              name="planId"
              className={campo}
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              required
            >
              <option value="">Selecciona tu plan…</option>
              {planes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.version} · {p.totalCreditos} créditos
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Año de ingreso */}
      <div>
        <label htmlFor="anioIngreso" className="block text-16-medium font-semibold mb-2">
          Año de ingreso
        </label>
        <input
          id="anioIngreso"
          name="anioIngreso"
          type="number"
          className={campo}
          defaultValue={anioActual}
          min={1980}
          max={anioActual + 1}
          required
        />
      </div>

      {/* Índice objetivo (opcional) */}
      <div>
        <label htmlFor="indiceObjetivo" className="block text-16-medium font-semibold mb-2">
          Índice objetivo <span className="text-black-300 font-normal">(opcional)</span>
        </label>
        <input
          id="indiceObjetivo"
          name="indiceObjetivo"
          type="number"
          className={campo}
          min={0}
          max={3}
          step={0.1}
          placeholder="Entre 0 y 3.0"
        />
      </div>

      {estado?.error && (
        <p className="text-red-600 text-16-medium font-semibold" role="alert">
          {estado.error}
        </p>
      )}

      <Button type="submit" className="calcular_btn w-full" disabled={pendiente}>
        {pendiente ? "Guardando…" : "Guardar perfil"}
      </Button>
    </form>
  );
}
