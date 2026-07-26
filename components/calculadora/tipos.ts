// Formas de datos de la captura de una materia, compartidas por la calculadora
// pública (sin sesión, sin persistencia) y la interna (persistida por Curso).

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
};

export type BorradorSeccion = { id: string; nombre: string; porcentaje: number; cantidad: number };

// Plantilla típica: el usuario ajusta, no arma desde cero.
export function plantillaInicial(): SeccionUI[] {
  const secc = (orden: number, nombre: string, porcentaje: number, cantidad: number): SeccionUI => ({
    id: `s${orden}`,
    nombre,
    porcentaje,
    cantidad,
    orden,
    notas: Array.from({ length: cantidad }, (_, i) => ({
      id: `s${orden}-n${i + 1}`,
      orden: i + 1,
      descripcion: null,
      puntaje: null,
      puntajeMax: 100,
    })),
  });
  return [secc(1, "Parciales", 40, 2), secc(2, "Talleres", 30, 3), secc(3, "Examen final", 30, 1)];
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
