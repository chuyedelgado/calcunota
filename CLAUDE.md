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
  seed.ts                           carga escala UTP + 105 planes (usa tituloMateria)
  verificar.ts                      comprobaciones post-seed (conteos derivados de planes.json)
  marcar-vigencia.ts                marca el plan más nuevo de cada carrera como VIGENTE
  corregir-nombres.ts               corrige capitalización de nombres ya guardados
  fusionar-carreras.ts              fusiona filas de carrera duplicadas por nombre
  nombres-carreras.json             overrides de nombre canónico para fusionar-carreras
scraping_materias/
  scrape_planes.py                  PDFs -> planes.json (créditos acotados + validación)
  planes.json                       salida del scraper
  planes_de_estudio/                105 PDFs de planes de la UTP (viejos + oferta 2025)
  pdfs-problematicos/               PDFs apartados (plantilla rota o duplicados)
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

## Índice y avance son dos cuentas distintas (no unificar)

Se parecen, se miden en créditos y a veces dan el mismo número. **No son lo
mismo y no comparten fórmula.**

| | Qué cuenta | Créditos de dónde | Dónde vive |
|---|---|---|---|
| **Índice** | cursos **con nota**, estén o no en el plan | del curso | `lib/calculos.ts` |
| **Avance** | **requisitos del plan** satisfechos | del **plan** | `lib/avance.ts` |

Una **convalidación** es lo que las separa: deja dos filas —la materia original
que el estudiante cursó de verdad fuera del pénsum (con nota) y la fila del plan
marcada como convalidada (W)—, pero es **una sola obligación cumplida**. Al
índice entra la original, porque tiene nota; al avance entra la del plan, una vez.

Ese era el fallo que arrastraba `/carrera` y `/perfil` hasta agosto de 2026:
sumaban los **cursos** en estado `APROBADO`, así que cada convalidación contaba
doble. Un expediente real daba **129 de 203** cuando lo correcto era **120**.

**Cuando los dos números coinciden, es casualidad.** En ese mismo expediente el
índice y el avance dan los dos 120, pero solo porque los créditos de cada
materia convalidada resultan iguales en el catálogo y en el plan. Con que una
sola difiera —ya pasó: Interacción Humano-Computador vale 3 en un plan y 4 en
otro— se separan y **ambos siguen siendo correctos**. No "simplificar" juntando
las dos cuentas porque den lo mismo: se rompen las dos a la vez.

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

Cargada con los 105 planes de la UTP (59 previos + la oferta académica 2025):

| Tabla | Filas |
|---|---|
| Facultad | 6 |
| Carrera | 64 |
| PlanEstudio | 105 |
| Materia | 2,014 |
| MateriaPlan | 6,076 |
| Prerequisito | 3,912 |

Un plan se apartó a `pdfs-problematicos/` (Seguridad Industrial e Higiene
Ocupacional 2025: PDF con plantilla distinta que el scraper parsea mal; la
carrera queda cubierta por su plan 2024-2). La carrera queda con **una** fila por
nombre: los planes viejo y nuevo de una misma carrera conviven como versiones
(el más reciente marcado VIGENTE, los anteriores histórico).

`verificar.ts` ya no tiene conteos fijos: los deriva de `planes.json`. Tras
fusionar carreras, su chequeo de "Carreras" queda por debajo del conteo del JSON
(la fusión es solo en base, no toca el JSON); la señal que importa es
"Carreras sin nombres variantes" en 0.

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
2. **Sesión en JWT, no en base (los usuarios SÍ persisten).** `auth.ts` conecta
   `PrismaAdapter(prisma)`: en el login se crean `User` y `Account` (el vínculo
   con Google) vía `createUser`/`linkAccount`. Lo único que NO va a la base es la
   **sesión**, que vive como JWT en cookie firmada (`session: { strategy: "jwt" }`),
   a propósito. Consecuencia práctica: eliminar un `User` arrastra en cascada su
   `PerfilEstudiante`, `Curso`, `Seccion`, `Nota` y `Account`. Si luego se agrega
   `middleware.ts`, Prisma no corre en runtime edge y hay que separar la config
   en `auth.config.ts`.
