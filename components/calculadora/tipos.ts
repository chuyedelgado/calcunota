// Formas de datos de la captura de una materia, compartidas por la calculadora
// pública (sin sesión, sin persistencia) y la interna (persistida por Curso).

import type { SeccionEvaluacion } from "@/lib/calculos";

// Clave de localStorage donde el asistente público guarda la materia calculada,
// para precargarla si el visitante se registra.
export const CLAVE_MATERIA_PUBLICA = "calcunota:materia-publica";

export type NotaUI = {
  id: string;
  orden: number;
  descripcion: string | null;
  puntaje: number | null; // null = pendiente (no es cero)
  puntajeMax: number;
};

export type SeccionUI = {
  id: string;
  nombre: string;
  porcentaje: number;
  cantidad: number;
  orden: number;
  notas: NotaUI[];
  // Anidamiento (ej. laboratorio). Si `subsecciones` está presente y no vacío,
  // la sección es un GRUPO: no tiene notas propias y su 100% se reparte entre
  // las subsecciones. `profesorNombre` es el docente del bloque (el laboratorio
  // suele impartirlo otro profesor).
  profesorNombre?: string | null;
  subsecciones?: SeccionUI[];
};

// Convierte el árbol de la UI a la forma que consume el motor (lib/calculos).
// El motor aplana solo; aquí basta con espejar el árbol.
export function aEval(secciones: SeccionUI[]): SeccionEvaluacion[] {
  return secciones.map((s) =>
    s.subsecciones && s.subsecciones.length > 0
      ? {
          nombre: s.nombre,
          porcentaje: s.porcentaje,
          cantidad: 0,
          notas: [],
          subsecciones: s.subsecciones.map((sub) => ({
            nombre: sub.nombre,
            porcentaje: sub.porcentaje,
            cantidad: sub.cantidad,
            notas: sub.notas.map((n) => ({ puntaje: n.puntaje, puntajeMax: n.puntajeMax })),
          })),
        }
      : {
          nombre: s.nombre,
          porcentaje: s.porcentaje,
          cantidad: s.cantidad,
          notas: s.notas.map((n) => ({ puntaje: n.puntaje, puntajeMax: n.puntajeMax })),
        },
  );
}

// ¿La sección es un grupo con subsecciones (laboratorio)?
export function esGrupo(s: { subsecciones?: unknown[] }): boolean {
  return Array.isArray(s.subsecciones) && s.subsecciones.length > 0;
}

// Peso efectivo de una subsección sobre la nota final: el % del padre por el %
// relativo de la subsección. El laboratorio del 25% con parciales al 35% da
// 8.75% de la nota final.
export function pesoEfectivo(porcentajePadre: number, porcentajeSub: number): number {
  return (porcentajePadre * porcentajeSub) / 100;
}

// Árbol del borrador (editor de esquema, sin notas) → forma del motor, para
// validar porcentajes (arriba y dentro de cada grupo).
export function borradorAEval(secciones: BorradorSeccion[]): SeccionEvaluacion[] {
  return secciones.map((s) => {
    const subs = s.subsecciones ?? [];
    return subs.length > 0
      ? {
          nombre: s.nombre,
          porcentaje: s.porcentaje,
          cantidad: 0,
          notas: [],
          subsecciones: subs.map((x) => ({ nombre: x.nombre, porcentaje: x.porcentaje, cantidad: x.cantidad, notas: [] })),
        }
      : { nombre: s.nombre, porcentaje: s.porcentaje, cantidad: s.cantidad, notas: [] };
  });
}

// SeccionUI (con notas) → BorradorSeccion (solo estructura), para el editor.
export function seccionesUIaBorrador(secciones: SeccionUI[]): BorradorSeccion[] {
  return secciones.map((s) => {
    const subs = s.subsecciones ?? [];
    return subs.length > 0
      ? {
          id: s.id,
          nombre: s.nombre,
          porcentaje: s.porcentaje,
          cantidad: 0,
          profesorNombre: s.profesorNombre ?? null,
          subsecciones: subs.map((x) => ({ id: x.id, nombre: x.nombre, porcentaje: x.porcentaje, cantidad: x.cantidad })),
        }
      : { id: s.id, nombre: s.nombre, porcentaje: s.porcentaje, cantidad: s.cantidad };
  });
}

