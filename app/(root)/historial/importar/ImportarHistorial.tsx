"use client";

import { useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  nombrePeriodo,
  secuenciaDePeriodo,
  type Letra,
  type TipoPeriodo,
} from "@/lib/calculos";
import { calcularIndiceDesdeCursos, type CursoParaIndice } from "@/lib/indice";
import { codigoCuenta, type Emparejamiento, type MateriaRef } from "@/lib/emparejarHistorial";
import { textoOpcionPlan, type PlanOpcion } from "@/lib/planes";
import type { CodigoNota } from "@/lib/importarHistorial";
import {
  buscarMateriaParaImportar,
  guardarHistorialImportado,
  procesarHistorialPdf,
  type ItemImportado,
} from "./actions";

const LIMITE_MB = 5;

// Estado local de cada fila del historial, editable en la revisión.
type Fila = Emparejamiento & { omitida: boolean; confirmada: boolean };

type Estado = "ok" | "por_confirmar" | "sin_resolver" | "omitida";

function estadoDe(f: Fila): Estado {
  if (f.omitida) return "omitida";
  if (!f.materiaId) return "sin_resolver";
  if (f.origen === "difuso" && !f.confirmada) return "por_confirmar";
  return "ok";
}

const campo =
  "w-full border border-borde rounded-lg px-4 py-3 bg-superficie text-tinta " +
  "focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60";

