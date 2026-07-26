import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import AsistenteCalculadora from "./AsistenteCalculadora";

export default async function CalcularPage() {
  const session = await auth();
  if (session?.user) {
    redirect("/semestre");
  }

  const universidades = (
    await prisma.universidad.findMany({ select: { nombre: true }, orderBy: { nombre: "asc" } })
  ).map((u) => u.nombre);

  return <AsistenteCalculadora universidades={universidades} />;
}
