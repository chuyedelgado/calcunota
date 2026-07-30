/**
 * CalcuNota — seed de la base de datos.
 *
 *   npx prisma db seed
 *
 * Usa createMany en lotes en vez de upserts fila por fila. La versión
 * anterior hacía ~9,000 viajes de ida y vuelta a la base y Neon cortaba
 * la conexión a medio camino; esta hace unos 150.
 *
 * Es idempotente: skipDuplicates permite volver a correrlo sin borrar nada.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient, Grado, TipoMateria, PeriodoPlan } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// keepAlive y timeouts amplios: el seed mueve miles de filas y Neon
// cierra conexiones ociosas con facilidad.
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  keepAlive: true,
  connectionTimeoutMillis: 30_000,
  idleTimeoutMillis: 60_000,
  statement_timeout: 120_000,
});

const prisma = new PrismaClient({ adapter });

const RUTA_JSON = resolve(process.cwd(), "scraping_materias/planes.json");
const LOTE = 500;

// ------------------------------------------------------------
// Tipos del JSON del scraper
// ------------------------------------------------------------

type Requisitos = { codigos: string[]; texto: string | null };

type FilaJson = {
  codigo: string;
  nombre: string;
  creditos: number;
  requisitos: Requisitos;
  orden?: number;
  anio?: number | null;
  periodo?: string | null;
  fundamental?: boolean;
  tipo?: string;
  area?: string | null;
  horasClase?: number;
  horasLaboratorio?: number;
  laboratorioPagado?: boolean;
};

type PlanJson = {
  archivo: string;
  facultad: string | null;
  carrera: string | null;
  materias: FilaJson[];
  electivas: FilaJson[];
  totalCreditos: number;
};

// ------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------

function titulo(texto: string): string {
  return texto
    .toLocaleLowerCase("es")
    .split(" ")
    .map((p) => (p.length <= 2 ? p : p.charAt(0).toLocaleUpperCase("es") + p.slice(1)))
    .join(" ")
    .trim();
}

function slug(archivo: string): string {
  return archivo
    .replace(/\.pdf$/i, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .toLowerCase()
    .replace(/^utp-/, "");
}

/**
 * Versión del plan desde el nombre del archivo.
 *
 *   utp-fic-ing-civil-2024-2.pdf  -> "2024-2"
 *   utp-fic-ing-civil-2024.pdf    -> "2024"
 *   utp-fic-ing-civil-m2024.pdf   -> "M-2024"
 *
 * La distinción de la M es obligatoria: la UTP publica dos planes del mismo año
 * para cohortes distintas. El "2024" de Ingeniería de Software rige desde el
 * verano 2024 e incluye el Seminario de Inducción; el "M-2024" rige desde el
 * primer semestre 2024 y no lo incluye. Sin la M, ambos colapsan en la misma
 * versión y chocan con la restricción única de PlanEstudio.
 */
function versionBase(archivo: string): string {
  const base = archivo.replace(/\.pdf$/i, "");
  const m = base.match(/(m)?(\d{4})(?:[-_](\d))?$/i);
  if (!m) return slug(archivo);
  const prefijo = m[1] ? "M-" : "";
  return m[3] ? `${prefijo}${m[2]}-${m[3]}` : `${prefijo}${m[2]}`;
}

function gradoDesde(nombre: string): Grado {
  const n = nombre.toUpperCase();
  if (n.includes("TÉCNICO") || n.includes("TECNICO")) return Grado.TECNICO;
  if (n.includes("MAESTRÍA") || n.includes("MAESTRIA")) return Grado.MAESTRIA;
  if (n.includes("DOCTORADO")) return Grado.DOCTORADO;
  if (n.includes("LICENCIATURA")) return Grado.LICENCIATURA;
  if (n.includes("INGENIER")) return Grado.INGENIERIA;
  return Grado.LICENCIATURA;
}

function tipoDe(t: string | undefined): TipoMateria {
  if (t === "EE") return TipoMateria.ELECTIVA;
  if (t === "OP") return TipoMateria.OPTATIVA;
  return TipoMateria.REGULAR;
}

function periodoDe(p: string | null | undefined): PeriodoPlan | null {
  if (p === "PRIMER_SEMESTRE") return PeriodoPlan.PRIMER_SEMESTRE;
  if (p === "SEGUNDO_SEMESTRE") return PeriodoPlan.SEGUNDO_SEMESTRE;
  if (p === "VERANO") return PeriodoPlan.VERANO;
  return null;
}

