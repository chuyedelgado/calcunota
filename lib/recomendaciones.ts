/**
 * CalcuNota — motor de recomendaciones.
 *
 * Genera consejos accionables a partir de los datos reales del estudiante.
 * Se apoya en lib/calculos.ts y no duplica ninguna fórmula.
 *
 * REGLA FUNDAMENTAL: toda recomendación sale de un cálculo sobre datos propios
 * del estudiante. Está prohibido:
 *   - Motivación genérica ("¡Tú puedes!", "¡Sigue así!")
 *   - Cifras probabilísticas o comparaciones con otros estudiantes: todavía no
 *     hay datos para eso y sería inventado
 *   - Rellenar la pantalla cuando no hay nada real que decir
 *
 * Si no hay datos suficientes, se devuelve una invitación a cargarlos, no una
 * frase vacía. El silencio es una respuesta válida.
 */

import {
  APROBACION_FUNDAMENTAL,
  APROBACION_NORMAL,
  calcularEstadoMateria,
  calcularIndice,
  letraAprueba,
  letraHabilitaGraduacion,
  nombrePeriodo,
  notaALetra,
  proyectar,
  proyectarEscala,
  secuenciaDePeriodo,
  simularRepeticion,
  type CursoIndice,
  type Letra,
  type SeccionEvaluacion,
  type TipoPeriodo,
} from "./calculos";

// ============================================================
// Entradas
// ============================================================

export type MateriaEnCurso = {
  cursoId: string;
  materiaNombre: string;
  creditos: number;
  fundamental: boolean;
  /** Objetivo que fijó el estudiante, si lo fijó */
  objetivo: number | null;
  secciones: SeccionEvaluacion[];
};

export type MateriaCerrada = {
  cursoId: string;
  materiaId: string;
  materiaNombre: string;
  creditos: number;
  fundamental: boolean;
  /** Si el historial se cargó por letra */
  letra: Letra | null;
  /** Si el curso se cerró con nota numérica */
  notaFinal: number | null;
  anio: number;
  periodo: TipoPeriodo;
};

export type ContextoEstudiante = {
  /** Cursos con estado EN_CURSO en el periodo activo */
  enCurso: MateriaEnCurso[];
  /**
   * Total de cursos del periodo activo SIN importar su estado.
   *
   * Hace falta para distinguir dos situaciones que `enCurso` confunde: un
   * estudiante que aún no ha agregado materias, y uno que ya cerró el semestre
   * (sus cursos pasaron a APROBADO y `enCurso` quedó vacío). Sin esto, al
   * cerrar el semestre la app le sugiere agregar materias que ya cursó.
   *
   * Si no se provee, se asume el largo de `enCurso`.
   */
  cursosPeriodoActual?: number;
  historial: MateriaCerrada[];
  /**
   * Cursos que siguen EN_CURSO en periodos ANTERIORES al vigente: semestres que
   * el estudiante nunca cerró.
   *
   * Ocurre en uso normal, sin ningún bug: la app no cierra semestres por fecha,
   * así que basta con que alguien termine julio sin cerrar y en agosto agregue
   * las materias nuevas. Mientras no cierre, esos cursos no tienen nota final y
   * NO cuentan para el índice, así que su índice está mal y no lo sabe.
   *
   * Desglosado por periodo, del más antiguo al más reciente. Vacío = al día.
   * Si no se provee, se asume vacío.
   */
  cursosSinCerrar?: { anio: number; periodo: TipoPeriodo; cantidad: number }[];

  /** Meta de índice acumulado, si la definió */
  indiceObjetivo: number | null;
  /** Créditos totales del plan de estudio */
  creditosPlan: number;
};

// ============================================================
// Salida
// ============================================================

export type Categoria =
  | "riesgo" // va camino a reprobar algo que está cursando
  | "bloqueo" // algo le impide graduarse
  | "meta" // objetivo concreto en una materia en curso
  | "carrera" // proyección al índice objetivo de toda la carrera
  | "logro" // algo ya asegurado
  | "oportunidad" // puede mejorar el índice
  | "patron" // observación sobre su desempeño
  | "mantenimiento" // acción para que los datos de la app reflejen la realidad
  | "vacio"; // faltan datos para poder decir algo

export type Severidad = "critica" | "alta" | "media" | "baja";

