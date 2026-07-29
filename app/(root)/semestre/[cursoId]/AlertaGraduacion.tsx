"use client";

import Link from "next/link";
import {
  APROBACION_FUNDAMENTAL,
  APROBACION_NORMAL,
  calcularEstadoMateria,
  habilitaGraduacion,
  proyectar,
} from "@/lib/calculos";
import { aEval, type SeccionUI } from "@/components/calculadora/tipos";

const toEval = aEval;

// ¿Hay al menos una nota registrada, contando las de laboratorio (subsecciones)?
function tieneAlgunaNota(secciones: SeccionUI[]): boolean {
  return secciones.some(
    (s) =>
      s.notas.some((n) => n.puntaje !== null) ||
      (s.subsecciones ?? []).some((sub) => sub.notas.some((n) => n.puntaje !== null)),
  );
}

// Alerta de bloqueo de graduación para una materia FUNDAMENTAL en curso. En la
// UTP, una fundamental aprobada con D deja avanzar pero no graduarse: hace falta
// C (71) o más. Es la alerta que llega a tiempo, cuando el estudiante todavía
// puede reaccionar. No reimplementa la lógica: usa habilitaGraduacion() sobre la
// nota mínima asegurada y la máxima alcanzable, y proyectar() para el número.
//
// Solo aplica a materias fundamentales con al menos una nota registrada; en
// cualquier otro caso no muestra nada.
export default function AlertaGraduacion({
  secciones,
  fundamental,
}: {
  secciones: SeccionUI[];
  fundamental: boolean;
}) {
  if (!fundamental) return null;

  if (!tieneAlgunaNota(secciones)) return null;

  const evaluaciones = toEval(secciones);
  const estado = calcularEstadoMateria(evaluaciones);

  // La C queda asegurada si el mínimo garantizado (nota actual, con 0 en lo que
  // falta) ya habilita graduación; sigue alcanzable si la máxima lo hace.
  const cAsegurada = habilitaGraduacion(estado.notaActual, fundamental);
  const cAlcanzable = habilitaGraduacion(estado.notaMaxima, fundamental);

  // ESTADO 3 — la C ya está asegurada.
  if (cAsegurada) {
    return (
      <div className="bg-verde-suave border-2 border-verde-fuerte/40 rounded-2xl p-4 shadow-suave">
        <p className="text-16-medium font-semibold !text-verde-fuerte">
          ✓ Ya tienes la C asegurada: esta materia no te bloquea la graduación.
        </p>
      </div>
    );
  }

  // ESTADO 1 — la C sigue alcanzable pero no asegurada.
  if (cAlcanzable) {
    const proy = proyectar(evaluaciones, APROBACION_FUNDAMENTAL);
    const necesaria = Math.ceil(proy.notaNecesaria ?? 0);
    return (
      <div className="bg-ambar-suave border-2 border-ambar-fuerte/40 rounded-2xl p-5 shadow-suave">
        <p className="text-20-medium font-bold !text-ambar-fuerte">⚠ Materia fundamental</p>
        <p className="text-16-medium mt-2">
          Con D apruebas y avanzas, pero no te gradúas. Necesitas{" "}
          <span className="font-bold tabular-nums">{necesaria}</span> de promedio en lo que falta
          para asegurar la <span className="font-bold">C</span>.
        </p>
      </div>
    );
  }

  // La C ya no es alcanzable. Solo es un bloqueo de graduación si al menos
  // aprobará (D): si ni siquiera puede aprobar, reprueba y repetirá por la F, no
  // por esta regla, así que aquí no se dice nada.
  if (estado.notaMaxima < APROBACION_NORMAL) return null;

  // ESTADO 2 — la C ya no es alcanzable, pero sí aprobar. Caso crítico.
  return (
    <div className="bg-rojo-suave border-2 border-rojo-fuerte/40 rounded-2xl p-5 shadow-suave">
      <p className="text-20-medium font-bold !text-rojo-fuerte">
        ⚠ Ya no puedes llegar a C en esta materia fundamental
      </p>
      <p className="text-16-medium mt-2">
        Aprobarás, pero tendrás que repetirla para poder graduarte.
      </p>
      <p className="text-14-normal !text-black mt-3">
        Mientras no la repitas, esa D aporta 0 puntos pero sus créditos sí cuentan en el
        denominador de tu índice. Un retiro no computa en el índice; una D sí, hasta que la
        repitas.
      </p>
      <p className="text-14-normal mt-3">
        <Link href="/carrera/repeticiones" className="!text-primary-ink underline font-semibold">
          Ver en el optimizador de repeticiones
        </Link>
      </p>
    </div>
  );
}