/** Inserta en lotes para no reventar el límite de parámetros de Postgres. */
async function enLotes<T>(
  etiqueta: string,
  filas: T[],
  insertar: (lote: T[]) => Promise<{ count: number }>
): Promise<number> {
  let total = 0;
  for (let i = 0; i < filas.length; i += LOTE) {
    const lote = filas.slice(i, i + LOTE);
    const r = await insertar(lote);
    total += r.count;
    process.stdout.write(
      `\r  ${etiqueta}: ${Math.min(i + LOTE, filas.length)}/${filas.length}`
    );
  }
  process.stdout.write(`\r  ${etiqueta}: ${filas.length}/${filas.length} (${total} nuevas)\n`);
  return total;
}

const RANGOS_UTP = [
  { letra: "A", desde: 91, hasta: 100, puntos: 3, aprueba: true },
  { letra: "B", desde: 81, hasta: 90.99, puntos: 2, aprueba: true },
  { letra: "C", desde: 71, hasta: 80.99, puntos: 1, aprueba: true },
  { letra: "D", desde: 61, hasta: 70.99, puntos: 0, aprueba: true },
  { letra: "F", desde: 0, hasta: 60.99, puntos: 0, aprueba: false },
];

// ------------------------------------------------------------
// Seed
// ------------------------------------------------------------