export type Recomendacion = {
  id: string;
  categoria: Categoria;
  severidad: Severidad;
  titulo: string;
  detalle: string;
  cursoId?: string;
  materiaNombre?: string;
  accion?: { texto: string; ruta: string };
  /** Orden dentro de la misma severidad. Mayor = primero. */
  peso: number;
};

const ORDEN_SEVERIDAD: Record<Severidad, number> = {
  critica: 0,
  alta: 1,
  media: 2,
  baja: 3,
};

// ============================================================
// Utilidades internas
// ============================================================

function letraDe(m: MateriaCerrada): Letra | null {
  if (m.letra != null) return m.letra;
  if (m.notaFinal != null) return notaALetra(m.notaFinal) as Letra;
  return null;
}

function aCursoIndice(m: MateriaCerrada): CursoIndice {
  return {
    id: m.cursoId,
    materiaId: m.materiaId,
    creditos: m.creditos,
    notaFinal: m.notaFinal,
    letra: m.letra,
    secuencia: secuenciaDePeriodo(m.anio, m.periodo),
  };
}

/** Agrupa el historial por materia, ordenado del más antiguo al más reciente. */
function intentosPorMateria(
  historial: MateriaCerrada[]
): Map<string, MateriaCerrada[]> {
  const mapa = new Map<string, MateriaCerrada[]>();
  for (const m of historial) {
    const lista = mapa.get(m.materiaId) ?? [];
    lista.push(m);
    mapa.set(m.materiaId, lista);
  }
  for (const lista of mapa.values()) {
    lista.sort(
      (a, b) =>
        secuenciaDePeriodo(a.anio, a.periodo) -
        secuenciaDePeriodo(b.anio, b.periodo)
    );
  }
  return mapa;
}

/** Umbral de aprobación aplicable a una materia. */
function umbralAprobacion(fundamental: boolean): number {
  return fundamental ? APROBACION_FUNDAMENTAL : APROBACION_NORMAL;
}

/** ¿La materia en curso tiene al menos una nota registrada? */
function tieneNotas(m: MateriaEnCurso): boolean {
  return m.secciones.some((s) => s.notas.some((n) => n.puntaje !== null));
}

function contarPendientes(secciones: SeccionEvaluacion[]): number {
  return secciones.reduce((acc, s) => {
    const hechas = s.notas.filter((n) => n.puntaje !== null).length;
    return acc + Math.max(0, s.cantidad - hechas);
  }, 0);
}

// ============================================================
// Generadores
// ============================================================

/**
 * Materias en curso que van camino a reprobar.
 * Es lo más urgente: todavía se puede hacer algo, pero el tiempo corre.
 */
function riesgoDeReprobar(ctx: ContextoEstudiante): Recomendacion[] {
  const out: Recomendacion[] = [];

  for (const m of ctx.enCurso) {
    if (!tieneNotas(m)) continue; // sin datos no se opina

    const umbral = umbralAprobacion(m.fundamental);
    const p = proyectar(m.secciones, umbral);

    if (!p.alcanzable && !p.yaAlcanzado) {
      const estado = calcularEstadoMateria(m.secciones);
      out.push({
        id: `riesgo-imposible-${m.cursoId}`,
        categoria: "riesgo",
        severidad: "critica",
        titulo: `Ya no puedes aprobar ${m.materiaNombre}`,
        detalle:
          `Aunque saques 100 en todo lo que falta, llegarías a ` +
          `${estado.notaMaxima.toFixed(1)} y el mínimo para aprobar es ${umbral}. ` +
          `Conviene que valores retirarla antes de la fecha límite.`,
        cursoId: m.cursoId,
        materiaNombre: m.materiaNombre,
        peso: 100,
      });
      continue;
    }

    if (p.alcanzable && !p.yaAlcanzado && p.notaNecesaria !== null) {
      // Exigente de verdad: hace falta mucho más de lo que viene sacando
      const estado = calcularEstadoMateria(m.secciones);
      const referencia = estado.promedioParcial ?? 0;
      const exigente = p.notaNecesaria >= 85 || p.notaNecesaria - referencia >= 20;

      if (exigente) {
        out.push({
          id: `riesgo-exigente-${m.cursoId}`,
          categoria: "riesgo",
          severidad: "alta",
          titulo: `${m.materiaNombre} está apretada`,
          detalle:
            `Para aprobar necesitas ${p.notaNecesaria} de promedio en las ` +
            `${contarPendientes(m.secciones)} evaluaciones que faltan. ` +
            `Vienes con ${referencia.toFixed(1)} de promedio.`,
          cursoId: m.cursoId,
          materiaNombre: m.materiaNombre,
          peso: 90,
        });
      }
    }
  }

  return out;
}

