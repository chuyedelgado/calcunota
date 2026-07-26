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
};
