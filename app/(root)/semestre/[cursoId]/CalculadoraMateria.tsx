"use client";

import { useEffect, useRef, useState } from "react";
import Calculadora from "@/components/calculadora/Calculadora";
import type { BorradorSeccion, NotaUI, SeccionUI } from "@/components/calculadora/tipos";
import { actualizarNota, guardarEsquema } from "./actions";
import type { SeccionData } from "./tipos";

type EstadoGuardado = "idle" | "guardando" | "guardado" | "error";

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
    setSecciones((prev) =>
      prev.map((s) =>
        s.id !== seccionId ? s : { ...s, notas: s.notas.map((n) => (n.id === notaId ? { ...n, ...cambio } : n)) },
      ),
    );
    const previo = timers.current.get(notaId);
    if (previo) clearTimeout(previo);
    timers.current.set(
      notaId,
      setTimeout(() => {
        timers.current.delete(notaId);
        let nota: NotaUI | undefined;
        for (const s of seccionesRef.current) {
          const f = s.notas.find((n) => n.id === notaId);
          if (f) {
            nota = f;
            break;
          }
        }
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
      let nota: NotaUI | undefined;
      for (const s of seccionesRef.current) {
        const f = s.notas.find((n) => n.id === id);
        if (f) {
          nota = f;
          break;
        }
      }
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
    />
  );
}
