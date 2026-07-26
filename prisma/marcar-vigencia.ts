/**
 * CalcuNota — marca la vigencia de los planes de estudio.
 *
 *   npx tsx prisma/marcar-vigencia.ts            (simula)
 *   npx tsx prisma/marcar-vigencia.ts --aplicar  (escribe)
 *
 * El seed crea todos los planes con vigente: true y nunca lo actualiza. Al
 * cargar versiones nuevas quedan dos planes vigentes de la misma carrera y el
 * onboarding no sabe cuál sugerir.
 *
 * Este script deja vigente SOLO el plan de versión más reciente de cada
 * carrera. Los anteriores quedan disponibles pero no vigentes: un estudiante
 * de cuarto año sigue bajo el plan con el que ingresó y debe poder elegirlo.
 *
 * Es idempotente.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

if (!process.env.DATABASE_URL) {
  console.error("\nDATABASE_URL no está definida. Revisa el .env de la raíz.\n");
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const APLICAR = process.argv.includes("--aplicar");

/**
 * Ordena versiones tipo "2024", "2024-2", "2026".
 * Devuelve un número comparable: año * 10 + sufijo.
 * Las versiones sin año reconocible quedan al final (valor 0).
 */
function pesoVersion(version: string): number {
  const m = version.match(/(\d{4})(?:-(\d))?/);
  if (!m) return 0;
  const anio = parseInt(m[1], 10);
  const sufijo = m[2] ? parseInt(m[2], 10) : 0;
  return anio * 10 + sufijo;
}

async function main() {
  console.log(
    APLICAR
      ? "\nAplicando vigencia...\n"
      : "\nSimulación. Nada se modifica. Usa --aplicar para escribir.\n"
  );

  const carreras = await prisma.carrera.findMany({
    include: {
      facultad: { select: { nombre: true } },
      planes: {
        select: { id: true, version: true, vigente: true, totalCreditos: true },
      },
    },
    orderBy: { nombre: "asc" },
  });

  const aMarcarVigente: string[] = [];
  const aMarcarNoVigente: string[] = [];
  let carrerasConVarios = 0;

  for (const carrera of carreras) {
    if (carrera.planes.length === 0) continue;

    const ordenados = [...carrera.planes].sort(
      (a, b) => pesoVersion(b.version) - pesoVersion(a.version)
    );
    const masReciente = ordenados[0];

    if (carrera.planes.length > 1) {
      carrerasConVarios++;
      console.log(`${carrera.nombre}`);
      for (const p of ordenados) {
        const marca = p.id === masReciente.id ? "VIGENTE" : "  histórico";
        const cambia =
          (p.id === masReciente.id && !p.vigente) ||
          (p.id !== masReciente.id && p.vigente)
            ? "  <- cambia"
            : "";
        console.log(
          `   ${marca}  ${p.version.padEnd(12)} ${p.totalCreditos} cr${cambia}`
        );
      }
    }

    for (const p of carrera.planes) {
      const debeSerVigente = p.id === masReciente.id;
      if (debeSerVigente && !p.vigente) aMarcarVigente.push(p.id);
      if (!debeSerVigente && p.vigente) aMarcarNoVigente.push(p.id);
    }
  }

  console.log(
    `\n${carreras.length} carreras · ${carrerasConVarios} con más de un plan`
  );
  console.log(
    `Cambios: ${aMarcarVigente.length} a vigente, ${aMarcarNoVigente.length} a histórico`
  );

  if (!APLICAR) {
    console.log("\nCorre con --aplicar para escribirlos.\n");
    return;
  }

  if (aMarcarVigente.length) {
    await prisma.planEstudio.updateMany({
      where: { id: { in: aMarcarVigente } },
      data: { vigente: true },
    });
  }
  if (aMarcarNoVigente.length) {
    await prisma.planEstudio.updateMany({
      where: { id: { in: aMarcarNoVigente } },
      data: { vigente: false },
    });
  }

  console.log("\nVigencia actualizada.\n");
}

main()
  .catch((e) => {
    console.error("\nFalló:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
