"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  calcularEstadoMateria,
  formatearNota,
  nombreEvaluacion,
  validarSecciones,
} from "@/lib/calculos";
import PanelObjetivo from "@/components/calculadora/PanelObjetivo";
import Ayuda from "@/components/calculadora/Ayuda";
import { EXPLICACIONES } from "@/components/calculadora/explicaciones";
import {
  CLAVE_MATERIA_PUBLICA,
  aEval,
  esGrupo,
  pesoEfectivo,
  plantillaConLaboratorio,
  plantillaInicial,
  type NotaUI,
  type SeccionUI,
} from "@/components/calculadora/tipos";
import { buscar as buscarTexto, normalizar } from "@/lib/texto";
import { iniciarSesion } from "../nav-actions";
import { buscarMateriasPublico, buscarProfesoresPublico } from "./actions";

const campo =
  "w-full border border-borde rounded-xl px-3 py-2.5 bg-white text-tinta " +
  "focus:outline-none focus:ring-2 focus:ring-primary/40";

const COLORES_SEG = ["#6E3E58", "#834D6B", "#9A5E7C", "#5A2F46", "#8F5878", "#A9708F", "#673A55"];

const toEval = aEval;

// Notas vacías para una (sub)sección de la calculadora pública.
function notasVaciasUI(prefijo: string, cantidad: number): NotaUI[] {
  return Array.from({ length: cantidad }, (_, i) => ({
    id: `${prefijo}-n${i + 1}-${Math.round(performance.now())}-${i}`,
    orden: i + 1,
    descripcion: null,
    puntaje: null,
    puntajeMax: 100,
  }));
}

// Notas truncadas a entero (la UTP trunca); nunca con decimales.
const fmt = formatearNota;

