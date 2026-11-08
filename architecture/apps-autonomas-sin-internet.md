# Apps autónomas sin internet: el servidor local dentro de la app (contrato · APP1107A + APP1107B + SEG1107A + TAM1107A + CAP1107A + AND1107A · 2026-11-07)

**Petición de Alex (07-11):** «Las apps instaladas dejan de funcionar cuando se pierde la conexión a internet,
cuando deberían ser completamente autónomas e independientes, sin necesidad de ningún tipo de conexión, todo
integrado en cada neurona, con las opciones mesh P2P o de cualquier tipo de internet pero sin dependencias. Al
instalar la app desde cualquier medio debe contener ya todo lo necesario para funcionar por sí misma aun sin
internet en todas las secciones, páginas y áreas.»

**Causa (comprobada):** `native/src-tauri/tauri.conf.json` tenía `frontendDist`, `devUrl` y la ventana en
`https://starseed-os.vercel.app`: la app era una ventana a la web publicada; sin internet no cargaba nada (lo
visitado antes podía salir del service worker, nada más). Nexus y Café, igual con su web.

**Regla de este documento:** cada línea dice si está **HECHO** (en el repo y probado), **ESCRITO SIN PUBLICAR**
(en el repo, probado aquí, pendiente del primer lanzamiento nativo) o **PENDIENTE**.

---

## 0. En una pantalla

| Qué | Estado |
|---|---|
| Escritorio (macOS, Windows, Linux) de **StarSeed OS**: la app trae el build `standalone` de Next + un Node oficial y abre `http://127.0.0.1:<puerto>` | ESCRITO SIN PUBLICAR · probado en Linux con la app real (Tauri debug + `.deb`): arranca, sirve, reinicia y se apaga |
| Página de arranque local (sin red) mientras el servidor arranca | ESCRITO SIN PUBLICAR (`native/arranque/index.html`) |
| Respaldo: sin paquete o si no arranca → web publicada, y lo dice; sin internet tampoco → lo dice y reintenta | ESCRITO SIN PUBLICAR |
| `/api/*` va a la web publicada cuando hay internet (como hasta hoy) y al servidor local cuando no | HECHO (envoltorio + pruebas) |
| Aviso «Sin conexión: trabajando en local» | HECHO (`AvisoSinConexion`, layout raíz) |
| CI: Next una vez + Node verificado por SHA-256 + ad-hoc en macOS; si falla, el instalador sale igual sin servidor local | ESCRITO SIN PUBLICAR (`native-build.yml`) |
| Android (también las APK ya instaladas, v0.4.3), PWA y navegador: la app entera sin conexión con el **service worker v8** (precarga en segundo plano de las páginas principales, su código y `public/`) | ESCRITO SIN PUBLICAR (SW1107A) · llega con publicar la web, sin reinstalar nada · probado con el SW de verdad en un entorno simulado y en Chrome real contra una mini app (§9.1.1); falta con un build real de Next (T10) |
| Android con servidor propio dentro (nodejs-mobile, el mismo envoltorio) | ESCRITO SIN PUBLICAR, detrás de un **interruptor de build APAGADO** (AND1107A, §9.1) · compila para aarch64/armv7, probado lo puro + el envoltorio en modo Android + el armado con el zip real; falta un aparato real |
| iOS con servidor propio | PENDIENTE (§9.2) |
| Nexus y Café | Siguen con su web. Plan en §9.3 |
| Actualizar el servidor local por capas sin reinstalar (T1): capa firmada con la clave del updater, canal fijo, «Actualizar ahora» que reinicia solo el Node, vuelta atrás si no pasa la salud | ESCRITO SIN PUBLICAR (CAP1107A, §10) · probado en Linux con la app real (bajar, verificar, relevo en el mismo puerto y vuelta atrás); el canal está APAGADO hasta que Alex ponga `SERVIDOR_CAPAS_CANAL=1`; falta macOS y Windows (T12) |
| Traer al servidor local lo que la app tenía en el origen de la web publicada (localStorage + IndexedDB), una vez y sin pisar nada (T4) | ESCRITO SIN PUBLICAR (APP1107B, §2.1) · pruebas puras (Rust y JS) + IndexedDB de mentira + **probado en Linux con la app real** (Tauri 2.12.5 + WebKitGTK, Xvfb, la «web» en otro origen); falta macOS y Windows (T12) |
| … **también sin internet** en el primer arranque: HTML del binario con el origen de la web (T4b) | ESCRITO SIN PUBLICAR (TAM1107A, §2.1.1) · Rust 83/83 + vitest + `cargo check` cruzado macOS/Windows + **probado en Linux con la app real sin red** (cero peticiones a la web); falta macOS y Windows con la app real (T12) |
| Instaladores más ligeros: los `*_client-reference-manifest.js` sin repeticiones (T13) | ESCRITO SIN PUBLICAR (TAM1107A, §6.1) · medido con el `.next` real de main: **−172 MB instalado** (192 → 20 MB), −1,1 MB en dmg/deb/AppImage; mismo HTML byte a byte con el standalone real de Next 15.5.21 |
| Permisos de los comandos propios para la web (tauri ≥ 2.11.1 los rechaza desde un origen remoto sin ellos) | ESCRITO SIN PUBLICAR (APP1107B, §3) · comprobado en Linux: con el código de main, `servidor_local_estado`, `device_info` y `antenas_estado` desde `127.0.0.1:47610` → «not allowed»; con APP1107B responden |
| La app sin lo que solo vive en la Mac (`/api/mando/**`) (T8) | ESCRITO SIN PUBLICAR (APP1107B, §5 y §6) |
| El servidor local solo atiende a la ventana de la app: ni otras webs del navegador, ni DNS rebinding, ni otros programas sin el pase, ni el puerto interno de Next (T11) | HECHO (SEG1107A, §3.1: guarda del envoltorio + pase de Rust + pruebas) · probado con un Next 15.5.21 real, WebKitGTK 2.52, Chromium y la app real (Tauri debug, Linux); llega con el próximo lanzamiento nativo; falta verlo en macOS y Windows (con T12) |

---

## 1. Arquitectura

```
Ventana «main»
  1) tauri://localhost/index.html   ← native/arranque/index.html (dentro del binario, sin red)
  2) http://127.0.0.1:47610/        ← cuando el servidor responde con SU firma
        │
        ▼
starseed-node  starseed-arranque.cjs      (Node oficial 22.23.4, externalBin junto al ejecutable)
  · escucha SOLO en 127.0.0.1:<puerto fijo>
  · ANTES de repartir, la guarda (guarda.cjs · SEG1107A, §3.1): Host exacto; en /api/*, en lo que no
    sea GET/HEAD y en los WebSocket, Origin/Sec-Fetch-Site propios + la cookie del PASE de Rust
  · GET /__starseed/entrar?t=<pase>&a=<ruta> → cookie starseed_pase (HttpOnly; Strict) + 303
  · GET /__starseed/salud  → {servidor, firma, listo, red, pase, interna}      (lo lee Rust)
  · GET /__starseed/red    → {red: en-linea|sin-conexion|…}       (lo lee el aviso de la web)
  · /api/*  con internet   → https://starseed-os.vercel.app (reenvío; cookies adaptadas a 127.0.0.1)
  · /api/*  sin internet   → Next local (si la web no contesta, la petición se repite en local, ≤ 8 MB)
  · todo lo demás          → Next local
        │
        ▼
server.js de Next (standalone) en 127.0.0.1:<puerto interno al azar>
  <recursos>/servidor/  = .next/standalone + .next/static + public + starseed-servidor.json
```

| Pieza | Archivo |
|---|---|
| Lógica pura (rutas, puertos, entorno, salud, reinicios, avisos) — solo `std`, 12 pruebas | `native/src-tauri/src/servidor_local_logica.rs` |
| Pegamento con Tauri (lanzar, vigilar, navegar, apagar, comando `servidor_local_estado`) | `native/src-tauri/src/servidor_local.rs` |
| Registro (3 líneas: `mod`, `iniciar` en `setup`, `apagar` en `RunEvent::Exit`) | `native/src-tauri/src/lib.rs` |
| Envoltorio Node (puerta, reenvío, vigía del padre) | `native/servidor-local/starseed-arranque.cjs` |
| Guarda del envoltorio (Host, Origin/Sec-Fetch-Site, pase, CORS, Next interno) — lógica pura, 19 pruebas (SEG1107A · T11) | `native/servidor-local/guarda.cjs` (pruebas: `__tests__/guarda.test.cjs`) |
| Armado del paquete (CI) y Node fijado | `native/servidor-local/preparar.mjs`, `native/servidor-local/node.json` |
| Página de arranque | `native/arranque/index.html` (`build.frontendDist`) |
| Migración del origen web (T4): lógica pura del navegador (qué claves, códec de IndexedDB, fusión, página importadora) | `native/servidor-local/migracion-origen.js` (pruebas: `src/lib/nativa/__tests__/migracion-origen.test.ts`) |
| Migración: lógica pura de Rust (marcador, sesión fuera, copia sin secretos, trozos) — 8 pruebas | `native/src-tauri/src/migracion_origen_logica.rs` |
| Migración: pegamento (ventana oculta, comandos `migracion_origen_*`, copia y marcador en el disco) | `native/src-tauri/src/migracion_origen.rs` |
| Aviso «Tus datos de la versión anterior ya están aquí» | `src/lib/nativa/migracion-origen.ts`, `src/components/nativa/aviso-migracion-origen.tsx` |
| Lo que el build nativo deja fuera (T8) | `native/servidor-local/solo-mac.mjs` |
| Migración sin internet (T4b): lo que habla con cada motor (WebKitGTK / WKWebView / WebView2), sin Tauri | `native/src-tauri/src/migracion_origen_local.rs` (módulo de `migracion_origen.rs`; lógica pura y pruebas en `migracion_origen_logica.rs`) |
| Manifiestos de cliente sin repeticiones (T13) — 6 pruebas, una con el `evalManifest` de verdad de Next | `native/servidor-local/compactar-manifiestos.mjs` (pruebas: `__tests__/compactar-manifiestos.test.mjs`) |
| (CAP1107A · T1) Capas: lógica pura (versiones, compatibilidad, elección, promoción/vuelta atrás, qué borrar, manifiesto firmado, lector estricto de tar) — solo `std`, 12 pruebas | `native/src-tauri/src/servidor_capas_logica.rs` |
| Capas: pegamento (vigía del canal, curl, firma minisign, gzip, extracción con SHA por archivo, estado) — 5 pruebas con cargo | `native/src-tauri/src/servidor_capas.rs` |
| Capas: armar (tar determinista + manifiesto), puntero del canal y poda — 8 pruebas | `native/servidor-local/capa.mjs` (pruebas: `__tests__/capa.test.mjs`) |
| Capas: firmar y publicar (CI) | `native/servidor-local/publicar-capa.sh`, job `servidor-capa` de `native-build.yml`, `.github/workflows/servidor-capa.yml` |
| Capas: «Actualizar ahora» (solo la ventana `main` desde el servidor local) | comando `servidor_local_actualizar` (`servidor_local.rs`) + capability `servidor-capas.json` |
| Aviso en la web | `src/lib/nativa/sin-conexion.ts`, `src/components/nativa/aviso-sin-conexion.tsx` |
| Build de Next para la app | `next.config.ts` con `STARSEED_APP_NATIVA=1` (imágenes sin optimizar, sin sharp, ISR en memoria) |
| Sesión sin red | `src/utils/supabase/middleware.ts`: con `STARSEED_SERVIDOR_LOCAL=1`, tope de 2,5 s y un fallo de red no echa a `/login` |

**Rutas en la app instalada.** Node: junto al ejecutable (`Contents/MacOS/starseed-node`,
`C:\Program Files\StarSeed OS\starseed-node.exe`, `/usr/bin/starseed-node`). Servidor: `<resource_dir>/servidor`
(`Contents/Resources/servidor`, junto al `.exe`, `/usr/lib/StarSeed OS/servidor`). Registro:
`<app_log_dir>/servidor-local.log` (se rota a 5 MB). Comprobado en el `.deb` de Linux.

## 2. Puertos y origen

- **Diez puertos fijos: 47610–47619**, el primero casi siempre. Fijos a propósito: el origen de la web es
  `http://127.0.0.1:<puerto>` y `localStorage`/IndexedDB son por origen; con un puerto al azar, cada arranque
  parecería una neurona vacía. Si el preferido está ocupado (la instancia anterior aún suelta el puerto tras una
  actualización) se reintenta 10 × 300 ms antes de pasar al siguiente. Un reinicio vuelve al MISMO puerto.
- Los diez están en tres sitios que una prueba mantiene iguales (`src/lib/nativa/__tests__/sin-conexion.test.ts`):
  `PUERTOS` en Rust, `remote.urls` de `capabilities/default.json` y `desktop.json`, y `PUERTOS_SERVIDOR_LOCAL`.
- **Origen nuevo = medio nuevo** (`architecture/persistencia-entre-medios.md`): la primera vez, con internet, se
  inicia sesión y la cuenta trae lo que viaja (`SYNCED_KEYS`, escritorios, dashboards…). Lo que solo vivía en el
  `localStorage`/IndexedDB del origen de la web publicada lo trae la migración de §2.1 (T4).

### 2.1 Migración del origen web al origen local (T4 · APP1107B · ESCRITO SIN PUBLICAR)

**Problema.** Hasta la 0.4.3 la ventana abría `https://starseed-os.vercel.app`; desde APP1107A abre
`http://127.0.0.1:47610`. `localStorage` e IndexedDB son por origen: escritorios, widgets, ajustes, historiales,
vínculos de neuronas, mensajes de la malla, la identidad de la malla… desaparecerían al actualizar (lo de la cuenta
vuelve con la sesión; lo demás no).

**Cómo (los tres sistemas, el mismo camino).** La app ya tiene en disco el almacén del origen viejo (WKWebView usa
el `WKWebsiteDataStore` por defecto de `app.starseed.os`; WebView2, la carpeta de datos de usuario de la app;
WebKitGTK, su `WebContext` por defecto) y cualquier ventana nueva de la app comparte ese almacén. Así que:

1. **Exportar** (`migracion_origen.rs`, desde `servidor_local::arrancar` con el paquete ya comprobado): si el
   marcador del disco dice que falta y hay internet, Rust abre una ventana **oculta** («migracion-origen») en
   `https://starseed-os.vercel.app/offline.html?starseed-migracion=1` (HTML estático, sin el código del OS: no
   escribe nada) con un **script de inicio** (`migracion-origen.js` entero, inyectado por Tauri al empezar el
   documento, antes que la página). Si `location.origin` es el de la web: lee **todo `localStorage`** (menos la
   sesión) y **todas las bases de IndexedDB** (`indexedDB.databases()`, o las cinco de la app si el WebKit es
   viejo, abriéndolas SIN crearlas) con un cursor y topes, y lo pasa a Rust por IPC en trozos de 1 MiB
   (`migracion_origen_exportar`). Rust comprueba ventana + origen, quita otra vez cualquier sesión, escribe la
   copia y cierra la ventana. Tope: 40 s.
2. **Importar** (`/__starseed/migracion`, página del envoltorio del servidor local, SIN el código del OS): la
   primera vez que la ventana principal va al servidor local, Rust la lleva aquí en vez de a `/`. La página espera
   a la exportación (`migracion_origen_estado`), pide los trozos (`migracion_origen_datos`), fusiona, confirma
   (`migracion_origen_confirmar`), deja el marcador del aviso y va a `/`. Como corre ANTES que el OS, ningún
   componente escribe valores por defecto que luego «ganarían» a los de la persona. Pase lo que pase (sin script,
   sin puente, 120 s) acaba en `/`.

