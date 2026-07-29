// Textos que explican las cifras del resumen de una materia. Un estudiante no
// interpreta solo "Nota actual" o "Exigencia"; estas notas viven aquí, en un
// solo lugar, y las consumen tanto el asistente público (/calcular) como la
// calculadora del usuario registrado (/semestre/[cursoId]).
//
// Se muestran con el popover accesible <Ayuda>.

export type Explicacion = { titulo: string; texto: string };

export const EXPLICACIONES = {
  notaActual: {
    titulo: "Nota actual",
    texto:
      "Los puntos que ya tienes asegurados de los 100 de la materia. No es tu " +
      "promedio: si vas por la mitad del semestre este número va a ser bajo aunque " +
      "te esté yendo bien, porque la otra mitad todavía no ha pasado.",
  },
  promedioActual: {
    titulo: "Promedio actual",
    texto:
      "Cómo te ha ido en lo que ya presentaste, sin contar lo que falta. Este se " +
      "parece más a la nota que esperarías si el resto te sale igual.",
  },
  notaMaxima: {
    titulo: "Nota máxima posible",
    texto:
      "Hasta dónde llegarías si sacaras el puntaje perfecto en todo lo que queda. " +
      "Si este número ya está por debajo de 71, la C dejó de ser alcanzable.",
  },
  asegurado: {
    titulo: "Asegurado",
    texto: "Puntos que ya nadie te quita, pase lo que pase en el resto del semestre.",
  },
  enJuego: {
    titulo: "En juego",
    texto: "Puntos que todavía puedes ganar o perder en las evaluaciones que faltan.",
  },
  perdido: {
    titulo: "Perdido",
    texto:
      "Puntos que ya no se pueden recuperar, de evaluaciones que ya presentaste. Es " +
      "lo que explica por qué tu nota máxima no llega a 100.",
  },
  metaSugerida: {
    titulo: "Meta sugerida",
    texto:
      "La nota que necesitas en esta evaluación para llegar a tu objetivo. El reparto " +
      "no es parejo a propósito: te pide más donde ya vienes rindiendo mejor y menos " +
      "donde te ha costado.",
  },
  exigencia: {
    titulo: "Exigencia",
    texto:
      "Compara la meta con el promedio que ya llevas en esa sección. 'En línea' " +
      "significa que te alcanza con seguir como vas.",
  },
} as const satisfies Record<string, Explicacion>;
