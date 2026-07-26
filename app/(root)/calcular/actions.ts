"use server";

import { prisma } from "@/lib/prisma";
import { buscar } from "@/lib/texto";

// Búsquedas públicas del catálogo (solo lectura, sin sesión). Para los combobox
// "elegir o escribir" del asistente anónimo.
//
// El filtrado se hace en memoria con lib/texto para tolerar tildes, mayúsculas,
// puntuación, orden libre de términos y equivalencia de romanos ("fisica 2"
// encuentra "Física II"), cosa que el `contains` de Postgres no resuelve.

export async function buscarMateriasPublico(query: string): Promise<string[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const materias = await prisma.materia.findMany({
    select: { codigo: true, nombre: true },
  });
  const opciones = materias.map((m) => `${m.codigo} · ${m.nombre}`);
  return buscar(opciones, q, (o) => o).slice(0, 8);
}

export async function buscarProfesoresPublico(query: string): Promise<string[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const profes = await prisma.profesor.findMany({
    select: { nombre: true },
  });
  return buscar(profes.map((p) => p.nombre), q, (n) => n).slice(0, 8);
}