**Qué viaja y qué no.**

| Qué | Viaja a la app nueva | A la copia del disco |
|---|---|---|
| Sesión de Supabase (`sb-…-auth-token`, sus trozos y `-code-verifier`, `supabase.auth.*`, cualquier valor con `access_token` + `refresh_token`) | **No** (se quita en JS y otra vez en Rust): se vuelve a iniciar sesión en la app; la página y el aviso lo dicen | **No** |
| Lo que settings-sync nunca sube (`NEVER_SYNCED_KEYS`/`_PREFIXES`: claves de IA cifradas, identidad y llaves de la malla, id de neurona, bloqueo, tokens de los medios…) y todo nombre con pinta de secreto | **Sí**: es la MISMA neurona (así la malla la sigue reconociendo y no cambia de identidad) | **No**: va `{"$ss":"omitido","motivo":"secreto","bytes":n}` |
| El resto de `localStorage` | Sí | Sí |
| IndexedDB: registros con valores de structured clone (fechas, Blob/File, binarios, Map, Set, `undefined`, BigInt…) con un códec etiquetado (`$ss`) | Sí, ≤ 16 MiB por registro y ≤ 64 MiB en total | Sí |
| IndexedDB que no se puede copiar: la privada **no extraíble** de los vínculos entre cuentas (`starseed-mesh-par`, un `CryptoKey`), ciclos, otras clases | No: se cuenta y se dice; la app nueva crea un par nuevo (los vínculos ya aceptados se renuevan, `vinculos-entre-cuentas.md` §6) | No |
| Bases de sesión de terceros (`firebaseLocalStorageDb`…) y cachés (`workbox-*`, «cache») | No | No |
| Cookies | No (son por host; la de la sesión se rehace al entrar) | No |

**Fusión (la regla más segura).** Por clave: lo que **no existe** en el origen local se trae; lo que existe con el
**mismo valor** no se toca; lo que existe con **otro valor se queda como está** (y se cuenta como conflicto: el
valor viejo sigue en el origen web y en la copia). IndexedDB: si la base no existe se crea con la versión, los
almacenes y los índices de la exportada; si existe con versión menor se sube a la exportada creando solo los
almacenes que falten; **nunca se baja** una versión (si la app nueva ya la subió, solo se añaden registros a los
almacenes que tenga). Cada registro con `add` (si la clave ya existe → «ya estaba», nunca `put`).

**Una sola vez, sin pérdidas.** `<app_data>/migracion-origen/estado.json` (0600): `hecha` → no se vuelve a pasar;
`pospuesta` → se reintenta en el siguiente arranque; a los **3 intentos** → `abandonada` (para no retrasar cada
arranque). El marcador es por **versión de la migración** (`VERSION_MIGRACION = 1`), no de la app: una v2 que
traiga más cosas pasaría UNA vez más sin pisar nada; volver a pasar en cada actualización resucitaría lo que la
persona borró. Además el origen local guarda `starseed.migracion-origen.v1` (no viaja con la cuenta): si dice
`hecha`, la página no vuelve a importar aunque Rust no llegara a guardar su marcador. **El original nunca se borra.**
Copia: `<app_data>/migracion-origen/copia-<versión>-<ms>.json` (0600, sin sesión ni secretos), una por exportación.
`<app_data>` = `~/Library/Application Support/app.starseed.os` (macOS), `%APPDATA%\app.starseed.os` (Windows),
`~/.local/share/app.starseed.os` (Linux).

**Aviso** (`AvisoMigracionOrigen`, layout raíz, solo en el servidor local): «Tus datos de la versión anterior ya
están aquí» con lo traído, los conflictos, lo que se quedó y «La sesión no se copia por seguridad: si te la pide,
vuelve a iniciarla en esta app»; o «Aún no están aquí tus datos de la versión anterior» con el motivo (sin
internet → se reintenta; tras 3 intentos → dónde está la copia). Se cierra y no vuelve.

**Por sistema (qué cubre).**

| | Con internet al primer arranque | Sin internet al primer arranque |
|---|---|---|
| macOS (WKWebView) | Todo lo de la tabla | Desde T4b, lo mismo sin red (`loadHTMLString:baseURL:`, §2.1.1). Antes: se posponía al siguiente arranque con red |
| Windows (WebView2) | Todo; el service worker v7 del origen web (si lo había) sirve `offline.html` de su caché o de la red, da igual: solo importa el origen | Desde T4b, lo mismo sin red (`WebResourceRequested`, §2.1.1) |
| Linux (WebKitGTK) | Todo; si el WebKitGTK no tiene `indexedDB.databases()`, solo las cinco bases de la app | Desde T4b, lo mismo sin red (`load_html`, §2.1.1; **probado con la app real**) |

**Leer el disco sin red (opción b): NO, a propósito.** WKWebView guarda cada origen en carpetas con hash salado
(`WebsiteData/Default/<hash>/<hash>/LocalStorage/localstorage.sqlite3`) y su IndexedDB en SQLite con valores
serializados por WebKit; WebView2 usa LevelDB (con compresión y prefijos de Chromium) y la IndexedDB de V8; las tres
cambian de formato entre versiones y el almacén está **abierto y vivo** mientras corre la ventana (leerlo a la vez
puede dar datos a medias o corromperlo). En su lugar, la alternativa limpia: T4b (§2.1.1).

#### 2.1.1 Sin internet: el HTML del binario con el origen de la web (T4b · TAM1107A · ESCRITO SIN PUBLICAR)

**Qué hace.** Si al exportar no hay internet (`hay_internet()` de `servidor_local.rs`), la ventana oculta ya no
se pospone: se crea en `about:blank` (no pide nada) y recibe `HTML_SIN_RED` —una página de una línea que va DENTRO
del binario, sin scripts ni recursos— **con la dirección** `https://starseed-os.vercel.app/offline.html?starseed-migracion=1&sin-red=1`.
Como la dirección del documento es la de la web publicada, su ORIGEN también: el propio motor abre su
`localStorage` y su IndexedDB de ese origen, sin red y sin que nadie lea sus archivos. Lo demás es lo de §2.1 tal
cual: Tauri inyecta el exportador como script de inicio, el puente IPC y la capability `migracion-exportar` ven esa
dirección, y Rust comprueba etiqueta y origen en cada trozo.

| Sistema | Cómo se pone la dirección sin red | Archivo |
|---|---|---|
| Linux (WebKitGTK) | `webkit_web_view_load_html(html, base_uri)` | `migracion_origen_local.rs::cargar_webkitgtk` |
| macOS (WKWebView) | `-[WKWebView loadHTMLString:baseURL:]` (objc2) | `…::cargar_wkwebview` |
| Windows (WebView2) | filtro `WebResourceRequested` SOLO para `<web>/offline.html` en ESA vista (la principal no lo ve) que responde desde memoria (`SHCreateMemStream`), y `Navigate(<web>/offline.html?…)`: la petición nunca sale a la red | `…::cargar_webview2` |

- **Con internet no cambia nada**: la página de verdad, como en §2.1 (probado otra vez abajo).
- `STARSEED_MIGRACION_SIN_RED=1` fuerza el modo sin red aunque haya internet (para probarlo en T12 sin apagar el
  Wi-Fi). El estado (`migracion_origen_estado`) dice `modo: "red" | "sin-red"`.
- Dependencias: `webkit2gtk 2`, `objc2 0.6` + `objc2-foundation 0.3`, `webview2-com 0.39` + `windows 0.62`, cada una
  solo en su sistema: **las mismas crates y versiones que ya trae tauri 2.12** (se unifican; el `Cargo.lock` no
  gana ningún paquete). Si un día tauri sube de versión una de ellas, hay que subir la nuestra a la vez (riesgo 12).
- Un sistema que no sepa (BSD…) sigue como antes: se pospone sin internet.

**Probado (2026-11-07).** (1) Rust: `sin_red_solo_cuando_hace_falta_y_se_sabe` y
`la_pagina_sin_red_tiene_el_origen_de_la_web_y_no_pide_nada` (crate real, 83/83). (2) vitest (3 nuevas en
`migracion-origen.test.ts`): el script de inicio que arma Rust, TAL CUAL, corre en una ventana con esa dirección y
exporta igual que con red (sin la sesión), y en `about:blank`, en el origen local o en un dominio parecido no hace
nada ni deja la marca que bloquearía la exportación de después. (3) `cargo check` cruzado de
`migracion_origen_local.rs` para `aarch64-apple-darwin` y `x86_64-pc-windows-msvc` con las versiones del
`Cargo.lock` de la app (objc2 0.6.5, objc2-foundation 0.3.2, webview2-com 0.39.1, windows 0.62.2): 0 avisos, 0
errores (el crate entero no se puede comprobar así: `ring` necesita el compilador de C de cada sistema).
(4) **App real en Linux** (build `debug`, Tauri 2.12.5 + WebKitGTK 2.52, Xvfb; la «web publicada» cambiada solo en
la prueba por `http://localhost:8899`, como en §2.1): arranque 1 CON la web encendida sembró en su origen 7 claves
(con una sesión `sb-…-auth-token`, `starseed.ai.providers` y `starseed.mesh.identity.v1`) y 3 bases (notas con
`Blob`/`Date`/`Set` e índice, líneas con `autoIncrement`, el par ECDH con un `CryptoKey`); se APAGÓ la web; arranque 2:
`modo: "sin-red"`, la copia quedó escrita antes incluso de que arrancara el Node del servidor local,
`estado.json` → `hecha`, 6 ajustes y 4 registros traídos, 3 bases, «no se puede copiar (CryptoKey)»
1, sesión no copiada 1; el `/` del servidor local vio las 6 claves sin la sesión y las 3 bases; la copia (0600) sin
`refresh_token` ni los valores secretos; y el registro de la web: **cero peticiones** durante el arranque 2. Otra
carpeta de datos con la web encendida: `modo: "red"`, la ventana pidió `/offline.html?starseed-migracion=1` y
`hecha` con lo mismo (el camino con red no cambió).

**Límites honestos.** (1) macOS y Windows: compilado en cruzado, sin probar con la app real (T12; receta en §8 con
`STARSEED_MIGRACION_SIN_RED=1`). (2) WebView2: si el origen de la web tiene registrado el service worker (v7/v8),
la navegación la contesta él antes que nuestro filtro (su `offline.html` guardado): da igual, el origen es el mismo y
el exportador corre igual. (3) Que `loadHTMLString:baseURL:` dé acceso al IndexedDB del origen en WKWebView es lo que
hace WebKit (el mismo motor que WebKitGTK, donde está probado), pero no se ha visto aún en una Mac.

**Límites honestos.** (1) Si el servidor local arranca un día en otro puerto (47611…), es otro origen: no se migra
otra vez (el marcador es de la app) y ese origen empieza vacío — ya pasaba en APP1107A (§2). (2) Los registros de más
de 16 MiB (p. ej. notas de voz largas) se quedan en la versión anterior y se dice cuántos. (3) Sin probar aún con la
app real en macOS y Windows (T12).

**Probado en Linux con la app real (2026-11-07).** Build `debug` del crate con la web publicada cambiada (solo en la
prueba) por una web de mentira en `http://localhost:8899` (otro origen, como la de verdad) que sembró en su origen 7
claves (con una sesión `sb-…-auth-token`, `starseed.ai.providers` y `starseed.mesh.identity.v1`) y 3 bases de
IndexedDB (notas con `Blob`, `Date`, `Set` e índice; líneas con `autoIncrement`; el par ECDH con un `CryptoKey` no
extraíble de verdad). Arranque 1 (sin poder exportar): a los 40 s `pospuesta`, la página importadora confirmó por IPC
y el OS abrió. Arranque 2: la ventana oculta pidió `offline.html`, exportó, Rust escribió la copia (80 ms) y la
página importó y confirmó (≈ 0,5 s en total): `estado.json` → `hecha`, 6 ajustes y 4 registros traídos, «no se
puede copiar (CryptoKey)» 1, sesión no copiada 1; el `/` del servidor local vio las 6 claves (sin la sesión), las
tres bases con su versión, el índice, las claves 1 y 2 y el audio, la fecha y el conjunto intactos; la copia (0600)
sin `refresh_token` ni los valores secretos. Arranque 3: ni ventana oculta ni página importadora; los comandos
propios responden desde `127.0.0.1` y `migracion_origen_exportar` se rechaza desde la ventana principal.

## 3. Seguridad

- El servidor **solo escucha en 127.0.0.1** (la puerta y Next). Nunca `0.0.0.0`: desde la red local no se ve.
- **Sin secretos**: el entorno del Node lleva solo `STARSEED_*`, `HOSTNAME`, `NODE_ENV` y la telemetría apagada
  (prueba `entorno_sin_secretos_y_solo_loopback`); se quitan `NODE_OPTIONS`, `NODE_PATH` y `PORT` heredados.
  `preparar.mjs` no copia ningún `.env` del standalone y falla si queda uno. Lo que necesita claves del
  servidor se reenvía a la web publicada cuando hay internet.
- **Firma por arranque**: Rust genera 128 bits al azar, se los pasa al Node y solo lleva la ventana al puerto si
  `/__starseed/salud` devuelve esa firma. Otro programa en ese puerto = «ajeno»: no se navega ahí nunca. La firma
  es pública (cualquiera que pregunte a la salud la ve); lo que demuestra «soy la ventana de la app» es el PASE
  (§3.1), que no sale nunca por la salud.
- **Capabilities**: los diez orígenes exactos (no `127.0.0.1:*`) reciben los mismos permisos que la web
  publicada. Límite honesto: otro usuario de la MISMA máquina que ocupe uno de esos puertos mientras el nuestro
  está caído podría servir una página a la ventana si esta recarga sola en ese hueco; Rust no navega ahí (firma),
  pero no puede impedir una recarga de la propia página. Ventana: el reinicio (≤ 5 s).
- **Node oficial verificado**: versión y SHA-256 fijados en `node.json` (copiados de `SHASUMS256.txt` de
  nodejs.org); el CI compara con ESOS valores, no con lo que baje en el momento.
- **Sin huérfanos**: el envoltorio sale cuando se cierra su entrada estándar (la app la tiene abierta mientras
  vive). Probado matando la app de golpe: el Node salió solo.
- **Comandos propios y ACL (APP1107B).** Desde **tauri 2.11.1** («Enforce ACL checks for IPC requests from remote
  origins even when no AppManifest is configured») una página de un origen REMOTO —la web publicada y también
  `http://127.0.0.1:47610…`— solo llega a un comando propio (`antenas_estado`, `check_update`, `run_terminal`,
  `servidor_local_estado`…) si una capability con `remote` le concede `allow-<comando>`; sin manifiesto de la app esos
  permisos ni existen. El CI no fija versión (no hay `Cargo.lock` en el repo): el próximo build nativo sale con
  tauri ≥ 2.12 y, sin esto, **toda** llamada de la web a un comando propio se rechazaría («not allowed by ACL»).
  Ahora `build.rs` declara `COMANDOS_APP` (genera `allow-*`; `permissions/autogenerated/` no se versiona) y
  `default.json` / `desktop.json` conceden a la ventana `main` exactamente los mismos comandos que antes. La
  migración tiene capabilities propias y estrechas (`local: false`): `migracion-exportar` (solo la ventana oculta,
  solo desde la web publicada, solo `migracion_origen_exportar`) y `migracion-importar` (solo `main`, solo los diez
  orígenes locales); Rust comprueba además etiqueta y origen en cada llamada. Una prueba
  (`contrato-rust.test.ts`) vigila que `lib.rs`, `build.rs` y las capabilities casen.
