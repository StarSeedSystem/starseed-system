# Análisis y propuesta · Servidor en tiempo de ejecución (F0, tarea RSD1108C)

*2026-11-08 · contrato fuente: `architecture/red-sin-dependencias.md` §2, §6, §10 (F0), §11.3.*

**Qué pide el contrato (§10, F0):** «URL del servidor en tiempo de ejecución».
**Qué mide este documento:** dónde queda fija hoy la URL y la clave de Supabase (a nivel de
compilación), qué se puede resolver al ejecutar y qué no, y una propuesta de resolutor único con
los cuatro modos del contrato: **nube StarSeed, servidor propio, neurona base, solo malla**.

Medido con `git grep` sobre el repo actual (sin `node_modules`).

---

## 1 · Dónde queda fija hoy (medido)

### 1.1 · Lo que Next incrusta en el paquete del navegador

`NEXT_PUBLIC_SUPABASE_URL` es una variable de **compilación**: Next la sustituye por literal en el
bundle de cada `next build`. El valor publicado va muerto dentro del JavaScript que descarga todo
visitante; cambiarlo exige recompilar.

**Alcance del acoplamiento (rutas y número de archivos):**

| Zona | Archivos | Qué hace |
|---|---|---|
| `src/` — código de la app | **36 archivos · 48 referencias** | Fábricas de cliente y clientes creados a mano (detalles en 1.2 y 1.3) |
| `scripts/` | **28 archivos** | `puente/` (`puerta_datos.py`, `nodo_metagenesis.py`, `oracle_nodo.py`, `vigia_consumo.py`, `tunel_metagenesis.py`…), `enjambre/` (`starseed-enjambre.py`, `lanzador.py`, `motor_ambito.py`), `login-and-inject.mjs`, `create-test-account.mjs`, check/merge |
| Raíz, scripts desechables | **25 archivos** | `test_*.js` (9), `check_*.js` (5), `fix_*.js` (4), `debug_*`, `purge_*`, `delete_profiles.js`, `create_buckets.ts`, `merge-brains.ts`, `Dockerfile`, `cloudbuild.yaml` |
| `.github/workflows/` | **3** | `ci.yml`, `native-build.yml`, `servidor-capa.yml` |
| `deploy/` | **2** | `genesis-contenedor/github-actions.yml`, `oracle/nodo/systemd/starseed-genesis.service` |
| `servicios/puerta-datos` | **1** | `src/config.mjs` |
| Total repo | **~104 archivos** | — |

Las 48 referencias dentro de `src/` usan el mismo patrón en casi todos los puntos:
`process.env.NEXT_PUBLIC_SUPABASE_URL || <degradación>`. Hay **dos clases de degradación** y
ninguna es neutra:

- `https://dummy.supabase.co` + clave `dummy-anon-key` (fábricas de §1.2): todas las llamadas
  fallan contra un host que no existe; hay un aviso único en consola, pero el síntoma de fondo
  es un fallo de red genérico, no «configura la nube».
- `https://nxstilnyidvkqeosofuh.supabase.co` — un **proyecto retirado** (lo declara
  `integraciones-de-codigo/starseed-link/src/config.ts` en `PROYECTOS_RETIRADOS`) — como literal
  de respaldo en `src/app/api/auth/otp/request/route.ts:36` y `src/app/api/auth/otp/verify/route.ts:34`.
  Un despliegue sin variables no «falla»: habla con una nube muerta y el error es incomprensible.

**La clave pública** (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) va pinchada al URL en los mismos sitios:
**14 archivos · 18 referencias** en `src/`. Es una clave de anon (pública por diseño), pero su
valor firma el JWT `anon` que cada llamada presenta al proyecto: cliente y servidor tienen que
apuntar al mismo proyecto *con la misma clave* o la petición se rechaza.
Nota: la clave es el elemento **variable** del cambio: cada servidor (nube distinta) trae su
pareja URL + clave `anon`. Además hay usos de
`SUPABASE_SERVICE_ROLE_KEY` en servidor (`src/app/api/dispositivo/sesion/route.ts:39`,
`src/lib/storage/credenciales-servidor.ts`) — esa sí que solo puede venir del servidor, nunca
del resolutor del navegador.

