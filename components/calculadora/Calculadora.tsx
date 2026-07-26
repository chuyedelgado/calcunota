"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  APROBACION_FUNDAMENTAL,
  APROBACION_NORMAL,
  calcularEstadoMateria,
  nombreEvaluacion,
  notaALetra,
  proyectar,
  validarSecciones,
  type SeccionEvaluacion,
} from "@/lib/calculos";
import PanelObjetivo from "./PanelObjetivo";
import type { BorradorSeccion, NotaUI, SeccionUI } from "./tipos";

const campo =
  "w-full border-2 border-black rounded-lg px-3 py-2 bg-white text-black " +
  "focus:outline-none focus:ring-2 focus:ring-blue-800";

const fmt = (n: number) => n.toFixed(1);

function toEval(secciones: SeccionUI[]): SeccionEvaluacion[] {
  return secciones.map((s) => ({
    nombre: s.nombre,
    porcentaje: s.porcentaje,
    cantidad: s.cantidad,
    notas: s.notas.map((n) => ({ puntaje: n.puntaje, puntajeMax: n.puntajeMax })),
  }));
}

function etiquetaNota(seccion: SeccionUI, nota: NotaUI): string {
  return nota.descripcion?.trim()
    ? nota.descripcion.trim()
    : nombreEvaluacion(seccion.nombre, nota.orden, seccion.cantidad);
}

