/**
 * CalcuNota — motor de cálculo.
 *
 * Reglas de la UTP implementadas aquí:
 *  - Escala: A=91+ (3 pts), B=81-90 (2), C=71-80 (1), D=61-70 (0), F<=60 (0)
 *  - Índice = Σ(puntos × créditos) / Σ(créditos)
 *  - Una F suma sus créditos al denominador (castiga el índice)
 *  - Al repetir, una D anterior se elimina por completo del cálculo
 *  - Una F anterior NUNCA se elimina: conviven la F y el nuevo intento
 *  - Aprobación: 61 (D) en materias normales, 71 (C) en materias fundamentales
 */

// ============================================================
// Escala de calificación
// ============================================================

export type Rango = {
  letra: string;
  desde: number;
  hasta: number;
  puntos: number;
  aprueba: boolean;
};

export const ESCALA_UTP: Rango[] = [
  { letra: "A", desde: 91, hasta: 100, puntos: 3, aprueba: true },
  { letra: "B", desde: 81, hasta: 90.99, puntos: 2, aprueba: true },
  { letra: "C", desde: 71, hasta: 80.99, puntos: 1, aprueba: true },
  { letra: "D", desde: 61, hasta: 70.99, puntos: 0, aprueba: true },
  { letra: "F", desde: 0, hasta: 60.99, puntos: 0, aprueba: false },
];

export const APROBACION_NORMAL = 61;
export const APROBACION_FUNDAMENTAL = 71;

/** Convierte una nota numérica a su tramo de la escala. */
export function notaARango(nota: number, escala: Rango[] = ESCALA_UTP): Rango {
  const redondeada = Math.round(nota);
  const rango = escala.find((r) => redondeada >= r.desde && redondeada <= r.hasta);
  if (!rango) throw new Error(`Nota fuera de escala: ${nota}`);
  return rango;
}

export function notaALetra(nota: number, escala: Rango[] = ESCALA_UTP): string {
  return notaARango(nota, escala).letra;
}

export function notaAPuntos(nota: number, escala: Rango[] = ESCALA_UTP): number {
  return notaARango(nota, escala).puntos;
}

/**
 * ¿Esta nota permite graduarse con esta materia?
 * En fundamentales hace falta C; en el resto basta D.
 */
export function habilitaGraduacion(nota: number, fundamental: boolean): boolean {
  return nota >= (fundamental ? APROBACION_FUNDAMENTAL : APROBACION_NORMAL);
}

// ============================================================
// Índice académico
// ============================================================

export type CursoIndice = {
  id: string;
  materiaId: string;
  creditos: number;
  notaFinal: number | null;
  /** Orden cronológico. Menor = más antiguo. */
  secuencia: number;
};

export type ResultadoIndice = {
  puntos: number;
  creditos: number;
  indice: number;
  /** Cursos que quedaron fuera por haber sido reemplazados (D repetida) */
  excluidos: string[];
  /** Cursos sin créditos: seminario, nivelación, huecos de electiva */
  noCalificables: string[];
};

/**
 * Una materia sin créditos no participa del índice: no aporta puntos ni
 * consume denominador. En la UTP entran aquí el Seminario de Inducción a
 * la Vida Universitaria, los cursos de nivelación (Matemática Básica,
 * Pre-Cálculo), algunos requisitos de Inglés y los huecos de electiva.
 *
 * Son requisitos que hay que cumplir para graduarse, pero no se califican
 * en la escala numérica: se aprueban o no.
 */
export function esCalificable(creditos: number): boolean {
  return creditos > 0;
}

/**
 * Códigos que en los planes de la UTP son marcadores de posición, no
 * materias reales. Representan "aquí van N créditos de electivas" y no
 * deben ofrecerse al estudiante como curso.
 */
const CODIGOS_MARCADOR = new Set(["0676", "9979", "9980", "9981"]);

export function esMarcadorDeElectiva(codigo: string): boolean {
  return CODIGOS_MARCADOR.has(codigo);
}

