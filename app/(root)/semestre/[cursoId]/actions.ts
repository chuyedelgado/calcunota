"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  APROBACION_NORMAL,
  calcularEstadoMateria,
  esCalificable,
  nombrePeriodo,
  notaALetra,
  notaAPuntos,
  validarSecciones,
  type TipoPeriodo,
} from "@/lib/calculos";
import { nombreProfesor } from "@/lib/texto";
import type { SeccionData } from "./tipos";

async function perfilDeSesion() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return prisma.perfilEstudiante.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
}

const SELECT_NOTAS = {
  orderBy: { orden: "asc" as const },
  select: { id: true, orden: true, descripcion: true, puntaje: true, puntajeMax: true },
};

// Vuelve a leer el árbol de secciones + notas de un curso (secciones raíz con
// sus subsecciones), en la forma que consume el cliente. No es un Server Action.
async function cargarSecciones(cursoId: string): Promise<SeccionData[]> {
  const top = await prisma.seccion.findMany({
    where: { cursoId, seccionPadreId: null },
    orderBy: { orden: "asc" },
    select: {
      id: true,
      nombre: true,
      porcentaje: true,
      cantidad: true,
      orden: true,
      profesor: { select: { nombre: true } },
      notas: SELECT_NOTAS,
      subsecciones: {
        orderBy: { orden: "asc" },
        select: {
          id: true,
          nombre: true,
          porcentaje: true,
          cantidad: true,
          orden: true,
          notas: SELECT_NOTAS,
        },
      },
    },
  });

  return top.map((s) => ({
    id: s.id,
    nombre: s.nombre,
    porcentaje: s.porcentaje,
    cantidad: s.cantidad,
    orden: s.orden,
    notas: s.notas,
    ...(s.subsecciones.length > 0
      ? {
          profesorNombre: s.profesor?.nombre ?? null,
          subsecciones: s.subsecciones.map((sub) => ({
            id: sub.id,
            nombre: sub.nombre,
            porcentaje: sub.porcentaje,
            cantidad: sub.cantidad,
            orden: sub.orden,
            notas: sub.notas,
          })),
        }
      : {}),
  }));
}

export type ResultadoGuardado = { ok: boolean; error?: string };

// Rellena una Nota YA EXISTENTE por su id. Nunca crea. Un puntaje vacío se
// guarda como null (pendiente), que no es lo mismo que cero.
export async function actualizarNota(input: {
  notaId: string;
  puntaje: number | null;
  puntajeMax: number;
  descripcion: string | null;
}): Promise<ResultadoGuardado> {
  const perfil = await perfilDeSesion();
  if (!perfil) return { ok: false, error: "Sesión no válida." };

  // La nota debe pertenecer a un curso del perfil de la sesión.
  const nota = await prisma.nota.findUnique({
    where: { id: input.notaId },
    select: { seccion: { select: { curso: { select: { perfilId: true } } } } },
  });
  if (!nota || nota.seccion.curso.perfilId !== perfil.id) {
    return { ok: false, error: "No encontrado." };
  }

  if (!(input.puntajeMax > 0)) {
    return { ok: false, error: "El puntaje máximo debe ser mayor que 0." };
  }
  if (input.puntaje !== null) {
    if (!Number.isFinite(input.puntaje) || input.puntaje < 0 || input.puntaje > input.puntajeMax) {
      return { ok: false, error: "El puntaje debe estar entre 0 y el máximo." };
    }
  }

  const descripcion = input.descripcion?.trim() ? input.descripcion.trim() : null;

  await prisma.nota.update({
    where: { id: input.notaId },
    data: { puntaje: input.puntaje, puntajeMax: input.puntajeMax, descripcion },
  });
  return { ok: true };
}

export type SubEsquema = { id: string; nombre: string; porcentaje: number; cantidad: number };
export type SeccionEsquema = {
  id: string;
  nombre: string;
  porcentaje: number;
  cantidad: number;
  profesorNombre?: string | null;
  subsecciones?: SubEsquema[];
};

export type ResultadoEsquema = { ok: boolean; error?: string; secciones?: SeccionData[] };

type NotaExistente = { id: string; orden: number; puntaje: number | null };

