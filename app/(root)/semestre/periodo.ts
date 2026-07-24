// Utilidades del periodo, compartidas por Server Components, Client Components
// y el Server Action. No importa @prisma/client a propósito: el tipo union
// coincide con el enum PeriodoPlan del schema y así este módulo es seguro de
// importar desde el cliente sin arrastrar el cliente de Prisma al bundle.

export type PeriodoTipo = "PRIMER_SEMESTRE" | "SEGUNDO_SEMESTRE" | "VERANO";

export const TIPOS_PERIODO: { valor: PeriodoTipo; etiqueta: string }[] = [
  { valor: "PRIMER_SEMESTRE", etiqueta: "Primer semestre" },
  { valor: "SEGUNDO_SEMESTRE", etiqueta: "Segundo semestre" },
  { valor: "VERANO", etiqueta: "Verano" },
];

export function etiquetaPeriodo(tipo: string): string {
  return TIPOS_PERIODO.find((t) => t.valor === tipo)?.etiqueta ?? tipo;
}

// No infiere el periodo desde la fecha: sólo valida lo que llega y cae en un
// valor por defecto seguro (PRIMER_SEMESTRE) si el valor no es válido.
export function parseTipo(valor: unknown): PeriodoTipo {
  const s = String(valor ?? "");
  return (TIPOS_PERIODO.some((t) => t.valor === s) ? s : "PRIMER_SEMESTRE") as PeriodoTipo;
}

export function parseAnio(valor: unknown, actual: number): number {
  const n = Number(valor);
  return Number.isInteger(n) && n >= 1980 && n <= actual + 1 ? n : actual;
}