/**
 * Materias que impiden graduarse: F sin resolver, o D en fundamental.
 * No son urgentes en el tiempo, pero son innegociables.
 */
function bloqueosDeGraduacion(ctx: ContextoEstudiante): Recomendacion[] {
  const out: Recomendacion[] = [];
  const cursos = ctx.historial.map(aCursoIndice);

  for (const [, intentos] of intentosPorMateria(ctx.historial)) {
    const ultimo = intentos[intentos.length - 1];
    const letra = letraDe(ultimo);
    if (!letra) continue;

    // Ya está en curso otra vez: no hace falta decirle que la repita
    const estaRepitiendo = ctx.enCurso.some(
      (c) => c.materiaNombre === ultimo.materiaNombre
    );

    if (!letraAprueba(letra)) {
      const sim = simularRepeticion(cursos, aCursoIndice(ultimo), 85);
      out.push({
        id: `bloqueo-f-${ultimo.cursoId}`,
        categoria: "bloqueo",
        severidad: "alta",
        titulo: estaRepitiendo
          ? `Estás repitiendo ${ultimo.materiaNombre}, que tenías reprobada`
          : `Debes repetir ${ultimo.materiaNombre}`,
        detalle: estaRepitiendo
          ? `Es obligatoria para graduarte. Si la cierras con B, tu índice sube ` +
            `${sim.ganancia >= 0 ? "+" : ""}${sim.ganancia.toFixed(2)}.`
          : `La reprobaste en ${nombrePeriodo(ultimo.anio, ultimo.periodo)} y no ` +
            `puedes graduarte con una F. Al repetirla, la nota anterior no se ` +
            `borra, así que apunta a B o más para que además te suba el índice.`,
        cursoId: ultimo.cursoId,
        materiaNombre: ultimo.materiaNombre,
        peso: 80,
      });
      continue;
    }

    if (!letraHabilitaGraduacion(letra, ultimo.fundamental)) {
      const sim = simularRepeticion(cursos, aCursoIndice(ultimo), 95);
      out.push({
        id: `bloqueo-d-fund-${ultimo.cursoId}`,
        categoria: "bloqueo",
        severidad: "alta",
        titulo: `${ultimo.materiaNombre} te bloquea la graduación`,
        detalle:
          `Es materia fundamental y la aprobaste con D. Puedes avanzar a las ` +
          `que dependen de ella, pero con esa nota no te gradúas: necesitas C ` +
          `o más. Al repetirla, la D desaparece por completo de tu índice; si ` +
          `sacas A, sube +${sim.ganancia.toFixed(2)}.`,
        cursoId: ultimo.cursoId,
        materiaNombre: ultimo.materiaNombre,
        peso: 85,
      });
    }
  }

  return out;
}

/**
 * Metas concretas en materias en curso: qué falta exactamente para el siguiente
 * escalón. Solo cuando quedan pocas evaluaciones, que es cuando el número es
 * accionable de verdad.
 */
function metasAccionables(ctx: ContextoEstudiante): Recomendacion[] {
  const out: Recomendacion[] = [];

  for (const m of ctx.enCurso) {
    if (!tieneNotas(m)) continue;

    const pendientes = contarPendientes(m.secciones);
    if (pendientes === 0 || pendientes > 3) continue; // muy pronto para concretar

    const proyecciones = proyectarEscala(m.secciones, m.fundamental);
    // El escalón MÁS ALTO que todavía es alcanzable y no está asegurado.
    // Tomar el primero daría metas inútiles: a quien ya tiene la C asegurada
    // no le sirve "necesitas 1.7 para la B", le sirve saber qué le falta
    // para la A.
    const candidatos = proyecciones.filter(
      (p) => p.alcanzable && !p.yaAlcanzado && p.notaNecesaria !== null
    );
    if (candidatos.length === 0) continue;
    const siguiente = candidatos[candidatos.length - 1];

    const letra = notaALetra(siguiente.objetivo);
    out.push({
      id: `meta-${m.cursoId}`,
      categoria: "meta",
      severidad: "media",
      titulo: `${m.materiaNombre}: ${siguiente.notaNecesaria} para la ${letra}`,
      detalle:
        `Necesitas ${siguiente.notaNecesaria} de promedio en ` +
        `${pendientes === 1 ? "la evaluación que falta" : `las ${pendientes} evaluaciones que faltan`}.`,
      cursoId: m.cursoId,
      materiaNombre: m.materiaNombre,
      peso: 60,
    });
  }

  return out;
}