### 1.2 · Fábricas de cliente (las cuatro puertas ya definidas)

| Fábrica | Archivo | Cómo toma la config |
|---|---|---|
| Navegador (singleton) | `src/utils/supabase/client.ts` | `process.env.NEXT_PUBLIC_SUPABASE_URL/ANON_KEY` leídos **dentro** de `buildClient()`; con fallback `dummy.supabase.co` y aviso único. Implementa cerrojo en proceso, `fetchGuardado`, ahorro de auth. **365 archivos importan esta fábrica.** |
| Servidor (RSC / Server Actions) | `src/utils/supabase/server.ts` | Mismas variables con fallback `dummy.supabase.co`; cookies por `next/headers` para la sesión por **usuario** del origen. **61 archivos la importan.** |
| Middleware | `src/utils/supabase/middleware.ts` (invocada desde `middleware.ts`, 2 importadores) | Mismas variables; renueva la sesión del origen con `getUser()`; en servidor local nativo (`STARSEED_SERVIDOR_LOCAL=1`) aplica tope de red de 2,5 s y no expulsa por fallo de red. |
| Rutas de API / service-role | 4 rutas (`auth/otp/request`, `auth/otp/verify`, `mail/enviar`, `dispositivo/sesion`) y varios módulos de `src/lib/` (ver 1.3) | Se saltan las fábricas: `createClient` de `@supabase/supabase-js` con URL `NEXT_PUBLIC_SUPABASE_URL` y clave de servidor (`SUPABASE_SERVICE_ROLE_KEY`); `dispositivo/sesion` y `storage/credenciales-servidor.ts` añaden carga de `.env.local` (`SERVER_ENV`). |

El coste del acoplamiento: una neurona que entra por el servidor local nativo, otra por la web
de Vercel y otra por una instancia propia **llevan cada una su nube incrustada al compilar**,
y no hay forma de apuntar ninguna a un servidor propio sin recompilar.

### 1.3 · Clientes creados a mano fuera de las fábricas

**21 archivos** en `src/` importan `@supabase/supabase-js` directamente y crean su cliente
(`createClient(...)` con URL y clave propias o heredadas de env). Los de URL pública:

- `src/app/api/auth/otp/request/route.ts`, `src/app/api/auth/otp/verify/route.ts` (service-role,
  respaldo a proyecto retirado),
- `src/app/api/mail/enviar/route.ts`, `src/app/api/dispositivo/sesion/route.ts`
  (patrón `env + SERVER_ENV` cargado de `.env.local`),
- `src/lib/genesis/conectores/boveda-servidor.ts`, `src/lib/externos/guardian-externo.ts`,
  `src/lib/aurora/hermione-server.ts`, `src/lib/metagenesis/remoto-orden-servidor.ts`,
  `src/lib/storage/credenciales-servidor.ts`, `src/lib/consumo/usuario.ts`,
  `src/lib/sso/detect-session.ts`,
- clientes por cuenta en el navegador (`@supabase/supabase-js` directo):
  `src/context/account-context.tsx`, `src/lib/profiles/profiles.ts`,
  `src/lib/mensajeria/presencia.ts`, `src/lib/neurons/presencia.ts`,
  `src/lib/sync/live-signal.ts`, `src/lib/sync/realtime-sync.ts`,
  `src/lib/map/location-share.ts`, `src/lib/externos/vinculos.ts`,
  `src/lib/mando/guardian.ts`, `src/ai/astraura/sync-providers.ts`,
- y sus pruebas (`src/lib/**/__tests__/…`, `src/app/api/jev/__tests__/systemone-nube.test.ts`).

**El id de proyecto en duro:** `pqzdpmedcsgcedkvndzl` aparece sin var de entorno en
**8 archivos de código** (y 2 de documentación/SQL): `src/lib/mando/entornos.ts:92,95` (URL del
panel y etiqueta del entorno de mando), `src/lib/__tests__/os-files.test.ts`,
`src/lib/mensajeria/__tests__/adjuntos.test.ts`,
`src/components/layout/__tests__/indicador-carga-global.test.ts`,
`integraciones-de-codigo/starseed-link/src/config.ts` —su kit lo enumera en
`PROYECTOS_RETIRADOS` y nombra como activo conocido a otro (`jhgvhkypqadfdkkqoxta`):
desacuerdo de catálogo a aclarar con Alex— y el enjambre (`scripts/enjambre/starseed-enjambre.py`,
`lanzador.py`, `motor_ambito.py`). Es el residuo de «Supabase manda»: un id de proyecto donde debería leerse
un ajuste (URL + clave).


