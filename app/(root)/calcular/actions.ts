"use server";

import { buscar } from "@/lib/texto";
import { materiasDeUniversidadPorNombre, profesoresDeUniversidadPorNombre } from "@/lib/catalogo";

// Búsquedas públicas del catálogo (solo lectura, sin sesión). Para los combobox
// "elegir o escribir" del asistente anónimo.
//
// El filtrado se hace en memoria con lib/texto para tolerar tildes, mayúsculas,
// puntuación, orden libre de términos y equivalencia de romanos ("fisica 2"
// encuentra "Física II"), cosa que el `contains` de Postgres no resuelve.
//
// La universidad se elige primero: las materias y los profesores dependen de
// ella. Se recibe por NOMBRE (así llegan al asistente) y acota la consulta.

// Estas dos son PÚBLICAS y sin sesión: el catálogo se lee de la caché de
// lib/catalogo.ts, no de la base en cada llamada. La consulta se acota también
// por longitud para no gastar trabajo en cadenas absurdas.
const MAX_CONSULTA = 80;
const MAX_SUGERENCIAS = 8;

export async function buscarMateriasPublico(query: string, universidad?: string): Promise<string[]> {
  const q = query.trim().slice(0, MAX_CONSULTA);
  const uni = universidad?.trim().slice(0, MAX_CONSULTA);
  // Sin universidad no se puede filtrar el catálogo: el asistente deshabilita el
  // campo, pero por si acaso aquí tampoco se ofrece nada que confunda.
  if (q.length < 2 || !uni) return [];
  const materias = await materiasDeUniversidadPorNombre(uni);
  const opciones = materias.map((m) => `${m.codigo} · ${m.nombre}`);
  return buscar(opciones, q, (o) => o).slice(0, MAX_SUGERENCIAS);
}

export async function buscarProfesoresPublico(query: string, universidad?: string): Promise<string[]> {
  const q = query.trim().slice(0, MAX_CONSULTA);
  const uni = universidad?.trim().slice(0, MAX_CONSULTA);
  if (q.length < 2 || !uni) return [];
  const profes = await profesoresDeUniversidadPorNombre(uni);
  return buscar(profes, q, (n) => n).slice(0, MAX_SUGERENCIAS);
}