- **`/api/mando/**` nunca desde la app (T8).** Su puerta `guardianMando` trata 127.0.0.1 como «esta Mac» y lo
  abriría sin sesión en el servidor local (sin red, `/api` va a Next local). El build nativo lo quita (§5) y el
  envoltorio responde 404 a `/api/mando` (normalizando `//`, `.`/`..`, `%xx` y mayúsculas) aunque estuviera.

### 3.1 Guarda contra otras webs, DNS rebinding y otros programas (T11 · SEG1107A · HECHO)

**Riesgo.** El servidor local escucha en `127.0.0.1:4761x`. Cualquier web abierta en un navegador de la misma
máquina puede mandarle peticiones (un `POST` «simple», un `<form>`, un `<img>`, `sendBeacon`) aunque no pueda leer
la respuesta; un dominio que resuelva a 127.0.0.1 (DNS rebinding) podría además leerla; y sin red `/api/*` va al
Next local, donde varias rutas se abren sin sesión a «esta máquina» (`esDespliegueLocal`: voz, recursos de IA,
conocimiento…). El Next de dentro escucha además en otro puerto al azar que una web podría encontrar probando.

**Qué hace** (`native/servidor-local/guarda.cjs`, lógica pura; el envoltorio la aplica ANTES de repartir):

| Petición | Regla | Si no |
|---|---|---|
| Cualquiera | `Host` exacto `127.0.0.1:<puerto>` o `localhost:<puerto>`; la ruta empieza por `/` | 421 `host-ajeno` (rebinding) / 400 |
| `/api/*` (cualquier método), todo lo que no sea GET/HEAD (también server actions, route handlers fuera de `/api` y `OPTIONS`) y todo «upgrade» (WebSocket) | `Origin`, si viene, = el origen local exacto; `Sec-Fetch-Site`, si viene, `same-origin` o `none`; y la cookie `starseed_pase` = el pase de este arranque | 403 `origen-ajeno` / `sitio-ajeno` / `sin-pase` / `pase-malo` / `sin-pase-configurado` |
| GET/HEAD fuera de `/api` (páginas, `/_next/static`, `public`, `/__starseed/salud`…) | Pasan; si vienen de otro sitio, solo la navegación de la pestaña entera (un enlace, la vuelta de OAuth a `/auth/callback`) | 403 `recurso-ajeno` (`<script>`, `<img>`, fetch) / `marco-ajeno` (`<iframe>`) |
| `GET /__starseed/entrar?t=<pase>&a=<ruta>` | Con el pase: `Set-Cookie: starseed_pase=…; Path=/; HttpOnly; SameSite=Strict` y 303 a la ruta (solo del mismo origen) | 403 |

