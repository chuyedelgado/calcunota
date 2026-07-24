/*
  Warnings:

  - You are about to drop the column `electiva` on the `MateriaPlan` table. All the data in the column will be lost.
  - You are about to drop the column `semestre` on the `MateriaPlan` table. All the data in the column will be lost.
  - You are about to drop the column `numero` on the `Periodo` table. All the data in the column will be lost.
  - You are about to drop the column `archivoPdf` on the `PlanEstudio` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[anio,tipo]` on the table `Periodo` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `notaAprobacionFundamental` to the `EscalaNotas` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tipo` to the `Periodo` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "TipoMateria" AS ENUM ('REGULAR', 'ELECTIVA', 'OPTATIVA');

-- CreateEnum
CREATE TYPE "PeriodoPlan" AS ENUM ('PRIMER_SEMESTRE', 'SEGUNDO_SEMESTRE', 'VERANO');

-- DropIndex
DROP INDEX "MateriaPlan_planId_semestre_idx";

-- DropIndex
DROP INDEX "Periodo_anio_numero_key";

-- AlterTable
ALTER TABLE "Curso" ADD COLUMN     "esRepeticion" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "fundamental" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "letraFinal" TEXT,
ADD COLUMN     "puntos" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "EscalaNotas" ADD COLUMN     "notaAprobacionFundamental" DOUBLE PRECISION NOT NULL;

-- AlterTable
ALTER TABLE "MateriaPlan" DROP COLUMN "electiva",
DROP COLUMN "semestre",
ADD COLUMN     "anio" INTEGER,
ADD COLUMN     "area" TEXT,
ADD COLUMN     "fundamental" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "horasClase" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "horasLaboratorio" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "laboratorioPagado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "orden" INTEGER,
ADD COLUMN     "periodo" "PeriodoPlan",
ADD COLUMN     "requisitoTexto" TEXT,
ADD COLUMN     "tipo" "TipoMateria" NOT NULL DEFAULT 'REGULAR';

-- AlterTable
ALTER TABLE "Periodo" DROP COLUMN "numero",
ADD COLUMN     "tipo" "PeriodoPlan" NOT NULL;

-- AlterTable
ALTER TABLE "PlanEstudio" DROP COLUMN "archivoPdf",
ADD COLUMN     "archivoOrigen" TEXT,
ADD COLUMN     "totalCreditos" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Prerequisito" (
    "id" TEXT NOT NULL,
    "materiaPlanId" TEXT NOT NULL,
    "materiaRequeridaId" TEXT NOT NULL,

    CONSTRAINT "Prerequisito_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Prerequisito_materiaPlanId_materiaRequeridaId_key" ON "Prerequisito"("materiaPlanId", "materiaRequeridaId");

-- CreateIndex
CREATE INDEX "MateriaPlan_planId_anio_periodo_idx" ON "MateriaPlan"("planId", "anio", "periodo");

-- CreateIndex
CREATE UNIQUE INDEX "Periodo_anio_tipo_key" ON "Periodo"("anio", "tipo");

-- AddForeignKey
ALTER TABLE "Prerequisito" ADD CONSTRAINT "Prerequisito_materiaPlanId_fkey" FOREIGN KEY ("materiaPlanId") REFERENCES "MateriaPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prerequisito" ADD CONSTRAINT "Prerequisito_materiaRequeridaId_fkey" FOREIGN KEY ("materiaRequeridaId") REFERENCES "Materia"("id") ON DELETE CASCADE ON UPDATE CASCADE;