/**
 * Aplica la regla de reemplazo: si una materia se cursó varias veces,
 * los intentos con D anteriores al último se descartan. Los intentos con
 * F se conservan siempre.
 */
export function cursosQueCuentan(cursos: CursoIndice[]): {
  cuentan: CursoIndice[];
  excluidos: string[];
  noCalificables: string[];
} {
  const porMateria = new Map<string, CursoIndice[]>();
  const noCalificables: string[] = [];

  for (const c of cursos) {
    if (c.notaFinal === null) continue; // aún en curso
    if (!esCalificable(c.creditos)) {
      // Seminario, nivelación, huecos de electiva: se aprueban pero no
      // entran al cálculo. Se excluyen aquí de forma explícita en vez de
      // depender de que multiplicar por cero los anule.
      noCalificables.push(c.id);
      continue;
    }
    const lista = porMateria.get(c.materiaId) ?? [];
    lista.push(c);
    porMateria.set(c.materiaId, lista);
  }

  const cuentan: CursoIndice[] = [];
  const excluidos: string[] = [];

  for (const intentos of porMateria.values()) {
    const ordenados = [...intentos].sort((a, b) => a.secuencia - b.secuencia);
    const ultimo = ordenados[ordenados.length - 1];

    for (const intento of ordenados) {
      if (intento.id === ultimo.id) {
        cuentan.push(intento);
        continue;
      }
      const letra = notaALetra(intento.notaFinal!);
      if (letra === "D") {
        excluidos.push(intento.id); // la D se borra al repetir
      } else {
        cuentan.push(intento); // la F (y cualquier otra) se queda
      }
    }
  }

  return { cuentan, excluidos, noCalificables };
}

export function calcularIndice(cursos: CursoIndice[]): ResultadoIndice {
  const { cuentan, excluidos, noCalificables } = cursosQueCuentan(cursos);

  let puntos = 0;
  let creditos = 0;

  for (const c of cuentan) {
    puntos += notaAPuntos(c.notaFinal!) * c.creditos;
    creditos += c.creditos;
  }

  return {
    puntos,
    creditos,
    indice: creditos === 0 ? 0 : puntos / creditos,
    excluidos,
    noCalificables,
  };
}

/**
 * Cuánto subiría el índice si se repite una materia y se saca `notaNueva`.
 * Sirve para la recomendación "te conviene repetir esta materia".
 */
export function simularRepeticion(
  cursos: CursoIndice[],
  cursoARepetir: CursoIndice,
  notaNueva: number
): { antes: number; despues: number; ganancia: number } {
  const antes = calcularIndice(cursos).indice;

  const maxSecuencia = Math.max(...cursos.map((c) => c.secuencia));
  const repeticion: CursoIndice = {
    id: `${cursoARepetir.id}-sim`,
    materiaId: cursoARepetir.materiaId,
    creditos: cursoARepetir.creditos,
    notaFinal: notaNueva,
    secuencia: maxSecuencia + 1,
  };

  const despues = calcularIndice([...cursos, repeticion]).indice;
  return { antes, despues, ganancia: despues - antes };
}

// ============================================================
// Nota actual y proyección dentro de una materia
// ============================================================

export type NotaEvaluacion = {
  /** null = pendiente. No es lo mismo que cero. */
  puntaje: number | null;
  puntajeMax: number;
};

export type SeccionEvaluacion = {
  nombre: string;
  /** Porcentaje sobre 100 que aporta la sección a la nota final */
  porcentaje: number;
  /** Cantidad total de notas previstas en la sección */
  cantidad: number;
  notas: NotaEvaluacion[];
};

export type EstadoMateria = {
  /** Puntos ya asegurados sobre 100 */
  notaActual: number;
  /** Porcentaje de la nota final que todavía está en juego */
  porcentajeRestante: number;
  /** Nota máxima alcanzable si saca 100 en todo lo que falta */
  notaMaxima: number;
  /** Promedio ponderado de lo evaluado hasta ahora, sobre 100 */
  promedioParcial: number | null;
};

function normalizar(nota: NotaEvaluacion): number {
  if (nota.puntajeMax <= 0) return 0;
  return (nota.puntaje! / nota.puntajeMax) * 100;
}

