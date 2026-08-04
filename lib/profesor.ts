// Validación de los nombres de profesor ANTES de escribirlos en el catálogo.
//
// POR QUÉ: `Profesor` es el único sitio de la app donde un usuario escribe datos
// que OTROS ven. El nombre acaba en el desplegable de cierre de curso de todos
// los estudiantes de la universidad y en la calculadora pública, que no exige
// sesión. Sin límite de longitud ni de caracteres, una cuenta podía inyectar
// texto arbitrario y sin tope en un catálogo compartido, sin forma de deshacerlo
// desde la app.
//
// La normalización (espacios y capitalización) sigue viviendo en lib/texto.ts;
// aquí solo se decide si el nombre es admisible. Son dos cosas distintas y
// conviene que no se mezclen.

import { nombreProfesor } from "@/lib/texto";

export const MAX_NOMBRE_PROFESOR = 60;
const MIN_NOMBRE_PROFESOR = 2;

// Letras (con tildes y ñ), espacios, puntos, guiones y apóstrofos. Nada más:
// ni dígitos, ni emoji, ni signos de puntuación que permitan maquetar el
// desplegable ajeno. \p{L} cubre el alfabeto y \p{M} las marcas diacríticas que
// quedan sueltas cuando el texto llega descompuesto (NFD).
const PERMITIDOS = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u;

export type NombreValidado =
  | { ok: true; nombre: string }
  | { ok: false; error: string };

/**
 * Normaliza y valida un nombre de profesor.
 *
 * Devuelve `{ ok: true, nombre: "" }` cuando la entrada viene vacía: el profesor
 * es opcional en todos los flujos, así que "sin profesor" es válido y quien llama
 * simplemente no hace el upsert.
 */
export function validarNombreProfesor(entrada: string | null | undefined): NombreValidado {
  const nombre = nombreProfesor(String(entrada ?? ""));
  if (!nombre) return { ok: true, nombre: "" };

  if (nombre.length < MIN_NOMBRE_PROFESOR) {
    return { ok: false, error: "El nombre del profesor es demasiado corto." };
  }
  if (nombre.length > MAX_NOMBRE_PROFESOR) {
    return {
      ok: false,
      error: `El nombre del profesor no puede pasar de ${MAX_NOMBRE_PROFESOR} caracteres.`,
    };
  }
  if (!PERMITIDOS.test(nombre)) {
    return {
      ok: false,
      error: "El nombre del profesor solo admite letras, espacios, puntos, guiones y apóstrofos.",
    };
  }
  return { ok: true, nombre };
}
