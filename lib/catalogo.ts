// Caché en memoria del catálogo público (materias, profesores y créditos).
//
// POR QUÉ EXISTE: las búsquedas cargaban las ~2,000 materias de la universidad en
// CADA llamada (176 KB y ~1.3 s contra Neon). Dos de esas búsquedas son públicas
// y sin sesión, así que un script sin cuenta podía agotar el plan de la base en
// minutos. Con la caché, la base se consulta una vez por ventana, no una vez por
// petición.
//
// POR QUÉ NO SE FILTRA EN LA CONSULTA: `contains` de Postgres no ignora tildes y
// el catálogo trae ambas grafías ("Cálculo I" y "Calculo Diferencial I", según
// cómo acentuara cada PDF). Filtrar con `contains` parte el catálogo en dos según
// cómo escriba el estudiante, y `unaccent` no está instalado. La normalización
// vive en lib/texto.ts (JS), así que buscar() necesita ver el conjunto completo
// para que "calculo" siga encontrando "Cálculo I". La caché es lo que hace que
// eso sea barato.
//
// Solo guarda datos de catálogo compartido, nunca datos de un estudiante.

import { prisma } from "@/lib/prisma";

// Materias y créditos cambian solo al sembrar o importar planes: ventana larga.
const TTL_CATALOGO_MS = 30 * 60 * 1000;
// Los profesores los crean los propios estudiantes: ventana corta para que uno
// recién agregado aparezca pronto en las sugerencias.
const TTL_PROFESORES_MS = 2 * 60 * 1000;

// Tope duro de filas leídas. Hoy el catálogo cabe de sobra (~2,000 materias);
// existe para que un catálogo que crezca sin control no vuelva a cargarse entero.
const TOPE_FILAS = 5000;

type Entrada = { datos: unknown; expira: number };
const cache = new Map<string, Entrada>();

// Deduplica cargas en vuelo: si llegan 50 peticiones con la caché fría, se hace
// UNA consulta y todas esperan la misma promesa, en vez de 50 consultas iguales.
const enVuelo = new Map<string, Promise<unknown>>();

async function cacheado<T>(clave: string, ttlMs: number, cargar: () => Promise<T>): Promise<T> {
  const ahora = Date.now();
  const hit = cache.get(clave);
  if (hit && hit.expira > ahora) return hit.datos as T;

  const yaVa = enVuelo.get(clave);
  if (yaVa) return yaVa as Promise<T>;

  const promesa = cargar()
    .then((datos) => {
      cache.set(clave, { datos, expira: Date.now() + ttlMs });
      return datos;
    })
    .finally(() => enVuelo.delete(clave));

  enVuelo.set(clave, promesa);
  return promesa as Promise<T>;
}

export type MateriaCatalogo = { id: string; codigo: string; nombre: string };

/** Materias de una universidad por id. Cacheado. */
export function materiasDeUniversidad(universidadId: string): Promise<MateriaCatalogo[]> {
  return cacheado(`materias:id:${universidadId}`, TTL_CATALOGO_MS, () =>
    prisma.materia.findMany({
      where: { universidadId },
      select: { id: true, codigo: true, nombre: true },
      take: TOPE_FILAS,
    }),
  );
}

/** Materias de una universidad por nombre (así llegan del asistente). Cacheado. */
export function materiasDeUniversidadPorNombre(nombre: string): Promise<MateriaCatalogo[]> {
  return cacheado(`materias:nombre:${nombre}`, TTL_CATALOGO_MS, () =>
    prisma.materia.findMany({
      where: { universidad: { nombre } },
      select: { id: true, codigo: true, nombre: true },
      take: TOPE_FILAS,
    }),
  );
}

/** Nombres de profesores de una universidad por nombre de universidad. Cacheado. */
export function profesoresDeUniversidadPorNombre(nombre: string): Promise<string[]> {
  return cacheado(`profesores:nombre:${nombre}`, TTL_PROFESORES_MS, async () =>
    (
      await prisma.profesor.findMany({
        where: { universidad: { nombre } },
        select: { nombre: true },
        take: TOPE_FILAS,
      })
    ).map((p) => p.nombre),
  );
}

/**
 * Créditos más frecuentes por materia, para las convalidadas fuera del plan.
 * Es un groupBy sobre las ~6,000 filas de MateriaPlan, así que se cachea: estaba
 * corriendo entero en cada búsqueda del importador.
 */
export function creditosFrecuentes(): Promise<Map<string, number>> {
  return cacheado("creditos:frecuentes", TTL_CATALOGO_MS, async () => {
    const grupos = await prisma.materiaPlan.groupBy({
      by: ["materiaId", "creditos"],
      _count: { _all: true },
    });
    const mejor = new Map<string, { creditos: number; n: number }>();
    for (const g of grupos) {
      const prev = mejor.get(g.materiaId);
      const n = g._count._all;
      if (!prev || n > prev.n || (n === prev.n && g.creditos > prev.creditos)) {
        mejor.set(g.materiaId, { creditos: g.creditos, n });
      }
    }
    return new Map([...mejor].map(([k, v]) => [k, v.creditos]));
  });
}