/** Verifica que los porcentajes sumen 100. Devuelve la diferencia. */
export function validarSecciones(secciones: SeccionEvaluacion[]): {
  valido: boolean;
  suma: number;
  diferencia: number;
} {
  const suma = secciones.reduce((acc, s) => acc + s.porcentaje, 0);
  const diferencia = Math.round((100 - suma) * 100) / 100;
  return { valido: Math.abs(diferencia) < 0.01, suma, diferencia };
}

export function calcularEstadoMateria(
  secciones: SeccionEvaluacion[]
): EstadoMateria {
  // Todo se trabaja en escala 0-100 sobre la nota final de la materia
  let notaActual = 0;
  let porcentajeRestante = 0;
  let sumaPonderada = 0;
  let pesoEvaluado = 0;

  for (const seccion of secciones) {
    if (seccion.cantidad <= 0) continue;

    const realizadas = seccion.notas.filter((n) => n.puntaje !== null);
    const pesoPorNota = seccion.porcentaje / seccion.cantidad;
    const suma = realizadas.reduce((acc, n) => acc + normalizar(n), 0);

    // Puntos ya asegurados sobre la nota final
    notaActual += (suma / seccion.cantidad) * (seccion.porcentaje / 100);

    // Peso que todavía está en juego
    porcentajeRestante += pesoPorNota * (seccion.cantidad - realizadas.length);

    if (realizadas.length > 0) {
      const promedioSeccion = suma / realizadas.length;
      const peso = pesoPorNota * realizadas.length;
      sumaPonderada += promedioSeccion * peso;
      pesoEvaluado += peso;
    }
  }

  return {
    notaActual,
    porcentajeRestante,
    notaMaxima: notaActual + porcentajeRestante,
    promedioParcial: pesoEvaluado > 0 ? sumaPonderada / pesoEvaluado : null,
  };
}

export type Proyeccion = {
  objetivo: number;
  alcanzable: boolean;
  yaAlcanzado: boolean;
  /** Promedio necesario en las evaluaciones pendientes, sobre 100 */
  notaNecesaria: number | null;
  mensaje: string;
};

export function proyectar(
  secciones: SeccionEvaluacion[],
  objetivo: number
): Proyeccion {
  const estado = calcularEstadoMateria(secciones);
  const restante = estado.porcentajeRestante;

  if (estado.notaActual >= objetivo) {
    return {
      objetivo,
      alcanzable: true,
      yaAlcanzado: true,
      notaNecesaria: 0,
      mensaje: "Ya aseguraste este objetivo, sin importar lo que falte.",
    };
  }

  if (restante <= 0) {
    return {
      objetivo,
      alcanzable: false,
      yaAlcanzado: false,
      notaNecesaria: null,
      mensaje: "No quedan evaluaciones pendientes. La nota ya está definida.",
    };
  }

  const necesaria = ((objetivo - estado.notaActual) / restante) * 100;

  if (necesaria > 100) {
    return {
      objetivo,
      alcanzable: false,
      yaAlcanzado: false,
      notaNecesaria: necesaria,
      mensaje: `Harían falta ${necesaria.toFixed(1)} puntos en lo que queda, que está por encima del máximo posible.`,
    };
  }

  return {
    objetivo,
    alcanzable: true,
    yaAlcanzado: false,
    notaNecesaria: necesaria,
    mensaje: `Necesitas un promedio de ${necesaria.toFixed(1)} en las evaluaciones que faltan.`,
  };
}

/** Proyecta contra los umbrales relevantes de la escala. */
export function proyectarEscala(
  secciones: SeccionEvaluacion[],
  fundamental: boolean
): Proyeccion[] {
  const objetivos = [
    fundamental ? APROBACION_FUNDAMENTAL : APROBACION_NORMAL, // aprobar
    71, // C
    81, // B
    91, // A
  ];
  const unicos = [...new Set(objetivos)].sort((a, b) => a - b);
  return unicos.map((o) => proyectar(secciones, o));
}