**Y una fuente aparte, por cuenta:** `src/lib/externos/vinculos.ts` y los vínculos de cuenta
pueden guardar configuración de *otro* Supabase por usuario; es el precedente más cercano de
«servidor propio» que ya existe en el sistema.

**PRECEDENTE CLAVE, ya en main:** el OS ya sirve su configuración en tiempo de ejecución para
las apps vinculadas — `GET /api/vinculo/config` (`src/app/api/vinculo/config/route.ts`,
`force-dynamic`, CORS abierto, solo URL y clave `anon` leídas de env **al responder**), y el
kit `integraciones-de-codigo/starseed-link/src/config.ts` trae el arsenal completo de cliente:
`proyectoValido` (URL bien formada, clave con forma de JWT, descartar proyectos retirados),
`esRetirado`, `configSincrona` (guardada → entorno → respaldo, para arrancar sin esperar a la
red) y `OrigenConfig`. El kit nació de un incidente del 2026-10-10: una app vinculada seguía
anclada a un proyecto retirado y su login moría. La ironía: **el OS da a las apps exteriores lo
que a sí mismo no se da** — sus propias fábricas no leen ese canal. El resolutor debe REUSAR
ese kit (`proyectoValido`, `configSincrona`), no escribirlo de nuevo.

### 1.4 · CSP (`connect-src`)

`next.config.ts:201`: `connect-src 'self' https: wss: http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*`.
**Está en report-only, y `https:` + `wss:` son comodines**: hoy la CSP no bloquea ningún
servidor que el resolutor elija (nube, servidor propio `https://`, nodo `http://127.0.0.1`) ni
necesita regenerarse al cambiar de servidor. El riesgo solo aparece si algún día se acota a una
lista explícita de hosts: entonces el resolutor y la CSP deben leer el mismo ajuste
(§5, riesgo 3).

### 1.5 · Service worker y precarga

`public/sw-v8.js` (activado por `src/components/pwa/register-sw.tsx`) **no contiene ninguna
referencia a Supabase ni a su URL** — `grep SUPABASE public/sw-v8.js` da 0 resultados — y no
cachea respuestas de la API de datos; su precarga (`src/lib/pwa/precarga-cliente.ts`,
componente «precarga-sin-internet») guarda paquetes de la app. No es una puerta de fallo por la
URL en sí, pero sí es una caché vieja a tener en cuenta al cambiar de servidor: ver §5.

### 1.6 · Servidor local de la app nativa

La app nativa (Tauri) sirve la web de la app desde su servidor local: el estado del puerto lo
da el comando `servidor_local_estado` (contrato `apps-autonomas-sin-internet.md` §4 y §10, T6)
y el origen resultante es `127.0.0.1:<puerto>` (`src/lib/nativa/estado-servidor-local.ts:96-100`,
documentado con ejemplo `127.0.0.1:47610`). Esa web es el mismo bundle: dentro sirven las
mismas fábricas de §1.2 (con el modo nativo `STARSEED_SERVIDOR_LOCAL=1` ya tratado en
middleware). **El lado nativo no lleva ninguna URL de Supabase**: las únicas menciones de `supabase` en
`src-tauri/src/main.rs`, `native/servidor-local/*` (5 archivos, 10 líneas) son comentarios y la
**migración de origen** (`migracion-origen.js`, `rescate-origen.js`), que se limita a detectar y
traer las **cookies** `sb-…-auth-token` al cambiar de origen el navegador — un precedente que el
resolutor aprovecha (§5, riesgo 1). La nube de la app nativa es *exactamente* la incrustada en
el paquete que su servidor sirve. Por eso la app nativa es el sitio natural para la fuente
«servidor local de la app» del resolutor (§3): ya expone al JS el estado de su servidor, solo
falta exponerle el ajuste de nube.

### 1.7 · Scripts e infra

