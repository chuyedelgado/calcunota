// Extracción del texto del "Historial de Notas" (PDF del portal de matrícula
// de la UTP) en el runtime de Node.
//
// Librería: unpdf (https://github.com/unjs/unpdf).
//   - Trae un build serverless de pdf.js: JavaScript puro, SIN binarios nativos
//     ni dependencias de sistema (no necesita `canvas`, ni `sharp`, ni un worker
//     aparte). Funciona igual en un contenedor de larga vida que en una función
//     serverless, así que la migración de plataforma no lo toca.
//   - No requiere configuración especial de Next (no hay que tocar webpack ni
//     serverExternalPackages). pdfjs-dist, en cambio, obliga a configurar
//     GlobalWorkerOptions.workerSrc y suele necesitar el build "legacy" +
//     polyfills en Node, más fricción con el bundling de Next.
//
// Este módulo es SOLO de servidor (usa APIs de Node); no importarlo en cliente.

import { extractText, getDocumentProxy } from "unpdf";
import { parsearHistorial, type ResultadoHistorial } from "./importarHistorial";

/**
 * Tiempo máximo de extracción.
 *
 * Referencia medida: el Historial de Notas real (75 KB, 2 páginas) tarda 86 ms
 * en frío y ~10 ms en caliente. El límite de subida es 5 MB, unas 66 veces ese
 * archivo. 10 s deja un margen de más de cien veces lo observado: un PDF legítimo
 * jamás se acerca, y uno que lo supere es patológico (bomba de descompresión o
 * estructura cíclica) y no vale la pena seguir procesándolo.
 */
export const TIEMPO_MAXIMO_MS = 10_000;

/** Motivo por el que falló la extracción, para dar un mensaje útil. */
export type MotivoFalloPdf = "cifrado" | "corrupto" | "tiempo" | "desconocido";

export class ErrorPdf extends Error {
  constructor(readonly motivo: MotivoFalloPdf, mensaje: string) {
    super(mensaje);
    this.name = "ErrorPdf";
  }
}

// pdf.js distingue los casos por el `name` de su excepción. Un PDF protegido con
// contraseña lanza PasswordException, que NO es lo mismo que uno corrupto: el
// estudiante puede resolverlo, así que merece su propio mensaje.
function clasificar(e: unknown): MotivoFalloPdf {
  const nombre = e && typeof e === "object" && "name" in e ? String((e as Error).name) : "";
  if (nombre === "PasswordException") return "cifrado";
  if (nombre === "InvalidPDFException") return "corrupto";
  return "desconocido";
}

// El tipo que expone unpdf no declara la liberación de recursos, pero en runtime
// el documento trae `cleanup()` y su `loadingTask` trae `destroy()`. Se describen
// como opcionales y se llama a lo que exista, sin asumir ninguno de los dos.
type Liberable = {
  cleanup?: () => unknown;
  loadingTask?: { destroy?: () => unknown };
};

async function liberar(pdf: unknown): Promise<void> {
  const p = pdf as Liberable | null;
  try {
    await p?.loadingTask?.destroy?.();
  } catch {
    // Liberar es best-effort: nunca debe tapar el error real de la extracción.
  }
  try {
    await p?.cleanup?.();
  } catch {
    /* idem */
  }
}

/**
 * Extrae el texto plano del PDF, línea por línea, tal como lo espera
 * parsearHistorial. `mergePages` une todas las páginas en un solo string.
 *
 * OJO con el búfer: pdf.js DESACOPLA el ArrayBuffer que recibe (queda en cero
 * bytes), así que no se puede reutilizar el mismo para una segunda extracción.
 * Cada llamada necesita su propia copia.
 *
 * Sobre el tiempo máximo: la carrera corta la ESPERA, no el trabajo. pdf.js hace
 * el grueso del análisis en JavaScript síncrono, y una promesa no interrumpe un
 * bucle ocupado. Lo que se consigue es (a) responderle al estudiante enseguida en
 * vez de dejarlo colgado y (b) soltar los recursos del documento.
 *
 * El corte duro de verdad lo pone la plataforma, y NO todas lo ponen: en Vercel
 * es `maxDuration` (ver la página del importador); en App Platform, que es un
 * contenedor de larga vida, no existe ese límite y este tiempo máximo es lo
 * único que hay. Anotado como deuda en MIGRACION.md.
 */
export async function extraerTextoHistorial(
  datos: Uint8Array | ArrayBuffer,
  tiempoMaximoMs: number = TIEMPO_MAXIMO_MS,
): Promise<string> {
  const buffer = datos instanceof Uint8Array ? datos : new Uint8Array(datos);

  let pdf: Awaited<ReturnType<typeof getDocumentProxy>> | null = null;
  let temporizador: ReturnType<typeof setTimeout> | undefined;

  try {
    pdf = await getDocumentProxy(buffer);

    const conTiempo = new Promise<never>((_, rechazar) => {
      temporizador = setTimeout(
        () => rechazar(new ErrorPdf("tiempo", "La extracción del PDF superó el tiempo máximo.")),
        tiempoMaximoMs,
      );
    });

    const { text } = await Promise.race([extractText(pdf, { mergePages: true }), conTiempo]);
    return text;
  } catch (e) {
    if (e instanceof ErrorPdf) throw e;
    throw new ErrorPdf(clasificar(e), e instanceof Error ? e.message : "Fallo al leer el PDF.");
  } finally {
    clearTimeout(temporizador);
    // Suelta los recursos pase lo que pase (también al agotarse el tiempo).
    await liberar(pdf);
  }
}

// Conveniencia: del PDF crudo directo a las filas estructuradas.
export async function importarHistorialDesdePdf(
  datos: Uint8Array | ArrayBuffer,
): Promise<ResultadoHistorial> {
  const texto = await extraerTextoHistorial(datos);
  return parsearHistorial(texto);
}
