// Arma CursoIndice[] desde los Curso de Prisma y calcula el índice con el motor
// de lib/calculos.ts. El índice es DERIVADO: no se persiste, se recalcula al
// leer (un estudiante tiene decenas de cursos, no miles).

import {
  calcularIndice,
  secuenciaDePeriodo,
  type CursoIndice,
  type Letra,
  type ResultadoIndice,
  type TipoPeriodo,
} from "./calculos";

export type CursoParaIndice = {
  id: string;
  materiaId: string;
  creditos: number;
  notaFinal: number | null;
  /** Letra directa cuando el curso se cargó por calificación (historial). */
  letra?: Letra | null;
  periodo: { anio: number; tipo: TipoPeriodo };
};

export function calcularIndiceDesdeCursos(cursos: CursoParaIndice[]): ResultadoIndice {
  const items: CursoIndice[] = cursos
    // Cuentan los cursos con resultado, por letra o por nota.
    .filter((c) => c.notaFinal !== null || c.letra != null)
    .map((c) => ({
      id: c.id,
      materiaId: c.materiaId,
      creditos: c.creditos,
      notaFinal: c.notaFinal,
      // La letra se pasa solo cuando el curso se cargó por letra (nota null);
      // si viene del semestre en curso, manda notaFinal.
      letra: c.notaFinal === null ? (c.letra ?? null) : null,
      // La secuencia SIEMPRE sale del calendario: el verano va antes del primer
      // semestre del mismo año, y el enum de Prisma no refleja ese orden.
      secuencia: secuenciaDePeriodo(c.periodo.anio, c.periodo.tipo),
    }));
  return calcularIndice(items);
}