/**
 * Lo que ya está asegurado matemáticamente. Baja la ansiedad y es información
 * real, no ánimo vacío.
 */
function logrosAsegurados(ctx: ContextoEstudiante): Recomendacion[] {
  const out: Recomendacion[] = [];

  for (const m of ctx.enCurso) {
    if (!tieneNotas(m)) continue;
    if (contarPendientes(m.secciones) === 0) continue; // ya terminó, no es noticia

    const proyecciones = proyectarEscala(m.secciones, m.fundamental);
    const asegurados = proyecciones.filter((p) => p.yaAlcanzado);
    if (asegurados.length === 0) continue;

    // El escalón más alto ya asegurado
    const mejor = asegurados[asegurados.length - 1];
    const letra = notaALetra(mejor.objetivo);

    out.push({
      id: `logro-${m.cursoId}`,
      categoria: "logro",
      severidad: "baja",
      titulo: `${letra} asegurada en ${m.materiaNombre}`,
      detalle: `Ya no puedes bajar de ahí, pase lo que pase en lo que falta.`,
      cursoId: m.cursoId,
      materiaNombre: m.materiaNombre,
      peso: 40,
    });
  }

  return out;
}

/**
 * Repeticiones opcionales que rinden: D en materia no fundamental.
 * Solo se muestran si la ganancia es apreciable; si no, es ruido.
 */
const GANANCIA_MINIMA = 0.02;

function oportunidadesDeRepeticion(ctx: ContextoEstudiante): Recomendacion[] {
  const cursos = ctx.historial.map(aCursoIndice);
  const candidatas: { m: MateriaCerrada; ganancia: number }[] = [];

  for (const [, intentos] of intentosPorMateria(ctx.historial)) {
    const ultimo = intentos[intentos.length - 1];
    const letra = letraDe(ultimo);
    if (letra !== "D") continue;
    if (!letraHabilitaGraduacion(letra, ultimo.fundamental)) continue; // ya es bloqueo
    if (ctx.enCurso.some((c) => c.materiaNombre === ultimo.materiaNombre)) continue;

    const sim = simularRepeticion(cursos, aCursoIndice(ultimo), 95);
    if (sim.ganancia >= GANANCIA_MINIMA) {
      candidatas.push({ m: ultimo, ganancia: sim.ganancia });
    }
  }

  if (candidatas.length === 0) return [];
  candidatas.sort((a, b) => b.ganancia - a.ganancia);

  // Solo la mejor: una lista completa vive en la pantalla de repeticiones
  const mejor = candidatas[0];
  const resto = candidatas.length - 1;

  return [
    {
      id: `oportunidad-${mejor.m.cursoId}`,
      categoria: "oportunidad",
      severidad: "media",
      titulo: `Repetir ${mejor.m.materiaNombre} te sube +${mejor.ganancia.toFixed(2)}`,
      detalle:
        `La aprobaste con D, así que no estás obligado a repetirla. Si lo haces ` +
        `y sacas A, la D desaparece de tu índice.` +
        (resto > 0
          ? ` Tienes ${resto} materia${resto > 1 ? "s" : ""} más en la misma situación.`
          : ""),
      cursoId: mejor.m.cursoId,
      materiaNombre: mejor.m.materiaNombre,
      accion: { texto: "Ver todas", ruta: "/carrera/repeticiones" },
      peso: 55,
    },
  ];
}

/**
 * Proyección al índice objetivo de carrera.
 *
 * Razona en PUNTOS POR CRÉDITO (escala 0-3), no en notas numéricas, porque así
 * es como funciona el índice.
 */
