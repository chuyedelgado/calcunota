-- AlterTable
ALTER TABLE "Seccion" ADD COLUMN     "profesorId" TEXT,
ADD COLUMN     "seccionPadreId" TEXT;

-- CreateIndex
CREATE INDEX "Seccion_seccionPadreId_idx" ON "Seccion"("seccionPadreId");

-- AddForeignKey
ALTER TABLE "Seccion" ADD CONSTRAINT "Seccion_seccionPadreId_fkey" FOREIGN KEY ("seccionPadreId") REFERENCES "Seccion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Seccion" ADD CONSTRAINT "Seccion_profesorId_fkey" FOREIGN KEY ("profesorId") REFERENCES "Profesor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
