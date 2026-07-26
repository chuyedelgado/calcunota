/**
 * CalcuNota — utilidades de texto.
 *
 * Dos problemas que resuelve este módulo:
 *
 * 1. CAPITALIZACIÓN. Los planes de la UTP vienen en MAYÚSCULAS. Convertirlos a
 *    Título con una regla ingenua rompe los numerales romanos ("Cálculo i") y
 *    las siglas ("(fit)"). Aquí están las reglas correctas.
 *
 * 2. BÚSQUEDA. Un estudiante escribe "calculo" y espera encontrar "Cálculo I".
 *    La búsqueda debe ignorar tildes, mayúsculas y signos de puntuación.
 */

// ============================================================
// Normalización para búsqueda
// ============================================================

/**
 * Deja el texto en una forma comparable: sin tildes, en minúsculas y con
 * espacios colapsados. "Cálculo I" y "calculo i" normalizan igual.
 *
 * La ñ se preserva: en español es una letra distinta, no una n con tilde.
 */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    // Quita diacríticos pero protege la ñ/Ñ, que ya fue descompuesta
    .replace(/n\u0303/g, "\u0001")
    .replace(/N\u0303/g, "\u0002")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0001/g, "ñ")
    .replace(/\u0002/g, "Ñ")
    .toLocaleLowerCase("es")
    .replace(/[.,;:()[\]/\\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * ¿El texto coincide con la consulta? Tolera tildes, mayúsculas y puntuación,
 * y exige que TODOS los términos de la consulta aparezcan, en cualquier orden.
 *
 * "calculo 1"      encuentra "Cálculo I"       (ver equivalencias de romanos)
 * "dif integral"   encuentra "Cálculo Diferencial e Integral I"
 * "prog ii"        encuentra "Programación II"
 */
export function coincide(texto: string, consulta: string): boolean {
  const t = expandirRomanos(normalizar(texto));
  const terminos = expandirRomanos(normalizar(consulta)).split(" ").filter(Boolean);
  if (terminos.length === 0) return true;
  return terminos.every((termino) => t.includes(termino));
}

/**
 * Puntaje de relevancia, para ordenar resultados. Mayor = más relevante.
 * Devuelve 0 si no coincide.
 */
export function relevancia(texto: string, consulta: string): number {
  if (!coincide(texto, consulta)) return 0;

  const t = expandirRomanos(normalizar(texto));
  const q = expandirRomanos(normalizar(consulta));

  if (t === q) return 100; // coincidencia exacta
  if (t.startsWith(q)) return 80; // empieza igual

  // Empieza alguna palabra con la consulta: "prog" en "Programación II"
  const palabras = t.split(" ");
  if (palabras.some((p) => p.startsWith(q))) return 60;

  // Contiene la consulta completa como subcadena
  if (t.includes(q)) return 40;

  return 20; // todos los términos aparecen, pero sueltos
}

/**
 * Filtra y ordena una lista por relevancia contra la consulta.
 */
export function buscar<T>(
  items: T[],
  consulta: string,
  texto: (item: T) => string
): T[] {
  if (!consulta.trim()) return items;
  return items
    .map((item) => ({ item, r: relevancia(texto(item), consulta) }))
    .filter((x) => x.r > 0)
    .sort((a, b) => b.r - a.r)
    .map((x) => x.item);
}

/**
 * Convierte numerales romanos sueltos a su valor arábigo, y viceversa, para
 * que "calculo 2" encuentre "Cálculo II" y "calculo ii" también.
 *
 * Solo actúa sobre palabras completas, así que no toca "IV" dentro de otra
 * palabra ni convierte el "i" de una sigla.
 */
const ROMANO_A_NUMERO: Record<string, string> = {
  i: "1", ii: "2", iii: "3", iv: "4", v: "5",
  vi: "6", vii: "7", viii: "8", ix: "9", x: "10",
};

function expandirRomanos(textoNormalizado: string): string {
  return textoNormalizado
    .split(" ")
    .map((p) => ROMANO_A_NUMERO[p] ?? p)
    .join(" ");
}

// ============================================================
// Capitalización de nombres académicos
// ============================================================

/** Palabras que van en minúscula salvo al inicio del nombre. */
const MINUSCULAS = new Set([
  "de", "del", "la", "las", "el", "los", "y", "e", "o", "u",
  "en", "a", "al", "con", "para", "por", "sin", "sobre", "ante",
]);

/** Numerales romanos que aparecen en nombres de materias. */
const ROMANOS = /^[ivx]+$/i;

/** Siglas que deben quedar en mayúsculas completas. */
const SIGLAS = new Set([
  "fit", "utp", "iso", "cad", "cam", "cnc", "plc", "gps", "sig",
  "tic", "pib", "iva", "rrhh", "sql", "html", "css", "php",
]);

/**
 * ¿Es una sigla? Además de la lista, se detectan patrones como "A/A"
 * (aire acondicionado) y abreviaturas con barra.
 */
function esSigla(palabra: string): boolean {
  const limpia = palabra.replace(/[().,]/g, "").toLocaleLowerCase("es");
  if (SIGLAS.has(limpia)) return true;
  // Patrón X/X o X/XX: "A/A", "E/S"
  if (/^[a-z]\/[a-z]{1,2}$/i.test(limpia)) return true;
  return false;
}

function capitalizarPalabra(p: string): string {
  if (!p) return p;
  // Respeta paréntesis y comillas de apertura: "(inglés)" -> "(Inglés)"
  const m = p.match(/^([("'¿¡]*)(.*)$/);
  if (!m) return p;
  const [, prefijo, resto] = m;
  if (!resto) return p;
  return prefijo + resto.charAt(0).toLocaleUpperCase("es") + resto.slice(1);
}

/**
 * Convierte el nombre de una materia de MAYÚSCULAS a Título, respetando:
 *   - numerales romanos:  "CALCULO I"        -> "Cálculo I"  (no "Cálculo i")
 *   - siglas:             "AERONAUTICA (FIT)"-> "Aeronáutica (FIT)"
 *   - palabras funcionales: "BASE DE DATOS"  -> "Base de Datos"
 *   - abreviaturas:       "ADMON. FINANCIERA"-> "Admon. Financiera"
 *
 * La primera palabra siempre se capitaliza, aunque sea funcional.
 */
export function tituloMateria(nombre: string): string {
  const limpio = nombre.replace(/\s+/g, " ").trim();
  if (!limpio) return limpio;

  const palabras = limpio.toLocaleLowerCase("es").split(" ");
  const original = limpio.split(" ");

  return palabras
    .map((p, i) => {
      const nucleo = p.replace(/[().,]/g, "");

      // Numerales romanos en mayúsculas, tal como venían
      if (ROMANOS.test(nucleo) && nucleo.length > 0) {
        return original[i].toLocaleUpperCase("es");
      }

      // Siglas completas
      if (esSigla(p)) {
        return original[i].toLocaleUpperCase("es");
      }

      // Palabras funcionales en minúscula, salvo la primera
      if (i > 0 && MINUSCULAS.has(nucleo)) {
        return p;
      }

      return capitalizarPalabra(p);
    })
    .join(" ");
}

/** Igual que tituloMateria, pensado para nombres de facultad y carrera. */
export function tituloAcademico(nombre: string): string {
  return tituloMateria(nombre);
}

/**
 * Normaliza el nombre de un profesor para evitar duplicados en la base:
 * "juan  perez" y "JUAN PEREZ" quedan ambos como "Juan Perez".
 */
export function nombreProfesor(nombre: string): string {
  const limpio = nombre.replace(/\s+/g, " ").trim();
  if (!limpio) return limpio;
  return limpio
    .toLocaleLowerCase("es")
    .split(" ")
    .map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : capitalizarPalabra(p)))
    .join(" ");
}
