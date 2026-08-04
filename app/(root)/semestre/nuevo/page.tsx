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

// El bloque sugerido sale de la composición REAL del plan, no de un rango fijo de
// créditos. Este tope solo aplica al caso raro de materias del plan sin año ni
// periodo asignado (18 en toda la base), donde no hay grupo curricular al que
// atenerse y hay que cortar por algo.
const MAX_SUELTAS = 6;

export default async function NuevoSemestrePage({
  searchParams,
}: {
  searchParams: Promise<{ anio?: string; tipo?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const perfil = await prisma.perfilEstudiante.findUnique({
    where: { userId: session.user.id },
    select: { id: true, planId: true, universidadId: true },
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

  // Materias que el estudiante ya intentó alguna vez (cualquier estado). Sirve
  // para distinguir una rezagada que reprobó —urgente, va en el bloque— de una
  // que nunca cursó, que va aparte.
  const intentadas = new Set(cursos.map((c) => c.materiaId));

  // Grupo curricular (año, periodo) de una materia del plan. `null` en las 18
  // materias de la base que no tienen año ni periodo asignado.
  const grupoDe = (mp: (typeof pensum)[number]): number | null =>
    mp.anio == null || mp.periodo == null ? null : mp.anio * 10 + ORDEN_PERIODO[mp.periodo as TipoPeriodo];

  // Cuántas materias del plan quedan bloqueadas por una materia sin aprobar:
  // las que la tienen como prerequisito directo y todavía no están aprobadas.
  const bloqueadasPor = (materiaId: string): string[] =>
    pensum
      .filter(
        (mp) =>
          !aprobadas.has(mp.materiaId) &&
          mp.materiaId !== materiaId &&
          mp.prerequisitos.some((p) => p.materiaRequeridaId === materiaId),
      )
      .map((mp) => mp.materia.codigo);

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
    rezagada: false,
    bloquea: [],
  });

  // Candidatas al bloque: no aprobadas, no en curso, no ya en este periodo, y con
  // TODOS sus prerequisitos cumplidos. Aquí un Cálculo III con Cálculo II sin
  // aprobar queda fuera; un Cálculo II reprobado (prereqs cumplidos) entra.
  const posicion = (mp: (typeof pensum)[number]) =>
    (mp.anio ?? 99) * 100 + (mp.periodo ? ORDEN_PERIODO[mp.periodo as TipoPeriodo] : 9) * 10 + (mp.orden ?? 0);

  let bloque: typeof pensum;
  // Materias de grupos anteriores a la frontera: las que ya intentó entran al
  // bloque, las que nunca cursó se muestran aparte.
  const rezagadasIntentadas: typeof pensum = [];
  const rezagadasNuevas: typeof pensum = [];
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

    // FRONTERA: el grupo (año, periodo) más avanzado donde el estudiante ya tiene
    // algo aprobado o en curso. Es dónde está de verdad, derivado de sus datos y
    // sin números mágicos.
    //
    // Sin frontera el bloque lo decidía el grupo cursable MÁS TEMPRANO, y un solo
    // hueco viejo lo secuestraba: un estudiante de año 3 con un Pre-cálculo de
    // año 1 sin cursar recibía "tu semestre: 1 materia de 0 créditos".
    let frontera = -1;
    for (const mp of pensum) {
      if (!aprobadas.has(mp.materiaId) && !enCurso.has(mp.materiaId)) continue;
      const g = grupoDe(mp);
      if (g != null && g > frontera) frontera = g;
    }

    // El bloque sigue la composición REAL del semestre del plan, no un rango fijo
    // de créditos: el grupo más temprano DESDE LA FRONTERA que todavía tenga
    // materias cursables, sugerido ENTERO. Un plan que pone 6 materias y 23
    // créditos en un semestre debe sugerir esas 6.
    const porGrupo = new Map<number, typeof pensum>();
    const sueltas: typeof pensum = [];
    for (const mp of candidatas) {
      const g = grupoDe(mp);
      if (g == null) {
        sueltas.push(mp);
        continue;
      }
      if (g < frontera) {
        // Rezagada. Si ya la intentó y no la aprobó, repetirla es lo más urgente
        // que puede hacer: entra al bloque marcada. Si nunca la cursó, se queda
        // fuera y se avisa aparte — meterla sin avisar arma semestres imposibles.
        if (intentadas.has(mp.materiaId)) rezagadasIntentadas.push(mp);
        else rezagadasNuevas.push(mp);
        continue;
      }
      const arr = porGrupo.get(g);
      if (arr) arr.push(mp);
      else porGrupo.set(g, [mp]);
    }
    const claves = [...porGrupo.keys()].sort((a, b) => a - b);
    const base = claves.length > 0 ? porGrupo.get(claves[0])! : sueltas.slice(0, MAX_SUELTAS);
    bloque = [...rezagadasIntentadas, ...base];
  }

  // Catálogo de profesores de la universidad, para el combobox de cada materia.
  const profesores = (
    await prisma.profesor.findMany({
      where: { universidadId: perfil.universidadId },
      select: { nombre: true },
      orderBy: { nombre: "asc" },
    })
  ).map((p) => p.nombre);

  const bloqueIds = new Set(bloque.map((mp) => mp.id));
  const idsRezagadasIntentadas = new Set(rezagadasIntentadas.map((mp) => mp.id));
  const sugeridas = bloque.map((mp) => {
    const rezagada = idsRezagadasIntentadas.has(mp.id);
    return { ...aMateria(mp), rezagada, bloquea: rezagada ? bloqueadasPor(mp.materiaId) : [] };
  });

  // Rezagadas que nunca cursó: fuera del bloque, pero visibles. Se ordenan por
  // cuántas materias del plan están bloqueando, porque una que corta el avance
  // no es una pendiente suelta: es la que hay que resolver primero.
  const rezagadas = rezagadasNuevas
    .map((mp) => ({ ...aMateria(mp), rezagada: true, bloquea: bloqueadasPor(mp.materiaId) }))
    .sort((a, b) => b.bloquea.length - a.bloquea.length);
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
        rezagadas={rezagadas}
        otras={otras}
        historial={historial}
        profesores={profesores}
        anio={anio}
        tipo={tipo}
        tieneAvance={tieneAvance}
        electivas={electivas}
      />
    </section>
  );
}
