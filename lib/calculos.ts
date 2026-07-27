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
  { letra: "B", desde: 81, hasta: 90, puntos: 2, aprueba: true },
  { letra: "C", desde: 71, hasta: 80, puntos: 1, aprueba: true },
  { letra: "D", desde: 61, hasta: 70, puntos: 0, aprueba: true },
  { letra: "F", desde: 0, hasta: 60, puntos: 0, aprueba: false },
];

export const APROBACION_NORMAL = 61;
export const APROBACION_FUNDAMENTAL = 71;

/**
 * Convierte una nota numérica a su tramo de la escala.
 *
 * La UTP TRUNCA, no redondea: un 90.9 es B, no A. Esto tiene una consecuencia
 * en cadena sobre las proyecciones, ver `techo()` más abajo.
 */
export function notaARango(nota: number, escala: Rango[] = ESCALA_UTP): Rango {
  const truncada = Math.min(100, Math.max(0, truncar(nota)));
  const rango = escala.find((r) => truncada >= r.desde && truncada <= r.hasta);
  if (!rango) throw new Error(`Nota fuera de escala: ${nota}`);
  return rango;
}

/**
 * Trunca hacia abajo, absorbiendo el ruido de coma flotante.
 *
 * El épsilon no es cosmético: sin él, un cálculo que debería dar 91 pero que la
 * aritmética de punto flotante deja en 90.99999999999999 se truncaría a 90, y el
 * estudiante recibiría B en lugar de A. Con truncamiento, un error de una
 * billonésima cuesta una letra completa.
 */
export function truncar(valor: number): number {
  return Math.floor(valor + 1e-9);
}

/**
 * Nota tal como debe mostrarse al estudiante: truncada y sin decimales, que es
 * como la registra la UTP. Un 95.31 se muestra "95", y es también el valor del
 * que sale su letra.
 */
export function formatearNota(nota: number): string {
  return String(Math.min(100, Math.max(0, truncar(nota))));
}

/**
 * Redondeo hacia arriba a `decimales` posiciones.
 *
 * Toda meta que se le muestre al estudiante DEBE pasar por aquí. Como la UTP
 * trunca, quedarse una centésima corto cuesta una letra completa: si el
 * requisito real es 57.53 y mostramos 57.5, el estudiante termina en 70.99,
 * la UTP trunca a 70, y la C prometida se convierte en D.
 */
export function techo(valor: number, decimales = 1): number {
  const f = Math.pow(10, decimales);
  return Math.ceil(valor * f - 1e-9) / f;
}

export function notaALetra(nota: number, escala: Rango[] = ESCALA_UTP): string {
  return notaARango(nota, escala).letra;
}

export function notaAPuntos(nota: number, escala: Rango[] = ESCALA_UTP): number {
  return notaARango(nota, escala).puntos;
}

// ============================================================
// Calificación por letra (para carga de historial)
// ============================================================

export type Letra = "A" | "B" | "C" | "D" | "F";

export const LETRAS: Letra[] = ["A", "B", "C", "D", "F"];

/**
 * Puntos de una letra directamente, sin pasar por una nota numérica.
 *
 * El historial se carga por letra porque es lo que el estudiante recuerda y lo
 * que aparece en su expediente. Una letra es un rango, no un número, así que
 * para el índice se usan sus puntos directos: A=3, B=2, C=1, D=0, F=0. Este es
 * exactamente el modelo del índice oficial de la UTP.
 */
export function letraAPuntos(letra: Letra, escala: Rango[] = ESCALA_UTP): number {
  const rango = escala.find((r) => r.letra === letra);
  if (!rango) throw new Error(`Letra fuera de escala: ${letra}`);
  return rango.puntos;
}

export function letraAprueba(letra: Letra, escala: Rango[] = ESCALA_UTP): boolean {
  const rango = escala.find((r) => r.letra === letra);
  if (!rango) throw new Error(`Letra fuera de escala: ${letra}`);
  return rango.aprueba;
}

/**
 * ¿Esta letra permite graduarse con esta materia?
 * Fundamentales requieren C; el resto, D. La F nunca aprueba.
 */
export function letraHabilitaGraduacion(letra: Letra, fundamental: boolean): boolean {
  if (letra === "F") return false;
  return fundamental ? letra !== "D" : true;
}

