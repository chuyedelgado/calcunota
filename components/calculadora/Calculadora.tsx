"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  APROBACION_FUNDAMENTAL,
  APROBACION_NORMAL,
  calcularEstadoMateria,
  formatearNota,
  nombreEvaluacion,
  notaALetra,
  proyectar,
  validarSecciones,
} from "@/lib/calculos";
import PanelObjetivo from "./PanelObjetivo";
import EditorSecciones from "./EditorSecciones";
import Ayuda from "./Ayuda";
import { EXPLICACIONES, type Explicacion } from "./explicaciones";
import {
  aEval,
  borradorAEval,
  esGrupo,
  pesoEfectivo,
  seccionesUIaBorrador,
  type BorradorSeccion,
  type NotaUI,
  type SeccionUI,
} from "./tipos";

const campo =
  "w-full border border-borde rounded-lg px-3 py-2 bg-superficie text-tinta " +
  "focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60";

// Las notas se muestran truncadas a entero (la UTP trunca); nunca con decimales.
const fmt = formatearNota;

// El motor consume el árbol; aEval lo espeja (y aplana solo internamente).
const toEval = aEval;

// Secciones hoja (las que tienen notas): las de nivel superior y las
// subsecciones de un laboratorio, cada una con su padre para dar contexto.
type Hoja = { seccion: SeccionUI; padre: SeccionUI | null };
function hojasDe(secciones: SeccionUI[]): Hoja[] {
  const out: Hoja[] = [];
  for (const s of secciones) {
    if (esGrupo(s)) for (const sub of s.subsecciones!) out.push({ seccion: sub, padre: s });
    else out.push({ seccion: s, padre: null });
  }
  return out;
}

// Actualiza una nota en el árbol, buscándola en secciones y subsecciones.
function actualizarNotaEnArbol(
  ss: SeccionUI[],
  seccionId: string,
  notaId: string,
  cambio: Partial<NotaUI>,
): SeccionUI[] {
  return ss.map((s) => {
    if (s.id === seccionId) {
      return { ...s, notas: s.notas.map((n) => (n.id === notaId ? { ...n, ...cambio } : n)) };
    }
    if (s.subsecciones && s.subsecciones.length > 0) {
      return {
        ...s,
        subsecciones: s.subsecciones.map((sub) =>
          sub.id === seccionId
            ? { ...sub, notas: sub.notas.map((n) => (n.id === notaId ? { ...n, ...cambio } : n)) }
            : sub,
        ),
      };
    }
    return s;
  });
}