// Reconciliación de notas de una sección hoja: sube la cantidad → crea Nota
// faltantes en null; baja → borra desde el final y sólo las vacías. Devuelve la
// cantidad final real (puede quedar por encima del objetivo si el final tiene
// notas con puntaje). tx es la transacción de Prisma.
async function reconciliarNotas(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  seccionId: string,
  existentes: NotaExistente[],
  objetivo: number,
): Promise<number> {
  const actual = existentes.length;
  if (objetivo > actual) {
    const nuevas = [];
    for (let o = actual + 1; o <= objetivo; o++) {
      nuevas.push({ seccionId, orden: o, puntaje: null, puntajeMax: 100 });
    }
    await tx.nota.createMany({ data: nuevas });
    return objetivo;
  }
  if (objetivo < actual) {
    let restantes = actual;
    for (const n of [...existentes].sort((a, b) => b.orden - a.orden)) {
      if (restantes <= objetivo) break;
      if (n.puntaje === null) {
        await tx.nota.delete({ where: { id: n.id } });
        restantes -= 1;
      } else {
        break;
      }
    }
    return restantes;
  }
  return actual;
}

// Árbol del esquema → forma del motor, para validar.
function esquemaAEval(secciones: SeccionEsquema[]) {
  return secciones.map((s) => {
    const subs = s.subsecciones ?? [];
    return subs.length > 0
      ? {
          nombre: s.nombre,
          porcentaje: s.porcentaje,
          cantidad: 0,
          notas: [],
          subsecciones: subs.map((x) => ({ nombre: x.nombre, porcentaje: x.porcentaje, cantidad: x.cantidad, notas: [] })),
        }
      : { nombre: s.nombre, porcentaje: s.porcentaje, cantidad: s.cantidad, notas: [] };
  });
}

