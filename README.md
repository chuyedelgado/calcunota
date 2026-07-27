# CalcuNota

Aplicación web para estudiantes universitarios de Panamá (UTP). Registra las
notas del semestre, calcula la nota ponderada actual, proyecta qué
calificaciones hacen falta para alcanzar un objetivo y da seguimiento al índice
acumulado a lo largo de toda la carrera.

El idioma del producto, la interfaz, los comentarios y los commits es
**español**.

## Qué hace

- **Calculadora de materia**: divide cada curso en secciones (parciales,
  talleres, final) con su porcentaje y calcula la nota actual y la que falta
  para aprobar o para cada letra.
- **Índice acumulado**: aplica las reglas de la UTP (escala 0–100 truncada,
  una F suma créditos al denominador, al repetir una D desaparece pero la F no).
- **Proyección de carrera**: con un índice objetivo, dice qué promedio hace
  falta en los créditos que quedan y si la meta sigue siendo alcanzable.
- **Optimizador de repeticiones**: qué materias conviene repetir y cuánto sube
  el índice.
- **Recomendaciones**: consejos accionables derivados de los datos reales del
  estudiante (nunca motivación genérica ni cifras inventadas).

## Stack

- Next.js 15 (App Router, React Server Components) + React 19 + TypeScript strict
- Tailwind CSS 3.4 + shadcn/ui
- NextAuth v5 (beta), proveedor Google (`auth.ts`), con `@auth/prisma-adapter`
- Prisma 7.9 + Postgres (Neon), con el driver adapter `@prisma/adapter-pg`
- Node 22 (vía nvm), npm

El motor de cálculo puro vive en `lib/calculos.ts` (aritmético, sin acceso a
datos) y es la fuente de verdad de todas las reglas académicas.

## Puesta en marcha local

Requisitos: Node 22 (`nvm use` respeta el `.nvmrc`) y una base Postgres
accesible (Neon o local).

```bash
# 1. Dependencias
nvm use
npm install

# 2. Variables de entorno
cp .env.example .env.local
#   Rellena DATABASE_URL, AUTH_SECRET (npx auth secret) y las credenciales de Google.

# 3. Base de datos (Prisma 7: generate y seed son pasos APARTE de migrate)
npx prisma migrate dev      # aplica las migraciones
npx prisma generate         # genera el cliente (migrate dev ya NO lo hace en v7)
npx prisma db seed          # carga la escala UTP + los 105 planes (no corre solo tras migrar)

# 4. Arrancar
npm run dev                 # http://localhost:3000
```

> **Prisma 7, particularidades**: el `url` de la base va en `prisma.config.ts`
> (no en el bloque `datasource` del schema); `PrismaClient` requiere el adapter;
> los scripts que se corren con `tsx` necesitan `import "dotenv/config"` como
> primera línea para que `DATABASE_URL` no llegue vacía.

## Scripts de npm

| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run start` | Sirve el build |
| `npm run lint` | ESLint (next/core-web-vitals + next/typescript) |

No hay script `test` todavía: `lib/calculos.ts` aún no tiene pruebas (deuda #1).

## Scripts de `prisma/`

Se ejecutan con `npx tsx prisma/<archivo>.ts`. Los que modifican datos simulan
por defecto y sólo escriben con `--aplicar`.

| Script | Para qué sirve |
|---|---|
| `seed.ts` | Carga la escala de notas de la UTP y los 105 planes desde `scraping_materias/planes.json` (usa `createMany` con `skipDuplicates`: agrega, no actualiza). |
| `verificar.ts` | Comprobaciones post-seed; los conteos se derivan de `planes.json`. La señal clave es "Carreras sin nombres variantes" en 0. |
| `marcar-vigencia.ts` | Marca como VIGENTE el plan más nuevo de cada carrera (los anteriores quedan como histórico). |
| `fusionar-carreras.ts` | Fusiona filas de carrera duplicadas por nombre. Usa `nombres-carreras.json` para el nombre canónico. |
| `corregir-nombres.ts` | Corrige la capitalización de los nombres ya guardados. |
| `nombres-carreras.json` | Overrides de nombre canónico que consume `fusionar-carreras.ts`. |

Pipeline completo tras recargar el catálogo:

```bash
npx prisma db seed
npx tsx prisma/marcar-vigencia.ts --aplicar    # plan más nuevo por carrera = VIGENTE
npx tsx prisma/fusionar-carreras.ts --aplicar  # colapsa carreras duplicadas por nombre
npx tsx prisma/marcar-vigencia.ts --aplicar    # obligatorio repetir tras fusionar
npx tsx prisma/corregir-nombres.ts --aplicar   # capitalización de nombres
npx tsx prisma/verificar.ts                    # confirma: 0 carreras con nombres variantes
```

> El seed no actualiza filas existentes. Para aplicar cambios del catálogo:
> `npx prisma migrate reset && npx prisma db seed` (destruye datos de usuario) o
> una migración de actualización.

## Regenerar los planes desde los PDFs

El catálogo de materias sale de los PDFs de planes de estudio de la UTP,
parseados por un scraper en Python.

```bash
cd scraping_materias
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python3 scrape_planes.py --entrada planes_de_estudio --salida planes.json --reporte
```

La salida (`planes.json`) es lo que consume `prisma/seed.ts`.

## Estructura

```
app/
  layout.tsx              root layout (<html lang="es">, fuente Work Sans)
  (root)/
    layout.tsx            <Navbar /> + {children}
    page.tsx              landing
    onboarding/           alta del perfil: facultad → carrera → plan → año
    perfil/               cuenta, contexto académico e índice objetivo (editables)
    semestre/             calculadora del semestre: agregar materia, capturar notas, cerrar
    historial/cargar/     carga del historial por letra
    carrera/              índice acumulado, avance y proyección
    carrera/repeticiones/ optimizador de repeticiones
    calcular/             calculadora pública (sin cuenta)
  api/auth/[...nextauth]/route.ts
components/               Navbar, ui/ (shadcn), calculadora/
lib/
  calculos.ts             motor de cálculo puro (reglas UTP; sin tests todavía)
  indice.ts               arma el índice desde los Curso de Prisma
  proyeccionCarrera.ts    proyección al índice objetivo
  recomendaciones.ts      motor de recomendaciones
  texto.ts                búsqueda y capitalización de nombres académicos
  prisma.ts               singleton del cliente
prisma/                   schema, migraciones, seed y scripts de mantenimiento
scraping_materias/        scraper de PDFs → planes.json
```

## Reglas académicas de la UTP

| Letra | Rango | Puntos |
|---|---|---|
| A | 91–100 | 3 |
| B | 81–90 | 2 |
| C | 71–80 | 1 |
| D | 61–70 | 0 |
| F | 60 o menos | 0 |

Índice = Σ(puntos × créditos) / Σ(créditos). Las notas se **truncan** (no se
redondean): 90.9 es B, no A. Aprobación: 61 (D) en materias normales, 71 (C) en
fundamentales. Las materias de 0 créditos se aprueban pero no entran al índice.
El detalle completo está en `lib/calculos.ts` y en `CLAUDE.md`.