function proyeccionDeCarrera(ctx: ContextoEstudiante): Recomendacion[] {
  if (ctx.indiceObjetivo == null) return [];
  if (ctx.historial.length === 0) return [];
  if (ctx.creditosPlan <= 0) return [];

  const cursos = ctx.historial.map(aCursoIndice);
  const { puntos, creditos, indice } = calcularIndice(cursos);
  if (creditos === 0) return [];

  // Las F no se borran al repetir: sus créditos se suman de nuevo al repetirlas,
  // así que el denominador final supera el total del plan.
  let creditosExtraPorF = 0;
  for (const [, intentos] of intentosPorMateria(ctx.historial)) {
    const ultimo = intentos[intentos.length - 1];
    const letra = letraDe(ultimo);
    if (letra && !letraAprueba(letra)) creditosExtraPorF += ultimo.creditos;
  }

  const creditosFinales = ctx.creditosPlan + creditosExtraPorF;
  const creditosRestantes = creditosFinales - creditos;
  if (creditosRestantes <= 0) return [];

  const puntosNecesarios = ctx.indiceObjetivo * creditosFinales;
  const faltan = puntosNecesarios - puntos;
  const porCredito = faltan / creditosRestantes;

  // Ya lo superó
  if (porCredito <= 0) {
    return [
      {
        id: "carrera-objetivo-superado",
        categoria: "logro",
        severidad: "baja",
        titulo: `Tu objetivo de ${ctx.indiceObjetivo.toFixed(2)} ya está cubierto`,
        detalle:
          `Vas en ${indice.toFixed(2)} con ${creditos} créditos. Aunque no ` +
          `subieras más, terminas por encima de tu meta.`,
        peso: 45,
      },
    ];
  }

  // Imposible: el máximo por crédito es 3 (una A)
  if (porCredito > 3) {
    const maximo = (puntos + 3 * creditosRestantes) / creditosFinales;
    return [
      {
        id: "carrera-objetivo-inalcanzable",
        categoria: "bloqueo",
        severidad: "media",
        titulo: `Tu objetivo de ${ctx.indiceObjetivo.toFixed(2)} ya no es alcanzable`,
        detalle:
          `Harían falta ${porCredito.toFixed(2)} puntos por crédito en los ` +
          `${creditosRestantes} que te quedan, y el máximo es 3.00 (A en todo). ` +
          `Tu techo real es ${maximo.toFixed(2)}. Ajustar la meta te da una ` +
          `referencia más útil.`,
        accion: { texto: "Ajustar objetivo", ruta: "/perfil" },
        peso: 70,
      },
    ];
  }

  // Traducir puntos por crédito a lenguaje de letras
  let equivalente: string;
  if (porCredito <= 1) equivalente = "C";
  else if (porCredito <= 2) equivalente = "B";
  else equivalente = "A";

  const exigente = porCredito > 2.5;

  return [
    {
      id: "carrera-objetivo",
      categoria: "carrera",
      severidad: exigente ? "media" : "baja",
      titulo: `Para llegar a ${ctx.indiceObjetivo.toFixed(2)} necesitas promediar ${equivalente}`,
      detalle:
        `Vas en ${indice.toFixed(2)}. En los ${creditosRestantes} créditos que ` +
        `te faltan necesitas ${porCredito.toFixed(2)} puntos por crédito, que es ` +
        `el equivalente a ${equivalente}${exigente ? " sostenida, sin margen" : ""}.`,
      peso: 50,
    },
  ];
}

/**
 * Patrón de desempeño entre secciones de una materia en curso.
 * Útil porque explica de dónde salen las metas desiguales del reparto.
 */
