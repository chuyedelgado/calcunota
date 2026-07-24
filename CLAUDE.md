# CalcuNota

Aplicación web para estudiantes universitarios de Panamá. Registra notas del
semestre, calcula la nota ponderada actual, proyecta qué calificaciones hacen
falta para alcanzar un objetivo, y estima probabilidades de lograrlo según el
contexto (universidad, facultad, materia, profesor). También da seguimiento al
índice acumulado a lo largo de toda la carrera.

Idioma del producto, la UI, los comentarios y los commits: **español**.

## Stack

- Next.js 15.1.6 (App Router) + React 19 + TypeScript strict
- Tailwind CSS 3.4 + shadcn/ui
- NextAuth v5 beta, proveedor Google (`auth.ts`)
- **Prisma 7.9** + Postgres en Neon, con driver adapter `@prisma/adapter-pg`
- Node 22 vía nvm, npm
- Sanity instalado pero **sin usar** (schema vacío, fuera del camino crítico)

## Particularidades de Prisma 7 (importante)

Esta versión cambió cosas que rompen las recetas de v5/v6:

- El `url` **no va** en el bloque `datasource` del schema. Va en `prisma.config.ts`.
- `PrismaClient` requiere un driver adapter: `new PrismaClient({ adapter })`.
- `migrate dev` **ya no ejecuta** `prisma generate`. Hay que llamarlo aparte.
- El seed **no corre solo** tras migrar: `npx prisma db seed`.
- `@prisma/client` no exporta nada hasta que se corre `generate`. Si TypeScript
  dice "has no exported member 'PrismaClient'", falta generar.
- `next.config.ts` necesita `serverExternalPackages: ["@prisma/client", "pg"]`.
- Scripts que se ejecutan con `tsx` directamente necesitan `import "dotenv/config"`
  como primera línea; si no, `DATABASE_URL` llega vacía y da ECONNREFUSED.
  (`prisma.config.ts` ya lo hace en su primera línea.)

## Estructura

```
app/
  layout.tsx                        root layout: <html lang="es">/<body>, fuente Work Sans
  (root)/
    layout.tsx                      fragmento: <Navbar /> + {children}
    page.tsx                        landing
    calculadora/page.tsx            placeholder (índice de materias)
    calculadora/[id]/page.tsx       placeholder
    calculadora/[id]/formulario/    placeholder
  api/auth/[...nextauth]/route.ts
components/Navbar.tsx
lib/
  calculos.ts                       motor de cálculo (sin tests todavía)
  prisma.ts                         singleton del cliente
prisma/
  schema.prisma
  seed.ts                           carga escala UTP + 59 planes
  verificar.ts                      18 comprobaciones post-seed
scraping_materias/
  scrape_planes.py                  PDFs -> planes.json
  planes.json                       salida del scraper
  planes_de_estudio/                59 PDFs de planes de la UTP
```

## Reglas académicas de la UTP (fuente de verdad)

Escala 0-100:

| Letra | Rango | Puntos |
|---|---|---|
| A | 91-100 | 3 |
| B | 81-90 | 2 |
| C | 71-80 | 1 |
| D | 61-70 | 0 |
| F | 60 o menos | 0 |

**Índice** = Σ(puntos × créditos) / Σ(créditos)

Reglas que no son obvias y están implementadas en `lib/calculos.ts`:

1. **Una F suma sus créditos al denominador.** Reprobar 4 créditos mete esos 4
   créditos en la división con 0 puntos, así que arrastra el índice hacia abajo.
2. **Al repetir, una D anterior desaparece por completo** del cálculo. Se borra
   del numerador y del denominador.
3. **Una F nunca desaparece.** Al repetir conviven la F y el nuevo intento.
   Consecuencia: repetir una D rinde ~3x más índice que repetir una F.
4. **Aprobación: 61 (D) en materias normales, 71 (C) en fundamentales.** Con D en
   una fundamental el estudiante avanza a las siguientes materias pero no puede
   graduarse. Las fundamentales vienen marcadas con `**` en los PDFs y están en
   `MateriaPlan.fundamental`.
5. **Materias con 0 créditos no entran al índice.** Seminario de Inducción,
   cursos de nivelación, algunos requisitos de Inglés. Se aprueban pero no se
   califican en escala numérica: su `notaFinal` debe quedar en `null` y el
   `estado` en `APROBADO`. Nunca ponerles 100.
6. **Códigos marcador que no son materias:** 0676, 9979, 9980, 9981 aparecen como
   "MATERIAS ELECTIVAS" y son huecos del plan. No deben ofrecerse como curso.
   Usar `esMarcadorDeElectiva()`.

## Nota dentro de una materia

Una materia se divide en **secciones** (Parciales, Talleres, Final), cada una con
un porcentaje del total y una cantidad de notas previstas.

- `notaActual` = Σ (suma de notas obtenidas / cantidad total de notas) × porcentaje
- `porcentajeRestante` = Σ (porcentaje / cantidad) × notas pendientes
- `notaNecesaria` = (objetivo − notaActual) / porcentajeRestante

`Nota.puntaje` en `null` significa **pendiente**, no cero. Esa distinción es la
base de todo el cálculo de proyección.

Los porcentajes de las secciones de un curso deben sumar 100. Se valida en la
aplicación con `validarSecciones()`, no en la base.

## API de `lib/calculos.ts`