Los 28 de `scripts/`, los ~25 de la raíz, 3 de `.github/workflows/`, 2 de `deploy/` y 1 de
`servicios/puerta-datos` leen la URL y la clave de **variables de entorno en tiempo de
ejecución** del proceso — no incrustan nada al compilar. Son clientes secundarios (enjambre,
puerta, oráculo, scripts de comprobación) que hoy comparten nube fija con el paquete, pero si el
resolutor define «servidor» como un ajuste legible, estos procesos han de leer el **mismo
ajuste** (§3.3) en vez de cada uno su var.

---

## 2 · Qué se puede resolver al ejecutar y qué no

| Pieza | ¿Se puede cambiar al ejecutar? | Por qué |
|---|---|---|
| Variables `NEXT_PUBLIC_*` leídas por el **navegador** | **No** desde el JS ya servido: Next las incrusta como literales en el bundle en `next build` | Un cambio de nube implica **recompilar**, no «cambiar un ajuste» |
| Variables `NEXT_PUBLIC_*`/de servidor leídas por el **servidor** | **Sí, con matiz**: el proceso de Next las lee en cada llamada, pero `process.env` se queda fijo tras el arranque; para cambiarlas hace falta REARRANCAR el proceso o recargar un fichero | El middleware y las rutas de API pueden leer un fichero de ajuste por petición |
| La **sesión por cookies** del navegador | Solo cambia si se descarta sesión: son cookies **del origen de la web** (p. ej. `127.0.0.1:47610` o el dominio de Vercel), no del servidor Supabase | Al cambiar de servidor, los tokens de sesión firmados por el proyecto viejo no valen en el nuevo (401): hay que descartarlos o re-verificar (§5, riesgo 1) |
| El **middleware** | No en caliente: compila con la app | Renueva la sesión contra el servidor resuelto; su lógica sí puede leer el resolutor (§3) |
| El **service worker** (precarga) | Su caché es del origen de la web, no del servidor de datos | Cambia de servidor no lo rompe; sí hay que invalidar su caché cuando cambie el ajuste (§5, riesgo 4) |
| La **CSP** de `next.config.ts` | Ya permite cualquier servidor al día de hoy | Está en `Report-Only` y `connect-src` es amplio (`https:` `wss:` + loopback); el riesgo real es acotarla de un día para otro (§5, riesgo 3) |
| Los **scripts** y servicios periféricos | **Sí** en su arranque: leen var de entorno del proceso | Si el resolutor mantiene su ajuste en un fichero, cada cliente periférico puede leer el mismo ajuste (§3, fuente 0) |

**Conclusión:** la mitad servidor (scripts, rutas server-side) ya se resuelve al arrancar el
proceso; lo que no puede cambiar al ejecutar es el **lado navegador**, porque la configuración
no vive en un fichero: vive incrustada en los bytes del paquete. Un resolutor único debe
empezar por ahí —dejar de leer `NEXT_PUBLIC_*` en el runtime del navegador y leerlo de una
fuente propia— y por eso el riesgo de sesión hay que resolverlo con el ajuste (§5).

---

## 3 · Propuesta · un resolutor único

### 3.1 · Nombre y firma

Módulo puro nuevo: **`src/lib/red/resolutor-servidor.ts`** (tipos aparte si algún día importa
`node:*`; hoy puro, sin `node:*`, por trampa 11 de CLAUDE.md).

```ts
// Modos del contrato · red-sin-dependencias.md §6 («La URL del servidor pasa a
// configurarse en tiempo de ejecución»).
export type ModoServidor = "nube-starseed" | "servidor-propio" | "neurona-base" | "solo-malla";

export interface AjusteServidor {
    modo: ModoServidor;
    /** URL de la API. En "solo-malla" es null: no se llama a ningún servidor. */
    url: string | null;
    /** Clave pública `anon` del servidor de esa URL (cada servidor, la suya). */
    anonKey: string | null;
}

// Orden de fuentes: ajuste de la persona › servidor local de la app nativa ›
// variable de compilación (lo de hoy). Detalle en 3.2.
export function resolverServidor(
    ajustePersona: AjusteServidor | undefined,
    estadoServidorLocal: AjusteServidor | undefined,
    compila: { url?: string; anonKey?: string },
): AjusteServidor;
```

