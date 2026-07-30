// Prueba de integración: el parser contra el TEXTO extraído de un historial
// REAL de la UTP (censurado, ver lib/__fixtures__/README.md). Los 10 casos
// unitarios son sintéticos; esta prueba es la que confirma que el parser
// aguanta un documento de verdad, con sus 7 periodos y 34 materias.
//
// Las cifras esperadas salen de la validación manual del PDF por el usuario:
// si el parser da otra cosa, hay una discrepancia real que entender antes de
// construir interfaz encima.

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { parsearHistorial } from "./importarHistorial";

const RUTA = fileURLToPath(new URL("./__fixtures__/historial-real.txt", import.meta.url));
const hayFixture = existsSync(RUTA);
// El fixture es el texto (censurado) de un PDF real. Mientras no exista, esta
// prueba se omite en vez de romper la suite; se activa sola al agregarlo.
const texto = hayFixture ? readFileSync(RUTA, "utf8") : "";
const r = parsearHistorial(texto);

describe.skipIf(!hayFixture)("parsearHistorial sobre el historial real (censurado)", () => {
  it("detecta los 7 periodos en orden", () => {
    expect(r.periodosDetectados).toEqual([
      "2024 V",
      "2024 I",
      "2024 II",
      "2025 V",
      "2025 I",
      "2025 II",
      "2026 I",
    ]);
  });

  it("no deja ninguna línea sin reconocer", () => {
    expect(r.lineasSinReconocer).toEqual([]);
  });

  it("extrae 34 filas de materia", () => {
    expect(r.filas).toHaveLength(34);
  });

  it("tiene la distribución de códigos esperada: 30 A, 1 P, 3 W", () => {
    const conteo = r.filas.reduce<Record<string, number>>((acc, f) => {
      acc[f.codigoNota] = (acc[f.codigoNota] ?? 0) + 1;
      return acc;
    }, {});
    expect(conteo).toEqual({ A: 30, P: 1, W: 3 });
  });

  it("clava el seminario de inducción (P) en 2024 V", () => {
    const fila = r.filas.find((f) => f.nombreMateria === "SEMINARIO DE INDUC. A LA VIDA EST.UNIV.");
    expect(fila).toBeDefined();
    expect(fila?.codigoNota).toBe("P");
    expect(fila?.periodo).toEqual({ anio: 2024, tipo: "VERANO" });
  });

  it("conserva el nombre con paréntesis y su nota semestral (FÍSICA II ... 90)", () => {
    const fila = r.filas.find((f) => f.nombreMateria === "FÍSICA II (ELECTRICIDAD Y MAGNETISMO)");
    expect(fila).toBeDefined();
    expect(fila?.codigoNota).toBe("A");
    expect(fila?.notaExamenSemestral).toBe(90);
  });

  it("conserva el punto final y no inventa nota (METODOS NUMERICOS PARA ING.)", () => {
    const fila = r.filas.find((f) => f.nombreMateria === "METODOS NUMERICOS PARA ING.");
    expect(fila).toBeDefined();
    expect(fila?.codigoNota).toBe("A");
    expect(fila?.notaExamenSemestral).toBeNull();
  });
});
