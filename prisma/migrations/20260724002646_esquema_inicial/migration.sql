-- CreateEnum
CREATE TYPE "Grado" AS ENUM ('TECNICO', 'LICENCIATURA', 'INGENIERIA', 'MAESTRIA', 'DOCTORADO');

-- CreateEnum
CREATE TYPE "EstadoCurso" AS ENUM ('EN_CURSO', 'APROBADO', 'REPROBADO', 'RETIRADO');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Universidad" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "siglas" TEXT NOT NULL,
    "pais" TEXT NOT NULL DEFAULT 'PA',
    "sitioWeb" TEXT,
    "escalaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Universidad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EscalaNotas" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "notaMinima" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notaMaxima" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "notaAprobacion" DOUBLE PRECISION NOT NULL,
    "indiceMaximo" DOUBLE PRECISION NOT NULL DEFAULT 3.0,

    CONSTRAINT "EscalaNotas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RangoNota" (
    "id" TEXT NOT NULL,
    "escalaId" TEXT NOT NULL,
    "letra" TEXT NOT NULL,
    "desde" DOUBLE PRECISION NOT NULL,
    "hasta" DOUBLE PRECISION NOT NULL,
    "puntos" DOUBLE PRECISION NOT NULL,
    "aprueba" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RangoNota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Facultad" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "siglas" TEXT,
    "universidadId" TEXT NOT NULL,

    CONSTRAINT "Facultad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Carrera" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "grado" "Grado" NOT NULL,
    "facultadId" TEXT NOT NULL,

    CONSTRAINT "Carrera_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanEstudio" (
    "id" TEXT NOT NULL,
    "carreraId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "vigente" BOOLEAN NOT NULL DEFAULT true,
    "archivoPdf" TEXT,

    CONSTRAINT "PlanEstudio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Materia" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "universidadId" TEXT NOT NULL,

    CONSTRAINT "Materia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MateriaPlan" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "materiaId" TEXT NOT NULL,
    "semestre" INTEGER NOT NULL,
    "creditos" INTEGER NOT NULL DEFAULT 3,
    "electiva" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MateriaPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profesor" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "universidadId" TEXT NOT NULL,
    "facultadId" TEXT,
    "verificado" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Profesor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerfilEstudiante" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "universidadId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "anioIngreso" INTEGER NOT NULL,
    "indiceObjetivo" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerfilEstudiante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Periodo" (
    "id" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "numero" INTEGER NOT NULL,
    "inicio" TIMESTAMP(3),
    "fin" TIMESTAMP(3),

    CONSTRAINT "Periodo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Curso" (
    "id" TEXT NOT NULL,
    "perfilId" TEXT NOT NULL,
    "materiaId" TEXT NOT NULL,
    "periodoId" TEXT NOT NULL,
    "profesorId" TEXT,
    "estado" "EstadoCurso" NOT NULL DEFAULT 'EN_CURSO',
    "objetivo" DOUBLE PRECISION,
    "notaFinal" DOUBLE PRECISION,
    "creditos" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Curso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Seccion" (
    "id" TEXT NOT NULL,
    "cursoId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "porcentaje" DOUBLE PRECISION NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Seccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Nota" (
    "id" TEXT NOT NULL,
    "seccionId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "descripcion" TEXT,
    "puntaje" DOUBLE PRECISION,
    "puntajeMax" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "fecha" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Nota_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "Universidad_siglas_key" ON "Universidad"("siglas");

-- CreateIndex
CREATE UNIQUE INDEX "RangoNota_escalaId_letra_key" ON "RangoNota"("escalaId", "letra");

-- CreateIndex
CREATE UNIQUE INDEX "Facultad_universidadId_nombre_key" ON "Facultad"("universidadId", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Carrera_facultadId_nombre_grado_key" ON "Carrera"("facultadId", "nombre", "grado");

-- CreateIndex
CREATE UNIQUE INDEX "PlanEstudio_carreraId_version_key" ON "PlanEstudio"("carreraId", "version");

-- CreateIndex
CREATE INDEX "Materia_nombre_idx" ON "Materia"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Materia_universidadId_codigo_key" ON "Materia"("universidadId", "codigo");

-- CreateIndex
CREATE INDEX "MateriaPlan_planId_semestre_idx" ON "MateriaPlan"("planId", "semestre");

-- CreateIndex
CREATE UNIQUE INDEX "MateriaPlan_planId_materiaId_key" ON "MateriaPlan"("planId", "materiaId");

-- CreateIndex
CREATE INDEX "Profesor_nombre_idx" ON "Profesor"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Profesor_universidadId_nombre_key" ON "Profesor"("universidadId", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "PerfilEstudiante_userId_key" ON "PerfilEstudiante"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Periodo_anio_numero_key" ON "Periodo"("anio", "numero");

-- CreateIndex
CREATE INDEX "Curso_materiaId_profesorId_estado_idx" ON "Curso"("materiaId", "profesorId", "estado");

-- CreateIndex
CREATE INDEX "Curso_perfilId_periodoId_idx" ON "Curso"("perfilId", "periodoId");

-- CreateIndex
CREATE UNIQUE INDEX "Curso_perfilId_materiaId_periodoId_key" ON "Curso"("perfilId", "materiaId", "periodoId");

-- CreateIndex
CREATE INDEX "Seccion_cursoId_idx" ON "Seccion"("cursoId");

-- CreateIndex
CREATE INDEX "Nota_seccionId_idx" ON "Nota"("seccionId");

-- CreateIndex
CREATE UNIQUE INDEX "Nota_seccionId_orden_key" ON "Nota"("seccionId", "orden");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Universidad" ADD CONSTRAINT "Universidad_escalaId_fkey" FOREIGN KEY ("escalaId") REFERENCES "EscalaNotas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RangoNota" ADD CONSTRAINT "RangoNota_escalaId_fkey" FOREIGN KEY ("escalaId") REFERENCES "EscalaNotas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Facultad" ADD CONSTRAINT "Facultad_universidadId_fkey" FOREIGN KEY ("universidadId") REFERENCES "Universidad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Carrera" ADD CONSTRAINT "Carrera_facultadId_fkey" FOREIGN KEY ("facultadId") REFERENCES "Facultad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanEstudio" ADD CONSTRAINT "PlanEstudio_carreraId_fkey" FOREIGN KEY ("carreraId") REFERENCES "Carrera"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Materia" ADD CONSTRAINT "Materia_universidadId_fkey" FOREIGN KEY ("universidadId") REFERENCES "Universidad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MateriaPlan" ADD CONSTRAINT "MateriaPlan_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlanEstudio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MateriaPlan" ADD CONSTRAINT "MateriaPlan_materiaId_fkey" FOREIGN KEY ("materiaId") REFERENCES "Materia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Profesor" ADD CONSTRAINT "Profesor_universidadId_fkey" FOREIGN KEY ("universidadId") REFERENCES "Universidad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Profesor" ADD CONSTRAINT "Profesor_facultadId_fkey" FOREIGN KEY ("facultadId") REFERENCES "Facultad"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerfilEstudiante" ADD CONSTRAINT "PerfilEstudiante_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerfilEstudiante" ADD CONSTRAINT "PerfilEstudiante_universidadId_fkey" FOREIGN KEY ("universidadId") REFERENCES "Universidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerfilEstudiante" ADD CONSTRAINT "PerfilEstudiante_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlanEstudio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Curso" ADD CONSTRAINT "Curso_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES "PerfilEstudiante"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Curso" ADD CONSTRAINT "Curso_materiaId_fkey" FOREIGN KEY ("materiaId") REFERENCES "Materia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Curso" ADD CONSTRAINT "Curso_periodoId_fkey" FOREIGN KEY ("periodoId") REFERENCES "Periodo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Curso" ADD CONSTRAINT "Curso_profesorId_fkey" FOREIGN KEY ("profesorId") REFERENCES "Profesor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Seccion" ADD CONSTRAINT "Seccion_cursoId_fkey" FOREIGN KEY ("cursoId") REFERENCES "Curso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nota" ADD CONSTRAINT "Nota_seccionId_fkey" FOREIGN KEY ("seccionId") REFERENCES "Seccion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