function etiquetaNota(seccion: SeccionUI, nota: NotaUI, padre?: SeccionUI | null): string {
  const base = nota.descripcion?.trim()
    ? nota.descripcion.trim()
    : nombreEvaluacion(seccion.nombre, nota.orden, seccion.cantidad);
  return padre ? `${padre.nombre} · ${base}` : base;
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
  return <>{formatearNota(v)}</>;
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
  alertaGraduacion,
}: {
  secciones: SeccionUI[];
  fundamental: boolean;
  onEditarNota: (seccionId: string, notaId: string, cambio: Partial<NotaUI>) => void;
  onGuardarEsquema: (borrador: BorradorSeccion[]) => Promise<{ ok: boolean; error?: string }>;
  antesDeGuardarEsquema?: () => Promise<void>;
  indicador?: ReactNode;
  // Slot para la alerta de graduación del contexto de cuenta (/semestre). Si se
  // pasa (aunque sea null), reemplaza la alerta interna "camino a una D", que
  // solo se conserva para la calculadora pública /calcular.
  alertaGraduacion?: ReactNode;
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

  const hojas = hojasDe(secciones);
  const total = hojas.reduce((a, h) => a + h.seccion.notas.length, 0);
  const registradas = hojas.reduce((a, h) => a + h.seccion.notas.filter((n) => n.puntaje !== null).length, 0);
  const progreso = total === 0 ? 0 : (registradas / total) * 100;

  function primeraPendiente(ss: SeccionUI[]): NotaRef | null {
    for (const h of hojasDe(ss))
      for (const n of h.seccion.notas) if (n.puntaje === null) return { seccionId: h.seccion.id, notaId: n.id };
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

    const nuevas = actualizarNotaEnArbol(secciones, ref.seccionId, ref.notaId, { puntaje, puntajeMax, descripcion });
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

  const pendientes: { seccion: SeccionUI; padre: SeccionUI | null; nota: NotaUI }[] = [];
  const listas: { seccion: SeccionUI; padre: SeccionUI | null; nota: NotaUI }[] = [];
  for (const h of hojas)
    for (const n of h.seccion.notas)
      (n.puntaje === null ? pendientes : listas).push({ seccion: h.seccion, padre: h.padre, nota: n });

  const hojaAbierta = notaAbierta ? hojas.find((h) => h.seccion.id === notaAbierta.seccionId) : null;
  const seccionAbierta = hojaAbierta?.seccion ?? null;
  const notaAbiertaObj = seccionAbierta?.notas.find((n) => n.id === notaAbierta?.notaId);

  return (
    <div className="space-y-8">
      {indicador ? <div className="text-right h-5">{indicador}</div> : null}

      {/* Panel de resultados — "Nota actual" es la protagonista */}
      <div className="space-y-3">
        <div className="tarjeta-hero p-5">
          <p className="text-[11px] uppercase tracking-wide font-bold !text-black-300 inline-flex items-center gap-1.5">
            Nota actual <Ayuda explicacion={EXPLICACIONES.notaActual} />
          </p>
          <p className="text-[52px] leading-none font-extrabold tabular-nums mt-1 text-tinta">
            {fmt(estado.notaActual)}
            <span className="text-20-medium !text-black-300"> / 100</span>
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <TarjetaMini etiqueta="En juego" valor={fmt(estado.porcentajeRestante)} sufijo="pts" ayuda={EXPLICACIONES.enJuego} />
          <TarjetaMini etiqueta="Máxima" valor={fmt(estado.notaMaxima)} ayuda={EXPLICACIONES.notaMaxima} />
          <TarjetaMini
            etiqueta="Promedio"
            valor={estado.promedioParcial === null ? "—" : fmt(estado.promedioParcial)}
            ayuda={EXPLICACIONES.promedioActual}
          />
        </div>
      </div>

      {alertaGraduacion !== undefined
        ? alertaGraduacion
        : caminoADFundamental && (
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
          <div className="flex rounded-full overflow-hidden border border-borde bg-superficie text-14-normal">
            <button
              type="button"
              onClick={() => setModo("momento")}
              className={`px-3 py-1 transition-colors ${modo === "momento" ? "bg-primary !text-white" : "!text-black-300 hover:!text-tinta"}`}
            >
              Momento
            </button>
            <button
              type="button"
              onClick={() => setModo("lista")}
              className={`px-3 py-1 transition-colors ${modo === "lista" ? "bg-primary !text-white" : "!text-black-300 hover:!text-tinta"}`}
            >
              Lista
            </button>
          </div>
        </div>

        <p className="text-16-medium mb-2">
          {registradas} de {total} evaluaciones registradas
        </p>
        <div className="h-3 bg-primary-100 rounded-full overflow-hidden mb-5">
          <div className="h-full bg-primary rounded-full transition-all duration-200" style={{ width: `${progreso}%` }} />
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
                className="flex-1 border-2 border-borde !text-tinta bg-superficie rounded-xl py-3 text-16-medium font-semibold hover:border-primary/40 transition-colors"
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
                  {pendientes.map(({ seccion, padre, nota }) => (
                    <button
                      key={nota.id}
                      type="button"
                      onClick={() => setNotaAbierta({ seccionId: seccion.id, notaId: nota.id })}
                      className="text-left tarjeta p-4 hover:border-primary/40 transition-colors"
                    >
                      <p className="text-16-medium font-semibold">{etiquetaNota(seccion, nota, padre)}</p>
                      <p className="text-14-normal !text-black-300">sobre {nota.puntajeMax}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {listas.length > 0 && (
              <div>
                <p className="text-14-normal !text-black-300 mb-2">Registradas — toca para editar</p>
                <div className="flex flex-wrap gap-2">
                  {listas.map(({ seccion, padre, nota }) => (
                    <button
                      key={nota.id}
                      type="button"
                      onClick={() => setNotaAbierta({ seccionId: seccion.id, notaId: nota.id })}
                      className="border border-borde rounded-full px-3 py-1 text-14-normal !text-tinta bg-superficie hover:border-primary/40 transition-colors"
                    >
                      {etiquetaNota(seccion, nota, padre)}: <span className="font-bold">{nota.puntaje}</span>/
                      {nota.puntajeMax}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            {secciones.map((s) =>
              esGrupo(s) ? (
                <BloqueLaboratorio key={s.id} grupo={s} onEditarNota={onEditarNota} />
              ) : (
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
              ),
            )}
          </div>
        )}
      </div>

      <BloqueEsquema secciones={secciones} onGuardar={onGuardarEsquema} antesDeGuardar={antesDeGuardarEsquema} />

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

function TarjetaMini({
  etiqueta,
  valor,
  sufijo,
  ayuda,
}: {
  etiqueta: string;
  valor: string;
  sufijo?: string;
  ayuda?: Explicacion;
}) {
  return (
    <div className="tarjeta p-3 relative">
      <p className="text-[11px] uppercase tracking-wide font-bold !text-black-300 inline-flex items-center gap-1">
        {etiqueta}
        {ayuda && <Ayuda explicacion={ayuda} />}
      </p>
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
        <button type="button" onClick={() => setRenombrar((v) => !v)} className="text-14-normal !text-primary-ink underline">
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
      <div className="absolute inset-0 bg-tinta/40" onClick={onCerrar} />
      <div
        className={`relative w-full sm:max-w-md bg-superficie border-t border-hairline sm:border sm:border-hairline rounded-t-3xl sm:rounded-3xl shadow-hero p-6 transition-transform duration-200 ${
          visible ? "translate-y-0" : "translate-y-full sm:translate-y-3"
        }`}
      >
        <p className="text-24-black !p-0 !text-tinta">{desc.trim() || etiquetaAuto}</p>
        <p className="text-14-normal !text-black-300 mt-1">Escribe tu puntaje</p>

        <div className="flex items-end gap-3 mt-4">
          <input
            autoFocus
            type="number"
            inputMode="decimal"
            className="w-32 text-30-bold border border-borde rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60"
            value={puntajeStr}
            onChange={(e) => setPuntajeStr(e.target.value)}
            placeholder="—"
          />
          <span className="text-20-medium pb-3">/</span>
          <input
            type="number"
            inputMode="decimal"
            className="w-20 border border-borde rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60"
            value={maxStr}
            onChange={(e) => setMaxStr(e.target.value)}
          />
        </div>

        {!valido && <p className="text-14-normal !text-rojo-fuerte mt-2">Revisa el puntaje: 0 a {max || "?"}.</p>}

        {renombrar ? (
          <input className={`${campo} mt-4`} value={desc} placeholder={etiquetaAuto} onChange={(e) => setDesc(e.target.value)} />
        ) : (
          <button type="button" className="text-14-normal !text-primary-ink underline mt-4" onClick={() => setRenombrar(true)}>
            Renombrar evaluación
          </button>
        )}

        <div className="flex gap-3 mt-6">
          <button type="button" onClick={onCerrar} className="flex-1 border-2 border-borde !text-tinta bg-superficie rounded-xl py-3 text-16-medium font-semibold hover:border-primary/40 transition-colors">
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

// Bloque de captura de un laboratorio: agrupa sus subsecciones, muestra el
// profesor y el peso efectivo de cada una, y su nota parcial de laboratorio.
function BloqueLaboratorio({
  grupo,
  onEditarNota,
}: {
  grupo: SeccionUI;
  onEditarNota: (seccionId: string, notaId: string, cambio: Partial<NotaUI>) => void;
}) {
  const subs = grupo.subsecciones ?? [];
  // Nota parcial del bloque, en su propia escala 0-100 (independiente del 25%).
  const parcialLab = calcularEstadoMateria(
    subs.map((sub) => ({
      nombre: sub.nombre,
      porcentaje: sub.porcentaje,
      cantidad: sub.cantidad,
      notas: sub.notas.map((n) => ({ puntaje: n.puntaje, puntajeMax: n.puntajeMax })),
    })),
  ).notaActual;

  return (
    <div className="tarjeta p-4 border-primary/30">
      <div className="flex items-baseline justify-between mb-1">
        <p className="text-16-medium font-semibold">{grupo.nombre}</p>
        <p className="text-14-normal !text-black-300">{grupo.porcentaje}% de la materia</p>
      </div>
      <p className="text-14-normal !text-black-300 mb-3">
        {grupo.profesorNombre ? `Profesor: ${grupo.profesorNombre} · ` : ""}
        nota parcial del laboratorio <span className="font-bold tabular-nums text-tinta">{fmt(parcialLab)}</span>/100
      </p>
      <div className="space-y-4">
        {subs.map((sub) => (
          <div key={sub.id} className="rounded-xl bg-crema border border-hairline p-3">
            <div className="flex items-baseline justify-between mb-2">
              <p className="text-14-normal font-semibold text-tinta">{sub.nombre}</p>
              <p className="text-[11px] !text-black-300 tabular-nums">
                {Math.round(pesoEfectivo(grupo.porcentaje, sub.porcentaje) * 100) / 100}% de la nota final
              </p>
            </div>
            <div className="space-y-4">
              {sub.notas.map((n) => (
                <FilaCompacta key={n.id} seccion={sub} nota={n} onEdit={(c) => onEditarNota(sub.id, n.id, c)} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Editor de esquema completo (incluye subsecciones de laboratorio) en un
// desplegable. Usa el editor compartido y persiste el árbol.
function BloqueEsquema({
  secciones,
  onGuardar,
  antesDeGuardar,
}: {
  secciones: SeccionUI[];
  onGuardar: (borrador: BorradorSeccion[]) => Promise<{ ok: boolean; error?: string }>;
  antesDeGuardar?: () => Promise<void>;
}) {
  const [borrador, setBorrador] = useState<BorradorSeccion[]>(() => seccionesUIaBorrador(secciones));
  const [mensaje, setMensaje] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    setBorrador(seccionesUIaBorrador(secciones));
  }, [secciones]);

  const validacion = validarSecciones(borradorAEval(borrador));
  const estructuraOk =
    borrador.length > 0 &&
    borrador.every((s) =>
      s.nombre.trim() && s.porcentaje > 0 &&
      (esGrupo(s)
        ? (s.subsecciones ?? []).every((x) => x.nombre.trim() && x.porcentaje > 0 && x.cantidad >= 1)
        : Number.isInteger(s.cantidad) && s.cantidad >= 1),
    );

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
      <summary className="cursor-pointer select-none text-16-medium font-semibold p-4">
        Ajustar esquema de evaluación
      </summary>
      <div className="p-4 pt-0 space-y-3">
        <p className="text-14-normal !text-black-300">
          Pesos, número de notas y subsecciones. Al bajar la cantidad solo se eliminan notas vacías.
        </p>
        <EditorSecciones secciones={borrador} onChange={setBorrador} />
        {mensaje && <p className="text-14-normal !text-black-300">{mensaje}</p>}
        <Button
          type="button"
          className="calcular_btn w-full !text-[20px] !p-4"
          disabled={!validacion.valido || !estructuraOk || guardando}
          onClick={guardar}
        >
          {guardando ? "Guardando…" : "Guardar esquema"}
        </Button>
      </div>
    </details>
  );
}