function patronesDeDesempeno(ctx: ContextoEstudiante): Recomendacion[] {
  const out: Recomendacion[] = [];

  for (const m of ctx.enCurso) {
    const conNotas = m.secciones
      .map((s) => {
        const hechas = s.notas.filter((n) => n.puntaje !== null);
        if (hechas.length === 0) return null;
        const prom =
          hechas.reduce(
            (a, n) => a + (n.puntaje! / (n.puntajeMax || 100)) * 100,
            0
          ) / hechas.length;
        return { nombre: s.nombre, prom, cantidad: hechas.length };
      })
      .filter((x): x is { nombre: string; prom: number; cantidad: number } => x !== null);

    if (conNotas.length < 2) continue; // hace falta comparar al menos dos

    conNotas.sort((a, b) => b.prom - a.prom);
    const mejor = conNotas[0];
    const peor = conNotas[conNotas.length - 1];
    const brecha = mejor.prom - peor.prom;

    if (brecha < 15) continue; // diferencia irrelevante

    out.push({
      id: `patron-${m.cursoId}`,
      categoria: "patron",
      severidad: "baja",
      titulo: `En ${m.materiaNombre} rindes mejor en ${mejor.nombre.toLowerCase()}`,
      detalle:
        `Promedias ${mejor.prom.toFixed(0)} en ${mejor.nombre.toLowerCase()} y ` +
        `${peor.prom.toFixed(0)} en ${peor.nombre.toLowerCase()}. Por eso las metas ` +
        `que te propone la app no son parejas: te pide más donde ya vienes bien.`,
      cursoId: m.cursoId,
      materiaNombre: m.materiaNombre,
      peso: 30,
    });
  }

  return out;
}

/**
 * Semestres que quedaron sin cerrar.
 *
 * Es el único aviso del motor sobre los DATOS y no sobre las notas: mientras
 * esos cursos sigan abiertos, sus créditos no entran al índice y el número que
 * ve el estudiante está por debajo del real. Puede pasar meses tomando
 * decisiones sobre una cifra equivocada sin sospecharlo, así que la severidad
 * es alta.
 *
 * Un solo aviso agregado, no uno por periodo: la acción es la misma para todos
 * y repetirla sería ruido.
 */
function semestresSinCerrar(ctx: ContextoEstudiante): Recomendacion[] {
  const pendientes = ctx.cursosSinCerrar ?? [];
  if (pendientes.length === 0) return [];

  const materias = pendientes.reduce((a, p) => a + p.cantidad, 0);
  if (materias === 0) return [];

  const nombres = pendientes.map((p) => nombrePeriodo(p.anio, p.periodo));

  const titulo =
    pendientes.length === 1
      ? `Tienes ${materias} materia${materias > 1 ? "s" : ""} sin cerrar de ${nombres[0]}`
      : `Tienes ${materias} materias sin cerrar de ${pendientes.length} semestres`;

  const detalle =
    `Mientras no las cierres, sus créditos no cuentan para tu índice y el número ` +
    `que ves está por debajo del real.` +
    (pendientes.length > 1 ? ` Son de ${nombres.join(" y ")}.` : "");

  return [
    {
      id: "mantenimiento-sin-cerrar",
      categoria: "mantenimiento",
      severidad: "alta",
      titulo,
      detalle,
      accion: { texto: "Cerrar semestre", ruta: "/semestre/cerrar" },
      peso: 95,
    },
  ];
}

/**
 * Cuando faltan datos, la respuesta correcta es pedirlos, no inventar consejos.
 */
function faltanDatos(ctx: ContextoEstudiante): Recomendacion[] {
  const out: Recomendacion[] = [];

  if (ctx.historial.length === 0) {
    out.push({
      id: "vacio-historial",
      categoria: "vacio",
      severidad: "media",
      titulo: "Carga tu historial para ver tu índice real",
      detalle:
        `Sin tus semestres anteriores, el índice se calcula solo con lo que ` +
        `estás cursando ahora y no refleja tu expediente. Si tienes el PDF de tu ` +
        `Historial de Notas, se carga en segundos.`,
      // Apunta a la importación por PDF, no a la captura manual: es el camino
      // rápido y el que hace que la app sea útil desde el primer uso.
      accion: { texto: "Importar historial", ruta: "/historial/importar" },
      peso: 75,
    });
  }

  const cursosDelPeriodo = ctx.cursosPeriodoActual ?? ctx.enCurso.length;

  if (cursosDelPeriodo === 0) {
    out.push({
      id: "vacio-semestre",
      categoria: "vacio",
      severidad: "media",
      titulo: "Agrega las materias de este semestre",
      detalle: `Con tus materias cargadas puedes proyectar qué notas necesitas.`,
      accion: { texto: "Agregar materias", ruta: "/semestre/nuevo" },
      peso: 74,
    });
  } else if (ctx.enCurso.length === 0) {
    // Tiene cursos en el periodo pero ninguno abierto: ya cerró el semestre.
    // No hay nada que sugerir aquí; el resto del motor cubre lo demás.
  } else {
    const sinNotas = ctx.enCurso.filter((m) => !tieneNotas(m));
    if (sinNotas.length === ctx.enCurso.length) {
      out.push({
        id: "vacio-notas",
        categoria: "vacio",
        severidad: "baja",
        titulo: "Registra tus primeras notas",
        detalle:
          `Con una sola nota por materia ya se pueden calcular proyecciones ` +
          `y metas concretas.`,
        peso: 35,
      });
    }
  }

  if (ctx.indiceObjetivo == null && ctx.historial.length > 0) {
    out.push({
      id: "vacio-objetivo",
      categoria: "vacio",
      severidad: "baja",
      titulo: "Define tu índice objetivo",
      detalle:
        `Con una meta, la app puede decirte qué promedio necesitas en los ` +
        `créditos que te faltan.`,
      accion: { texto: "Definir objetivo", ruta: "/perfil" },
      peso: 25,
    });
  }

  return out;
}

