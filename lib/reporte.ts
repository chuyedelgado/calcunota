// Canal de retroalimentación por WhatsApp. Se arma un enlace wa.me con el mensaje
// prellenado y codificado, con contexto accionable (la ruta y, en pantallas de
// error, el detalle técnico). NUNCA incluye datos personales: ni correo, ni
// nombre, ni notas. Solo la ruta y el error.
const NUMERO = "50764299094";

export function urlReporte(opts: { ruta?: string; detalle?: string } = {}): string {
  const lineas = [
    "Hola, reporto un problema en CalcuNota.",
    opts.ruta ? `Pantalla: ${opts.ruta}` : null,
    opts.detalle ? `Error: ${opts.detalle}` : null,
    "Qué pasó: ",
  ].filter(Boolean);
  return `https://wa.me/${NUMERO}?text=${encodeURIComponent(lineas.join("\n"))}`;
}