```
notaALetra(nota)                       -> "A" | "B" | ...
notaAPuntos(nota)                      -> 3 | 2 | 1 | 0
habilitaGraduacion(nota, fundamental)  -> boolean
esCalificable(creditos)                -> boolean
esMarcadorDeElectiva(codigo)           -> boolean

calcularIndice(cursos)                 -> { puntos, creditos, indice, excluidos, noCalificables }
simularRepeticion(cursos, curso, nota) -> { antes, despues, ganancia }

validarSecciones(secciones)            -> { valido, suma, diferencia }
calcularEstadoMateria(secciones)       -> { notaActual, porcentajeRestante, notaMaxima, promedioParcial }
proyectar(secciones, objetivo)         -> { alcanzable, yaAlcanzado, notaNecesaria, mensaje }
proyectarEscala(secciones, fundamental)-> proyecciones para aprobar / C / B / A
```

El módulo exporta además las constantes `ESCALA_UTP`, `APROBACION_NORMAL` (61) y
`APROBACION_FUNDAMENTAL` (71), y los helpers `notaARango()` y `cursosQueCuentan()`.

Todo trabaja en escala 0-100. `calcularIndice` deriva el orden cronológico del
campo `secuencia`, que sale de ordenar los `Periodo` por año y tipo.

## Estado de la base

Cargada y verificada con los 59 planes de la UTP:

| Tabla | Filas |
|---|---|
| Facultad | 6 |
| Carrera | 58 |
| PlanEstudio | 59 |
| Materia | 1,624 |
| MateriaPlan | 3,318 |
| Prerequisito | 2,394 |

Cero prerequisitos huérfanos: el grafo está completo y sirve para proyectar el
orden de materias de una carrera.

18 materias regulares no tienen `periodo` asignado y **es correcto**: 12 de
Sistemas Info. Gerencial (el PDF agrupa el I AÑO sin desglosar) y 6 de los planes
de aviación (nivelación previa al primer semestre).

## Deuda técnica

Los bugs de hidratación y navegación de la landing (layout con `<html>`/`<body>`
anidados, `lang="en"`, template literals rotos por comillas simples en
`page.tsx` y `Navbar.tsx`, imports muertos) **ya están resueltos** en el commit
`3226534`. No re-arreglar ni re-listar como pendientes.

Pendiente de verdad:

1. **`lib/calculos.ts` no tiene tests.** No hay Vitest/Jest ni script `test` en el
   repo. El motor es aritmético puro y es lo primero que debería cubrirse; los
   casos de las reglas UTP de arriba son la lista de pruebas natural.
2. **Auth no persiste.** `@auth/prisma-adapter` está instalado pero `auth.ts` no
   lo conecta: la sesión sigue siendo sólo un JWT en cookie y no hay usuarios en
   la base. Al añadir el adapter las sesiones pasan a base de datos; si luego se
   agrega `middleware.ts`, Prisma no corre en runtime edge y hay que separar la
   config en `auth.config.ts`.
3. **Secretos a rotar.** Credenciales que estuvieron expuestas (`.env`,
   contraseña de MySQL del scraper legado) deben rotarse.
4. **Vulnerabilidades de npm** que vienen de Sanity y `next-auth@beta`. **No
   correr** `npm audit fix --force`: rompe el proyecto.

## Próximos pasos, en orden

1. Tests de `lib/calculos.ts` (Vitest). Es el corazón del producto y hoy no está
   cubierto; hacerlo antes de construir la UI encima.
2. Conectar `PrismaAdapter` en `auth.ts` para que los usuarios persistan (ver
   deuda #2 sobre el runtime edge si se añade middleware).
3. Onboarding del perfil: elegir universidad → facultad → carrera → plan → año de
   ingreso. Crea `PerfilEstudiante`. Sin esto nada más funciona.
4. Agregar materia al semestre: elegir del plan, asignar profesor, definir
   secciones con sus porcentajes.
5. Pantalla de calculadora: captura de notas + `proyectarEscala()`. Es donde
   `lib/calculos.ts` rinde.
6. Dashboard del semestre: cursos activos, índice del periodo, alertas.
7. Proyección de carrera con el índice acumulado.

El motor de probabilidades va después, alimentado por los `Curso` cerrados que
generen los primeros usuarios. El esquema ya guarda profesor, periodo y nota final
desde el día uno para que ese histórico exista cuando haga falta.

## Comandos

```bash
npm run dev
npx prisma migrate dev --name <nombre>
npx prisma generate
npx prisma db seed
npx tsx prisma/verificar.ts
npx prisma studio
```

No hay script `test` todavía (ver deuda #1).

Regenerar los planes desde los PDFs:

```bash
cd scraping_materias && source .venv/bin/activate
python3 scrape_planes.py --entrada planes_de_estudio --salida planes.json --reporte
```

## Reglas de trabajo

- No commitear `.env` ni secretos.
- El seed usa `createMany` con `skipDuplicates`, así que **no actualiza filas
  existentes**. Para aplicar cambios al catálogo hay que hacer
  `npx prisma migrate reset && npx prisma db seed` (destruye datos de usuario) o
  escribir una migración de actualización.
- Antes de refactors grandes, proponer el plan y esperar aprobación.
- Cambios en las reglas de cálculo requieren actualizar las pruebas de
  `lib/calculos.ts` (cuando existan; ver deuda #1).