// Color semántico consistente: verde asegurado, ámbar exigente, rojo bloqueo.
function NumeroAnimado({ from, to, duracion = 250 }: { from: number; to: number; duracion?: number }) {
  const [v, setV] = useState(from);
  useEffect(() => {
    let raf = 0;
    const inicio = performance.now();
    const paso = (t: number) => {
      const p = Math.min(1, (t - inicio) / duracion);
      setV(from + (to - from) * p);
      if (p < 1) raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [from, to, duracion]);
  return <>{v.toFixed(1)}</>;
}

type NotaRef = { seccionId: string; notaId: string };
type Efecto = { antes: number; despues: number; umbralMensaje: string | null; siguiente: NotaRef | null };

export default function Calculadora({
  secciones,
  fundamental,
  onEditarNota,
  onGuardarEsquema,
  antesDeGuardarEsquema,
  indicador,
}: {
  secciones: SeccionUI[];
  fundamental: boolean;
  onEditarNota: (seccionId: string, notaId: string, cambio: Partial<NotaUI>) => void;
  onGuardarEsquema: (borrador: BorradorSeccion[]) => Promise<{ ok: boolean; error?: string }>;
  antesDeGuardarEsquema?: () => Promise<void>;
  indicador?: ReactNode;
}) {
  const [modo, setModo] = useState<"momento" | "lista">("momento");
  const [notaAbierta, setNotaAbierta] = useState<NotaRef | null>(null);
  const [efecto, setEfecto] = useState<Efecto | null>(null);

  useEffect(() => {
    if (!efecto) return;
    const t = setTimeout(() => setEfecto(null), 6000);
    return () => clearTimeout(t);
  }, [efecto]);

  const seccionesEval = toEval(secciones);
  const estado = calcularEstadoMateria(seccionesEval);

  const objetivoAprobar = fundamental ? APROBACION_FUNDAMENTAL : APROBACION_NORMAL;
  const umbralesMomento = fundamental ? [71, 81, 91] : [APROBACION_NORMAL, 71, 81, 91];

  const proyC = proyectar(seccionesEval, APROBACION_FUNDAMENTAL);
  const caminoADFundamental =
    fundamental && !proyC.alcanzable && !proyC.yaAlcanzado && estado.notaMaxima >= APROBACION_NORMAL;

  const total = secciones.reduce((a, s) => a + s.notas.length, 0);
  const registradas = secciones.reduce((a, s) => a + s.notas.filter((n) => n.puntaje !== null).length, 0);
  const progreso = total === 0 ? 0 : (registradas / total) * 100;

  function primeraPendiente(ss: SeccionUI[]): NotaRef | null {
    for (const s of ss) for (const n of s.notas) if (n.puntaje === null) return { seccionId: s.id, notaId: n.id };
    return null;
  }
  function mensajeUmbral(valor: number): string {
    if (valor === APROBACION_NORMAL) return "Ya tienes el aprobado asegurado, pase lo que pase.";
    return `Ya tienes la ${notaALetra(valor)} asegurada, pase lo que pase.`;
  }

  function confirmarDesdeHoja(ref: NotaRef, puntaje: number | null, puntajeMax: number, descripcion: string | null) {
    const evalAntes = toEval(secciones);
    const antes = calcularEstadoMateria(evalAntes).notaActual;
    const aseguradosAntes = new Set(umbralesMomento.filter((o) => proyectar(evalAntes, o).yaAlcanzado));

    const nuevas = secciones.map((s) =>
      s.id !== ref.seccionId
        ? s
        : { ...s, notas: s.notas.map((n) => (n.id === ref.notaId ? { ...n, puntaje, puntajeMax, descripcion } : n)) },
    );
    const evalDespues = toEval(nuevas);
    const despues = calcularEstadoMateria(evalDespues).notaActual;
    const nuevoUmbral = umbralesMomento
      .filter((o) => !aseguradosAntes.has(o) && proyectar(evalDespues, o).yaAlcanzado)
      .at(-1);

    onEditarNota(ref.seccionId, ref.notaId, { puntaje, puntajeMax, descripcion });
    setNotaAbierta(null);
    setEfecto({
      antes,
      despues,
      umbralMensaje: nuevoUmbral != null ? mensajeUmbral(nuevoUmbral) : null,
      siguiente: primeraPendiente(nuevas),
    });
  }

  const pendientes: { seccion: SeccionUI; nota: NotaUI }[] = [];
  const listas: { seccion: SeccionUI; nota: NotaUI }[] = [];
  for (const s of secciones) for (const n of s.notas) (n.puntaje === null ? pendientes : listas).push({ seccion: s, nota: n });

  const seccionAbierta = notaAbierta && secciones.find((s) => s.id === notaAbierta.seccionId);
  const notaAbiertaObj = seccionAbierta?.notas.find((n) => n.id === notaAbierta?.notaId);

  return (
    <div className="space-y-8">
      {indicador ? <div className="text-right h-5">{indicador}</div> : null}

      {/* Panel de resultados — "Nota actual" es la protagonista */}
      <div className="space-y-3">
        <div className="tarjeta-hero p-5">
          <p className="text-[11px] uppercase tracking-wide font-bold !text-black-300">Nota actual</p>
          <p className="text-[52px] leading-none font-extrabold tabular-nums mt-1 text-tinta">
            {fmt(estado.notaActual)}
            <span className="text-20-medium !text-black-300"> / 100</span>
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <TarjetaMini etiqueta="En juego" valor={fmt(estado.porcentajeRestante)} sufijo="pts" />
          <TarjetaMini etiqueta="Máxima" valor={fmt(estado.notaMaxima)} />
          <TarjetaMini
            etiqueta="Promedio"
            valor={estado.promedioParcial === null ? "—" : fmt(estado.promedioParcial)}
          />
        </div>
      </div>

      {caminoADFundamental && (
        <div className="bg-ambar-suave border-2 border-ambar-fuerte/40 rounded-2xl p-5 shadow-suave">
          <p className="text-20-medium font-bold !text-ambar-fuerte">⚠ Vas camino a una D</p>
          <p className="text-16-medium mt-2">
            Esta materia es fundamental. Con una D avanzas, pero necesitas al menos{" "}
            <span className="font-bold">71 (C)</span> para graduarte con ella.
          </p>
        </div>
      )}

      <PanelObjetivo seccionesEval={seccionesEval} objetivoAprobar={objetivoAprobar} fundamental={fundamental} />

      {/* Captura */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-20-medium font-semibold">Registrar notas</h2>
          <div className="flex border-2 border-black rounded-full overflow-hidden text-14-normal">
            <button
              type="button"
              onClick={() => setModo("momento")}
              className={`px-3 py-1 ${modo === "momento" ? "bg-black !text-white" : "!text-black"}`}
            >
              Momento
            </button>
            <button
              type="button"
              onClick={() => setModo("lista")}
              className={`px-3 py-1 ${modo === "lista" ? "bg-black !text-white" : "!text-black"}`}
            >
              Lista
            </button>
          </div>
        </div>

        <p className="text-16-medium mb-2">
          {registradas} de {total} evaluaciones registradas
        </p>
        <div className="h-3 bg-gray-200 rounded-full overflow-hidden mb-5">
          <div className="h-full bg-blue-800 rounded-full transition-all duration-200" style={{ width: `${progreso}%` }} />
        </div>

        {efecto && (
          <div className="bg-primary-100 border-2 border-primary/30 rounded-2xl p-5 shadow-hero mb-5">
            {efecto.umbralMensaje ? (
              <p className="text-20-medium font-bold text-verde-fuerte">✓ {efecto.umbralMensaje}</p>
            ) : (
              <p className="text-20-medium">
                Tu nota asegurada {efecto.despues >= efecto.antes ? "subió" : "bajó"} de {fmt(efecto.antes)} a{" "}
                <span className="font-bold">
                  <NumeroAnimado from={efecto.antes} to={efecto.despues} />
                </span>
              </p>
            )}
            <div className="flex gap-3 mt-4">
              {efecto.siguiente && (
                <Button
                  type="button"
                  className="calcular_btn flex-1 !text-[18px] !p-3"
                  onClick={() => {
                    const s = efecto.siguiente;
                    setEfecto(null);
                    setNotaAbierta(s);
                  }}
                >
                  Registrar la siguiente
                </Button>
              )}
              <button
                type="button"
                onClick={() => setEfecto(null)}
                className="flex-1 border-2 border-black rounded-xl py-3 text-16-medium font-semibold"
              >
                Listo
              </button>
            </div>
          </div>
        )}

        {modo === "momento" ? (
          <div className="space-y-5">
            {pendientes.length === 0 ? (
              <p className="text-16-medium text-black-300">Registraste todas las evaluaciones.</p>
            ) : (
              <div>
                <p className="text-14-normal !text-black-300 mb-2">Pendientes — toca para registrar</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {pendientes.map(({ seccion, nota }) => (
                    <button
                      key={nota.id}
                      type="button"
                      onClick={() => setNotaAbierta({ seccionId: seccion.id, notaId: nota.id })}
                      className="text-left tarjeta p-4 hover:border-primary/40 transition-colors"
                    >
                      <p className="text-16-medium font-semibold">{etiquetaNota(seccion, nota)}</p>
                      <p className="text-14-normal !text-black-300">
                        {seccion.nombre} · sobre {nota.puntajeMax}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {listas.length > 0 && (
              <div>
                <p className="text-14-normal !text-black-300 mb-2">Registradas — toca para editar</p>
                <div className="flex flex-wrap gap-2">
                  {listas.map(({ seccion, nota }) => (
                    <button
                      key={nota.id}
                      type="button"
                      onClick={() => setNotaAbierta({ seccionId: seccion.id, notaId: nota.id })}
                      className="border-2 border-black rounded-full px-3 py-1 text-14-normal !text-black bg-white"
                    >
                      {etiquetaNota(seccion, nota)}: <span className="font-bold">{nota.puntaje}</span>/{nota.puntajeMax}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            {secciones.map((s) => (
              <div key={s.id} className="tarjeta p-4">
                <div className="flex items-baseline justify-between mb-3">
                  <p className="text-16-medium font-semibold">{s.nombre}</p>
                  <p className="text-14-normal !text-black-300">{s.porcentaje}%</p>
                </div>
                <div className="space-y-4">
                  {s.notas.map((n) => (
                    <FilaCompacta key={n.id} seccion={s} nota={n} onEdit={(c) => onEditarNota(s.id, n.id, c)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <EditorEsquema secciones={secciones} onGuardar={onGuardarEsquema} antesDeGuardar={antesDeGuardarEsquema} />

      {notaAbierta && seccionAbierta && notaAbiertaObj && (
        <HojaNota
          etiquetaAuto={nombreEvaluacion(seccionAbierta.nombre, notaAbiertaObj.orden, seccionAbierta.cantidad)}
          nota={notaAbiertaObj}
          onCerrar={() => setNotaAbierta(null)}
          onConfirmar={(p, m, d) => confirmarDesdeHoja(notaAbierta, p, m, d)}
        />
      )}
    </div>
  );
}

function TarjetaMini({ etiqueta, valor, sufijo }: { etiqueta: string; valor: string; sufijo?: string }) {
  return (
    <div className="tarjeta p-3">
      <p className="text-[11px] uppercase tracking-wide font-bold !text-black-300">{etiqueta}</p>
      <p className="text-[24px] font-bold leading-tight tabular-nums mt-0.5">
        {valor}
        {sufijo ? <span className="text-14-normal !text-black-300"> {sufijo}</span> : null}
      </p>
    </div>
  );
}

function FilaCompacta({
  seccion,
  nota,
  onEdit,
}: {
  seccion: SeccionUI;
  nota: NotaUI;
  onEdit: (cambio: Partial<NotaUI>) => void;
}) {
  const [renombrar, setRenombrar] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-16-medium font-medium">{etiquetaNota(seccion, nota)}</span>
        <button type="button" onClick={() => setRenombrar((v) => !v)} className="text-14-normal !text-blue-800 underline">
          renombrar
        </button>
      </div>
      {renombrar && (
        <input
          className={campo}
          value={nota.descripcion ?? ""}
          placeholder={nombreEvaluacion(seccion.nombre, nota.orden, seccion.cantidad)}
          onChange={(e) => onEdit({ descripcion: e.target.value === "" ? null : e.target.value })}
        />
      )}
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          className={`${campo} w-24`}
          placeholder="—"
          value={nota.puntaje ?? ""}
          min={0}
          max={nota.puntajeMax}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") return onEdit({ puntaje: null });
            const v = Number(raw);
            if (!Number.isNaN(v)) onEdit({ puntaje: v });
          }}
        />
        <span className="text-16-medium">/</span>
        <input
          type="number"
          inputMode="decimal"
          className={`${campo} w-20`}
          value={nota.puntajeMax}
          min={1}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v) && v > 0) onEdit({ puntajeMax: v });
          }}
        />
      </div>
    </div>
  );
}

function HojaNota({
  etiquetaAuto,
  nota,
  onConfirmar,
  onCerrar,
}: {
  etiquetaAuto: string;
  nota: NotaUI;
  onConfirmar: (puntaje: number | null, puntajeMax: number, descripcion: string | null) => void;
  onCerrar: () => void;
}) {
  const [puntajeStr, setPuntajeStr] = useState(nota.puntaje === null ? "" : String(nota.puntaje));
  const [maxStr, setMaxStr] = useState(String(nota.puntajeMax));
  const [desc, setDesc] = useState(nota.descripcion ?? "");
  const [renombrar, setRenombrar] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const max = Number(maxStr);
  const puntaje = puntajeStr === "" ? null : Number(puntajeStr);
  const valido = max > 0 && (puntaje === null || (Number.isFinite(puntaje) && puntaje >= 0 && puntaje <= max));

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCerrar} />
      <div
        className={`relative w-full sm:max-w-md bg-white border-t-4 sm:border-4 border-black rounded-t-3xl sm:rounded-3xl p-6 transition-transform duration-200 ${
          visible ? "translate-y-0" : "translate-y-full sm:translate-y-3"
        }`}
      >
        <p className="text-24-black !p-0 !text-black">{desc.trim() || etiquetaAuto}</p>
        <p className="text-14-normal !text-black-300 mt-1">Escribe tu puntaje</p>

        <div className="flex items-end gap-3 mt-4">
          <input
            autoFocus
            type="number"
            inputMode="decimal"
            className="w-32 text-30-bold border-2 border-black rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-800"
            value={puntajeStr}
            onChange={(e) => setPuntajeStr(e.target.value)}
            placeholder="—"
          />
          <span className="text-20-medium pb-3">/</span>
          <input
            type="number"
            inputMode="decimal"
            className="w-20 border-2 border-black rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-800"
            value={maxStr}
            onChange={(e) => setMaxStr(e.target.value)}
          />
        </div>

        {!valido && <p className="text-14-normal !text-rojo-fuerte mt-2">Revisa el puntaje: 0 a {max || "?"}.</p>}

        {renombrar ? (
          <input className={`${campo} mt-4`} value={desc} placeholder={etiquetaAuto} onChange={(e) => setDesc(e.target.value)} />
        ) : (
          <button type="button" className="text-14-normal !text-blue-800 underline mt-4" onClick={() => setRenombrar(true)}>
            Renombrar evaluación
          </button>
        )}

        <div className="flex gap-3 mt-6">
          <button type="button" onClick={onCerrar} className="flex-1 border-2 border-black rounded-xl py-3 text-16-medium font-semibold">
            Cancelar
          </button>
          <Button
            type="button"
            disabled={!valido}
            className="calcular_btn flex-1 !text-[18px] !p-3"
            onClick={() => valido && onConfirmar(puntaje, max, desc.trim() ? desc.trim() : null)}
          >
            Guardar
          </Button>
        </div>
      </div>
    </div>
  );
}

function EditorEsquema({
  secciones,
  onGuardar,
  antesDeGuardar,
}: {
  secciones: SeccionUI[];
  onGuardar: (borrador: BorradorSeccion[]) => Promise<{ ok: boolean; error?: string }>;
  antesDeGuardar?: () => Promise<void>;
}) {
  const aBorrador = (ss: SeccionUI[]): BorradorSeccion[] =>
    ss.map((s) => ({ id: s.id, nombre: s.nombre, porcentaje: s.porcentaje, cantidad: s.cantidad }));

  const [borrador, setBorrador] = useState<BorradorSeccion[]>(() => aBorrador(secciones));
  const [mensaje, setMensaje] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    setBorrador(aBorrador(secciones));
  }, [secciones]);

  const validacion = validarSecciones(borrador.map((s) => ({ nombre: s.nombre, porcentaje: s.porcentaje, cantidad: s.cantidad, notas: [] })));
  const camposOk = borrador.every((s) => s.nombre.trim() && s.porcentaje > 0 && Number.isInteger(s.cantidad) && s.cantidad >= 1);

  function set(i: number, cambio: Partial<BorradorSeccion>) {
    setBorrador((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...cambio } : s)));
  }
  function quitar(i: number) {
    setBorrador((prev) => prev.filter((_, idx) => idx !== i));
  }
  function agregar() {
    setBorrador((prev) => [...prev, { id: `nueva-${Date.now()}-${prev.length}`, nombre: "", porcentaje: 0, cantidad: 1 }]);
  }

  async function guardar() {
    setGuardando(true);
    setMensaje("");
    if (antesDeGuardar) await antesDeGuardar();
    const r = await onGuardar(borrador);
    setGuardando(false);
    setMensaje(r.ok ? "Esquema actualizado ✓" : r.error ?? "No se pudo guardar el esquema.");
  }

  return (
    <details className="tarjeta">
      <summary className="cursor-pointer select-none text-16-medium font-semibold p-4">Ajustar esquema de evaluación</summary>
      <div className="p-4 pt-0 space-y-3">
        <p className="text-14-normal !text-black-300">
          Pesos y número de notas. Al bajar la cantidad solo se eliminan notas vacías.
        </p>
        {borrador.map((s, i) => (
          <div key={s.id} className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[140px]">
              <span className="block text-14-normal !text-black-300 mb-1">Sección</span>
              <input className={campo} value={s.nombre} onChange={(e) => set(i, { nombre: e.target.value })} />
            </div>
            <div className="w-20">
              <span className="block text-14-normal !text-black-300 mb-1">%</span>
              <input type="number" className={campo} value={s.porcentaje} min={0} onChange={(e) => set(i, { porcentaje: Number(e.target.value) })} />
            </div>
            <div className="w-20">
              <span className="block text-14-normal !text-black-300 mb-1"># notas</span>
              <input type="number" className={campo} value={s.cantidad} min={1} onChange={(e) => set(i, { cantidad: Number(e.target.value) })} />
            </div>
            <button type="button" onClick={() => quitar(i)} className="text-16-medium font-semibold text-rojo-fuerte pb-2 px-1" aria-label="Quitar">
              ✕
            </button>
          </div>
        ))}

        <button type="button" onClick={agregar} className="text-16-medium font-semibold text-blue-800 underline">
          + Agregar sección
        </button>

        <p className={`text-16-medium font-semibold ${validacion.valido ? "text-verde-fuerte" : "text-rojo-fuerte"}`}>
          {validacion.valido
            ? "Suman 100% ✓"
            : validacion.diferencia > 0
              ? `Suman ${validacion.suma}% · faltan ${validacion.diferencia}%`
              : `Suman ${validacion.suma}% · sobran ${Math.abs(validacion.diferencia)}%`}
        </p>

        {mensaje && <p className="text-14-normal !text-black-300">{mensaje}</p>}

        <Button
          type="button"
          className="calcular_btn w-full !text-[20px] !p-4"
          disabled={!validacion.valido || !camposOk || guardando}
          onClick={guardar}
        >
          {guardando ? "Guardando…" : "Guardar esquema"}
        </Button>
      </div>
    </details>
  );
}
