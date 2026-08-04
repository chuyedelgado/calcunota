import Image from "next/image";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { calcularIndiceDesdeCursos } from "@/lib/indice";
import { calcularAvance } from "@/lib/avance";
import { esMarcadorDeElectiva, type Letra, type TipoPeriodo } from "@/lib/calculos";
import { cerrarSesion } from "../nav-actions";
import type { FacultadArbol } from "../onboarding/OnboardingForm";
import ContextoAcademicoForm from "./ContextoAcademicoForm";
import ObjetivoForm from "./ObjetivoForm";
import EliminarCuentaForm from "./EliminarCuentaForm";

export default async function PerfilPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/");
  }

  const perfil = await prisma.perfilEstudiante.findUnique({
    where: { userId: session.user.id },
    select: {
      id: true,
      anioIngreso: true,
      indiceObjetivo: true,
      planId: true,
      universidad: { select: { nombre: true, siglas: true } },
      plan: {
        select: {
          version: true,
          totalCreditos: true,
          carrera: {
            select: {
              id: true,
              nombre: true,
              facultad: { select: { id: true, nombre: true } },
            },
          },
        },
      },
    },
  });
  if (!perfil) {
    redirect("/onboarding");
  }

  // Árbol facultades → carreras → planes de la UTP para la cascada (igual que el
  // onboarding), y los cursos para proyectar el objetivo en vivo.
  const facultadesRaw = await prisma.facultad.findMany({
    where: { universidad: { siglas: "UTP" } },
    orderBy: { nombre: "asc" },
    select: {
      id: true,
      nombre: true,
      carreras: {
        orderBy: { nombre: "asc" },
        select: {
          id: true,
          nombre: true,
          grado: true,
          planes: {
            orderBy: { version: "desc" },
            select: {
              id: true,
              version: true,
              totalCreditos: true,
              vigente: true,
              _count: { select: { materias: true } },
            },
          },
        },
      },
    },
  });
  const facultades: FacultadArbol[] = facultadesRaw.map((f) => ({
    ...f,
    carreras: f.carreras.map((c) => ({
      ...c,
      planes: c.planes.map((p) => ({
        id: p.id,
        version: p.version,
        totalCreditos: p.totalCreditos,
        vigente: p.vigente,
        materias: p._count.materias,
      })),
    })),
  }));
  const cursos = await prisma.curso.findMany({
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
  });

  // Créditos aprobados para el "avance", con el MISMO criterio que /carrera: se
  // cuentan los REQUISITOS DEL PLAN cumplidos (con sus créditos del plan), no los
  // cursos. Ver lib/avance.ts: contar cursos hacía que una convalidación sumara
  // dos veces. Se comparte el helper para que las dos pantallas no diverjan.
  const materiasDelPlan = await prisma.materiaPlan.findMany({
    where: { planId: perfil.planId },
    select: { materiaId: true, creditos: true, materia: { select: { codigo: true } } },
  });
  const requeridas = materiasDelPlan
    .filter((mp) => !esMarcadorDeElectiva(mp.materia.codigo))
    .map((mp) => ({ materiaId: mp.materiaId, creditos: mp.creditos }));
  const { creditos: creditosAprobados } = calcularAvance(requeridas, cursos);

  const acumulado = calcularIndiceDesdeCursos(
    cursos.map((c) => ({
      id: c.id,
      materiaId: c.materiaId,
      creditos: c.creditos,
      notaFinal: c.notaFinal,
      letra: c.notaFinal === null ? (c.letraFinal as Letra | null) : null,
      periodo: { anio: c.periodo.anio, tipo: c.periodo.tipo as TipoPeriodo },
    })),
  );

  const anioActual = new Date().getFullYear();
  const usuario = session.user;

  return (
    <section className="section_container max-w-2xl">
      <h1 className="text-30-bold mb-6">Mi perfil</h1>

      {/* 1. Cuenta (solo lectura) */}
      <div className="tarjeta p-5 flex items-center gap-4">
        {usuario.image ? (
          <Image
            src={usuario.image}
            alt=""
            width={56}
            height={56}
            className="rounded-full border border-hairline shrink-0"
          />
        ) : (
          <span className="w-14 h-14 rounded-full bg-primary-100 flex items-center justify-center text-24-black !text-primary-ink shrink-0">
            {usuario.name?.[0]?.toUpperCase() ?? "?"}
          </span>
        )}
        <div className="min-w-0">
          {usuario.name && <p className="text-20-medium font-semibold text-tinta truncate">{usuario.name}</p>}
          {usuario.email && <p className="text-16-medium !text-black-300 truncate">{usuario.email}</p>}
        </div>
      </div>

      {/* 2. Contexto académico (editable) */}
      <div className="mt-8">
        <h2 className="text-20-medium font-semibold mb-1">Contexto académico</h2>
        <p className="text-14-normal !text-black-300 mb-4">
          {perfil.universidad.siglas} · {perfil.plan.carrera.nombre} · {perfil.plan.version}
        </p>
        <div className="tarjeta p-5">
          <ContextoAcademicoForm
            facultades={facultades}
            anioActual={anioActual}
            facultadIdInicial={perfil.plan.carrera.facultad.id}
            carreraIdInicial={perfil.plan.carrera.id}
            planIdInicial={perfil.planId}
            anioIngresoInicial={perfil.anioIngreso}
            creditosAprobados={creditosAprobados}
          />
        </div>
      </div>

      {/* 3. Índice objetivo (editable, con vista previa) */}
      <div className="mt-8">
        <h2 className="text-20-medium font-semibold mb-1">Índice objetivo</h2>
        <p className="text-14-normal !text-black-300 mb-4">
          La meta que usa la app para decirte qué te falta en toda la carrera.
        </p>
        <div className="tarjeta p-5">
          <ObjetivoForm
            objetivoInicial={perfil.indiceObjetivo}
            puntosActuales={acumulado.puntos}
            creditosActuales={acumulado.creditos}
            totalPlan={perfil.plan.totalCreditos}
          />
        </div>
      </div>

      {/* 4. Cerrar sesión */}
      <div className="mt-10 border-t border-hairline pt-6">
        <form action={cerrarSesion}>
          <button
            type="submit"
            className="text-16-medium font-semibold !text-rojo-fuerte hover:underline"
          >
            Cerrar sesión
          </button>
        </form>
      </div>

      {/* 5. Zona de peligro: eliminar cuenta y todos los datos */}
      <div className="mt-8">
        <EliminarCuentaForm />
      </div>
    </section>
  );
}
