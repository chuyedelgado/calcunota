// Avance de carrera: qué parte del PLAN lleva cumplida el estudiante.
//
// REGLA: se cuentan los créditos de las materias DEL PLAN que están satisfechas,
// tomando los créditos DEL PLAN. Una materia está satisfecha si el estudiante
// tiene un curso APROBADO de ella, ya sea con nota o convalidada (W).
//
// LO QUE NO SE CUENTA: los cursos que no pertenecen al plan. Es el error que
// tenía la app: iteraba los CURSOS en vez de las materias del plan, así que una
// convalidación se contaba DOS veces —la materia original que el estudiante
// cursó de verdad (fuera del pénsum, con nota) y la fila del plan marcada como
// convalidada—, cuando son la misma obligación cumplida una sola vez.
//
// OJO con la distinción frente al ÍNDICE, que es otra cosa y se calcula aparte
// en lib/calculos.ts: al índice entran los cursos CON NOTA, estén o no en el
// plan (la materia original convalidada sí tiene nota real y sí promedia); al
// avance entran los REQUISITOS DEL PLAN cumplidos. Por eso los dos números
// pueden no coincidir, y está bien que no coincidan.
//
// Y CUANDO COINCIDEN, ES CASUALIDAD: en el expediente que destapó el fallo el
// índice y el avance dan los dos 120 créditos, pero solo porque los créditos de
// cada materia convalidada resultan iguales en el catálogo y en el plan. Con que
// una sola difiera (ya pasó: Interacción Humano-Computador vale 3 en un plan y 4
// en otro) los números se separan y AMBOS siguen siendo correctos. No unificar
// las dos cuentas "porque dan lo mismo": son reglas distintas.

export type CursoAvance = {
  materiaId: string;
  estado: string;
};

export type MateriaPlanAvance = {
  materiaId: string;
  creditos: number;
};

export type ResultadoAvance = {
  /** Créditos del plan ya satisfechos. */
  creditos: number;
  /** Materias del plan satisfechas. */
  materias: number;
  /** Materias del plan que aún no se han satisfecho. */
  pendientes: number;
};

/**
 * Créditos del plan satisfechos.
 *
 * @param plan  materias del plan, SIN los marcadores de electiva (los filtra
 *              quien llama, que es el que conoce `esMarcadorDeElectiva`).
 * @param cursos cursos del estudiante, de cualquier periodo.
 */
export function calcularAvance(
  plan: MateriaPlanAvance[],
  cursos: CursoAvance[],
): ResultadoAvance {
  const aprobadas = new Set(
    cursos.filter((c) => c.estado === "APROBADO").map((c) => c.materiaId),
  );

  let creditos = 0;
  let materias = 0;
  for (const mp of plan) {
    if (!aprobadas.has(mp.materiaId)) continue;
    // Los créditos salen del PLAN, no del curso: para una convalidada el curso
    // podría traer los del catálogo, que no tienen por qué coincidir.
    creditos += mp.creditos;
    materias++;
  }

  return { creditos, materias, pendientes: plan.length - materias };
}
