// Emparejamiento del historial parseado contra la base de datos.
//
// lib/importarHistorial.ts devuelve filas con NOMBRE de materia, sin código ni
// créditos. Aquí se resuelven contra la base con un orden de prioridad claro.
// El módulo es PURO (no toca Prisma): recibe las materias del plan y del
// catálogo ya cargadas, así se prueba en aislamiento. La acción de servidor es
// la que hace las consultas y arma esas listas.
//
// Prioridad (validada contra un historial real: 100% por nombre exacto):
//   1. Contra el PLAN del estudiante, por nombre normalizado exacto. Los
//      créditos SIEMPRE salen del plan propio (la misma materia vale 3 en un
//      plan y 4 en otro; usar el equivocado desvía el índice).
//   2. Contra el catálogo global, por nombre exacto. Créditos = el MateriaPlan
//      más frecuente para ese código. Se marca "fuera del plan" (materias
//      convalidadas que el estudiante cursó pero no están en su pénsum).
//   3. Búsqueda difusa con buscar() de lib/texto: "posible coincidencia" que el
//      estudiante confirma.
//   4. Sin coincidencia: se reporta y el estudiante decide.

import { buscar, normalizar } from "./texto";
import type { CodigoNota, FilaHistorial } from "./importarHistorial";
import type { TipoPeriodo } from "./calculos";

export type FuenteMateria = "plan" | "catalogo";

export type MateriaRef = {
  materiaId: string;
  codigo: string;
  nombre: string; // nombre canónico de la base
  creditos: number; // del plan propio, o el más frecuente del catálogo
  fundamental: boolean;
  fuente: FuenteMateria;
};

export type OrigenEmparejamiento = "plan" | "catalogo" | "difuso" | "sin_resolver";

export type Emparejamiento = {
  // Índice estable dentro del historial (clave de React y de repeticiones).
  indice: number;
  nombreHistorial: string;
  periodo: { anio: number; tipo: TipoPeriodo };
  codigoNota: CodigoNota;
  notaExamenSemestral: number | null;
  origen: OrigenEmparejamiento;
  // Materia resuelta (ausente si sin_resolver).
  materiaId: string | null;
  codigo: string | null;
  nombre: string | null;
  creditos: number | null;
  fundamental: boolean;
  fueraDelPlan: boolean;
  // Para "difuso" (o edición manual): mejores candidatos a confirmar.
  candidatos: MateriaRef[];
};

/** Solo A/B/C/D/F entran al índice. P/W/R/I se registran pero no cuentan. */
export function codigoCuenta(codigo: CodigoNota): boolean {
  return codigo === "A" || codigo === "B" || codigo === "C" || codigo === "D" || codigo === "F";
}

// Índice de nombre normalizado -> materia, para el match exacto O(1).
function porNombre(refs: MateriaRef[]): Map<string, MateriaRef> {
  const m = new Map<string, MateriaRef>();
  for (const r of refs) {
    const k = normalizar(r.nombre);
    if (!m.has(k)) m.set(k, r); // la primera gana; los planes no repiten nombre
  }
  return m;
}

function desdeRef(base: Omit<Emparejamiento, "origen" | "materiaId" | "codigo" | "nombre" | "creditos" | "fundamental" | "fueraDelPlan" | "candidatos">, ref: MateriaRef, origen: OrigenEmparejamiento, candidatos: MateriaRef[]): Emparejamiento {
  return {
    ...base,
    origen,
    materiaId: ref.materiaId,
    codigo: ref.codigo,
    nombre: ref.nombre,
    creditos: ref.creditos,
    fundamental: ref.fundamental,
    fueraDelPlan: ref.fuente === "catalogo",
    candidatos,
  };
}

export function emparejarHistorial(
  filas: FilaHistorial[],
  plan: MateriaRef[],
  catalogo: MateriaRef[],
): Emparejamiento[] {
  const planPorNombre = porNombre(plan);
  const catalogoPorNombre = porNombre(catalogo);
  // Para la búsqueda difusa: plan primero (para que gane el crédito del plan).
  const combinado = [...plan, ...catalogo];

  return filas.map((fila, indice) => {
    const base = {
      indice,
      nombreHistorial: fila.nombreMateria,
      periodo: fila.periodo,
      codigoNota: fila.codigoNota,
      notaExamenSemestral: fila.notaExamenSemestral,
    };
    const clave = normalizar(fila.nombreMateria);

    // 1. Plan, nombre exacto.
    const enPlan = planPorNombre.get(clave);
    if (enPlan) return desdeRef(base, enPlan, "plan", []);

    // 2. Catálogo, nombre exacto.
    const enCatalogo = catalogoPorNombre.get(clave);
    if (enCatalogo) return desdeRef(base, enCatalogo, "catalogo", []);

    // 3. Difuso: mejores candidatos, el primero como tentativo.
    const candidatos = buscar(combinado, fila.nombreMateria, (r) => `${r.codigo} ${r.nombre}`).slice(0, 6);
    if (candidatos.length > 0) return desdeRef(base, candidatos[0], "difuso", candidatos);

    // 4. Sin resolver.
    return {
      ...base,
      origen: "sin_resolver" as const,
      materiaId: null,
      codigo: null,
      nombre: null,
      creditos: null,
      fundamental: false,
      fueraDelPlan: false,
      candidatos: [],
    };
  });
}
