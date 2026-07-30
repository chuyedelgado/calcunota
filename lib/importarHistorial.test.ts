import { describe, it, expect } from "vitest";
import { parsearHistorial } from "./importarHistorial";

describe("parsearHistorial", () => {
  it("reconoce encabezados de periodo y mapea V/I/II a TipoPeriodo", () => {
    const texto = ["2024 V", "ALGEBRA LINEAL A", "2025 I", "CALCULO II B", "2025 II", "FISICA III C"].join(
      "\n",
    );
    const r = parsearHistorial(texto);

    expect(r.periodosDetectados).toEqual(["2024 V", "2025 I", "2025 II"]);
    expect(r.filas.map((f) => f.periodo)).toEqual([
      { anio: 2024, tipo: "VERANO" },
      { anio: 2025, tipo: "PRIMER_SEMESTRE" },
      { anio: 2025, tipo: "SEGUNDO_SEMESTRE" },
    ]);
    expect(r.lineasSinReconocer).toEqual([]);
  });

  it("interpreta los cinco códigos normales A/B/C/D/F con su nota semestral", () => {
    const texto = [
      "2025 I",
      "MATERIA UNO A 100",
      "MATERIA DOS B 85",
      "MATERIA TRES C 75",
      "MATERIA CUATRO D 65",
      "MATERIA CINCO F 40",
    ].join("\n");
    const r = parsearHistorial(texto);

    expect(r.lineasSinReconocer).toEqual([]);
    expect(r.filas).toEqual([
      { periodo: { anio: 2025, tipo: "PRIMER_SEMESTRE" }, nombreMateria: "MATERIA UNO", codigoNota: "A", notaExamenSemestral: 100 },
      { periodo: { anio: 2025, tipo: "PRIMER_SEMESTRE" }, nombreMateria: "MATERIA DOS", codigoNota: "B", notaExamenSemestral: 85 },
      { periodo: { anio: 2025, tipo: "PRIMER_SEMESTRE" }, nombreMateria: "MATERIA TRES", codigoNota: "C", notaExamenSemestral: 75 },
      { periodo: { anio: 2025, tipo: "PRIMER_SEMESTRE" }, nombreMateria: "MATERIA CUATRO", codigoNota: "D", notaExamenSemestral: 65 },
      { periodo: { anio: 2025, tipo: "PRIMER_SEMESTRE" }, nombreMateria: "MATERIA CINCO", codigoNota: "F", notaExamenSemestral: 40 },
    ]);
  });

  it("registra P/W/R/I sin nota, preservándolos como filas", () => {
    const texto = [
      "2024 I",
      "SEMINARIO DE INDUCCION P",
      "PROGRAMACION I W",
      "HISTORIA DE PANAMA R",
      "LABORATORIO DE QUIMICA I",
    ].join("\n");
    const r = parsearHistorial(texto);

    expect(r.lineasSinReconocer).toEqual([]);
    expect(r.filas.map((f) => [f.nombreMateria, f.codigoNota, f.notaExamenSemestral])).toEqual([
      ["SEMINARIO DE INDUCCION", "P", null],
      ["PROGRAMACION I", "W", null],
      ["HISTORIA DE PANAMA", "R", null],
      ["LABORATORIO DE QUIMICA", "I", null],
    ]);
  });

  it("no confunde el código con un token del nombre (CÁLCULO I A 100)", () => {
    // El nombre termina en "I" (que también es un código); el código real es "A".
    const r = parsearHistorial(["2025 II", "CÁLCULO I A 100"].join("\n"));

    expect(r.lineasSinReconocer).toEqual([]);
    expect(r.filas).toEqual([
      {
        periodo: { anio: 2025, tipo: "SEGUNDO_SEMESTRE" },
        nombreMateria: "CÁLCULO I",
        codigoNota: "A",
        notaExamenSemestral: 100,
      },
    ]);
  });

  it("preserva una materia repetida en dos periodos (F y luego A)", () => {
    const texto = ["2024 I", "CALCULO I F 55", "2024 II", "CALCULO I A 92"].join("\n");
    const r = parsearHistorial(texto);

    // Dos filas, NO se deduplica: el motor aplica D/F por orden cronológico.
    expect(r.filas).toHaveLength(2);
    expect(r.filas[0]).toEqual({
      periodo: { anio: 2024, tipo: "PRIMER_SEMESTRE" },
      nombreMateria: "CALCULO I",
      codigoNota: "F",
      notaExamenSemestral: 55,
    });
    expect(r.filas[1]).toEqual({
      periodo: { anio: 2024, tipo: "SEGUNDO_SEMESTRE" },
      nombreMateria: "CALCULO I",
      codigoNota: "A",
      notaExamenSemestral: 92,
    });
  });

  it("quita el artefacto '(../../../../' pegado al inicio de la página 2", () => {
    // El artefacto puede quedar pegado tanto a un encabezado como a una materia.
    const texto = ["2024 I", "QUIMICA GENERAL B 88", "(../../../../2024 II", "(../../../../FISICA I A 95"].join(
      "\n",
    );
    const r = parsearHistorial(texto);

    expect(r.lineasSinReconocer).toEqual([]);
    expect(r.periodosDetectados).toEqual(["2024 I", "2024 II"]);
    expect(r.filas).toEqual([
      {
        periodo: { anio: 2024, tipo: "PRIMER_SEMESTRE" },
        nombreMateria: "QUIMICA GENERAL",
        codigoNota: "B",
        notaExamenSemestral: 88,
      },
      {
        periodo: { anio: 2024, tipo: "SEGUNDO_SEMESTRE" },
        nombreMateria: "FISICA I",
        codigoNota: "A",
        notaExamenSemestral: 95,
      },
    ]);
  });

  it("conserva nombres con paréntesis y con punto final", () => {
    const texto = [
      "2023 II",
      "FÍSICA II (ELECTRICIDAD Y MAGNETISMO) B 84",
      "METODOS NUMERICOS PARA ING. A 91",
    ].join("\n");
    const r = parsearHistorial(texto);

    expect(r.lineasSinReconocer).toEqual([]);
    expect(r.filas.map((f) => f.nombreMateria)).toEqual([
      "FÍSICA II (ELECTRICIDAD Y MAGNETISMO)",
      "METODOS NUMERICOS PARA ING.",
    ]);
  });

  it("ignora el ruido (ASIGNATURA, Todas) sin marcarlo como sin reconocer", () => {
    const texto = [
      "ASIGNATURA CODIGO NOTA",
      "2025 I",
      "ALGEBRA A 90",
      "Todas las asignaturas aprobadas",
    ].join("\n");
    const r = parsearHistorial(texto);

    expect(r.lineasSinReconocer).toEqual([]);
    expect(r.filas).toHaveLength(1);
    expect(r.filas[0].nombreMateria).toBe("ALGEBRA");
  });

  it("no consume como nota un número que forma parte del nombre (INGLES 1 P)", () => {
    const r = parsearHistorial(["2024 V", "INGLES 1 P"].join("\n"));

    expect(r.lineasSinReconocer).toEqual([]);
    expect(r.filas[0]).toEqual({
      periodo: { anio: 2024, tipo: "VERANO" },
      nombreMateria: "INGLES 1",
      codigoNota: "P",
      notaExamenSemestral: null,
    });
  });

  it("marca sin reconocer una materia sin periodo previo o con código inválido", () => {
    const sinPeriodo = parsearHistorial("ALGEBRA A 90");
    expect(sinPeriodo.filas).toEqual([]);
    expect(sinPeriodo.lineasSinReconocer).toEqual(["ALGEBRA A 90"]);

    const codigoMalo = parsearHistorial(["2025 I", "ALGEBRA Z 90"].join("\n"));
    expect(codigoMalo.filas).toEqual([]);
    expect(codigoMalo.lineasSinReconocer).toEqual(["ALGEBRA Z 90"]);
  });
});