export default function ImportarHistorial({
  planes,
  planIdInicial,
  carrera,
  cursosExistentes,
}: {
  planes: PlanOpcion[];
  planIdInicial: string;
  carrera: string;
  cursosExistentes: number;
}) {
  const router = useRouter();
  const [fase, setFase] = useState<"subir" | "revisar" | "listo">("subir");
  const [planId, setPlanId] = useState(planIdInicial);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [modo, setModo] = useState<"reemplazar" | "fusionar">(
    cursosExistentes > 0 ? "fusionar" : "reemplazar",
  );
  const [oficial, setOficial] = useState("");
  const [guardados, setGuardados] = useState(0);
  const [procesando, iniciarProceso] = useTransition();
  const [guardando, iniciarGuardado] = useTransition();

  const fileRef = useRef<HTMLInputElement>(null);

  function elegirArchivo(f: File | null) {
    setError(null);
    if (!f) return setArchivo(null);
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      setArchivo(null);
      return setError("El archivo debe ser un PDF.");
    }
    if (f.size > LIMITE_MB * 1024 * 1024) {
      setArchivo(null);
      return setError(`El PDF supera el límite de ${LIMITE_MB} MB.`);
    }
    setArchivo(f);
  }

  function procesar() {
    if (!archivo) return setError("Elige el PDF de tu Historial de Notas.");
    setError(null);
    iniciarProceso(async () => {
      const fd = new FormData();
      fd.set("planId", planId);
      fd.set("archivo", archivo);
      const res = await procesarHistorialPdf(fd);
      if (!res.ok) {
        setError(res.error ?? "No se pudo procesar el PDF.");
        return;
      }
      setAvisos(res.lineasSinReconocer);
      setFilas(
        res.emparejamientos.map((e) => ({
          ...e,
          omitida: false,
          confirmada: e.origen === "plan" || e.origen === "catalogo",
        })),
      );
      setFase("revisar");
    });
  }

  // --- Edición de filas ---
  function aplicarMateria(indice: number, ref: MateriaRef) {
    setFilas((fs) =>
      fs.map((f) =>
        f.indice === indice
          ? {
              ...f,
              materiaId: ref.materiaId,
              codigo: ref.codigo,
              nombre: ref.nombre,
              creditos: ref.creditos,
              fundamental: ref.fundamental,
              fueraDelPlan: ref.fuente === "catalogo",
              confirmada: true,
              omitida: false,
            }
          : f,
      ),
    );
  }
  function confirmar(indice: number) {
    setFilas((fs) => fs.map((f) => (f.indice === indice ? { ...f, confirmada: true } : f)));
  }
  function alternarOmitir(indice: number) {
    setFilas((fs) => fs.map((f) => (f.indice === indice ? { ...f, omitida: !f.omitida } : f)));
  }

  // --- Índice calculado, en vivo ---
  const cursos: CursoParaIndice[] = useMemo(
    () =>
      filas
        .filter((f) => !f.omitida && f.materiaId && codigoCuenta(f.codigoNota))
        .map((f) => ({
          id: String(f.indice),
          materiaId: f.materiaId!,
          creditos: f.creditos!,
          notaFinal: null,
          letra: f.codigoNota as Letra,
          periodo: f.periodo,
        })),
    [filas],
  );

  const periodos = useMemo(() => {
    const claves = new Map<string, { anio: number; tipo: TipoPeriodo; seq: number }>();
    for (const f of filas) {
      const seq = secuenciaDePeriodo(f.periodo.anio, f.periodo.tipo);
      claves.set(`${f.periodo.anio}-${f.periodo.tipo}`, { ...f.periodo, seq });
    }
    return [...claves.values()].sort((a, b) => a.seq - b.seq);
  }, [filas]);

  const indicePorPeriodo = useMemo(() => {
    return periodos.map((p) => {
      const delPeriodo = cursos.filter((c) => secuenciaDePeriodo(c.periodo.anio, c.periodo.tipo) === p.seq);
      const hasta = cursos.filter((c) => secuenciaDePeriodo(c.periodo.anio, c.periodo.tipo) <= p.seq);
      return {
        p,
        semestral: calcularIndiceDesdeCursos(delPeriodo),
        acumulado: calcularIndiceDesdeCursos(hasta),
      };
    });
  }, [periodos, cursos]);

  const total = useMemo(() => calcularIndiceDesdeCursos(cursos), [cursos]);

  const resumen = useMemo(() => {
    let ok = 0;
    let porConfirmar = 0;
    let sinResolver = 0;
    let omitidas = 0;
    for (const f of filas) {
      const e = estadoDe(f);
      if (e === "ok") ok++;
      else if (e === "por_confirmar") porConfirmar++;
      else if (e === "sin_resolver") sinResolver++;
      else omitidas++;
    }
    return { ok, porConfirmar, sinResolver, omitidas };
  }, [filas]);

  // Autoverificación contra el índice oficial del portal.
  const oficialNum = Number(oficial.replace(",", "."));
  const oficialValido = oficial.trim() !== "" && Number.isFinite(oficialNum);
  const coincideOficial = oficialValido && Math.abs(oficialNum - total.indice) < 0.01;

  function guardar() {
    setError(null);
    const items: ItemImportado[] = filas
      .filter((f) => !f.omitida && f.materiaId)
      .map((f) => ({
        materiaId: f.materiaId!,
        creditos: f.creditos!,
        fundamental: f.fundamental,
        anio: f.periodo.anio,
        tipo: f.periodo.tipo,
        codigoNota: f.codigoNota,
      }));
    if (items.length === 0) return setError("No hay materias resueltas para guardar.");
    iniciarGuardado(async () => {
      const res = await guardarHistorialImportado(items, modo);
      if (!res.ok) return setError(res.error ?? "No se pudo guardar.");
      setGuardados(res.guardados);
      setFase("listo");
      router.refresh();
    });
  }

  // ============================ RENDER ============================

  if (fase === "listo") {
    return (
      <div className="tarjeta p-6 text-center">
        <p className="text-24-black !text-verde-fuerte mb-2">✓ Historial guardado</p>
        <p className="text-16-medium text-tinta mb-6">
          Se guardaron {guardados} {guardados === 1 ? "materia" : "materias"}. Tu índice acumulado
          quedó en <strong>{total.indice.toFixed(2)}</strong>.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={() => router.push("/carrera")} className="calcular_btn">
            Ver mi carrera
          </Button>
          <button
            onClick={() => router.push("/semestre")}
            className="btn-secundario min-h-[44px] px-5 rounded-xl"
          >
            Ir a mi semestre
          </button>
        </div>
      </div>
    );
  }

  if (fase === "subir") {
    return (
      <div className="space-y-6">
        {/* Plan */}
        <div>
          <label htmlFor="planId" className="block text-16-medium font-semibold mb-2">
            Tu plan de estudio
          </label>
          <p className="text-14-normal !text-black-300 mb-2">
            {carrera}. El Historial de Notas no trae el plan; los créditos salen del que elijas.
          </p>
          {planes.length === 1 ? (
            <p className={`${campo} !bg-crema`}>{textoOpcionPlan(planes[0], planes)}</p>
          ) : (
            <select
              id="planId"
              className={campo}
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
            >
              {planes.map((p) => (
                <option key={p.id} value={p.id}>
                  {textoOpcionPlan(p, planes)}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Archivo */}
        <div>
          <label className="block text-16-medium font-semibold mb-2">Tu Historial de Notas (PDF)</label>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => elegirArchivo(e.target.files?.[0] ?? null)}
            className="block w-full text-14-normal text-tinta file:mr-3 file:min-h-[44px] file:px-4 file:rounded-xl file:border-0 file:bg-primary-100 file:text-14-normal file:font-semibold file:!text-primary-ink hover:file:bg-primary/15 file:cursor-pointer"
          />
          {archivo && (
            <p className="text-14-normal !text-black-300 mt-2">
              {archivo.name} · {(archivo.size / 1024).toFixed(0)} KB
            </p>
          )}
          <p className="text-14-normal !text-black-300 mt-2">
            Máx. {LIMITE_MB} MB. El PDF se procesa y se descarta: no se almacena.
          </p>
        </div>

        {error && (
          <p className="text-16-medium !text-rojo-fuerte font-semibold" role="alert">
            {error}
          </p>
        )}

        <Button onClick={procesar} disabled={procesando || !archivo} className="calcular_btn w-full">
          {procesando ? "Procesando…" : "Procesar historial"}
        </Button>
      </div>
    );
  }

  // fase === "revisar"
  return (
    <div className="space-y-6">
      {/* Barra de estado del emparejamiento */}
      <div className="tarjeta p-4">
        <p className="text-16-medium font-semibold text-tinta mb-2">Revisión</p>
        <div className="flex flex-wrap gap-2 text-14-normal">
          <Pastilla tono="verde">{resumen.ok} emparejadas</Pastilla>
          {resumen.porConfirmar > 0 && <Pastilla tono="ambar">{resumen.porConfirmar} por confirmar</Pastilla>}
          {resumen.sinResolver > 0 && <Pastilla tono="rojo">{resumen.sinResolver} sin resolver</Pastilla>}
          {resumen.omitidas > 0 && <Pastilla tono="gris">{resumen.omitidas} omitidas</Pastilla>}
        </div>
        {avisos.length > 0 && (
          <p className="text-14-normal !text-black-300 mt-3">
            {avisos.length} línea(s) del PDF no se reconocieron (encabezados o ruido); no afectan el
            emparejamiento.
          </p>
        )}
      </div>

      {/* Periodos y materias */}
      {periodos.map((p) => {
        const filasP = filas.filter(
          (f) => f.periodo.anio === p.anio && f.periodo.tipo === p.tipo,
        );
        const idx = indicePorPeriodo.find((i) => i.p.seq === p.seq);
        return (
          <div key={`${p.anio}-${p.tipo}`}>
            <div className="flex items-baseline justify-between gap-2 mb-2">
              <h2 className="text-20-medium font-semibold text-tinta">{nombrePeriodo(p.anio, p.tipo)}</h2>
              <span className="text-14-normal !text-black-300 tabular-nums">
                sem. {idx?.semestral.indice.toFixed(2)} · acum. {idx?.acumulado.indice.toFixed(2)}
              </span>
            </div>
            <div className="space-y-2">
              {filasP.map((f) => (
                <FilaMateria
                  key={f.indice}
                  f={f}
                  planId={planId}
                  onAplicar={(ref) => aplicarMateria(f.indice, ref)}
                  onConfirmar={() => confirmar(f.indice)}
                  onOmitir={() => alternarOmitir(f.indice)}
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* Índice total + autoverificación */}
      <div className="tarjeta-hero p-5">
        <div className="flex items-baseline justify-between">
          <span className="text-16-medium font-semibold text-tinta">Índice acumulado</span>
          <span className="text-30-bold text-tinta tabular-nums">{total.indice.toFixed(2)}</span>
        </div>
        <p className="text-14-normal !text-black-300 mt-1">
          {total.creditos} créditos calificables · {total.puntos.toFixed(0)} puntos
        </p>

        <div className="mt-4 pt-4 border-t border-hairline">
          <label htmlFor="oficial" className="block text-14-normal font-semibold text-tinta mb-1">
            Verificación: tu índice oficial del portal
          </label>
          <div className="flex items-center gap-3">
            <input
              id="oficial"
              inputMode="decimal"
              placeholder="Ej. 2.75"
              value={oficial}
              onChange={(e) => setOficial(e.target.value)}
              className={`${campo} w-32`}
            />
            {oficialValido &&
              (coincideOficial ? (
                <span className="text-14-normal font-semibold !text-verde-fuerte">✓ Coincide</span>
              ) : (
                <span className="text-14-normal font-semibold !text-ambar-fuerte">
                  Difiere en {Math.abs(oficialNum - total.indice).toFixed(2)}
                </span>
              ))}
          </div>
          <p className="text-14-normal !text-black-300 mt-1">
            Es la mejor señal de que el emparejamiento quedó bien.
          </p>
        </div>
      </div>

      {/* Modo de guardado */}
      {cursosExistentes > 0 && (
        <div className="tarjeta p-4 space-y-2">
          <p className="text-16-medium font-semibold text-tinta">
            Ya tienes {cursosExistentes} curso(s) cargados
          </p>
          <label className="flex items-start gap-2 text-14-normal text-tinta">
            <input type="radio" name="modo" checked={modo === "fusionar"} onChange={() => setModo("fusionar")} className="mt-1" />
            <span>
              <strong>Fusionar</strong>: conserva lo que ya tienes y agrega/actualiza lo del PDF.
            </span>
          </label>
          <label className="flex items-start gap-2 text-14-normal text-tinta">
            <input type="radio" name="modo" checked={modo === "reemplazar"} onChange={() => setModo("reemplazar")} className="mt-1" />
            <span>
              <strong>Reemplazar</strong>: borra tus cursos actuales y deja solo lo del PDF.
            </span>
          </label>
        </div>
      )}

      {error && (
        <p className="text-16-medium !text-rojo-fuerte font-semibold" role="alert">
          {error}
        </p>
      )}
      {resumen.porConfirmar > 0 && (
        <p className="text-14-normal !text-ambar-fuerte">
          Tienes {resumen.porConfirmar} emparejamiento(s) por confirmar. Revísalos antes de guardar.
        </p>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <Button onClick={guardar} disabled={guardando} className="calcular_btn w-full">
          {guardando ? "Guardando…" : `Guardar ${resumen.ok + resumen.porConfirmar} materias`}
        </Button>
        <button
          onClick={() => {
            setFase("subir");
            setFilas([]);
          }}
          className="btn-secundario min-h-[44px] px-5 rounded-xl shrink-0"
        >
          Volver a subir
        </button>
      </div>
    </div>
  );
}

// ============================ Subcomponentes ============================

function Pastilla({ tono, children }: { tono: "verde" | "ambar" | "rojo" | "gris"; children: ReactNode }) {
  const clases = {
    verde: "bg-verde-suave !text-verde-fuerte",
    ambar: "bg-ambar-suave !text-ambar-fuerte",
    rojo: "bg-rojo-suave !text-rojo-fuerte",
    gris: "bg-superficie border border-borde !text-black-300",
  }[tono];
  return <span className={`rounded-full px-2.5 py-0.5 font-semibold ${clases}`}>{children}</span>;
}

function BadgeLetra({ codigo }: { codigo: CodigoNota }) {
  const clase = codigoCuenta(codigo) ? `badge-letra badge-letra--${codigo.toLowerCase()}` : "badge-letra badge-letra--off";
  return <span className={`${clase} shrink-0`}>{codigo}</span>;
}

function OrigenChip({ f }: { f: Fila }) {
  const est = estadoDe(f);
  if (est === "omitida") return <Pastilla tono="gris">Omitida</Pastilla>;
  if (est === "sin_resolver") return <Pastilla tono="rojo">Sin resolver</Pastilla>;
  if (est === "por_confirmar") return <Pastilla tono="ambar">Posible — revisar</Pastilla>;
  if (f.fueraDelPlan) return <Pastilla tono="ambar">Fuera del plan</Pastilla>;
  return <Pastilla tono="verde">Del plan</Pastilla>;
}

function FilaMateria({
  f,
  planId,
  onAplicar,
  onConfirmar,
  onOmitir,
}: {
  f: Fila;
  planId: string;
  onAplicar: (ref: MateriaRef) => void;
  onConfirmar: () => void;
  onOmitir: () => void;
}) {
  const est = estadoDe(f);
  const requiereAtencion = est === "por_confirmar" || est === "sin_resolver";
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<MateriaRef[]>([]);
  const [buscando, iniciarBusqueda] = useTransition();

  function buscar(texto: string) {
    setQ(texto);
    if (texto.trim().length < 2) return setResultados([]);
    iniciarBusqueda(async () => setResultados(await buscarMateriaParaImportar(texto, planId)));
  }

  const borde =
    est === "sin_resolver"
      ? "border-rojo-fuerte/40"
      : est === "por_confirmar"
        ? "border-ambar-fuerte/40"
        : "border-hairline";

  return (
    <div className={`rounded-xl border ${borde} bg-white p-3 ${f.omitida ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-3">
        <BadgeLetra codigo={f.codigoNota} />
        <div className="min-w-0 flex-1">
          <p className="text-16-medium font-semibold text-tinta">{f.nombreHistorial}</p>
          <p className="text-14-normal !text-black-300">
            {f.materiaId ? (
              <>
                {f.codigo} · {f.creditos} cr.
                {f.nombre && f.nombre !== f.nombreHistorial ? ` · ${f.nombre}` : ""}
              </>
            ) : (
              "Sin materia asignada"
            )}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <OrigenChip f={f} />
            {(requiereAtencion || f.materiaId) && (
              <button
                type="button"
                onClick={() => setAbierto((v) => !v)}
                className="text-14-normal font-semibold !text-primary-ink underline underline-offset-2"
              >
                {abierto ? "Cerrar" : requiereAtencion ? "Resolver" : "Cambiar"}
              </button>
            )}
            <button
              type="button"
              onClick={onOmitir}
              className="text-14-normal font-semibold !text-black-300 underline underline-offset-2"
            >
              {f.omitida ? "Incluir" : "Omitir"}
            </button>
          </div>
        </div>
      </div>

      {abierto && !f.omitida && (
        <div className="mt-3 pt-3 border-t border-hairline space-y-2">
          {est === "por_confirmar" && (
            <button
              type="button"
              onClick={onConfirmar}
              className="w-full text-left rounded-lg bg-verde-suave px-3 py-2 text-14-normal font-semibold !text-verde-fuerte"
            >
              ✓ Confirmar: {f.nombre} ({f.codigo} · {f.creditos} cr.)
            </button>
          )}
          {f.candidatos.length > 0 && (
            <div>
              <p className="text-14-normal !text-black-300 mb-1">Otras coincidencias:</p>
              <div className="space-y-1">
                {f.candidatos
                  .filter((c) => c.materiaId !== f.materiaId)
                  .map((c) => (
                    <CandidatoBtn key={c.materiaId} c={c} onClick={() => onAplicar(c)} />
                  ))}
              </div>
            </div>
          )}
          <div>
            <input
              type="search"
              value={q}
              onChange={(e) => buscar(e.target.value)}
              placeholder="Buscar otra materia…"
              className="w-full border border-hairline rounded-lg px-3 py-2 text-14-normal text-tinta focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            {buscando && <p className="text-14-normal !text-black-300 mt-1">Buscando…</p>}
            {resultados.length > 0 && (
              <div className="mt-1 space-y-1 max-h-56 overflow-y-auto">
                {resultados.map((c) => (
                  <CandidatoBtn key={c.materiaId} c={c} onClick={() => onAplicar(c)} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CandidatoBtn({ c, onClick }: { c: MateriaRef; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-lg border border-hairline px-3 py-2 hover:bg-crema transition-colors"
    >
      <span className="text-14-normal font-semibold text-tinta">{c.nombre}</span>
      <span className="text-14-normal !text-black-300">
        {" "}
        · {c.codigo} · {c.creditos} cr.{c.fuente === "catalogo" ? " · fuera del plan" : ""}
      </span>
    </button>
  );
}
