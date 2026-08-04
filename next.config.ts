import type { NextConfig } from "next";

const esDesarrollo = process.env.NODE_ENV === "development";

// Interruptor único para pasar la CSP de Report-Only a obligatoria. Se cambia a
// `true` cuando la consola quede limpia navegando toda la app; entonces empieza a
// BLOQUEAR de verdad. No hace falta tocar nada más: la cabecera y
// 'upgrade-insecure-requests' se ajustan solos.
const CSP_OBLIGATORIA = false;

// Content-Security-Policy. Va en Report-Only a propósito: Next inyecta scripts y
// estilos en línea (hidratación, Tailwind), así que una CSP estricta de golpe
// rompe la app. En Report-Only el navegador NO bloquea nada, solo reporta la
// violación en la consola. Cuando la consola quede limpia navegando la app
// entera, se cambia la cabecera a "Content-Security-Policy" a secas.
//
// 'unsafe-inline' en script-src es lo que habría que quitar al final, y para eso
// hacen falta nonces, que requieren middleware.ts. Queda anotado, no se hace
// ahora: el objetivo de este paso es tener la red puesta y medir qué rompe.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  // Respaldo de X-Frame-Options, y más expresivo (lo entienden los navegadores
  // modernos; X-Frame-Options cubre los viejos).
  "frame-ancestors 'none'",
  // Los formularios y las Server Actions solo pueden enviar al propio origen.
  "form-action 'self'",
  "img-src 'self' data: blob: https://*.googleusercontent.com",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  // 'unsafe-eval' solo en desarrollo: lo necesita el refresco rápido de React.
  `script-src 'self' 'unsafe-inline'${esDesarrollo ? " 'unsafe-eval'" : ""}`,
  "connect-src 'self'",
  "manifest-src 'self'",
  "frame-src 'none'",
  "worker-src 'self' blob:",
  // 'upgrade-insecure-requests' se añade SOLO cuando la CSP es obligatoria: en
  // Report-Only el navegador lo ignora y únicamente genera ruido en la consola.
  ...(CSP_OBLIGATORIA ? ["upgrade-insecure-requests"] : []),
].join("; ");

const cabecerasSeguridad = [
  // Clickjacking. Va primero por su impacto real: /perfil tiene una acción
  // destructiva irreversible a un clic de confirmación, y sin esta cabecera
  // cualquiera puede incrustar la app en un iframe invisible para provocarla.
  { key: "X-Frame-Options", value: "DENY" },

  // Fuerza HTTPS en las visitas siguientes. Sin esto la PRIMERA visita es
  // interceptable (degradar a http en una wifi de campus). Sin `preload`: eso se
  // registra en una lista de los navegadores y es difícil de revertir; conviene
  // dejarlo para cuando el dominio definitivo esté asentado tras la migración.
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },

  // Impide que el navegador adivine el tipo de contenido.
  { key: "X-Content-Type-Options", value: "nosniff" },

  // Al salir por un enlace externo (el WhatsApp del reporte) no se filtra la ruta
  // completa, que puede llevar un id de recurso como /semestre/<cursoId>.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

  // La app no usa ninguna de estas capacidades: se desactivan explícitamente.
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=()",
  },

  {
    key: CSP_OBLIGATORIA ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only",
    value: csp,
  },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "pg"],
  // No revela la versión del framework en las respuestas.
  poweredByHeader: false,
  images: {
    // Fotos de perfil de Google (avatar del Navbar).
    remotePatterns: [{ protocol: "https", hostname: "*.googleusercontent.com" }],
  },
  async headers() {
    return [{ source: "/:path*", headers: cabecerasSeguridad }];
  },
};

export default nextConfig;