// Ajusta el esquema de evaluación completo, incluyendo subsecciones anidadas
// (laboratorio). Crea, actualiza o borra secciones y subsecciones, preservando
// las notas que ya tienen puntaje. Valida que los porcentajes sumen 100 arriba
// y dentro de cada grupo de subsecciones.
export async function guardarEsquema(
  cursoId: string,
  secciones: SeccionEsquema[],
): Promise<ResultadoEsquema> {
  const perfil = await perfilConUni();
  if (!perfil) return { ok: false, error: "Sesión no válida." };

  const curso = await prisma.curso.findUnique({
    where: { id: cursoId },
    select: {
      perfilId: true,
      secciones: {
        where: { seccionPadreId: null },
        select: {
          id: true,
          notas: { select: { id: true, orden: true, puntaje: true } },
          subsecciones: {
            select: { id: true, notas: { select: { id: true, orden: true, puntaje: true } } },
          },
        },
      },
    },
  });
  if (!curso || curso.perfilId !== perfil.id) return { ok: false, error: "No encontrado." };

  // Validación de estructura y porcentajes.
  if (secciones.length === 0) return { ok: false, error: "Agrega al menos una sección." };
  for (const s of secciones) {
    if (!s.nombre.trim()) return { ok: false, error: "Cada sección necesita un nombre." };
    if (!(s.porcentaje > 0)) return { ok: false, error: "Los porcentajes deben ser mayores que 0." };
    const subs = s.subsecciones ?? [];
    if (subs.length > 0) {
      for (const x of subs) {
        if (!x.nombre.trim()) return { ok: false, error: "Cada subsección necesita un nombre." };
        if (!(x.porcentaje > 0)) return { ok: false, error: "Los porcentajes de subsecciones deben ser mayores que 0." };
        if (!Number.isInteger(x.cantidad) || x.cantidad < 1) {
          return { ok: false, error: "La cantidad de notas debe ser un entero mayor o igual a 1." };
        }
      }
    } else if (!Number.isInteger(s.cantidad) || s.cantidad < 1) {
      return { ok: false, error: "La cantidad de notas debe ser un entero mayor o igual a 1." };
    }
  }
  const v = validarSecciones(esquemaAEval(secciones));
  if (!v.valido) {
    if (v.subseccionesInvalidas.length > 0) {
      const bad = v.subseccionesInvalidas[0];
      return { ok: false, error: `Las subsecciones de "${bad.nombre}" deben sumar 100 (ahora suman ${bad.suma}).` };
    }
    return { ok: false, error: `Los porcentajes deben sumar 100 (ahora suman ${v.suma}).` };
  }

  // Índices de lo existente.
  const topExistente = new Map(curso.secciones.map((s) => [s.id, s]));
  const subExistente = new Map<string, NotaExistente[]>();
  for (const s of curso.secciones) for (const sub of s.subsecciones) subExistente.set(sub.id, sub.notas);

  const idsTopEntrada = new Set(secciones.map((s) => s.id));
  const idsSubEntrada = new Set(secciones.flatMap((s) => (s.subsecciones ?? []).map((x) => x.id)));

  // Profesores de laboratorio (por nombre normalizado).
  const profIdPorNombre = new Map<string, string>();
  for (const s of secciones) {
    const nombre = (s.subsecciones?.length ?? 0) > 0 && s.profesorNombre ? nombreProfesor(s.profesorNombre) : "";
    if (nombre && !profIdPorNombre.has(nombre)) {
      const prof = await prisma.profesor.upsert({
        where: { universidadId_nombre: { universidadId: perfil.universidadId, nombre } },
        create: { nombre, universidadId: perfil.universidadId, verificado: false },
        update: {},
        select: { id: true },
      });
      profIdPorNombre.set(nombre, prof.id);
    }
  }

  await prisma.$transaction(async (tx) => {
    // 1. Borra secciones raíz que ya no están (cascada borra sus subsecciones).
    for (const s of curso.secciones) {
      if (!idsTopEntrada.has(s.id)) await tx.seccion.delete({ where: { id: s.id } });
    }
    // 2. Borra subsecciones que ya no están (de padres que sobreviven).
    for (const s of curso.secciones) {
      if (!idsTopEntrada.has(s.id)) continue;
      for (const sub of s.subsecciones) {
        if (!idsSubEntrada.has(sub.id)) await tx.seccion.delete({ where: { id: sub.id } });
      }
    }

    for (let i = 0; i < secciones.length; i++) {
      const s = secciones[i];
      const subs = s.subsecciones ?? [];
      const existente = topExistente.get(s.id);
      const profN = subs.length > 0 && s.profesorNombre ? nombreProfesor(s.profesorNombre) : "";
      const profesorId = profN ? (profIdPorNombre.get(profN) ?? null) : null;

      if (subs.length > 0) {
        // GRUPO (laboratorio): sin notas propias.
        let padreId: string;
        if (existente) {
          // Si antes era hoja con notas, se borran (un grupo no tiene notas).
          if (existente.notas.length > 0) await tx.nota.deleteMany({ where: { seccionId: existente.id } });
          await tx.seccion.update({
            where: { id: existente.id },
            data: { nombre: s.nombre.trim(), porcentaje: s.porcentaje, cantidad: 0, orden: i + 1, profesorId },
          });
          padreId = existente.id;
        } else {
          const creada = await tx.seccion.create({
            data: { cursoId, nombre: s.nombre.trim(), porcentaje: s.porcentaje, cantidad: 0, orden: i + 1, profesorId },
            select: { id: true },
          });
          padreId = creada.id;
        }

        for (let j = 0; j < subs.length; j++) {
          const sub = subs[j];
          const notasSub = subExistente.get(sub.id);
          if (notasSub) {
            const cantidadFinal = await reconciliarNotas(tx, sub.id, notasSub, sub.cantidad);
            await tx.seccion.update({
              where: { id: sub.id },
              data: { nombre: sub.nombre.trim(), porcentaje: sub.porcentaje, cantidad: cantidadFinal, orden: j + 1, seccionPadreId: padreId },
            });
          } else {
            await tx.seccion.create({
              data: {
                cursoId,
                seccionPadreId: padreId,
                nombre: sub.nombre.trim(),
                porcentaje: sub.porcentaje,
                cantidad: sub.cantidad,
                orden: j + 1,
                notas: { create: Array.from({ length: sub.cantidad }, (_, k) => ({ orden: k + 1, puntaje: null, puntajeMax: 100 })) },
              },
            });
          }
        }
      } else {
        // HOJA.
        if (existente) {
          const cantidadFinal = await reconciliarNotas(tx, existente.id, existente.notas, s.cantidad);
          await tx.seccion.update({
            where: { id: existente.id },
            data: { nombre: s.nombre.trim(), porcentaje: s.porcentaje, cantidad: cantidadFinal, orden: i + 1, profesorId: null },
          });
        } else {
          await tx.seccion.create({
            data: {
              cursoId,
              nombre: s.nombre.trim(),
              porcentaje: s.porcentaje,
              cantidad: s.cantidad,
              orden: i + 1,
              notas: { create: Array.from({ length: s.cantidad }, (_, k) => ({ orden: k + 1, puntaje: null, puntajeMax: 100 })) },
            },
          });
        }
      }
    }
  });

  return { ok: true, secciones: await cargarSecciones(cursoId) };
}

