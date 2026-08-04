import { describe, it, expect } from "vitest";
import { calcularAvance, type CursoAvance, type MateriaPlanAvance } from "./avance";

describe("calcularAvance", () => {
  it("cuenta solo las materias del plan que están aprobadas", () => {
    const plan: MateriaPlanAvance[] = [
      { materiaId: "a", creditos: 4 },
      { materiaId: "b", creditos: 3 },
      { materiaId: "c", creditos: 5 },
    ];
    const cursos: CursoAvance[] = [
      { materiaId: "a", estado: "APROBADO" },
      { materiaId: "b", estado: "EN_CURSO" },
    ];
    expect(calcularAvance(plan, cursos)).toEqual({ creditos: 4, materias: 1, pendientes: 2 });
  });

  it("NO suma los cursos que no pertenecen al plan", () => {
    const plan: MateriaPlanAvance[] = [{ materiaId: "a", creditos: 4 }];
    const cursos: CursoAvance[] = [
      { materiaId: "a", estado: "APROBADO" },
      { materiaId: "fuera", estado: "APROBADO" }, // convalidada, cursada fuera del pénsum
    ];
    expect(calcularAvance(plan, cursos).creditos).toBe(4);
  });

  it("una convalidación cuenta UNA vez: la fila W del plan, no la materia original", () => {
    // Caso real: el estudiante cursó "Dibujo Lineal" (fuera del plan, con nota) y
    // eso convalida "Dibujo Asistido" (fila W del plan). Es una sola obligación.
    const plan: MateriaPlanAvance[] = [
      { materiaId: "dibujo-asistido", creditos: 3 }, // la fila del plan (W)
      { materiaId: "calculo-1", creditos: 5 },
    ];
    const cursos: CursoAvance[] = [
      { materiaId: "dibujo-asistido", estado: "APROBADO" }, // W
      { materiaId: "dibujo-lineal", estado: "APROBADO" }, // la original, fuera del plan
      { materiaId: "calculo-1", estado: "APROBADO" },
    ];
    // 3 + 5 = 8, NO 11: la original no suma.
    expect(calcularAvance(plan, cursos).creditos).toBe(8);
  });

  it("toma los créditos del PLAN, no los del curso", () => {
    // El curso podría traer los créditos del catálogo (4) para una materia que en
    // este plan vale 3; manda el plan.
    const plan: MateriaPlanAvance[] = [{ materiaId: "hci", creditos: 3 }];
    const cursos: CursoAvance[] = [{ materiaId: "hci", estado: "APROBADO" }];
    expect(calcularAvance(plan, cursos).creditos).toBe(3);
  });

  it("reprobada o retirada no cuentan como avance", () => {
    const plan: MateriaPlanAvance[] = [
      { materiaId: "a", creditos: 4 },
      { materiaId: "b", creditos: 4 },
    ];
    const cursos: CursoAvance[] = [
      { materiaId: "a", estado: "REPROBADO" },
      { materiaId: "b", estado: "RETIRADO" },
    ];
    expect(calcularAvance(plan, cursos)).toEqual({ creditos: 0, materias: 0, pendientes: 2 });
  });

  it("una materia repetida cuenta una sola vez", () => {
    const plan: MateriaPlanAvance[] = [{ materiaId: "a", creditos: 4 }];
    const cursos: CursoAvance[] = [
      { materiaId: "a", estado: "REPROBADO" }, // primer intento
      { materiaId: "a", estado: "APROBADO" }, // repetición aprobada
    ];
    expect(calcularAvance(plan, cursos)).toEqual({ creditos: 4, materias: 1, pendientes: 0 });
  });

  it("reproduce el caso real: 129 mal contados -> 120 correctos", () => {
    // 27 materias del plan con nota (111 cr) + 3 filas W del plan (9 cr)
    // + 3 originales convalidadas FUERA del plan (9 cr) + seminario P (0 cr).
    const plan: MateriaPlanAvance[] = [
      ...Array.from({ length: 27 }, (_, i) => ({ materiaId: `plan-${i}`, creditos: 111 / 27 })),
      { materiaId: "w1", creditos: 3 },
      { materiaId: "w2", creditos: 3 },
      { materiaId: "w3", creditos: 3 },
      { materiaId: "seminario", creditos: 0 },
    ];
    const cursos: CursoAvance[] = [
      ...Array.from({ length: 27 }, (_, i) => ({ materiaId: `plan-${i}`, estado: "APROBADO" })),
      { materiaId: "w1", estado: "APROBADO" },
      { materiaId: "w2", estado: "APROBADO" },
      { materiaId: "w3", estado: "APROBADO" },
      { materiaId: "seminario", estado: "APROBADO" },
      // Las tres originales convalidadas, fuera del plan: 9 cr que NO deben sumar.
      { materiaId: "orig1", estado: "APROBADO" },
      { materiaId: "orig2", estado: "APROBADO" },
      { materiaId: "orig3", estado: "APROBADO" },
    ];
    expect(calcularAvance(plan, cursos).creditos).toBeCloseTo(120, 6);
  });
});
