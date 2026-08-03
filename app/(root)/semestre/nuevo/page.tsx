import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  esMarcadorDeElectiva,
  nombrePeriodo,
  notaALetra,
  ORDEN_PERIODO,
  periodoDeFecha,
  secuenciaDePeriodo,
  type CursoIndice,
  type Letra,
  type TipoPeriodo,
} from "@/lib/calculos";
import { parseAnioPeriodo, parseTipoPeriodo } from "../periodo";
import ArmarSemestre, { type MateriaArmar } from "./ArmarSemestre";

// Tamaño del bloque sugerido: el típico de un semestre del plan.
const OBJETIVO_CREDITOS = 18;
const MAX_CREDITOS = 22;
const MAX_MATERIAS = 6;

export default async function NuevoSemestrePage({
  searchParams,
}: {
  searchParams: Promise<{ anio?: string; tipo?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const perfil = await prisma.perfilEstudiante.findUnique({
    where: { userId: session.user.id },
    select: { id: true, planId: true },
  });
  if (!perfil) redirect("/onboarding");

  const actual = periodoDeFecha();
  const sp = await searchParams;
  const anio = sp.anio != null ? parseAnioPeriodo(sp.anio, actual.anio) : actual.anio;
  const tipo = sp.tipo != null ? parseTipoPeriodo(sp.tipo) : actual.tipo;

  const [materiasPlan, cursos] = await Promise.all([
    prisma.materiaPlan.findMany({
      where: { planId: perfil.planId },
      select: {
        id: true,
        materiaId: true,
        creditos: true,
        fundamental: true,
        anio: true,
        periodo: true,
        orden: true,
        materia: { select: { codigo: true, nombre: true } },
        prerequisitos: {
          select: { materiaRequeridaId: true, materiaRequerida: { select: { codigo: true } } },
        },
      },
      orderBy: [{ anio: "asc" }, { orden: "asc" }],
    }),
    prisma.curso.findMany({
      where: { perfilId: perfil.id },
      select: {
        id: true,
        materiaId: true,
        creditos: true,
        estado: true,
        notaFinal: true,
        letraFinal: true,
        periodo: { select: { anio: true, tipo: true } },
      },
    }),
  ]);

  const pensum = materiasPlan.filter((mp) => !esMarcadorDeElectiva(mp.materia.codigo));
  const pensumMateriaIds = new Set(pensum.map((mp) => mp.materiaId));

  // Estado de cada materia respecto al estudiante. "Aprobada" (estado APROBADO,
  // que ya deriva de letraAprueba al guardar) cumple prerequisitos: con una D se
  // avanza a las materias que dependen de ella.
  const aprobadas = new Set(cursos.filter((c) => c.estado === "APROBADO").map((c) => c.materiaId));
  const enCurso = new Set(cursos.filter((c) => c.estado === "EN_CURSO").map((c) => c.materiaId));
  const enPeriodo = new Set(
    cursos.filter((c) => c.periodo.anio === anio && c.periodo.tipo === tipo).map((c) => c.materiaId),
  );

  // Historial cerrado: da el índice de repetición y la última letra por materia.
  const cerrados = cursos.filter((c) => c.estado === "APROBADO" || c.estado === "REPROBADO");
  const historial: CursoIndice[] = cerrados.map((c) => ({
    id: c.id,
    materiaId: c.materiaId,
    creditos: c.creditos,
    notaFinal: c.notaFinal,
    letra: c.notaFinal === null ? (c.letraFinal as Letra | null) : null,
    secuencia: secuenciaDePeriodo(c.periodo.anio, c.periodo.tipo as TipoPeriodo),
  }));
  const tieneAvance = cerrados.length > 0;

  // Última letra de cada materia (el intento más reciente), para explicar el
  // efecto de repetir (una D se borra, una F se mantiene).
  const ultimaLetra = new Map<string, Letra | null>();
  const ultimaSeq = new Map<string, number>();
  for (const c of cerrados) {
    const seq = secuenciaDePeriodo(c.periodo.anio, c.periodo.tipo as TipoPeriodo);
    if (seq >= (ultimaSeq.get(c.materiaId) ?? -Infinity)) {
      ultimaSeq.set(c.materiaId, seq);
      ultimaLetra.set(c.materiaId, c.notaFinal !== null ? (notaALetra(c.notaFinal) as Letra) : (c.letraFinal as Letra | null));
    }
  }

  const estadoDe = (materiaId: string): MateriaArmar["estado"] =>
    aprobadas.has(materiaId) ? "aprobada" : enCurso.has(materiaId) ? "en_curso" : "pendiente";

  const aMateria = (mp: (typeof pensum)[number]): MateriaArmar => ({
    materiaPlanId: mp.id,
    materiaId: mp.materiaId,
    codigo: mp.materia.codigo,
    nombre: mp.materia.nombre,
    creditos: mp.creditos,
    fundamental: mp.fundamental,
    anioSugerido: mp.anio,
    periodoSugerido: mp.periodo as TipoPeriodo | null,
    estado: estadoDe(mp.materiaId),
    faltanPrereqs: mp.prerequisitos
      .filter((p) => !aprobadas.has(p.materiaRequeridaId))
      .map((p) => p.materiaRequerida.codigo),
    yaCursada: cerrados.some((c) => c.materiaId === mp.materiaId),
    ultimaLetra: ultimaLetra.get(mp.materiaId) ?? null,
  });

  // Candidatas al bloque: no aprobadas, no en curso, no ya en este periodo, y con
  // TODOS sus prerequisitos cumplidos. Aquí un Cálculo III con Cálculo II sin
  // aprobar queda fuera; un Cálculo II reprobado (prereqs cumplidos) entra.
  const posicion = (mp: (typeof pensum)[number]) =>
    (mp.anio ?? 99) * 100 + (mp.periodo ? ORDEN_PERIODO[mp.periodo as TipoPeriodo] : 9) * 10 + (mp.orden ?? 0);

  let bloque: typeof pensum;
  if (aprobadas.size === 0) {
    // Sin materias aprobadas no hay avance con qué medir prerequisitos: filtrar
    // por prereqs cumplidos solo dejaría las materias sin prereqs, dispersas por
    // todo el plan. Se cae a la regla anterior: el primer bloque curricular
    // (primer grupo año/periodo con créditos). La invitación a importar el
    // historial (abajo) es lo que lleva a la sugerencia precisa.
    const disponibles = pensum.filter(
      (mp) => !enPeriodo.has(mp.materiaId) && mp.anio != null && mp.periodo != null,
    );
    const porGrupo = new Map<number, typeof pensum>();
    for (const mp of disponibles) {
      const key = mp.anio! * 10 + ORDEN_PERIODO[mp.periodo as TipoPeriodo];
      const arr = porGrupo.get(key);
      if (arr) arr.push(mp);
      else porGrupo.set(key, [mp]);
    }
    const claves = [...porGrupo.keys()].sort((a, b) => a - b);
    const primera = claves.find((k) => porGrupo.get(k)!.some((m) => m.creditos > 0)) ?? claves[0];
    bloque = primera != null ? [...porGrupo.get(primera)!].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)) : [];
  } else {
    // Con avance: no aprobadas, no en curso, no ya en este periodo, y con TODOS
    // sus prerequisitos cumplidos. Aquí un Cálculo III con Cálculo II sin aprobar
    // queda fuera; un Cálculo II reprobado (prereqs cumplidos) entra. Se toma el
    // siguiente bloque coherente, del tamaño típico de un semestre del plan.
    const candidatas = pensum
      .filter(
        (mp) =>
          !aprobadas.has(mp.materiaId) &&
          !enCurso.has(mp.materiaId) &&
          !enPeriodo.has(mp.materiaId) &&
          mp.prerequisitos.every((p) => aprobadas.has(p.materiaRequeridaId)),
      )
      .sort((a, b) => posicion(a) - posicion(b));

    bloque = [];
    let creditos = 0;
    for (const mp of candidatas) {
      if (bloque.length >= MAX_MATERIAS) break;
      if (bloque.length > 0 && creditos + mp.creditos > MAX_CREDITOS) break;
      bloque.push(mp);
      creditos += mp.creditos;
      if (creditos >= OBJETIVO_CREDITOS) break;
    }
  }

  const bloqueIds = new Set(bloque.map((mp) => mp.id));
  const sugeridas = bloque.map(aMateria);
  // Buscables: el resto del plan que no está ya en este periodo, incluidas las
  // aprobadas/en curso (para poder repetir).
  const otras = pensum.filter((mp) => !bloqueIds.has(mp.id) && !enPeriodo.has(mp.materiaId)).map(aMateria);

  // Créditos de electiva del plan (marcadores) vs. lo que el estudiante ya cursó
  // fuera del plan. Aviso informativo si le faltan (aún no hay flujo para
  // agregarlas desde aquí).
  const creditosElectivaPlan = materiasPlan
    .filter((mp) => esMarcadorDeElectiva(mp.materia.codigo))
    .reduce((a, mp) => a + mp.creditos, 0);
  const creditosElectivaHechos = cursos
    .filter((c) => c.estado === "APROBADO" && !pensumMateriaIds.has(c.materiaId))
    .reduce((a, c) => a + c.creditos, 0);
  const electivas =
    creditosElectivaPlan > 0
      ? { plan: creditosElectivaPlan, faltan: Math.max(0, creditosElectivaPlan - creditosElectivaHechos) }
      : null;

  return (
    <section className="section_container max-w-2xl">
      <Link
        href={`/semestre?anio=${anio}&tipo=${tipo}`}
        className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 rounded-xl bg-primary-100 text-14-normal font-semibold !text-primary-ink hover:bg-primary/15 transition-colors"
      >
        <span aria-hidden="true">←</span> Volver a mi semestre
      </Link>
      <h1 className="text-30-bold mt-4 mb-1 text-tinta">Arma tu semestre</h1>
      <p className="text-16-medium text-black-300 mb-6">
        {nombrePeriodo(anio, tipo)} ·{" "}
        {sugeridas.length > 0
          ? "te sugerimos lo que te toca según tu avance. Quita lo que no lleves y agrega lo que falte."
          : "busca las materias que vas a llevar este periodo."}
      </p>
      <ArmarSemestre
        sugeridas={sugeridas}
        otras={otras}
        historial={historial}
        anio={anio}
        tipo={tipo}
        tieneAvance={tieneAvance}
        electivas={electivas}
      />
    </section>
  );
}