3. **Secretos a rotar.** Credenciales que estuvieron expuestas (`.env`,
   contraseña de MySQL del scraper legado) deben rotarse.
4. **Vulnerabilidades de npm.** Sanity ya se eliminó (bajó de ~74 a ~21). Cifras
   verificadas en la auditoría de agosto de 2026: **21 en total (2 críticas, 13
   altas, 4 moderadas, 2 bajas)**; 17 figuran como de producción, pero la mayoría
   son del toolchain de build que `npm audit` no sabe distinguir.
   - Las **2 críticas son de `@auth/core`/`next-auth` y NO son explotables aquí**:
     una es de `getToken()` con cabeceras `Bearer` (el código usa `auth()`, no
     `getToken()`), y las otras dos son del **proveedor Email**, que no se usa
     (solo Google). Van con Next 16 en septiembre, no antes.
   - Con superficie de runtime real solo queda **`sharp`** (CVEs heredadas de
     libvips), que interviene al optimizar los avatares remotos de Google.
   - `postcss`, `lodash`, `js-yaml`, `minimatch`, `glob`, `picomatch` y las de
     `@prisma/dev` son de build o de CLI: no llegan al servidor en ejecución.

   **No correr** `npm audit fix --force`: baja Prisma a 6.x y rompe el proyecto.
5. **Migración a Next 16 y salida de la beta de `next-auth` — septiembre de
   2026.** Van juntas. (a) Estamos en Next 15.5.21 (LTS de mantenimiento); el
   soporte de 15.x termina el **21-oct-2026**, así que subir a Next 16 es tarea
   de septiembre de 2026 (es migración real: `next lint` desaparece, hay codemods).
   (b) `next-auth` sigue en `5.0.0-beta.25`; existe `beta.32` (siete versiones de
   una línea beta, sin garantía de compatibilidad y seguiríamos en beta), así que
   **no se sube todavía**: se hace después del lanzamiento de la beta cerrada,
   junto con Next 16 y como **un solo cambio de auth a la vez**. El salto de Next
   15.5 ya tocó la capa de auth (arreglo del bypass por segment-prefetch), por eso
   no se encadena otro cambio de auth sin probar el login en navegador entre uno
   y otro.
6. **Los créditos los manda el cliente.** `guardarHistorial` y
   `guardarHistorialImportado` aceptan `creditos` y `fundamental` del cliente
   (validados 0-12) en vez de releerlos siempre del `MateriaPlan`. Hoy el impacto
   es **solo auto-infligido**: un estudiante puede inflar su propio índice y no
   afecta a nadie más. **Hay que arreglarlo ANTES del motor de estadísticas por
   profesor**: en cuanto esos `Curso` alimenten agregados compartidos, un dato
   inventado deja de ser problema de uno solo. La ruta con `materiaPlanId` ya
   relee del plan; falta forzarlo en la de `materiaId` suelto.
7. **Menor y cosmética: `nombreProfesor` y los apóstrofos.** No recapitaliza tras
   apóstrofo ni guion, así que `"Juan D'Angelo"` queda `"Juan D'angelo"` y
   `"Sáenz-Rodríguez"` queda `"Sáenz-rodríguez"`. Es preexistente y no afecta a
   búsquedas ni a cálculos (`normalizar()` iguala igual). Vive en `lib/texto.ts`,
   que es de solo lectura.