// ---- Combobox: elegir de la lista o escribir libre ----
function Combobox({
  id,
  valor,
  onChange,
  placeholder,
  opciones,
  buscar,
  disabled = false,
}: {
  id: string;
  valor: string;
  onChange: (v: string) => void;
  placeholder: string;
  opciones?: string[];
  buscar?: (q: string) => Promise<string[]>;
  disabled?: boolean;
}) {
  const [sug, setSug] = useState<string[]>([]);
  const [abierto, setAbierto] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onInput(v: string) {
    onChange(v);
    if (opciones) {
      const q = v.trim();
      setSug((q ? buscarTexto(opciones, q, (o) => o) : opciones).slice(0, 8));
      setAbierto(true);
    } else if (buscar) {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        setSug(await buscar(v));
        setAbierto(true);
      }, 250);
    }
  }

  return (
    <div className="relative">
      <input
        id={id}
        className={`${campo} ${disabled ? "bg-crema/70 text-black-300 cursor-not-allowed" : ""}`}
        value={valor}
        placeholder={placeholder}
        autoComplete="off"
        disabled={disabled}
        onChange={(e) => onInput(e.target.value)}
        onFocus={() => {
          if (disabled) return;
          if (opciones) {
            setSug(opciones.slice(0, 8));
            setAbierto(true);
          }
        }}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
      />
      {abierto && sug.length > 0 && (
        <ul className="absolute z-20 left-0 right-0 mt-1 tarjeta max-h-56 overflow-y-auto py-1">
          {sug.map((s) => (
            <li key={s}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-16-medium hover:bg-primary-100"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(s);
                  setAbierto(false);
                }}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---- Barra de pesos: un solo control, siempre suma 100 ----
function BarraPesos({
  nombres,
  porcentajes,
  onChange,
}: {
  nombres: string[];
  porcentajes: number[];
  onChange: (next: number[]) => void;
}) {
  const barra = useRef<HTMLDivElement>(null);
  const arrastrando = useRef<number | null>(null);
  const MIN = 1;

  function moverDivisor(d: number, nuevoBoundary: number) {
    const cumBefore = porcentajes.slice(0, d).reduce((a, b) => a + b, 0);
    const par = porcentajes[d] + porcentajes[d + 1];
    let nd = Math.round(nuevoBoundary - cumBefore);
    nd = Math.max(MIN, Math.min(par - MIN, nd));
    const next = [...porcentajes];
    next[d] = nd;
    next[d + 1] = par - nd;
    onChange(next);
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = arrastrando.current;
    if (d === null || !barra.current) return;
    const rect = barra.current.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    moverDivisor(d, frac * 100);
  }

  function repartirDesde(i: number, vRaw: number) {
    const n = porcentajes.length;
    let v = Math.round(vRaw);
    v = Math.max(1, Math.min(100 - (n - 1), v));
    const sumaOtros = porcentajes.reduce((a, p, idx) => (idx === i ? a : a + p), 0);
    const restante = 100 - v;
    const next = porcentajes.map((p, idx) => {
      if (idx === i) return v;
      const base = sumaOtros > 0 ? (p / sumaOtros) * restante : restante / (n - 1);
      return Math.max(1, Math.round(base));
    });
    const total = next.reduce((a, b) => a + b, 0);
    if (total !== 100) {
      let idxAj = -1;
      let maxv = -1;
      next.forEach((p, idx) => {
        if (idx !== i && p > maxv) {
          maxv = p;
          idxAj = idx;
        }
      });
      if (idxAj >= 0) next[idxAj] = Math.max(1, next[idxAj] + (100 - total));
    }
    onChange(next);
  }

  function equitativo() {
    const n = porcentajes.length;
    const base = Math.floor(100 / n);
    const next = Array(n).fill(base);
    next[0] += 100 - base * n;
    onChange(next);
  }

  let acumulado = 0;

  return (
    <div>
      <div
        ref={barra}
        className="relative flex h-14 rounded-2xl overflow-hidden shadow-suave select-none"
        onPointerMove={onPointerMove}
        onPointerUp={() => (arrastrando.current = null)}
      >
        {porcentajes.map((p, i) => {
          const izquierda = acumulado;
          acumulado += p;
          return (
            <div
              key={i}
              className="relative flex flex-col items-center justify-center text-white text-center overflow-hidden px-1"
              style={{ width: `${p}%`, background: COLORES_SEG[i % COLORES_SEG.length] }}
            >
              <span className="text-[11px] font-semibold leading-tight truncate max-w-full drop-shadow-sm">
                {nombres[i] || "—"}
              </span>
              <span className="text-14-normal !text-white font-bold tabular-nums drop-shadow-sm">{p}%</span>
              {i < porcentajes.length - 1 && (
                <button
                  type="button"
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={`Ajustar el peso entre ${nombres[i] || "sección"} y ${nombres[i + 1] || "siguiente"}`}
                  aria-valuemin={MIN}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(izquierda + p)}
                  tabIndex={0}
                  onPointerDown={(e) => {
                    arrastrando.current = i;
                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
                      e.preventDefault();
                      moverDivisor(i, izquierda + p + 1);
                    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
                      e.preventDefault();
                      moverDivisor(i, izquierda + p - 1);
                    }
                  }}
                  className="absolute right-0 top-0 bottom-0 w-3 translate-x-1/2 cursor-ew-resize touch-none z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white flex items-center justify-center"
                >
                  <span className="w-0.5 h-6 rounded bg-white/80" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between mt-2">
        <span className="text-14-normal !text-black-300">Arrastra un divisor · siempre suma 100%</span>
        <button type="button" onClick={equitativo} className="text-14-normal !text-primary-ink font-semibold underline">
          Repartir equitativo
        </button>
      </div>

      {/* Alternativa numérica: los porcentajes en una fila, alineados con la barra.
          En móvil envuelven a dos columnas en vez de apilarse en una sola. */}
      <div className="mt-4">
        <p className="text-14-normal !text-black-300 font-semibold mb-2">O escribe los porcentajes directamente</p>
        <div className="flex flex-wrap gap-2">
          {porcentajes.map((p, i) => (
            <div key={i} className="flex-1 basis-[calc(50%-0.25rem)] sm:basis-0 min-w-[76px]">
              <label htmlFor={`pct-${i}`} className="block text-[11px] !text-black-300 truncate mb-1">
                {nombres[i] || `Sección ${i + 1}`}
              </label>
              <div className="relative">
                <input
                  id={`pct-${i}`}
                  type="number"
                  min={1}
                  max={100}
                  value={p}
                  onChange={(e) => repartirDesde(i, Number(e.target.value))}
                  aria-label={`Peso de ${nombres[i] || `sección ${i + 1}`} en porcentaje`}
                  className="w-full border border-borde rounded-lg pl-2 pr-6 py-1.5 text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 !text-black-300 text-14-normal pointer-events-none">
                  %
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---- Asistente ----
type Contexto = { universidad: string; materia: string; profesor: string };

export default function AsistenteCalculadora({ universidades }: { universidades: string[] }) {
  const [paso, setPaso] = useState(1);
  const [contexto, setContexto] = useState<Contexto>({ universidad: "", materia: "", profesor: "" });
  // Escotilla: escribir la materia a mano sin elegir universidad. La universidad
  // filtra el catálogo, pero es opcional — el nombre de la materia no.
  const [materiaLibre, setMateriaLibre] = useState(false);
  const [secciones, setSecciones] = useState<SeccionUI[]>(() => plantillaInicial());
  const [seccionActual, setSeccionActual] = useState(0);
  const montado = useRef(false);

  // La materia y el profesor dependen de la universidad. Al cambiarla, lo ya
  // elegido del catálogo queda incoherente, así que se limpia (salvo que no
  // hubiera universidad antes: ahí el texto es manual y se conserva).
  function cambiarUniversidad(v: string) {
    setContexto((c) =>
      c.universidad && c.universidad !== v
        ? { universidad: v, materia: "", profesor: "" }
        : { ...c, universidad: v },
    );
    if (v) setMateriaLibre(false);
  }

  const materiaBloqueada = !contexto.universidad.trim() && !materiaLibre;

  // Guarda en localStorage para precargar si el visitante se registra.
  useEffect(() => {
    if (!montado.current) {
      montado.current = true;
      return;
    }
    try {
      window.localStorage.setItem(CLAVE_MATERIA_PUBLICA, JSON.stringify({ contexto, secciones }));
    } catch {
      /* noop */
    }
  }, [contexto, secciones]);

  const nombres = secciones.map((s) => s.nombre);
  const porcentajes = secciones.map((s) => s.porcentaje);
  const validacion = validarSecciones(toEval(secciones));
  const esquemaOk =
    validacion.valido &&
    secciones.length > 0 &&
    secciones.every((s) =>
      s.nombre.trim() &&
      (esGrupo(s)
        ? (s.subsecciones ?? []).every((x) => x.nombre.trim() && x.cantidad >= 1)
        : s.cantidad >= 1),
    );

  function setPorcentajes(next: number[]) {
    setSecciones((prev) => prev.map((s, i) => ({ ...s, porcentaje: next[i] })));
  }
  function setNombre(i: number, nombre: string) {
    setSecciones((prev) => prev.map((s, idx) => (idx === i ? { ...s, nombre } : s)));
  }
  function setCantidad(i: number, cRaw: number) {
    const c = Math.max(1, Math.min(10, Math.round(cRaw)));
    setSecciones((prev) =>
      prev.map((s, idx) => {
        if (idx !== i) return s;
        const notas = [...s.notas];
        while (notas.length < c)
          notas.push({
            id: `${s.id}-n${notas.length + 1}-${Math.round(performance.now())}-${notas.length}`,
            orden: notas.length + 1,
            descripcion: null,
            puntaje: null,
            puntajeMax: 100,
          });
        while (notas.length > c) notas.pop();
        return { ...s, cantidad: c, notas: notas.map((n, k) => ({ ...n, orden: k + 1 })) };
      }),
    );
  }
  function agregarSeccion() {
    setSecciones((prev) => {
      const id = `s${prev.length + 1}-${Math.round(performance.now())}`;
      const nueva: SeccionUI = {
        id,
        nombre: "",
        porcentaje: 0,
        cantidad: 1,
        orden: prev.length + 1,
        notas: [{ id: `${id}-n1`, orden: 1, descripcion: null, puntaje: null, puntajeMax: 100 }],
      };
      // El examen final es siempre lo último: la sección nueva entra ANTES de él.
      // Se detecta por nombre (tolerante a tildes/mayúsculas); si hay varias, la última.
      const idxFinal = prev.reduce((acc, s, i) => (normalizar(s.nombre).includes("final") ? i : acc), -1);
      const arr = idxFinal >= 0 ? [...prev.slice(0, idxFinal), nueva, ...prev.slice(idxFinal)] : [...prev, nueva];
      const base = Math.floor(100 / arr.length);
      return arr.map((s, i) => ({
        ...s,
        porcentaje: i === 0 ? base + (100 - base * arr.length) : base,
        orden: i + 1,
      }));
    });
  }
  function quitarSeccion(i: number) {
    setSecciones((prev) => {
      if (prev.length <= 1) return prev;
      const arr = prev.filter((_, idx) => idx !== i);
      const base = Math.floor(100 / arr.length);
      return arr.map((s, idx) => ({ ...s, porcentaje: idx === 0 ? base + (100 - base * arr.length) : base }));
    });
  }
  function editarNota(seccionId: string, notaId: string, cambio: Partial<NotaUI>) {
    setSecciones((prev) =>
      prev.map((s) => {
        if (s.id === seccionId) {
          return { ...s, notas: s.notas.map((n) => (n.id === notaId ? { ...n, ...cambio } : n)) };
        }
        if (s.subsecciones) {
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
      }),
    );
  }

  // ---- Laboratorio (subsecciones) ----
  function setGrupo(i: number, on: boolean) {
    setSecciones((prev) =>
      prev.map((s, idx) => {
        if (idx !== i) return s;
        if (on) {
          return {
            ...s,
            cantidad: 0,
            notas: [],
            profesorNombre: s.profesorNombre ?? null,
            subsecciones: [
              { id: `${s.id}-a`, nombre: "", porcentaje: 50, cantidad: 1, orden: 1, notas: notasVaciasUI(`${s.id}-a`, 1) },
              { id: `${s.id}-b`, nombre: "", porcentaje: 50, cantidad: 1, orden: 2, notas: notasVaciasUI(`${s.id}-b`, 1) },
            ],
          };
        }
        return { ...s, subsecciones: undefined, cantidad: 1, notas: notasVaciasUI(s.id, 1) };
      }),
    );
  }
  function mapSub(i: number, fn: (subs: SeccionUI[]) => SeccionUI[]) {
    setSecciones((prev) => prev.map((s, idx) => (idx === i ? { ...s, subsecciones: fn(s.subsecciones ?? []) } : s)));
  }
  function setSubCampo(i: number, j: number, cambio: Partial<SeccionUI>) {
    mapSub(i, (subs) => subs.map((x, idx) => (idx === j ? { ...x, ...cambio } : x)));
  }
  function setSubCantidad(i: number, j: number, cRaw: number) {
    const c = Math.max(1, Math.min(10, Math.round(cRaw)));
    mapSub(i, (subs) =>
      subs.map((x, idx) => {
        if (idx !== j) return x;
        const notas = [...x.notas];
        while (notas.length < c) notas.push(notasVaciasUI(`${x.id}-x`, 1)[0]);
        while (notas.length > c) notas.pop();
        return { ...x, cantidad: c, notas: notas.map((n, k) => ({ ...n, orden: k + 1 })) };
      }),
    );
  }
  function setProfesorLab(i: number, v: string) {
    setSecciones((prev) => prev.map((s, idx) => (idx === i ? { ...s, profesorNombre: v } : s)));
  }
  function agregarSub(i: number) {
    mapSub(i, (subs) => {
      const id = `${secciones[i].id}-${subs.length + 1}-${Math.round(performance.now())}`;
      return [...subs, { id, nombre: "", porcentaje: 0, cantidad: 1, orden: subs.length + 1, notas: notasVaciasUI(id, 1) }];
    });
  }
  function quitarSub(i: number, j: number) {
    const subs = (secciones[i].subsecciones ?? []).filter((_, idx) => idx !== j);
    if (subs.length < 2) setGrupo(i, false);
    else mapSub(i, () => subs.map((x, k) => ({ ...x, orden: k + 1 })));
  }
  function usarPlantillaLab() {
    setSecciones(plantillaConLaboratorio());
  }

  const estado = calcularEstadoMateria(toEval(secciones));
  // Los tres suman 100 (base de la barra). "Perdido" es lo que ya no se puede
  // recuperar; se deriva de los otros dos, no del máximo.
  const asegurado = estado.notaActual;
  const enJuego = estado.porcentajeRestante;
  const perdido = Math.max(0, 100 - asegurado - enJuego);

  return (
    <section className="section_container max-w-2xl">
      {/* Indicador de progreso */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-14-normal !text-black-300 font-semibold">Paso {paso} de 4</span>
          <Link href="/" className="text-14-normal !text-black-300 underline">
            Salir
          </Link>
        </div>
        <div className="flex gap-1.5">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className={`h-1.5 flex-1 rounded-full ${n <= paso ? "bg-primary" : "bg-black/10"}`} />
          ))}
        </div>
      </div>

      <div key={paso} className="paso-anim">
        {/* PASO 1 — Contexto. Orden jerárquico: la universidad decide qué
            materias y profesores existen, así que va primero. */}
        {paso === 1 && (
          <div className="space-y-5">
            <h1 className="text-30-bold">Tu materia</h1>

            <div>
              <label htmlFor="uni" className="block text-16-medium font-semibold mb-2">
                Universidad <span className="text-black-300 font-normal">(opcional)</span>
              </label>
              <Combobox
                id="uni"
                valor={contexto.universidad}
                onChange={cambiarUniversidad}
                placeholder="Tu universidad…"
                opciones={universidades}
              />
              <p className="text-14-normal !text-black-300 mt-1.5">
                Elígela primero: con ella filtramos las materias y los profesores de tu universidad.
              </p>
            </div>

            <div>
              <label htmlFor="materia" className="block text-16-medium font-semibold mb-2">
                Materia
              </label>
              <Combobox
                id="materia"
                valor={contexto.materia}
                onChange={(v) => setContexto((c) => ({ ...c, materia: v }))}
                placeholder={materiaLibre ? "Escribe el nombre de tu materia…" : "Cálculo I…"}
                buscar={(q) => buscarMateriasPublico(q, contexto.universidad)}
                disabled={materiaBloqueada}
              />
              {materiaBloqueada ? (
                <p className="text-14-normal !text-black-300 mt-1.5">
                  Elige primero tu universidad.{" "}
                  <button
                    type="button"
                    onClick={() => setMateriaLibre(true)}
                    className="!text-primary-ink font-semibold underline"
                  >
                    O escríbela a mano
                  </button>
                </p>
              ) : (
                !contexto.universidad.trim() && (
                  <p className="text-14-normal !text-black-300 mt-1.5">
                    La estás escribiendo a mano, sin catálogo.
                  </p>
                )
              )}
            </div>

            <div>
              <label htmlFor="prof" className="block text-16-medium font-semibold mb-2">
                Profesor <span className="text-black-300 font-normal">(opcional)</span>
              </label>
              <Combobox
                id="prof"
                valor={contexto.profesor}
                onChange={(v) => setContexto((c) => ({ ...c, profesor: v }))}
                placeholder={contexto.universidad.trim() ? "Nombre del profe…" : "Elige tu universidad primero"}
                buscar={(q) => buscarProfesoresPublico(q, contexto.universidad)}
                disabled={!contexto.universidad.trim()}
              />
            </div>
          </div>
        )}

        {/* PASO 2 — Secciones y pesos */}
        {paso === 2 && (
          <div className="space-y-6">
            <div>
              <h1 className="text-30-bold">Secciones y pesos</h1>
              <p className="text-16-medium text-black-300 mt-1">
                ¿Cómo se reparte la nota de tu materia?
              </p>
            </div>

            <BarraPesos nombres={nombres} porcentajes={porcentajes} onChange={setPorcentajes} />

            <div className="space-y-3">
              {secciones.map((s, i) => {
                const grupo = esGrupo(s);
                const subs = s.subsecciones ?? [];
                const sumaSub = subs.reduce((a, x) => a + x.porcentaje, 0);
                const subOk = Math.abs(100 - sumaSub) < 0.01;
                return (
                  <div key={s.id} className="tarjeta p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <input
                        className={campo}
                        value={s.nombre}
                        placeholder={`Sección ${i + 1}`}
                        aria-label={`Nombre de la sección ${i + 1}`}
                        onChange={(e) => setNombre(i, e.target.value)}
                      />
                      {secciones.length > 1 && (
                        <button
                          type="button"
                          onClick={() => quitarSeccion(i)}
                          aria-label={`Quitar ${s.nombre || `sección ${i + 1}`}`}
                          className="!text-rojo-fuerte font-bold px-2 text-20-medium"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    <label className="flex items-center gap-2 text-14-normal text-tinta cursor-pointer">
                      <input
                        type="checkbox"
                        checked={grupo}
                        onChange={(e) => setGrupo(i, e.target.checked)}
                        className="accent-primary w-4 h-4"
                      />
                      Tiene laboratorio (subsecciones con su propio reparto)
                    </label>

                    {!grupo ? (
                      <div className="flex items-center gap-3">
                        <span className="text-14-normal !text-black-300 w-24 shrink-0">Evaluaciones</span>
                        <input
                          type="range"
                          min={1}
                          max={10}
                          value={s.cantidad}
                          onChange={(e) => setCantidad(i, Number(e.target.value))}
                          aria-label={`Cantidad de evaluaciones en ${s.nombre || `sección ${i + 1}`}`}
                          className="flex-1 accent-primary"
                        />
                        <span className="text-[18px] font-bold tabular-nums w-6 text-center">{s.cantidad}</span>
                      </div>
                    ) : (
                      <div className="rounded-xl bg-crema border border-hairline p-3 space-y-3">
                        <div>
                          <span className="block text-[11px] !text-black-300 mb-1">
                            Profesor del laboratorio <span className="font-normal">(opcional)</span>
                          </span>
                          <input
                            className={campo}
                            value={s.profesorNombre ?? ""}
                            placeholder="Distinto del de la materia"
                            onChange={(e) => setProfesorLab(i, e.target.value)}
                          />
                        </div>
                        <p className="text-14-normal !text-primary-ink bg-primary-100 rounded-lg px-3 py-2">
                          Las subsecciones suman <strong>100% entre ellas</strong> (reparten el {s.porcentaje || 0}% de
                          esta sección, no hasta ese número).
                        </p>
                        <div className="space-y-3">
                          {subs.map((x, j) => (
                            <div key={x.id} className="space-y-1">
                              <div className="flex items-center gap-2">
                                <input
                                  className={campo}
                                  value={x.nombre}
                                  placeholder={`Subsección ${j + 1}`}
                                  aria-label={`Nombre de la subsección ${j + 1}`}
                                  onChange={(e) => setSubCampo(i, j, { nombre: e.target.value })}
                                />
                                <input
                                  type="number"
                                  className="w-16 shrink-0 border border-borde rounded-lg px-2 py-2 text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40"
                                  value={x.porcentaje}
                                  min={0}
                                  step={1}
                                  aria-label={`Peso relativo de ${x.nombre || `subsección ${j + 1}`}`}
                                  onChange={(e) => setSubCampo(i, j, { porcentaje: Number(e.target.value) })}
                                />
                                <button
                                  type="button"
                                  onClick={() => quitarSub(i, j)}
                                  className="!text-rojo-fuerte font-bold px-1 shrink-0"
                                  aria-label={`Quitar subsección ${j + 1}`}
                                >
                                  ✕
                                </button>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-14-normal !text-black-300 w-24 shrink-0">Evaluaciones</span>
                                <input
                                  type="range"
                                  min={1}
                                  max={10}
                                  value={x.cantidad}
                                  onChange={(e) => setSubCantidad(i, j, Number(e.target.value))}
                                  aria-label={`Cantidad de evaluaciones en ${x.nombre || `subsección ${j + 1}`}`}
                                  className="flex-1 accent-primary"
                                />
                                <span className="text-[18px] font-bold tabular-nums w-6 text-center">{x.cantidad}</span>
                              </div>
                              <p className="text-[11px] !text-black-300 tabular-nums">
                                = {Math.round(pesoEfectivo(s.porcentaje, x.porcentaje) * 100) / 100}% de la nota final
                              </p>
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => agregarSub(i)}
                            className="text-14-normal !text-primary-ink font-semibold underline"
                          >
                            + Agregar subsección
                          </button>
                          <span
                            className={`text-14-normal font-semibold tabular-nums ${
                              subOk ? "!text-verde-fuerte" : "!text-rojo-fuerte"
                            }`}
                          >
                            {subOk ? "suman 100% ✓" : `suman ${sumaSub}%`}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={agregarSeccion}
                  className="text-16-medium !text-primary-ink font-semibold underline"
                >
                  + Agregar sección
                </button>
                <button
                  type="button"
                  onClick={usarPlantillaLab}
                  className="text-14-normal !text-primary-ink font-semibold bg-primary-100 rounded-lg px-3 py-1.5"
                >
                  Usar plantilla “Materia con laboratorio”
                </button>
              </div>
            </div>

            {!validacion.valido && (
              <p className="text-14-normal !text-rojo-fuerte">
                {validacion.subseccionesInvalidas.length > 0 && Math.abs(validacion.diferencia) < 0.01
                  ? `Revisa las subsecciones de “${validacion.subseccionesInvalidas[0].nombre}”: suman ${validacion.subseccionesInvalidas[0].suma}%, deben sumar 100.`
                  : `Los pesos deben sumar 100 (van ${validacion.suma}). Usa la barra o “repartir equitativo”.`}
              </p>
            )}
          </div>
        )}

        {/* PASO 3 — Notas, una sección a la vez */}
        {paso === 3 && secciones[seccionActual] && (
          <PasoNotas
            seccion={secciones[seccionActual]}
            indice={seccionActual}
            total={secciones.length}
            onEditarNota={editarNota}
          />
        )}

        {/* PASO 4 — Resultados */}
        {paso === 4 && (
          <div className="space-y-8">
            <h1 className="text-30-bold">{contexto.materia || "Tu materia"}</h1>

            <div className="tarjeta-hero p-6 text-center relative">
              <p className="text-[11px] uppercase tracking-wide font-bold !text-black-300 inline-flex items-center gap-1.5">
                Nota actual <Ayuda explicacion={EXPLICACIONES.notaActual} />
              </p>
              <p className="text-[64px] leading-none font-extrabold tabular-nums my-2 text-tinta">
                {fmt(asegurado)}
                <span className="text-20-medium !text-black-300"> / 100</span>
              </p>
              <div className="flex h-4 rounded-full overflow-hidden mt-4 shadow-suave" role="img"
                aria-label={`Asegurado ${fmt(asegurado)}, en juego ${fmt(enJuego)}, perdido ${fmt(perdido)}`}>
                <div style={{ width: `${asegurado}%` }} className="bg-verde-fuerte" />
                <div style={{ width: `${enJuego}%` }} className="bg-black/15" />
                <div style={{ width: `${perdido}%` }} className="bg-rojo-fuerte" />
              </div>
              {/* Leyenda inline permanente: es parte del gráfico. Cada rótulo trae
                  su "?" (abre hacia abajo para no tapar la barra que explica). */}
              <div className="flex justify-center flex-wrap gap-x-4 gap-y-1 mt-3 text-14-normal !text-black-300">
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm bg-verde-fuerte align-middle" />
                  Asegurado {fmt(asegurado)} <Ayuda explicacion={EXPLICACIONES.asegurado} preferir="abajo" />
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm bg-black/15 align-middle" />
                  En juego {fmt(enJuego)} <Ayuda explicacion={EXPLICACIONES.enJuego} preferir="abajo" />
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm bg-rojo-fuerte align-middle" />
                  Perdido {fmt(perdido)} <Ayuda explicacion={EXPLICACIONES.perdido} preferir="abajo" />
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="tarjeta p-3 relative">
                <p className="text-[11px] uppercase tracking-wide font-bold !text-black-300 inline-flex items-center gap-1.5">
                  Máxima posible <Ayuda explicacion={EXPLICACIONES.notaMaxima} />
                </p>
                <p className="text-[24px] font-bold tabular-nums mt-0.5">{fmt(estado.notaMaxima)}</p>
              </div>
              <div className="tarjeta p-3 relative">
                <p className="text-[11px] uppercase tracking-wide font-bold !text-black-300 inline-flex items-center gap-1.5">
                  Promedio actual <Ayuda explicacion={EXPLICACIONES.promedioActual} />
                </p>
                <p className="text-[24px] font-bold tabular-nums mt-0.5">
                  {estado.promedioParcial === null ? "—" : fmt(estado.promedioParcial)}
                </p>
              </div>
            </div>

            <PanelObjetivo seccionesEval={toEval(secciones)} objetivoAprobar={61} fundamental={false} />

            <div className="bg-primary-100 border-2 border-primary/30 rounded-2xl p-6 shadow-hero">
              <p className="text-20-medium font-bold">Guarda esta materia y ve más</p>
              <p className="text-16-medium mt-2">
                Con una cuenta guardas esta materia, le sumas las demás de tu semestre y ves tu índice de
                carrera completo. Al entrar, la encuentras precargada.
              </p>
              <form action={iniciarSesion} className="mt-4">
                <Button type="submit" className="calcular_btn w-full">
                  Crear cuenta con Google
                </Button>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Navegación */}
      <div className="flex gap-3 mt-8">
        {paso > 1 && (
          <button
            type="button"
            onClick={() => {
              if (paso === 3 && seccionActual > 0) setSeccionActual((s) => s - 1);
              else setPaso((p) => p - 1);
            }}
            className="flex-1 border-2 border-borde rounded-2xl py-3 text-16-medium font-semibold bg-white"
          >
            ← Atrás
          </button>
        )}
        {paso < 4 && (
          <Button
            type="button"
            disabled={(paso === 1 && !contexto.materia.trim()) || (paso === 2 && !esquemaOk)}
            className="calcular_btn flex-1 !text-[18px] !p-3"
            onClick={() => {
              if (paso === 3) {
                if (seccionActual < secciones.length - 1) setSeccionActual((s) => s + 1);
                else setPaso(4);
              } else {
                if (paso === 2) setSeccionActual(0);
                setPaso((p) => p + 1);
              }
            }}
          >
            {paso === 3
              ? seccionActual < secciones.length - 1
                ? "Siguiente sección →"
                : "Ver resultados →"
              : "Siguiente →"}
          </Button>
        )}
      </div>
    </section>
  );
}

// ---- Paso 3: notas de UNA sección ----
function PasoNotas({
  seccion,
  indice,
  total,
  onEditarNota,
}: {
  seccion: SeccionUI;
  indice: number;
  total: number;
  onEditarNota: (seccionId: string, notaId: string, cambio: Partial<NotaUI>) => void;
}) {
  const grupo = esGrupo(seccion);
  const subs = seccion.subsecciones ?? [];

  return (
    <div className="space-y-5">
      <div>
        <p className="text-14-normal !text-black-300 font-semibold">
          {seccion.nombre || "Sección"} · {indice + 1} de {total} secciones
        </p>
        <h1 className="text-30-bold mt-1">Tus notas de {seccion.nombre || "esta sección"}</h1>
        <p className="text-16-medium text-black-300 mt-1">
          Llena las que ya sacaste; deja vacías las pendientes.
        </p>
      </div>

      {grupo ? (
        <div className="space-y-5">
          {subs.map((sub) => (
            <div key={sub.id} className="space-y-2">
              <div className="flex items-baseline justify-between">
                <p className="text-16-medium font-semibold text-tinta">{sub.nombre || "Subsección"}</p>
                <p className="text-[11px] !text-black-300 tabular-nums">
                  {Math.round(pesoEfectivo(seccion.porcentaje, sub.porcentaje) * 100) / 100}% de la nota final
                </p>
              </div>
              <div className="space-y-3">
                {sub.notas.map((n) => (
                  <FilaNota key={n.id} seccion={sub} nota={n} onEditar={(c) => onEditarNota(sub.id, n.id, c)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {seccion.notas.map((n) => (
            <FilaNota key={n.id} seccion={seccion} nota={n} onEditar={(c) => onEditarNota(seccion.id, n.id, c)} />
          ))}
        </div>
      )}

      <p className="text-14-normal !text-black-300">
        ¿Aún no tienes notas aquí? Puedes saltar la sección con “Siguiente”.
      </p>
    </div>
  );
}

function FilaNota({
  seccion,
  nota: n,
  onEditar,
}: {
  seccion: SeccionUI;
  nota: NotaUI;
  onEditar: (cambio: Partial<NotaUI>) => void;
}) {
  const pendiente = n.puntaje === null;
  const etiqueta = nombreEvaluacion(seccion.nombre, n.orden, seccion.cantidad);
  return (
    <div className={`tarjeta p-4 ${pendiente ? "border-dashed" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-16-medium font-semibold">{etiqueta}</p>
          {pendiente && <p className="text-14-normal !text-black-300">Pendiente</p>}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="decimal"
            placeholder="—"
            aria-label={`Nota de ${etiqueta}`}
            value={n.puntaje ?? ""}
            min={0}
            max={n.puntajeMax}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") return onEditar({ puntaje: null });
              const v = Number(raw);
              if (!Number.isNaN(v)) onEditar({ puntaje: v });
            }}
            className={`w-20 text-center border rounded-lg px-2 py-2 tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40 ${
              pendiente ? "border-dashed border-borde bg-crema" : "border-borde bg-white"
            }`}
          />
          <span className="text-16-medium !text-black-300">/</span>
          <input
            type="number"
            inputMode="decimal"
            aria-label={`Puntaje máximo de ${etiqueta}`}
            value={n.puntajeMax}
            min={1}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && v > 0) onEditar({ puntajeMax: v });
            }}
            className="w-16 text-center border border-borde rounded-lg px-2 py-2 tabular-nums bg-white focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
      </div>
    </div>
  );
}