**Reglas de pureza** (misma entrada → misma salida, sin lado): no mira `navigator`, ni red, ni
reloj; todo lo que necesita entra por argumento, así que es comprobable en vitest sin aparato.
La única función no pura necesaria es un lector del ajuste persistido (§3.3) — vive en otro
módulo, que es quien llama a `resolverServidor`.

### 3.2 · Reglas de decisión y los cuatro modos

**Qué decide con cada fuente y cada modo** (reglas de decisión, todas puras):

1. Si `ajustePersona` está definido y completo (pareja url+clave, o `solo-malla`), gana: es la
   decisión de la persona y manda sobre todo lo demás.
2. Si no, si `estadoServidorLocal` está definido y completo, se usa: es el ajuste que la app
   nativa comparte con la web que su propio servidor local sirve (una neurona base empuja a sus
   invitados a SU réplica, no a la nube de una compilación vieja).
3. Si no, cae `compila` (las `NEXT_PUBLIC_*`): el modo de hoy, **nube-starseed por defecto**.
   Nada cambia para nadie hasta que alguien elija otra cosa — este es el paso que no rompe nada.
4. Si la fuente ganadora está incompleta (URL sin pareja o sin clave), degrada a la siguiente
   fuente; el resolutor devuelve siempre un `AjusteServidor` completo. La única salida con
   `url: null` es `solo-malla`, por diseño.

Semántica de los **cuatro modos del contrato** (§6):

| Modo | URL/clave | Qué hace cada sistema |
|---|---|---|
| `nube-starseed` | la de la nube compartida | Lo de hoy: Supabase Auth, tablas, storage y realtime sin cambios |
| `servidor-propio` | la del servidor de la persona | La app habla con el servidor de la persona con el protocolo que ya existe (`architecture/servidor-propio-protocolo.md`, relé de contenido) o con una instancia completa del OS servida por la persona; la nube deja de ser autoridad y pasa a réplica (decisión 3 del §11) |
| `neurona-base` | la de una neurona de la LAN o estación base (§7.8, `http://127.0.0.1:<puerto>`) | Otra neurona con app nativa sirve de réplica accesible para las invitadas de la LAN |
| `solo-malla` | `null`/`null` | **Ningún sistema llama a un servidor.** Mensajes, llamadas y archivos ya funcionan así (§2 del contrato); los datos de entidades y la cuenta quedan pendientes del registro vivo firmado (F2) y del
enrolamiento por malla del §5.1 del contrato (IDN1108A) — el resolutor garantiza la parte que le toca: la URL consultada es nula y **nadie dispara peticiones a un host que no existe** ni propone usar `dummy.supabase.co` |

**Convivencia con lo que aún no vive sin servidor:** el Mapa de vías (§8 del contrato) enseña,
por modo, qué sistemas funcionan y cuáles quedan pendientes; el futuro copiloto propone el
cambio de modo con una frase («sin internet: sigues con mensajes por malla, los datos esperan
a F2») y la persona responde con un toque.

### 3.3 · Dónde se guarda el ajuste

Un solo sitio, versión, y sin claves de servicio:

- **En la web y la PWA:** `localStorage` con clave de versión (`starseed.servidor.v1`), solo
  para esta persona y esta neurona. Sin `NEXT_PUBLIC_*` aquí: el paquete público nunca lleva
  ajuste, solo el valor de respaldo.
- **En la app nativa:** el ajuste vive del lado nativo (registro del servidor local ya existe:
  `native/servidor-local/node.json`) y la app nativa se lo pasa a la web por el mismo canal de
  estado `servidor_local_estado` (ya usado por `src/lib/nativa/estado-servidor-local.ts`).
- **En el servidor Next:** una variable **de servidor** (`SERVIDOR_ACTUAL` o un fichero de
  ajuste junto al `.env.local`, p. ej. `ajuste-servidor.json` en el directorio de trabajo, que
  `dispositivo/sesion` y `credenciales-servidor.ts` ya saben leer con el patrón `SERVER_ENV`).
  Las **claves de servicio** (`SUPABASE_SERVICE_ROLE_KEY`) se quedan donde están: nunca
  aparecen en el ajuste que circula.
- **Antes de haber datos guardados, la fuente 0 es la de hoy:** si nadie definió nada, el
  resolutor devuelve las `NEXT_PUBLIC_*` compiladas. Migrar es entonces, literalmente, **no
  cambiar nada** al arrancar (§4, pasos 1-2).

