/**
 * CalcuNota — fusiona carreras duplicadas por variantes de nombre.
 *
 *   npx tsx prisma/fusionar-carreras.ts            (simula)
 *   npx tsx prisma/fusionar-carreras.ts --aplicar  (escribe)
 *
 * Los PDFs viejos y nuevos escriben el nombre de la misma carrera de forma
 * distinta ("LIC. EN ING. ELECTRONICA Y TELECOM. M-2024" vs "LICENCIATURA EN
 * INGENIERÍA ELECTRÓNICA Y TELECOMUNICACIONES"), así que el seed crea dos filas
 * de Carrera. Cada una queda con su propio plan vigente, y la vieja ofrece como
 * vigente un pénsum de 2016 o 2017.
 *
 * Por cada grupo duplicado:
 *   1. Elige la fila que sobrevive y su nombre canónico
 *   2. Reasigna los PlanEstudio de las otras filas a la que sobrevive
 *   3. Borra las filas que quedaron sin planes
 *   4. Renombra la sobreviviente al nombre canónico
 *
 * NO borra planes: PerfilEstudiante apunta a planId, así que reasignar en vez de
 * borrar preserva cualquier perfil existente.
 *
 * Es idempotente y no usa transacciones grandes: si se corta a mitad, basta con
 * volver a correrlo.
 *
 * Después de aplicarlo, correr:
 *   npx tsx prisma/marcar-vigencia.ts --aplicar
 */

import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { tituloMateria } from "../lib/texto";

