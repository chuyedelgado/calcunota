"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { crearSemestre } from "../actions";
import {
  esCalificable,
  secuenciaDePeriodo,
  simularRepeticion,
  type CursoIndice,
  type Letra,
  type TipoPeriodo,
} from "@/lib/calculos";
import { buscar } from "@/lib/texto";
import { nombreTipoPeriodo } from "../periodo";

export type MateriaArmar = {
  materiaPlanId: string;
  materiaId: string;
  codigo: string;
  nombre: string;
  creditos: number;
  fundamental: boolean;
  anioSugerido: number | null;
  periodoSugerido: TipoPeriodo | null;
  estado: "pendiente" | "aprobada" | "en_curso";
  /** Códigos de prerequisitos que aún no aprueba. Aviso suave, no bloquea. */
  faltanPrereqs: string[];
  /** Ya tiene un curso cerrado de esta materia: agregarla es repetir. */
  yaCursada: boolean;
  /** Letra del último intento cerrado (para explicar el efecto de repetir). */
  ultimaLetra: Letra | null;
};

// Nota que se asume para mostrar el mejor caso al repetir. Se redacta como
// condicional ("si la cierras con A"), no como promesa.
const NOTA_MEJOR_CASO = 95;

export default function ArmarSemestre({
  sugeridas,
  otras,
  historial,
  anio,
  tipo,
  tieneAvance,
  electivas,
}: {
  sugeridas: MateriaArmar[];
  otras: MateriaArmar[];
  historial: CursoIndice[];
  anio: number;
  tipo: TipoPeriodo;
  tieneAvance: boolean;
  electivas: { plan: number; faltan: number } | null;
}) {
  // Precargadas: las sugeridas marcadas. El estudiante retoca, no arma de cero.
  const [seleccion, setSeleccion] = useState<Set<string>>(() => new Set(sugeridas.map((s) => s.materiaPlanId)));
  const [agregadas, setAgregadas] = useState<MateriaArmar[]>([]);
  const [query, setQuery] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  const toggle = (id: string) =>
    setSeleccion((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const lista = useMemo(() => [...sugeridas, ...agregadas], [sugeridas, agregadas]);

  // Contador: el dato que el estudiante mira para decidir si carga de más.
  const creditosSeleccionados = lista
    .filter((m) => seleccion.has(m.materiaPlanId))
    .reduce((a, m) => a + m.creditos, 0);
  const numSeleccionadas = lista.filter((m) => seleccion.has(m.materiaPlanId)).length;

  // Efecto en el índice de repetir una materia ya cursada (mejor caso, a A).
  function gananciaRepetir(m: MateriaArmar): number | null {
    if (!m.yaCursada || historial.length === 0) return null;
    const sim = simularRepeticion(
      historial,
      { id: `${m.materiaId}-sim`, materiaId: m.materiaId, creditos: m.creditos, notaFinal: null, secuencia: 0 },
      NOTA_MEJOR_CASO,
    );
    return sim.ganancia;
  }

  // Buscador: incluye repeticiones (aprobadas/en curso), agrupado por posición
  // del plan. Al escribir, se aplana por relevancia con buscar().
  const q = query.trim();
  const disponiblesBusqueda = otras.filter((m) => !agregadas.some((a) => a.materiaPlanId === m.materiaPlanId));
  const resultados = q.length >= 2 ? buscar(disponiblesBusqueda, q, (m) => `${m.codigo} ${m.nombre}`).slice(0, 8) : [];
  const grupos = useMemo(() => agrupar(disponiblesBusqueda), [disponiblesBusqueda]);

  function agregar(m: MateriaArmar) {
    setAgregadas((prev) => [...prev, m]);
    setSeleccion((prev) => new Set(prev).add(m.materiaPlanId));
    setQuery("");
  }

  async function crear() {
    setEnviando(true);
    setError("");
    const r = await crearSemestre({ anio, tipo, materiaPlanIds: [...seleccion] });
    setEnviando(false);
    if (r && !r.ok) setError(r.error ?? "No se pudo crear el semestre.");
  }

  return (
    <div className="space-y-5">
      {!tieneAvance && (
        <div className="tarjeta bg-primary-100 border border-primary/30 p-4">
          <p className="text-14-normal text-tinta">
            Te sugerimos el primer bloque del plan.{" "}
            <Link href="/historial/importar" className="font-semibold !text-primary-ink underline underline-offset-2">
              Importa tu historial
            </Link>{" "}
            y la sugerencia será exacta: solo lo que te falta y ya puedes llevar.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {lista.map((m) => (
          <MateriaCard
            key={m.materiaPlanId}
            m={m}
            marcada={seleccion.has(m.materiaPlanId)}
            onToggle={() => toggle(m.materiaPlanId)}
            ganancia={gananciaRepetir(m)}
          />
        ))}
        {lista.length === 0 && (
          <p className="text-16-medium text-black-300">
            No hay materias pendientes del plan para sugerir. Busca abajo para agregar.
          </p>
        )}
      </div>

      {/* Agregar otras: repeticiones, adelantos. Agrupadas como el selector. */}
      <div className="tarjeta p-4">
        <p className="text-16-medium font-semibold mb-2">Agregar otra materia del plan</p>
        <input
          type="search"
          className="w-full border border-borde rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60"
          placeholder="Código o nombre…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="mt-2 max-h-72 overflow-y-auto rounded-lg border border-hairline divide-y divide-hairline">
          {q.length >= 2 ? (
            resultados.length > 0 ? (
              resultados.map((m) => <FilaBusqueda key={m.materiaPlanId} m={m} onAgregar={() => agregar(m)} />)
            ) : (
              <p className="px-3 py-4 text-14-normal !text-black-300 text-center">Nada coincide con “{q}”.</p>
            )
          ) : (
            grupos.map((g) => (
              <div key={g.key}>
                <p className="sticky top-0 z-[1] px-3 py-1.5 text-[11px] uppercase tracking-wide font-bold bg-crema !text-black-300">
                  {g.label}
                </p>
                {g.items.map((m) => (
                  <FilaBusqueda key={m.materiaPlanId} m={m} onAgregar={() => agregar(m)} />
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      {electivas && electivas.faltan > 0 && (
        <div className="tarjeta bg-crema p-4">
          <p className="text-14-normal text-tinta">
            Tu plan pide <strong>{electivas.plan} créditos de electivas</strong> y te faltan{" "}
            <strong>{electivas.faltan}</strong>. Todavía no puedes agregarlas desde aquí; por ahora
            consúltalas en tu portal de matrícula.
          </p>
        </div>
      )}

      {error && <p className="text-14-normal !text-rojo-fuerte">{error}</p>}

      {/* Contador visible: materias y créditos seleccionados. */}
      <div className="tarjeta-hero p-4 flex items-baseline justify-between">
        <span className="text-16-medium font-semibold text-tinta">
          {numSeleccionadas} {numSeleccionadas === 1 ? "materia" : "materias"}
        </span>
        <span className="text-24-black text-tinta tabular-nums">{creditosSeleccionados} créditos</span>
      </div>

      <Button
        type="button"
        className="calcular_btn w-full !text-[20px] !p-4"
        disabled={seleccion.size === 0 || enviando}
        onClick={crear}
      >
        {enviando ? "Creando…" : `Crear semestre (${numSeleccionadas})`}
      </Button>
    </div>
  );
}

function MateriaCard({
  m,
  marcada,
  onToggle,
  ganancia,
}: {
  m: MateriaArmar;
  marcada: boolean;
  onToggle: () => void;
  ganancia: number | null;
}) {
  return (
    <label className="tarjeta p-4 flex items-start gap-3 cursor-pointer">
      <input type="checkbox" className="mt-1 accent-primary w-4 h-4" checked={marcada} onChange={onToggle} />
      <div className="min-w-0">
        <p className="text-16-medium font-semibold">
          {m.codigo} · {m.nombre}
        </p>
        <p className="text-14-normal !text-black-300">
          {m.creditos} cr.{m.fundamental ? " · fundamental" : ""}
          {!esCalificable(m.creditos) ? " · sin nota" : ""}
        </p>

        {m.yaCursada && (
          <p className="text-14-normal !text-primary-ink mt-1">
            🔁 Repetición
            {ganancia != null && ganancia > 0 ? (
              <>
                {" "}
                · Si la cierras con A, tu índice sube +{ganancia.toFixed(2)}
                {m.ultimaLetra === "D"
                  ? " (la D anterior se borra del cálculo)"
                  : m.ultimaLetra === "F"
                    ? " (la F anterior se mantiene)"
                    : ""}
              </>
            ) : m.ultimaLetra === "F" ? (
              " · la F anterior se mantiene en el cálculo"
            ) : (
              ""
            )}
          </p>
        )}

        {m.estado === "pendiente" && m.faltanPrereqs.length > 0 && (
          <p className="text-14-normal !text-ambar-fuerte mt-1">
            ⚠ Te faltan por aprobar: {m.faltanPrereqs.join(", ")}. Puedes llevarla igual si los cursas
            en paralelo o los convalidaste.
          </p>
        )}
      </div>
    </label>
  );
}

function FilaBusqueda({ m, onAgregar }: { m: MateriaArmar; onAgregar: () => void }) {
  return (
    <button
      type="button"
      onClick={onAgregar}
      className={`w-full text-left px-3 py-2 hover:bg-crema transition-colors ${m.estado === "aprobada" ? "opacity-70" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-16-medium text-tinta min-w-0">
          {m.codigo} · {m.nombre}
        </span>
        <span className="shrink-0 flex items-center gap-1.5">
          {m.yaCursada && <span className="text-[11px] font-semibold !text-primary-ink">🔁 repetir</span>}
          {m.estado === "aprobada" && (
            <span className="text-[11px] font-semibold !text-verde-fuerte bg-verde-suave rounded-full px-2 py-0.5">
              ✓ aprobada
            </span>
          )}
          {m.estado === "en_curso" && (
            <span className="text-[11px] font-semibold !text-ambar-fuerte bg-ambar-suave rounded-full px-2 py-0.5">
              en curso
            </span>
          )}
        </span>
      </div>
      <p className="text-14-normal !text-black-300">{m.creditos} cr.</p>
    </button>
  );
}

type Grupo = { key: string; label: string; items: MateriaArmar[] };

// Agrupa por posición del plan (Verano → 1er → 2do dentro de cada año), ordenado
// por secuenciaDePeriodo. Las materias sin posición caen en un grupo final.
function agrupar(materias: MateriaArmar[]): Grupo[] {
  const claveDe = (m: MateriaArmar) =>
    m.anioSugerido != null && m.periodoSugerido != null ? `${m.anioSugerido}:${m.periodoSugerido}` : "sin";

  const mapa = new Map<string, MateriaArmar[]>();
  for (const m of materias) {
    const k = claveDe(m);
    const arr = mapa.get(k);
    if (arr) arr.push(m);
    else mapa.set(k, [m]);
  }

  const seqDe = (key: string) => {
    if (key === "sin") return Infinity;
    const [a, t] = key.split(":");
    return secuenciaDePeriodo(Number(a), t as TipoPeriodo);
  };
  const etiquetaDe = (key: string) => {
    if (key === "sin") return "Sin ubicación en el plan";
    const [a, t] = key.split(":");
    return `Año ${a} · ${nombreTipoPeriodo(t as TipoPeriodo)}`;
  };

  return [...mapa.entries()]
    .map(([key, items]) => ({
      key,
      label: etiquetaDe(key),
      items: [...items].sort((a, b) => a.codigo.localeCompare(b.codigo)),
    }))
    .sort((a, b) => seqDe(a.key) - seqDe(b.key));
}
