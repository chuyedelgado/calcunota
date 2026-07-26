"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  APROBACION_NORMAL,
  esCalificable,
  notaALetra,
  notaAPuntos,
  validarSecciones,
  type TipoPeriodo,
} from "@/lib/calculos";
import { calcularIndiceDesdeCursos } from "@/lib/indice";
import { parseTipoPeriodo } from "./periodo";

export type EstadoCrearCurso = { error?: string };

type FilaSeccion = { nombre: string; porcentaje: number; cantidad: number };

// trim + Title Case, para no generar profesores duplicados como
// "juan perez" / "JUAN PEREZ".
function tituloCase(valor: string): string {
  return valor
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

export async function crearCurso(
  _prev: EstadoCrearCurso,
  formData: FormData,
): Promise<EstadoCrearCurso> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/");
  }

  const perfil = await prisma.perfilEstudiante.findUnique({
    where: { userId: session.user.id },
    select: { id: true, planId: true, universidadId: true },
  });
  if (!perfil) {
    redirect("/onboarding");
  }

  const materiaPlanId = String(formData.get("materiaPlanId") ?? "");
  const anio = Number(formData.get("anio"));
  const tipo: TipoPeriodo = parseTipoPeriodo(formData.get("tipo"));
  const profesorNombre = tituloCase(String(formData.get("profesorNombre") ?? ""));
  const seccionesRaw = String(formData.get("secciones") ?? "");

  if (!materiaPlanId) {
    return { error: "Selecciona una materia." };
  }
  const anioActual = new Date().getFullYear();
  if (!Number.isInteger(anio) || anio < 1980 || anio > anioActual + 1) {
    return { error: "El año del periodo no es válido." };
  }

  // La materia debe pertenecer al plan del perfil. De aquí salen también los
  // valores de créditos y fundamental, que se copian como snapshot.
  const mp = await prisma.materiaPlan.findUnique({
    where: { id: materiaPlanId },
    select: { planId: true, materiaId: true, creditos: true, fundamental: true },
  });
  if (!mp || mp.planId !== perfil.planId) {
    return { error: "La materia no pertenece a tu plan de estudio." };
  }

  const calificable = esCalificable(mp.creditos);

  // Sólo las materias con créditos tienen esquema de evaluación.
  let filas: FilaSeccion[] = [];
  if (calificable) {
    try {
      filas = JSON.parse(seccionesRaw);
    } catch {
      return { error: "El esquema de evaluación no es válido." };
    }
    if (!Array.isArray(filas) || filas.length === 0) {
      return { error: "Agrega al menos una sección de evaluación." };
    }
    for (const f of filas) {
      if (!f || typeof f.nombre !== "string" || !f.nombre.trim()) {
        return { error: "Cada sección necesita un nombre." };
      }
      if (!Number.isFinite(f.porcentaje) || f.porcentaje <= 0) {
        return { error: "Los porcentajes deben ser mayores que 0." };
      }
      if (!Number.isInteger(f.cantidad) || f.cantidad < 1) {
        return { error: "La cantidad de notas debe ser un entero mayor o igual a 1." };
      }
    }
    const v = validarSecciones(
      filas.map((f) => ({ nombre: f.nombre, porcentaje: f.porcentaje, cantidad: f.cantidad, notas: [] })),
    );
    if (!v.valido) {
      return { error: `Los porcentajes deben sumar 100 (ahora suman ${v.suma}).` };
    }
  }

  // El Periodo es único por (anio, tipo): puede existir ya.
  const periodo = await prisma.periodo.upsert({
    where: { anio_tipo: { anio, tipo } },
    create: { anio, tipo },
    update: {},
    select: { id: true },
  });

  // Profesor opcional: se busca o se crea por (universidad, nombre normalizado),
  // sin verificar (lo aporta el estudiante).
  let profesorId: string | null = null;
  if (profesorNombre) {
    const prof = await prisma.profesor.upsert({
      where: { universidadId_nombre: { universidadId: perfil.universidadId, nombre: profesorNombre } },
      create: { nombre: profesorNombre, universidadId: perfil.universidadId, verificado: false },
      update: {},
      select: { id: true },
    });
    profesorId = prof.id;
  }

  // Repetir es válido: se marca si el perfil ya cursó antes esta materia.
  const previos = await prisma.curso.count({
    where: { perfilId: perfil.id, materiaId: mp.materiaId },
  });

  try {
    await prisma.curso.create({
      data: {
        perfilId: perfil.id,
        materiaId: mp.materiaId,
        periodoId: periodo.id,
        profesorId,
        // Snapshot desde el plan: si el plan cambia, el histórico no se mueve.
        creditos: mp.creditos,
        fundamental: mp.fundamental,
        esRepeticion: previos > 0,
        estado: calificable ? "EN_CURSO" : "APROBADO",
        notaFinal: null,
        ...(calificable
          ? {
              secciones: {
                create: filas.map((f, i) => ({
                  nombre: f.nombre.trim(),
                  porcentaje: f.porcentaje,
                  cantidad: f.cantidad,
                  orden: i + 1,
                  // Notas pre-creadas en null: la calculadora sólo las rellena.
                  notas: {
                    create: Array.from({ length: f.cantidad }, (_, k) => ({
                      orden: k + 1,
                      puntaje: null,
                      puntajeMax: 100,
                    })),
                  },
                })),
              },
            }
          : {}),
      },
    });
  } catch {
    // Choca con @@unique([perfilId, materiaId, periodoId]).
    return { error: "Ya tienes esta materia en este periodo." };
  }

  redirect(`/semestre?anio=${anio}&tipo=${tipo}`);
}

// ============================================================
// Armar semestre: crea varios cursos EN_CURSO con esquema por defecto
// ============================================================