// ============================================================
// Composición
// ============================================================

/** Máximo de recomendaciones por materia, para no saturar con un solo curso. */
const MAX_POR_CURSO = 2;

/**
 * Máximo por categoría (las críticas no cuentan). Sin esto, un estudiante con
 * cinco materias en curso recibe cinco metas casi idénticas y la pantalla deja
 * de ser útil. Mejor dos metas y espacio para el resto.
 */
const MAX_POR_CATEGORIA = 2;

export type OpcionesRecomendaciones = {
  /** Cuántas devolver como máximo. Por defecto 6. */
  limite?: number;
};

/**
 * Genera y prioriza las recomendaciones del estudiante.
 *
 * Orden: primero por severidad (crítica → baja), luego por peso.
 * Las críticas nunca se recortan.
 */
export function generarRecomendaciones(
  ctx: ContextoEstudiante,
  opciones: OpcionesRecomendaciones = {}
): Recomendacion[] {
  const limite = opciones.limite ?? 6;

  const todas = [
    ...semestresSinCerrar(ctx),
    ...riesgoDeReprobar(ctx),
    ...bloqueosDeGraduacion(ctx),
    ...metasAccionables(ctx),
    ...logrosAsegurados(ctx),
    ...oportunidadesDeRepeticion(ctx),
    ...proyeccionDeCarrera(ctx),
    ...patronesDeDesempeno(ctx),
    ...faltanDatos(ctx),
  ];

  todas.sort((a, b) => {
    const s = ORDEN_SEVERIDAD[a.severidad] - ORDEN_SEVERIDAD[b.severidad];
    if (s !== 0) return s;
    return b.peso - a.peso;
  });

  // Tope por materia: si un curso genera cuatro avisos, solo pasan los dos
  // más importantes.
  const porCurso = new Map<string, number>();
  const porCategoria = new Map<Categoria, number>();
  const filtradas: Recomendacion[] = [];

  for (const r of todas) {
    if (r.severidad !== "critica") {
      const c = porCategoria.get(r.categoria) ?? 0;
      if (c >= MAX_POR_CATEGORIA) continue;
      porCategoria.set(r.categoria, c + 1);
    }
    if (r.cursoId) {
      const n = porCurso.get(r.cursoId) ?? 0;
      if (n >= MAX_POR_CURSO) continue;
      porCurso.set(r.cursoId, n + 1);
    }
    filtradas.push(r);
  }

  // Las críticas siempre se muestran, aunque excedan el límite
  const criticas = filtradas.filter((r) => r.severidad === "critica");
  const resto = filtradas.filter((r) => r.severidad !== "critica");

  return [...criticas, ...resto.slice(0, Math.max(0, limite - criticas.length))];
}

/** Agrupa por categoría, respetando el orden de prioridad ya calculado. */
export function agruparPorCategoria(
  recomendaciones: Recomendacion[]
): Map<Categoria, Recomendacion[]> {
  const mapa = new Map<Categoria, Recomendacion[]>();
  for (const r of recomendaciones) {
    const lista = mapa.get(r.categoria) ?? [];
    lista.push(r);
    mapa.set(r.categoria, lista);
  }
  return mapa;
}
