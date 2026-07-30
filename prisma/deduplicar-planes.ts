/**
 * CalcuNota — deduplica planes de estudio con contenido idéntico.
 *
 *   npx tsx prisma/deduplicar-planes.ts            (simula)
 *   npx tsx prisma/deduplicar-planes.ts --aplicar  (escribe)
 *
 * Algunas carreras quedaron con varios planes del mismo año y contenido
 * EXACTAMENTE igual. Vienen de PDFs distintos que la UTP publica por tendencia
 * (T1, T2, M-24) pero cuyo pénsum es el mismo. Al fusionar las carreras hubo que
 * desambiguar la versión para no violar la restricción única, lo que produjo
 * etiquetas como "2024-t12024" que no significan nada para un estudiante.
 *
 * Tres opciones idénticas en un desplegable no se pueden aclarar con mejores
 * etiquetas: son la misma cosa. Este script conserva una y borra las demás.
 *
 * Dos planes se consideran idénticos si tienen el mismo conjunto de
 * (código de materia, créditos). El orden no importa.
 *
 * SEGURIDAD: antes de borrar, reapunta cualquier PerfilEstudiante al plan que
 * se conserva. Ningún estudiante pierde su perfil ni sus cursos (Curso apunta a
 * Materia, no a PlanEstudio).
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
 * Huella del contenido de un plan: códigos de materia con sus créditos,
 * ordenados. Dos planes con la misma huella son el mismo pénsum.
 */
function huella(materias: { codigo: string; creditos: number }[]): string {
  return materias
    .map((m) => `${m.codigo}:${m.creditos}`)
    .sort()
    .join("|");
}

/**
 * Elige la versión que se conserva. Prefiere la más limpia: la que NO tiene
 * sufijo de desambiguación, porque es la legible para el estudiante.
 */
function puntuarVersion(version: string): number {
  let p = 0;
  // Sufijos de desambiguación tipo "2024-t12024": los peores
  if (/-[a-z]/i.test(version)) p -= 20;
  // Versión limpia tipo "2024" o "2024-2"
  if (/^\d{4}(-\d)?$/.test(version)) p += 10;
  // A igualdad, la más reciente
  const m = version.match(/(\d{4})/);
  if (m) p += parseInt(m[1], 10) / 1000;
  return p;
}

async function main() {
  console.log(
    APLICAR
      ? "\nAplicando deduplicación de planes...\n"
      : "\nSimulación. Nada se modifica. Usa --aplicar para escribir.\n"
  );

  const carreras = await prisma.carrera.findMany({
    include: {
      facultad: { select: { nombre: true } },
      planes: {
        include: {
          materias: {
            select: { creditos: true, materia: { select: { codigo: true } } },
          },
          perfiles: { select: { id: true } },
        },
      },
    },
    orderBy: { nombre: "asc" },
  });

  let planesBorrados = 0;
  let perfilesReapuntados = 0;
  let gruposEncontrados = 0;

  for (const carrera of carreras) {
    if (carrera.planes.length < 2) continue;

    // Agrupar por huella de contenido
    const porHuella = new Map<string, typeof carrera.planes>();
    for (const plan of carrera.planes) {
      const h = huella(
        plan.materias.map((mp) => ({
          codigo: mp.materia.codigo,
          creditos: mp.creditos,
        }))
      );
      porHuella.set(h, [...(porHuella.get(h) ?? []), plan]);
    }

    const duplicados = [...porHuella.values()].filter((g) => g.length > 1);
    if (duplicados.length === 0) continue;

    console.log(`${carrera.nombre}  (${carrera.facultad.nombre})`);

    for (const grupo of duplicados) {
      gruposEncontrados++;

      // Sobrevive la de versión más limpia. Si alguna tiene perfiles y otra no,
      // se prefiere igualmente la limpia y se reapuntan los perfiles: así el
      // estudiante queda en la versión que la interfaz muestra bien.
      const ordenado = [...grupo].sort(
        (a, b) =>
          puntuarVersion(b.version) - puntuarVersion(a.version) ||
          a.id.localeCompare(b.id)
      );
      const superviviente = ordenado[0];
      const aBorrar = ordenado.slice(1);

      const materias = superviviente.materias.length;
      const creditos = superviviente.materias.reduce(
        (a, mp) => a + mp.creditos,
        0
      );
      console.log(
        `   contenido idéntico: ${materias} materias, ${creditos} créditos`
      );
      console.log(`   conserva  "${superviviente.version}"`);
      for (const p of aBorrar) {
        const n = p.perfiles.length;
        console.log(
          `   borra     "${p.version}"${n ? `  (${n} perfil/es a reapuntar)` : ""}`
        );
      }

      if (!APLICAR) continue;

      // 1. Reapuntar perfiles al plan que sobrevive
      for (const p of aBorrar) {
        if (p.perfiles.length === 0) continue;
        const r = await prisma.perfilEstudiante.updateMany({
          where: { planId: p.id },
          data: { planId: superviviente.id },
        });
        perfilesReapuntados += r.count;
      }

      // 2. Borrar los planes redundantes. MateriaPlan y Prerequisito caen en
      //    cascada; los Curso no dependen de PlanEstudio, así que no se tocan.
      for (const p of aBorrar) {
        const quedan = await prisma.perfilEstudiante.count({
          where: { planId: p.id },
        });
        if (quedan > 0) {
          console.log(
            `   ⚠ "${p.version}" aún tiene ${quedan} perfil/es. No se borra.`
          );
          continue;
        }
        await prisma.planEstudio.delete({ where: { id: p.id } });
        planesBorrados++;
      }

      // 3. Asegurar que el superviviente quede vigente si el grupo lo era
      const alguienVigente = grupo.some((p) => p.vigente);
      if (alguienVigente && !superviviente.vigente) {
        await prisma.planEstudio.update({
          where: { id: superviviente.id },
          data: { vigente: true },
        });
      }
    }
    console.log();
  }

  if (gruposEncontrados === 0) {
    console.log("No hay planes con contenido idéntico. Nada que hacer.\n");
    return;
  }

  if (!APLICAR) {
    console.log(
      `${gruposEncontrados} grupo(s) de planes idénticos. Corre con --aplicar.\n`
    );
    return;
  }

  console.log(
    `${planesBorrados} planes borrados · ${perfilesReapuntados} perfiles reapuntados`
  );
  console.log(
    "\nSiguiente paso recomendado:\n  npx tsx prisma/verificar.ts\n" +
      "Los conteos de PlanEstudio y MateriaPlan van a BAJAR: es lo esperado.\n"
  );
}

main()
  .catch((e) => {
    console.error("\nFalló la deduplicación:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