### 3.4 · El orden de fuentes, completo

```
ajuste de la persona (localStorage / ajuste nativo)
  › servidor local de la app nativa (`servidor_local_estado`, neurona base)
    › variable de compilación (NEXT_PUBLIC_*, que es el valor de hoy)
```

Así el valor incrustado al compilar **deja de ser mandón y pasa a escalón de respaldo**: ni los
scripts ni `deploy/` cambian su mecanismo actual (siguen tomando valores de entorno al
arrancar); cuando un ajuste esté definido, esos procesos leerán el mismo fichero de ajuste
(`ajuste-servidor.json`) además de su variable.

### 3.5 · Quién llama a `resolverServidor`: mapa de conexión

El resolutor solo está aplicado cuando cada punto del inventario de §1 lo invoca en el sitio
donde hoy lee la configuración. Sin este mapa, es una función exportada a la que nadie llama.

| Punto de conexión (medido en §1) | Sitio exacto donde se conecta | Quién alimenta las fuentes |
|---|---|---|
| `src/utils/supabase/client.ts` — `buildClient()` | Dentro de `buildClient()`, sustituyendo la lectura directa de `process.env.NEXT_PUBLIC_*` por la llamada al cargador de navegador → `resolverServidor(...)` antes de `createClient` | El cargador lee `starseed.servidor.v1` (persona) y `servidor_local_estado` (nativo); `compila` son las `NEXT_PUBLIC_*` de hoy |
| `src/utils/supabase/server.ts` — fábrica de RSC | Primera línea de la creación del cliente: env en vez de lectura directa | Cargador de servidor: `ajuste-servidor.json` (patrón `SERVER_ENV`) › `NEXT_PUBLIC_*` |
| `src/utils/supabase/middleware.ts` (invocada por `middleware.ts`) | Antes de `createServerClient`, renueva la sesión contra el servidor RESUELTO, no el compilado | Cargador de servidor; en nativo, el estado de `servidor_local_estado` |
| 4 rutas de service-role (`auth/otp/request`, `auth/otp/verify`, `mail/enviar`, `dispositivo/sesion`) y módulos de `src/lib/` (§1.3) | Donde hoy componen URL+clave a mano (incl. los respaldos a proyecto retirado) | Cargador de servidor; sigue prohibido exponer `SUPABASE_SERVICE_ROLE_KEY` por el resolutor del navegador |
| Clientes a mano en navegador (§1.3: `account-context.tsx`, `profiles.ts`, presencia, sync…) | Cada `createClient` directo pasa por el mismo cargador → `resolverServidor` (o importa el singleton ya resuelto de `client.ts`, preferido) | El cargador de navegador |
| Scripts, `deploy/`, `servicios/puerta-datos` (§1.7) | No llaman a esta función TS (Python/servicios): leen el **mismo ajuste** — `ajuste-servidor.json` además de su var de entorno — en su arranque | El fichero de ajuste es la voz del resolutor fuera de la web |

Consecuencia práctica: tras conectar §3.5, las `NEXT_PUBLIC_*` dejan de ser leídas por nadie en
runtime del navegador salvo como argumento `compila` del cargador — el literal incrustado pasa a
ser entrada del resolutor, no la decisión.

La conexión no se hace en este documento (que es solo análisis): la fija el paso 2 (fábricas) y
el paso 3 (rutas) de §4, cada uno con su prueba de que la llamada existe — una prueba nueva
tiene que fallar si la fábrica sigue leyendo env a pelo.

---

## 4 · Pasos de migración (≤ 3 archivos y ≤ 120 líneas por paso)

Cada paso cabe en una tarea del enjambre y va con su prueba (bucle rojo → verde: la prueba se
escribe primero y falla sin el cambio). Los pasos empiezan en rutas que **no cambian nada
observable** — el resolutor, por defecto, devuelve lo de siempre — y solo el último cambia de
sitio dónde se lee la configuración.

**Paso 1 · El resolutor y su prueba (2 archivos)**
- Nuevo `src/lib/red/resolutor-servidor.ts` (≤ 60 líneas; módulo puro, sin `node:*`, sin env).
  Exporta `ModoServidor`, `AjusteServidor` y `resolverServidor(...)` con la regla de 3.1-3.2.
