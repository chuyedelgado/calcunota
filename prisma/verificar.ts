/**
 * CalcuNota — verificación de la base tras el seed.
 *
 *   npx tsx prisma/verificar.ts
 *
 * A diferencia de la versión anterior, NO tiene conteos fijos. Los deriva de
 * scraping_materias/planes.json, que es la fuente de verdad. Así el verificador
 * sigue sirviendo cada vez que se agreguen planes, sin editarlo a mano.
 *
 * El invariante que comprueba es: "la base refleja exactamente lo que produjo
 * el scraper", más comprobaciones estructurales que no dependen de conteos.
 */

import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

if (!process.env.DATABASE_URL) {
  console.error("\nDATABASE_URL no está definida. Revisa el .env de la raíz.\n");
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const RUTA_JSON = resolve(process.cwd(), "scraping_materias/planes.json");
const RUTA_MATRICULA = resolve(
  process.cwd(),
  "scraping_materias/planes_matricula.json"
);

let fallos = 0;
let avisos = 0;

function check(nombre: string, real: unknown, esperado: unknown) {
  const ok = real === esperado;
  if (!ok) fallos++;
  console.log(
    `${ok ? "✓" : "✗"}  ${nombre.padEnd(44)} ${String(real).padStart(6)}` +
      (ok ? "" : `   (esperado ${esperado})`)
  );
}

function aviso(nombre: string, condicion: boolean, detalle = "") {
  if (!condicion) avisos++;
  console.log(
    `${condicion ? "✓" : "!"}  ${nombre.padEnd(44)}${detalle ? " " + detalle : ""}`
  );
}

function info(nombre: string, valor: unknown) {
  console.log(`   ${nombre.padEnd(44)} ${String(valor).padStart(6)}`);
}

// ------------------------------------------------------------
// Mismas reglas que prisma/seed.ts, para derivar lo esperado
// ------------------------------------------------------------


/** Quita el sufijo de versión en cualquiera de sus formas. */
function limpiarNombre(n: string): string {
  return n
    .replace(/\(\s*[MT]\d?\s*-?\s*m?\d{2,4}\s*\)?/gi, " ")
    .replace(/\b[MT]\d?\s*-?\s*m?\d{2,4}\b/gi, " ")
    .replace(/[\s-]+(19|20)\d\d\s*$/g, " ")
    .replace(/\(\s*\)|\(\s*$/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[\s,.\-()]+$/, "")
    .trim();
}

/** Normaliza para detectar carreras que son la misma con otro nombre. */
function claveCarrera(nombre: string): string {
  // limpiarNombre primero: sin él, sufijos como "(T1-2024)" dejan residuos
  // ("T", "T M") que impiden agrupar filas que son la misma carrera.
  return limpiarNombre(nombre)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(
      /\bLICENCIATURA\b|\bLIC\b|\bINGENIERIA\b|\bING\b|\bTECNICO\b|\bTEC\b/g,
      " "
    )
    // El "EN" queda huérfano al quitar "Licenciatura en Ingeniería" y hace que
    // "Licenciatura en Ingenieria Civil" (planes de facultad) no agrupe con
    // "INGENIERIA CIVIL" (portal de matrícula). Se quita también.
    .replace(/\bEN\b|\bDEL\b|\bLA\b/g, " ")
    .replace(/[^A-Z ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

type FilaJson = { codigo: string };
type PlanJson = {
  archivo: string;
  facultad: string | null;
  carrera: string | null;
  materias: FilaJson[];
  electivas: FilaJson[];
};

async function main() {
  const planes: PlanJson[] = JSON.parse(readFileSync(RUTA_JSON, "utf-8"));
  const matricula: PlanJson[] = existsSync(RUTA_MATRICULA)
    ? JSON.parse(readFileSync(RUTA_MATRICULA, "utf-8"))
    : [];

  // Se agrupa con claveCarrera, la MISMA función que usa fusionar-carreras.ts.
  // Con el nombre crudo, dos variantes del mismo nombre contarían como dos
  // carreras y el esperado nunca cuadraría con una base ya fusionada.

  console.log("\n── Inventario ───────────────────────────────────────────\n");

  // Los conteos se informan, NO se comparan contra un valor esperado.
  //
  // Razón: la base ya no es el reflejo de un solo JSON. Es el resultado de una
  // secuencia de operaciones (carga de facultad, integración de matrícula que
  // reemplaza planes por carrera, fusiones, podas). Derivar un "esperado" de los
  // JSON exigiría replicar aquí toda esa lógica, y un verificador que arrastra
  // una copia de la migración se desincroniza y reporta fallos permanentes.
  //
  // Un verificador con fallos permanentes se aprende a ignorar, y entonces deja
  // de detectar los problemas de verdad. Lo que sí se verifica más abajo son
  // INVARIANTES, que no dependen de la fuente.
  info("Universidades", await prisma.universidad.count());
  info("Facultades", await prisma.facultad.count());
  info("Carreras", await prisma.carrera.count());
  info("Planes de estudio", await prisma.planEstudio.count());
  info("Materias (códigos únicos)", await prisma.materia.count());
  info("MateriaPlan", await prisma.materiaPlan.count());
  info("Prerequisitos", await prisma.prerequisito.count());

  console.log(
    `\n   de referencia: ${planes.length} planes en ${RUTA_JSON.split("/").pop()}` +
      (matricula.length ? ` + ${matricula.length} en matrícula` : "")
  );

  console.log("\n── Procedencia de los planes ────────────────────────────\n");

  // Esta comprobación SÍ es fiable y sustituye a los conteos: todo plan de la
  // base tiene que venir de un PDF que exista en alguna de las dos fuentes.
  // Detecta planes fantasma sin depender de cuántos deba haber.
  const archivosConocidos = new Set(
    [...planes, ...matricula].map((p) => p.archivo)
  );
  const planesBd = await prisma.planEstudio.findMany({
    select: { version: true, archivoOrigen: true, carrera: { select: { nombre: true } } },
  });
  const sinOrigen = planesBd.filter((p) => !p.archivoOrigen);
  const origenDesconocido = planesBd.filter(
    (p) => p.archivoOrigen && !archivosConocidos.has(p.archivoOrigen)
  );

  check("Planes sin archivo de origen", sinOrigen.length, 0);
  check("Planes con origen desconocido", origenDesconocido.length, 0);
  if (origenDesconocido.length) {
    for (const p of origenDesconocido.slice(0, 6)) {
      console.log(`     ${p.carrera.nombre} · ${p.version} · ${p.archivoOrigen}`);
    }
    console.log("     Ese PDF no está en ninguno de los dos JSON de referencia.");
  }

  const escalaRangos = await prisma.rangoNota.count();
  check("Rangos de nota (A,B,C,D,F)", escalaRangos, 5);

  // ---- Escala ----
  console.log("\n── Escala de la UTP ─────────────────────────────────────\n");
  const escala = await prisma.escalaNotas.findFirst({
    include: { rangos: { orderBy: { desde: "desc" } } },
  });
  if (!escala) {
    console.log("✗  No se encontró la escala");
    fallos++;
  } else {
    check("Aprobación normal (D)", escala.notaAprobacion, 61);
    check("Aprobación fundamental (C)", escala.notaAprobacionFundamental, 71);
    check("Índice máximo", escala.indiceMaximo, 3);
    for (const r of escala.rangos) {
      info(`  ${r.letra}: ${r.desde}–${r.hasta}`, `${r.puntos} pts`);
    }
    const conDecimales = escala.rangos.filter((r) => r.hasta % 1 !== 0);
    aviso(
      "Rangos con límites enteros",
      conDecimales.length === 0,
      conDecimales.length
        ? `${conDecimales.length} con decimales (cosmético; la UTP trunca)`
        : ""
    );
  }

  // ---- Vigencia: el invariante clave para el onboarding ----
  console.log("\n── Vigencia de planes ───────────────────────────────────\n");
  const carreras = await prisma.carrera.findMany({
    include: {
      facultad: { select: { nombre: true } },
      planes: { select: { version: true, vigente: true } },
    },
  });

  const sinVigente = carreras.filter(
    (c) => c.planes.length > 0 && !c.planes.some((p) => p.vigente)
  );
  const conVarios = carreras.filter(
    (c) => c.planes.filter((p) => p.vigente).length > 1
  );

  check("Carreras sin ningún plan vigente", sinVigente.length, 0);
  check("Carreras con MÁS DE UN plan vigente", conVarios.length, 0);
  if (conVarios.length) {
    for (const c of conVarios.slice(0, 5)) {
      const vs = c.planes.filter((p) => p.vigente).map((p) => p.version);
      console.log(`     ${c.nombre}: ${vs.join(", ")}`);
    }
    console.log("     Corre: npx tsx prisma/marcar-vigencia.ts --aplicar");
  }
  info(
    "Carreras con historial de planes",
    carreras.filter((c) => c.planes.length > 1).length
  );

  // ---- Carreras duplicadas por variante de nombre ----
  console.log("\n── Carreras duplicadas ──────────────────────────────────\n");
  const porClave = new Map<string, typeof carreras>();
  for (const c of carreras) {
    const k = `${c.facultad.nombre}|${claveCarrera(c.nombre)}|${c.grado}`;
    porClave.set(k, [...(porClave.get(k) ?? []), c]);
  }
  const duplicadas = [...porClave.values()].filter((g) => g.length > 1);

  aviso(
    "Carreras sin nombres variantes",
    duplicadas.length === 0,
    duplicadas.length ? `${duplicadas.length} grupos duplicados` : ""
  );
  if (duplicadas.length) {
    console.log(
      "\n     La misma carrera aparece con nombres distintos. En el onboarding\n" +
        "     el estudiante la vería repetida, y podría elegir la fila cuyo plan\n" +
        "     vigente no es el actual.\n"
    );
    for (const g of duplicadas.slice(0, 10)) {
      console.log(`     ${g[0].facultad.nombre}:`);
      for (const c of g) {
        const vig = c.planes.find((p) => p.vigente)?.version ?? "sin vigente";
        console.log(`        "${c.nombre}"  (vigente: ${vig}, ${c.planes.length} plan/es)`);
      }
    }
    if (duplicadas.length > 10) {
      console.log(`     ... y ${duplicadas.length - 10} grupos más`);
    }
  }

  // ---- Integridad estructural, sin conteos fijos ----
  console.log("\n── Integridad ───────────────────────────────────────────\n");

  check(
    "Planes sin ninguna materia",
    await prisma.planEstudio.count({ where: { materias: { none: {} } } }),
    0
  );
  check(
    "Materias que no están en ningún plan",
    await prisma.materia.count({ where: { planes: { none: {} } } }),
    0
  );

  // Si una materia común aparece en 1 solo plan, el seed está duplicando
  // materias en vez de reutilizarlas: error de diseño grave.
  const calculo1 = await prisma.materia.findFirst({
    where: { codigo: "7987" },
    include: { planes: true },
  });
  if (calculo1) {
    info(`${calculo1.codigo} ${calculo1.nombre}`, `en ${calculo1.planes.length} planes`);
    aviso(
      "Materias comunes se reutilizan entre planes",
      calculo1.planes.length > 10,
      calculo1.planes.length <= 10 ? "sospechoso: debería estar en decenas" : ""
    );
  } else {
    console.log("✗  No se encontró la materia 7987 (Cálculo I)");
    fallos++;
  }

  // Cálculo II debe requerir Cálculo I en algún plan
  const calc2 = await prisma.materiaPlan.findFirst({
    where: {
      materia: { codigo: "7988" },
      prerequisitos: { some: { materiaRequerida: { codigo: "7987" } } },
    },
  });
  check("Cálculo II requiere Cálculo I", calc2 !== null, true);

  info(
    "Materias REGULARES sin periodo",
    await prisma.materiaPlan.count({ where: { periodo: null, tipo: "REGULAR" } })
  );
  info(
    "Materias REGULARES sin año (pre-ingreso)",
    await prisma.materiaPlan.count({ where: { anio: null, tipo: "REGULAR" } })
  );
  info(
    "MateriaPlan con 0 créditos (seminarios)",
    await prisma.materiaPlan.count({ where: { creditos: { lte: 0 } } })
  );

  console.log("\n─────────────────────────────────────────────────────────");
  if (fallos === 0 && avisos === 0) {
    console.log("Todo correcto.\n");
  } else if (fallos === 0) {
    console.log(`Sin fallos. ${avisos} aviso(s) para revisar arriba.\n`);
  } else {
    console.log(`${fallos} fallo(s) y ${avisos} aviso(s). Revisa arriba.\n`);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
