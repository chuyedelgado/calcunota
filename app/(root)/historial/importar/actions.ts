"use server";

import { EstadoCurso } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  esCalificable,
  esMarcadorDeElectiva,
  letraAPuntos,
  letraAprueba,
  secuenciaDePeriodo,
  type Letra,
  type TipoPeriodo,
} from "@/lib/calculos";
import { buscar } from "@/lib/texto";
import { parsearHistorial, type CodigoNota } from "@/lib/importarHistorial";
import { extraerTextoHistorial } from "@/lib/importarHistorialPdf";
import { emparejarHistorial, type Emparejamiento, type MateriaRef } from "@/lib/emparejarHistorial";

const LIMITE_BYTES = 5 * 1024 * 1024; // 5 MB
const TIPOS_VALIDOS = new Set<TipoPeriodo>(["PRIMER_SEMESTRE", "SEGUNDO_SEMESTRE", "VERANO"]);
const CODIGOS_VALIDOS = new Set<CodigoNota>(["A", "B", "C", "D", "F", "P", "W", "R", "I"]);

async function perfilDeSesion() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return prisma.perfilEstudiante.findUnique({
    where: { userId: session.user.id },
    select: { id: true, planId: true, universidadId: true },
  });
}

// Materias del plan elegido (créditos del plan). Excluye marcadores de electiva.
async function refsDelPlan(planId: string): Promise<MateriaRef[]> {
  const filas = await prisma.materiaPlan.findMany({
    where: { planId },
    select: { materiaId: true, creditos: true, fundamental: true, materia: { select: { codigo: true, nombre: true } } },
  });
  return filas
    .filter((f) => !esMarcadorDeElectiva(f.materia.codigo))
    .map((f) => ({
      materiaId: f.materiaId,
      codigo: f.materia.codigo,
      nombre: f.materia.nombre,
      creditos: f.creditos,
      fundamental: f.fundamental,
      fuente: "plan" as const,
    }));
}

// Créditos más frecuentes por materia (para las convalidadas fuera del plan).
async function creditosFrecuentes(): Promise<Map<string, number>> {
  const grupos = await prisma.materiaPlan.groupBy({
    by: ["materiaId", "creditos"],
    _count: { _all: true },
  });
  const mejor = new Map<string, { creditos: number; n: number }>();
  for (const g of grupos) {
    const prev = mejor.get(g.materiaId);
    const n = g._count._all;
    if (!prev || n > prev.n || (n === prev.n && g.creditos > prev.creditos)) {
      mejor.set(g.materiaId, { creditos: g.creditos, n });
    }
  }
  return new Map([...mejor].map(([k, v]) => [k, v.creditos]));
}

export type RevisionHistorial = {
  ok: boolean;
  error?: string;
  periodos: string[];
  lineasSinReconocer: string[];
  emparejamientos: Emparejamiento[];
};

/**
 * Extrae el texto del PDF, lo parsea y lo empareja contra el plan elegido.
 * El PDF NO se almacena: se procesa en memoria y se descarta.
 */
