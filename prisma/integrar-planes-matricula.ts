/**
 * CalcuNota — integra los planes del PORTAL DE MATRÍCULA reemplazando, por
 * carrera, los planes provenientes de facultad.
 *
 *   npx tsx prisma/integrar-planes-matricula.ts            (simula)
 *   npx tsx prisma/integrar-planes-matricula.ts --aplicar  (escribe)
 *
 * Los planes de matrícula son oficiales, verificados como activos y con los
 * códigos siempre presentes; se prefieren sobre los de facultad.
 *
 * DISEÑO: adjuntar directamente a la carrera existente. El script ya sabe a qué
 * carrera pertenece cada lote (por claveCarrera o por el alias), así que carga
 * los planes de matrícula EN ESA carrera; no crea una fila intermedia ni delega
 * la unión a fusionar-carreras.ts. Solo Electrónica ("@NUEVA" en el alias) crea
 * una carrera nueva, porque no existe equivalente.
 *
 *   claveCarrera empata      -> adjunta a la carrera existente
 *   alias resuelve a X       -> adjunta a la carrera con clave X
 *   alias "@NUEVA"           -> crea carrera nueva (facultad por prefijo del PDF)
 *
 * REEMPLAZO: se borran TODOS los planes de la carrera reemplazada, sin importar
 * su origen (incluido un plan que ya viniera del portal: recargarlo produce
 * datos idénticos). Regla uniforme, sin excepciones por procedencia.
 *
 * VARIANTES: varias filas pueden ser la misma carrera (Mecánica y sus tendencias).
 * El alias las pliega en la canónica; sus planes se borran y su fila, ya vacía y
 * sin perfiles, se borra también. Se reporta.
 *
 * PERFILES: PerfilEstudiante.planId es obligatorio y con clave foránea. Para
 * mover un perfil a la misma versión sin chocar con el plan viejo (mismo
 * carreraId+version), los planes de matrícula se crean primero con una versión
 * temporal, se reapuntan los perfiles, se borran los planes viejos y recién
 * entonces se renombran a su versión final. Si no existe la misma versión, el
 * perfil va al plan más nuevo y se avisa. Los Curso no se tocan (apuntan a
 * Materia).
 *
 * ELECTIVAS: el portal no publica sus créditos (creditosDesconocidos, 0). Se
 * cruzan con un índice de créditos por código de los planes de FACULTAD. Lo que
 * no se resuelve queda en 0 y se reporta; no se inventa.
 *
 * Idempotente (una carrera ya integrada se omite) y sin transacciones grandes:
 * createMany/deleteMany en lotes y updates con concurrencia limitada.
 *
 * Después de aplicarlo, seguir con:
 *   npx tsx prisma/fusionar-carreras.ts --aplicar   (poco o nada que hacer aquí)
 *   npx tsx prisma/marcar-vigencia.ts --aplicar
 *   npx tsx prisma/corregir-nombres.ts --aplicar
 *   npx tsx prisma/verificar.ts
 */

import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient, TipoMateria, PeriodoPlan, Grado, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

if (!process.env.DATABASE_URL) {
  console.error("\nDATABASE_URL no está definida. Revisa el .env de la raíz.\n");
  process.exit(1);
}

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  keepAlive: true,
  connectionTimeoutMillis: 30_000,
  idleTimeoutMillis: 60_000,
  statement_timeout: 120_000,
});
const prisma = new PrismaClient({ adapter });

const APLICAR = process.argv.includes("--aplicar");
const RUTA_JSON = resolve(process.cwd(), "scraping_materias/planes_matricula.json");
const RUTA_ALIAS = resolve(process.cwd(), "prisma/alias-carreras.json");
const LOTE = 500;
const CONCURRENCIA = 5;
// Prefijo de versión temporal: las versiones reales nunca contienen "@".
const TMP = "@tmp@";

// Facultad por prefijo del archivo del portal ("utp-FIE-ing-...": FIE = Eléctrica).
// Respaldo para carreras NUEVAS cuya facultad no quedó emparejada por otra
// carrera del mismo prefijo.
const FACULTAD_POR_PREFIJO: Record<string, string> = {
  fic: "Ingeniería Civil",
  fie: "Ingeniería Eléctrica",
  fii: "Ingeniería Industrial",
  fim: "Ingeniería Mecánica",
  fisc: "Ingeniería de Sistemas Computacionales",
};

