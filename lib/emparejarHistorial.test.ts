import { describe, it, expect } from "vitest";
import { emparejarHistorial, codigoCuenta, type MateriaRef } from "./emparejarHistorial";
import type { FilaHistorial } from "./importarHistorial";

const plan: MateriaRef[] = [
  { materiaId: "m-calc1", codigo: "7987", nombre: "Cálculo I", creditos: 4, fundamental: true, fuente: "plan" },
  { materiaId: "m-hci", codigo: "1194", nombre: "Interacción Humano Computador (HCI)", creditos: 3, fundamental: false, fuente: "plan" },
  { materiaId: "m-sem", codigo: "0104", nombre: "Seminario de Inducción", creditos: 0, fundamental: false, fuente: "plan" },
];

// El catálogo global NO incluye las del plan; trae créditos "más frecuentes".
const catalogo: MateriaRef[] = [
  { materiaId: "m-conval", codigo: "5555", nombre: "Ética Profesional", creditos: 2, fundamental: false, fuente: "catalogo" },
  { materiaId: "m-hci", codigo: "1194", nombre: "Interacción Humano Computador (HCI)", creditos: 4, fundamental: false, fuente: "catalogo" },
];

function fila(nombre: string, extra: Partial<FilaHistorial> = {}): FilaHistorial {
  return {
    periodo: { anio: 2024, tipo: "PRIMER_SEMESTRE" },
    nombreMateria: nombre,
    codigoNota: "A",
    notaExamenSemestral: null,
    ...extra,
  };
}

describe("emparejarHistorial", () => {
  it("empareja contra el plan por nombre exacto y usa el crédito del PLAN", () => {
    // El PDF trae mayúsculas y sin tildes; debe igualar "Cálculo I".
    const r = emparejarHistorial([fila("CALCULO I")], plan, catalogo)[0];
    expect(r.origen).toBe("plan");
    expect(r.materiaId).toBe("m-calc1");
    expect(r.creditos).toBe(4); // del plan, no del catálogo
    expect(r.fueraDelPlan).toBe(false);
  });

  it("prefiere el plan sobre el catálogo cuando la materia está en ambos", () => {
    const r = emparejarHistorial([fila("Interacción Humano Computador (HCI)")], plan, catalogo)[0];
    expect(r.origen).toBe("plan");
    expect(r.creditos).toBe(3); // el del plan (3), no el del catálogo (4)
    expect(r.fueraDelPlan).toBe(false);
  });

  it("cae al catálogo (fuera del plan) para una convalidada que no está en el pénsum", () => {
    const r = emparejarHistorial([fila("ÉTICA PROFESIONAL", { codigoNota: "W" })], plan, catalogo)[0];
    expect(r.origen).toBe("catalogo");
    expect(r.materiaId).toBe("m-conval");
    expect(r.creditos).toBe(2);
    expect(r.fueraDelPlan).toBe(true);
  });

  it("marca como difuso y ofrece candidatos cuando no hay nombre exacto", () => {
    const r = emparejarHistorial([fila("Calculo")], plan, catalogo)[0];
    expect(r.origen).toBe("difuso");
    expect(r.candidatos.length).toBeGreaterThan(0);
    expect(r.candidatos[0].materiaId).toBe("m-calc1"); // el más relevante, tentativo
    expect(r.materiaId).toBe("m-calc1");
  });

  it("reporta sin_resolver cuando nada coincide", () => {
    const r = emparejarHistorial([fila("Astrofísica Cuántica Aplicada")], plan, catalogo)[0];
    expect(r.origen).toBe("sin_resolver");
    expect(r.materiaId).toBeNull();
    expect(r.candidatos).toEqual([]);
  });

  it("preserva una repetición como dos emparejamientos con índices distintos", () => {
    const filas: FilaHistorial[] = [
      fila("CALCULO I", { codigoNota: "F", periodo: { anio: 2024, tipo: "PRIMER_SEMESTRE" } }),
      fila("CALCULO I", { codigoNota: "A", periodo: { anio: 2024, tipo: "SEGUNDO_SEMESTRE" } }),
    ];
    const r = emparejarHistorial(filas, plan, catalogo);
    expect(r).toHaveLength(2);
    expect(r[0].materiaId).toBe("m-calc1");
    expect(r[1].materiaId).toBe("m-calc1");
    expect(r[0].indice).toBe(0);
    expect(r[1].indice).toBe(1);
    expect(r[0].periodo.tipo).toBe("PRIMER_SEMESTRE");
    expect(r[1].periodo.tipo).toBe("SEGUNDO_SEMESTRE");
  });

  it("codigoCuenta: solo A/B/C/D/F", () => {
    expect(["A", "B", "C", "D", "F"].every(codigoCuenta as never)).toBe(true);
    expect(["P", "W", "R", "I"].some(codigoCuenta as never)).toBe(false);
  });
});