export async function procesarHistorialPdf(formData: FormData): Promise<RevisionHistorial> {
  const vacio = { periodos: [], lineasSinReconocer: [], emparejamientos: [] };
  const perfil = await perfilDeSesion();
  if (!perfil) return { ok: false, error: "Sesión no válida.", ...vacio };

  const planId = String(formData.get("planId") ?? "");
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File)) return { ok: false, error: "Falta el archivo PDF.", ...vacio };
  if (archivo.type !== "application/pdf" && !archivo.name.toLowerCase().endsWith(".pdf")) {
    return { ok: false, error: "El archivo debe ser un PDF.", ...vacio };
  }
  if (archivo.size === 0) return { ok: false, error: "El archivo está vacío.", ...vacio };
  if (archivo.size > LIMITE_BYTES) return { ok: false, error: "El PDF supera el límite de 5 MB.", ...vacio };

  // El plan debe existir y ser de la misma universidad del estudiante.
  const plan = await prisma.planEstudio.findUnique({
    where: { id: planId },
    select: { carrera: { select: { facultad: { select: { universidadId: true } } } } },
  });
  if (!plan || plan.carrera.facultad.universidadId !== perfil.universidadId) {
    return { ok: false, error: "Plan no válido.", ...vacio };
  }

  let texto: string;
  try {
    const datos = new Uint8Array(await archivo.arrayBuffer());
    texto = await extraerTextoHistorial(datos);
  } catch {
    return { ok: false, error: "No se pudo leer el PDF. ¿Es el Historial de Notas del portal?", ...vacio };
  }

  const { filas, periodosDetectados, lineasSinReconocer } = parsearHistorial(texto);
  if (filas.length === 0) {
    return {
      ok: false,
      error: "No se reconoció ninguna materia. Asegúrate de subir el Historial de Notas del portal de matrícula.",
      periodos: periodosDetectados,
      lineasSinReconocer,
      emparejamientos: [],
    };
  }

  const [planRefs, creditos] = await Promise.all([refsDelPlan(planId), creditosFrecuentes()]);
  const enPlan = new Set(planRefs.map((r) => r.materiaId));
  const catalogo: MateriaRef[] = (
    await prisma.materia.findMany({
      where: { universidadId: perfil.universidadId },
      select: { id: true, codigo: true, nombre: true },
    })
  )
    .filter((m) => !enPlan.has(m.id) && !esMarcadorDeElectiva(m.codigo))
    .map((m) => ({
      materiaId: m.id,
      codigo: m.codigo,
      nombre: m.nombre,
      creditos: creditos.get(m.id) ?? 3,
      fundamental: false,
      fuente: "catalogo" as const,
    }));

  return {
    ok: true,
    periodos: periodosDetectados,
    lineasSinReconocer,
    emparejamientos: emparejarHistorial(filas, planRefs, catalogo),
  };
}

/** Búsqueda manual para reasignar una materia difusa o sin resolver. */
export async function buscarMateriaParaImportar(query: string, planId: string): Promise<MateriaRef[]> {
  const perfil = await perfilDeSesion();
  if (!perfil) return [];
  const q = query.trim();
  if (q.length < 2) return [];

  const planRefs = await refsDelPlan(planId);
  const enPlan = new Map(planRefs.map((r) => [r.materiaId, r]));

  const todas = await prisma.materia.findMany({
    where: { universidadId: perfil.universidadId },
    select: { id: true, codigo: true, nombre: true },
  });
  const top = buscar(todas, q, (m) => `${m.codigo} ${m.nombre}`)
    .filter((m) => !esMarcadorDeElectiva(m.codigo))
    .slice(0, 20);
  if (top.length === 0) return [];

  const creditos = await creditosFrecuentes();
  return top.map((m) => {
    const enp = enPlan.get(m.id);
    if (enp) return enp;
    return {
      materiaId: m.id,
      codigo: m.codigo,
      nombre: m.nombre,
      creditos: creditos.get(m.id) ?? 3,
      fundamental: false,
      fuente: "catalogo" as const,
    };
  });
}

// --- Guardado ---

export type ItemImportado = {
  materiaId: string;
  creditos: number;
  fundamental: boolean;
  anio: number;
  tipo: TipoPeriodo;
  codigoNota: CodigoNota;
};

export type ResultadoGuardado = { ok: boolean; error?: string; guardados: number };

function resolverEstado(
  codigo: CodigoNota,
  calificable: boolean,
): { estado: EstadoCurso; letra: Letra | null; puntos: number | null } {
  if (codigo === "R") return { estado: EstadoCurso.RETIRADO, letra: null, puntos: null };
  // Una incompleta es un intento cerrado del pasado, NO un curso activo. El
  // esquema no tiene INCOMPLETA, así que va a RETIRADO: se registra sin contar y
  // sin activarse. Nunca EN_CURSO: ese estado significa "periodo activo" (lib/
  // contextoEstudiante.ts filtra enCurso solo por estado), y una I de 2024
  // aparecería como si el estudiante la cursara hoy.
  if (codigo === "I") return { estado: EstadoCurso.RETIRADO, letra: null, puntos: null };
  if (codigo === "P" || codigo === "W") return { estado: EstadoCurso.APROBADO, letra: null, puntos: null };
  // A/B/C/D/F. Una materia sin créditos no se califica: se aprueba sin letra.
  if (!calificable) return { estado: EstadoCurso.APROBADO, letra: null, puntos: null };
  const letra = codigo as Letra;
  return {
    estado: letraAprueba(letra) ? EstadoCurso.APROBADO : EstadoCurso.REPROBADO,
    letra,
    puntos: letraAPuntos(letra),
  };
}

