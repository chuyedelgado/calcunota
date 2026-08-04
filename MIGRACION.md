# Migración a DigitalOcean App Platform

Estado: **fase 0 hecha, fase 1 sin empezar.**
Última actualización: 4 de agosto de 2026.

Notación: **[TÚ]** paneles, cuentas y dinero · **[YO]** código, configuración y
verificación.

Vercel y Neon siguen sirviendo a los usuarios **hasta la fase 6**. Nada se apaga
antes, y no hay ningún paso destructivo hasta entonces.

---

## Recursos confirmados

| Recurso | Elección | Estado |
|---|---|---|
| Región | **NYC3** | confirmada |
| Base de datos | **Managed PostgreSQL 18**, plan Standard, 1 GB RAM / 10 GiB disco | **creada** |
| Connection pool | modo *transaction* → cadena **agrupada** | creado |
| App Platform | Basic, 1 GB RAM / 1 vCPU | pendiente |
| Dominio | `calcunota.com` | comprado, sin apuntar |

La app y la base **van en la misma región**. La base sobra de tamaño: los datos
actuales son ~14 MB contra 10 GiB de disco.

**Las dos cadenas de conexión viven en un fichero local fuera del repo.** Se usan
así y se borra el fichero al terminar la fase 2:

- **directa** → migraciones y scripts (`prisma migrate deploy`, `verificar.ts`, `pg_dump`)
- **agrupada** (pool) → variable `DATABASE_URL` de la app

Nunca van al `.env` versionado, ni al repo, ni al chat.

---

## El bloqueante que hay que tener presente

NextAuth v5 confía en el host automáticamente **solo cuando detecta la variable
`VERCEL`**. Fuera de Vercel lanza `UntrustedHost` y **no funciona ninguna
sesión**: ni login, ni `auth()`, ni las páginas protegidas.

Reproducido en local:

```
$ PORT=4321 npm run start
✓ Ready in 388ms
[auth][error] UntrustedHost: Host must be trusted. URL was: http://localhost:4321/api/auth/session
```

Se arregla con **una variable**: `AUTH_TRUST_HOST=true`. Si falta, el primer
despliegue parece un desastre inexplicable en vez de una variable olvidada.

---

## Fase 0 — Preparativos ✅

- [x] Proyecto creado en DigitalOcean, región **NYC3**
- [x] Base **Managed PostgreSQL 18** creada (Standard, 1 GB / 10 GiB)
- [x] Connection pool en modo *transaction* creado
- [ ] Repo `chuyedelgado/calcunota` autorizado desde DO (app de GitHub)

## Fase 1 — Cambios de código **[YO]**

Todos compatibles con Vercel: **no rompen nada mientras las dos plataformas
corren en paralelo**.

1. **`AUTH_TRUST_HOST`** — pasa de opcional comentada a **requisito** en
   `.env.example`, documentada como obligatoria fuera de Vercel.
2. **Build** — decidir entre `prisma migrate deploy && next build` y dejar el
   `postinstall` con `prisma generate` (ver *Decisión pendiente*).
3. **`maxDuration = 30`** — se mantiene (inofensivo, sirve si algún día se vuelve
   a Vercel) con un comentario de que en App Platform no aplica.
4. **`.env.example`** — reescribir la sección de `DATABASE_URL` para DO:
   agrupada vs directa, `sslmode=require`.
5. **Comentarios que dicen "Vercel"** en `lib/importarHistorialPdf.ts` → pasar a
   "runtime de Node" a secas.
6. **Health check** — `app/api/salud/route.ts`, trivial y **sin tocar la base**.
   Si el health check consultara Postgres, un hipo de la base haría que DO
   reiniciara la app en bucle.

**Verificación antes de que toques ningún panel:** `tsc`, `lint`, `build`, la
suite de pruebas, y arrancar en local con `AUTH_TRUST_HOST=true` en un puerto no
estándar para reproducir el escenario de App Platform.