- Nuevo `src/lib/red/__tests__/resolutor-servidor.test.ts`. Pruebas deterministas:
  persona completa gana a nativo y a compilación; neurona base gana a compilación; sin nada
  devuelve lo de `compila` tal cual está; una fuente incompleta degrada a la siguiente;
  `solo-malla` devuelve `null/null`. La prueba falla si el módulo no existe: bucle rojo
  garantizado.
- Nadie importa todavía el resolutor: es un paso intermedio, no el fin. La tarea no se da por
  terminada hasta que la conexión del §3.5 (pasos 2-4) esté aplicada y probada; integrar solo
  el paso 1 deja un módulo exportado que solo llaman sus pruebas.

**Paso 2 · Las fábricas leen del resolutor, que por defecto devuelve lo de siempre (≤ 3
archivos: `client.ts`, `server.ts`, `middleware.ts` de `src/utils/supabase/`)**
- En cada fábrica, la lectura directa de env se sustituye por una llamada al **cargador**
  (el módulo que en el navegador lee `localStorage` `starseed.servidor.v1`, y en el servidor
  las `NEXT_PUBLIC_*` + `ajuste-servidor.json`), cuyo resultado entra a `resolverServidor`.
- Sin ajuste guardado, el cargador no devuelve más que las `NEXT_PUBLIC_*` de hoy: **comportamiento
  idéntico**, incluido el aviso único de faltan envs (se conserva en el cargador).
- Pruebas: `client.ts` ya tiene pruebas de cliente (singleton, cerrojo): añadidos los casos
  «sin ajuste → dummy como hoy» y «con ajuste → URL del ajuste». Fábrica de middleware: caso
  «servidor local + ajuste de neurona base».
- Verificación: `npx vitest run src/lib/red/__tests__/resolutor-servidor.test.ts` para la
  prueba del paso y `bash scripts/enjambre/tsc-turno.sh` para tipos.
- Riesgo del paso: las fábricas ya evalúan env *dentro* de la función (no en el módulo), así
  que el cambio es local y los tests existentes del singleton/cerrojo siguen en verde.

**Paso 3 · Rutas y módulos de service-role leen el cargador de servidor (≤ 3 archivos)**
- `auth/otp/request/route.ts`, `auth/otp/verify/route.ts` y `mail/enviar/route.ts`: fuera las
  lecturas directas de env y los respaldos duros a URL fija (`https://nxstilnyidvkqeosofuh.supabase.co`,
  un proyecto retirado — `PROYECTOS_RETIRADOS` en `starseed-link`), y entran al cargador de
  servidor (patrón `SERVER_ENV` de `.env.local`, que ya usan `dispositivo/sesion` y
  `credenciales-servidor.ts`).
- Sin ajuste de servidor: comportamiento idéntico al actual, salvo quitar el «host muerto» del
  respaldo duro (aviso explícito en el error).
- Prueba: los casos de composición de URL/clave que ya hay (p. ej.
  `src/lib/storage/__tests__/credenciales-servidor.test.ts`) siguen en verde, más un caso
  nuevo «con ajuste de servidor → la ruta apunta a ese servidor».

**Paso 4 · Ajuste visible (≤ 3 archivos, cableado)**
- Una pantalla pequeña en Ajustes (modo, URL y clave `anon` — nunca la de servicio) que guarda
  `starseed.servidor.v1` y, al cambiar el ajuste, **invalida la sesión del servidor anterior**
  (riesgo 1) y pide al service worker vaciar su caché (riesgo 4).
- Prueba: la función pura de cambio de modo del componente de ajustes, con
  `describe/it/expect` de vitest (sin `vi.mock` de módulos de Node y sin importar ningún
  `route.ts`, por reglas del repo).
- Tras este paso, cambiar de servidor no exige recompilar: lo que le queda a F0 es la prueba
  del contrato en dos aparatos reales.

---

## 5 · Riesgos y lo que depende de Alex

### 5.1 · Riesgos

