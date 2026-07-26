// Proyección del índice acumulado hacia un objetivo, razonando en PUNTOS por
// crédito (escala 0-3), no en notas 0-100. Se apoya en los totales que ya
// devuelve calcularIndice() (puntos y créditos que cuentan). No reimplementa
// el motor; solo hace la aritmética de "qué me falta".

export type ProyeccionCarrera = {
  objetivo: number;
  indiceActual: number;
  creditosRestantes: number;
  /** null si ya no quedan créditos por cursar */
  puntosPromedioPorCredito: number | null;
  /** Aun sacando 0 en lo que falta, el objetivo ya está asegurado */
  yaLogrado: boolean;
  /** Alcanzable si el promedio necesario por crédito no pasa de 3 (A) */
  alcanzable: boolean;
  /** Índice máximo posible si saca A (3) en todos los créditos restantes */
  indiceMaximoAlcanzable: number;
};

export function proyectarObjetivoCarrera(
  puntosActuales: number,
  creditosActuales: number,
  totalPlan: number,
  objetivo: number,
): ProyeccionCarrera {
  const creditosRestantes = Math.max(0, totalPlan - creditosActuales);
  const indiceActual = creditosActuales > 0 ? puntosActuales / creditosActuales : 0;
  const indiceMaximoAlcanzable =
    totalPlan > 0 ? (puntosActuales + 3 * creditosRestantes) / totalPlan : indiceActual;

  if (creditosRestantes <= 0) {
    const yaLogrado = indiceActual >= objetivo;
    return {
      objetivo,
      indiceActual,
      creditosRestantes: 0,
      puntosPromedioPorCredito: null,
      yaLogrado,
      alcanzable: yaLogrado,
      indiceMaximoAlcanzable: indiceActual,
    };
  }

  // creditosActuales + creditosRestantes = totalPlan
  const puntosNecesariosTotales = objetivo * totalPlan;
  const puntosFaltantes = puntosNecesariosTotales - puntosActuales;
  const puntosPromedioPorCredito = puntosFaltantes / creditosRestantes;

  return {
    objetivo,
    indiceActual,
    creditosRestantes,
    puntosPromedioPorCredito,
    // Aun con 0 en todo lo que falta, el mínimo final (puntos/total) >= objetivo.
    yaLogrado: puntosFaltantes <= 1e-9,
    alcanzable: puntosPromedioPorCredito <= 3 + 1e-9,
    indiceMaximoAlcanzable,
  };
}

// Traduce un promedio de puntos-por-crédito (0-3) a una referencia de letra.
// A=3, B=2, C=1, D=0. Entre enteros, "entre X y Y" para no engañar.
const PUNTOS_LETRA = ["D", "C", "B", "A"] as const;

export function referenciaLetra(promedioPuntos: number): string {
  const p = Math.max(0, Math.min(3, promedioPuntos));
  const lo = Math.floor(p);
  const hi = Math.ceil(p);
  if (lo === hi) return `el equivalente a ${PUNTOS_LETRA[lo]}`;
  return `entre ${PUNTOS_LETRA[lo]} y ${PUNTOS_LETRA[hi]}`;
}
