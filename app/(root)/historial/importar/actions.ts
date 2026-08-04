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
import { parsearHistorial, type CodigoNota, type FilaHistorial } from "@/lib/importarHistorial";
import { ErrorPdf, extraerTextoHistorial, type MotivoFalloPdf } from "@/lib/importarHistorialPdf";
import { emparejarHistorial, type Emparejamiento, type MateriaRef } from "@/lib/emparejarHistorial";
import { creditosFrecuentes, materiasDeUniversidad } from "@/lib/catalogo";
import { consumirLimite, mensajeLimite } from "@/lib/limite";

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

// Empareja las filas contra un plan concreto: arma refs del plan + catálogo y
// llama al motor puro. Se comparte entre el primer procesado (con PDF) y el
// reemparejado (cuando el estudiante cambia de plan sin volver a subir el PDF).
async function emparejarContraPlan(
  filas: FilaHistorial[],
  planId: string,
  universidadId: string,
): Promise<Emparejamiento[]> {
  const [planRefs, creditos, todas] = await Promise.all([
    refsDelPlan(planId),
    creditosFrecuentes(),
    materiasDeUniversidad(universidadId),
  ]);
  const enPlan = new Set(planRefs.map((r) => r.materiaId));
  const catalogo: MateriaRef[] = todas
    .filter((m) => !enPlan.has(m.id) && !esMarcadorDeElectiva(m.codigo))
    .map((m) => ({
      materiaId: m.id,
      codigo: m.codigo,
      nombre: m.nombre,
      creditos: creditos.get(m.id) ?? 3,
      fundamental: false,
      fuente: "catalogo" as const,
    }));
  return emparejarHistorial(filas, planRefs, catalogo);
}

// El plan debe existir y ser de la misma universidad del estudiante.
async function planEsDeUniversidad(planId: string, universidadId: string): Promise<boolean> {
  const plan = await prisma.planEstudio.findUnique({
    where: { id: planId },
    select: { carrera: { select: { facultad: { select: { universidadId: true } } } } },
  });
  return !!plan && plan.carrera.facultad.universidadId === universidadId;
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

  if (!(await planEsDeUniversidad(planId, perfil.universidadId))) {
    return { ok: false, error: "Plan no válido.", ...vacio };
  }

  // Procesar un PDF es lo más caro de la app en CPU. La clave es el perfil, no la
  // IP: sale de la sesión y no se puede falsificar.
  const limite = await consumirLimite("importarPdf", perfil.id);
  if (!limite.permitido) {
    return { ok: false, error: mensajeLimite(limite.esperaSegundos), ...vacio };
  }

  let texto: string;
  try {
    const datos = new Uint8Array(await archivo.arrayBuffer());
    texto = await extraerTextoHistorial(datos);
  } catch (e) {
    // Un PDF protegido con contraseña NO es lo mismo que uno corrupto: el
    // estudiante puede resolverlo, así que se le dice exactamente qué hacer.
    const motivo = e instanceof ErrorPdf ? e.motivo : "desconocido";
    const mensaje: Record<MotivoFalloPdf, string> = {
      cifrado:
        "Ese PDF está protegido con contraseña. Vuelve a guardarlo sin protección: " +
        "ábrelo en el portal de matrícula y usa Imprimir → Guardar como PDF.",
      corrupto:
        "El archivo no se pudo leer: parece dañado o no es un PDF. " +
        "Descárgalo otra vez desde el portal de matrícula.",
      tiempo:
        "El PDF tardó demasiado en procesarse. Asegúrate de subir solo el Historial " +
        "de Notas, no un documento con muchas páginas.",
      desconocido: "No se pudo leer el PDF. ¿Es el Historial de Notas del portal?",
    };
    return { ok: false, error: mensaje[motivo], ...vacio };
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

  return {
    ok: true,
    periodos: periodosDetectados,
    lineasSinReconocer,
    emparejamientos: await emparejarContraPlan(filas, planId, perfil.universidadId),
  };
}

/**
 * Reempareja las filas ya parseadas contra OTRO plan, sin volver a subir el PDF.
 * Es la salvaguarda de "elegí el plan equivocado": el estudiante cambia de plan
 * en la revisión y las materias se resuelven de nuevo contra el correcto.
 */
export async function reemparejarConPlan(
  filas: FilaHistorial[],
  planId: string,
): Promise<{ ok: boolean; error?: string; emparejamientos: Emparejamiento[] }> {
  const perfil = await perfilDeSesion();
  if (!perfil) return { ok: false, error: "Sesión no válida.", emparejamientos: [] };
  if (!(await planEsDeUniversidad(planId, perfil.universidadId))) {
    return { ok: false, error: "Plan no válido.", emparejamientos: [] };
  }
  // Las filas vienen del cliente: se filtran las que tengan periodo y código
  // válidos antes de reemparejar (el guardado revalida todo de nuevo).
  const limpias = filas.filter(
    (f) =>
      CODIGOS_VALIDOS.has(f.codigoNota) &&
      TIPOS_VALIDOS.has(f.periodo.tipo) &&
      Number.isInteger(f.periodo.anio),
  );
  if (limpias.length === 0) {
    return { ok: false, error: "No hay materias para reemparejar.", emparejamientos: [] };
  }
  return { ok: true, emparejamientos: await emparejarContraPlan(limpias, planId, perfil.universidadId) };
}

/** Búsqueda manual para reasignar una materia difusa o sin resolver. */
export async function buscarMateriaParaImportar(query: string, planId: string): Promise<MateriaRef[]> {
  const perfil = await perfilDeSesion();
  if (!perfil) return [];
  const q = query.trim().slice(0, 80);
  if (q.length < 2) return [];

  // El plan debe ser de la universidad del estudiante, igual que en
  // procesarHistorialPdf y reemparejarConPlan. Era la única de las tres que no lo
  // comprobaba: los pénsums son catálogo público y hoy solo hay una universidad,
  // pero la comprobación no debe depender de eso.
  if (!(await planEsDeUniversidad(planId, perfil.universidadId))) return [];

  const planRefs = await refsDelPlan(planId);
  const enPlan = new Map(planRefs.map((r) => [r.materiaId, r]));

  // Catálogo desde la caché: buscar() lo necesita completo para tolerar tildes.
  const todas = await materiasDeUniversidad(perfil.universidadId);
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

  // "Reemplazar" borra y reescribe el expediente entero: se acota aparte, con un
  // cupo más estrecho que el de una escritura normal.
  const limite = await consumirLimite(
    modo === "reemplazar" ? "reemplazarHistorial" : "escrituraAutenticada",
    perfil.id,
  );
  if (!limite.permitido) {
    return { ok: false, error: mensajeLimite(limite.esperaSegundos), guardados: 0 };
  }

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