if (!process.env.DATABASE_URL) {
  console.error("\nDATABASE_URL no está definida. Revisa el .env de la raíz.\n");
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const APLICAR = process.argv.includes("--aplicar");

// ------------------------------------------------------------
// Agrupación (misma lógica que prisma/verificar.ts)
// ------------------------------------------------------------

function claveCarrera(nombre: string): string {
  // limpiarNombre primero: sin él, sufijos como "(T1-2024)" dejan residuos
  // ("T", "T M") que impiden agrupar filas que son la misma carrera.
  return limpiarNombre(nombre)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\bLICENCIATURA\b|\bLIC\b|\bINGENIERIA\b|\bING\b|\bTECNICO\b/g, " ")
    .replace(/[^A-Z ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

// ------------------------------------------------------------
// Nombre canónico
// ------------------------------------------------------------

/**
 * Quita el sufijo de versión en cualquiera de sus formas.
 * Los PDFs de la UTP los escriben de maneras muy distintas:
 *   "M-2025"  "(M-24)"  "(T1-2024)"  "(T2-m24)"  "-2025"  " 2009"
 */
function limpiarNombre(n: string): string {
  return (
    n
      // Etiquetas entre paréntesis: (M-24), (T1-2024), (T2-m24), (M-2017
      .replace(/\(\s*[MT]\d?\s*-?\s*m?\d{2,4}\s*\)?/gi, " ")
      // Con prefijo de letra: M-2025, m24, T1-2024
      .replace(/\b[MT]\d?\s*-?\s*m?\d{2,4}\b/gi, " ")
      // Año suelto al final, con o sin guion: "-2025", " 2024", " 2009"
      .replace(/[\s-]+(19|20)\d\d\s*$/g, " ")
      // Paréntesis que quedó huérfano
      .replace(/\(\s*\)|\(\s*$/g, " ")
      .replace(/\s+/g, " ")
      .replace(/[\s,.\-()]+$/, "")
      .trim()
  );
}

/**
 * Restaura tildes en el vocabulario académico. Los PDFs de la UTP escriben
 * el mismo término con y sin acento ("INGENIERIA" / "INGENIERÍA"), y
 * tituloMateria arregla las mayúsculas pero no puede inventar tildes. Sin
 * esto, el estudiante ve "Ingenieria Electrica" en pantalla.
 */
const ACENTOS: Record<string, string> = {
  ingenieria: "Ingeniería",
  electrica: "Eléctrica",
  electricas: "Eléctricas",
  electronica: "Electrónica",
  electromecanica: "Electromecánica",
  mecanica: "Mecánica",
  aeronautica: "Aeronáutica",
  geomatica: "Geomática",
  geologica: "Geológica",
  informatica: "Informática",
  matematica: "Matemática",
  logistica: "Logística",
  maritima: "Marítima",
  maritimas: "Marítimas",
  biomedica: "Biomédica",
  quimica: "Química",
  tecnico: "Técnico",
  topografia: "Topografía",
  energia: "Energía",
  administracion: "Administración",
  aviacion: "Aviación",
  gestion: "Gestión",
  produccion: "Producción",
  comunicacion: "Comunicación",
  computacion: "Computación",
  educacion: "Educación",
  construccion: "Construcción",
  automatizacion: "Automatización",
  refrigeracion: "Refrigeración",
  especializacion: "Especialización",
  telematica: "Telemática",
  hidraulica: "Hidráulica",
  organizacion: "Organización",
  aplicada: "Aplicada",
};

function restaurarAcentos(nombre: string): string {
  return nombre
    .split(" ")
    .map((p) => {
      const sinTildes = p
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
      return ACENTOS[sinTildes] ?? p;
    })
    .join(" ");
}

/**
 * Nombres canónicos fijados a mano, para los casos donde ambas variantes del
 * PDF vienen mal (abreviadas, sin tildes, con sufijo raro).
 *
 * Se leen de prisma/nombres-carreras.json, con la forma:
 *   { "CLAVE NORMALIZADA": "Nombre Canónico Correcto" }
 *
 * La simulación imprime la clave de cada grupo, así que basta copiarla ahí.
 * El archivo es opcional: si no existe, se usa solo el algoritmo.
 */
const RUTA_NOMBRES = resolve(process.cwd(), "prisma/nombres-carreras.json");

function cargarNombresFijados(): Record<string, string> {
  if (!existsSync(RUTA_NOMBRES)) return {};
  try {
    return JSON.parse(readFileSync(RUTA_NOMBRES, "utf-8"));
  } catch (e) {
    console.error(`\nNo se pudo leer ${RUTA_NOMBRES}: ${String(e)}\n`);
    process.exit(1);
  }
}

const NOMBRES_FIJADOS = cargarNombresFijados();

/**
 * Puntúa un nombre para elegir el mejor de un grupo. Prefiere la forma
 * desarrollada y con acentuación correcta sobre la abreviada.
 */
function puntuarNombre(n: string): number {
  let p = 0;

  // Abreviaturas: la forma completa siempre es mejor
  if (/\bLic\.?\b/i.test(n)) p -= 12;
  if (/\bIng\.?\b/i.test(n)) p -= 12;
  if (/\bT[eé]c\.?\b/i.test(n)) p -= 12;
  if (/\bAdm[oó]n\.?\b/i.test(n)) p -= 6;
  if (/\bTelecom\.?\b/i.test(n)) p -= 6;

  // Sufijo de versión pegado al nombre
  if (/M\s*-?\s*20\d\d/i.test(n)) p -= 4;

  // Acentos graves: en español siempre son error ("Ingenierìa")
  if (/[àèìòù]/i.test(n)) p -= 10;

  // Paréntesis sin cerrar u otra basura
  if (/\([^)]*$/.test(n)) p -= 5;

  // Acentuación correcta presente
  if (/[áéíóúñ]/i.test(n)) p += 3;

  // A igualdad de lo demás, el más desarrollado. Peso bajo a propósito: la
  // longitud nunca debe compensar una abreviatura.
  p += Math.min(6, limpiarNombre(n).length / 20);

  // Premia la forma desarrollada explícitamente
  if (/\bLICENCIATURA\b/i.test(n)) p += 8;
  if (/\bINGENIER[IÍ]A\b/i.test(n)) p += 8;
  if (/\bT[EÉ]CNICO\b/i.test(n)) p += 8;

  return p;
}

function elegirNombre(nombres: string[], clave: string): string {
  const fijado = NOMBRES_FIJADOS[clave];
  if (fijado) return fijado;
  const mejor = [...nombres].sort((a, b) => puntuarNombre(b) - puntuarNombre(a))[0];
  return restaurarAcentos(tituloMateria(limpiarNombre(mejor)));
}

/**
 * Extrae la etiqueta de tendencia/versión del nombre de una carrera, para
 * desambiguar planes que comparten versión.
 *   "...de Software (T1-2024)" -> "t1"
 *   "...de Software (M-24)"    -> "m24"
 */
function etiquetaVersion(nombreCarrera: string): string | null {
  const m = nombreCarrera.match(/\(\s*([MT]\d?)\s*-?\s*(m?\d{2,4})\s*\)?/i);
  if (!m) return null;
  return `${m[1]}${m[2]}`.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Devuelve una versión libre para (carreraId, versión). PlanEstudio es único
 * por carrera+versión, así que al fusionar carreras con planes del mismo año
 * hay que desambiguar en vez de perder uno.
 */
async function versionLibre(
  carreraId: string,
  deseada: string,
  sufijo: string | null
): Promise<string> {
  let candidata = sufijo ? `${deseada}-${sufijo}` : deseada;
  let i = 2;
  while (
    await prisma.planEstudio.findFirst({
      where: { carreraId, version: candidata },
      select: { id: true },
    })
  ) {
    candidata = `${deseada}-${sufijo ?? "v"}${i}`;
    i++;
  }
  return candidata;
}

// ------------------------------------------------------------
// Fusión
// ------------------------------------------------------------

type CarreraConPlanes = {
  id: string;
  nombre: string;
  grado: string;
  facultadId: string;
  facultad: { nombre: string };
  planes: { id: string; version: string; vigente: boolean }[];
};

async function main() {
  console.log(
    APLICAR
      ? "\nAplicando fusión de carreras...\n"
      : "\nSimulación. Nada se modifica. Usa --aplicar para escribir.\n"
  );

  const carreras = (await prisma.carrera.findMany({
    include: {
      facultad: { select: { nombre: true } },
      planes: { select: { id: true, version: true, vigente: true } },
    },
    orderBy: { nombre: "asc" },
  })) as unknown as CarreraConPlanes[];

  // Agrupar
  const grupos = new Map<string, CarreraConPlanes[]>();
  for (const c of carreras) {
    const k = `${c.facultadId}|${claveCarrera(c.nombre)}|${c.grado}`;
    grupos.set(k, [...(grupos.get(k) ?? []), c]);
  }
  const duplicados = [...grupos.values()].filter((g) => g.length > 1);

  if (duplicados.length === 0) {
    console.log("No hay carreras duplicadas. Nada que hacer.\n");
    return;
  }

  console.log(
    `${duplicados.length} grupos duplicados (${duplicados.reduce((a, g) => a + g.length, 0)} filas)\n`
  );

  let planesReasignados = 0;
  let carrerasBorradas = 0;
  let renombradas = 0;
  const conflictos: string[] = [];

  for (const [clave, grupo] of [...grupos.entries()].filter(([, g]) => g.length > 1)) {
    // Sobrevive la fila con más planes; empate por id para ser determinista
    const ordenado = [...grupo].sort(
      (a, b) => b.planes.length - a.planes.length || a.id.localeCompare(b.id)
    );
    const superviviente = ordenado[0];
    const absorbidas = ordenado.slice(1);

    const claveGrupo = clave.split("|")[1];
    const nombreCanonico = elegirNombre(grupo.map((c) => c.nombre), claveGrupo);

    // Choque de versiones: varias filas con un plan del mismo año. No se omite:
    // se desambigua la versión con la etiqueta de tendencia del nombre original,
    // para no perder ningún plan ni romper los perfiles que lo referencian.
    const versiones = new Map<string, string[]>();
    for (const c of grupo) {
      for (const p of c.planes) {
        versiones.set(p.version, [...(versiones.get(p.version) ?? []), c.nombre]);
      }
    }
    const choques = [...versiones.entries()].filter(([, cs]) => cs.length > 1);

    const fijado = NOMBRES_FIJADOS[claveGrupo] !== undefined;
    console.log(`${superviviente.facultad.nombre}`);
    console.log(`   clave:     ${claveGrupo}`);
    console.log(
      `   canónico:  "${nombreCanonico}"${fijado ? "  (fijado a mano)" : ""}`
    );
    for (const c of grupo) {
      const vig = c.planes.find((p) => p.vigente)?.version ?? "sin vigente";
      const marca = c.id === superviviente.id ? "conserva " : "  absorbe";
      console.log(
        `   ${marca}  "${c.nombre}"  (${c.planes.length} plan/es, vigente ${vig})`
      );
    }

    if (choques.length) {
      console.log(
        `   versiones repetidas (${choques.map(([v]) => v).join(", ")}): se ` +
          `desambiguan con la etiqueta del nombre original, sin perder planes`
      );
    }

    const totalPlanes = absorbidas.reduce((a, c) => a + c.planes.length, 0);
    console.log(
      `   -> reasigna ${totalPlanes} plan/es, borra ${absorbidas.length} fila/s\n`
    );

    if (!APLICAR) continue;

    // 1. Reasignar planes. Sin transacción: idempotente, y una transacción
    //    interactiva sobre Neon con muchas filas agota su timeout de 5s.
    for (const c of absorbidas) {
      const sufijo = etiquetaVersion(c.nombre);
      for (const p of c.planes) {
        const version = await versionLibre(superviviente.id, p.version, sufijo);
        await prisma.planEstudio.update({
          where: { id: p.id },
          data: { carreraId: superviviente.id, version },
        });
        if (version !== p.version) {
          console.log(`      plan ${p.version} -> versión "${version}"`);
        }
        planesReasignados++;
      }
    }

    // 2. Borrar las filas absorbidas, ya sin planes.
    //    Se verifica que estén vacías antes de borrar.
    for (const c of absorbidas) {
      const quedan = await prisma.planEstudio.count({ where: { carreraId: c.id } });
      if (quedan > 0) {
        console.log(`   ⚠ "${c.nombre}" aún tiene ${quedan} plan/es. No se borra.`);
        continue;
      }
      await prisma.carrera.delete({ where: { id: c.id } });
      carrerasBorradas++;
    }

    // 3. Renombrar al canónico, ya sin riesgo de choque con la absorbida
    if (superviviente.nombre !== nombreCanonico) {
      const yaExiste = await prisma.carrera.findFirst({
        where: {
          facultadId: superviviente.facultadId,
          nombre: nombreCanonico,
          grado: superviviente.grado as never,
          id: { not: superviviente.id },
        },
      });
      if (yaExiste) {
        console.log(`   ⚠ "${nombreCanonico}" ya existe en otra fila. No se renombra.`);
      } else {
        await prisma.carrera.update({
          where: { id: superviviente.id },
          data: { nombre: nombreCanonico },
        });
        renombradas++;
      }
    }
  }

  // PerfilEstudiante.planId es obligatorio y tiene clave foránea, así que la
  // base ya impide perfiles huérfanos. Solo se informa el conteo.
  const perfiles = await prisma.perfilEstudiante.count();
  if (perfiles > 0) console.log(`Perfiles de estudiante intactos: ${perfiles}`);

  if (!APLICAR) {
    console.log("Corre con --aplicar para escribir los cambios.\n");
    if (conflictos.length) {
      console.log(`${conflictos.length} grupo(s) requieren revisión manual:`);
      for (const c of conflictos) console.log(`   ${c}`);
      console.log();
    }
    return;
  }

  console.log(
    `\n${planesReasignados} planes reasignados · ${carrerasBorradas} carreras borradas · ` +
      `${renombradas} renombradas`
  );
  if (conflictos.length) {
    console.log(`\n${conflictos.length} grupo(s) omitidos por revisar:`);
    for (const c of conflictos) console.log(`   ${c}`);
  }
  console.log(
    "\nSiguiente paso obligatorio:\n  npx tsx prisma/marcar-vigencia.ts --aplicar\n"
  );
}

main()
  .catch((e) => {
    console.error("\nFalló la fusión:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