/**
 * ¿Esta nota permite graduarse con esta materia?
 * En fundamentales hace falta C; en el resto basta D.
 */
export function habilitaGraduacion(nota: number, fundamental: boolean): boolean {
  return nota >= (fundamental ? APROBACION_FUNDAMENTAL : APROBACION_NORMAL);
}

// ============================================================
// Calendario académico de la UTP
// ============================================================

export type TipoPeriodo = "PRIMER_SEMESTRE" | "SEGUNDO_SEMESTRE" | "VERANO";

/**
 * Calendario de la UTP:
 *   Verano          enero - febrero
 *   Primer semestre marzo - julio
 *   Segundo semestre agosto - diciembre
 *
 * El verano pertenece al mismo año calendario y ocurre PRIMERO, antes del
 * primer semestre. No es un periodo de cierre de año.
 */
export function periodoDeFecha(fecha: Date = new Date()): {
  anio: number;
  tipo: TipoPeriodo;
} {
  const mes = fecha.getMonth() + 1;
  const anio = fecha.getFullYear();
  if (mes <= 2) return { anio, tipo: "VERANO" };
  if (mes <= 7) return { anio, tipo: "PRIMER_SEMESTRE" };
  return { anio, tipo: "SEGUNDO_SEMESTRE" };
}

/**
 * Orden cronológico dentro de un año. NO coincide con el orden del enum
 * PeriodoPlan de Prisma: ordenar por el enum pondría el verano al final.
 */
export const ORDEN_PERIODO: Record<TipoPeriodo, number> = {
  VERANO: 0,
  PRIMER_SEMESTRE: 1,
  SEGUNDO_SEMESTRE: 2,
};

/**
 * Valor para el campo `secuencia` de CursoIndice. Es lo que permite a
 * calcularIndice() saber cuál intento de una materia fue el último y aplicar
 * bien la regla de borrado de la D.
 */
export function secuenciaDePeriodo(anio: number, tipo: TipoPeriodo): number {
  return anio * 3 + ORDEN_PERIODO[tipo];
}

/** Etiqueta legible: "Verano 2026", "1er semestre 2026" */
export function nombrePeriodo(anio: number, tipo: TipoPeriodo): string {
  if (tipo === "VERANO") return `Verano ${anio}`;
  if (tipo === "PRIMER_SEMESTRE") return `1er semestre ${anio}`;
  return `2do semestre ${anio}`;
}

// ============================================================
// Índice académico
// ============================================================

export type CursoIndice = {
  id: string;
  materiaId: string;
  creditos: number;
  /**
   * Nota en escala 0-100. Se usa para el semestre en curso, donde la nota se
   * calcula desde las evaluaciones. En null si el curso se cargó por letra.
   */
  notaFinal: number | null;
  /**
   * Letra directa. Se usa cuando el historial se cargó por calificación en vez
   * de por número. Si viene, tiene prioridad sobre notaFinal para el índice.
   */
  letra?: Letra | null;
  /** Orden cronológico. Menor = más antiguo. */
  secuencia: number;
};

/** Puntos de un curso, venga por letra o por nota numérica. */
function puntosDeCurso(c: CursoIndice): number {
  if (c.letra != null) return letraAPuntos(c.letra);
  return notaAPuntos(c.notaFinal!);
}

/** Letra de un curso, venga directa o derivada de la nota numérica. */
function letraDeCurso(c: CursoIndice): Letra {
  if (c.letra != null) return c.letra;
  return notaALetra(c.notaFinal!) as Letra;
}

/** ¿El curso tiene un resultado cargado (por letra o por nota)? */
function tieneResultado(c: CursoIndice): boolean {
  return c.letra != null || c.notaFinal != null;
}

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
    if (!tieneResultado(c)) continue; // aún en curso
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
      const letra = letraDeCurso(intento);
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
    puntos += puntosDeCurso(c) * c.creditos;
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

  const necesaria = techo(((objetivo - estado.notaActual) / restante) * 100);

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

// ============================================================
// Nombres automáticos de evaluaciones
// ============================================================

