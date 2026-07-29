import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { esCalificable, formatearNota, nombrePeriodo, type TipoPeriodo } from "@/lib/calculos";
import CalculadoraMateria from "./CalculadoraMateria";
import CierreCurso from "./CierreCurso";
import { marcarAprobada, reabrirCurso } from "./actions";
import type { SeccionData } from "./tipos";

export default async function CursoPage({ params }: { params: Promise<{ cursoId: string }> }) {
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

  const { cursoId } = await params;
  const curso = await prisma.curso.findUnique({
    where: { id: cursoId },
    select: {
      id: true,
      perfilId: true,
      materiaId: true,
      creditos: true,
      fundamental: true,
      estado: true,
      notaFinal: true,
      letraFinal: true,
      puntos: true,
      materia: { select: { codigo: true, nombre: true } },
      periodo: { select: { anio: true, tipo: true } },
      profesor: { select: { nombre: true } },
      secciones: {
        where: { seccionPadreId: null },
        orderBy: { orden: "asc" },
        select: {
          id: true,
          nombre: true,
          porcentaje: true,
          cantidad: true,
          orden: true,
          profesor: { select: { nombre: true } },
          notas: {
            orderBy: { orden: "asc" },
            select: { id: true, orden: true, descripcion: true, puntaje: true, puntajeMax: true },
          },
          subsecciones: {
            orderBy: { orden: "asc" },
            select: {
              id: true,
              nombre: true,
              porcentaje: true,
              cantidad: true,
              orden: true,
              notas: {
                orderBy: { orden: "asc" },
                select: { id: true, orden: true, descripcion: true, puntaje: true, puntajeMax: true },
              },
            },
          },
        },
      },
    },
  });

  // No basta con que el id exista: el curso debe ser del perfil de la sesión.
  if (!curso || curso.perfilId !== perfil.id) {
    notFound();
  }

  const periodoLabel = nombrePeriodo(curso.periodo.anio, curso.periodo.tipo as TipoPeriodo);

  const encabezado = (
    <header className="mb-6">
      {/* Navegación discreta, no acción primaria: dice a dónde va (no "Salir",
          que se confunde con cerrar sesión). Área táctil cómoda (44 px). */}
      <Link
        href="/semestre"
        className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 rounded-xl bg-primary-100 text-14-normal font-semibold !text-primary-ink hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors"
      >
        <svg
          viewBox="0 0 24 24"
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Volver a mi semestre
      </Link>

      {/* El nombre de la materia es el título; el resto son metadatos que no
          compiten. */}
      <h1 className="text-30-bold mt-4 text-tinta">{curso.materia.nombre}</h1>
      <p className="text-[14px] !text-black-300 mt-1.5">
        {curso.materia.codigo} · {curso.creditos} créditos
        {curso.profesor ? ` · ${curso.profesor.nombre}` : " · Sin profesor"} · {periodoLabel}
      </p>
      {curso.fundamental && (
        <span className="inline-flex items-center mt-3 text-[13px] font-semibold !text-ambar-fuerte bg-ambar-suave border border-ambar-fuerte/30 rounded-full px-3 py-1">
          Materia fundamental
        </span>
      )}
    </header>
  );

  // Materias sin créditos (seminario, nivelación): no hay calculadora.
  if (!esCalificable(curso.creditos)) {
    const aprobada = curso.estado === "APROBADO";
    return (
      <section className="section_container max-w-2xl">
        {encabezado}
        <div className="tarjeta p-6">
          <p className="text-16-medium">
            Esta materia no tiene créditos: es un requisito que se aprueba, pero no se califica en
            la escala numérica. No entra al índice.
          </p>
          {aprobada ? (
            <p className="text-20-medium font-bold !text-verde-fuerte mt-4">Aprobada ✓</p>
          ) : (
            <form action={marcarAprobada.bind(null, curso.id)} className="mt-5">
              <Button type="submit" className="calcular_btn w-full">
                Marcar como aprobada
              </Button>
            </form>
          )}
        </div>
      </section>
    );
  }

  // Curso ya cerrado (o retirado): resumen + reabrir para corregir.
  if (curso.estado !== "EN_CURSO") {
    return (
      <section className="section_container max-w-2xl">
        {encabezado}
        <div className="tarjeta p-6 space-y-4">
          {curso.estado === "RETIRADO" ? (
            <p className="text-20-medium font-bold">Materia retirada</p>
          ) : (
            <>
              <p className="text-30-bold leading-tight">
                {curso.notaFinal !== null ? formatearNota(curso.notaFinal) : "—"}
                {curso.letraFinal ? (
                  <span className="text-20-medium"> · {curso.letraFinal}</span>
                ) : null}
              </p>
              <p className="text-16-medium text-black-300">
                {curso.puntos} puntos · {curso.estado}
              </p>
              {curso.fundamental && curso.letraFinal === "D" && (
                <div className="bg-rojo-suave border-2 border-rojo-fuerte/40 rounded-xl p-4">
                  <p className="text-16-medium font-semibold">
                    <span className="!text-rojo-fuerte font-bold">⚠ Bloquea tu graduación.</span> Con
                    D en una materia fundamental avanzas, pero no puedes graduarte con ella hasta
                    subirla a C.
                  </p>
                </div>
              )}
            </>
          )}
          <form action={reabrirCurso.bind(null, curso.id)}>
            <button
              type="submit"
              className="w-full border-2 border-black/15 bg-white !text-tinta rounded-2xl py-3 text-16-medium font-semibold shadow-suave hover:border-primary/40 transition-colors"
            >
              Reabrir para corregir
            </button>
          </form>
        </div>
      </section>
    );
  }

  // Árbol de secciones: raíces con sus subsecciones (laboratorio) y el profesor
  // del bloque.
  const seccionesIniciales: SeccionData[] = curso.secciones.map((s) => ({
    id: s.id,
    nombre: s.nombre,
    porcentaje: s.porcentaje,
    cantidad: s.cantidad,
    orden: s.orden,
    notas: s.notas,
    ...(s.subsecciones.length > 0
      ? {
          profesorNombre: s.profesor?.nombre ?? null,
          subsecciones: s.subsecciones.map((sub) => ({
            id: sub.id,
            nombre: sub.nombre,
            porcentaje: sub.porcentaje,
            cantidad: sub.cantidad,
            orden: sub.orden,
            notas: sub.notas,
          })),
        }
      : {}),
  }));

  return (
    <section className="section_container max-w-2xl">
      {encabezado}
      <CalculadoraMateria
        cursoId={curso.id}
        fundamental={curso.fundamental}
        seccionesIniciales={seccionesIniciales}
      />
      <div className="mt-8">
        <CierreCurso
          cursoId={curso.id}
          fundamental={curso.fundamental}
          materiaId={curso.materiaId}
          creditos={curso.creditos}
          anio={curso.periodo.anio}
          tipo={curso.periodo.tipo as TipoPeriodo}
        />
      </div>
    </section>
  );
}