async function main() {
  const t0 = Date.now();
  console.log("\n1. Escala de calificación de la UTP");

  const escala = await prisma.escalaNotas.upsert({
    where: { id: "escala-utp" },
    update: { notaAprobacion: 61, notaAprobacionFundamental: 71, indiceMaximo: 3 },
    create: {
      id: "escala-utp",
      nombre: "UTP 0-100",
      notaMinima: 0,
      notaMaxima: 100,
      notaAprobacion: 61,
      notaAprobacionFundamental: 71,
      indiceMaximo: 3,
    },
  });

  await prisma.rangoNota.createMany({
    data: RANGOS_UTP.map((r) => ({ ...r, escalaId: escala.id })),
    skipDuplicates: true,
  });

  const utp = await prisma.universidad.upsert({
    where: { siglas: "UTP" },
    update: { escalaId: escala.id },
    create: {
      siglas: "UTP",
      nombre: "Universidad Tecnológica de Panamá",
      pais: "PA",
      sitioWeb: "https://utp.ac.pa",
      escalaId: escala.id,
    },
  });

  console.log("2. Leyendo planes de estudio");
  const planes: PlanJson[] = JSON.parse(readFileSync(RUTA_JSON, "utf-8"));
  const validos = planes.filter((p) => p.facultad && p.carrera);
  if (validos.length < planes.length) {
    console.log(`  ${planes.length - validos.length} plan(es) sin facultad o carrera, omitidos`);
  }

  // ---- Facultades ----
  console.log("3. Facultades");
  const nombresFacultad = [...new Set(validos.map((p) => titulo(p.facultad!)))];
  await prisma.facultad.createMany({
    data: nombresFacultad.map((nombre) => ({ nombre, universidadId: utp.id })),
    skipDuplicates: true,
  });
  const facultades = new Map(
    (await prisma.facultad.findMany({ where: { universidadId: utp.id } })).map((f) => [
      f.nombre,
      f.id,
    ])
  );
  console.log(`  ${facultades.size} facultades`);

  // ---- Carreras ----
  console.log("4. Carreras");
  const carrerasUnicas = new Map<string, { nombre: string; grado: Grado; facultadId: string }>();
  for (const p of validos) {
    const facultadId = facultades.get(titulo(p.facultad!))!;
    const nombre = titulo(p.carrera!);
    const grado = gradoDesde(p.carrera!);
    carrerasUnicas.set(`${facultadId}|${nombre}|${grado}`, { nombre, grado, facultadId });
  }
  await prisma.carrera.createMany({
    data: [...carrerasUnicas.values()],
    skipDuplicates: true,
  });
  const carreras = new Map(
    (
      await prisma.carrera.findMany({
        where: { facultad: { universidadId: utp.id } },
      })
    ).map((c) => [`${c.facultadId}|${c.nombre}|${c.grado}`, c.id])
  );
  console.log(`  ${carreras.size} carreras`);

  // ---- Planes ----
  console.log("5. Planes de estudio");
  const clavesUsadas = new Set<string>();
  const planesData: {
    archivo: string;
    carreraId: string;
    version: string;
    totalCreditos: number;
  }[] = [];

  for (const p of validos) {
    const facultadId = facultades.get(titulo(p.facultad!))!;
    const carreraId = carreras.get(`${facultadId}|${titulo(p.carrera!)}|${gradoDesde(p.carrera!)}`)!;
    let version = versionBase(p.archivo);
    // Dos PDFs distintos pueden dar la misma carrera + año (ej. tendencias
    // de una misma licenciatura). Se desambigua con el nombre del archivo.
    if (clavesUsadas.has(`${carreraId}|${version}`)) {
      version = `${version}-${slug(p.archivo).slice(0, 40)}`;
      console.log(`  versión duplicada resuelta: ${p.archivo} -> ${version}`);
    }
    clavesUsadas.add(`${carreraId}|${version}`);
    planesData.push({
      archivo: p.archivo,
      carreraId,
      version,
      totalCreditos: p.totalCreditos,
    });
  }

  await prisma.planEstudio.createMany({
    data: planesData.map(({ carreraId, version, totalCreditos, archivo }) => ({
      carreraId,
      version,
      totalCreditos,
      archivoOrigen: archivo,
    })),
    skipDuplicates: true,
  });
  const planesDb = new Map(
    (await prisma.planEstudio.findMany()).map((p) => [p.archivoOrigen!, p.id])
  );
  console.log(`  ${planesDb.size} planes`);

  // ---- Materias ----
  console.log("6. Materias");
  const materiasUnicas = new Map<string, string>();
  for (const p of validos) {
    for (const f of [...p.materias, ...p.electivas]) {
      if (!materiasUnicas.has(f.codigo)) materiasUnicas.set(f.codigo, titulo(f.nombre));
    }
  }
  await enLotes(
    "materias",
    [...materiasUnicas].map(([codigo, nombre]) => ({
      codigo,
      nombre,
      universidadId: utp.id,
    })),
    (lote) => prisma.materia.createMany({ data: lote, skipDuplicates: true })
  );
  const materias = new Map(
    (await prisma.materia.findMany({ where: { universidadId: utp.id } })).map((m) => [
      m.codigo,
      m.id,
    ])
  );

  // ---- MateriaPlan ----
  console.log("7. Materias dentro de cada plan");
  const materiaPlanData: any[] = [];
  const requisitosPendientes: { archivo: string; codigo: string; requiere: string[] }[] = [];

  for (const p of validos) {
    const planId = planesDb.get(p.archivo)!;
    const vistos = new Set<string>();

    for (const f of [...p.materias, ...p.electivas]) {
      // Un mismo código puede aparecer varias veces en un plan (huecos de
      // electiva repetidos, o una materia listada también en el catálogo).
      // La primera aparición gana porque trae año y periodo.
      if (vistos.has(f.codigo)) continue;
      vistos.add(f.codigo);

      materiaPlanData.push({
        planId,
        materiaId: materias.get(f.codigo)!,
        orden: f.orden ?? null,
        anio: f.anio ?? null,
        periodo: periodoDe(f.periodo),
        creditos: f.creditos,
        fundamental: f.fundamental ?? false,
        tipo: tipoDe(f.tipo),
        area: f.area ?? null,
        horasClase: f.horasClase ?? 0,
        horasLaboratorio: f.horasLaboratorio ?? 0,
        laboratorioPagado: f.laboratorioPagado ?? false,
        requisitoTexto: f.requisitos.texto,
      });

      const requiere = f.requisitos.codigos.filter(
        (c) => c !== f.codigo && materias.has(c)
      );
      if (requiere.length) {
        requisitosPendientes.push({ archivo: p.archivo, codigo: f.codigo, requiere });
      }
    }
  }

  await enLotes("materiaPlan", materiaPlanData, (lote) =>
    prisma.materiaPlan.createMany({ data: lote, skipDuplicates: true })
  );

  // ---- Prerequisitos ----
  console.log("8. Prerequisitos");
  const mpDb = new Map(
    (await prisma.materiaPlan.findMany({ select: { id: true, planId: true, materiaId: true } })).map(
      (mp) => [`${mp.planId}|${mp.materiaId}`, mp.id]
    )
  );

  const prereqData: { materiaPlanId: string; materiaRequeridaId: string }[] = [];
  for (const r of requisitosPendientes) {
    const planId = planesDb.get(r.archivo)!;
    const materiaPlanId = mpDb.get(`${planId}|${materias.get(r.codigo)}`);
    if (!materiaPlanId) continue;
    for (const cod of new Set(r.requiere)) {
      prereqData.push({ materiaPlanId, materiaRequeridaId: materias.get(cod)! });
    }
  }

  await enLotes("prerequisitos", prereqData, (lote) =>
    prisma.prerequisito.createMany({ data: lote, skipDuplicates: true })
  );

  const seg = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nListo en ${seg}s\n`);
}

main()
  .catch((e) => {
    console.error("\nEl seed falló:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