/**
 * Guarda el historial revisado. modo "reemplazar" borra los cursos previos;
 * "fusionar" respeta los existentes y hace upsert por (materia, periodo).
 */
export async function guardarHistorialImportado(
  items: ItemImportado[],
  modo: "reemplazar" | "fusionar",
): Promise<ResultadoGuardado> {
  const perfil = await perfilDeSesion();
  if (!perfil) return { ok: false, error: "Sesión no válida.", guardados: 0 };
  if (items.length === 0) return { ok: true, guardados: 0 };

  const anioActual = new Date().getFullYear();

  // Validación previa: materias de la UTP, periodos y créditos en rango.
  const materiaIds = [...new Set(items.map((i) => i.materiaId))];
  const validas = new Set(
    (
      await prisma.materia.findMany({
        where: { id: { in: materiaIds }, universidadId: perfil.universidadId },
        select: { id: true },
      })
    ).map((m) => m.id),
  );
  for (const it of items) {
    if (!validas.has(it.materiaId)) return { ok: false, error: "Una materia no existe en la UTP.", guardados: 0 };
    if (!TIPOS_VALIDOS.has(it.tipo)) return { ok: false, error: "Periodo inválido.", guardados: 0 };
    if (!CODIGOS_VALIDOS.has(it.codigoNota)) return { ok: false, error: "Código de nota inválido.", guardados: 0 };
    if (!Number.isInteger(it.anio) || it.anio < 1980 || it.anio > anioActual + 1) {
      return { ok: false, error: "Hay un año de periodo fuera de rango.", guardados: 0 };
    }
    if (!Number.isInteger(it.creditos) || it.creditos < 0 || it.creditos > 12) {
      return { ok: false, error: "Créditos inválidos.", guardados: 0 };
    }
  }

  if (modo === "reemplazar") {
    await prisma.curso.deleteMany({ where: { perfilId: perfil.id } });
  }

  // Secuencias por materia (existentes tras el posible borrado + este lote)
  // para marcar repeticiones.
  const existentes = await prisma.curso.findMany({
    where: { perfilId: perfil.id },
    select: { materiaId: true, periodo: { select: { anio: true, tipo: true } } },
  });
  const seqPorMateria = new Map<string, number[]>();
  const push = (m: string, s: number) => seqPorMateria.set(m, [...(seqPorMateria.get(m) ?? []), s]);
  for (const e of existentes) push(e.materiaId, secuenciaDePeriodo(e.periodo.anio, e.periodo.tipo as TipoPeriodo));
  for (const it of items) push(it.materiaId, secuenciaDePeriodo(it.anio, it.tipo));

  let guardados = 0;
  for (const it of items) {
    const seq = secuenciaDePeriodo(it.anio, it.tipo);
    const esRepeticion = (seqPorMateria.get(it.materiaId) ?? []).some((s) => s < seq);
    const { estado, letra, puntos } = resolverEstado(it.codigoNota, esCalificable(it.creditos));

    const periodo = await prisma.periodo.upsert({
      where: { anio_tipo: { anio: it.anio, tipo: it.tipo } },
      create: { anio: it.anio, tipo: it.tipo },
      update: {},
      select: { id: true },
    });

    await prisma.curso.upsert({
      where: { perfilId_materiaId_periodoId: { perfilId: perfil.id, materiaId: it.materiaId, periodoId: periodo.id } },
      create: {
        perfilId: perfil.id,
        materiaId: it.materiaId,
        periodoId: periodo.id,
        creditos: it.creditos,
        fundamental: it.fundamental,
        esRepeticion,
        estado,
        notaFinal: null,
        letraFinal: letra,
        puntos,
      },
      update: {
        creditos: it.creditos,
        fundamental: it.fundamental,
        esRepeticion,
        estado,
        notaFinal: null,
        letraFinal: letra,
        puntos,
      },
      select: { id: true },
    });
    guardados++;
  }

  return { ok: true, guardados };
}
