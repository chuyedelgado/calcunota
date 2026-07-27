"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  APROBACION_NORMAL,
  formatearNota,
  notaALetra,
  notaAPuntos,
  secuenciaDePeriodo,
  truncar,
  type TipoPeriodo,
} from "@/lib/calculos";
import { calcularIndiceDesdeCursos, type CursoParaIndice } from "@/lib/indice";
import { cerrarCurso, prepararCierre, retirarCurso, type DatosCierre } from "./actions";

export default function CierreCurso({
  cursoId,
  fundamental,
  materiaId,
  creditos,
  anio,
  tipo,
}: {
  cursoId: string;
  fundamental: boolean;
  materiaId: string;
  creditos: number;
  anio: number;
  tipo: TipoPeriodo;
}) {
  const [abierto, setAbierto] = useState(false);
  const [datos, setDatos] = useState<DatosCierre | null>(null);
  const [cargando, setCargando] = useState(false);
  const [notaStr, setNotaStr] = useState("");
  const [profesor, setProfesor] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  async function abrir() {
    setCargando(true);
    setError("");
    const d = await prepararCierre(cursoId);
    setCargando(false);
    if (!d.ok) {
      setError(d.error ?? "No se pudo preparar el cierre.");
      return;
    }
    setDatos(d);
    setNotaStr(d.propuesta !== null ? formatearNota(d.propuesta) : "");
    setProfesor("");
    setAbierto(true);
  }

  const nota = notaStr.trim() === "" ? null : Number(notaStr);
  const notaValida = nota !== null && Number.isFinite(nota) && nota >= 0 && nota <= 100;

  let vista: {
    antes: number;
    despues: number;
    letra: string;
    puntos: number;
    truncada: number;
    hayTrunc: boolean;
    estado: string;
    esD: boolean;
    dPrevia: DatosCierre["cursosCerrados"][number] | null;
  } | null = null;

  if (datos && notaValida && nota !== null) {
    const base: CursoParaIndice[] = datos.cursosCerrados.map((c) => ({
      id: c.id,
      materiaId: c.materiaId,
      creditos: c.creditos,
      notaFinal: c.notaFinal,
      periodo: { anio: c.anio, tipo: c.tipo },
    }));
    const antes = calcularIndiceDesdeCursos(base).indice;
    const hipotetico: CursoParaIndice = {
      id: cursoId,
      materiaId,
      creditos,
      notaFinal: nota,
      periodo: { anio, tipo },
    };
    const despues = calcularIndiceDesdeCursos([...base, hipotetico]).indice;

    // La D previa de la misma materia se borra al cerrar, si este intento es
    // posterior (secuencia mayor).
    const seqNueva = secuenciaDePeriodo(anio, tipo);
    const dPrevia =
      datos.cursosCerrados.find(
        (c) =>
          c.materiaId === materiaId &&
          notaALetra(c.notaFinal) === "D" &&
          secuenciaDePeriodo(c.anio, c.tipo) < seqNueva,
      ) ?? null;

    const truncada = truncar(nota);
    vista = {
      antes,
      despues,
      letra: notaALetra(nota),
      puntos: notaAPuntos(nota),
      truncada,
      hayTrunc: truncada !== nota,
      estado: nota >= APROBACION_NORMAL ? "APROBADO" : "REPROBADO",
      esD: notaALetra(nota) === "D",
      dPrevia,
    };
  }

  async function confirmar() {
    if (!notaValida || nota === null) return;
    setEnviando(true);
    const r = await cerrarCurso({ cursoId, notaFinal: nota, profesorNombre: profesor || null });
    // En éxito redirige; si vuelve, es error.
    if (!r.ok) {
      setEnviando(false);
      setError(r.error ?? "No se pudo cerrar.");
    }
  }

  async function retirar() {
    setEnviando(true);
    await retirarCurso(cursoId);
  }

  return (
    <div className="pt-4">
      <Button
        type="button"
        onClick={abrir}
        disabled={cargando}
        className="calcular_btn w-full !text-[20px] !p-4"
      >
        {cargando ? "Preparando…" : "Cerrar materia"}
      </Button>
      {error && !abierto && <p className="text-14-normal !text-red-600 mt-2">{error}</p>}

      {abierto && datos && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setAbierto(false)} />
          <div className="relative w-full sm:max-w-md max-h-[90vh] overflow-y-auto bg-white border-t-4 sm:border-4 border-black rounded-t-3xl sm:rounded-3xl p-6">
            <p className="text-24-black !p-0 !text-black">Cerrar materia</p>

            {datos.completa ? (
              <p className="text-14-normal !text-black-300 mt-1">
                Nota calculada desde tus evaluaciones. La oficial manda: edítala si tu profe curvó o
                redondeó.
              </p>
            ) : (
              <p className="text-14-normal !text-black-300 mt-1">
                Faltan evaluaciones por capturar, así que no proponemos una nota. Escribe la oficial.
              </p>
            )}

            <label className="block text-16-medium font-semibold mt-4 mb-1">Nota oficial</label>
            <input
              autoFocus
              type="number"
              inputMode="decimal"
              className="w-32 text-30-bold border-2 border-black rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-800"
              value={notaStr}
              onChange={(e) => setNotaStr(e.target.value)}
              placeholder="—"
            />

            {vista && (
              <div className="mt-4 space-y-3">
                {/* Truncamiento explícito */}
                <p className="text-20-medium">
                  {vista.hayTrunc ? (
                    <>
                      {nota} se trunca a <span className="font-bold">{vista.truncada}</span> →{" "}
                      <span className="font-bold">{vista.letra}</span>
                    </>
                  ) : (
                    <>
                      {vista.truncada} → <span className="font-bold">{vista.letra}</span>
                    </>
                  )}
                  <span className="text-14-normal !text-black-300"> · {vista.puntos} puntos · {vista.estado}</span>
                </p>

                {/* Fundamental + D */}
                {fundamental && vista.esD && (
                  <div className="border-4 border-black bg-secondary rounded-xl p-4">
                    <p className="text-16-medium font-bold">
                      Con esta D avanzas a las materias que la tienen de requisito, pero al ser
                      fundamental no puedes graduarte con ella hasta subirla a C.
                    </p>
                  </div>
                )}

                {/* Efecto en el índice */}
                {vista.dPrevia ? (
                  <div className="border-4 border-black bg-primary-100 rounded-xl p-4">
                    <p className="text-16-medium font-bold">
                      Cerrar esta materia elimina la D de {vista.dPrevia.periodoLabel} de tu índice:
                      sube de {vista.antes.toFixed(2)} a {vista.despues.toFixed(2)}.
                    </p>
                  </div>
                ) : (
                  <p className="text-16-medium">
                    Tu índice: <span className="font-semibold">{vista.antes.toFixed(2)}</span> →{" "}
                    <span className="font-bold">{vista.despues.toFixed(2)}</span>
                  </p>
                )}
              </div>
            )}

            {/* Profesor solo si falta */}
            {datos.profesorActual === null && (
              <div className="mt-4">
                <label className="block text-16-medium font-semibold mb-1">
                  Profesor <span className="text-black-300 font-normal">(opcional)</span>
                </label>
                <input
                  className="w-full border-2 border-black rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-800"
                  list="lista-profesores-cierre"
                  placeholder="¿Quién te dio la materia?"
                  value={profesor}
                  onChange={(e) => setProfesor(e.target.value)}
                  autoComplete="off"
                />
                <datalist id="lista-profesores-cierre">
                  {datos.profesores.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </div>
            )}

            {error && <p className="text-14-normal !text-red-600 mt-3">{error}</p>}

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => setAbierto(false)}
                className="flex-1 border-2 border-black rounded-xl py-3 text-16-medium font-semibold"
              >
                Cancelar
              </button>
              <Button
                type="button"
                disabled={!notaValida || enviando}
                className="calcular_btn flex-1 !text-[18px] !p-3"
                onClick={confirmar}
              >
                {enviando ? "Cerrando…" : "Confirmar cierre"}
              </Button>
            </div>

            <button
              type="button"
              onClick={retirar}
              disabled={enviando}
              className="w-full text-14-normal !text-red-600 underline mt-4"
            >
              Retirar la materia (sin nota)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