// ------------------------------------------------------------
// Tipos del JSON del scraper
// ------------------------------------------------------------

type Requisitos = { codigos: string[]; texto: string | null };

type FilaJson = {
  codigo: string;
  nombre: string;
  creditos: number;
  creditosDesconocidos?: boolean;
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
  carrera: string | null;
  materias: FilaJson[];
  electivas: FilaJson[];
  totalCreditos: number;
};

// ------------------------------------------------------------
// Helpers puros (replicados de seed.ts, idénticos)
// ------------------------------------------------------------

function slug(archivo: string): string {
  return archivo
    .replace(/\.pdf$/i, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .toLowerCase()
    .replace(/^utp-/, "");
}

function titulo(texto: string): string {
  return texto
    .toLocaleLowerCase("es")
    .split(" ")
    .map((p) => (p.length <= 2 ? p : p.charAt(0).toLocaleUpperCase("es") + p.slice(1)))
    .join(" ")
    .trim();
}

/** utp-...-m2024.pdf -> "M-2024" ; utp-...-2024.pdf -> "2024". Igual que el seed. */
function versionBase(archivo: string): string {
  const base = archivo.replace(/\.pdf$/i, "");
  const m = base.match(/(m)?(\d{4})(?:[-_](\d))?$/i);
  if (!m) return slug(archivo);
  const prefijo = m[1] ? "M-" : "";
  return m[3] ? `${prefijo}${m[2]}-${m[3]}` : `${prefijo}${m[2]}`;
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

/** Grado desde el nombre. Igual que el seed. Solo para las carreras NUEVAS. */
function gradoDesde(nombre: string): Grado {
  const n = nombre.toUpperCase();
  if (n.includes("TÉCNICO") || n.includes("TECNICO")) return Grado.TECNICO;
  if (n.includes("MAESTRÍA") || n.includes("MAESTRIA")) return Grado.MAESTRIA;
  if (n.includes("DOCTORADO")) return Grado.DOCTORADO;
  if (n.includes("LICENCIATURA")) return Grado.LICENCIATURA;
  if (n.includes("INGENIER")) return Grado.INGENIERIA;
  return Grado.LICENCIATURA;
}

// ------------------------------------------------------------
// claveCarrera: MISMA lógica que prisma/fusionar-carreras.ts (que ya quita
// EN/DEL/LA), para que lo que empareje aquí sea coherente con esa herramienta.
// ------------------------------------------------------------

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

function claveCarrera(nombre: string): string {
  return limpiarNombre(nombre)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\bLICENCIATURA\b|\bLIC\b|\bINGENIERIA\b|\bING\b|\bTECNICO\b|\bTEC\b/g, " ")
    .replace(/\bEN\b|\bDEL\b|\bLA\b/g, " ")
    .replace(/[^A-Z ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

/** Año numérico de una versión ("M-2025" -> 2025) para elegir "el más nuevo". */
function anioDeVersion(v: string): number {
  return Number(v.match(/(19|20)\d\d/)?.[0] ?? 0);
}

/** Prefijo de facultad del archivo del portal: "utp-fie-ing-...".pdf -> "fie". */
function prefijoFacultad(archivo: string): string {
  return archivo.split("-")[1] ?? "";
}

/**
 * Overrides de emparejamiento, prisma/alias-carreras.json. Clave = clave
 * normalizada; valor = clave canónica destino, o "@NUEVA". Claves con "_" son
 * documentación y se ignoran. El archivo es opcional.
 */
function cargarAlias(): Record<string, string> {
  if (!existsSync(RUTA_ALIAS)) return {};
  const raw = JSON.parse(readFileSync(RUTA_ALIAS, "utf-8")) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k.startsWith("_") || typeof v !== "string") continue;
    out[k.toUpperCase().trim()] = v.toUpperCase().trim();
  }
  return out;
}

// ------------------------------------------------------------
// Concurrencia limitada (sin transacciones grandes)
// ------------------------------------------------------------

async function mapLimite<T>(items: T[], limite: number, fn: (t: T) => Promise<void>): Promise<void> {
  let i = 0;
  async function worker() {
    while (i < items.length) await fn(items[i++]);
  }
  await Promise.all(Array.from({ length: Math.min(limite, Math.max(1, items.length)) }, worker));
}

async function enLotes<T>(
  etiqueta: string,
  filas: T[],
  insertar: (lote: T[]) => Promise<{ count: number }>,
): Promise<number> {
  let total = 0;
  for (let i = 0; i < filas.length; i += LOTE) total += (await insertar(filas.slice(i, i + LOTE))).count;
  if (filas.length) console.log(`     ${etiqueta}: ${total}/${filas.length} nuevas`);
  return total;
}

// ------------------------------------------------------------
// Tipos de trabajo
// ------------------------------------------------------------

type PlanDb = { id: string; version: string; vigente: boolean; archivoOrigen: string | null };
type CarreraDb = {
  id: string;
  nombre: string;
  grado: string;
  facultadId: string;
  facultad: { nombre: string };
  planes: PlanDb[];
};

type Reemplazo = {
  nombreMatricula: string;
  modo: "reemplazo" | "nueva";
  target: CarreraDb | null; // carrera existente a la que se adjunta; null si nueva
  matched: CarreraDb[]; // todas las carreras que se pliegan (incl. target); [] si nueva
  facultadId: string;
  facultadNombre: string;
  grado: string;
  planes: PlanJson[];
};

async function main() {
  console.log(
    APLICAR
      ? "\n== Integrando planes de matrícula (APLICAR) ==\n"
      : "\n== Integrando planes de matrícula (SIMULACIÓN, nada se escribe) ==\n",
  );

  // --- 1. JSON de matrícula, agrupado por carrera ---
  const planesJson: PlanJson[] = JSON.parse(readFileSync(RUTA_JSON, "utf-8"));
  const matriculaArchivos = new Set(planesJson.map((p) => p.archivo));
  const porCarrera = new Map<string, PlanJson[]>();
  for (const p of planesJson) {
    if (!p.carrera) continue;
    porCarrera.set(p.carrera, [...(porCarrera.get(p.carrera) ?? []), p]);
  }

  // --- 2. Carreras de la base con sus planes ---
  const dbCarreras = (await prisma.carrera.findMany({
    include: {
      facultad: { select: { nombre: true } },
      planes: { select: { id: true, version: true, vigente: true, archivoOrigen: true } },
    },
  })) as unknown as CarreraDb[];

  const facultadesDb = await prisma.facultad.findMany({
    where: { universidad: { siglas: "UTP" } },
    select: { id: true, nombre: true },
  });
  const alias = cargarAlias();

  // clave canónica: si el alias la redirige, esa; si no, ella misma.
  const canon = (clave: string) => alias[clave] ?? clave;

  // --- 3. Emparejar cada carrera de matrícula con su carrera existente ---
  const reemplazos: Reemplazo[] = [];
  const omitidas: { nombre: string; clave: string; motivo: string; cercanas: string[] }[] = [];
  const nuevas: { nombreMatricula: string; clave: string; planes: PlanJson[] }[] = [];

  for (const [nombreMatricula, planes] of porCarrera) {
    const claveMat = claveCarrera(nombreMatricula);
    const destino = alias[claveMat];
    if (destino === "@NUEVA") {
      nuevas.push({ nombreMatricula, clave: claveMat, planes });
      continue;
    }
    const canonMat = destino ?? claveMat;
    // Todas las carreras existentes que pertenecen a esta clave canónica.
    const matched = dbCarreras.filter((c) => canon(claveCarrera(c.nombre)) === canonMat);
    if (matched.length === 0) {
      omitidas.push({
        nombre: nombreMatricula,
        clave: claveMat,
        motivo: destino ? `alias -> "${destino}" no coincide con ninguna carrera` : "ninguna carrera coincide (sin alias)",
        cercanas: dbCarreras
          .filter((c) => claveCarrera(c.nombre).split(" ").some((w) => canonMat.split(" ").includes(w)))
          .map((c) => c.nombre)
          .slice(0, 6),
      });
      continue;
    }
    // target: la fila con clave EXACTA canónica; si no, la de más planes.
    const target =
      matched.find((c) => claveCarrera(c.nombre) === canonMat) ??
      [...matched].sort((a, b) => b.planes.length - a.planes.length)[0];
    reemplazos.push({
      nombreMatricula,
      modo: "reemplazo",
      target,
      matched,
      facultadId: target.facultadId,
      facultadNombre: target.facultad.nombre,
      grado: target.grado,
      planes,
    });
  }

  // Segunda pasada: facultad de las carreras nuevas (por un hermano ya
  // emparejado del mismo prefijo, o por FACULTAD_POR_PREFIJO).
  const facPorPrefijo = new Map<string, { id: string; nombre: string }>();
  for (const r of reemplazos) {
    const pref = prefijoFacultad(r.planes[0].archivo);
    if (pref && !facPorPrefijo.has(pref)) facPorPrefijo.set(pref, { id: r.facultadId, nombre: r.facultadNombre });
  }
  for (const n of nuevas) {
    const pref = prefijoFacultad(n.planes[0].archivo);
    let fac = facPorPrefijo.get(pref);
    if (!fac) {
      const nombreFac = FACULTAD_POR_PREFIJO[pref];
      const encontrada = nombreFac ? facultadesDb.find((f) => f.nombre === nombreFac) : undefined;
      if (encontrada) fac = { id: encontrada.id, nombre: encontrada.nombre };
    }
    if (!fac) {
      omitidas.push({ nombre: n.nombreMatricula, clave: n.clave, motivo: `carrera nueva, facultad no resuelta (prefijo "${pref}")`, cercanas: [] });
      continue;
    }
    reemplazos.push({
      nombreMatricula: n.nombreMatricula,
      modo: "nueva",
      target: null,
      matched: [],
      facultadId: fac.id,
      facultadNombre: fac.nombre,
      grado: gradoDesde(n.nombreMatricula),
      planes: n.planes,
    });
  }

  // --- 4. Índice global de créditos por código, desde planes de FACULTAD ---
  const filasFacultad = await prisma.materiaPlan.findMany({
    where: { plan: { archivoOrigen: { notIn: [...matriculaArchivos] } } },
    select: { creditos: true, materia: { select: { codigo: true } } },
  });
  const indiceCreditos = new Map<string, number>();
  for (const f of filasFacultad) {
    if (f.creditos > 0) {
      const prev = indiceCreditos.get(f.materia.codigo) ?? 0;
      if (f.creditos > prev) indiceCreditos.set(f.materia.codigo, f.creditos);
    }
  }
  console.log(`Índice de créditos (planes de facultad): ${indiceCreditos.size} códigos\n`);

  // --- 5. Perfiles que apuntan a algún plan que se borrará ---
  const idsABorrar = reemplazos.flatMap((r) => r.matched.flatMap((c) => c.planes.map((p) => p.id)));
  const perfiles = idsABorrar.length
    ? await prisma.perfilEstudiante.findMany({ where: { planId: { in: idsABorrar } }, select: { id: true, planId: true } })
    : [];
  const perfilesPorPlan = new Map<string, { id: string }[]>();
  for (const pf of perfiles) perfilesPorPlan.set(pf.planId, [...(perfilesPorPlan.get(pf.planId) ?? []), { id: pf.id }]);

  // ------------------------------------------------------------
  // Reporte + (si --aplicar) escritura, carrera por carrera
  // ------------------------------------------------------------
  let planesEntran = 0;
  let planesSalen = 0;
  let electResueltas = 0;
  let electSinResolver = 0;
  let perfilesReapuntados = 0;
  let perfilesCambiados = 0;
  let variantesBorradas = 0;
  let nuevasCreadas = 0;
  let yaIntegradas = 0;
  const sinResolverGlobal: string[] = [];

  for (const r of reemplazos) {
    const versiones = r.planes.map((p) => ({ plan: p, version: versionBase(p.archivo) }));
    const versionesMatricula = new Set(versiones.map((v) => v.version));
    const archMatricula = new Set(r.planes.map((p) => p.archivo));

    console.log(`CARRERA: "${r.nombreMatricula}"`);
    if (r.modo === "nueva") {
      console.log(`  CARRERA NUEVA -> se crea en [${r.grado} · ${r.facultadNombre}] (no reemplaza a ninguna)`);
    } else {
      console.log(`  adjunta a -> "${r.target!.nombre}" [${r.grado} · ${r.facultadNombre}]`);
    }

    // Idempotencia: si el target ya tiene exactamente estos planes y no quedan
    // variantes, la carrera ya está integrada.
    const target = r.target;
    const yaIntegrada =
      r.modo === "reemplazo" &&
      r.matched.length === 1 &&
      target!.planes.length === archMatricula.size &&
      target!.planes.every((p) => p.archivoOrigen && archMatricula.has(p.archivoOrigen));
    if (yaIntegrada) {
      yaIntegradas++;
      console.log("  ya integrada (planes de matrícula presentes, sin variantes). Se omite.\n");
      continue;
    }

    // Planes a borrar (todos los de las carreras plegadas). Se excluyen los
    // temporales (@tmp@) por si un run anterior murió a medias: esos se renombran,
    // no se borran.
    const planesABorrar = r.matched
      .flatMap((c) => c.planes.map((p) => ({ ...p, carreraNombre: c.nombre })))
      .filter((p) => !p.version.startsWith(TMP));
    const variantes = r.matched.filter((c) => c.id !== target?.id);
    console.log(
      `  planes a borrar (${planesABorrar.length}): ${
        planesABorrar
          .map((p) => `${p.version}${p.archivoOrigen && archMatricula.has(p.archivoOrigen) ? "↺" : ""}`)
          .join(", ") || "(ninguno)"
      }`,
    );
    console.log(`  planes de matrícula a cargar (${versiones.length}): ${versiones.map((v) => v.version).join(", ")}`);
    if (variantes.length) {
      console.log(`  variantes a borrar (quedan vacías): ${variantes.map((c) => `"${c.nombre}"`).join(", ")}`);
    }

    // Electivas: resolución de créditos.
    let resueltas = 0;
    let sinResolver = 0;
    const muestraSin: string[] = [];
    let totMat = 0;
    let totElect = 0;
    for (const p of r.planes) {
      totMat += p.materias.length;
      totElect += p.electivas.length;
      for (const e of p.electivas) {
        if (indiceCreditos.has(e.codigo)) resueltas++;
        else {
          sinResolver++;
          if (muestraSin.length < 3) muestraSin.push(`${e.codigo} ${e.nombre}`);
          sinResolverGlobal.push(e.codigo);
        }
      }
    }
    electResueltas += resueltas;
    electSinResolver += sinResolver;
    console.log(`  materias: ${totMat} regulares · ${totElect} electivas`);
    if (totElect) {
      console.log(
        `  electivas con crédito resuelto: ${resueltas}  ·  sin resolver: ${sinResolver}` +
          (muestraSin.length ? `  [${muestraSin.join(" | ")}${sinResolver > muestraSin.length ? " …" : ""}]` : ""),
      );
    }

    // Perfiles en planes a borrar.
    const masNuevo = [...versiones].sort((a, b) => anioDeVersion(b.version) - anioDeVersion(a.version))[0];
    const perfilesAqui = planesABorrar.flatMap((p) =>
      (perfilesPorPlan.get(p.id) ?? []).map((pf) => ({ perfil: pf, desde: p.version })),
    );
    for (const { perfil, desde } of perfilesAqui) {
      const misma = versionesMatricula.has(desde);
      const destinoV = misma ? desde : masNuevo.version;
      if (!misma) perfilesCambiados++;
      console.log(
        `  perfil ${perfil.id.slice(0, 8)}… : plan "${desde}" -> matrícula "${destinoV}"` +
          (misma ? "  (misma versión)" : "  ⚠ CAMBIA DE PLAN (no existe la misma versión; se usa el más nuevo)"),
      );
    }

    planesEntran += versiones.length;
    planesSalen += planesABorrar.length;
    if (r.modo === "nueva") nuevasCreadas++;
    variantesBorradas += variantes.length;

    if (!APLICAR) {
      console.log();
      continue;
    }

    // ---------------- ESCRITURA ----------------
    const uni = await prisma.facultad.findUnique({ where: { id: r.facultadId }, select: { universidadId: true } });
    const universidadId = uni!.universidadId;

    // Carrera destino: existente (reemplazo) o nueva.
    const carreraId =
      r.modo === "nueva"
        ? (
            (await prisma.carrera.findFirst({
              where: { facultadId: r.facultadId, nombre: r.nombreMatricula, grado: r.grado as never },
              select: { id: true },
            })) ??
            (await prisma.carrera.create({
              data: { facultadId: r.facultadId, nombre: r.nombreMatricula, grado: r.grado as never },
              select: { id: true },
            }))
          ).id
        : target!.id;

    // 1. Materias.
    const codigos = new Map<string, string>();
    for (const p of r.planes) for (const m of [...p.materias, ...p.electivas]) if (!codigos.has(m.codigo)) codigos.set(m.codigo, titulo(m.nombre));
    await enLotes(
      "materias",
      [...codigos].map(([codigo, nombre]) => ({ codigo, nombre, universidadId })),
      (lote) => prisma.materia.createMany({ data: lote, skipDuplicates: true }),
    );
    const materiaId = new Map(
      (await prisma.materia.findMany({ where: { universidadId, codigo: { in: [...codigos.keys()] } }, select: { id: true, codigo: true } })).map((m) => [m.codigo, m.id]),
    );

    // 2. Planes de matrícula. Si hay planes viejos que borrar, se crean con una
    //    versión TEMPORAL para no chocar con ellos (mismo carrera+version) mientras
    //    se mueven los perfiles; se renombran al final. Una carrera nueva no tiene
    //    planes viejos, así que se crean directo en su versión final (idempotente
    //    con skipDuplicates: un segundo run no rebautiza nada).
    const usarTemp = planesABorrar.length > 0;
    const versionCarga = (v: string) => (usarTemp ? TMP + v : v);
    await prisma.planEstudio.createMany({
      data: versiones.map((v) => ({ carreraId, version: versionCarga(v.version), totalCreditos: v.plan.totalCreditos, archivoOrigen: v.plan.archivo })),
      skipDuplicates: true,
    });
    const cargadas = versiones.map((v) => versionCarga(v.version));
    const planIdPorVersion = new Map(
      (await prisma.planEstudio.findMany({ where: { carreraId, version: { in: cargadas } }, select: { id: true, version: true } })).map((p) => [
        usarTemp ? p.version.slice(TMP.length) : p.version,
        p.id,
      ]),
    );

    // 3. MateriaPlan (electivas con crédito cruzado) + prerequisitos.
    const materiaPlanData: Prisma.MateriaPlanCreateManyInput[] = [];
    const reqPendientes: { version: string; codigo: string; requiere: string[] }[] = [];
    for (const { plan: p, version } of versiones) {
      const planId = planIdPorVersion.get(version)!;
      const vistos = new Set<string>();
      for (const m of [...p.materias, ...p.electivas]) {
        if (vistos.has(m.codigo)) continue;
        vistos.add(m.codigo);
        const creditos = m.creditosDesconocidos ? (indiceCreditos.get(m.codigo) ?? 0) : m.creditos;
        materiaPlanData.push({
          planId,
          materiaId: materiaId.get(m.codigo)!,
          orden: m.orden ?? null,
          anio: m.anio ?? null,
          periodo: periodoDe(m.periodo),
          creditos,
          fundamental: m.fundamental ?? false,
          tipo: tipoDe(m.tipo),
          area: m.area ?? null,
          horasClase: m.horasClase ?? 0,
          horasLaboratorio: m.horasLaboratorio ?? 0,
          laboratorioPagado: m.laboratorioPagado ?? false,
          requisitoTexto: m.requisitos.texto,
        });
        const requiere = m.requisitos.codigos.filter((c) => c !== m.codigo && codigos.has(c));
        if (requiere.length) reqPendientes.push({ version, codigo: m.codigo, requiere });
      }
    }
    await enLotes("materiaPlan", materiaPlanData, (lote) => prisma.materiaPlan.createMany({ data: lote, skipDuplicates: true }));

    const mpId = new Map(
      (await prisma.materiaPlan.findMany({ where: { planId: { in: [...planIdPorVersion.values()] } }, select: { id: true, planId: true, materiaId: true } })).map((mp) => [`${mp.planId}|${mp.materiaId}`, mp.id]),
    );
    const prereqData: { materiaPlanId: string; materiaRequeridaId: string }[] = [];
    for (const rq of reqPendientes) {
      const materiaPlanId = mpId.get(`${planIdPorVersion.get(rq.version)}|${materiaId.get(rq.codigo)}`);
      if (!materiaPlanId) continue;
      for (const cod of new Set(rq.requiere)) {
        const req = materiaId.get(cod);
        if (req) prereqData.push({ materiaPlanId, materiaRequeridaId: req });
      }
    }
    await enLotes("prerequisitos", prereqData, (lote) => prisma.prerequisito.createMany({ data: lote, skipDuplicates: true }));

    // 4. Reapuntar perfiles a los planes TEMP (misma versión, o el más nuevo).
    await mapLimite(perfilesAqui, CONCURRENCIA, async ({ perfil, desde }) => {
      const destinoV = versionesMatricula.has(desde) ? desde : masNuevo.version;
      await prisma.perfilEstudiante.update({ where: { id: perfil.id }, data: { planId: planIdPorVersion.get(destinoV)! } });
      perfilesReapuntados++;
    });

    // 5. Borrar TODOS los planes viejos (ya sin perfiles). Cascada limpia
    //    MateriaPlan y Prerequisito. deleteMany = una sentencia.
    const restan = await prisma.perfilEstudiante.count({ where: { planId: { in: planesABorrar.map((p) => p.id) } } });
    if (restan > 0) {
      console.log(`  ⚠ ${restan} perfil(es) siguen en planes viejos. No se borra nada de esta carrera.\n`);
      continue;
    }
    const del = await prisma.planEstudio.deleteMany({ where: { id: { in: planesABorrar.map((p) => p.id) } } });

    // 6. Renombrar los planes TEMP a su versión final (ya sin choque posible).
    if (usarTemp) {
      for (const [version, id] of planIdPorVersion) {
        await prisma.planEstudio.update({ where: { id }, data: { version } });
      }
    }

    // 7. Borrar las variantes que quedaron vacías.
    let varBorradas = 0;
    for (const c of variantes) {
      const quedan = await prisma.planEstudio.count({ where: { carreraId: c.id } });
      if (quedan > 0) {
        console.log(`  ⚠ variante "${c.nombre}" aún tiene ${quedan} plan/es. No se borra.`);
        continue;
      }
      await prisma.carrera.delete({ where: { id: c.id } });
      varBorradas++;
    }
    console.log(`  planes viejos borrados: ${del.count} · variantes borradas: ${varBorradas}\n`);
  }

  // --- Carreras omitidas ---
  if (omitidas.length) {
    console.log("── OMITIDAS (no se toca nada; decide el match y reintenta) ──");
    for (const o of omitidas) {
      console.log(`  "${o.nombre}"  (clave "${o.clave}"): ${o.motivo}`);
      if (o.cercanas.length) console.log(`     cercanas: ${o.cercanas.map((c) => `"${c}"`).join(", ")}`);
    }
    console.log();
  }

  // --- Resumen ---
  const codigosSinResolver = [...new Set(sinResolverGlobal)];
  const nReemplazo = reemplazos.filter((r) => r.modo === "reemplazo").length;
  console.log("── RESUMEN ──");
  console.log(`  carreras integradas: ${reemplazos.length} / ${porCarrera.size}  (${nReemplazo} reemplazo, ${reemplazos.length - nReemplazo} nueva/s)`);
  if (APLICAR && yaIntegradas) console.log(`  ya integradas (omitidas por idempotencia): ${yaIntegradas}`);
  console.log(`  carreras NUEVAS creadas: ${APLICAR ? nuevasCreadas : reemplazos.filter((r) => r.modo === "nueva").length}`);
  console.log(`  variantes borradas (filas vacías): ${variantesBorradas}`);
  console.log(`  planes que entran (matrícula): ${planesEntran}`);
  console.log(`  planes que salen (viejos):     ${planesSalen}`);
  console.log(`  electivas con crédito resuelto: ${electResueltas}`);
  console.log(`  electivas SIN resolver: ${electSinResolver}  (${codigosSinResolver.length} códigos distintos)`);
  console.log(`  perfiles reapuntados: ${APLICAR ? perfilesReapuntados : perfiles.length}  (a versión distinta: ${perfilesCambiados})`);
  if (omitidas.length) console.log(`  carreras omitidas: ${omitidas.length}`);

  console.log(APLICAR ? "\nListo. Siguiente: fusionar-carreras.ts --aplicar (debería hacer poco o nada).\n" : "\nSimulación. Corre con --aplicar para escribir.\n");
}

main()
  .catch((e) => {
    console.error("\nFalló la integración:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
