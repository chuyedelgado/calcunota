"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { proyectarObjetivoCarrera, referenciaLetra } from "@/lib/proyeccionCarrera";
import { actualizarObjetivo, type EstadoPerfil } from "./actions";

// Índice objetivo editable con vista previa inmediata: usa el MISMO cálculo que
// la proyección de /carrera para decir qué implica la meta antes de guardarla.
// Si ya no es alcanzable, lo avisa antes de guardar, no después.
export default function ObjetivoForm({
  objetivoInicial,
  puntosActuales,
  creditosActuales,
  totalPlan,
}: {
  objetivoInicial: number | null;
  puntosActuales: number;
  creditosActuales: number;
  totalPlan: number;
}) {
  const [estado, formAction, pendiente] = useActionState<EstadoPerfil, FormData>(
    actualizarObjetivo,
    {},
  );

  const [valor, setValor] = useState(objetivoInicial != null ? String(objetivoInicial) : "");

  const n = Number(valor);
  const valido = valor.trim() !== "" && !Number.isNaN(n) && n >= 0 && n <= 3;
  const proyeccion =
    valido && totalPlan > 0
      ? proyectarObjetivoCarrera(puntosActuales, creditosActuales, totalPlan, n)
      : null;

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="indiceObjetivo" className="block text-16-medium font-semibold mb-2">
          Índice objetivo <span className="!text-black-300 font-normal">(0 a 3.0, o vacío)</span>
        </label>
        <input
          id="indiceObjetivo"
          name="indiceObjetivo"
          type="number"
          inputMode="decimal"
          min={0}
          max={3}
          step={0.1}
          placeholder="Ej. 2.5"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          className="w-40 bg-white border border-hairline rounded-xl px-4 py-3 text-20-medium font-bold tabular-nums text-tinta shadow-suave focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      {/* Qué implica la meta, con los datos actuales del estudiante */}
      {proyeccion && <Implicacion p={proyeccion} objetivo={n} sinDatos={creditosActuales === 0} />}

      {estado?.error && (
        <p className="text-14-normal !text-rojo-fuerte font-semibold" role="alert">
          {estado.error}
        </p>
      )}
      {estado?.ok && estado.mensaje && (
        <p className="text-14-normal !text-verde-fuerte font-semibold">✓ {estado.mensaje}</p>
      )}

      <Button type="submit" className="calcular_btn" disabled={pendiente}>
        {pendiente ? "Guardando…" : "Guardar objetivo"}
      </Button>
    </form>
  );
}

function Implicacion({
  p,
  objetivo,
  sinDatos,
}: {
  p: ReturnType<typeof proyectarObjetivoCarrera>;
  objetivo: number;
  // Sin historial cerrado todavía: la proyección es sobre el plan completo.
  sinDatos: boolean;
}) {
  if (p.yaLogrado) {
    return (
      <Aviso tono="verde">
        Con <strong>{p.indiceActual.toFixed(2)}</strong> ya tienes cubierto un objetivo de{" "}
        {objetivo.toFixed(2)}: pase lo que pase en lo que falta, terminas por encima.
      </Aviso>
    );
  }

  if (p.creditosRestantes <= 0) {
    return (
      <Aviso tono="neutral">
        Ya cursaste todos los créditos del plan. Tu índice final es{" "}
        <strong>{p.indiceActual.toFixed(2)}</strong>.
      </Aviso>
    );
  }

  if (p.alcanzable && p.puntosPromedioPorCredito != null) {
    return (
      <Aviso tono="ciruela">
        {sinDatos ? (
          <>
            Necesitarías promediar <strong>{referenciaLetra(p.puntosPromedioPorCredito)}</strong> (
            {p.puntosPromedioPorCredito.toFixed(2)} puntos por crédito) en los{" "}
            <strong>{p.creditosRestantes}</strong> créditos del plan.
          </>
        ) : (
          <>
            Vas en <strong>{p.indiceActual.toFixed(2)}</strong>. Para llegar necesitarías promediar{" "}
            <strong>{referenciaLetra(p.puntosPromedioPorCredito)}</strong> (
            {p.puntosPromedioPorCredito.toFixed(2)} puntos por crédito) en los{" "}
            <strong>{p.creditosRestantes}</strong> créditos que te faltan.
          </>
        )}
      </Aviso>
    );
  }

  return (
    <Aviso tono="rojo">
      ⚠ Ese objetivo ya no es alcanzable: aun sacando A en los {p.creditosRestantes} créditos que
      faltan, tu índice máximo sería <strong>{p.indiceMaximoAlcanzable.toFixed(2)}</strong>. Elige
      una meta hasta ahí para tener una referencia útil.
    </Aviso>
  );
}

function Aviso({
  tono,
  children,
}: {
  tono: "verde" | "ciruela" | "rojo" | "neutral";
  children: React.ReactNode;
}) {
  const estilo = {
    verde: "bg-verde-suave !text-verde-fuerte",
    ciruela: "bg-primary-100 !text-primary-ink",
    rojo: "bg-rojo-suave !text-rojo-fuerte",
    neutral: "bg-black/[0.05] !text-tinta",
  }[tono];
  return <p className={`text-14-normal rounded-xl px-4 py-3 ${estilo}`}>{children}</p>;
}