8. **CSP en Report-Only — hay un interruptor listo.** `next.config.ts` define
   `const CSP_OBLIGATORIA = false` (arriba del todo). En `false` la cabecera sale
   como `Content-Security-Policy-Report-Only`: el navegador **no bloquea nada**,
   solo reporta en consola. En `true` pasa a `Content-Security-Policy` a secas y
   además se añade `upgrade-insecure-requests` (en Report-Only el navegador lo
   ignora y solo mete ruido). **Es lo único que hay que cambiar**: no se toca la
   lista de directivas ni la de cabeceras.

   **Antes de ponerlo en `true`, navegar la app entera con la consola abierta y
   confirmar cero avisos de CSP** en: landing, login con Google (avatar de
   `googleusercontent`), onboarding, `/semestre`, calculadora, `/carrera`,
   `/perfil`, `/historial/importar` (subida de PDF), `/privacidad`, `/terminos` y
   las pantallas de error. Si aparece un aviso, la respuesta correcta es quitar
   la dependencia externa, no ensanchar la CSP — así se resolvió el `@import` de
   Google Fonts, que resultó ser peso muerto porque la fuente ya era local.

   Lo que **no** arregla el interruptor: quitar `'unsafe-inline'` de `script-src`
   exige nonces y por tanto `middleware.ts` (ver deuda #2 sobre el runtime edge).

## Próximos pasos, en orden

1. Tests de `lib/calculos.ts` (Vitest). Es el corazón del producto y hoy no está
   cubierto; hacerlo antes de construir la UI encima.
2. ~~Conectar `PrismaAdapter`~~ **Hecho**: `auth.ts` ya persiste `User`/`Account`
   (ver deuda #2). Lo que queda del lado de auth es, si se añade `middleware.ts`
   para proteger rutas, separar la config en `auth.config.ts` (Prisma no corre en
   runtime edge).
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

## Fase 3 — lanzamiento (beta)

Funciones nuevas **congeladas**. Las cuatro tareas para poder entregarle la app a
alguien más están **completas**:

1. **Privacidad y términos** — rutas `/privacidad` y `/terminos` (texto propio),
   enlazadas desde el pie (`components/Footer.tsx`) y el registro (onboarding).
2. **Eliminación de cuenta** — zona de peligro en `/perfil` con confirmación
   escrita; borra el `User` y en cascada todo su expediente (los `Profesor` son
   catálogo compartido y **no** se borran; el texto lo aclara). **Verificada** en
   desarrollo con cuenta desechable: la cuenta se eliminó, el conteo de `Profesor`
   se mantuvo, y al reingresar con la misma cuenta de Google se la trató como
   usuario nuevo (fue al onboarding).
3. **Manejo de errores** — `app/(root)/error.tsx`, `app/not-found.tsx` y
   `app/global-error.tsx` (red de último recurso con estilos en línea).
4. **Retroalimentación** — enlace a WhatsApp (`lib/reporte.ts`,
   `components/EnlaceReporte.tsx`) con mensaje prellenado (ruta + error, sin datos
   personales), en el pie y en las pantallas de error.

Lo que queda antes de la beta (fuera del código):

- **Agregar los usuarios de prueba en Google** (pantalla de consentimiento OAuth
  en modo prueba): sin esto solo el dueño del proyecto puede iniciar sesión.
- **Reclutar la beta** y abrir el grupo de WhatsApp.

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

Pipeline completo tras actualizar los PDFs (cada script simula sin `--aplicar`):

```bash
npx prisma db seed                        # createMany skipDuplicates: solo agrega
npx tsx prisma/marcar-vigencia.ts --aplicar   # plan más nuevo por carrera = VIGENTE
npx tsx prisma/fusionar-carreras.ts --aplicar # colapsa carreras duplicadas por nombre
npx tsx prisma/marcar-vigencia.ts --aplicar   # obligatorio tras fusionar
npx tsx prisma/corregir-nombres.ts --aplicar  # capitalización de nombres ya guardados
npx tsx prisma/verificar.ts                   # confirma: 0 carreras con nombres variantes
```

Si `fusionar-carreras` elige un nombre canónico malo, editar
`prisma/nombres-carreras.json` (`"CLAVE que imprime": "Nombre correcto"`) y
re-simular. `lib/calculos.ts`, `lib/recomendaciones.ts`, `lib/texto.ts`,
`scrape_planes.py`, `schema.prisma` y los scripts de `prisma/` son de solo
lectura: si uno falla, se reporta y se espera versión corregida.

## Reglas de trabajo

- No commitear `.env` ni secretos.
- El seed usa `createMany` con `skipDuplicates`, así que **no actualiza filas
  existentes**. Para aplicar cambios al catálogo hay que hacer
  `npx prisma migrate reset && npx prisma db seed` (destruye datos de usuario) o
  escribir una migración de actualización.
- Antes de refactors grandes, proponer el plan y esperar aprobación.
- Cambios en las reglas de cálculo requieren actualizar las pruebas de
  `lib/calculos.ts` (cuando existan; ver deuda #1).
