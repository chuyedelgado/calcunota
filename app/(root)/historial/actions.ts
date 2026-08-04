"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  esCalificable,
  letraAPuntos,
  letraAprueba,
  secuenciaDePeriodo,
  type Letra,
  type TipoPeriodo,
} from "@/lib/calculos";
import { buscar, nombreProfesor } from "@/lib/texto";
import { materiasDeUniversidad } from "@/lib/catalogo";

async function perfilDeSesion() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return prisma.perfilEstudiante.findUnique({
    where: { userId: session.user.id },
    select: { id: true, planId: true, universidadId: true },
  });
}

const TIPOS_VALIDOS = new Set<TipoPeriodo>(["PRIMER_SEMESTRE", "SEGUNDO_SEMESTRE", "VERANO"]);
const LETRAS_VALIDAS = new Set<Letra>(["A", "B", "C", "D", "F"]);

// --- Búsqueda libre sobre el catálogo de la UTP (respaldo del pénsum) ---

export type MateriaBuscada = {
  id: string;
  codigo: string;
  nombre: string;
  creditos: number;
  fundamental: boolean;
};

export async function buscarMaterias(query: string): Promise<MateriaBuscada[]> {
  const perfil = await perfilDeSesion();
  if (!perfil) return [];
  const q = query.trim().slice(0, 80);
  if (q.length < 2) return [];

  // Filtro tolerante en memoria (tildes, mayúsculas, romanos, orden libre) con
  // lib/texto, en dos pasos: primero se acota el catálogo con lo ligero
  // (código + nombre) y luego se leen créditos/fundamental solo de las 25 que
  // pasan, para no arrastrar la relación `planes` de toda la universidad.
  // El catálogo viene de la caché de lib/catalogo.ts, no de la base en cada
  // pulsación: buscar() necesita verlo completo para tolerar las tildes.
  const todas = await materiasDeUniversidad(perfil.universidadId);
  const top = buscar(todas, q, (m) => `${m.codigo} ${m.nombre}`).slice(0, 25);
  if (top.length === 0) return [];

  const planes = await prisma.materiaPlan.findMany({
    where: { materiaId: { in: top.map((m) => m.id) } },
    select: { materiaId: true, creditos: true, fundamental: true },
  });
  const porMateria = new Map<string, { creditos: number; fundamental: boolean }>();
  for (const p of planes) {
    if (!porMateria.has(p.materiaId)) porMateria.set(p.materiaId, { creditos: p.creditos, fundamental: p.fundamental });
  }

  return top.map((m) => ({
    id: m.id,
    codigo: m.codigo,
    nombre: m.nombre,
    creditos: porMateria.get(m.id)?.creditos ?? 3,
    fundamental: porMateria.get(m.id)?.fundamental ?? false,
  }));
}

// --- Guardado del historial por LETRA (cerrado directo, sin Seccion ni Nota) ---

export type ItemHistorial = {
  /** Presente si viene del pénsum; el servidor relee créditos/fundamental de ahí. */
  materiaPlanId?: string | null;
  materiaId: string;
  creditos: number;
  fundamental: boolean;
  anio: number;
  tipo: TipoPeriodo;
  /** null solo para materias sin créditos (se marcan aprobadas sin calificar). */
  letra: Letra | null;
  profesorNombre?: string | null;
};

export type CursoGuardado = {
  id: string;
  materiaId: string;
  creditos: number;
  fundamental: boolean;
  // notaFinal queda en null para el historial por letra; la letra es el dato real.
  notaFinal: number | null;
  letra: Letra | null;
  estado: "APROBADO" | "REPROBADO";
  anio: number;
  tipo: TipoPeriodo;
};

export type ResultadoHistorial = { ok: boolean; error?: string; guardados: CursoGuardado[] };

