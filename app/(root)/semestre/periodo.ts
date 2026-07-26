// Plumbing de periodo para las rutas de /semestre: saneamiento de search params
// y enumeración de periodos para el selector. La nomenclatura y la lógica del
// calendario viven en lib/calculos.ts; aquí sólo se importan y se reordena.
//
// (Estos helpers estuvieron un tiempo dentro de lib/calculos.ts, pero esa capa
// es el motor de cálculo puro; al quedar fuera, viven en la capa de la app.)

import { nombrePeriodo, ORDEN_PERIODO, secuenciaDePeriodo, type TipoPeriodo } from "@/lib/calculos";

export type { TipoPeriodo };

// Nombre del tipo sin año, para la posición curricular del plan (metadato del
// plan, no un periodo del calendario). Se deriva de nombrePeriodo para no
// duplicar la nomenclatura, que es única en lib/calculos.ts.
export function nombreTipoPeriodo(tipo: TipoPeriodo): string {
  return nombrePeriodo(0, tipo).replace(/\s*0$/, "").trim();
}

// Sanea el tipo de un search param; cae en PRIMER_SEMESTRE si no es válido.
export function parseTipoPeriodo(valor: unknown): TipoPeriodo {
  const s = String(valor ?? "");
  return (s in ORDEN_PERIODO ? s : "PRIMER_SEMESTRE") as TipoPeriodo;
}

export function parseAnioPeriodo(valor: unknown, actual: number): number {
  const n = Number(valor);
  return Number.isInteger(n) && n >= 1980 && n <= actual + 1 ? n : actual;
}

const TIPOS_EN_ORDEN = (Object.keys(ORDEN_PERIODO) as TipoPeriodo[]).sort(
  (a, b) => ORDEN_PERIODO[a] - ORDEN_PERIODO[b],
);

// Periodos (año × tipo) del rango, ordenados por secuenciaDePeriodo: dentro de
// cada año, Verano → 1er → 2do.
export function periodosEnRango(desde: number, hasta: number): { anio: number; tipo: TipoPeriodo }[] {
  const periodos: { anio: number; tipo: TipoPeriodo; seq: number }[] = [];
  for (let a = desde; a <= hasta; a++) {
    for (const tipo of TIPOS_EN_ORDEN) {
      periodos.push({ anio: a, tipo, seq: secuenciaDePeriodo(a, tipo) });
    }
  }
  return periodos.sort((x, y) => x.seq - y.seq).map((p) => ({ anio: p.anio, tipo: p.tipo }));
}
