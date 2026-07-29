import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  calcularIndice,
  letraAprueba,
  letraHabilitaGraduacion,
  nombrePeriodo,
  notaALetra,
  secuenciaDePeriodo,
  simularRepeticion,
  type CursoIndice,
  type Letra,
  type TipoPeriodo,
} from "@/lib/calculos";
import SimuladorRepeticiones, { type Repetible } from "./SimuladorRepeticiones";

// Notas representantes para simular "saca C / B / A" (letraAPuntos las mapea).
const NOTA_C = 71;
const NOTA_B = 81;
const NOTA_A = 91;

export default async function RepeticionesPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/");
  }
  const perfil = await prisma.perfilEstudiante.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!perfil) {
    redirect("/onboarding");
  }

  const cursos = await prisma.curso.findMany({
    where: { perfilId: perfil.id },
    select: {
      id: true,
      materiaId: true,
      creditos: true,
      fundamental: true,
      notaFinal: true,
      letraFinal: true,
      periodo: { select: { anio: true, tipo: true } },
      materia: { select: { codigo: true, nombre: true } },
    },
  });

  const cerrados = cursos.filter((c) => c.notaFinal !== null || c.letraFinal !== null);

  if (cerrados.length === 0) {
    return (
      <section className="section_container max-w-2xl">
        <Link
          href="/carrera"
          className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 rounded-xl bg-primary-100 text-14-normal font-semibold !text-primary-ink hover:bg-primary/15 transition-colors"
        >
          <span aria-hidden="true">←</span> Volver a mi carrera
        </Link>
        <h1 className="text-30-bold mt-4 mb-4 text-tinta">Repeticiones</h1>
        <div className="tarjeta p-6">
          <p className="text-16-medium">
            Carga tu historial primero. Con tus cursos cerrados aquí verás qué debes repetir para
            graduarte y qué te conviene repetir para subir el índice.
          </p>
        </div>
      </section>
    );
  }

  const letraEfectiva = (c: (typeof cerrados)[number]): Letra =>
    c.notaFinal !== null ? (notaALetra(c.notaFinal) as Letra) : (c.letraFinal as Letra);

  // CursoIndice[] de todo el historial cerrado.
  const base: CursoIndice[] = cerrados.map((c) => ({
    id: c.id,
    materiaId: c.materiaId,
    creditos: c.creditos,
    notaFinal: c.notaFinal,
    letra: c.notaFinal === null ? (c.letraFinal as Letra) : null,
    secuencia: secuenciaDePeriodo(c.periodo.anio, c.periodo.tipo as TipoPeriodo),
  }));
  const indiceActual = calcularIndice(base).indice;

  // Solo el intento MÁS RECIENTE de cada materia define su estado actual.
  const ultimoPorMateria = new Map<string, (typeof cerrados)[number]>();
  for (const c of cerrados) {
    const seq = secuenciaDePeriodo(c.periodo.anio, c.periodo.tipo as TipoPeriodo);
    const prev = ultimoPorMateria.get(c.materiaId);
    const prevSeq = prev ? secuenciaDePeriodo(prev.periodo.anio, prev.periodo.tipo as TipoPeriodo) : -1;
    if (seq > prevSeq) ultimoPorMateria.set(c.materiaId, c);
  }

  // Meta mínima para que repetir una F no baje el índice: sus puntos deben
  // igualar o superar el índice actual (A=3, B=2, C=1).
  const puntosNecesarios = Math.min(3, Math.max(1, Math.ceil(indiceActual - 1e-9)));
  const metaF: Letra = puntosNecesarios >= 3 ? "A" : puntosNecesarios === 2 ? "B" : "C";

  const obligatorias: Repetible[] = [];
  const opcionales: Repetible[] = [];

  for (const c of ultimoPorMateria.values()) {
    const letra = letraEfectiva(c);
    let clase: Repetible["clase"] | null = null;
    if (!letraAprueba(letra)) clase = "F";
    else if (!letraHabilitaGraduacion(letra, c.fundamental)) clase = "D_FUND";
    else if (letra === "D") clase = "D_OPC";
    if (!clase) continue;

    const ci = base.find((b) => b.id === c.id)!;
    const rep: Repetible = {
      cursoId: c.id,
      materiaId: c.materiaId,
      codigo: c.materia.codigo,
      nombre: c.materia.nombre,
      creditos: c.creditos,
      periodoLabel: nombrePeriodo(c.periodo.anio, c.periodo.tipo as TipoPeriodo),
      letraActual: letra,
      clase,
      gananciaC: simularRepeticion(base, ci, NOTA_C).ganancia,
      gananciaB: simularRepeticion(base, ci, NOTA_B).ganancia,
      gananciaA: simularRepeticion(base, ci, NOTA_A).ganancia,
      metaF: clase === "F" ? metaF : null,
    };
    if (clase === "D_OPC") opcionales.push(rep);
    else obligatorias.push(rep);
  }

  // Opcionales por conveniencia: ordena por ganancia asumiendo A, descendente.
  opcionales.sort((a, b) => b.gananciaA - a.gananciaA);

  return (
    <section className="section_container max-w-2xl">
      <Link
        href="/carrera"
        className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 rounded-xl bg-primary-100 text-14-normal font-semibold !text-primary-ink hover:bg-primary/15 transition-colors"
      >
        <span aria-hidden="true">←</span> Volver a mi carrera
      </Link>
      <h1 className="text-30-bold mt-4 mb-1 text-tinta">Repeticiones</h1>
      <p className="text-16-medium text-black-300 mb-6">
        El efecto en tu índice. Repetir cuesta tiempo y dinero; tú decides lo opcional.
      </p>
      <SimuladorRepeticiones
        indiceActual={indiceActual}
        base={base}
        obligatorias={obligatorias}
        opcionales={opcionales}
      />
    </section>
  );
}