const ESQUEMA_DEFECTO = [
  { nombre: "Parciales", porcentaje: 40, cantidad: 2 },
  { nombre: "Talleres", porcentaje: 30, cantidad: 3 },
  { nombre: "Examen final", porcentaje: 30, cantidad: 1 },
];

export async function crearSemestre(input: {
  anio: number;
  tipo: TipoPeriodo;
  materiaPlanIds: string[];
}): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const perfil = await prisma.perfilEstudiante.findUnique({
    where: { userId: session.user.id },
    select: { id: true, planId: true },
  });
  if (!perfil) redirect("/onboarding");

  const anioActual = new Date().getFullYear();
  if (!Number.isInteger(input.anio) || input.anio < 1980 || input.anio > anioActual + 1) {
    return { ok: false, error: "Año de periodo inválido." };
  }
  if (input.materiaPlanIds.length === 0) return { ok: false, error: "Marca al menos una materia." };

  const periodo = await prisma.periodo.upsert({
    where: { anio_tipo: { anio: input.anio, tipo: input.tipo } },
    create: { anio: input.anio, tipo: input.tipo },
    update: {},
    select: { id: true },
  });

  for (const mpId of input.materiaPlanIds) {
    const mp = await prisma.materiaPlan.findUnique({
      where: { id: mpId },
      select: { planId: true, materiaId: true, creditos: true, fundamental: true },
    });
    if (!mp || mp.planId !== perfil.planId) continue; // ignora lo que no es del plan

    const previos = await prisma.curso.count({
      where: { perfilId: perfil.id, materiaId: mp.materiaId },
    });
    const calificable = esCalificable(mp.creditos);

    try {
      await prisma.curso.create({
        data: {
          perfilId: perfil.id,
          materiaId: mp.materiaId,
          periodoId: periodo.id,
          creditos: mp.creditos,
          fundamental: mp.fundamental,
          esRepeticion: previos > 0,
          // Sin créditos: aprobada directa. Con créditos: en curso con esquema.
          estado: calificable ? "EN_CURSO" : "APROBADO",
          notaFinal: null,
          ...(calificable
            ? {
                secciones: {
                  create: ESQUEMA_DEFECTO.map((s, i) => ({
                    nombre: s.nombre,
                    porcentaje: s.porcentaje,
                    cantidad: s.cantidad,
                    orden: i + 1,
                    notas: {
                      create: Array.from({ length: s.cantidad }, (_, k) => ({
                        orden: k + 1,
                        puntaje: null,
                        puntajeMax: 100,
                      })),
                    },
                  })),
                },
              }
            : {}),
        },
      });
    } catch {
      continue; // ya existe esa materia en el periodo
    }
  }

  redirect(`/semestre?anio=${input.anio}&tipo=${input.tipo}`);
}

// ============================================================
// Cierre de semestre completo
// ============================================================

export type CierreFila = { cursoId: string; notaFinal: number | null; retirar: boolean };

export type ResumenSemestre = {
  ok: boolean;
  error?: string;
  resumen?: { puntos: number; creditos: number; indicePeriodo: number; indiceAcumulado: number };
};

export async function cerrarSemestre(input: {
  anio: number;
  tipo: TipoPeriodo;
  cierres: CierreFila[];
}): Promise<ResumenSemestre> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Sesión no válida." };
  const perfil = await prisma.perfilEstudiante.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!perfil) return { ok: false, error: "Sin perfil." };

  const ids = input.cierres.map((c) => c.cursoId);
  const cursos = await prisma.curso.findMany({
    where: { id: { in: ids }, perfilId: perfil.id },
    select: { id: true },
  });
  const validos = new Set(cursos.map((c) => c.id));

  for (const c of input.cierres) {
    if (!validos.has(c.cursoId)) return { ok: false, error: "Hay un curso que no es tuyo." };
    if (!c.retirar) {
      if (c.notaFinal === null || !Number.isFinite(c.notaFinal) || c.notaFinal < 0 || c.notaFinal > 100) {
        return { ok: false, error: "Cada materia necesita una nota de 0 a 100, o marcarla como retirada." };
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const c of input.cierres) {
      if (c.retirar) {
        await tx.curso.update({
          where: { id: c.cursoId },
          data: { estado: "RETIRADO", notaFinal: null, letraFinal: null, puntos: null },
        });
      } else {
        const nota = c.notaFinal as number;
        await tx.curso.update({
          where: { id: c.cursoId },
          data: {
            notaFinal: nota,
            letraFinal: notaALetra(nota),
            puntos: notaAPuntos(nota),
            estado: nota >= APROBACION_NORMAL ? "APROBADO" : "REPROBADO",
          },
        });
      }
    }
  });

  // Índice derivado, recalculado al leer (no se persiste).
  const cerrados = await prisma.curso.findMany({
    where: { perfilId: perfil.id, notaFinal: { not: null } },
    select: {
      id: true,
      materiaId: true,
      creditos: true,
      notaFinal: true,
      periodo: { select: { anio: true, tipo: true } },
    },
  });
  const todos = cerrados.map((c) => ({
    id: c.id,
    materiaId: c.materiaId,
    creditos: c.creditos,
    notaFinal: c.notaFinal,
    periodo: { anio: c.periodo.anio, tipo: c.periodo.tipo as TipoPeriodo },
  }));
  const acumulado = calcularIndiceDesdeCursos(todos);
  const delPeriodo = calcularIndiceDesdeCursos(
    todos.filter((c) => c.periodo.anio === input.anio && c.periodo.tipo === input.tipo),
  );

  return {
    ok: true,
    resumen: {
      puntos: delPeriodo.puntos,
      creditos: delPeriodo.creditos,
      indicePeriodo: delPeriodo.indice,
      indiceAcumulado: acumulado.indice,
    },
  };
}
