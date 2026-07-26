import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { esMarcadorDeElectiva, nombrePeriodo, ORDEN_PERIODO, periodoDeFecha, type TipoPeriodo } from "@/lib/calculos";
import { nombreTipoPeriodo, parseAnioPeriodo, parseTipoPeriodo } from "../periodo";
import ArmarSemestre, { type MateriaSugerida } from "./ArmarSemestre";

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
        prerequisitos: { select: { materiaRequeridaId: true } },
      },
      orderBy: [{ anio: "asc" }, { orden: "asc" }],
    }),
    prisma.curso.findMany({
      where: { perfilId: perfil.id },
      select: { materiaId: true, estado: true, creditos: true, periodo: { select: { anio: true, tipo: true } } },
    }),
  ]);

  const pensum = materiasPlan.filter((mp) => !esMarcadorDeElectiva(mp.materia.codigo));
  const aprobadas = new Set(cursos.filter((c) => c.estado === "APROBADO").map((c) => c.materiaId));
  const creditosAprobados = cursos
    .filter((c) => c.estado === "APROBADO")
    .reduce((a, c) => a + c.creditos, 0);
  const enPeriodo = new Set(
    cursos.filter((c) => c.periodo.anio === anio && c.periodo.tipo === tipo).map((c) => c.materiaId),
  );

  // Agrupa por posición del plan, en orden.
  type Grupo = { key: string; anio: number | null; periodo: TipoPeriodo | null; materias: typeof pensum };
  const mapa = new Map<string, Grupo>();
  for (const mp of pensum) {
    const key = `${mp.anio ?? "x"}:${mp.periodo ?? "x"}`;
    if (!mapa.has(key)) mapa.set(key, { key, anio: mp.anio, periodo: mp.periodo as TipoPeriodo | null, materias: [] });
    mapa.get(key)!.materias.push(mp);
  }
  const grupos = [...mapa.values()].sort((a, b) => {
    const aa = a.anio ?? 999,
      ba = b.anio ?? 999;
    if (aa !== ba) return aa - ba;
    return (a.periodo ? ORDEN_PERIODO[a.periodo] : 9) - (b.periodo ? ORDEN_PERIODO[b.periodo] : 9);
  });

  // Estima la posición: primer grupo cuyo acumulado de créditos supera lo
  // aprobado. Sin historial, el primer semestre del plan.
  let acumulado = 0;
  let grupoSugerido = grupos[0];
  for (const g of grupos) {
    const cr = g.materias.reduce((a, m) => a + m.creditos, 0);
    if (acumulado + cr > creditosAprobados) {
      grupoSugerido = g;
      break;
    }
    acumulado += cr;
    grupoSugerido = g;
  }

  const aMateria = (mp: (typeof pensum)[number], sugerida: boolean): MateriaSugerida => ({
    materiaPlanId: mp.id,
    codigo: mp.materia.codigo,
    nombre: mp.materia.nombre,
    creditos: mp.creditos,
    fundamental: mp.fundamental,
    sugerida,
    // Aviso suave: tiene prerequisitos que aún no apruebas.
    prereqPendiente: mp.prerequisitos.some((p) => !aprobadas.has(p.materiaRequeridaId)),
  });

  const disponible = (mp: (typeof pensum)[number]) => !aprobadas.has(mp.materiaId) && !enPeriodo.has(mp.materiaId);

  const sugeridas = (grupoSugerido?.materias ?? []).filter(disponible).map((mp) => aMateria(mp, true));
  const sugeridasIds = new Set(sugeridas.map((s) => s.materiaPlanId));
  const otras = pensum
    .filter((mp) => disponible(mp) && !sugeridasIds.has(mp.id))
    .map((mp) => aMateria(mp, false));

  const etiquetaGrupo = grupoSugerido?.anio
    ? `Año ${grupoSugerido.anio}${grupoSugerido.periodo ? ` · ${nombreTipoPeriodo(grupoSugerido.periodo)}` : ""}`
    : "tu plan";

  return (
    <section className="section_container max-w-2xl">
      <Link href={`/semestre?anio=${anio}&tipo=${tipo}`} className="text-16-medium text-blue-800 underline">
        ← Mi semestre
      </Link>
      <h1 className="text-30-bold mt-3 mb-1">Arma tu semestre</h1>
      <p className="text-16-medium text-black-300 mb-6">
        {nombrePeriodo(anio, tipo)} · te sugerimos {etiquetaGrupo} de tu plan. Quita lo que no lleves
        y agrega lo que falte.
      </p>
      <ArmarSemestre sugeridas={sugeridas} otras={otras} anio={anio} tipo={tipo} />
    </section>
  );
}