### Lo que NO hay que cambiar (verificado)

| Punto | Estado |
|---|---|
| `postinstall: prisma generate` | ✅ existe, y el buildpack Node de App Platform lo respeta |
| `serverExternalPackages: ["@prisma/client", "pg"]` | ✅ ya está, y fuera de Vercel es más necesario aún |
| Puerto / comando de arranque | ✅ nada que cambiar: `next start` lee `PORT`, probado con `PORT=4321` |
| `sharp` | ✅ instalado (0.34.5). Fuera de Vercel la optimización de imágenes la hace él dentro del contenedor; los avatares de Google siguen funcionando |
| URLs en `/privacidad` y `/terminos` | ✅ no hay ninguna escrita a mano, son enlaces relativos: **cero cambios de texto** |

## Fase 2 — Base de datos **[TÚ creas, YO migro y verifico]**

- [x] 2.1 Managed Postgres creada en NYC3
- [x] 2.2 Connection pool (modo *transaction*) creado
- [ ] 2.3 **Trusted Sources**: añadir tu IP (para migrar) y después la App
- [x] 2.4 Cadenas entregadas por el canal seguro
- [ ] 2.5 **[YO]** `prisma migrate deploy` contra la **directa** → crea el esquema
- [ ] 2.6 **[YO]** copiar solo los datos desde Neon y verificar

### Por qué esquema y datos van por separado

**Prisma es dueño del esquema y es agnóstico de versión.** Aunque origen y
destino sean ambos PostgreSQL 18 —Neon corre 18.4— y un `pg_dump` completo ya
sea viable, este orden sigue siendo el bueno: el esquema queda idéntico al del
repo, sin arrastrar nada del entorno de Neon.

```bash
# 1. esquema, con la cadena DIRECTA
DATABASE_URL="<directa>" npx prisma migrate deploy

# 2. solo las filas, desde Neon (pg_dump únicamente LEE: origen intacto)
pg_dump "<neon>" --data-only --exclude-table=_prisma_migrations > datos.sql

# 3. cargarlas en DO
psql "<directa>" < datos.sql
```

Excluir `_prisma_migrations` es clave: `migrate deploy` ya escribió sus propias
filas ahí y duplicarlas rompería el historial. Todos los ids son `cuid()` (texto,
no `serial`), así que **no hay secuencias que resincronizar**.

### Cero pérdida y reversibilidad

- **Neon queda intacto**: `pg_dump` solo lee.
- **Reversible en un minuto**: si algo falla, la variable de entorno vuelve a
  apuntar a Neon. No hay paso destructivo hasta la fase 6.
- **Ventana de escritura**: mientras se copia, un dato guardado en Vercel/Neon no
  llega. Con 3 usuarios reales es despreciable, pero **la copia final se hace
  justo antes del cambio de dominio** y con una segunda pasada de conteos.

### ⚠️ Falta una migración en producción

`20260804042614_limite_peticiones` **no está aplicada en producción**. Solo hay
tres migraciones en la base y la tabla `LimitePeticiones` no existe:

```
OK  20260724002646_esquema_inicial
OK  20260724011234_esquema_inicial
OK  20260729031021_secciones_anidadas
!!  20260804042614_limite_peticiones   <- falta
```

Consecuencia hoy: **el límite de peticiones no está limitando nada**. Como
`lib/limite.ts` falla abierto por diseño, cada consulta al contador revienta en
silencio y deja pasar la petición — que es el comportamiento correcto ante una
base rota, pero significa que la protección no existe todavía.

No es un problema de la migración a DO: `prisma migrate deploy` de la fase 2.5 la
aplicará en destino junto con las otras tres. **Pero hay que aplicarla también en
Neon** si la beta arranca antes de migrar.

### Verificación de la copia

Conteos medidos **en producción** el 4 de agosto de 2026:

| Tabla | Filas |
|---|---|
| MateriaPlan | 6,868 |
| Prerequisito | 4,118 |
| Materia | 2,019 |
| PlanEstudio | 113 |
| Carrera | 62 |
| Facultad | 6 |
| Universidad / Profesor | 1 / 0 |
| User / Account | 3 / 3 |
| **PerfilEstudiante** | **2** |
| **Periodo** | **8** |
| **Curso** (datos reales) | **70** |
| **Seccion / Nota** | **18 / 36** |

> Una tabla anterior de este documento daba Curso=31 y Nota=16. **Esos números
> eran de la rama de desarrollo**, medidos por error con la `DATABASE_URL` del
> `.env` local. Con esa referencia, una copia a la que le faltaran 39 cursos, un
> perfil entero y dos periodos habría pasado la verificación como buena. Medir
> siempre con la cadena de producción, y **volver a medir justo antes de la copia
> final**: estas cifras envejecen con cada uso real.

Después de copiar: **(a)** comparación tabla por tabla origen vs destino,
**(b)** `npx tsx prisma/verificar.ts` apuntando a DO → **0 fallos**, y **(c)** el
expediente de referencia (`jesusdelgadocidmi2016@gmail.com`, Ingeniería de
Software **M-2024**) sigue dando exactamente:

| Comprobación | Valor esperado |
|---|---|
| Índice acumulado | **360 puntos / 120 créditos = 3.00** |
| Cursos del perfil | **40** (34 aprobados + 6 en curso) |
| Cursos con resultado | 30 |
| Periodos | 8 |
| Avance de carrera | **119 de 203** |

El índice es el mejor detector de corrupción que hay: si un solo curso se pierde
o se duplica, cambia. **El avance (119) y el índice (120) NO son el mismo número
y no deben "cuadrarse"** — ver la sección de índice y avance en CLAUDE.md.

## Fase 3 — Desplegar en paralelo **[TÚ creas, YO configuro y verifico]**

- [ ] 3.1 Crear la App desde el repo, rama `main`. Build `npm run build`, run `npm start`
- [ ] 3.2 Variables de entorno, **todas cifradas** salvo la última:
      `DATABASE_URL` (**la agrupada**), `AUTH_SECRET`, `AUTH_GOOGLE_ID`,
      `AUTH_GOOGLE_SECRET`, `AUTH_TRUST_HOST=true`
- [ ] 3.3 Tamaño: **1 GB RAM**
- [ ] 3.4 **[YO]** verificar el despliegue en la URL temporal `*.ondigitalocean.app`:
      cabeceras, arranque, base

⚠️ **El login todavía no funcionará en la URL temporal**, y es lo esperado:
Google solo acepta orígenes registrados. Se arregla en la fase 4. No es un fallo.

## Fase 4 — Dominio y OAuth **[TÚ]**

- [ ] 4.1 Apuntar los nameservers de `calcunota.com` a DigitalOcean
- [ ] 4.2 Añadir `calcunota.com` **y** `www.calcunota.com` a la App (DO emite el TLS solo)
- [ ] 4.3 Esperar propagación DNS y confirmar HTTPS
- [ ] 4.4 Google Cloud Console → credenciales OAuth. **Añadir, no reemplazar**:
      orígenes `https://calcunota.com` y `https://www.calcunota.com`; redirección
      `https://calcunota.com/api/auth/callback/google` (+ `www`). **Dejar los de
      Vercel y `localhost`** hasta la fase 6

**El dominio se conecta una sola vez, a DigitalOcean. Nunca a Vercel.**

## Fase 5 — Validación antes del cambio **[YO verifico, TÚ pruebas]**

En `https://calcunota.com`:

- [ ] 1. Carga la landing y la calculadora pública
- [ ] 2. **Login con Google** (el momento de la verdad: si falta `AUTH_TRUST_HOST`, falla aquí)
- [ ] 3. El expediente aparece completo: **índice 360/120 = 3.00**
- [ ] 4. Las 6 cabeceras de seguridad se sirven (`curl`)
- [ ] 5. Importar un PDF de historial funciona
- [ ] 6. El límite de peticiones cuenta en la base nueva
- [ ] 7. Cierre de semestre y eliminación de cuenta (con cuenta desechable)
- [ ] 8. `verificar.ts` contra DO: **0 fallos**

**Solo cuando pasen los 8** se considera migrado.

## Fase 6 — Retirada **[TÚ, no antes de una semana]**

- [ ] Retirar los orígenes de Vercel en Google
- [ ] Pausar el proyecto de Vercel
- [ ] **Conservar Neon al menos 30 días** — es la vuelta atrás. Copia de seguridad
      final antes de borrarlo

---

## Costo mensual estimado

Para 30-50 usuarios:

| Recurso | Tamaño | Coste aprox. |
|---|---|---|
| App Platform (Basic) | 1 GB RAM / 1 vCPU | ~$12 |
| Managed Postgres | 1 GB / 10 GiB | ~$15 |
| Connection pool | incluido | $0 |
| DNS + TLS | incluido | $0 |
| Ancho de banda | 100 GB incluidos | $0 |
| **Total** | | **~$27/mes** |

**Confirmar los precios en el panel**: cambian, y la base ya creada manda sobre
esta tabla. La estructura (dos recursos, ~$27) sí es fiable.

**Por qué 1 GB y no el de 512 MB:** Next.js con SSR y `sharp` cargado se acerca
peligrosamente a 512 MB; un pico y el contenedor muere por falta de memoria.

---

## Efectos colaterales de salir de Vercel

**Se pierde el corte duro del PDF.** `export const maxDuration = 30` es de
Vercel; App Platform es un contenedor de larga vida y no lo entiende. Queda solo
el tiempo máximo de 10 s de `lib/importarHistorialPdf.ts`, que corta la **espera**
pero no el trabajo síncrono de pdf.js. Peor caso: un núcleo ocupado unos
segundos, con el límite de 5 PDF/hora por usuario encima. **Deuda anotada, no
bloqueante.**

**Se gana caché de verdad.** `lib/catalogo.ts` funciona mejor en App Platform que
en Vercel: es un proceso persistente, no funciones que se apagan. La caché se
calienta una vez y se queda. `lib/limite.ts` es portátil por diseño.

---

## Cómo encaja con la PWA y con publicar en Google

**Orden: migrar → PWA → publicar en Google.**

**PWA** — sin fricción. Necesita HTTPS en dominio propio (lo da DO) y la CSP ya
incluye `manifest-src 'self'` y `worker-src 'self' blob:`, así que el service
worker no chocará con ella. ⚠️ **PWA antes que activar `CSP_OBLIGATORIA`**: si la
CSP pasa a obligatoria primero, hay que revisar que el service worker no necesite
nada más (ver deuda #8 en CLAUDE.md).

**Publicar en Google** — la migración es prácticamente un requisito previo: salir
del modo prueba exige dominio verificado con política de privacidad y términos
**en ese mismo dominio**. `calcunota.com/privacidad` y `/terminos` sirven; un
subdominio `vercel.app` complica la verificación porque no es tuyo. La
verificación se hace por DNS, que ya se controlará en DO. Mientras siga en modo
prueba, solo entran los usuarios de prueba: **la beta de 30-50 personas necesita
esto resuelto.**

---

## Decisión pendiente antes de la fase 1

**¿Migraciones automáticas en el build?** Con
`prisma migrate deploy && next build`, cada despliegue aplica solo las
migraciones pendientes: cómodo, pero un despliegue fallido puede dejar la base a
medio migrar.

**Recomendación: NO.** Que `migrate deploy` se corra a mano con la cadena
directa, como hasta ahora. Más pasos, cero sorpresas. Si no se dice lo
contrario, la fase 1 se hace así.
