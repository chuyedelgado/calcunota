# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es CalcuNota

Aplicación web que permite a un estudiante saber si todavía puede aprobar una materia: introduce las secciones de evaluación (parciales, laboratorios, proyecto…), su peso porcentual y las notas ya obtenidas, y la app calcula la nota actual, el porcentaje que queda por evaluar y qué promedio necesita en lo que resta para alcanzar un objetivo. Las materias provienen de los planes de estudio de la UTP (Universidad Tecnológica de Panamá).

La interfaz y los comentarios del código están en español. Mantén ese idioma en el copy de la UI.

## Estado del repositorio

**Importante para orientarse**: el proyecto está en fase inicial y no debe leerse como una app terminada.

- La calculadora **no está implementada**. `app/(root)/calculadora/[id]/page.tsx` y `.../formulario/page.tsx` son stubs que devuelven un `<h1>`.
- La lógica de negocio real existe sólo como script CLI en `logica-en-python.py`, sin portar a TypeScript.
- **Sanity está instalado pero vacío y sin usar**: `sanity/schemaTypes/index.ts` exporta `types: []`, y ni `client` ni `sanityFetch` se importan desde ningún componente. No asumas que Sanity es la capa de datos — es una decisión abierta (`.vscode/extensions.json` recomienda la extensión de Prisma, señal de que se barajó una BD relacional).
- Sólo la landing y el login con Google funcionan de extremo a extremo.

## Comandos

Node se gestiona con nvm (`.nvmrc` → Node 22). Si `node` no está en el PATH, ejecuta `nvm use` primero.

```bash
npm run dev      # servidor de desarrollo → http://localhost:3000
npm run build    # build de producción
npm run start    # sirve el build
npm run lint     # ESLint (next/core-web-vitals + next/typescript)
npx tsc --noEmit # typecheck (no hay script dedicado)
```

**No hay tests ni infraestructura de testing** — ni Jest, ni Vitest, ni Playwright, ni script `test`, ni CI. Si vas a añadir tests, Vitest es lo que encaja con el stack; empieza por la lógica de cálculo, que es puramente aritmética.

Rutas de interés al probar: `/` (landing), `/calculadora/<id>` (stub), `/studio` (Sanity Studio embebido).

### Scraping de materias (Python, fuera de la app)

`scraping_materias/scraping_subjects_python.py` extrae códigos y nombres de asignatura de los 59 PDFs en `scraping_materias/planes_de_estudio/` con `pdfplumber` y los inserta en una tabla `subjects` de un MySQL local (`calcunota_db`). Se ejecuta a mano con el venv en `scraping_materias/scraping/`. La app Next **no** se conecta a esa base de datos.

## Arquitectura

### Rutas (App Router)

Dos layouts raíz conviven: `app/layout.tsx` (fuente local Work Sans, metadata) y `app/(root)/layout.tsx` (Navbar). El grupo `(root)` agrupa el sitio público; `/studio` queda fuera de él para que el Sanity Studio no herede el Navbar.

Flujo previsto de la calculadora, aún sin construir:
`/` → `/calculadora/[id]` → `/calculadora/[id]/formulario` → resultado.

### Autenticación

NextAuth v5 (beta) con Google como único proveedor, configurado en `auth.ts`. Sin `adapter` y sin `callbacks`: **la sesión es un JWT en cookie y no hay usuarios en base de datos**. No existen roles ni ningún tipo de permisos.

`components/Navbar.tsx` es un Server Component `async` que llama `await auth()` y ejecuta `signIn`/`signOut` mediante server actions inline — ese es el patrón a seguir para acciones de auth, no rutas de API propias.

**No hay protección de rutas**: no existe `middleware.ts` y ninguna página comprueba la sesión. Si añades funcionalidad que persista datos por usuario, el gate de autenticación hay que construirlo.

Variables de entorno requeridas (en `.env.local`, no versionado y sin `.env.example`): `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `NEXT_PUBLIC_SANITY_PROJECT_ID`, `NEXT_PUBLIC_SANITY_DATASET`.

### Lógica de cálculo (a portar desde `logica-en-python.py`)

El modelo es una lista de secciones, cada una `{ porcentaje (0-1), num_notas, notas_obtenidas[] }`:

- `nota_actual = Σ (Σ notas_obtenidas / num_notas) × porcentaje`
- `porcentaje_restante = Σ (porcentaje / num_notas) × (num_notas − notas_obtenidas.length)`
- `nota_necesaria = (objetivo − nota_actual) / porcentaje_restante`

La versión Python sólo protege el caso `porcentaje_restante == 0`. Al portarla hay que cubrir además `num_notas == 0`, porcentajes que no suman 100, y notas fuera de rango.

## Convenciones de código

- **Alias de import**: `@/*` mapea a la raíz del proyecto (`@/components/...`, `@/lib/utils`, `@/auth`).
- **Componentes**: Server Components por defecto; añade `"use client"` sólo cuando haga falta interactividad. El formulario de la calculadora sí la necesitará.
- **UI**: shadcn/ui estilo *new-york* (ver `components.json`). Añade componentes con `npx shadcn@latest add <componente>` — van a `components/ui/`. Iconos con `lucide-react`. Variantes con `cva` y composición de clases **siempre** con `cn()` de `@/lib/utils`.
- **Estilos**: Tailwind 3.4. El proyecto define clases utility compuestas en `@layer utilities` dentro de `app/globals.css` (`heading`, `sub-heading`, `section_container`, `blue_container`, `calcular_btn`, `text-24-black`…). Reutilízalas en vez de repetir cadenas largas de Tailwind; añade las nuevas ahí. Ojo: `globals.css` arrastra bloques heredados de otro proyecto (`startup-card`, `startup-form_*`, `search-form`, `profile_*`) que no se usan aquí — no los tomes como referencia.
- **Nombres**: componentes en `PascalCase.tsx` en `components/`; las clases utility custom mezclan `snake_case` y `kebab-case` por herencia, sigue el estilo del bloque que toques.
- **Formato**: VS Code aplica Prettier al guardar y `eslint --fix`, pero **Prettier no está en las dependencias** — no hay `.prettierrc` ni script de formato, así que el formateo depende del entorno local de cada quien.

## Trampas conocidas

Errores reales presentes en el código. No los repliques y, si tocas esos archivos, arréglalos:

1. **`<html>`/`<body>` duplicados**: tanto `app/layout.tsx` como `app/(root)/layout.tsx` los renderizan. En App Router sólo el root layout debe hacerlo; anidarlos da HTML inválido y errores de hidratación en React 19. El root además declara `lang="en"` en una app en español.
2. **Interpolación con comillas simples**: `href={'/calculadora/${_id}'}` en `app/(root)/page.tsx` y `href={'/user/${session?.id}'}` en `components/Navbar.tsx` usan comillas simples, así que no interpolan y enlazan a la cadena literal. Necesitan backticks — y las rutas de destino (`/calculadora` sin id, `/user/...`) tampoco existen.
3. **Credencial hardcodeada**: `scraping_materias/scraping_subjects_python.py` lleva la contraseña de MySQL en texto plano. El archivo aún no está versionado; hay que moverla a variable de entorno antes de commitearlo.
4. **Dependencias inestables en producción**: `next-auth@5.0.0-beta.25` y `next-sanity` en canary. Ten cuidado al actualizar.
5. **Trabajo sin versionar**: el repo tiene un único commit (el scaffold de `create-next-app`) y casi todo el código real está untracked.