**1 · La sesión al cambiar de servidor.** Las cookies de sesión (`sb-<ref>-auth-token`, de
`@supabase/ssr`) son del **origen de la web**, no del servidor de datos — así lo trata ya la
migración de origen nativa, que las detecta por prefijo (`native/servidor-local/migracion-origen.js:90`,
`^sb-.+-auth-token`). Pero los **tokens** los firma el proyecto que los emitió: su `sub`, su rol
`anon` y su claim de proyecto. Al cambiar de servidor, la primera llamada con el token viejo es
un 401 y el `getUser()` del middleware decide «sin sesión». El camino corto es el de la
migración de origen: **al cambiar el ajuste, se descartan las cookies `sb-*` del origen** y la
persona entra de nuevo — el paso 4 lo hace. Queda abierto reanudar la sesión con la persona ya
reconocida por la neurona local (§5.2).

**2 · RLS por servidor.** Cada servidor — cada proyecto de Supabase, cada instancia propia —
trae su esquema y su RLS: cambiar de nube es cambiar de tablas. Hoy no hay migración de datos
entre servidores (solo la reconciliación idempotente del correo de la malla, MSJ1108C, y el
bus `relevo_eventos`). El resolutor **no promete que los datos sigan**: cambia la puerta, no
muda las cajas. La promesa de datos vive en F2 (registro vivo firmado, decisión 3 del §11).

**3 · CSP.** Hoy no bloquea: `connect-src` es `https: wss:` + loopback (`next.config.ts:201`) y
la política es `Report-Only` (Adenda 139). El riesgo es el acotado: si algún día `connect-src`
enumera hosts explícitos, el resolutor y la CSP tienen que leer el **mismo** ajuste, o se rompe
la nube elegida desde la app. La misma tarea que acote la CSP tiene que acoplarla al
resolutor, a la vez.

**4 · Caché del service worker.** `sw-v8.js` no cachea la API de datos, pero sí la app y sus
paquetes: al cambiar el ajuste hay que pedirle `skipWaiting` con una versión nueva y limpiar la
precarga, para que nadie siga ejecutando una app vieja con el ajuste nuevo (el paso 4 incluye
el aviso al service worker).

### 5.2 · Lo que depende de Alex

- **Decisión 3 del §11 («la nube como réplica»).** Este resolutor solo cambia *a qué puerta se
  llama*; el cambio de fondo — «Supabase manda» → «la neurona manda y la nube se reconcilia» —
  es F2 por sistema, empezando por los mensajes. Dos consecuencias que conviene decidir **antes
  del paso 4**, porque condicionan la pantalla de ajuste: (a) ¿el modo «servidor-propio» exige
  un servidor que ya hable el esquema del OS (mismo `auth`, mismas RLS — una instancia de nube
  StarSeed desplegada por la persona), o también un protocolo propio distinto? El contrato de servidores propios (`architecture/servidor-propio-protocolo.md`) describe hoy
  un relé de contenido HTTP (`postToEndpoint`/`pullFromEndpoint`, `docs/examples/starseed-mesh-server/`):
  no es una nube de datos compatible con el esquema del OS. O bien el modo exige una instancia
  del OS (API de Next) servida por la persona, o bien hay que definir ese protocolo — decisión
  de mando. (b) ¿Qué se enseña en la
  pantalla cuando los datos no viajan: el aviso «tus datos de esta nube no viajan al nuevo»? Proponemos **sí**:
  el resolutor no muda cajas (riesgo 2).
- **Reanudación de sesión entre servidores.** Descartar cookies y pedir login de nuevo es
  honrado, pero si la neurona tiene la clave maestra de cuenta (IDN1108A, sin interfaz), el
  re-entrar sin pedir credenciales puede ser firmado local. Depende de cómo Alex quiera el
  vínculo cuenta ↔ nube cuando la nube NO es la autoridad (decisión 3 de nuevo): sesión local
  primero (como dice §7.6 del contrato) o credenciales primero.
- **El modo por defecto de una nube nueva.** Si una persona instala el OS y nunca configura
  nada, ¿entra en `nube-starseed` (lo de hoy) o se le pide elegir en el arranque? Propuesta:
  nube por defecto y un aviso pequeño con las opciones; cambiar a «solo malla» debe costar dos
  toques, porque degrada sistemas (§3, tabla de modos). Ésta es una decisión de mando, no la
  puede tomar el resolutor solo.
