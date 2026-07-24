import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import {
  nombrePeriodo,
  parseAnioPeriodo,
  parseTipoPeriodo,
  periodoDeFecha,
  periodosEnRango,
} from "@/lib/calculos";
import PeriodoSelector from "./PeriodoSelector";

export default async function SemestrePage({
  searchParams,
}: {
  searchParams: Promise<{ anio?: string; tipo?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/");
  }

  const perfil = await prisma.perfilEstudiante.findUnique({
    where: { userId: session.user.id },
    select: { id: true, anioIngreso: true },
  });
  if (!perfil) {
    redirect("/onboarding");
  }

  // Por defecto, el periodo actual del calendario de la UTP.
  const actual = periodoDeFecha();
  const sp = await searchParams;
  const anio = sp.anio != null ? parseAnioPeriodo(sp.anio, actual.anio) : actual.anio;
  const tipo = sp.tipo != null ? parseTipoPeriodo(sp.tipo) : actual.tipo;

  const cursos = await prisma.curso.findMany({
    where: { perfilId: perfil.id, periodo: { anio, tipo } },
    select: {
      id: true,
      creditos: true,
      fundamental: true,
      esRepeticion: true,
      estado: true,
      materia: { select: { codigo: true, nombre: true } },
      profesor: { select: { nombre: true } },
    },
    orderBy: { materia: { codigo: "asc" } },
  });

  // Opciones del selector: desde el ingreso (o antes, si el periodo elegido es
  // más antiguo) hasta el año próximo, en orden cronológico.
  const desde = Math.min(perfil.anioIngreso, anio, actual.anio);
  const periodos = periodosEnRango(desde, actual.anio + 1);
  const clave = `${anio}:${tipo}`;
  const query = `anio=${anio}&tipo=${tipo}`;

  return (
    <section className="section_container">
      <h1 className="text-30-bold text-center mb-2">Mi semestre</h1>
      <p className="text-16-medium text-center text-black-100 mb-8">
        {nombrePeriodo(anio, tipo)}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <PeriodoSelector periodos={periodos} clave={clave} />
        {cursos.length > 0 && (
          <Button asChild className="calcular_btn !text-[20px] !p-4">
            <Link href={`/semestre/agregar?${query}`}>Agregar materia</Link>
          </Button>
        )}
      </div>

      {cursos.length === 0 ? (
        <div className="max-w-2xl mx-auto text-center border-2 border-black rounded-2xl shadow-xl p-10">
          <p className="text-20-medium mb-6">
            Todavía no has agregado materias a este periodo.
          </p>
          <Button asChild className="calcular_btn">
            <Link href={`/semestre/agregar?${query}`}>Agregar mi primera materia</Link>
          </Button>
        </div>
      ) : (
        <ul className="max-w-3xl mx-auto space-y-4">
          {cursos.map((c) => (
            <li
              key={c.id}
              className="border-2 border-black rounded-2xl shadow-xl p-5 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
            >
              <div>
                <p className="text-20-medium font-semibold">{c.materia.nombre}</p>
                <p className="text-16-medium text-black-300">
                  {c.materia.codigo} · {c.creditos} créditos
                  {c.profesor ? ` · ${c.profesor.nombre}` : " · Sin profesor"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {c.fundamental && (
                  <span className="text-14-normal !text-white bg-blue-800 rounded-full px-3 py-1">
                    Fundamental
                  </span>
                )}
                {c.esRepeticion && (
                  <span className="text-14-normal !text-white bg-black rounded-full px-3 py-1">
                    Repetición
                  </span>
                )}
                <span className="text-14-normal !text-black bg-gray-200 rounded-full px-3 py-1">
                  {c.estado}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
