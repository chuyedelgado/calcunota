"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  esCalificable,
  LETRAS,
  nombrePeriodo,
  notaALetra,
  ORDEN_PERIODO,
  secuenciaDePeriodo,
  type Letra,
  type TipoPeriodo,
} from "@/lib/calculos";
import { calcularIndiceDesdeCursos, type CursoParaIndice } from "@/lib/indice";
import { nombreTipoPeriodo, periodosEnRango } from "../../semestre/periodo";
import {
  buscarMaterias,
  guardarHistorial,
  type CursoGuardado,
  type ItemHistorial,
  type MateriaBuscada,
} from "../actions";

export type MateriaPensum = {
  materiaPlanId: string;
  materiaId: string;
  codigo: string;
  nombre: string;
  creditos: number;
  fundamental: boolean;
  planAnio: number | null;
  planPeriodo: TipoPeriodo | null;
};

type Periodo = { anio: number; tipo: TipoPeriodo };
type EstadoFila = { marcada: boolean; letra: Letra | null; profesor: string; override: Periodo | null };

const campo =
  "w-full border border-borde rounded-lg px-3 py-2 bg-superficie text-tinta " +
  "focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60";

const FILA_VACIA: EstadoFila = { marcada: false, letra: null, profesor: "", override: null };

// Los colores del badge de letra viven en globals.css (.badge-letra--x).
const CLASE_LETRA: Record<Letra, string> = {
  A: "badge-letra--a",
  B: "badge-letra--b",
  C: "badge-letra--c",
  D: "badge-letra--d",
  F: "badge-letra--f",
};