// Para materias sin créditos: se aprueban sin nota numérica.
export async function marcarAprobada(cursoId: string): Promise<void> {
  const perfil = await perfilDeSesion();
  if (!perfil) redirect("/");

  const curso = await prisma.curso.findUnique({
    where: { id: cursoId },
    select: { perfilId: true },
  });
  if (!curso || curso.perfilId !== perfil.id) redirect("/semestre");

  await prisma.curso.update({
    where: { id: cursoId },
    data: { estado: "APROBADO", notaFinal: null },
  });
  redirect("/semestre");
}

// ============================================================
// Cierre, retiro y reapertura de cursos
// ============================================================

async function perfilConUni() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return prisma.perfilEstudiante.findUnique({
    where: { userId: session.user.id },
    select: { id: true, universidadId: true },
  });
}

export type CursoCerradoRef = {
  id: string;
  materiaId: string;
  creditos: number;
  notaFinal: number;
  anio: number;
  tipo: TipoPeriodo;
  periodoLabel: string;
};

export type DatosCierre = {
  ok: boolean;
  error?: string;
  // Nota calculada desde las secciones; solo si TODAS tienen puntaje.
  propuesta: number | null;
  completa: boolean;
  profesorActual: string | null;
  profesores: string[];
  // Otros cursos ya cerrados del perfil, para calcular el índice antes/después.
  cursosCerrados: CursoCerradoRef[];
};

export async function prepararCierre(cursoId: string): Promise<DatosCierre> {
  const vacio = {
    propuesta: null,
    completa: false,
    profesorActual: null,
    profesores: [] as string[],
    cursosCerrados: [] as CursoCerradoRef[],
  };
  const perfil = await perfilConUni();
  if (!perfil) return { ok: false, error: "Sesión no válida.", ...vacio };

  const curso = await prisma.curso.findUnique({
    where: { id: cursoId },
    select: {
      perfilId: true,
      profesor: { select: { nombre: true } },
      secciones: {
        where: { seccionPadreId: null },
        select: {
          nombre: true,
          porcentaje: true,
          cantidad: true,
          notas: { select: { puntaje: true, puntajeMax: true } },
          subsecciones: {
            select: {
              nombre: true,
              porcentaje: true,
              cantidad: true,
              notas: { select: { puntaje: true, puntajeMax: true } },
            },
          },
        },
      },
    },
  });
  if (!curso || curso.perfilId !== perfil.id) return { ok: false, error: "No encontrado.", ...vacio };

  // Árbol para el motor (aplana solo). Un grupo aporta sus subsecciones.
  const seccionesEval = curso.secciones.map((s) =>
    s.subsecciones.length > 0
      ? {
          nombre: s.nombre,
          porcentaje: s.porcentaje,
          cantidad: 0,
          notas: [],
          subsecciones: s.subsecciones.map((sub) => ({
            nombre: sub.nombre,
            porcentaje: sub.porcentaje,
            cantidad: sub.cantidad,
            notas: sub.notas.map((n) => ({ puntaje: n.puntaje, puntajeMax: n.puntajeMax })),
          })),
        }
      : {
          nombre: s.nombre,
          porcentaje: s.porcentaje,
          cantidad: s.cantidad,
          notas: s.notas.map((n) => ({ puntaje: n.puntaje, puntajeMax: n.puntajeMax })),
        },
  );

  // Completa: todas las hojas (incluidas las de laboratorio) tienen puntaje.
  const hojas = curso.secciones.flatMap((s) => (s.subsecciones.length > 0 ? s.subsecciones : [s]));
  const completa =
    hojas.length > 0 && hojas.every((h) => h.notas.length > 0 && h.notas.every((n) => n.puntaje !== null));
  const propuesta = completa ? calcularEstadoMateria(seccionesEval).notaActual : null;

  const cerrados = await prisma.curso.findMany({
    where: { perfilId: perfil.id, notaFinal: { not: null }, id: { not: cursoId } },
    select: {
      id: true,
      materiaId: true,
      creditos: true,
      notaFinal: true,
      periodo: { select: { anio: true, tipo: true } },
    },
  });
  const cursosCerrados: CursoCerradoRef[] = cerrados.map((c) => ({
    id: c.id,
    materiaId: c.materiaId,
    creditos: c.creditos,
    notaFinal: c.notaFinal as number,
    anio: c.periodo.anio,
    tipo: c.periodo.tipo as TipoPeriodo,
    periodoLabel: nombrePeriodo(c.periodo.anio, c.periodo.tipo as TipoPeriodo),
  }));

  const profesores = (
    await prisma.profesor.findMany({
      where: { universidadId: perfil.universidadId },
      select: { nombre: true },
      orderBy: { nombre: "asc" },
    })
  ).map((p) => p.nombre);

  return {
    ok: true,
    propuesta,
    completa,
    profesorActual: curso.profesor?.nombre ?? null,
    profesores,
    cursosCerrados,
  };
}

