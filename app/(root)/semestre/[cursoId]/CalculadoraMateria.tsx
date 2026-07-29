"use client";

import { useEffect, useRef, useState } from "react";
import Calculadora from "@/components/calculadora/Calculadora";
import type { BorradorSeccion, NotaUI, SeccionUI } from "@/components/calculadora/tipos";
import { actualizarNota, guardarEsquema } from "./actions";
import AlertaGraduacion from "./AlertaGraduacion";
import type { SeccionData } from "./tipos";

type EstadoGuardado = "idle" | "guardando" | "guardado" | "error";

// Busca una nota por id en el árbol (secciones y subsecciones de laboratorio).
function buscarNota(secciones: SeccionUI[], notaId: string): NotaUI | undefined {
  for (const s of secciones) {
    const propia = s.notas.find((n) => n.id === notaId);
    if (propia) return propia;
    for (const sub of s.subsecciones ?? []) {
      const f = sub.notas.find((n) => n.id === notaId);
      if (f) return f;
    }
  }
  return undefined;
}

// Envoltura interna: dueña del estado y de la PERSISTENCIA (por Curso). La UI de
// captura vive en el componente compartido <Calculadora> (mismo que la pública).
export default function CalculadoraMateria({
  cursoId,
  fundamental,
  seccionesIniciales,
}: {
  cursoId: string;
  fundamental: boolean;
  seccionesIniciales: SeccionData[];
}) {
  const [secciones, setSecciones] = useState<SeccionUI[]>(seccionesIniciales);
  const [guardado, setGuardado] = useState<EstadoGuardado>("idle");

  const seccionesRef = useRef(secciones);
  useEffect(() => {
    seccionesRef.current = secciones;
  }, [secciones]);

  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  useEffect(() => {
    const mapa = timers.current;
    return () => {
      for (const t of mapa.values()) clearTimeout(t);
    };
  }, []);

  async function persistir(notaId: string, puntaje: number | null, puntajeMax: number, descripcion: string | null) {
    if (!(puntajeMax > 0) || (puntaje !== null && (puntaje < 0 || puntaje > puntajeMax))) {
      setGuardado("error");
      return;
    }
    setGuardado("guardando");
    const r = await actualizarNota({ notaId, puntaje, puntajeMax, descripcion });
    setGuardado(r.ok ? "guardado" : "error");
  }

  function editarNota(seccionId: string, notaId: string, cambio: Partial<NotaUI>) {
    // El id de sección puede ser de una subsección (laboratorio): se busca en
    // ambos niveles.
    const actualizar = (s: SeccionUI): SeccionUI =>
      s.id === seccionId
        ? { ...s, notas: s.notas.map((n) => (n.id === notaId ? { ...n, ...cambio } : n)) }
        : s.subsecciones
          ? {
              ...s,
              subsecciones: s.subsecciones.map((sub) =>
                sub.id === seccionId
                  ? { ...sub, notas: sub.notas.map((n) => (n.id === notaId ? { ...n, ...cambio } : n)) }
                  : sub,
              ),
            }
          : s;
    setSecciones((prev) => prev.map(actualizar));
    const previo = timers.current.get(notaId);
    if (previo) clearTimeout(previo);
    timers.current.set(
      notaId,
      setTimeout(() => {
        timers.current.delete(notaId);
        const nota = buscarNota(seccionesRef.current, notaId);
        if (nota) void persistir(notaId, nota.puntaje, nota.puntajeMax, nota.descripcion);
      }, 600),
    );
  }

  async function vaciarPendientes() {
    const ids = [...timers.current.keys()];
    for (const id of ids) {
      const t = timers.current.get(id);
      if (t) clearTimeout(t);
      timers.current.delete(id);
      const nota = buscarNota(seccionesRef.current, id);
      if (nota) await persistir(id, nota.puntaje, nota.puntajeMax, nota.descripcion);
    }
  }

  async function onGuardarEsquema(borrador: BorradorSeccion[]) {
    const r = await guardarEsquema(cursoId, borrador);
    if (r.ok && r.secciones) setSecciones(r.secciones);
    return { ok: r.ok, error: r.error };
  }

  const indicador =
    guardado === "guardando" ? (
      <span className="text-14-normal !text-black-300">Guardando…</span>
    ) : guardado === "guardado" ? (
      <span className="text-14-normal !text-verde-fuerte">Guardado ✓</span>
    ) : guardado === "error" ? (
      <span className="text-14-normal !text-rojo-fuerte">No se pudo guardar</span>
    ) : null;

  return (
    <Calculadora
      secciones={secciones}
      fundamental={fundamental}
      onEditarNota={editarNota}
      onGuardarEsquema={onGuardarEsquema}
      antesDeGuardarEsquema={vaciarPendientes}
      indicador={indicador}
      alertaGraduacion={<AlertaGraduacion secciones={secciones} fundamental={fundamental} />}
    />
  );
}
