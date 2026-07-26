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
import type { SeccionData } from "./tipos";

async function perfilDeSesion() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return prisma.perfilEstudiante.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
}

// Vuelve a leer las secciones + notas de un curso, en la forma que consume el
// cliente. No exportada: no es un Server Action.
async function cargarSecciones(cursoId: string): Promise<SeccionData[]> {
  return prisma.seccion.findMany({
    where: { cursoId },
    orderBy: { orden: "asc" },
    select: {
      id: true,
      nombre: true,
      porcentaje: true,
      cantidad: true,
      orden: true,
      notas: {
        orderBy: { orden: "asc" },
        select: { id: true, orden: true, descripcion: true, puntaje: true, puntajeMax: true },
      },
    },
  });
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

export type SeccionEsquema = { id: string; nombre: string; porcentaje: number; cantidad: number };

export type ResultadoEsquema = { ok: boolean; error?: string; secciones?: SeccionData[] };

// Ajusta el esquema de evaluación: nombres, porcentajes y cantidad de notas.
// Sube la cantidad → crea Nota faltantes en null. Baja → borra desde el final
// y sólo las que estén vacías. Valida que los porcentajes sumen 100.
export async function guardarEsquema(
  cursoId: string,
  secciones: SeccionEsquema[],
): Promise<ResultadoEsquema> {
  const perfil = await perfilDeSesion();
  if (!perfil) return { ok: false, error: "Sesión no válida." };

  const curso = await prisma.curso.findUnique({
    where: { id: cursoId },
    select: { perfilId: true, secciones: { select: { id: true } } },
  });
  if (!curso || curso.perfilId !== perfil.id) {
    return { ok: false, error: "No encontrado." };
  }

  const v = validarSecciones(
    secciones.map((s) => ({ nombre: s.nombre, porcentaje: s.porcentaje, cantidad: s.cantidad, notas: [] })),
  );
  if (!v.valido) {
    return { ok: false, error: `Los porcentajes deben sumar 100 (ahora suman ${v.suma}).` };
  }

  const idsDelCurso = new Set(curso.secciones.map((s) => s.id));
  for (const s of secciones) {
    if (!idsDelCurso.has(s.id)) return { ok: false, error: "Sección inválida." };
    if (!s.nombre.trim()) return { ok: false, error: "Cada sección necesita un nombre." };
    if (!(s.porcentaje > 0)) return { ok: false, error: "Los porcentajes deben ser mayores que 0." };
    if (!Number.isInteger(s.cantidad) || s.cantidad < 1) {
      return { ok: false, error: "La cantidad de notas debe ser un entero mayor o igual a 1." };
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const s of secciones) {
      const notas = await tx.nota.findMany({
        where: { seccionId: s.id },
        orderBy: { orden: "asc" },
        select: { id: true, orden: true, puntaje: true },
      });
      const actual = notas.length;
      let cantidadFinal = actual;

      if (s.cantidad > actual) {
        const nuevas = [];
        for (let o = actual + 1; o <= s.cantidad; o++) {
          nuevas.push({ seccionId: s.id, orden: o, puntaje: null, puntajeMax: 100 });
        }
        await tx.nota.createMany({ data: nuevas });
        cantidadFinal = s.cantidad;
      } else if (s.cantidad < actual) {
        // Desde el final hacia atrás, borra sólo las vacías; se detiene al
        // topar con una nota que ya tiene puntaje.
        let restantes = actual;
        const descendente = [...notas].sort((a, b) => b.orden - a.orden);
        for (const n of descendente) {
          if (restantes <= s.cantidad) break;
          if (n.puntaje === null) {
            await tx.nota.delete({ where: { id: n.id } });
            restantes -= 1;
          } else {
            break;
          }
        }
        cantidadFinal = restantes;
      }

      await tx.seccion.update({
        where: { id: s.id },
        data: { nombre: s.nombre.trim(), porcentaje: s.porcentaje, cantidad: cantidadFinal },
      });
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

// trim + Title Case, para no duplicar profesores.
function tituloCase(valor: string): string {
  return valor
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
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
        select: {
          nombre: true,
          porcentaje: true,
          cantidad: true,
          notas: { select: { puntaje: true, puntajeMax: true } },
        },
      },
    },
  });
  if (!curso || curso.perfilId !== perfil.id) return { ok: false, error: "No encontrado.", ...vacio };

  const seccionesEval = curso.secciones.map((s) => ({
    nombre: s.nombre,
    porcentaje: s.porcentaje,
    cantidad: s.cantidad,
    notas: s.notas.map((n) => ({ puntaje: n.puntaje, puntajeMax: n.puntajeMax })),
  }));
  const completa =
    seccionesEval.length > 0 &&
    seccionesEval.every((s) => s.notas.length > 0 && s.notas.every((n) => n.puntaje !== null));
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
  const nombre = input.profesorNombre?.trim() ? tituloCase(input.profesorNombre) : "";
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
