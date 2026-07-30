// Parser del "Historial de Notas" que un estudiante imprime desde
// matricula.utp.ac.pa. Recibe el texto plano ya extraído del PDF (ver
// lib/importarHistorialPdf.ts) y lo convierte en filas estructuradas.
//
// Este módulo es ARITMÉTICA/TEXTO PURA: no importa unpdf ni nada de servidor,
// así se puede probar en aislamiento. No reimplementa el motor: reutiliza
// TipoPeriodo de lib/calculos.ts y deja que ese módulo aplique las reglas de
// D/F por orden cronológico (secuenciaDePeriodo). Aquí NO se deduplica: una
// materia repetida aparece dos veces en el historial y se preservan ambas.

import type { TipoPeriodo } from "./calculos";

// Códigos de nota del historial de la UTP (confirmados con la universidad):
//   A B C D F -> cuentan para el índice
//   P         -> aprobado sin nota (Seminario de Inducción, 0 créditos)
//   W         -> convalidada (la materia original aparece aparte con su nota)
//   R         -> retirada
//   I         -> incompleta
// Solo A/B/C/D/F entran al cálculo; P/W/R/I se registran pero no computan.
export type CodigoNota = "A" | "B" | "C" | "D" | "F" | "P" | "W" | "R" | "I";

const CODIGOS_NOTA: ReadonlySet<string> = new Set([
  "A",
  "B",
  "C",
  "D",
  "F",
  "P",
  "W",
  "R",
  "I",
]);

export type FilaHistorial = {
  periodo: { anio: number; tipo: TipoPeriodo };
  nombreMateria: string;
  codigoNota: CodigoNota;
  // Nota del examen semestral, cuando la línea la trae (número suelto al final).
  notaExamenSemestral: number | null;
};

export type ResultadoHistorial = {
  filas: FilaHistorial[];
  // Cada periodo detectado, en el orden en que apareció, como "2025 II".
  periodosDetectados: string[];
  // Líneas que parecían datos pero no se pudieron interpretar. En un historial
  // bien formado esto queda vacío.
  lineasSinReconocer: string[];
};

// V = verano, I = primer semestre, II = segundo semestre. En el encabezado de
// periodo el número romano es la clave; no confundir con el código de nota "I".
const PERIODO_POR_TOKEN: Record<string, TipoPeriodo> = {
  V: "VERANO",
  I: "PRIMER_SEMESTRE",
  II: "SEGUNDO_SEMESTRE",
};

// Encabezado de periodo: "2025 II". "II" antes que "I" en la alternación para
// no cortar en el primer carácter.
const RE_PERIODO = /^(20\d\d)\s+(V|II|I)$/;

// Artefacto que aparece pegado al inicio de la página 2 del PDF: "(../../../../".
// Es un "(" seguido de uno o más "../". Se quita antes de interpretar la línea.
const RE_ARTEFACTO = /^\((?:\.\.\/)+/;

// Número suelto al final de la línea (la nota del examen semestral).
const RE_NUMERO = /^\d+(?:\.\d+)?$/;

// Ruido conocido que se ignora sin marcarlo como "sin reconocer".
function esRuido(linea: string): boolean {
  return /^ASIGNATURA\b/i.test(linea) || /^Todas\b/i.test(linea);
}

export function parsearHistorial(texto: string): ResultadoHistorial {
  const filas: FilaHistorial[] = [];
  const periodosDetectados: string[] = [];
  const lineasSinReconocer: string[] = [];

  let periodoActual: { anio: number; tipo: TipoPeriodo } | null = null;

  for (const cruda of texto.split(/\r?\n/)) {
    // 1. Quitar el artefacto de página y normalizar espacios.
    const linea = cruda.replace(RE_ARTEFACTO, "").trim();
    if (linea === "") continue;

    // 2. Encabezado de periodo.
    const mPeriodo = linea.match(RE_PERIODO);
    if (mPeriodo) {
      const anio = Number(mPeriodo[1]);
      const tipo = PERIODO_POR_TOKEN[mPeriodo[2]];
      periodoActual = { anio, tipo };
      periodosDetectados.push(`${anio} ${mPeriodo[2]}`);
      continue;
    }

    // 3. Ruido conocido.
    if (esRuido(linea)) continue;

    // 4. Materia. Se interpreta de derecha a izquierda porque el nombre puede
    //    contener tokens que parecen códigos ("CÁLCULO I"): el código real es
    //    el último token, salvo que exista una nota numérica al final, en cuyo
    //    caso el código es el penúltimo.
    const tokens = linea.split(/\s+/);

    let notaExamenSemestral: number | null = null;
    if (tokens.length >= 2 && RE_NUMERO.test(tokens[tokens.length - 1])) {
      notaExamenSemestral = Number(tokens.pop());
    }

    const posibleCodigo = tokens.pop();
    const nombreMateria = tokens.join(" ").trim();

    // Una fila válida necesita: periodo vigente, un código conocido y un
    // nombre no vacío. Si algo falla, se reporta sin reconocer.
    if (
      periodoActual === null ||
      posibleCodigo === undefined ||
      !CODIGOS_NOTA.has(posibleCodigo) ||
      nombreMateria === ""
    ) {
      lineasSinReconocer.push(linea);
      continue;
    }

    filas.push({
      periodo: periodoActual,
      nombreMateria,
      codigoNota: posibleCodigo as CodigoNota,
      notaExamenSemestral,
    });
  }

  return { filas, periodosDetectados, lineasSinReconocer };
}
