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
import { nombreProfesor } from "@/lib/texto";
import { validarNombreProfesor } from "@/lib/profesor";
import { parseTipoPeriodo } from "./periodo";

export type EstadoCrearCurso = { error?: string };

type SubFila = { nombre: string; porcentaje: number; cantidad: number };
type FilaSeccion = {
  nombre: string;
  porcentaje: number;
  cantidad: number;
  profesorNombre?: string | null;
  subsecciones?: SubFila[];
};

// Árbol de secciones → forma del motor, para validar (suma 100 arriba y en cada
// grupo de subsecciones).
function filasAEval(filas: FilaSeccion[]) {
  return filas.map((f) => {
    const subs = f.subsecciones ?? [];
    return subs.length > 0
      ? {
          nombre: f.nombre,
          porcentaje: f.porcentaje,
          cantidad: 0,
          notas: [],
          subsecciones: subs.map((s) => ({
            nombre: s.nombre,
            porcentaje: s.porcentaje,
            cantidad: s.cantidad,
            notas: [],
          })),
        }
      : { nombre: f.nombre, porcentaje: f.porcentaje, cantidad: f.cantidad, notas: [] };
  });
}

function notasVaciasCreate(cantidad: number) {
  return Array.from({ length: cantidad }, (_, k) => ({ orden: k + 1, puntaje: null, puntajeMax: 100 }));
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
  const vProfesor = validarNombreProfesor(String(formData.get("profesorNombre") ?? ""));
  if (!vProfesor.ok) return { error: vProfesor.error };
  const profesorNombre = vProfesor.nombre;
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
      const subs = Array.isArray(f.subsecciones) ? f.subsecciones : [];
      if (subs.length > 0) {
        for (const sub of subs) {
          if (!sub || typeof sub.nombre !== "string" || !sub.nombre.trim()) {
            return { error: "Cada subsección necesita un nombre." };
          }
          if (!Number.isFinite(sub.porcentaje) || sub.porcentaje <= 0) {
            return { error: "Los porcentajes de las subsecciones deben ser mayores que 0." };
          }
          if (!Number.isInteger(sub.cantidad) || sub.cantidad < 1) {
            return { error: "La cantidad de notas debe ser un entero mayor o igual a 1." };
          }
        }
      } else if (!Number.isInteger(f.cantidad) || f.cantidad < 1) {
        return { error: "La cantidad de notas debe ser un entero mayor o igual a 1." };
      }
    }
    const v = validarSecciones(filasAEval(filas));
    if (!v.valido) {
      if (v.subseccionesInvalidas.length > 0) {
        const s = v.subseccionesInvalidas[0];
        return { error: `Las subsecciones de "${s.nombre}" deben sumar 100 (ahora suman ${s.suma}).` };
      }
      return { error: `Los porcentajes deben sumar 100 (ahora suman ${v.suma}).` };
    }
  }

  // Profesores de las secciones de laboratorio (distintos del de la materia).
  const profIdPorNombre = new Map<string, string>();
  for (const f of filas) {
    const subs = f.subsecciones ?? [];
    // El nombre entra al catálogo COMPARTIDO: se valida antes de escribirlo.
    const v = subs.length > 0 ? validarNombreProfesor(f.profesorNombre) : ({ ok: true, nombre: "" } as const);
    if (!v.ok) return { error: v.error };
    const nombre = v.nombre;
    if (nombre && !profIdPorNombre.has(nombre)) {
      const prof = await prisma.profesor.upsert({
        where: { universidadId_nombre: { universidadId: perfil.universidadId, nombre } },
        create: { nombre, universidadId: perfil.universidadId, verificado: false },
        update: {},
        select: { id: true },
      });
      profIdPorNombre.set(nombre, prof.id);
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
    // Las subsecciones necesitan cursoId (no se hereda por la self-relation),
    // así que se crean en dos pasos dentro de una transacción.
    await prisma.$transaction(async (tx) => {
      const curso = await tx.curso.create({
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
        },
        select: { id: true },
      });

      if (!calificable) return;

      for (let i = 0; i < filas.length; i++) {
        const f = filas[i];
        const subs = f.subsecciones ?? [];
        if (subs.length > 0) {
          const profN = f.profesorNombre ? nombreProfesor(f.profesorNombre) : "";
          const padre = await tx.seccion.create({
            data: {
              cursoId: curso.id,
              nombre: f.nombre.trim(),
              porcentaje: f.porcentaje,
              cantidad: 0, // un grupo no tiene notas propias
              orden: i + 1,
              profesorId: profN ? (profIdPorNombre.get(profN) ?? null) : null,
            },
            select: { id: true },
          });
          for (let j = 0; j < subs.length; j++) {
            const sub = subs[j];
            await tx.seccion.create({
              data: {
                cursoId: curso.id,
                seccionPadreId: padre.id,
                nombre: sub.nombre.trim(),
                porcentaje: sub.porcentaje,
                cantidad: sub.cantidad,
                orden: j + 1,
                notas: { create: notasVaciasCreate(sub.cantidad) },
              },
            });
          }
        } else {
          await tx.seccion.create({
            data: {
              cursoId: curso.id,
              nombre: f.nombre.trim(),
              porcentaje: f.porcentaje,
              cantidad: f.cantidad,
              orden: i + 1,
              // Notas pre-creadas en null: la calculadora sólo las rellena.
              notas: { create: notasVaciasCreate(f.cantidad) },
            },
          });
        }
      }
    });
  } catch (e) {
    // Choca con @@unique([perfilId, materiaId, periodoId]).
    if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2002") {
      return { error: "Ya tienes esta materia en este periodo." };
    }
    return { error: "No se pudo crear la materia." };
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
  /** Profesor por materia (materiaPlanId -> nombre). Opcional. */
  profesores?: Record<string, string>;
}): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const perfil = await prisma.perfilEstudiante.findUnique({
    where: { userId: session.user.id },
    select: { id: true, planId: true, universidadId: true },
  });
  if (!perfil) redirect("/onboarding");

  const anioActual = new Date().getFullYear();
  if (!Number.isInteger(input.anio) || input.anio < 1980 || input.anio > anioActual + 1) {
    return { ok: false, error: "Año de periodo inválido." };
  }
  if (input.materiaPlanIds.length === 0) return { ok: false, error: "Marca al menos una materia." };

  // Los profesores entran al catálogo COMPARTIDO: se validan TODOS antes de
  // crear nada, para no dejar el semestre a medio armar por un nombre malo.
  const profesorIdPorMateria = new Map<string, string>();
  for (const [mpId, crudo] of Object.entries(input.profesores ?? {})) {
    const v = validarNombreProfesor(crudo);
    if (!v.ok) return { ok: false, error: v.error };
    if (!v.nombre) continue;
    const prof = await prisma.profesor.upsert({
      where: { universidadId_nombre: { universidadId: perfil.universidadId, nombre: v.nombre } },
      create: { nombre: v.nombre, universidadId: perfil.universidadId, verificado: false },
      update: {},
      select: { id: true },
    });
    profesorIdPorMateria.set(mpId, prof.id);
  }

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
          profesorId: profesorIdPorMateria.get(mpId) ?? null,
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
