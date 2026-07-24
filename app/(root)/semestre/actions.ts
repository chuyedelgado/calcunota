"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { esCalificable, validarSecciones } from "@/lib/calculos";
import { parseTipo, type PeriodoTipo } from "./periodo";

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
  const tipo: PeriodoTipo = parseTipo(formData.get("tipo"));
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