const SINGULARES: Record<string, string> = {
  parciales: "Parcial",
  talleres: "Taller",
  quices: "Quiz",
  quizzes: "Quiz",
  tareas: "Tarea",
  laboratorios: "Laboratorio",
  laboratorio: "Laboratorio",
  examenes: "Examen",
  exámenes: "Examen",
  proyectos: "Proyecto",
  presentaciones: "Presentación",
  asignaciones: "Asignación",
  practicas: "Práctica",
  prácticas: "Práctica",
  informes: "Informe",
  ensayos: "Ensayo",
  trabajos: "Trabajo",
  pruebas: "Prueba",
  evaluaciones: "Evaluación",
  giras: "Gira",
  foros: "Foro",
};

function singular(nombreSeccion: string): string {
  const limpio = nombreSeccion.trim();
  const clave = limpio.toLocaleLowerCase("es");

  if (SINGULARES[clave]) return SINGULARES[clave];

  // Reglas generales del español, de más específica a menos
  if (/[aeiouáéíóú]s$/i.test(limpio)) return limpio.slice(0, -1); // Tareas -> Tarea
  if (/es$/i.test(limpio)) return limpio.slice(0, -2); // Talleres -> Taller
  if (/s$/i.test(limpio)) return limpio.slice(0, -1);

  return limpio; // ya está en singular
}

/**
 * Genera el nombre de una evaluación a partir del nombre de su sección.
 * "Parciales" con 3 notas -> "Parcial #1", "Parcial #2", "Parcial #3".
 * Si la sección tiene una sola nota, no se numera: "Examen final".
 */
export function nombreEvaluacion(
  nombreSeccion: string,
  orden: number,
  cantidad: number
): string {
  if (cantidad <= 1) return nombreSeccion.trim();
  return `${singular(nombreSeccion)} #${orden}`;
}

// ============================================================
// Proyección detallada por evaluación
// ============================================================

export type Exigencia = "holgado" | "en linea" | "exigente" | "muy exigente";

export type MetaEvaluacion = {
  seccionIndice: number;
  seccionNombre: string;
  /** Posición dentro de la sección, base 1 */
  orden: number;
  etiqueta: string;
  /** Porcentaje de la nota final que carga esta evaluación */
  peso: number;
  /** Meta en escala 0-100 */
  meta: number;
  /** Meta expresada en el puntaje real de la evaluación */
  metaEnPuntaje: number;
  puntajeMax: number;
  /** Desempeño demostrado que se usó para repartir */
  referencia: number;
  exigencia: Exigencia;
};

export type PlanObjetivo = {
  objetivo: number;
  alcanzable: boolean;
  yaAlcanzado: boolean;
  /** Promedio simple necesario, para comparar con el reparto */
  promedioNecesario: number | null;
  metas: MetaEvaluacion[];
  mensaje: string;
};

function clasificar(meta: number, referencia: number): Exigencia {
  const d = meta - referencia;
  if (d <= -5) return "holgado";
  if (d <= 5) return "en linea";
  if (d <= 15) return "exigente";
  return "muy exigente";
}

/**
 * Reparte lo que falta para un objetivo entre las evaluaciones pendientes,
 * proporcionalmente al desempeño que el estudiante ya demostró en cada
 * sección. Quien va mejor en talleres recibe metas más altas ahí.
 *
 * El reparto respeta el tope de 100: si una evaluación se pasa, se fija en
 * 100 y el excedente se redistribuye entre las demás.
 *
 * Cuando exista volumen de datos, `referencia` puede pasar a alimentarse de
 * la distribución real de la materia con ese profesor en vez del historial
 * propio. El resto del algoritmo no cambia.
 */
