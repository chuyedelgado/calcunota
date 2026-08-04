// Límite de peticiones con contador en Postgres.
//
// POR QUÉ EN LA BASE Y NO EN MEMORIA: el estado se comparte entre instancias, así
// que el límite se respeta aunque la app corra en varios procesos. Y no ata el
// proyecto a la infraestructura de ningún proveedor: funciona igual en Vercel, en
// DigitalOcean App Platform o en un VPS, porque el estado vive en Postgres.
//
// Ventana FIJA por bucket: el inicio de la ventana forma parte de la clave única,
// así que un upsert atómico incrementa o crea sin condiciones de carrera. No es
// deslizante; el costo es que en el cruce de dos ventanas se permiten hasta 2× el
// límite. Es suficiente para frenar abuso y mucho más simple.

import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

export type Limite = { max: number; ventanaMs: number };

const MINUTO = 60_000;
const HORA = 60 * MINUTO;

/**
 * Límites por acción. Los de usuario son sólidos (el id sale de la sesión); los
 * de IP son antiabuso oportunista (ver `ipDeLaPeticion`).
 */
export const LIMITES = {
  // El flujo real es subir el historial una o dos veces, no cinco.
  importarPdf: { max: 5, ventanaMs: HORA },
  // Borra y reescribe el expediente entero: caro y raro de repetir.
  reemplazarHistorial: { max: 10, ventanaMs: HORA },
  // Con la caché del catálogo ya no tocan la base; esto acota la CPU.
  busquedaPublica: { max: 60, ventanaMs: MINUTO },
  // Holgado a propósito: solo frena bucles, no el uso normal.
  escrituraAutenticada: { max: 120, ventanaMs: MINUTO },
} as const satisfies Record<string, Limite>;

export type AccionLimitada = keyof typeof LIMITES;

export type ResultadoLimite = {
  /** true = puede continuar. Ante un fallo de la base SIEMPRE es true. */
  permitido: boolean;
  /** Segundos hasta que se abra la siguiente ventana. Solo si no se permite. */
  esperaSegundos: number;
};

const PERMITIDO: ResultadoLimite = { permitido: true, esperaSegundos: 0 };

// Probabilidad de aprovechar una llamada para barrer filas vencidas. Con ~1 de
// cada 100 peticiones basta para que la tabla no crezca sin control, y no añade
// una consulta de borrado a cada petición.
const PROB_LIMPIEZA = 0.01;

async function limpiezaOportunista(ahora: number): Promise<void> {
  if (Math.random() >= PROB_LIMPIEZA) return;
  try {
    // Todo lo anterior a la última hora ya no puede influir en ninguna ventana.
    await prisma.limitePeticiones.deleteMany({
      where: { ventana: { lt: new Date(ahora - HORA) } },
    });
  } catch (e) {
    // La limpieza es accesoria: nunca debe afectar a la petición en curso.
    console.error("[limite] falló la limpieza de contadores:", e);
  }
}

/**
 * Consume una unidad del cupo de `accion` para `clave`.
 *
 * FALLA ABIERTO: si la consulta del contador falla, se DEJA PASAR la petición y
 * se registra el error. Un límite que tumba la app cuando la base tiene un hipo
 * es peor que no tener límite.
 */
export async function consumirLimite(
  accion: AccionLimitada,
  clave: string,
): Promise<ResultadoLimite> {
  if (!clave) return PERMITIDO;

  const { max, ventanaMs } = LIMITES[accion];
  const ahora = Date.now();
  // Inicio de la ventana actual, alineado al tamaño de la ventana.
  const inicio = new Date(Math.floor(ahora / ventanaMs) * ventanaMs);

  try {
    const fila = await prisma.limitePeticiones.upsert({
      where: { clave_accion_ventana: { clave, accion, ventana: inicio } },
      create: { clave, accion, ventana: inicio, conteo: 1 },
      update: { conteo: { increment: 1 } },
      select: { conteo: true },
    });

    void limpiezaOportunista(ahora);

    if (fila.conteo > max) {
      const esperaMs = inicio.getTime() + ventanaMs - ahora;
      return { permitido: false, esperaSegundos: Math.max(1, Math.ceil(esperaMs / 1000)) };
    }
    return PERMITIDO;
  } catch (e) {
    console.error(`[limite] contador no disponible para ${accion}; se deja pasar:`, e);
    return PERMITIDO;
  }
}

/**
 * IP del cliente, para los límites que no tienen sesión.
 *
 * ATENCIÓN: `X-Forwarded-For` la escribe el proxy y es FALSIFICABLE si el proxy
 * no la sanea. Se toma la PRIMERA entrada (el cliente original; las siguientes
 * son los proxys intermedios), pero un atacante puede anteponer lo que quiera.
 *
 * Por eso el límite por IP es ANTIABUSO OPORTUNISTA, no una barrera de seguridad:
 * detiene un script ingenuo, no a quien rota cabeceras a propósito. Lo que sí es
 * sólido es el límite por usuario, cuya clave sale de la sesión. No confundir
 * ambos ni apoyar en este ninguna decisión de autorización.
 */
export async function ipDeLaPeticion(): Promise<string> {
  const h = await headers();
  const reenviada = h.get("x-forwarded-for");
  if (reenviada) {
    const primera = reenviada.split(",")[0]?.trim();
    if (primera) return primera.slice(0, 64);
  }
  return h.get("x-real-ip")?.slice(0, 64) ?? "desconocida";
}

/** Mensaje uniforme para cuando se agota el cupo. */
export function mensajeLimite(espera: number): string {
  if (espera >= 60) {
    const min = Math.ceil(espera / 60);
    return `Has hecho esto demasiadas veces. Vuelve a intentarlo en ${min} ${min === 1 ? "minuto" : "minutos"}.`;
  }
  return `Has hecho esto demasiadas veces. Vuelve a intentarlo en ${espera} segundos.`;
}