export type ResultadoCierre = { ok: boolean; error?: string };

// La nota OFICIAL manda: se guarda tal cual llega (el estudiante pudo editarla).
// letraFinal y puntos se derivan SIEMPRE con notaALetra/notaAPuntos, que truncan.
export async function cerrarCurso(input: {
  cursoId: string;
  notaFinal: number;
  profesorNombre?: string | null;
}): Promise<ResultadoCierre> {
  const perfil = await perfilConUni();
  if (!perfil) return { ok: false, error: "Sesión no válida." };

  const curso = await prisma.curso.findUnique({
    where: { id: input.cursoId },
    select: { perfilId: true, creditos: true },
  });
  if (!curso || curso.perfilId !== perfil.id) return { ok: false, error: "No encontrado." };
  if (!esCalificable(curso.creditos)) {
    return { ok: false, error: "Las materias sin créditos se aprueban desde la ficha." };
  }
  if (!Number.isFinite(input.notaFinal) || input.notaFinal < 0 || input.notaFinal > 100) {
    return { ok: false, error: "La nota debe estar entre 0 y 100." };
  }

  const letra = notaALetra(input.notaFinal);
  const puntos = notaAPuntos(input.notaFinal);
  const estado = input.notaFinal >= APROBACION_NORMAL ? "APROBADO" : "REPROBADO";

  let profesorId: string | undefined;
  const nombre = input.profesorNombre?.trim() ? nombreProfesor(input.profesorNombre) : "";
  if (nombre) {
    const prof = await prisma.profesor.upsert({
      where: { universidadId_nombre: { universidadId: perfil.universidadId, nombre } },
      create: { nombre, universidadId: perfil.universidadId, verificado: false },
      update: {},
      select: { id: true },
    });
    profesorId = prof.id;
  }

  await prisma.curso.update({
    where: { id: input.cursoId },
    data: {
      notaFinal: input.notaFinal,
      letraFinal: letra,
      puntos,
      estado,
      ...(profesorId ? { profesorId } : {}),
    },
  });
  redirect("/semestre");
}

// RETIRADO: elección manual del estudiante, sin nota.
export async function retirarCurso(cursoId: string): Promise<void> {
  const perfil = await perfilConUni();
  if (!perfil) redirect("/");
  const curso = await prisma.curso.findUnique({ where: { id: cursoId }, select: { perfilId: true } });
  if (!curso || curso.perfilId !== perfil.id) redirect("/semestre");
  await prisma.curso.update({
    where: { id: cursoId },
    data: { estado: "RETIRADO", notaFinal: null, letraFinal: null, puntos: null },
  });
  redirect("/semestre");
}

// Reabrir: vuelve a EN_CURSO limpiando la nota, para corregir capturas.
export async function reabrirCurso(cursoId: string): Promise<void> {
  const perfil = await perfilConUni();
  if (!perfil) redirect("/");
  const curso = await prisma.curso.findUnique({ where: { id: cursoId }, select: { perfilId: true } });
  if (!curso || curso.perfilId !== perfil.id) redirect("/semestre");
  await prisma.curso.update({
    where: { id: cursoId },
    data: { estado: "EN_CURSO", notaFinal: null, letraFinal: null, puntos: null },
  });
  redirect(`/semestre/${cursoId}`);
}