La ruta se decide normalizada (`%xx` hasta tres veces, `\`, `//`, `.`/`..`, mayúsculas): ante la duda, se trata
como `/api`. Un rechazo es un JSON `{error: "puerta-local", motivo, mensaje}` con `x-starseed-guarda: <motivo>`,
sin caché y sin nada de la petición. Las navegaciones de la app no cambian: la primera carga, recargas, enlaces
internos, RSC, estáticos, el service worker, `/__starseed/red` y la página de migración pasan sin más.

**El pase.** Rust genera 256 bits al azar UNA vez por arranque de la app (`pase_nuevo`, dos mitades de SipHash con
claves del generador del sistema, cada una en su hilo), los escribe como primera línea de la entrada estándar del
Node (`pase:<hex>`; la tubería sigue abierta como vigía del padre) y lleva la ventana a
`/__starseed/entrar?t=<pase>&a=/` (o `a=/__starseed/migracion`, T4). Nunca va al entorno del proceso (el envoltorio
borra además `STARSEED_PASE_VENTANA`, que solo existe para pruebas a mano), ni al registro, ni a
`servidor_local_estado`, ni a la web publicada (se quita de la cookie al reenviar `/api`). Un reinicio del Node
recibe el MISMO pase: la página no se recarga y la cookie sigue valiendo. «listo» espera también al pase (tope 3 s;
sin él, `/api` y los cambios responden 403 y el registro lo dice). La salud dice `pase: true|false` (nunca cuál).

**CORS.** Ninguna respuesta sale con CORS abierto: se quitan todas las `Access-Control-*` salvo que `Allow-Origin`
sea exactamente el origen local, y `Access-Control-Allow-Private-Network` siempre (en lo local y en lo reenviado).

**El Next interno.** Antes de cargar `server.js`, el envoltorio envuelve `http.createServer`: lo que llegue al
puerto INTERNO sin el testigo de la puerta (256 bits por proceso en `x-starseed-interna`, que se quita antes de que
Next lo vea) ni la cookie del pase → 403. La cookie hace falta porque Next se llama a sí mismo por ese puerto
(`__NEXT_PRIVATE_ORIGIN`) al redirigir tras una server action, reenviando las cookies. Al arrancar se comprueba sola:
la salud dice `interna: "protegida"`; si un Next futuro cambiara cómo crea su servidor, `"sin-proteger"` y un AVISO
en `servidor-local.log`.

**Cubre:** POST/PUT/DELETE de cualquier web (formulario, fetch no-cors, `sendBeacon`, preflight CORS y de Private
Network Access); GET a `/api` desde otra web (también navegando la pestaña entera); `<script>`, `<img>` e `<iframe>`
de otras webs; DNS rebinding (al puerto público y al interno); WebSocket de otras webs; otros programas de la
máquina sin el pase (otro usuario, otra app); el puerto interno encontrado probando; y que el pase salga hacia
Vercel o al registro.

**No cubre (límites honestos):**
- Un programa del MISMO usuario con acceso a la memoria o a los procesos de la app: puede leer el pase como lee
  cualquier otra cosa suya. El pase no está en el entorno ni en disco (cookie de sesión), así que no basta con
  listar procesos o leer el almacén del motor.
- Las cookies no distinguen puertos: si una página de la app pidiera CON credenciales algo de OTRO servidor de
  `127.0.0.1` (p. ej. `<img src="http://127.0.0.1:8000/…">`), ese servidor recibiría la cookie. Hoy los motores
  locales (Ollama, Astraura, ComfyUI…) se llaman con `fetch` sin credenciales, que no la manda.
- El pase viaja en la URL de entrada: si un motor la guardara en su historial en disco (WebView2 puede), solo vale
  hasta que se cierra la app.
- Las páginas (GET fuera de `/api`) siguen llegando a quien navegue a ellas desde su navegador; sin el pase no hacen
  nada en el servidor, y no se pueden enmarcar (`marco-ajeno` + `X-Frame-Options: SAMEORIGIN`).
- Los informes CSP del navegador (`report-uri /api/csp-report`) llegan sin cookie y se rechazan (no afecta al uso).
  `/api/externos/v1/*` (hecha para que la llamen otras webs) no se sirve desde el servidor local: se usa la web.
- Otro usuario que ocupe el puerto mientras el nuestro está caído (§3): no tendría el pase, pero la ventana podría
  pintar su página si recarga sola en ese hueco.

**Comprobado (2026-11-07).** (1) `node --test`: guarda 19 pruebas y envoltorio 11 (de punta a punta con ataques,
pase, entrada, CORS, puerto interno y WebSocket); en la Mac, los cuatro archivos de `native/servidor-local` 41/41.
(2) Contenedor Linux con un standalone REAL de Next 15.5.21 detrás del envoltorio: `interna: protegida`; sin pase,
desde otra web, con rebinding y por el puerto interno → 403/421 y la cuenta de la ruta no se movió.
(3) WebKitGTK 2.52 (el WebKit de Linux; WKWebView es el mismo motor) empezando en `tauri://localhost` y entrando
como entra Rust: cookie puesta e invisible para JS, `fetch` POST con `Origin` y `Sec-Fetch-Site: same-origin` → 200,
server action con `redirect()` → `/hecho` (sin «failed to get redirect response»); desde `http://localhost:47700`, el
formulario, el fetch no-cors, `sendBeacon`, el `<img>` y el fetch CORS no llegaron a Next; tras navegar desde esa web
a la app, `fetch` vuelve a llevar la cookie. (4) Chromium 1243 (el motor de WebView2): igual, y un `<iframe>` de otra
web → 403 `marco-ajeno`. (5) La app real (Tauri debug + WebKitGTK, Xvfb): el Node recibió el pase por la entrada
estándar, la migración (T4) entró por `/__starseed/entrar` y quedó `hecha`, la página `/` hizo su POST a `/api` con
el pase, el registro no tiene el pase y al matar la app el Node salió solo. Falta macOS y Windows con la app real.

## 4. Arranque, reinicios, apagado y respaldo

1. `setup` → `servidor_local::iniciar` (solo escritorio y solo `app.starseed.os`; Nexus y Café no).
2. Comprueba el paquete (`starseed-node`, `servidor/server.js`, `servidor/.next/BUILD_ID`,
   `servidor/starseed-arranque.cjs`). Si falta algo → **respaldo**.
3. Elige puerto, lanza el Node (con el pase de la ventana en su entrada estándar, §3.1), sondea la salud cada
   250 ms (tope 60 s). Lista → navega por `/__starseed/entrar` (si la ventana no está ya en ese origen) y la página
   de arranque dice «Listo».
4. Vigila cada 500 ms. Si el Node muere: pausa 0,5 s / 2 s / 5 s y relanza en el mismo puerto **sin recargar la
   página**. Más de 3 caídas en 5 min → respaldo. Probado: `kill -9` al Node → nueva firma, mismo puerto, sin
   recarga.
5. `RunEvent::Exit` → cierra la tubería, espera 1,5 s y mata si hace falta.
6. **Respaldo** = lo de antes de esta versión: vuelve a la página de arranque, dice por qué y abre la web
   publicada; sin internet, lo dice y reintenta cada 15 s.

`invoke('servidor_local_estado')` → `{fase, puerto, origen, motivo, reinicios, version_paquete, commit_paquete,
registro, capa, capa_nueva, capa_nueva_version, capas_fase, capas_aviso}` (lo pinta `EstadoServidorLocal`, T6;
`capa*`: CAP1107A, §10). Cada arranque del Node elige antes QUÉ sirve: una capa más nueva o el paquete del
instalador (§10); `version_paquete`/`commit_paquete` son los de lo que sirve.

## 5. CI y firma (`.github/workflows/native-build.yml`)

- Job **`servidor-local-next`** (Ubuntu, 16 GB, `continue-on-error`): comprueba que existen las variables del
  repo `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY` (sin ellas, ningún servidor local: mejor que uno con un Supabase de
  mentira), `npm ci`, `next build` con `STARSEED_APP_NATIVA=1`, y sube `servidor-next.tar` (un tar porque
  `upload-artifact` deja fuera lo que empieza por «.»). El standalone es JS puro: vale para los tres sistemas.
- **`build-desktop`** espera a ese job pero corre aunque falle (`!cancelled()`). Solo para el OS: descarga el tar
  y `preparar.mjs --plataforma darwin-universal|win32-x64|linux-x64`: Node de nodejs.org con SHA fijo; en macOS
  `lipo` arm64 + x64 y **firma ad-hoc** (`codesign --force --sign - --timestamp=none`), la misma clase de firma
  que lleva el binario de la app sin certificados de pago (no existía ningún gancho de firma: este es el primero);
  al final añade `bundle.resources {"recursos/servidor/": "servidor/"}` y `bundle.externalBin
  ["binaries/starseed-node"]` a `tauri.conf.json` del runner. Si cualquier paso falla, no toca la configuración y
  un aviso amarillo dice que ese instalador sale SIN servidor local.
- Un paso final escribe el **tamaño real de cada instalador** en el resumen del job.
- **T8 (APP1107B):** antes de `next build`, solo en `servidor-local-next`, `node native/servidor-local/solo-mac.mjs`
  quita `src/app/api/mando` (73 rutas, 81 archivos fuente: el motor de la consola de MetaGenesis, que lee y escribe
  el disco de la Mac y lanza agentes). Antes comprueba que nada de fuera lo importa (si algo lo hiciera, no quita
  nada, avisa y el build sigue igual); el resultado va al resumen del job. La web publicada y `ci.yml` no cambian.
  **Se quedan** `/genesis` (Mi Genesis y PoliGenesis son de cada persona), `/metagenesis` (se usa desde cualquier
  neurona por Supabase + túnel), `/poligenesis`, `/api/genesis/**`, `/api/metagenesis/orden` y `/api/mcp/genesis`
  (funcionan igual en Vercel): quitarlos habría quitado funciones, no peso muerto.
- `preparar.mjs` copia también `migracion-origen.js` junto al envoltorio (T4).
- **T13 (TAM1107A):** un paso acotado en `servidor-local-next`, entre `next build` y el tar («Compactar los
  manifiestos de cliente (T13)», `continue-on-error`), reescribe los `*_client-reference-manifest.js` del standalone
  sin repeticiones (§6.1) y lo escribe en el resumen del job; así el tar, los instaladores y las capas (T1) salen ya
  ligeros. `preparar.mjs` lo repite sobre su copia (si ya está hecho no gana nada; `--sin-compactar` lo salta) y lo
  apunta en `starseed-servidor.json` (`manifiestosCliente`) y en el resumen.
- **(CAP1107A · T1) Job `servidor-capa`** (tras `build-desktop`, `continue-on-error`): con el MISMO `servidor-next.tar`
  arma la capa, la firma con `TAURI_SIGNING_PRIVATE_KEY` y la adjunta al release; con la variable del repo
  `SERVIDOR_CAPAS_CANAL=1` la publica además en el canal fijo. `.github/workflows/servidor-capa.yml` hace lo mismo en
  cada publicación de la web (solo con esa variable). `starseed-servidor.json` lleva ahora `creadoMs` y `protocolo`
  (§10).
- Android e iOS: `tauri.android.conf.json` / `tauri.ios.conf.json` devuelven la ventana a la web publicada
  (la página de arranque es solo de escritorio). Nexus y Café pisan después con su `-c`.
- **(AND1107A) Android con el interruptor** (input `servidor_local_android` o variable `STARSEED_SERVIDOR_LOCAL_ANDROID=1`,
  solo StarSeed OS): `build-android` espera el artefacto `servidor-local-next`, `preparar-android.mjs` prepara el
  proyecto (y el `tauri.android.conf.json` del runner pasa a `index.html`) y `STARSEED_SERVIDOR_LOCAL_ANDROID=1` va
  a `$GITHUB_ENV` para `build.rs`. Sin el interruptor, ninguno de esos pasos corre (§9.1).

## 6. Tamaños

Medido el 2026-11-07 sobre el build de main de la Mac (`.next` de producción) y los Node 22.23.4 oficiales:

| Pieza | Sin comprimir | gzip | xz |
|---|---:|---:|---:|
| `.next/server` + `.next/static` + `public` (2.749 archivos) | ≈ 462 MB | 45,6 MB | 24,5 MB |
| … sin `/api/mando/**` (T8, APP1107B: −219 archivos) | **≈ 396 MB** | ≈ 43,6 MB | ≈ 24,3 MB |
| `node_modules` trazado del standalone (≈ 1.900 archivos, sin sharp) | ≈ 40 MB | ≈ 8 MB | ≈ 6 MB |
| Node macOS universal (arm64 107 + x64 110) | 217 MB | ≈ 71 MB | ≈ 46 MB |
| Node Linux x64 | 119 MB | ≈ 38 MB | ≈ 30 MB |
| Node Windows x64 (`node.exe`) | ≈ 85 MB | ≈ 30 MB | ≈ 26 MB |

| Instalador | Hoy (v0.4.3) | Estimado con servidor local | Instalado en disco |
|---|---:|---:|---:|
| macOS `.dmg` (universal) y `.app.tar.gz` del updater | 7 MB | ≈ 123–133 MB | ≈ 655 MB |
| Windows `-setup.exe` (NSIS, LZMA) | 2 MB | ≈ 55–65 MB | ≈ 525 MB |
| Windows `.msi` | 3 MB | ≈ 83–93 MB | ≈ 525 MB |
| Linux `.deb` / `.rpm` | 4 MB | ≈ 88–98 MB | ≈ 555 MB |
| Linux `.AppImage` | 79 MB | ≈ 163–173 MB | — |
| Android `.apk` | 37 MB (v0.5.0) | sin cambio; con el interruptor de §9.1, ≈ 137 MB | ≈ 0,6 GB con el interruptor |

Son estimaciones (compresión medida por pieza); las reales las escribe el CI en el resumen de cada job (el paso T8
escribe además qué quitó). Columna «Instalado» ya sin `/api/mando` (antes: 720 / 590 / 620 MB).

**T8 medido (APP1107B, 2026-11-07, `.next` de main de la Mac `AA0YdaG0s8hV9CgdmX1rc`, sin compilar):** quitar
`/api/mando/**` (73 rutas) saca de `.next/server/app` **219 archivos y 65,6 MB (62,6 MiB) sin comprimir**; ningún
chunk compartido ni paquete de `node_modules` es solo suyo (9 KB de un chunk). Comprimido baja poquísimo —el tar de
esas rutas da **2,0 MB en gzip y 0,22 MB en xz**— porque casi todo es el `route_client-reference-manifest.js` de cada
ruta, casi idéntico entre rutas. Es decir: **−65 MB instalado en disco, −2 MB en los instaladores con compresión por
archivo (dmg, msi, deb, AppImage) y casi nada en el NSIS (LZMA sólido)**. No se quitaron `/genesis`,
`/metagenesis` ni `/poligenesis` (§5): con ellos el «≈ 100 MB» que se estimaba no era peso muerto.

**Dónde está de verdad el peso** (para T3/T13): los **291 `*_client-reference-manifest.js`** de `.next/server/app`
suman **252,6 MB (el 61 % de `.next/server`)** y comprimen a 5,7 MB en gzip: uno por ruta, casi iguales. Hecho en
T13 (§6.1). Otras formas de bajar: Node solo arm64 en macOS (−36 MB comprimido, Intel caería a la web), la fase 2
(§10), que evita bajar el instalador entero en cada actualización, y los HTML/RSC prerenderizados (113 + 111
archivos, 122 MB sin comprimir, casi todo la misma carga del layout raíz: comprimen ≈ 30:1).

### 6.1 Manifiestos de cliente sin repeticiones (T13 · TAM1107A · ESCRITO SIN PUBLICAR)

**Por qué pesan tanto.** Next 15.5 (`build/webpack/plugins/flight-manifest-plugin.js`) escribe uno por página y por
ruta de API. En memoria, todos los módulos de cliente de un mismo grupo de chunks comparten LA MISMA lista `chunks`
(la del layout raíz: 122 chunks, 244 cadenas) y cada alias ESM comparte el objeto de su módulo; pero el plugin lo
escribe con `JSON.stringify`, que la repite entera en cada uno de los ≈ 295 módulos: ≈ 6 KB × 295 ≈ 0,85 MB por
archivo. `clientModules` es el 96 % (245 de 256 MB); `ssrModuleMapping` y `rscModuleMapping` son idénticos en los 291
(≈ 19 KB cada uno). **Next no tiene ninguna opción para cambiarlo** (el plugin no lee nada de la configuración para
esto). Enlaces duros: no sirven (cada archivo lleva su página dentro y todos son distintos).

**Qué se hace** (`native/servidor-local/compactar-manifiestos.mjs`, solo en el build nativo): cada archivo se
reescribe como un JS que construye EXACTAMENTE el mismo objeto, con cada valor repetido (lista u objeto) declarado
una sola vez en una variable local — es decir, vuelven las referencias compartidas que Next tenía en memoria al
compilar. Next lo lee igual que siempre (`evalManifest` de `server/load-manifest.external.js`: `readFileSync` +
`vm.runInNewContext(texto, {})` + `deepFreeze`), sin `require`, sin cargador y sin nada al arrancar. Por archivo: se
evalúan el original y el compacto como lo hace Next y se exige el MISMO JSON (con el orden de las claves) y ninguna
otra global; si algo no cuadra, no gana o lleva `__proto__`, se queda como estaba; cada archivo se cambia con
`rename` (nunca queda uno a medias, y un enlace duro al original no se toca). La web publicada no cambia.

**Medido (2026-11-07) con el `.next` real de main de la Mac (`zEBGWRv317kUf32sxR6pE`, sin compilar):**

| | Antes | Después |
|---|---:|---:|
| Los 291 manifiestos (todo el build) | 256,3 MB | **27,0 MB** (291/291, 11 s) |
| Los 218 que van en la app (sin `/api/mando`, T8) | 192,1 MB | **20,3 MB** (−171,8 MB, −89 %) |
| … gzip por archivo (dmg, `.app.tar.gz`, deb, rpm, AppImage) | 4,33 MB | 3,23 MB (−1,1 MB) |
| … tar.gz | 4,27 MB | 3,12 MB |
| … xz sólido (NSIS) | 0,15 MB | 0,04 MB |
| Cargar los 218 como Next (`evalManifest` + `deepFreeze`, en caché) | 3,0–3,2 s · 325 MiB de heap | 0,6–1,0 s · 108 MiB de heap |

| Instalador (estimación de §6) | Antes de T13 | Con T13 | Instalado en disco |
|---|---:|---:|---:|
| macOS `.dmg` y `.app.tar.gz` del updater | ≈ 123–133 MB | ≈ 122–132 MB | ≈ 655 → **≈ 483 MB** |
| Windows `-setup.exe` (NSIS, LZMA sólido) | ≈ 55–65 MB | igual (−0,1 MB) | ≈ 525 → **≈ 353 MB** |
| Windows `.msi` | ≈ 83–93 MB | ≈ −0,1 a −1,1 MB | ≈ 525 → **≈ 353 MB** |
| Linux `.deb` / `.rpm` | ≈ 88–98 MB | ≈ 87–97 MB | ≈ 555 → **≈ 383 MB** |
| Linux `.AppImage` | ≈ 163–173 MB | ≈ 162–172 MB | — |

Es decir: la descarga apenas cambia (la compresión ya se comía la repetición), pero **en disco la app ocupa ≈ 172 MB
menos (−26 % a −33 %)**, el tar del CI (sin comprimir) baja lo mismo, y el servidor local gasta menos memoria y
tiempo al abrir cada página por primera vez (los 218 cargados: −217 MiB de heap, 3–5× más rápido).

**Probado con el standalone REAL de main (Next 15.5.21), sin compilar** (`/tmp/tam1107a/verificar-servidor.mjs` en la
Mac: dos copias con enlaces duros, A con los manifiestos de Next y B compactados; lo demás idéntico): mismas 12
peticiones a los dos. **10/12 iguales byte a byte**: render forzado (`x-prerender-revalidate`) de `/`, `/escritorios`,
`/agent`, `/protomolecula`, `/login` y `/settings` (307), la página dinámica `/llamada/[id]`, el 404, una carga RSC
estática y `/api/os/versiones`; las 2 cargas RSC dinámicas solo difieren en un identificador al azar de 22
caracteres que **también cambia entre dos peticiones al MISMO servidor A**. Ningún error en los registros. El build
de main no se tocó (el original sigue con 879.818 bytes; el de B, 91.927).

## 7. Secciones sin internet

Evidencia: archivos a ≤ 3 saltos de import desde cada `page.tsx` que usan Supabase / llaman a `/api` / cargan de un
CDN / hablan con un proveedor de IA / guardan en local (escaneo del 2026-11-07). «Local» = `localStorage`/IndexedDB
de esta neurona, que en la app nativa vive en el origen `127.0.0.1:47610`.

| Sección (rutas) | Sin internet | Por qué |
|---|---|---|
| Escritorios (`/escritorios`), Dashboard y widgets (`/dashboard`, `/qa-dock`), dock, Trinity, apariencia, accesibilidad | **Funciona con datos locales** | Viven en `localStorage` (11/1/0/1/19 en escritorios); la cuenta sincroniza al volver |
| Protomolécula (`/protomolecula`), Laboratorio, Inmersivo, XR (`/xr`, `/sala-xr`, `/escena`), Juego, Audiomorphic, Fundamento, Funciones | **Funciona** | 0 Supabase en la protomolécula; three.js y motores en el propio bundle |
| Documentos, Tabla, Pizarra(s), Presentación, Crear, Galería, Recordatorios, Alarmas | **Con datos locales** | Editan en local; compartir/sincronizar necesita red |
| Cerebros y memorias (`/cerebro`, `/cerebros`, `/memorias`, `/memorias-3d`) | **Con datos locales** | `memory-offline.ts`; los medios en la nube (Drive, Supabase) esperan a la red |
| Malla y señales (`/red-mesh`, `/senales`, `/conexiones`, Centro de Conexiones) | **Funciona en local** | Faro Wi-Fi, LoRa, «Vincular sin internet» (QR) y antenas nativas no usan internet; la federación de topologías sí |
| Llamada directa por la malla (`llamada-directa.ts`) | **Funciona en la misma red** | WebRTC con `iceServers: []` y emparejado por código; llamadas por la cuenta necesitan Supabase |
| Voces y Aurora (`/voces`, `/aurora`, `/agent`, `/imaginacion`) | **Parcial** | Con motores locales (Ollama, Astraura 1.58 en `127.0.0.1:8000`, Kokoro/WebLLM ya en caché) sí; las IA externas y la «StarSeed gratuita» van por `/api` a la web (89 `/api` y 42 IA directa en `/agent`) |
| Ajustes (`/settings`, `/seguridad`, `/servidores`, `/sincronizacion`) | **Parcial** | Lo de esta neurona sí; cuentas, servidores remotos y Syncthing con red |
| Cuenta e inicio de sesión (`/login`, `/cuenta`, `/bienvenida`, `/onboarding`) | **Necesita internet la primera vez** | Supabase Auth. Con la sesión guardada se sigue sin red; «Explorar sin cuenta» siempre |
| Mensajería y correo (`/messages`, `/correos`, `/contactos`, `/canales`) | **Necesita internet** | Supabase Realtime y correo (26 Supabase en `/messages`); entre neuronas por la malla, el transporte universal sin internet |
| Red social y gobierno (`/network/*`, `/hub`, `/grupo`, `/pagina`, `/partido`, `/evento`, `/entidad`, `/post`, `/publicar`, `/publish`, `/profile`, `/decisiones`, `/vivo`) | **Necesita internet** | Datos compartidos en Supabase (28–50 archivos por sección); se ve lo que haya en caché |
| Biblioteca, Explorador, Habilidades, Integraciones, Apps IA, NVIDIA (`/library`, `/explorer`, `/habilidades`…) | **Necesita internet** | Catálogos remotos y GitHub (33 `/api` en `/library`); lo ya instalado funciona |
| Estaciones y Omnifrecuencias en vivo, Clima, Navegador, Mundo de avatares | **Necesita internet** | Emisiones, APIs de tiempo y sitios externos, modelos 3D de CDN |
| Genesis / PoliGenesis (`/genesis`, `/poligenesis`) | **Necesita internet** | Mi Genesis y PoliGenesis proponen con modelos por `/api/genesis/*` (a la web) y guardan en Supabase |
| MetaGenesis (`/metagenesis`) | **Necesita internet** | Lee los nodos de Supabase y llega al motor de la Mac por su túnel. Desde APP1107B la app (127.0.0.1:47610…) ya no se cree «la Mac» (`abiertoEnLaMac` mira el puerto); `/api/mando/*` no va en la app (T8) |
| Tres server actions de Genkit (`src/ai/flows/*`) | **No funcionan en la app local** | Necesitan la clave de Google del servidor y las server actions no pasan por `/api` (pendiente T5) |

Regla general para lo que no está en la tabla: lo local funciona; lo que lee Supabase enseña lo último guardado o
vacío y vuelve solo al reconectar; lo que llama a `/api` funciona con internet (va a la web) y sin él contesta el
servidor local (bien si no necesita claves; si no, su error).

**Detección de red.** `src/ai/astraura/mesh/connectivity.ts` (y 20 módulos más) usan `navigator.onLine` + eventos
`online`/`offline`; la app nativa mide además Internet en Rust (`antenas.rs`, evento `starseed://antenas`). El
servidor local añade la medida que importa aquí: si la web publicada contesta (`/__starseed/red`). El aviso
«Sin conexión: trabajando en local» sale con cualquiera de las dos señales y se puede cerrar.

## 8. Cómo se prueba

```bash
# Rust puro (sin Tauri)
rustc --edition 2021 --test native/src-tauri/src/servidor_local_logica.rs -o /tmp/sl && /tmp/sl
# Envoltorio: salud con firma, local/web, vuelta a local sin red, cookies, salida al cerrar la entrada, puerto ocupado
node --test native/servidor-local/__tests__/arranque.test.cjs
# (SEG1107A · T11) La guarda: lógica pura (Host, Origin, Sec-Fetch-Site, pase, rutas, CORS, entrada, Next interno)
node --test native/servidor-local/__tests__/guarda.test.cjs
# Armado en seco (standalone de mentira + Node de esta máquina; en macOS firma ad-hoc de verdad) y arranque del paquete
node --test native/servidor-local/__tests__/preparar.test.mjs
# Web
npx vitest run src/lib/nativa/__tests__/sin-conexion.test.ts
# Service worker v8 (SW1107A): lógica pura, el SW de verdad en un entorno simulado, el manifiesto y la página
npx vitest run src/lib/pwa/__tests__/sw-logica.test.ts src/lib/pwa/__tests__/sw-v8.test.ts \
  src/lib/pwa/__tests__/precarga-manifiesto.test.ts src/lib/pwa/__tests__/precarga-cliente.test.ts
# Manifiesto con un build real, sin tocar el public/ del proyecto
T=$(mktemp -d) && cp -R public "$T/public" && node scripts/precarga-sw.mjs --dist .next --public "$T/public" --estricto
# (APP1107B) Migración del origen (T4): Rust puro (usa serde_json → con cargo, en el crate real) y el JS + el aviso +
# el contrato con Rust (ACL: lib.rs ↔ build.rs ↔ capabilities)
(cd native/src-tauri && cargo test --lib -- migracion_origen servidor_local)
npx vitest run src/lib/nativa/__tests__/migracion-origen.test.ts src/lib/nativa/__tests__/contrato-rust.test.ts
# (APP1107B) Lo que el build nativo deja fuera (T8): qué se quitaría en el repo de verdad, sin borrar nada
node --test native/servidor-local/__tests__/solo-mac.test.mjs && node native/servidor-local/solo-mac.mjs --simular
# (TAM1107A · T13) Manifiestos de cliente: pruebas (una con el evalManifest de Next si está instalado) y cuánto
# bajaría un .next real sin tocarlo
node --test native/servidor-local/__tests__/compactar-manifiestos.test.mjs
node native/servidor-local/compactar-manifiestos.mjs .next/server --simular
# (TAM1107A · T4b) Migración sin internet: Rust puro y el script de inicio de Rust en una ventana sin red
(cd native/src-tauri && cargo test --lib -- migracion_origen)
npx vitest run src/lib/nativa/__tests__/migracion-origen.test.ts
# (CAP1107A · T1) Capas: lógica pura, pegamento (firma minisign real, extracción, estado) y armado + contrato
rustc --edition 2021 --test native/src-tauri/src/servidor_capas_logica.rs -o /tmp/sc && /tmp/sc
(cd native/src-tauri && cargo test --lib -- servidor_capas servidor_local)
node --test native/servidor-local/__tests__/capa.test.mjs
npx vitest run src/lib/nativa/__tests__/estado-servidor-local.test.ts src/lib/nativa/__tests__/contrato-rust.test.ts \
  src/components/network/__tests__/servidor-neurona.test.tsx
# (AND1107A) Android: lo puro de Rust, el interruptor, el envoltorio en modo Android, el armado y lo puro de Kotlin
rustc --edition 2021 --test native/src-tauri/src/servidor_local_android_logica.rs -o /tmp/sla && /tmp/sla
rustc --edition 2021 --test native/src-tauri/src/android_parche.rs -o /tmp/ap && /tmp/ap
node --test native/servidor-local/__tests__/arranque-android.test.cjs native/servidor-local/__tests__/preparar-android.test.mjs
kotlinc native/src-tauri/android/ServidorLocalLogica.kt native/src-tauri/android/pruebas/ServidorLocalLogicaPrueba.kt \
  -include-runtime -d /tmp/sll.jar && java -jar /tmp/sll.jar
# El código Rust de Android con el interruptor (sin NDK; desde una copia fuera de git si el checkout es disperso)
(cd native/src-tauri && TAURI_ANDROID_PACKAGE_UNESCAPED=app.starseed.os STARSEED_SERVIDOR_LOCAL_ANDROID=1 \
  cargo check --target aarch64-linux-android --lib)
```

**Cómo se verifica la migración con la app real (T12, en cada sistema):** instalar la 0.4.3, abrirla con internet,
crear un escritorio y un widget, una nota de voz y un vínculo de neurona; actualizar a la versión con servidor
local; al abrir: página «Trayendo tus datos de la versión anterior…» (≤ unos segundos) → el OS en
`127.0.0.1:47610` con el escritorio, el widget y la nota, el aviso «Tus datos de la versión anterior ya están aquí»,
y la sesión pedida de nuevo. En `<app_data>/migracion-origen/`: `estado.json` con `"resultado": "hecha"` y una
`copia-*.json` sin `refresh_token` ni valores secretos. Repetir con el Wi-Fi apagado en el primer arranque: el OS
abre en local, el aviso dice «Aún no están aquí…» y en el siguiente arranque con red se traen. **Desde T4b** ese
arranque sin red ya los trae (`migracion_origen_estado` → `modo: "sin-red"`); para probarlo sin apagar el Wi-Fi, abrir
la app con `STARSEED_MIGRACION_SIN_RED=1` (macOS: desde Terminal, el ejecutable de `StarSeed OS.app/Contents/MacOS/`
—el que no es `starseed-node`— con esa variable delante; `open` no pasa variables; Windows: `set STARSEED_MIGRACION_SIN_RED=1`
y abrir desde esa consola el `.exe` de la app) con `estado.json` borrado.

Probado además en Linux con la app real (`tauri build --debug --bundles deb`): el `.deb` lleva
`/usr/bin/starseed-node` y `/usr/lib/StarSeed OS/servidor/.next/…`; la app (Xvfb) lanzó el Node en
`127.0.0.1:47610`, la salud dio `listo` con su firma, WebKitGTK pidió `GET /` al servidor local, un `kill -9` al
Node lo relanzó en el mismo puerto sin recargar la página y, al matar la app, el Node salió solo.

## 9. Android, iOS, Nexus y Café

### 9.1 Android — el servidor propio DENTRO de la APK (opción A · AND1107A · ESCRITO SIN PUBLICAR, interruptor APAGADO)

Sin el interruptor, la APK abre la web publicada (`tauri.android.conf.json`) y desde SW1107A el service worker v8
guarda la app entera (opción C, §9.1.1), que llega también a las APK ya instaladas en cuanto se publica la web. Con
el interruptor, la APK de StarSeed OS lleva además el MISMO servidor que escritorio (el mismo build `standalone` de
Next, el mismo envoltorio y la misma guarda) sobre **nodejs-mobile**, y la ventana abre `http://127.0.0.1:<puerto>`.

| Opción | Qué es | Tamaño | Licencia | Veredicto |
|---|---|---|---|---|
| **A · nodejs-mobile** (fork `digidem/nodejs-mobile` **v24.18.0-0**, Node 24.18.0, NDK r27d) | `libnode.so` para arm64-v8a, armeabi-v7a y x86_64 (SDK ≥ 24) que corre el MISMO standalone y el MISMO envoltorio | APK ≈ 137 MB (hoy 37 MB) · ≈ 0,6 GB en el aparato (medido abajo) | **MIT** (la de Node.js, con las de terceros y polywasm): confirmado en el `LICENSE` de la etiqueta `v24.18.0-0` y en el README del repo («Node.js is available under the MIT license… the mobile patches and tooling … under the same terms»). **El zip del asset no trae LICENSE**: va aparte en la APK (`assets/servidor-local/LICENSE-nodejs-mobile.txt`, SHA-256 fijado) | **ESCRITO SIN PUBLICAR (AND1107A)**, detrás de un interruptor de build apagado hasta probarlo en un aparato real |
| B · Export estático parcial | `output: 'export'` de las secciones que no usan API ni middleware | pequeño | — | No: el OS usa middleware, rutas dinámicas y 48 grupos de `/api`; sería otra app |
| C · Precarga del service worker en la APK | La app pide al SW que guarde todas las páginas principales y `/_next/static` | ≈ 20–25 MB de descarga, ≈ 176 MB en disco, APK igual | propia | **ESCRITO SIN PUBLICAR (SW1107A, §9.1.1)**: el respaldo de A y lo de siempre sin el interruptor |

**Cómo se enciende.**
- **CI (la forma normal):** Actions → «StarSeed Native · Build & Release» → *Run workflow* con `plataformas` = `android`
  y **`servidor_local_android` marcado**. El job `servidor-local-next` corre aunque no se pida escritorio; la APK de
  StarSeed OS espera su artefacto (sondeo de la API, ≤ 55 min), lo arma y compila. Nexus y Café no cambian. Para que
  TODAS las etiquetas `v*` lo lleven: variable del repo `STARSEED_SERVIDOR_LOCAL_ANDROID=1` (no antes de probarlo,
  ver límites). La APK sube al Release borrador de ese run con el nombre de siempre (`StarSeed-os-<versión>.apk`).
- **A mano:** tras `cargo tauri android init` y con `NDK_HOME` puesto:
  `node native/servidor-local/preparar-android.mjs --tar servidor-next.tar --proyecto native/src-tauri/gen/android --conf native/src-tauri/tauri.android.conf.json`
  y `STARSEED_SERVIDOR_LOCAL_ANDROID=1 cargo tauri android build --apk` (en `native/`). Opciones: `--abis arm64-v8a`
  (APK ≈ 93 MB), `--nodejs-mobile-zip <zip>` y `--licencia <archivo>` sin red (los SHA-256 se comprueban igual).
- **Apagado (por defecto):** ningún paso nuevo del CI corre, `build.rs` no enciende `starseed_servidor_android` y no
  se compila ni una línea de Rust ni de Kotlin de esto: la APK es la de siempre. Encendido pero sin preparar el
  proyecto, `build.rs` falla en alto; si la preparación falla en el CI, `preparar-android.mjs` deshace todo lo que
  tocó, el build sigue sin el interruptor y un aviso amarillo lo dice.

| Pieza | Archivo |
|---|---|
| Lógica pura (estado de Kotlin, pasos, argv contiguo, entorno, tope del heap, página de arranque) — 8 pruebas | `native/src-tauri/src/servidor_local_android_logica.rs` |
| Pegamento (JNI, `dlopen` de libnode + `node::Start` en un hilo, tubería del pase, salud, vigía, ventana) | `native/src-tauri/src/servidor_local_android.rs` (registro: 2 `mod` + 1 línea del `setup` en `lib.rs`, bajo `cfg(starseed_servidor_android)`) |
| Kotlin: proveedor al crear el proceso, extracción por versión, carga de libnode | `native/src-tauri/android/ServidorLocal.kt`; lo puro, `ServidorLocalLogica.kt` (7 pruebas en `android/pruebas/`) |
| Preparar el proyecto Android: libnode verificado y sin depuración, `libc++_shared.so` del NDK, `servidor.zip`, licencia, Kotlin, manifiesto, red local, Gradle y la ventana — 11 pruebas | `native/servidor-local/preparar-android.mjs` + `nodejs-mobile.json` (versión, URL, SHA-256 del zip y del LICENSE) |
| Envoltorio en modo Android (`STARSEED_EN_PROCESO=1`) — 4 pruebas | `native/servidor-local/starseed-arranque.cjs` (escritorio no cambia: 11/11 de siempre) |
| Interruptor y comprobación del proyecto — 2 pruebas | `native/src-tauri/build.rs` + `android_parche.rs` (`servidor_local_encendido`, `servidor_local_preparado`) |
| CI | `native-build.yml`: input `servidor_local_android`, pasos «Servidor local Android · …» del job `build-android` |

**Cómo arranca en el aparato.**
1. Al crearse el proceso, `ArranqueServidorLocal` (un `ContentProvider`, como el guardián de antenas) lanza un hilo
   que carga la librería de Rust y `libnode.so` (+ `libc++_shared.so`). La primera vez de cada `buildId` extrae
   `assets/servidor-local/servidor.zip` a `noBackupFilesDir/servidor-local/<buildId>.parcial` (fuera de la copia de
   seguridad de Android: se regenera solo), sin dejar salir ninguna entrada de la carpeta (zip slip), escribe el
   marcador lo último y renombra; borra las versiones anteriores. Antes comprueba el espacio (descomprimido + 10 % +
   200 MB). Va contando a Rust por JNI (`ServidorLocal.nativoEstado`, líneas `clave=valor`).
2. La ventana abre `index.html` (la página de arranque de escritorio, dentro del binario) y enseña el progreso
   («Preparando StarSeed OS para usarlo sin internet (primera vez de esta versión): 37 % · 180 de 485 MB…»).
3. Rust (`setup`, una vez por proceso): espera a Kotlin (sin noticias en 20 s, o extracción de más de 20 min →
   respaldo), elige uno de los diez puertos, firma nueva y el **pase por una tubería propia** (`pipe`: escribe
   `pase:<hex>` y cierra; al Node solo le llega el número del descriptor en `STARSEED_ENTRADA_FD`, nunca el pase en
   el entorno). Entorno: el de escritorio + `STARSEED_EN_PROCESO=1`, `STARSEED_VIGIA_PADRE=0`, `TMPDIR`=cacheDir,
   `HOME`=filesDir, `NODE_COMPILE_CACHE` (los arranques siguientes van más rápido). Arranca
   `node --max-old-space-size=<RAM/6, entre 256 y 768> starseed-arranque.cjs` con `node::Start` (`dlsym` de
   `_ZN4node5StartEiPPc`, argv contiguo en memoria) en un hilo con 8 MB de pila; su salida va a
   `noBackupFilesDir/servidor-local/servidor-local.log`.
4. Cuando la salud responde con SU firma (≤ 120 s), la ventana entra por `/__starseed/entrar?t=<pase>&a=/`. Solo se
   la saca de la página de arranque, nunca de otra web (p. ej. un inicio de sesión con OAuth); si la persona vuelve
   atrás hasta la página de arranque, vuelve a entrar.
5. Vigía cada 3 s; 6 fallos seguidos o Node terminado → la web publicada (Node solo arranca una vez por proceso:
   hasta reabrir la app). Cualquier fallo antes de «listo» (APK sin paquete, ABI sin libnode como x86 de 32 bits, sin
   espacio, puerto ajeno, 120 s) → la web publicada, como sin el interruptor, y la página de arranque dice por qué.
6. El envoltorio en modo Android no toca la entrada estándar del proceso de la app ni pone manejadores de
   SIGTERM; `process.exit` (de él o de Next) **no** mata la app: registra, cierra la puerta y Rust ve caer la salud;
   un error sin capturar se registra y el servidor sigue.

**Red y seguridad.** `res/xml/starseed_red_local.xml` deja HTTP en claro **solo** hacia `127.0.0.1` y `localhost`
(el resto, solo HTTPS, como hoy en release). `capabilities/default.json` ya concedía los diez orígenes locales en
Android. La guarda de §3.1 es la misma; en Android el loopback lo comparten **todas las apps del aparato**: son
«otros programas» y sin el pase no llegan a `/api` ni a nada que cambie estado.

**Tamaños (medidos el 2026-11-07).**

| Pieza | Sin comprimir | En el APK |
|---|---:|---:|
| `libnode.so` arm64-v8a (sin depuración; con ella, 82,7 MB) | 61,5 MB | 21,8 MB |
| `libnode.so` armeabi-v7a (75,0 MB con depuración) | 54,8 MB | 20,5 MB |
| `libnode.so` x86_64 (81,2 MB con depuración) | 63,5 MB | 22,6 MB |
| `libc++_shared.so` del NDK, una por ABI | ≈ 1 MB | ≈ 0,4 MB |
| `servidor.zip` (zip -9 del standalone + static + public del build de la Mac: 5.879 archivos) | 550,6 MB | 63,5 MB (el del CI, sin `/api/mando`: ≈ 61 MB / ≈ 485 MB) |
| Las `.so` de Rust (hoy van SIN comprimir: 35,5 MB de los 37,4 de la APK) | 34,9 MB | 10,8 MB (`useLegacyPackaging`) |
| **APK de StarSeed OS** | — | **≈ 137 MB** con las tres ABI (≈ 93 MB con `--abis arm64-v8a`); hoy 37,4 MB (v0.5.0) |

En el aparato, además: el servidor extraído (≈ 485–550 MB en `noBackupFilesDir`) y las `.so` de su ABI extraídas al
instalar (≈ 70 MB). El CI escribe el tamaño REAL de la APK firmada y su desglose en el resumen del job (paso
«Servidor local Android · tamaño de la APK»), y el de cada pieza en el de «armar».

**Límites honestos (antes de encenderlo por defecto).**
1. **Sin probar en un aparato real.** Compilado (`cargo check` aarch64 y armv7 con y sin el interruptor; Kotlin contra
   `android.jar` 34), probado lo puro y el envoltorio en modo Android, y armado con el zip real de nodejs-mobile; pero
   nadie ha visto aún `node::Start` arrancar en una tablet con este código, ni Gradle empaquetarlo (no cupo en el
   contenedor: el NDK + Gradle + Rust de Android no caben en 6,7 GB).
2. **Origen nuevo:** la APK pasa de `https://starseed-os.vercel.app` a `http://127.0.0.1:47610`. Lo que solo vivía en
   el `localStorage`/IndexedDB de la web publicada **no** se trae (la migración T4 es de escritorio: usa una ventana
   oculta y Tauri móvil tiene una sola). Hay que iniciar sesión otra vez y lo local empieza vacío. Pendiente T14.
3. **Node 24 (nodejs-mobile) en vez de 22**, y su ICU es «small-icu» (solo inglés): las fechas y números con `es` que
   formatee el SERVIDOR salen en inglés (React lo corrige en el cliente, con un aviso de hidratación). Arreglo:
   `icudt78l.dat` en los assets y `NODE_ICU_DATA` (pendiente T15).
4. **Una sola vez por proceso:** si Node se cae, la web publicada hasta reabrir la app.
5. **RAM:** Next ≈ 200–300 MB + la WebView; el heap va topado (RAM/6, 256–768 MB). Con 2 GB puede ir justo.
6. **Primera apertura de cada versión:** extraer ≈ 500 MB (estimado 1–3 min en una tablet, con progreso).
7. `tauri android dev`/APK de depuración con el interruptor: la red local solo deja HTTP en claro hacia 127.0.0.1
   (un servidor de desarrollo en la LAN no cargaría).
8. **x86 (32 bits)**: nodejs-mobile no lo trae → la web publicada.

**Cómo probarlo en la tablet.**
1. *Run workflow* con `plataformas` = `android` y `servidor_local_android` marcado. En el resumen del job
   `os · android`: «Servidor local DENTRO de la APK» (piezas) y «APK · os · servidor local dentro: sí» (tamaño real).
   Descargar `StarSeed-os-<versión>.apk` del Release borrador `native-<n>` e instalarla (misma clave que las de
   siempre: actualiza encima).
2. Primera apertura (con o sin red): página de arranque con el progreso → «Listo» → el OS en `127.0.0.1:47610`.
   Iniciar sesión con red (origen nuevo, límite 2).
3. **Modo avión → cerrar la app del todo → abrirla**: debe arrancar en local en segundos (sin extraer otra vez) y
   moverse por las secciones de §7 (Escritorios, Protomolécula, Documentos, Malla…).
4. Comprobar el servidor desde un ordenador: `adb forward tcp:47610 tcp:47610` y
   `curl -s http://127.0.0.1:47610/__starseed/salud` → `"servidor":"starseed-os-local","listo":true,"pase":true,
   "interna":"protegida"`, `node` `v24.18.0`. Y `curl -s -X POST http://127.0.0.1:47610/api/x` → 403 `sin-pase`.
5. Si cae a la web publicada, la página de arranque dice el motivo. Para el registro hace falta una APK depurable
   (`cargo tauri android build --debug --apk` con el interruptor): `adb shell run-as app.starseed.os cat
   no_backup/servidor-local/servidor-local.log` (debe decir «pase de la app recibido» y «el Next interno solo atiende
   a esta puerta») y `chrome://inspect` para la WebView. `adb logcat | grep -i starseed` sirve en ambas.
6. Medir RAM (`adb shell dumpsys meminfo app.starseed.os`) y el arranque en frío; si no cabe, el respaldo C (§9.1.1)
   sigue siendo el modo de los aparatos con poca memoria.

### 9.1.1 Service worker v8: la app entera sin conexión (opción C · SW1107A · ESCRITO SIN PUBLICAR)

Llega a todos los medios que abren la web (APK de Android ya instaladas, PWA, navegador) **solo con publicar la
web**: la página registra `/sw-v8.js` y el SW se actualiza solo (`/sw-v7.js` queda como una línea que importa el
v8, para que una pestaña vieja no vuelva al v7, que al activarse borraba todas las cachés ajenas).

| Pieza | Archivo |
|---|---|
| Lógica pura (clasificar peticiones, lista de API, manifiesto, plan, cuándo precargar, cachés) — 28 pruebas | `public/sw-logica.js` (lo carga el SW con `importScripts`; las pruebas con `require`) |
| Service worker (estrategias, precarga, cierre de sesión) — 14 pruebas con el SW de verdad en un entorno simulado | `public/sw-v8.js`, `src/lib/pwa/__tests__/sw-v8.test.ts` + `sw-entorno-prueba.ts` |
| Manifiesto del build (`postbuild`; en el CI, un paso propio) — 6 pruebas con un `.next` de mentira | `scripts/precarga-sw.mjs` → `public/precarga.json` (no se versiona) |
| Página: pedir la precarga, recibir su estado, olvidar la sesión — 5 pruebas | `src/lib/pwa/precarga-cliente.ts`, `src/components/pwa/register-sw.tsx`, `signOut` de `src/context/account-context.tsx` |
| Respaldo para lo que aún no está guardado (enseña lo que sí) | `public/offline.html` |
| Comprobación en un Chrome de verdad (sin `next build`): mini app de mentira con los archivos reales del SW — 13/13 el 2026-11-07 | `scripts/verificacion-ui/sw-sin-conexion.mjs` |

**Qué hace cada petición** (todo GET del mismo origen; POST/PUT/DELETE y otros orígenes no se tocan):

| Petición | Con red | Sin red |
|---|---|---|
| Navegación (HTML) | Red primero sin caché del edge (cada despliegue llega al momento, como antes); la copia buena se guarda. Pasarela caída (502/503/504) o 10 s sin respuesta → la copia guardada si existe | La página de la build precargada (con o sin `?consulta`) → la última visitada → `/offline.html` en la MISMA dirección, con la lista de lo guardado |
| Carga RSC (`RSC: 1` / `?_rsc=`: navegación interna de Next) | Red | La carga COMPLETA de esa ruta guardada en la precarga (pedida sin árbol del router: Next la aplica desde la raíz). Si es de otra build, Next navega «a la antigua» y entra la página guardada. Sin copia → 504 de texto → Next hace lo mismo. Las precargas por segmento nunca reciben la carga completa |
| `/_next/static/**` (hash en el nombre) | Caché primero (ignora `?dpl=`) | Caché |
| Medios de `public/` | Caché primero (como en v7) | Caché |
| `GET /api/*` | Red; se guarda la respuesta buena (200, JSON/texto, sin `no-store`, ≤ 1 MB) solo de la **lista blanca** | La última buena, con `X-StarSeed-Sin-Conexion: 1` y `X-StarSeed-Guardado` |
| Resto (manifest, `/_next/image`, JSON públicos) | Red primero | Copia |
| `/sw-*.js`, `/version.json`, `/precarga.json`, `/__starseed/*`, `/auth/*`, una API abierta como página, peticiones con `Range` | Directo a la red | Directo a la red |

**API con respaldo: lista BLANCA** (`API_RESPALDO_PERMITIDAS`): `/api/os/versiones`, `/api/library/actualizaciones`,
`/api/github-repo/*` (catálogos públicos, iguales para todos). Se revisaron las 112 rutas GET: con solo una lista
negra quedaban 8, y 5 eran de sesión, de esta neurona o estados en vivo (artcraft, astraura/automejora,
astraura/nodos, avatares/externo, network/openwisp). Por eso una ruta nueva NUNCA se guarda hasta que alguien la
añade; dentro de la lista blanca hay además lista negra de prefijos, de palabras (sesión, token, clave, salud,
estado, live…), de parámetros (`token`, `key`, `code`…) y de cabeceras (`Authorization`, `Range`, SSE). Una prueba
recorre las rutas GET reales de `src/app/api` y falla si alguna fuera de la lista quedara con respaldo.

**Precarga en segundo plano.** `RegisterSW` pide «PRECARGAR» a los 20 s del arranque, cada 15 min con la pestaña
visible y 3 s después de volver la red (`window.STARSEED_PRECARGAR(true)` la pide aunque haya datos móviles). El SW:
1. Decide si toca (`debePrecargar`): nunca sin red; nunca en el servidor local (127.0.0.1/localhost: ya lo tiene
   todo, salvo pedida a mano); no con ahorro de datos, datos móviles (`connection.type = cellular`) ni 2G; no dos
   veces en el mismo minuto. Donde el navegador no dice el tipo de red (Safari, Firefox), sí.
2. Lee `/precarga.json` (revalidado: 304 si no cambió). Misma build ya completa → solo comprueba cada 30 min; a
   medias → sigue a los 2 min; build nueva → empieza.
3. Planifica con el espacio libre (`navigator.storage.estimate()`, contando como libre lo que ocupan las builds
   viejas): usa como mucho libre / 1,25 − 50 MB, y corta por **bloques**, para que lo guardado siempre sirva:
   página sin conexión + código común; luego cada ruta (en orden de prioridad: `/`, escritorios, dashboard,
   inicio, login…) con sus chunks iniciales, su HTML y su RSC; al final los chunks perezosos y `public/`.
4. Baja con concurrencia 3, en la caché `starseed-build-<buildId>`: HTML y RSC sin caché HTTP y **sin seguir
   redirecciones** (una página que manda a `/login` no se guarda como si fuera la página); un estático con hash
   que ya está en otra caché se copia en vez de bajarlo. Cada pasada se para a los 4 min (Chrome corta un evento a
   los 5) y la siguiente sigue donde se quedó; 4xx y redirecciones no se reintentan, red caída y 5xx sí.
5. Build completa → retira las builds anteriores. Mientras no lo esté, se queda la anterior (y sin red se busca
   primero en las completas). El estado vive en `starseed-meta-v1` y se avisa a la página
   (`window.STARSEED_PRECARGA`, evento `starseed:precarga`).

**Cerrar sesión** (`signOut`): el SW borra la caché de API y, de las builds y de la caché de ejecución, las páginas
y cargas RSC que no son estáticas (las SSG son iguales para todos); la siguiente pasada las rellena con la sesión
nueva.

**Tamaños (medidos el 2026-11-07 con el build de main de la Mac, `AA0YdaG0s8hV9CgdmX1rc`):** 108 páginas (105
estáticas, 3 dinámicas; sin `/genesis`, `/metagenesis`, `/poligenesis`, páginas de prueba ni rutas con parámetros);
1.181 estáticos = 60,4 MB (los iniciales de las páginas: 447, 27,4 MB); `public/`: 33 archivos, 2,9 MB; HTML + RSC ≈
112,7 MB (≈ 0,5 MB cada uno, casi todo la misma carga del layout raíz). **En disco ≈ 176 MB; de descarga ≈ 20–25 MB**
(el HTML y el RSC comprimen ≈ 30:1, ≈ 17 KB cada uno; el JS ≈ 3–4:1), y en cada despliegue solo lo que cambió (los
chunks con el mismo hash se copian). Manifiesto: 84 KB (23 KB comprimido). Coste en Vercel por neurona y despliegue:
≈ 216 peticiones de páginas, casi todas servidas por el CDN (solo 3 rutas dinámicas invocan funciones).

**Android (Tauri 2 / wry).** La WebView del sistema (Chromium) registra service workers para un origen `https`
remoto sin ajustes: wry activa JavaScript y `domStorageEnabled`, no cambia el modo de caché ni pone un
`ServiceWorkerClient`, y su `shouldInterceptRequest` solo contesta los protocolos propios de Tauri (lo demás va a
la red, y por tanto al SW). Comprobado en el código de wry (`RustWebView.kt`, `RustWebViewClient.kt`). **No hace
falta ningún cambio nativo**: por eso llega a las APK ya instaladas. Escritorio: Windows (WebView2) y Linux
(WebKitGTK) también tienen SW, pero allí la app abre el servidor local (127.0.0.1, el SW no precarga); macOS
(WKWebView) no tiene SW para orígenes remotos: allí manda el servidor local. iOS: WKWebView solo los admite con
App-Bound Domains (pendiente con la app de iOS).

**Límites honestos.**
- La **primera vez hace falta internet**: para registrar el SW y precargar (unos minutos con Wi-Fi). Con datos
  móviles no precarga sola (botón/llamada «forzar»). Hasta entonces, sin red solo sale lo visitado.
- **Datos de Supabase sin red: solo lo que haya en local** (`localStorage`/IndexedDB de esta neurona, ver §7) o en
  caché. Lo que lee Supabase en el servidor sale como estaba al precargar o visitar; lo que se escribe sin red
  depende de cada sección (el SW nunca guarda ni repite un POST).
- **API**: solo los tres catálogos de la lista blanca tienen respaldo; el resto falla sin red como hoy (las
  secciones ya lo toleran, §7). Las server actions de Genkit tampoco funcionan sin red (T5).
- **Rutas con parámetros** (`/pagina/[slug]`, `/post/[id]`…): solo las ya visitadas; si no, `/offline.html`.
- **Espacio**: ≈ 176 MB por origen. El navegador puede borrarlo si falta espacio; en la app instalada (PWA o
  nativa) se pide almacenamiento persistente (Chrome y Safari deciden sin preguntar; en Firefox no se pide porque
  abre un aviso). Safari borra lo de las webs no usadas en 7 días (no a las añadidas a la pantalla de inicio).
- Una página guardada de una build anterior se ve con esa versión hasta que vuelve la red (entonces llega la
  nueva al momento, como siempre).

**Cómo se verifica.**
- Sin build: `node scripts/verificacion-ui/sw-sin-conexion.mjs` (Chrome sin ventana, 13 comprobaciones: registro,
  precarga sola, sin red página/consulta/código/RSC/`offline.html`/API con y sin respaldo, y vuelta de la red).
- Navegador (Chrome/Edge), en la web publicada: DevTools → Application → Service Workers (`sw-v8.js`, activado);
  Cache Storage → `starseed-build-<buildId>` (≈ 1.400 entradas al terminar), `starseed-meta-v1` →
  `/__starseed/sw-precarga-estado`; en la consola, `STARSEED_PRECARGA` (fase `lista`, `completo: true`) y
  `STARSEED_PRECARGAR(true)` para empezar ya. Después: Network → Offline y navegar por las secciones (también
  recargar). `curl -sI <web>/precarga.json` debe dar 200 tras el despliegue.
- Android: abrir la app con Wi-Fi y dejarla unos minutos en primer plano → modo avión → cerrarla del todo →
  abrirla: debe arrancar y moverse por las secciones. Con un APK de depuración (o el Chrome del móvil) se puede
  mirar lo mismo en `chrome://inspect/#devices`.

### 9.2 iOS
Sin app nativa publicada (ver `apps-nativas-segundo-plano.md`). nodejs-mobile iOS corre V8 sin JIT (lento); queda
para cuando haya cuenta de desarrollador. Mientras, la PWA.

### 9.3 Nexus y Café
Son otro repositorio (`alexbordongarrigos/Starseed-Cafe`) y portales casi estáticos: no necesitan Node. Plan: el
job de Nexus/Café hace checkout de su repo y usa sus archivos como `frontendDist` (embebidos en el binario), con la
web publicada solo para lo que pida red. Pendiente T7.

## 10. Actualizar el servidor local por capas, sin reinstalar (T1 · CAP1107A · ESCRITO SIN PUBLICAR)

Petición de Alex del 10-10 («según el cambio se reinician los servidores dentro de la app sin reinstalarla»). Dos
capas: **binario** (Rust + Node + página de arranque: el updater de siempre, ≈ 130 MB) y **servidor** (la carpeta
`servidor/` del instalador: standalone + static + public + envoltorio, ≈ 45–50 MB en .tar.gz), que ahora llega sola.

**Qué es una capa.** EXACTAMENTE la carpeta `servidor/` del instalador sin Node (`copiarServidor` de `preparar.mjs`,
la misma función para los dos) en `servidor-capa-<BUILD_ID>.tar.gz` (tar ustar/pax determinista: solo archivos,
0644, fecha 0; gzip -9) + `servidor-capa-<BUILD_ID>.json`, el **manifiesto firmado**: `formato` 1, `build_id`,
`version`/`commit` (de la web), `creado_ms`, `app_minima` (`APP_MINIMA` de `capa.mjs`: hoy 0.5.0), `protocolo`
(`PROTOCOLO` de `starseed-arranque.cjs`: hoy 1), `node_mayor`, `archivo {nombre, bytes, sha256}`, `total` y
`archivos: [[ruta, bytes, sha256]…]` (por orden de bytes UTF-8). El puntero `latest-servidor.json` NO va firmado:
dice dónde están y lleva dentro la firma del manifiesto (como `latest.json`); todo se vuelve a comprobar contra el
manifiesto firmado.

**Cómo se publica.**

| Dónde | Cuándo | Qué hace |
|---|---|---|
| `native-build.yml` → job `servidor-capa` | Cada build nativo, tras `build-desktop` (`continue-on-error`) | Con el MISMO `servidor-next.tar` de los instaladores: arma, firma y adjunta al release (borrador); con `vars.SERVIDOR_CAPAS_CANAL == '1'`, además al canal |
| `.github/workflows/servidor-capa.yml` | Cada push a `main` que toque la web (`src/`, `public/`, `package*.json`, `next.config.ts`, `middleware.ts`, `native/servidor-local/`) SOLO con esa variable; o a mano (con «publicar» o sin él) | `next build` igual que `servidor-local-next` (con `solo-mac.mjs`), arma, firma y publica en el canal. Uno a la vez (`concurrency` sin cancelar: con varios pushes seguidos, solo el último) |

Los dos usan `native/servidor-local/publicar-capa.sh`: `capa.mjs armar` → `tauri signer sign` (la CLI lee
`TAURI_SIGNING_PRIVATE_KEY` y `…_PASSWORD` del entorno: los dos secretos existen en el repo desde el 30-08; la clave
nunca se escribe en disco) → `capa.mjs canal` → `gh release upload`. **Canal fijo:** Release `servidor-local`
(prerelease: nunca «latest», así no toca el `latest.json` del updater) →
`https://github.com/StarSeedSystem/starseed-system/releases/download/servidor-local/latest-servidor.json`. Capa y
manifiesto primero, el puntero lo último; se quedan las 4 capas más recientes (`capa.mjs podar`). Sin el secreto:
ni firma ni publicación (aviso). **Apagado por defecto:** hasta que Alex ponga la variable del repo
`SERVIDOR_CAPAS_CANAL=1` (Settings → Secrets and variables → Actions → Variables), ninguna app recibe nada; solo se
adjunta al release para revisarla.

**Cómo se aplica (la app).** `servidor_capas.rs` (pegamento) + `servidor_capas_logica.rs` (puro):
1. **Mirar.** A los 90 s del primer «listo» y luego cada 6 h (30 min tras un error), con internet, baja el puntero
   (≤ 64 KiB) con el `curl` del sistema (solo https, también en las redirecciones). `decidir`: formato conocido,
   build con nombre seguro, ni la del instalador ni la activa ni la pendiente ni una mala, `app_minima` ≤ esta app,
   protocolo conocido y **más nueva** (`creado_ms`) que todo lo que ya hay: un puntero viejo o manipulado nunca hace
   volver atrás.
2. **Verificar el manifiesto** (≤ 16 MiB): firma minisign con **la clave pública del updater**
   (`plugins.updater.pubkey` de `tauri.conf.json`: la misma), sin firmas «legacy», y el comentario firmado debe nombrar
   ESE archivo (`file:servidor-capa-<build>.json`). `validar_manifiesto`: el puntero dice lo mismo que el manifiesto
   (build, fecha, app mínima, protocolo, nombre/tamaño/SHA del .tar.gz, URLs), Node compatible, lista ordenada sin
   repetidos, sin rutas peligrosas (`..`, absolutas, `\`, `:`, controles, punto o espacio final), sin pares que solo
   cambian en mayúsculas, sin «archivo y carpeta», con los 6 archivos que necesita el arranque y el total cuadrado
   (≤ 4 GiB).
3. **Bajar.** Hace falta el .tar.gz que falte + la capa extraída + 512 MB libres. Reanudable (`-C -`) en
   `servidor-capas/descargas/<archivo>.parcial`; SHA-256 del archivo entero contra el manifiesto.
4. **Extraer** a `servidor-capas/<build>.extrayendo/` con el lector **estricto** de tar (solo archivos y carpetas: un
   enlace, un dispositivo o una ruta rara tiran la capa entera): cada archivo debe estar en la lista con su tamaño, se
   escribe con `create_new` (nunca pisa) calculando su SHA-256 y al final no puede faltar ninguno. Los idénticos a la
   capa que sirve (misma ruta, tamaño y SHA) se **enlazan** (enlace duro) en vez de escribirse: una capa nueva ocupa
   en disco solo lo que cambió. Se guardan dentro el manifiesto y su firma y se renombra a `servidor-capas/<build>/`:
   queda **PENDIENTE**.
5. **Aplicar.** La pastilla del servidor local (`EstadoServidorLocal`, Ajustes → Neuronas y Aparatos en vivo) dice
   qué capa sirve («· capa del instalador» / «· capa AA0YdaG0») y, con una pendiente, enseña **«capa nueva lista ·
   <versión · commit> · Actualizar ahora»**. Ese botón llama a `servidor_local_actualizar` (capability
   `servidor-capas`: solo la ventana `main` y solo desde los diez orígenes locales; Rust comprueba además que la
   ventana está ahora en el servidor local): cierra la entrada estándar del Node (sale solo), lo relanza **en el
   mismo puerto** con la capa nueva y, al contestar «listo», **recarga la página**: misma ventana, mismo origen
   (localStorage/IndexedDB intactos) y misma cookie del pase (el pase es del arranque de la app, §3.1). Sin pulsar
   nada, la usa el siguiente arranque.
6. **Qué sirve cada arranque del Node** (`elegir`): la pendiente (a prueba, ≤ 3 intentos sin conclusión) → la activa
   → la anterior → el instalador. Cada capa se vuelve a comprobar antes de usarla (firma de su manifiesto,
   `BUILD_ID` y archivos clave); una que ya no es compatible, o más vieja que el paquete de un instalador recién
   actualizado, no se usa. El Node es siempre el de la app.

**Cómo se vuelve atrás.**
- Capa a prueba que no da «listo» en **60 s**, o cuyo Node se cierra al arrancar → **mala** (no se vuelve a bajar),
  se borra su carpeta y se relanza AL MOMENTO con la anterior (no cuenta como caída).
- Recién promovida, si se cae en sus primeros **30 s** → lo mismo.
- Una capa que se cae una y otra vez (la política de siempre: más de 3 caídas en 5 min) → mala y a la anterior, en
  vez de rendirse a la web publicada.
- Al promover, la activa de antes queda como **anterior**. Se borran las capas que no son ni activa, ni anterior, ni
  pendiente, ni la que sirve. **La del instalador nunca se toca** (vive dentro de la app).
- La pastilla y `servidor-local.log` lo cuentan («La capa X no pasó la salud (…): se volvió a la capa Y.»).
- A mano: borrar `<app_data>/servidor-capas/` (o su `estado.json`) devuelve la app a su instalador en el siguiente
  arranque.

Estado: `<app_data>/servidor-capas/estado.json` (`activa`, `anterior`, `pendiente`, `intentos`, `malas` ≤ 20,
`aviso`), escrito de forma atómica.

**Límites honestos.**
- Solo escritorio (como el servidor local). Android/iOS siguen con el SW v8 (§9.1.1), que ya llega con publicar la web.
- La capa trae solo el servidor: Rust, el Node y la página de arranque siguen llegando con el updater. Si una capa
  necesita algo nuevo de Rust, se sube `APP_MINIMA` (`capa.mjs`) o `PROTOCOLO` (envoltorio +
  `PROTOCOLOS_ADMITIDOS`): las apps viejas se quedan en su última capa compatible. `contrato-rust.test.ts` vigila que
  Rust, envoltorio, `capa.mjs`, la capability y la web casen.
- Se baja la capa entera (≈ 45–50 MB), no solo lo cambiado; en disco sí se reutiliza lo igual (sin enlaces duros
  —p. ej. exFAT— cada capa ocupa ≈ 440 MB y hay como mucho tres a la vez).
- Los archivos se verifican uno a uno al instalar la capa; luego, en cada arranque, solo la firma del manifiesto y
  los archivos clave (un programa del MISMO usuario puede cambiar `<app_data>`, como todo lo de ese usuario).
- `version` es la de `package.json` de la web (hoy 0.3.0): la pastilla enseña además el commit.
- Con varias instancias de la app a la vez comparten `servidor-capas/` (funciona, pero una puede borrar la capa mala
  que la otra aún tiene abierta).
- Sin probar aún con la app real en macOS y Windows (T12).

**Comprobado (2026-11-07, contenedor Linux, app real: `cargo build` debug + WebKitGTK + Xvfb, el paquete del
instalador armado con `preparar.mjs` y un canal en `http://127.0.0.1` firmado con una clave de PRUEBA puesta solo en
esa copia de `tauri.conf.json`; en depuración `STARSEED_CANAL_SERVIDOR` y `STARSEED_CAPAS_PRIMERA_MS` cambian el
canal y la primera mirada, en release no existen).** (1) La app sirvió su instalador (`Inst1`); a los 5 s el vigía
bajó el puntero, verificó la firma, bajó y verificó el .tar.gz, extrajo `Capa2` (10/10) y la dejó pendiente; la
página vio «capa nueva lista», llamó a `servidor_local_actualizar`, Rust relanzó solo el Node en el MISMO puerto
47610 con `Capa2` a prueba, contestó «listo», la promovió y recargó la página, que volvió a hablar con Rust con el
mismo pase. (2) `Capa3Mala` (su `server.js` sale con código 1): bajada y verificada (7 de 10 archivos enlazados de
`Capa2`), «Actualizar ahora» → «se cerró al arrancar» → mala, `estado.json` = `{activa: Capa2, malas: [Capa3Mala]}`,
relanzada con `Capa2` en el mismo puerto, página recargada y el aviso en la pastilla.

Siguiente paso posible: bajar solo lo cambiado (el manifiesto ya trae el SHA-256 de cada archivo).

## 11. Riesgos para el próximo lanzamiento nativo

1. **Primer `next build` en `native-build.yml`.** Es el mismo de `ci.yml` (que pasa), con `STARSEED_APP_NATIVA=1`;
   si falla, los instaladores salen como hoy (sin servidor local) y el aviso lo dice.
2. **Variables del repo** `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`: si no existen, no hay servidor local (a propósito).
3. **macOS**: el Node va firmado ad-hoc; la app sigue sin `signingIdentity`. Probar en una Mac limpia que el Node
   arranca tras «clic derecho → Abrir» (si Gatekeeper lo frena, mirar `servidor-local.log` y valorar
   `bundle.macOS.signingIdentity: "-"` para firmar todo el paquete). WKWebView y `http://127.0.0.1`: desde
   macOS 14, App Transport Security ya no deja cargar direcciones IP por defecto; `native/src-tauri/Info.plist`
   declara `NSAllowsLocalNetworking` y la excepción exacta de `127.0.0.1` (solo http). Si aun así la ventana se
   queda en blanco tras «Listo», es lo primero que mirar.
4. **Windows**: MSI con ≈ 4.700 archivos (rutas ≤ 90 caracteres + prefijo: lejos de 260). El Node se lanza con
   `CREATE_NO_WINDOW`. Probar que el antivirus no frena `starseed-node.exe` sin firma Authenticode.
5. **Tamaño del updater**: cada actualización del BINARIO baja el instalador entero (≈ 130 MB en macOS); lo de la
   web llega como capa (≈ 45–50 MB, §10) en cuanto se active el canal.
6. **Versión del servidor ≠ versión de la web**: las páginas son las del instalador (o de la última capa) y `/api`
   la de la web publicada; si una API cambia de forma incompatible, se nota hasta que llega la capa (§10: con
   `SERVIDOR_CAPAS_CANAL=1`, unos 45 min tras el push) o se actualiza la app.
7. **Origen nuevo**: hay que iniciar sesión una vez con internet en la app nueva (la sesión no se migra, a
   propósito; lo demás sí, §2.1).
8. **Service worker v8 (SW1107A), al publicar la web:** (a) que `/precarga.json` responda 200 en el primer
   despliegue (lo escribe `postbuild`, que npm lanza tras `npm run build` en Vercel; si no está, el SW sigue como
   el v7 —solo lo visitado— y lo dice con la fase `sin-manifiesto`); (b) cada medio sustituye al v7 con UNA
   recarga (la de siempre al cambiar de controlador, con su tope de dos) y pierde la caché de ejecución vieja
   hasta que termina su primera precarga; (c) ≈ 176 MB de disco por medio: en aparatos con poco espacio la
   precarga se queda en las rutas que caben (por prioridad) y lo dice (`parcial`/`sin-espacio`); (d) la red de la
   precarga: ≈ 20–25 MB la primera vez y luego solo lo cambiado, nunca con datos móviles sin pedirlo.
9. **ACL de los comandos propios (APP1107B).** Si alguien añade un comando a `generate_handler!` y no a
   `COMANDOS_APP` de `build.rs` + una capability, la web no podrá llamarlo (rechazo «not allowed by ACL»); la prueba
   `contrato-rust.test.ts` lo pone en rojo antes. Ojo con cualquier comando nuevo: concederlo a `default.json` lo abre
   también a la web publicada.
10. **Migración (T4), primera vez con la app real.** (a) La ventana oculta en WKWebView/WebView2/WebKitGTK: que el
    script de inicio corra en `offline.html` y que el puente IPC conteste desde la web publicada (es lo mismo que ya
    hacía la ventana principal en la 0.4.3, ahora con su capability); si no, la migración se pospone sola 3 veces y lo
    dice. (b) Una exportación grande (≈ 64 MiB) viaja en ≈ 64 llamadas IPC: segundos, no minutos. (c) La primera
    pantalla del OS sale tras «Trayendo tus datos…» (≤ 40 s en el peor caso, normalmente 1–3 s).
11. **Servidor local y peticiones de otras webs (T11 · HECHO, SEG1107A, §3.1).** La guarda del envoltorio cierra los
    POST y GET a `/api` de otras webs, el DNS rebinding, otros programas sin el pase, los WebSocket ajenos y el
    puerto interno de Next; ya no bloquea el lanzamiento. Al probar la primera app real de macOS y Windows (con
    T12): la ventana debe entrar por `/__starseed/entrar` y `/api` responder; si saliera 403 `sin-pase`, la cookie no
    se guardó (es lo primero que mirar). `servidor-local.log` debe decir «pase de la app recibido» y «el Next interno
    solo atiende a esta puerta»; la salud, `"pase":true` e `"interna":"protegida"`. Lo que no cubre está en §3.1.

12. **Migración sin internet (T4b · TAM1107A).** (a) Las dependencias de plataforma (`webkit2gtk 2`, `objc2 0.6` +
    `objc2-foundation 0.3`, `webview2-com 0.39` + `windows 0.62`) tienen que ser las MISMAS que trae tauri: sin
    `Cargo.lock` en el repo, el CI resuelve la última tauri; si una tauri futura sube `webview2-com` a 0.40 (o
    `webkit2gtk` a 3), el build de ese sistema falla al compilar hasta subir la nuestra igual (hoy: tauri 2.12.5 →
    webview2-com 0.39.1, windows 0.62.2, objc2 0.6.5, objc2-foundation 0.3.2, webkit2gtk 2.0.2). (b) macOS y
    Windows solo compilados en cruzado: en T12, mirar `migracion_origen_estado` (`modo`) y `estado.json`; si sin red
    se queda en `pospuesta` con «No se pudo abrir sin conexión…», el motivo dice qué llamada falló.
13. **Manifiestos compactados (T13 · TAM1107A).** Si un Next futuro cambiara cómo carga los
    `*_client-reference-manifest.js` (hoy `vm.runInNewContext` sin `require`, igual en 15.5) o su forma, cada
    archivo que no cuadre se queda como salió de Next (la comprobación es por archivo y en el propio build); para
    volver atrás del todo basta quitar el paso del job y pasar `--sin-compactar` a `preparar.mjs`. Lo primero que
    mirar si una página de la app nativa sale en blanco o con «Could not find the module … in the React Client
    Manifest»: el resumen del job (cuántos se compactaron) y `servidor-local.log`.
12. **Capas del servidor (T1 · CAP1107A, §10).** (a) El canal está APAGADO: activarlo es poner
    `SERVIDOR_CAPAS_CANAL=1`; desde entonces cada push que toque la web compila otra vez Next en el CI (≈ 20–40 min de
    runner, uno a la vez) y llega a todas las apps ≥ 0.5.0. (b) El primer job firma con `tauri signer sign` y los
    secretos del updater: si la clave tuviera contraseña y el secreto `…_PASSWORD` no casara, el job avisa y no publica
    (los instaladores no se ven afectados). (c) El Release `servidor-local` lo crea el propio job (prerelease, etiqueta
    nueva sobre el commit). (d) Con la app real en macOS y Windows: que `curl` del sistema baje de
    `objects.githubusercontent.com`, que los enlaces duros funcionen en `~/Library/Application Support` y
    `%APPDATA%`, y que la página se recargue tras «Actualizar ahora» (`servidor-local.log` dice «relevo de capa pedido
    desde la app» y «capa … activa»).
12. **(AND1107A) Servidor local en Android, si alguien enciende el interruptor:** la APK pasa de ≈ 37 a ≈ 137 MB,
    cambia de origen (sesión y datos locales de la web publicada no viajan: T14) y aún no se ha visto en un aparato
    real (§9.1, límites). Por eso va apagado; las etiquetas `v*` solo lo llevan con la variable del repo.

14. **(MIC1108A) Micrófono, cámara y pantalla (§13).** Todo lo nativo llega solo con un build nuevo. Con firma
    ad-hoc, macOS puede volver a preguntar por el micrófono tras cada actualización (TCC la ve como otra app). Si
    algún día se firma con Developer ID (Tauri enciende el hardened runtime), hacen falta los entitlements
    `com.apple.security.device.audio-input` y `com.apple.security.device.camera` (y `allow-jit` para el Node).

## 12. Pendientes (tareas concretas)

| Id | Tarea |
|---|---|
| T1 | Capas del servidor local con firma y rollback: **ESCRITA SIN PUBLICAR (CAP1107A, §10)** — capa firmada con la clave del updater, canal fijo `servidor-local` (apagado hasta `SERVIDOR_CAPAS_CANAL=1`), «Actualizar ahora» sin cerrar la app, vuelta atrás a los 60 s / 30 s. Falta verla en macOS y Windows (con T12) y, si se quiere, bajar solo lo cambiado |
| T2 | Android opción C (precarga del SW): **ESCRITA SIN PUBLICAR (SW1107A, §9.1.1)**. Falta A (nodejs-mobile, §9.1) |
| T1 | Capas del servidor local con firma y rollback (§10) |
| T2 | Android: opción C (precarga del SW) **ESCRITA SIN PUBLICAR (SW1107A, §9.1.1)**; opción A (nodejs-mobile) **ESCRITA SIN PUBLICAR detrás de un interruptor apagado (AND1107A, §9.1)**. Falta probar A en una tablet (receta en §9.1) y decidir si se enciende |
| T3 | Medir en el CI los tamaños reales y corregir §6 |
| T4 | Migrar al origen local lo que vivía en el origen de la web publicada: **ESCRITA SIN PUBLICAR (APP1107B, §2.1)** — localStorage + IndexedDB, sin sesión, fusión sin pisar, copia sin secretos, marcador, aviso. Falta T12 |
| T4b | Migración SIN internet al primer arranque: **ESCRITA SIN PUBLICAR (TAM1107A, §2.1.1)** — HTML del binario con la dirección de la web (`load_html` / `loadHTMLString:baseURL:` / `WebResourceRequested`), sin leer los archivos del motor; probada con la app real en Linux sin red. Falta verla en macOS y Windows (con T12) |
| T5 | Pasar los 3 flujos de Genkit (server actions) a rutas `/api` para que viajen a la web con internet |
| T6 | Enseñar `servidor_local_estado` en Ajustes → Neurona y en las señales del medio («app nativa · servidor local») |
| T7 | Nexus y Café con sus archivos dentro (§9.3) |
| T8 | Quitar del build nativo lo que solo vive en la Mac: **ESCRITA SIN PUBLICAR (APP1107B)** — `/api/mando/**` fuera (−65,6 MB instalado, −2 MB en dmg/msi/deb; §6) y 404 en el envoltorio. `/genesis`, `/metagenesis` y `/poligenesis` se quedan: no son solo de la Mac (§5) |
| T9 | Enseñar el estado de la precarga (evento `starseed:precarga`) en Ajustes → Neurona, con un botón «Descargar para usar sin internet» (`STARSEED_PRECARGAR(true)`, para quien solo tiene datos móviles) |
| T10 | Probar el SW v8 en un navegador real contra un `next start` del build (en el A1 o el CI, no en la Mac): precarga completa, modo avión y vuelta de la red |
| T11 | Guarda en el envoltorio contra peticiones de otras webs al servidor local: **HECHA (SEG1107A, §3.1)** — Host exacto (rebinding), Origin/Sec-Fetch-Site, pase de Rust en cookie `HttpOnly; SameSite=Strict` para `/api`, cambios y WebSocket, sin CORS abierto y el Next interno solo para la puerta. Falta verla con la app real en macOS y Windows (con T12) |
| T12 | Probar la migración (T4) con la app real en macOS y Windows (receta en §8; Linux ya probado, §2.1) |
| T13 | Bajar el peso de los 291 `*_client-reference-manifest.js` en el paquete nativo: **ESCRITA SIN PUBLICAR (TAM1107A, §6.1)** — 192 → 20 MB en la app (−172 MB instalado), mismo HTML byte a byte con el standalone real. Falta ver el resumen del primer CI (T3) |
| T13 | Bajar el peso de los 291 `*_client-reference-manifest.js` (252,6 MB, §6) en el paquete nativo |
| T14 | Android con el interruptor: traer lo del origen de la web publicada al origen local (T4 en Android: la ventana única carga primero `offline.html` de la web con el script de exportación y luego va al servidor local) |
| T15 | Android con el interruptor: ICU completo (`icudt78l.dat` en los assets + `NODE_ICU_DATA`) para que el servidor formatee en español |
| T16 | (MIC1108A, §13) Ver en aparatos reales: aviso de micrófono y cámara de macOS, avisos de Android, «Abrir ajustes», pantalla compartida en macOS/Windows/Linux, auriculares Bluetooth en Android 12+. iOS (`Info.ios.plist`) sin cubrir |

## 13. Micrófono, cámara y pantalla en las apps instaladas (MIC1108A · ESCRITO SIN PUBLICAR)

**Síntoma (08-11, aparatos reales).** En la app de escritorio instalada (main `edcf74362f`, `app.starseed.os`, firma
ad-hoc) el botón de llamada de Mensajes › Neuronas › Maggaboard decía «Este navegador no deja usar el micrófono».
La APK de prueba, igual. Llamadas (voz, vídeo, pantalla), transmisiones en vivo y grabaciones dependen de esto.

### 13.1 Causa por sistema

| Sistema | Qué pasaba | Arreglo |
|---|---|---|
| macOS (WKWebView) | El `Info.plist` instalado no tenía `NSMicrophoneUsageDescription` ni `NSCameraUsageDescription`: WebKit no deja usar ni pedir el micro o la cámara en una app sin esos textos, y la web caía en su mensaje de «navegador». wry 0.57 sin manejador ya concedía todo en WebKit (`requestMediaCapturePermissionForOrigin` → `Grant`): solo faltaba el permiso del SISTEMA. La app va «linker-signed» ad-hoc, sin hardened runtime ni entitlements: no hacen falta (ver §11.14 si se firma de verdad). | Los dos textos en `native/src-tauri/Info.plist`; decisión por origen (§13.2). |
| Android (WebView) | El manifiesto que genera `tauri android init` no declara `RECORD_AUDIO` ni `CAMERA`: wry responde a `onPermissionRequest` pidiendo el permiso en tiempo de ejecución y Android lo niega AL INSTANTE (permiso no declarado), sin preguntar. | `build.rs` → `android_parche::aplicar_medios`: bloque `STARSEED-MEDIOS` tras `<manifest …>` con `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`, `CAMERA`, `BLUETOOTH_CONNECT` (auriculares, Android 12+), `BLUETOOTH` hasta Android 11 y `uses-feature` del micro y la cámara con `required="false"`. Las tres apps (OS, Nexus, Café), aunque `STARSEED_SIN_SERVICIO_ANDROID` apague el servicio; si no puede, falla en alto. |
| Windows (WebView2) | Funcionaba con el aviso propio de WebView2 por ORIGEN (cada puerto 4761x es otro origen) y un «Bloquear» se quedaba guardado sin forma de deshacerlo desde la app. | Orígenes propios: concedido en WebView2; manda Configuración › Privacidad del sistema. |
| Linux (WebKitGTK) | `enable-media-stream` y `enable-webrtc` vienen APAGADOS y wry no los enciende: `navigator.mediaDevices` ni existía; y sin manejador, `permission-request` se denegaba. | `permisos_medios::encender_medios_linux` los enciende en la ventana `main`; orígenes propios → `allow()`. Hace falta un WebKitGTK compilado con WebRTC para llamar. |

### 13.2 Qué decide la app (`native/src-tauri/src/permisos_medios.rs`)

- `tauri::Builder::on_permission_request` (tauri ≥ 2.12, fijado en `Cargo.toml`) para `Microphone`, `Camera` y
  `DisplayCapture`. Lo demás (ubicación, notificaciones…) responde `Default`: no cambia nada.
- wry no da el origen de la petición: se usa la ÚLTIMA página cargada en esa ventana (`on_page_load`). Nunca
  `webview.url()` dentro del manejador: en Android corre en el hilo de la interfaz y `url()` espera a ese hilo.
- Página propia → `Allow` (el motor lo concede; el SISTEMA pregunta: TCC en macOS, permiso en tiempo de ejecución en
  Android —wry lo pide igual con `Allow`—, Privacidad en Windows). Otra página → `Deny`. Aún sin página → `Default`
  (el motor pregunta él).
- Propias = `http://127.0.0.1:47610…47619` y `https://starseed-{os,nexus,cafe}.vercel.app`: las mismas de
  `capabilities/default.json` (la prueba `contrato-rust.test.ts` las compara). Ni `localhost`, ni `https://127.0.0.1`,
  ni usuario en la URL, ni otro puerto.

### 13.3 Pantalla compartida

- macOS: no hay clave de `Info.plist`; WKWebView trae `getDisplayMedia` en los macOS recientes y macOS pide «Grabación
  de pantalla» (o enseña su selector). **Sin ver en aparato real.**
- Windows: WebView2 enseña su propio selector. Linux: WebKitGTK ≥ 2.42 con el portal de escritorio; sin ver.
- Android: el WebView no tiene `getDisplayMedia`: la web lo dice («Android no deja compartir la pantalla desde una
  app web…») en vez de «no se eligió ninguna pantalla».
- `src/lib/llamadas/pantalla.ts`: `pedirPantalla()` guarda el error y `motivoSinPantalla()` lo explica (cancelado,
  sin «Grabación de pantalla» con «Abrir ajustes» en macOS, o no disponible).

### 13.4 Comandos y web

- `medios_estado` → `EstadoMediosNativo { version, plataforma, declarados, abrir_ajustes }`. Si la app no lo tiene
  (la ACL lo rechaza), es anterior a MIC1108A: «app sin permiso». `declarados` en Android solo es `true` si `build.rs`
  escribió el bloque (`--cfg starseed_medios_android`).
- `medios_abrir_ajustes(tipo)` («microfono» | «camara» | «pantalla»), solo direcciones fijas: macOS
  `x-apple.systempreferences:com.apple.preference.security?Privacy_{Microphone,Camera,ScreenCapture}`; Windows
  `ms-settings:privacy-{microphone,webcam}`; Android la ficha de la app (petición «ajustes» al Kotlin de
  `ArranqueStarSeed.kt`, solo en StarSeed OS, que lleva ese puente). Linux e iOS: no hay.
- Web: `src/lib/llamadas/permiso-medios.ts` (puro) clasifica: **app-sin-permiso** (la app instalada es anterior o
  no lo declaró: «instala la versión nueva»), **denegado** (dónde se activa en ESE sistema y «Abrir ajustes»),
  **sin-dispositivo**, **ocupado**, **cancelado** (pantalla), **no-soportado**. En el navegador, los textos de siempre.
  `src/lib/nativa/medios-nativos.ts` pregunta a la app una vez por página; `src/lib/llamadas/aviso-medios.ts` enseña el
  aviso con el botón. Lo usan la llamada directa, las llamadas y transmisiones de neuronas, `obtenerMedios` /
  `obtenerPantalla`, las acciones de llamada y la llamada de grupo por la malla.

### 13.5 Qué llega con qué

- **Solo con un build nativo nuevo:** `Info.plist`, manifiesto de Android, `on_permission_request`, MediaStream y
  WebRTC en Linux, `medios_estado` y `medios_abrir_ajustes`.
- **Con la web (publicación o capa):** los mensajes nuevos. En la app anterior dicen «instala la versión nueva»
  (no se puede arreglar desde la web: el permiso es del sistema).

### 13.6 Cómo se prueba

```bash
# Rust (en el crate real): decisión por origen, ajustes, estado, manifiesto de Android y Kotlin
cargo test --lib permisos_medios:: android_parche::
# Web: clasificación, aviso con «Abrir ajustes», puente, llamada directa y contrato Rust ↔ web (Info.plist incluido)
NODE_ENV=test npx vitest run src/lib/llamadas/__tests__/permiso-medios.test.ts src/lib/llamadas/__tests__/aviso-medios.test.ts \
  src/lib/nativa/__tests__/medios-nativos.test.ts src/lib/malla/__tests__/llamada-directa-permisos.test.ts \
  src/lib/nativa/__tests__/contrato-rust.test.ts
```

En aparatos reales (T16): macOS — la primera llamada enseña el aviso del micrófono con el texto de `Info.plist`; al
decir que no, el aviso de la web trae «Abrir ajustes» y abre Privacidad › Micrófono. Android — avisos de micrófono y
cámara; tras negarlos, «Abrir ajustes» abre la ficha de la app. Pantalla compartida en macOS, Windows y Linux.
iOS no está cubierto (necesita los mismos textos en un `Info.ios.plist`).