export async function guardarHistorial(items: ItemHistorial[]): Promise<ResultadoHistorial> {
  const perfil = await perfilDeSesion();
  if (!perfil) return { ok: false, error: "Sesión no válida.", guardados: [] };
  if (items.length === 0) return { ok: true, guardados: [] };

  const anioActual = new Date().getFullYear();

  type Resuelto = {
    materiaId: string;
    creditos: number;
    fundamental: boolean;
    anio: number;
    tipo: TipoPeriodo;
    letra: Letra | null;
    puntos: number | null;
    estado: "APROBADO" | "REPROBADO";
    profesorNombre: string | null;
  };

  const resueltos: Resuelto[] = [];
  for (const it of items) {
    if (!TIPOS_VALIDOS.has(it.tipo)) return { ok: false, error: "Periodo inválido.", guardados: [] };
    if (!Number.isInteger(it.anio) || it.anio < 1980 || it.anio > anioActual + 1) {
      return { ok: false, error: "Hay un año de periodo fuera de rango.", guardados: [] };
    }

    let materiaId = it.materiaId;
    let creditos = it.creditos;
    let fundamental = it.fundamental;

    if (it.materiaPlanId) {
      const mp = await prisma.materiaPlan.findUnique({
        where: { id: it.materiaPlanId },
        select: { planId: true, materiaId: true, creditos: true, fundamental: true },
      });
      if (!mp || mp.planId !== perfil.planId) {
        return { ok: false, error: "Una materia no pertenece a tu plan.", guardados: [] };
      }
      materiaId = mp.materiaId;
      creditos = mp.creditos;
      fundamental = mp.fundamental;
    } else {
      const mat = await prisma.materia.findUnique({
        where: { id: materiaId },
        select: { universidadId: true },
      });
      if (!mat || mat.universidadId !== perfil.universidadId) {
        return { ok: false, error: "Una materia no existe en la UTP.", guardados: [] };
      }
      if (!Number.isInteger(creditos) || creditos < 0 || creditos > 12) {
        return { ok: false, error: "Créditos inválidos.", guardados: [] };
      }
    }

    let letra: Letra | null = null;
    let puntos: number | null = null;
    let estado: "APROBADO" | "REPROBADO" = "APROBADO";

    if (esCalificable(creditos)) {
      if (it.letra === null || !LETRAS_VALIDAS.has(it.letra)) {
        return { ok: false, error: "Cada materia con créditos necesita una calificación.", guardados: [] };
      }
      letra = it.letra;
      puntos = letraAPuntos(letra);
      estado = letraAprueba(letra) ? "APROBADO" : "REPROBADO";
    }

    resueltos.push({
      materiaId,
      creditos,
      fundamental,
      anio: it.anio,
      tipo: it.tipo,
      letra,
      puntos,
      estado,
      profesorNombre: it.profesorNombre ?? null,
    });
  }

  // Secuencias por materia (existentes + este lote) para detectar repeticiones.
  const existentes = await prisma.curso.findMany({
    where: { perfilId: perfil.id },
    select: { materiaId: true, periodo: { select: { anio: true, tipo: true } } },
  });
  const seqPorMateria = new Map<string, number[]>();
  const push = (materiaId: string, seq: number) => {
    const arr = seqPorMateria.get(materiaId) ?? [];
    arr.push(seq);
    seqPorMateria.set(materiaId, arr);
  };
  for (const e of existentes) push(e.materiaId, secuenciaDePeriodo(e.periodo.anio, e.periodo.tipo as TipoPeriodo));
  for (const r of resueltos) push(r.materiaId, secuenciaDePeriodo(r.anio, r.tipo));

  const guardados: CursoGuardado[] = [];
  for (const r of resueltos) {
    const seq = secuenciaDePeriodo(r.anio, r.tipo);
    const esRepeticion = (seqPorMateria.get(r.materiaId) ?? []).some((s) => s < seq);

    const periodo = await prisma.periodo.upsert({
      where: { anio_tipo: { anio: r.anio, tipo: r.tipo } },
      create: { anio: r.anio, tipo: r.tipo },
      update: {},
      select: { id: true },
    });

    let profesorId: string | undefined;
    const nombre = r.profesorNombre?.trim() ? nombreProfesor(r.profesorNombre) : "";
    if (nombre) {
      const prof = await prisma.profesor.upsert({
        where: { universidadId_nombre: { universidadId: perfil.universidadId, nombre } },
        create: { nombre, universidadId: perfil.universidadId, verificado: false },
        update: {},
        select: { id: true },
      });
      profesorId = prof.id;
    }

    try {
      const c = await prisma.curso.create({
        data: {
          perfilId: perfil.id,
          materiaId: r.materiaId,
          periodoId: periodo.id,
          profesorId,
          creditos: r.creditos,
          fundamental: r.fundamental,
          esRepeticion,
          estado: r.estado,
          // Historial por letra: notaFinal null a propósito, no se inventa número.
          notaFinal: null,
          letraFinal: r.letra,
          puntos: r.puntos,
        },
        select: { id: true },
      });
      guardados.push({
        id: c.id,
        materiaId: r.materiaId,
        creditos: r.creditos,
        fundamental: r.fundamental,
        notaFinal: null,
        letra: r.letra,
        estado: r.estado,
        anio: r.anio,
        tipo: r.tipo,
      });
    } catch {
      continue;
    }
  }

  return { ok: true, guardados };
}