export function distribuirObjetivo(
  secciones: SeccionEvaluacion[],
  objetivo: number
): PlanObjetivo {
  const estado = calcularEstadoMateria(secciones);
  const faltante = objetivo - estado.notaActual;

  type Pendiente = {
    seccionIndice: number;
    seccionNombre: string;
    orden: number;
    etiqueta: string;
    peso: number;
    puntajeMax: number;
    referencia: number;
    meta: number;
    fijada: boolean;
  };

  // Desempeño global, como respaldo cuando una sección no tiene notas aún
  const global = estado.promedioParcial;
  const pendientes: Pendiente[] = [];

  secciones.forEach((seccion, si) => {
    if (seccion.cantidad <= 0) return;
    const pesoPorNota = seccion.porcentaje / seccion.cantidad;

    const realizadas = seccion.notas.filter((n) => n.puntaje !== null);
    const promedioSeccion = realizadas.length
      ? realizadas.reduce((a, n) => a + normalizar(n), 0) / realizadas.length
      : null;

    // Si no hay dato de la sección ni global, se usa el propio objetivo como
    // referencia neutra: reparto plano.
    const referencia = promedioSeccion ?? global ?? objetivo;

    for (let i = 0; i < seccion.cantidad; i++) {
      const nota = seccion.notas[i];
      if (nota && nota.puntaje !== null) continue;
      pendientes.push({
        seccionIndice: si,
        seccionNombre: seccion.nombre,
        orden: i + 1,
        etiqueta: nombreEvaluacion(seccion.nombre, i + 1, seccion.cantidad),
        peso: pesoPorNota,
        puntajeMax: nota?.puntajeMax ?? 100,
        referencia: Math.max(1, Math.min(100, referencia)),
        meta: 0,
        fijada: false,
      });
    }
  });

  if (estado.notaActual >= objetivo) {
    return {
      objetivo,
      alcanzable: true,
      yaAlcanzado: true,
      promedioNecesario: 0,
      metas: pendientes.map((p) => ({ ...p, meta: 0, metaEnPuntaje: 0, exigencia: "holgado" as Exigencia })),
      mensaje: "Ya aseguraste este objetivo. Lo que falte no lo cambia.",
    };
  }

  if (pendientes.length === 0) {
    return {
      objetivo,
      alcanzable: false,
      yaAlcanzado: false,
      promedioNecesario: null,
      metas: [],
      mensaje: "No quedan evaluaciones pendientes. La nota ya está definida.",
    };
  }

  const pesoRestante = pendientes.reduce((a, p) => a + p.peso, 0);
  const promedioNecesario = techo((faltante / pesoRestante) * 100);

  // Si ni con 100 en todo lo pendiente se llega, no hay reparto posible.
  if (estado.notaMaxima < objetivo - 0.001) {
    return {
      objetivo,
      alcanzable: false,
      yaAlcanzado: false,
      promedioNecesario,
      metas: pendientes.map((p) => ({
        seccionIndice: p.seccionIndice,
        seccionNombre: p.seccionNombre,
        orden: p.orden,
        etiqueta: p.etiqueta,
        peso: p.peso,
        meta: 100,
        metaEnPuntaje: p.puntajeMax,
        puntajeMax: p.puntajeMax,
        referencia: Math.round(p.referencia * 10) / 10,
        exigencia: "muy exigente" as Exigencia,
      })),
      mensaje: `Aunque saques 100 en todo lo que falta, el máximo alcanzable es ${estado.notaMaxima.toFixed(1)}.`,
    };
  }

  // Reparto proporcional con tope en 100 y redistribución iterativa
  let porRepartir = faltante;
  let libres = [...pendientes];

  for (let vuelta = 0; vuelta < 20 && libres.length > 0; vuelta++) {
    const base = libres.reduce((a, p) => a + (p.peso * p.referencia) / 100, 0);
    if (base <= 0) break;

    const k = porRepartir / base;
    let seFijoAlguna = false;

    for (const p of libres) {
      const propuesta = p.referencia * k;
      if (propuesta > 100) {
        p.meta = 100;
        p.fijada = true;
        porRepartir -= (p.peso * 100) / 100;
        seFijoAlguna = true;
      } else {
        p.meta = Math.max(0, propuesta);
      }
    }

    if (!seFijoAlguna) break;
    libres = libres.filter((p) => !p.fijada);
  }

  const alcanzable = true;
  const metas: MetaEvaluacion[] = pendientes.map((p) => ({
    seccionIndice: p.seccionIndice,
    seccionNombre: p.seccionNombre,
    orden: p.orden,
    etiqueta: p.etiqueta,
    peso: p.peso,
    meta: techo(Math.min(100, p.meta)),
    metaEnPuntaje: techo((Math.min(100, p.meta) / 100) * p.puntajeMax),
    puntajeMax: p.puntajeMax,
    referencia: Math.round(p.referencia * 10) / 10,
    exigencia: clasificar(p.meta, p.referencia),
  }));

  return {
    objetivo,
    alcanzable,
    yaAlcanzado: false,
    promedioNecesario,
    metas,
    mensaje: alcanzable
      ? `Repartido según tu desempeño en cada sección.`
      : `Aunque saques 100 en todo lo que falta, el máximo alcanzable es ${estado.notaMaxima.toFixed(1)}.`,
  };
}
