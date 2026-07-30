"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  etiquetaVersionPlan,
  ordenarPlanes,
  textoOpcionPlan,
  type PlanOpcion,
} from "@/lib/planes";
import type { FacultadArbol } from "../onboarding/OnboardingForm";
import { actualizarContextoAcademico, type EstadoPerfil } from "./actions";

const GRADO_LABEL: Record<string, string> = {
  TECNICO: "Técnico",
  LICENCIATURA: "Licenciatura",
  INGENIERIA: "Ingeniería",
  MAESTRIA: "Maestría",
  DOCTORADO: "Doctorado",
};

const campo =
  "w-full bg-white border border-hairline rounded-xl px-4 py-3 text-tinta shadow-suave " +
  "focus:outline-none focus:ring-2 focus:ring-primary/40 " +
  "disabled:opacity-50 disabled:cursor-not-allowed";

// Misma cascada que el onboarding, pero precargada con el perfil actual y como
// edición. Cambiar de plan recalcula el avance de carrera; se avisa en claro.
export default function ContextoAcademicoForm({
  facultades,
  anioActual,
  facultadIdInicial,
  carreraIdInicial,
  planIdInicial,
  anioIngresoInicial,
  creditosAprobados,
}: {
  facultades: FacultadArbol[];
  anioActual: number;
  facultadIdInicial: string;
  carreraIdInicial: string;
  planIdInicial: string;
  anioIngresoInicial: number;
  creditosAprobados: number;
}) {
  const [estado, formAction, pendiente] = useActionState<EstadoPerfil, FormData>(
    actualizarContextoAcademico,
    {},
  );

  const [facultadId, setFacultadId] = useState(facultadIdInicial);
  const [carreraId, setCarreraId] = useState(carreraIdInicial);
  const [planId, setPlanId] = useState(planIdInicial);

  const facultad = facultades.find((f) => f.id === facultadId);
  const carreras = facultad?.carreras ?? [];
  const carrera = carreras.find((c) => c.id === carreraId);
  const planes = carrera?.planes ?? [];
  const planUnico = planes.length === 1 ? planes[0] : null;

  // Todos los planes del árbol, para localizar el actual aunque el usuario haya
  // cambiado de carrera en el formulario.
  const todosLosPlanes: PlanOpcion[] = facultades.flatMap((f) =>
    f.carreras.flatMap((c) => c.planes),
  );
  const planActual = todosLosPlanes.find((p) => p.id === planIdInicial) ?? null;
  const planNuevoId = planUnico?.id ?? planId;
  const planNuevo = todosLosPlanes.find((p) => p.id === planNuevoId) ?? null;

  // El plan que se guardaría difiere del actual: avisa del recálculo.
  const cambiaPlan = planNuevoId !== planIdInicial;

  const avance = (aprobados: number, total: number) =>
    total > 0 ? Math.min(100, Math.round((aprobados / total) * 100)) : 0;

  function onFacultad(v: string) {
    setFacultadId(v);
    setCarreraId("");
    setPlanId("");
  }
  function onCarrera(v: string) {
    setCarreraId(v);
    const ps = carreras.find((c) => c.id === v)?.planes ?? [];
    setPlanId(ps.length === 1 ? ps[0].id : "");
  }

  return (
    <form action={formAction} className="space-y-5">
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
          <option value="">{facultad ? "Selecciona tu carrera…" : "Elige primero una facultad"}</option>
          {carreras.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre} · {GRADO_LABEL[c.grado] ?? c.grado}
            </option>
          ))}
        </select>
      </div>

      {/* Plan de estudio */}
      {carrera && (
        <div>
          <label htmlFor="planId" className="block text-16-medium font-semibold mb-2">
            Plan de estudio
          </label>
          {planUnico ? (
            <>
              <input type="hidden" name="planId" value={planUnico.id} />
              <p className={`${campo} !bg-crema`}>
                {etiquetaVersionPlan(planUnico.version)} · {planUnico.totalCreditos} créditos ·{" "}
                {planUnico.materias} materias <span className="!text-black-300">(único plan)</span>
              </p>
            </>
          ) : (
            <>
              <select
                id="planId"
                name="planId"
                className={campo}
                value={planId}
                onChange={(e) => setPlanId(e.target.value)}
                required
              >
                <option value="">Selecciona tu plan…</option>
                {ordenarPlanes(planes).map((p) => (
                  <option key={p.id} value={p.id}>
                    {textoOpcionPlan(p, planes)}
                  </option>
                ))}
              </select>
              <p className="text-14-normal !text-black-300 mt-2">
                El plan lo fija el año en que <strong>entraste</strong> a la carrera, no el año
                actual. Reconócelo por sus créditos y número de materias.
              </p>
            </>
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
          className={`${campo} w-40`}
          defaultValue={anioIngresoInicial}
          min={1980}
          max={anioActual + 1}
          required
        />
      </div>

      {/* Advertencia clara antes de guardar: qué cambia y qué no. Reversible. */}
      {cambiaPlan && (
        <div className="rounded-xl px-4 py-3 bg-ambar-suave border border-ambar-fuerte/30 space-y-2">
          <p className="text-16-medium font-semibold !text-ambar-fuerte">⚠ Vas a cambiar de plan</p>
          <ul className="text-14-normal !text-tinta space-y-1 list-disc pl-5">
            <li>
              Tus cursos y notas ya cargados <strong>no se pierden</strong> (quedan asociados a la
              materia, no al plan).
            </li>
            <li>
              Tu <strong>índice acumulado no cambia</strong>.
            </li>
            <li>
              Sí cambia tu <strong>avance de carrera</strong>, porque el total de créditos del plan
              es distinto.
            </li>
            <li>
              Si una materia que cursaste no existe en el plan nuevo, sigue contando para el índice
              pero <strong>no para el avance</strong>.
            </li>
          </ul>
          {planActual && planNuevo && (
            <p className="text-14-normal !text-tinta font-semibold">
              Tu plan actual tiene {planActual.totalCreditos} créditos; el nuevo,{" "}
              {planNuevo.totalCreditos}. Tu avance pasaría de{" "}
              {avance(creditosAprobados, planActual.totalCreditos)}% a{" "}
              {avance(creditosAprobados, planNuevo.totalCreditos)}%.
            </p>
          )}
          <p className="text-14-normal !text-black-300">
            Es reversible: nada se borra, puedes volver al plan anterior cuando quieras.
          </p>
        </div>
      )}

      {estado?.error && (
        <p className="text-14-normal !text-rojo-fuerte font-semibold" role="alert">
          {estado.error}
        </p>
      )}
      {estado?.ok && estado.mensaje && (
        <p className="text-14-normal !text-verde-fuerte font-semibold">✓ {estado.mensaje}</p>
      )}

      <Button type="submit" className="calcular_btn" disabled={pendiente}>
        {pendiente ? "Guardando…" : "Guardar contexto"}
      </Button>
    </form>
  );
}
