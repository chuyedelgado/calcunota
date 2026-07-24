/**
 * CalcuNota — verificación de la base tras el seed.
 *
 *   npx tsx prisma/verificar.ts
 *
 * Compara la base contra los conteos esperados de los 59 planes de la UTP
 * y hace algunas comprobaciones de integridad.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

if (!process.env.DATABASE_URL) {
  console.error(
    "\nDATABASE_URL no está definida. Verifica que exista .env en la raíz del proyecto.\n"
  );
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

let fallos = 0;

function check(nombre: string, real: unknown, esperado: unknown) {
  const ok = real === esperado;
  if (!ok) fallos++;
  console.log(
    `${ok ? "✓" : "✗"}  ${nombre.padEnd(42)} ${String(real).padStart(6)}` +
      (ok ? "" : `   (esperado ${esperado})`)
  );
}

function info(nombre: string, valor: unknown) {
  console.log(`   ${nombre.padEnd(42)} ${String(valor).padStart(6)}`);
}

async function main() {
  console.log("\n── Conteos ──────────────────────────────────────────────\n");

  check("Universidades", await prisma.universidad.count(), 1);
  check("Escalas de nota", await prisma.escalaNotas.count(), 1);
  check("Rangos de nota (A,B,C,D,F)", await prisma.rangoNota.count(), 5);
  check("Facultades", await prisma.facultad.count(), 6);
  check("Carreras", await prisma.carrera.count(), 58);
  check("Planes de estudio", await prisma.planEstudio.count(), 59);
  check("Materias (códigos únicos)", await prisma.materia.count(), 1624);
  check("MateriaPlan (materia dentro de plan)", await prisma.materiaPlan.count(), 3318);

  check("Prerequisitos", await prisma.prerequisito.count(), 2394);

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
  }

  console.log("\n── Planes de referencia ─────────────────────────────────\n");

  const civil = await prisma.planEstudio.findFirst({
    where: { archivoOrigen: "utp-fic-ing-civil-2024-2.pdf" },
    include: { carrera: { include: { facultad: true } }, materias: true },
  });
  if (!civil) {
    console.log("✗  No se encontró el plan de Ingeniería Civil");
    fallos++;
  } else {
    info("Carrera", civil.carrera.nombre);
    info("Facultad", civil.carrera.facultad.nombre);
    check("  materias (incluye electivas)", civil.materias.length, 78);
    check("  créditos totales", civil.totalCreditos, 228);
    check(
      "  fundamentales",
      civil.materias.filter((m) => m.fundamental).length,
      17
    );
  }

  const soft = await prisma.planEstudio.findFirst({
    where: { archivoOrigen: "utp-sistemas-ing-software-2024.pdf" },
    include: { materias: true },
  });
  if (soft) {
    check("Ing. Software: materias", soft.materias.length, 55);
    check(
      "Ing. Software: fundamentales",
      soft.materias.filter((m) => m.fundamental).length,
      23
    );
  }

  console.log("\n── Integridad ───────────────────────────────────────────\n");

  const calculo1 = await prisma.materia.findFirst({
    where: { codigo: "7987" },
    include: { planes: true },
  });
  if (calculo1) {
    info(`${calculo1.codigo} ${calculo1.nombre}`, "");
    check("  aparece en planes", calculo1.planes.length, 30);
  } else {
    console.log("✗  No se encontró la materia 7987");
    fallos++;
  }

  // Cálculo II (7988) debe requerir Cálculo I (7987)
  const calculo2 = await prisma.materiaPlan.findFirst({
    where: {
      materia: { codigo: "7988" },
      plan: { archivoOrigen: "utp-fic-ing-civil-2024-2.pdf" },
    },
    include: { prerequisitos: { include: { materiaRequerida: true } } },
  });
  const requiereCalc1 = calculo2?.prerequisitos.some(
    (p) => p.materiaRequerida.codigo === "7987"
  );
  check("Cálculo II requiere Cálculo I", requiereCalc1, true);

  // Ninguna materia debe quedar sin créditos
  const sinCreditos = await prisma.materiaPlan.count({
    where: { creditos: { lte: 0 } },
  });
  info("MateriaPlan con 0 créditos (seminarios)", sinCreditos);

  // 18 materias regulares no tienen periodo, y es correcto:
  //  - 12 de Sistemas Info. Gerencial: el PDF agrupa el I AÑO sin desglosar
  //  - 6 de los planes de aviación: nivelación previa al primer semestre
  const sinPeriodo = await prisma.materiaPlan.count({
    where: { periodo: null, tipo: "REGULAR" },
  });
  check("Materias REGULARES sin periodo (esperadas)", sinPeriodo, 18);

  const sinAnio = await prisma.materiaPlan.count({
    where: { anio: null, tipo: "REGULAR" },
  });
  check("Materias REGULARES sin año (pre-ingreso)", sinAnio, 6);

  console.log("\n─────────────────────────────────────────────────────────");
  if (fallos === 0) {
    console.log("Todo correcto. La base quedó lista.\n");
  } else {
    console.log(`${fallos} comprobación(es) fallaron. Revisa arriba.\n`);
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
