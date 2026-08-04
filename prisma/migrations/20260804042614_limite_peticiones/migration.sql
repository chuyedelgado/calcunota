-- CreateTable
CREATE TABLE "LimitePeticiones" (
    "id" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "ventana" TIMESTAMP(3) NOT NULL,
    "conteo" INTEGER NOT NULL DEFAULT 1,
    "creado" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LimitePeticiones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LimitePeticiones_ventana_idx" ON "LimitePeticiones"("ventana");

-- CreateIndex
CREATE UNIQUE INDEX "LimitePeticiones_clave_accion_ventana_key" ON "LimitePeticiones"("clave", "accion", "ventana");