// Plantilla "Materia con laboratorio" como borrador (para el editor de esquema).
export function plantillaLabBorrador(semilla: string): BorradorSeccion[] {
  return [
    { id: `${semilla}-1`, nombre: "Parciales", porcentaje: 30, cantidad: 2 },
    { id: `${semilla}-2`, nombre: "Tareas", porcentaje: 12, cantidad: 3 },
    { id: `${semilla}-3`, nombre: "Semestral", porcentaje: 33, cantidad: 1 },
    {
      id: `${semilla}-4`,
      nombre: "Laboratorio",
      porcentaje: 25,
      cantidad: 0,
      profesorNombre: null,
      subsecciones: [
        { id: `${semilla}-4a`, nombre: "Parciales", porcentaje: 35, cantidad: 2 },
        { id: `${semilla}-4b`, nombre: "Informes", porcentaje: 30, cantidad: 3 },
        { id: `${semilla}-4c`, nombre: "Quices", porcentaje: 25, cantidad: 3 },
        { id: `${semilla}-4d`, nombre: "Asistencia", porcentaje: 10, cantidad: 1 },
      ],
    },
  ];
}

export type BorradorSubseccion = { id: string; nombre: string; porcentaje: number; cantidad: number };
export type BorradorSeccion = {
  id: string;
  nombre: string;
  porcentaje: number;
  cantidad: number;
  profesorNombre?: string | null;
  subsecciones?: BorradorSubseccion[];
};

// Notas vacías para una sección hoja.
function notasVacias(prefijo: string, cantidad: number): NotaUI[] {
  return Array.from({ length: cantidad }, (_, i) => ({
    id: `${prefijo}-n${i + 1}`,
    orden: i + 1,
    descripcion: null,
    puntaje: null,
    puntajeMax: 100,
  }));
}

function seccionHoja(id: string, nombre: string, porcentaje: number, cantidad: number, orden: number): SeccionUI {
  return { id, nombre, porcentaje, cantidad, orden, notas: notasVacias(id, cantidad) };
}

// Plantilla típica: el usuario ajusta, no arma desde cero.
export function plantillaInicial(): SeccionUI[] {
  return [
    seccionHoja("s1", "Parciales", 40, 2, 1),
    seccionHoja("s2", "Talleres", 30, 3, 2),
    seccionHoja("s3", "Examen final", 30, 1, 3),
  ];
}

// Plantilla "Materia con laboratorio" (Física, Química): el laboratorio es un
// bloque del 25% que se reparte internamente y suele impartirlo otro profesor.
export function plantillaConLaboratorio(): SeccionUI[] {
  return [
    seccionHoja("s1", "Parciales", 30, 2, 1),
    seccionHoja("s2", "Tareas", 12, 3, 2),
    seccionHoja("s3", "Semestral", 33, 1, 3),
    {
      id: "s4",
      nombre: "Laboratorio",
      porcentaje: 25,
      cantidad: 0,
      orden: 4,
      notas: [],
      profesorNombre: null,
      // Suman 100 ENTRE ELLAS (relativo al 25% del laboratorio).
      subsecciones: [
        seccionHoja("s4-a", "Parciales", 35, 2, 1),
        seccionHoja("s4-b", "Informes", 30, 3, 2),
        seccionHoja("s4-c", "Quices", 25, 3, 3),
        seccionHoja("s4-d", "Asistencia", 10, 1, 4),
      ],
    },
  ];
}

// Aplica cambios de esquema en memoria (versión local de la reconciliación que
// el servidor hace por Curso): sube cantidad → agrega notas vacías; baja →
// elimina desde el final solo las vacías; secciones nuevas se crean.
export function aplicarEsquema(secciones: SeccionUI[], borrador: BorradorSeccion[], semilla: number): SeccionUI[] {
  return borrador.map((b, idx) => {
    const orig = secciones.find((s) => s.id === b.id);
    let notas = orig ? orig.notas.slice() : [];
    if (b.cantidad > notas.length) {
      for (let o = notas.length + 1; o <= b.cantidad; o++) {
        notas.push({ id: `${b.id}-n${o}-${semilla}`, orden: o, descripcion: null, puntaje: null, puntajeMax: 100 });
      }
    } else if (b.cantidad < notas.length) {
      const aBorrar = new Set<string>();
      let restantes = notas.length;
      for (const n of [...notas].sort((a, c) => c.orden - a.orden)) {
        if (restantes <= b.cantidad) break;
        if (n.puntaje === null) {
          aBorrar.add(n.id);
          restantes -= 1;
        } else break;
      }
      notas = notas.filter((n) => !aBorrar.has(n.id));
    }
    notas = notas.map((n, i) => ({ ...n, orden: i + 1 }));
    return { id: b.id, nombre: b.nombre.trim(), porcentaje: b.porcentaje, cantidad: notas.length, orden: idx + 1, notas };
  });
}
