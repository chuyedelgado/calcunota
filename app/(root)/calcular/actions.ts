"use server";

import { prisma } from "@/lib/prisma";
import { buscar } from "@/lib/texto";

// Búsquedas públicas del catálogo (solo lectura, sin sesión). Para los combobox
// "elegir o escribir" del asistente anónimo.
//
// El filtrado se hace en memoria con lib/texto para tolerar tildes, mayúsculas,
// puntuación, orden libre de términos y equivalencia de romanos ("fisica 2"
// encuentra "Física II"), cosa que el `contains` de Postgres no resuelve.
//
// La universidad se elige primero: las materias y los profesores dependen de
// ella. Se recibe por NOMBRE (así llegan al asistente) y acota la consulta.

export async function buscarMateriasPublico(query: string, universidad?: string): Promise<string[]> {
  const q = query.trim();
  const uni = universidad?.trim();
  // Sin universidad no se puede filtrar el catálogo: el asistente deshabilita el
  // campo, pero por si acaso aquí tampoco se ofrece nada que confunda.
  if (q.length < 2 || !uni) return [];
  const materias = await prisma.materia.findMany({
    where: { universidad: { nombre: uni } },
    select: { codigo: true, nombre: true },
  });
  const opciones = materias.map((m) => `${m.codigo} · ${m.nombre}`);
  return buscar(opciones, q, (o) => o).slice(0, 8);
}

export async function buscarProfesoresPublico(query: string, universidad?: string): Promise<string[]> {
  const q = query.trim();
  const uni = universidad?.trim();
  if (q.length < 2 || !uni) return [];
  const profes = await prisma.profesor.findMany({
    where: { universidad: { nombre: uni } },
    select: { nombre: true },
  });
  return buscar(profes.map((p) => p.nombre), q, (n) => n).slice(0, 8);
}
