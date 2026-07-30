// Extracción del texto del "Historial de Notas" (PDF del portal de matrícula
// de la UTP) en el runtime de Node de Vercel.
//
// Librería: unpdf (https://github.com/unjs/unpdf).
//   - Trae un build serverless de pdf.js: JavaScript puro, SIN binarios nativos
//     ni dependencias de sistema (no necesita `canvas`, ni `sharp`, ni un worker
//     aparte). Encaja directo en las Serverless/Edge Functions de Vercel.
//   - No requiere configuración especial de Next (no hay que tocar webpack ni
//     serverExternalPackages). pdfjs-dist, en cambio, obliga a configurar
//     GlobalWorkerOptions.workerSrc y suele necesitar el build "legacy" +
//     polyfills en Node, más fricción con el bundling de Next.
//
// Este módulo es SOLO de servidor (usa APIs de Node); no importarlo en cliente.

import { extractText, getDocumentProxy } from "unpdf";
import { parsearHistorial, type ResultadoHistorial } from "./importarHistorial";

// Extrae el texto plano del PDF, línea por línea, tal como lo espera
// parsearHistorial. `mergePages` une todas las páginas en un solo string.
export async function extraerTextoHistorial(
  datos: Uint8Array | ArrayBuffer,
): Promise<string> {
  const buffer = datos instanceof Uint8Array ? datos : new Uint8Array(datos);
  const pdf = await getDocumentProxy(buffer);
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

// Conveniencia: del PDF crudo directo a las filas estructuradas.
export async function importarHistorialDesdePdf(
  datos: Uint8Array | ArrayBuffer,
): Promise<ResultadoHistorial> {
  const texto = await extraerTextoHistorial(datos);
  return parsearHistorial(texto);
}
