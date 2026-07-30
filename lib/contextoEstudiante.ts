/**
 * Arma el ContextoEstudiante que consume el motor de recomendaciones
 * (lib/recomendaciones.ts) a partir de Prisma.
 *
 * Ojo con el materiaId: el motor agrupa el historial por materia para detectar
 * repeticiones. Se usa Curso.materiaId (la materia del catálogo, estable entre
 * intentos), NO el id del Curso, que cambia en cada intento.
 */

import { prisma } from "@/lib/prisma";
import { periodoDeFecha, secuenciaDePeriodo, type Letra, type TipoPeriodo } from "@/lib/calculos";
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
  // El periodo vigente sale de la fecha: la app NO cierra semestres por fecha.
  const actual = periodoDeFecha();

  // enCurso son los cursos abiertos DEL PERIODO VIGENTE. La garantía de que no se
  // cuelen semestres viejos es el filtro por PERIODO, no el estado: como la app
  // no cierra por fecha, quien olvidó cerrar un semestre y ya agregó el siguiente
  // tiene cursos EN_CURSO de dos periodos a la vez. Sin acotar por periodo,
  // enCurso mezclaría ambos: créditos inflados y consejos sobre materias ya
  // terminadas. historial: los cursos cerrados de toda la carrera.
  const [enCursoDb, cerradosDb, cursosPeriodoActual, sinCerrarDb] = await Promise.all([
    prisma.curso.findMany({
      where: {
        perfilId: perfil.id,
        estado: "EN_CURSO",
        periodo: { anio: actual.anio, tipo: actual.tipo },
      },
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
    // Total de cursos del periodo vigente, sin importar estado (ver el comentario
    // de cursosPeriodoActual en ContextoEstudiante).
    prisma.curso.count({
      where: { perfilId: perfil.id, periodo: { anio: actual.anio, tipo: actual.tipo } },
    }),
    // Cursos que siguen EN_CURSO en periodos que NO son el vigente: semestres que
    // el estudiante nunca cerró. Solo el periodo, para contarlos por semestre.
    prisma.curso.findMany({
      where: {
        perfilId: perfil.id,
        estado: "EN_CURSO",
        NOT: { periodo: { anio: actual.anio, tipo: actual.tipo } },
      },
      select: { periodo: { select: { anio: true, tipo: true } } },
    }),
  ]);

  // Semestres sin cerrar: agrupados por periodo, del más antiguo al más reciente.
  // Se descartan periodos FUTUROS por si acaso (no deberían existir): solo cuentan
  // los anteriores al vigente, que son los que dejan el índice por debajo del real.
  const secActual = secuenciaDePeriodo(actual.anio, actual.tipo);
  const grupos = new Map<string, { anio: number; periodo: TipoPeriodo; cantidad: number }>();
  for (const c of sinCerrarDb) {
    const tipo = c.periodo.tipo as TipoPeriodo;
    if (secuenciaDePeriodo(c.periodo.anio, tipo) >= secActual) continue;
    const clave = `${c.periodo.anio}-${tipo}`;
    const g = grupos.get(clave) ?? { anio: c.periodo.anio, periodo: tipo, cantidad: 0 };
    g.cantidad++;
    grupos.set(clave, g);
  }
  const cursosSinCerrar = [...grupos.values()].sort(
    (a, b) => secuenciaDePeriodo(a.anio, a.periodo) - secuenciaDePeriodo(b.anio, b.periodo),
  );

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
    cursosPeriodoActual,
    cursosSinCerrar,
    historial,
    indiceObjetivo: perfil.indiceObjetivo,
    creditosPlan: perfil.creditosPlan,
  };
}
