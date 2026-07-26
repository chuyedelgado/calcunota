"use server";

import { prisma } from "@/lib/prisma";

// Búsquedas públicas del catálogo (solo lectura, sin sesión). Para los combobox
// "elegir o escribir" del asistente anónimo.

export async function buscarMateriasPublico(query: string): Promise<string[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const materias = await prisma.materia.findMany({
    where: { OR: [{ codigo: { contains: q } }, { nombre: { contains: q, mode: "insensitive" } }] },
    select: { codigo: true, nombre: true },
    take: 8,
    orderBy: { nombre: "asc" },
  });
  return materias.map((m) => `${m.codigo} · ${m.nombre}`);
}

export async function buscarProfesoresPublico(query: string): Promise<string[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const profes = await prisma.profesor.findMany({
    where: { nombre: { contains: q, mode: "insensitive" } },
    select: { nombre: true },
    take: 8,
    orderBy: { nombre: "asc" },
  });
  return profes.map((p) => p.nombre);
}
