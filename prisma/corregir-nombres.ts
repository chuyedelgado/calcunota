/**
 * CalcuNota — corrige la capitalización de nombres ya guardados.
 *
 *   npx tsx prisma/corregir-nombres.ts          (muestra qué cambiaría)
 *   npx tsx prisma/corregir-nombres.ts --aplicar (lo aplica)
 *
 * El seed original usaba una regla de capitalización que rompía los numerales
 * romanos ("Cálculo i" en vez de "Cálculo I") y las siglas ("(fit)"). Afectó a
 * unos 292 de los 1,624 nombres de materia.
 *
 * Este script es idempotente: correrlo dos veces no cambia nada la segunda vez.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { tituloMateria, nombreProfesor } from "../lib/texto";

if (!process.env.DATABASE_URL) {
  console.error("\nDATABASE_URL no está definida. Revisa el .env de la raíz.\n");
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const APLICAR = process.argv.includes("--aplicar");

async function main() {
  console.log(
    APLICAR
      ? "\nAplicando correcciones...\n"
      : "\nSimulación. Nada se modifica. Usa --aplicar para escribir.\n"
  );

  let totalCambios = 0;

  // ---- Materias ----
  const materias = await prisma.materia.findMany({
    select: { id: true, codigo: true, nombre: true },
  });
  const cambiosMateria = materias
    .map((m) => ({ ...m, nuevo: tituloMateria(m.nombre) }))
    .filter((m) => m.nuevo !== m.nombre);

  console.log(`Materias: ${cambiosMateria.length} de ${materias.length} a corregir`);
  for (const m of cambiosMateria.slice(0, 12)) {
    console.log(`   ${m.codigo}  ${m.nombre}`);
    console.log(`         -> ${m.nuevo}`);
  }
  if (cambiosMateria.length > 12) {
    console.log(`   ... y ${cambiosMateria.length - 12} más`);
  }
  totalCambios += cambiosMateria.length;

  // ---- Facultades ----
  const facultades = await prisma.facultad.findMany({
    select: { id: true, nombre: true },
  });
  const cambiosFacultad = facultades
    .map((f) => ({ ...f, nuevo: tituloMateria(f.nombre) }))
    .filter((f) => f.nuevo !== f.nombre);

  console.log(`\nFacultades: ${cambiosFacultad.length} de ${facultades.length}`);
  for (const f of cambiosFacultad) {
    console.log(`   ${f.nombre}  ->  ${f.nuevo}`);
  }
  totalCambios += cambiosFacultad.length;

  // ---- Carreras ----
  const carreras = await prisma.carrera.findMany({
    select: { id: true, nombre: true },
  });
  const cambiosCarrera = carreras
    .map((c) => ({ ...c, nuevo: tituloMateria(c.nombre) }))
    .filter((c) => c.nuevo !== c.nombre);

  console.log(`\nCarreras: ${cambiosCarrera.length} de ${carreras.length}`);
  for (const c of cambiosCarrera.slice(0, 8)) {
    console.log(`   ${c.nombre}  ->  ${c.nuevo}`);
  }
  if (cambiosCarrera.length > 8) {
    console.log(`   ... y ${cambiosCarrera.length - 8} más`);
  }
  totalCambios += cambiosCarrera.length;

  // ---- Profesores ----
  const profesores = await prisma.profesor.findMany({
    select: { id: true, nombre: true },
  });
  const cambiosProfesor = profesores
    .map((p) => ({ ...p, nuevo: nombreProfesor(p.nombre) }))
    .filter((p) => p.nuevo !== p.nombre);

  console.log(`\nProfesores: ${cambiosProfesor.length} de ${profesores.length}`);
  totalCambios += cambiosProfesor.length;

  if (!APLICAR) {
    console.log(
      `\n${totalCambios} registros cambiarían. Corre con --aplicar para escribirlos.\n`
    );
    return;
  }

  // ---- Escritura ----
  //
  // NO se usa prisma.$transaction: con cientos de updates y la latencia hacia
  // Neon se supera su timeout de 5s y todo hace rollback. Estas actualizaciones
  // son independientes entre sí e idempotentes, así que no necesitan
  // atomicidad: si el proceso se corta, basta con volver a correr el script.
  //
  // Se lanzan en tandas con concurrencia limitada para aprovechar el viaje de
  // ida y vuelta sin abrir demasiadas conexiones a la vez.
  const CONCURRENCIA = 15;

  async function aplicar<T extends { id: string; nuevo: string }>(
    etiqueta: string,
    filas: T[],
    actualizar: (id: string, nombre: string) => Promise<unknown>
  ) {
    if (filas.length === 0) return;
    let hechos = 0;
    const fallidos: { id: string; error: string }[] = [];

    for (let i = 0; i < filas.length; i += CONCURRENCIA) {
      const tanda = filas.slice(i, i + CONCURRENCIA);
      const resultados = await Promise.allSettled(
        tanda.map((f) => actualizar(f.id, f.nuevo))
      );
      resultados.forEach((r, j) => {
        if (r.status === "fulfilled") hechos++;
        else
          fallidos.push({
            id: tanda[j].id,
            error: r.reason instanceof Error ? r.reason.message : String(r.reason),
          });
      });
      process.stdout.write(`\r  ${etiqueta}: ${hechos}/${filas.length}`);
    }

    process.stdout.write(`\r  ${etiqueta}: ${hechos}/${filas.length}\n`);

    if (fallidos.length) {
      console.log(`     ${fallidos.length} fallaron:`);
      for (const f of fallidos.slice(0, 3)) {
        console.log(`       ${f.id}: ${f.error.split("\n")[0]}`);
      }
      console.log("     Vuelve a correr el script para reintentarlos.");
    }
  }

  await aplicar("materias", cambiosMateria, (id, nombre) =>
    prisma.materia.update({ where: { id }, data: { nombre } })
  );
  await aplicar("facultades", cambiosFacultad, (id, nombre) =>
    prisma.facultad.update({ where: { id }, data: { nombre } })
  );
  await aplicar("carreras", cambiosCarrera, (id, nombre) =>
    prisma.carrera.update({ where: { id }, data: { nombre } })
  );
  await aplicar("profesores", cambiosProfesor, (id, nombre) =>
    prisma.profesor.update({ where: { id }, data: { nombre } })
  );

  console.log(`\n${totalCambios} registros corregidos.\n`);
}

main()
  .catch((e) => {
    console.error("\nFalló la corrección:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
