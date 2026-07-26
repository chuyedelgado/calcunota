/**
 * Arma el ContextoEstudiante que consume el motor de recomendaciones
 * (lib/recomendaciones.ts) a partir de Prisma.
 *
 * Ojo con el materiaId: el motor agrupa el historial por materia para detectar
 * repeticiones. Se usa Curso.materiaId (la materia del catálogo, estable entre
 * intentos), NO el id del Curso, que cambia en cada intento.
 */

import { prisma } from "@/lib/prisma";
import type { Letra, TipoPeriodo } from "@/lib/calculos";
import type {
  ContextoEstudiante,
  MateriaCerrada,
  MateriaEnCurso,
} from "@/lib/recomendaciones";

export async function cargarContextoEstudiante(perfil: {
  id: string;
  indiceObjetivo: number | null;
  creditosPlan: number;
}): Promise<ContextoEstudiante> {
  // enCurso: todo lo que el estudiante cursa ahora (EN_CURSO existe solo en el
  // periodo activo). historial: los cursos cerrados de toda la carrera.
  const [enCursoDb, cerradosDb] = await Promise.all([
    prisma.curso.findMany({
      where: { perfilId: perfil.id, estado: "EN_CURSO" },
      select: {
        id: true,
        creditos: true,
        fundamental: true,
        objetivo: true,
        materia: { select: { nombre: true } },
        secciones: {
          orderBy: { orden: "asc" },
          select: {
            nombre: true,
            porcentaje: true,
            cantidad: true,
            notas: {
              orderBy: { orden: "asc" },
              select: { puntaje: true, puntajeMax: true },
            },
          },
        },
      },
    }),
    prisma.curso.findMany({
      where: { perfilId: perfil.id, estado: { in: ["APROBADO", "REPROBADO"] } },
      select: {
        id: true,
        materiaId: true,
        creditos: true,
        fundamental: true,
        notaFinal: true,
        letraFinal: true,
        materia: { select: { nombre: true } },
        periodo: { select: { anio: true, tipo: true } },
      },
    }),
  ]);

  const enCurso: MateriaEnCurso[] = enCursoDb.map((c) => ({
    cursoId: c.id,
    materiaNombre: c.materia.nombre,
    creditos: c.creditos,
    fundamental: c.fundamental,
    objetivo: c.objetivo,
    secciones: c.secciones.map((s) => ({
      nombre: s.nombre,
      porcentaje: s.porcentaje,
      cantidad: s.cantidad,
      notas: s.notas.map((n) => ({ puntaje: n.puntaje, puntajeMax: n.puntajeMax })),
    })),
  }));

  const historial: MateriaCerrada[] = cerradosDb.map((c) => ({
    cursoId: c.id,
    materiaId: c.materiaId,
    materiaNombre: c.materia.nombre,
    creditos: c.creditos,
    fundamental: c.fundamental,
    // Si se cargó por letra, notaFinal es null y manda la letra; si se cerró con
    // nota numérica, manda la nota (la letra queda en null para no duplicar).
    letra: c.notaFinal === null ? (c.letraFinal as Letra | null) : null,
    notaFinal: c.notaFinal,
    anio: c.periodo.anio,
    periodo: c.periodo.tipo as TipoPeriodo,
  }));

  return {
    enCurso,
    historial,
    indiceObjetivo: perfil.indiceObjetivo,
    creditosPlan: perfil.creditosPlan,
  };
}