function SelectorLetra({ valor, onChange }: { valor: Letra | null; onChange: (l: Letra) => void }) {
  return (
    <div className="flex gap-1.5">
      {LETRAS.map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={valor === l}
          onClick={() => onChange(l)}
          className={`badge-letra w-11 h-11 text-20-medium ${valor === l ? CLASE_LETRA[l] : "badge-letra--off"}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function SelectorPeriodo({
  valor,
  opciones,
  onChange,
}: {
  valor: Periodo;
  opciones: Periodo[];
  onChange: (v: Periodo) => void;
}) {
  return (
    <select
      className={campo}
      value={`${valor.anio}:${valor.tipo}`}
      onChange={(e) => {
        const [a, t] = e.target.value.split(":");
        onChange({ anio: Number(a), tipo: t as TipoPeriodo });
      }}
    >
      {opciones.map((o) => {
        const v = `${o.anio}:${o.tipo}`;
        return (
          <option key={v} value={v}>
            {nombrePeriodo(o.anio, o.tipo)}
          </option>
        );
      })}
    </select>
  );
}

export default function CargaHistorial({
  pensum,
  cursosExistentes,
  profesores,
  anioIngreso,
  totalCreditos,
}: {
  pensum: MateriaPensum[];
  cursosExistentes: CursoGuardado[];
  profesores: string[];
  anioIngreso: number;
  totalCreditos: number;
}) {
  const anioActual = new Date().getFullYear();
  const opcionesPeriodo = periodosEnRango(Math.min(anioIngreso, anioActual), anioActual + 1);

  const grupos = agruparPensum(pensum);

  const [periodosGrupo, setPeriodosGrupo] = useState<Record<string, Periodo>>(() => {
    const m: Record<string, Periodo> = {};
    for (const g of grupos) {
      const anio = Math.min(
        anioActual + 1,
        Math.max(anioIngreso, anioIngreso + (g.planAnio ? g.planAnio - 1 : 0)),
      );
      m[g.key] = { anio, tipo: g.planPeriodo ?? "PRIMER_SEMESTRE" };
    }
    return m;
  });

  const [estados, setEstados] = useState<Record<string, EstadoFila>>({});
  const [yaCargadas, setYaCargadas] = useState<Set<string>>(
    () => new Set(cursosExistentes.map((c) => c.materiaId)),
  );
  const [cursos, setCursos] = useState<CursoGuardado[]>(cursosExistentes);
  const [guardandoGrupo, setGuardandoGrupo] = useState<string | null>(null);
  const [errorGrupo, setErrorGrupo] = useState<Record<string, string>>({});

  const getEstado = (id: string) => estados[id] ?? FILA_VACIA;
  const setFila = (id: string, cambio: Partial<EstadoFila>) =>
    setEstados((prev) => ({ ...prev, [id]: { ...(prev[id] ?? FILA_VACIA), ...cambio } }));

  async function guardarGrupo(g: Grupo) {
    const periodoGrupo = periodosGrupo[g.key];
    const items: ItemHistorial[] = [];
    for (const m of g.materias) {
      if (yaCargadas.has(m.materiaId)) continue;
      const st = getEstado(m.materiaPlanId);
      if (!st.marcada) continue;
      const calificable = esCalificable(m.creditos);
      if (calificable && st.letra === null) {
        setErrorGrupo((p) => ({ ...p, [g.key]: "Elige la calificación de cada materia marcada." }));
        return;
      }
      const efectivo = st.override ?? periodoGrupo;
      items.push({
        materiaPlanId: m.materiaPlanId,
        materiaId: m.materiaId,
        creditos: m.creditos,
        fundamental: m.fundamental,
        anio: efectivo.anio,
        tipo: efectivo.tipo,
        letra: calificable ? st.letra : null,
        profesorNombre: st.profesor || null,
      });
    }
    if (items.length === 0) {
      setErrorGrupo((p) => ({ ...p, [g.key]: "Marca al menos una materia de este semestre." }));
      return;
    }
    setGuardandoGrupo(g.key);
    setErrorGrupo((p) => ({ ...p, [g.key]: "" }));
    const r = await guardarHistorial(items);
    setGuardandoGrupo(null);
    if (r.ok) {
      setCursos((prev) => [...prev, ...r.guardados]);
      setYaCargadas((prev) => new Set([...prev, ...r.guardados.map((c) => c.materiaId)]));
    } else {
      setErrorGrupo((p) => ({ ...p, [g.key]: r.error ?? "No se pudo guardar." }));
    }
  }

  return (
    <div className="space-y-8">
      <Resumen cursos={cursos} totalCreditos={totalCreditos} />

      {grupos.map((g) => {
        const per = periodosGrupo[g.key];
        const pendientes = g.materias.filter((m) => !yaCargadas.has(m.materiaId));
        return (
          <div key={g.key} className="tarjeta p-4">
            <h2 className="text-20-medium font-semibold mb-1">{g.etiqueta}</h2>
            <p className="text-14-normal !text-black-300 mb-2">¿En qué periodo cursaste este semestre?</p>
            <div className="mb-4 max-w-[220px]">
              <SelectorPeriodo
                valor={per}
                opciones={opcionesPeriodo}
                onChange={(v) => setPeriodosGrupo((prev) => ({ ...prev, [g.key]: v }))}
              />
            </div>

            <div className="space-y-3">
              {g.materias.map((m) => {
                const cargada = yaCargadas.has(m.materiaId);
                const st = getEstado(m.materiaPlanId);
                const calificable = esCalificable(m.creditos);
                if (cargada) {
                  const c = cursos.find((x) => x.materiaId === m.materiaId);
                  return (
                    <div key={m.materiaPlanId} className="flex items-center justify-between gap-2 opacity-70">
                      <span className="text-16-medium">
                        {m.codigo} · {m.nombre}
                      </span>
                      <span className="text-14-normal !text-verde-fuerte font-semibold shrink-0">
                        ✓ {c?.letra ?? "cargada"}
                      </span>
                    </div>
                  );
                }
                return (
                  <div key={m.materiaPlanId} className="border-t border-hairline pt-3">
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-1 accent-primary w-4 h-4"
                        checked={st.marcada}
                        onChange={(e) => setFila(m.materiaPlanId, { marcada: e.target.checked })}
                      />
                      <span className="text-16-medium">
                        {m.codigo} · {m.nombre}{" "}
                        <span className="text-14-normal !text-black-300">
                          ({m.creditos} cr.{m.fundamental ? " · fund." : ""})
                        </span>
                      </span>
                    </label>

                    {st.marcada && (
                      <div className="mt-2 pl-6 space-y-2">
                        {calificable ? (
                          <SelectorLetra
                            valor={st.letra}
                            onChange={(l) => setFila(m.materiaPlanId, { letra: l })}
                          />
                        ) : (
                          <p className="text-14-normal !text-black-300">
                            Sin créditos: se marca aprobada sin calificación.
                          </p>
                        )}
                        <input
                          className={campo}
                          list="lista-profesores-hist"
                          placeholder="Profesor (opcional)"
                          value={st.profesor}
                          autoComplete="off"
                          onChange={(e) => setFila(m.materiaPlanId, { profesor: e.target.value })}
                        />
                        {st.override ? (
                          <div className="flex items-center gap-2">
                            <SelectorPeriodo
                              valor={st.override}
                              opciones={opcionesPeriodo}
                              onChange={(v) => setFila(m.materiaPlanId, { override: v })}
                            />
                            <button
                              type="button"
                              className="text-14-normal !text-primary-ink underline shrink-0"
                              onClick={() => setFila(m.materiaPlanId, { override: null })}
                            >
                              usar el del grupo
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="text-14-normal !text-primary-ink underline"
                            onClick={() => setFila(m.materiaPlanId, { override: per })}
                          >
                            La cursé en otro periodo
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {errorGrupo[g.key] && <p className="text-14-normal !text-rojo-fuerte mt-3">{errorGrupo[g.key]}</p>}

            {pendientes.length > 0 && (
              <Button
                type="button"
                className="calcular_btn w-full !text-[18px] !p-3 mt-4"
                disabled={guardandoGrupo === g.key}
                onClick={() => guardarGrupo(g)}
              >
                {guardandoGrupo === g.key ? "Guardando…" : "Guardar este semestre"}
              </Button>
            )}
          </div>
        );
      })}

      <BusquedaLibre
        opcionesPeriodo={opcionesPeriodo}
        periodoDefecto={{ anio: anioActual, tipo: "PRIMER_SEMESTRE" }}
        yaCargadas={yaCargadas}
        onGuardado={(gs) => {
          setCursos((prev) => [...prev, ...gs]);
          setYaCargadas((prev) => new Set([...prev, ...gs.map((c) => c.materiaId)]));
        }}
      />

      <datalist id="lista-profesores-hist">
        {profesores.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
    </div>
  );
}

// Letra efectiva de un curso guardado (por letra directa o derivada de la nota).
function letraEfectiva(c: CursoGuardado): Letra | null {
  if (c.letra != null) return c.letra;
  if (c.notaFinal != null) return notaALetra(c.notaFinal) as Letra;
  return null;
}

function Resumen({ cursos, totalCreditos }: { cursos: CursoGuardado[]; totalCreditos: number }) {
  const paraIndice: CursoParaIndice[] = cursos.map((c) => ({
    id: c.id,
    materiaId: c.materiaId,
    creditos: c.creditos,
    notaFinal: c.notaFinal,
    letra: c.letra,
    periodo: { anio: c.anio, tipo: c.tipo },
  }));
  const resultado = calcularIndiceDesdeCursos(paraIndice);
  const aprobados = cursos.filter((c) => c.estado === "APROBADO").reduce((a, c) => a + c.creditos, 0);

  const claves = [...new Set(cursos.map((c) => `${c.anio}:${c.tipo}`))].sort((a, b) => {
    const [aa, at] = a.split(":");
    const [ba, bt] = b.split(":");
    return secuenciaDePeriodo(Number(aa), at as TipoPeriodo) - secuenciaDePeriodo(Number(ba), bt as TipoPeriodo);
  });
  const porPeriodo = claves.map((k) => {
    const [anio, tipo] = k.split(":");
    const delPeriodo = paraIndice.filter((c) => c.periodo.anio === Number(anio) && c.periodo.tipo === tipo);
    return {
      etiqueta: nombrePeriodo(Number(anio), tipo as TipoPeriodo),
      indice: calcularIndiceDesdeCursos(delPeriodo).indice,
    };
  });

  const fundamentalesD = cursos.filter(
    (c) => c.fundamental && c.estado === "APROBADO" && letraEfectiva(c) === "D",
  );
  const dsRepetibles = cursos.filter((c) => letraEfectiva(c) === "D");

  if (cursos.length === 0) {
    return (
      <div className="tarjeta p-5">
        <p className="text-16-medium text-black-300">
          Aún no has cargado materias. A medida que marques y guardes, tu índice aparece aquí.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-primary-100 border border-primary/20 rounded-2xl p-5 shadow-suave space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="tarjeta p-3">
          <p className="text-14-normal !text-black-300">Índice acumulado</p>
          <p className="text-30-bold leading-tight tabular-nums text-tinta">{resultado.indice.toFixed(2)}</p>
        </div>
        <div className="tarjeta p-3">
          <p className="text-14-normal !text-black-300">Créditos aprobados</p>
          <p className="text-30-bold leading-tight tabular-nums text-tinta">
            {aprobados}
            <span className="text-14-normal !text-black-300"> / {totalCreditos}</span>
          </p>
        </div>
      </div>

      {porPeriodo.length > 0 && (
        <div>
          <p className="text-14-normal !text-black-300 mb-2">Índice por periodo</p>
          <ul className="space-y-1">
            {porPeriodo.map((p) => (
              <li key={p.etiqueta} className="flex justify-between text-16-medium">
                <span>{p.etiqueta}</span>
                <span className="font-semibold">{p.indice.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {fundamentalesD.length > 0 && (
        <div className="bg-ambar-suave border border-ambar-fuerte/30 rounded-xl p-3">
          <p className="text-14-normal !text-ambar-fuerte font-semibold">
            Tienes {fundamentalesD.length} materia(s) fundamental(es) aprobada(s) con D: avanzas, pero
            no puedes graduarte con ellas hasta subirlas a C.
          </p>
        </div>
      )}

      {dsRepetibles.length > 0 && (
        <p className="text-14-normal !text-black-300">
          Tienes {dsRepetibles.length} D repetible(s): al repetirlas, la D anterior sale de tu índice
          y sube. Míralas en el{" "}
          <Link href="/carrera/repeticiones" className="!text-primary-ink underline font-semibold">
            Optimizador de repeticiones
          </Link>{" "}
          para ver cuáles conviene repetir primero.
        </p>
      )}
    </div>
  );
}

type FilaManual = {
  materia: MateriaBuscada;
  creditosStr: string;
  fundamental: boolean;
  periodo: Periodo;
  letra: Letra | null;
  profesor: string;
};

function BusquedaLibre({
  opcionesPeriodo,
  periodoDefecto,
  yaCargadas,
  onGuardado,
}: {
  opcionesPeriodo: Periodo[];
  periodoDefecto: Periodo;
  yaCargadas: Set<string>;
  onGuardado: (gs: CursoGuardado[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<MateriaBuscada[]>([]);
  const [filas, setFilas] = useState<FilaManual[]>([]);
  const [guardando, setGuardando] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onQuery(v: string) {
    setQuery(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setResultados(await buscarMaterias(v));
    }, 300);
  }

  function agregar(m: MateriaBuscada) {
    if (filas.some((f) => f.materia.id === m.id)) return;
    setFilas((prev) => [
      ...prev,
      {
        materia: m,
        creditosStr: String(m.creditos),
        fundamental: m.fundamental,
        periodo: periodoDefecto,
        letra: null,
        profesor: "",
      },
    ]);
    setQuery("");
    setResultados([]);
  }

  function setFila(i: number, cambio: Partial<FilaManual>) {
    setFilas((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...cambio } : f)));
  }

  async function guardar(i: number) {
    const f = filas[i];
    const creditos = Number(f.creditosStr);
    const calificable = esCalificable(creditos);
    if (calificable && f.letra === null) return;
    setGuardando(f.materia.id);
    const r = await guardarHistorial([
      {
        materiaId: f.materia.id,
        creditos,
        fundamental: f.fundamental,
        anio: f.periodo.anio,
        tipo: f.periodo.tipo,
        letra: calificable ? f.letra : null,
        profesorNombre: f.profesor || null,
      },
    ]);
    setGuardando(null);
    if (r.ok) {
      onGuardado(r.guardados);
      setFilas((prev) => prev.filter((_, idx) => idx !== i));
    }
  }

  return (
    <div className="tarjeta p-4">
      <h2 className="text-20-medium font-semibold mb-1">¿Falta una materia del pénsum?</h2>
      <p className="text-14-normal !text-black-300 mb-3">
        Electivas de catálogo, plan viejo o convalidaciones. Búscala en la UTP.
      </p>
      <input
        className={campo}
        placeholder="Código o nombre…"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
      />
      {resultados.length > 0 && (
        <ul className="mt-2 border border-borde rounded-lg divide-y divide-hairline bg-superficie max-h-60 overflow-y-auto">
          {resultados.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                disabled={yaCargadas.has(m.id)}
                onClick={() => agregar(m)}
                className="w-full text-left px-3 py-2 text-16-medium hover:bg-primary-100 disabled:opacity-40"
              >
                {m.codigo} · {m.nombre}
                {yaCargadas.has(m.id) ? " ✓" : ""}
              </button>
            </li>
          ))}
        </ul>
      )}

      {filas.map((f, i) => {
        const calificable = esCalificable(Number(f.creditosStr));
        return (
          <div key={f.materia.id} className="border-t border-hairline mt-3 pt-3 space-y-2">
            <p className="text-16-medium font-semibold">
              {f.materia.codigo} · {f.materia.nombre}
            </p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                className={`${campo} w-20`}
                value={f.creditosStr}
                min={0}
                onChange={(e) => setFila(i, { creditosStr: e.target.value })}
              />
              <span className="text-14-normal !text-black-300">créditos</span>
            </div>
            <SelectorPeriodo
              valor={f.periodo}
              opciones={opcionesPeriodo}
              onChange={(v) => setFila(i, { periodo: v })}
            />
            {calificable && (
              <SelectorLetra valor={f.letra} onChange={(l) => setFila(i, { letra: l })} />
            )}
            <input
              className={campo}
              list="lista-profesores-hist"
              placeholder="Profesor (opcional)"
              value={f.profesor}
              autoComplete="off"
              onChange={(e) => setFila(i, { profesor: e.target.value })}
            />
            <Button
              type="button"
              className="calcular_btn w-full !text-[16px] !p-2"
              disabled={guardando === f.materia.id}
              onClick={() => guardar(i)}
            >
              {guardando === f.materia.id ? "Guardando…" : "Guardar materia"}
            </Button>
          </div>
        );
      })}
    </div>
  );
}

type Grupo = { key: string; etiqueta: string; planAnio: number | null; planPeriodo: TipoPeriodo | null; materias: MateriaPensum[] };

function agruparPensum(pensum: MateriaPensum[]): Grupo[] {
  const mapa = new Map<string, Grupo>();
  for (const m of pensum) {
    const key = `${m.planAnio ?? "x"}:${m.planPeriodo ?? "x"}`;
    if (!mapa.has(key)) {
      const etiqueta = m.planAnio
        ? `Año ${m.planAnio}${m.planPeriodo ? ` · ${nombreTipoPeriodo(m.planPeriodo)}` : ""}`
        : "Sin ubicación en el plan";
      mapa.set(key, { key, etiqueta, planAnio: m.planAnio, planPeriodo: m.planPeriodo, materias: [] });
    }
    mapa.get(key)!.materias.push(m);
  }
  return [...mapa.values()].sort((a, b) => {
    const aa = a.planAnio ?? 999;
    const ba = b.planAnio ?? 999;
    if (aa !== ba) return aa - ba;
    const at = a.planPeriodo ? ORDEN_PERIODO[a.planPeriodo] : 9;
    const bt = b.planPeriodo ? ORDEN_PERIODO[b.planPeriodo] : 9;
    return at - bt;
  });
}
