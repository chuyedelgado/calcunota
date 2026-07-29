// Formas de datos que comparten la página servidor, el Server Action y el
// componente cliente de la calculadora. Sólo tipos, sin runtime.

export type NotaData = {
  id: string;
  orden: number;
  descripcion: string | null;
  puntaje: number | null; // null = pendiente (no es cero)
  puntajeMax: number;
};

export type SeccionData = {
  id: string;
  nombre: string;
  porcentaje: number;
  cantidad: number;
  orden: number;
  notas: NotaData[];
  // Grupo con subsecciones (laboratorio): sin notas propias, con profesor
  // opcional del bloque. El porcentaje de cada subsección es relativo al padre.
  profesorNombre?: string | null;
  subsecciones?: SeccionData[];
};
