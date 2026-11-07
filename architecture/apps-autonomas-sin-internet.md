# Apps autónomas sin internet: el servidor local dentro de la app (contrato · APP1107A · 2026-11-07)

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
| Android e iOS | Siguen con la web publicada (sin cambios). Plan exacto en §9 |
| Nexus y Café | Siguen con su web. Plan en §9.3 |
| Actualizar el servidor local por capas sin reinstalar | PENDIENTE (fase 2, §10) |

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
  · GET /__starseed/salud  → {servidor, firma, listo, red}      (lo lee Rust)
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
| Armado del paquete (CI) y Node fijado | `native/servidor-local/preparar.mjs`, `native/servidor-local/node.json` |
| Página de arranque | `native/arranque/index.html` (`build.frontendDist`) |
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
  `localStorage` de la web publicada no pasa solo (pendiente T4).

## 3. Seguridad

- El servidor **solo escucha en 127.0.0.1** (la puerta y Next). Nunca `0.0.0.0`: desde la red local no se ve.
- **Sin secretos**: el entorno del Node lleva solo `STARSEED_*`, `HOSTNAME`, `NODE_ENV` y la telemetría apagada
  (prueba `entorno_sin_secretos_y_solo_loopback`); se quitan `NODE_OPTIONS`, `NODE_PATH` y `PORT` heredados.
  `preparar.mjs` no copia ningún `.env` del standalone y falla si queda uno. Lo que necesita claves del
  servidor se reenvía a la web publicada cuando hay internet.
- **Firma por arranque**: Rust genera 128 bits al azar, se los pasa al Node y solo lleva la ventana al puerto si
  `/__starseed/salud` devuelve esa firma. Otro programa en ese puerto = «ajeno»: no se navega ahí nunca.
- **Capabilities**: los diez orígenes exactos (no `127.0.0.1:*`) reciben los mismos permisos que la web
  publicada. Límite honesto: otro usuario de la MISMA máquina que ocupe uno de esos puertos mientras el nuestro
  está caído podría servir una página a la ventana si esta recarga sola en ese hueco; Rust no navega ahí (firma),
  pero no puede impedir una recarga de la propia página. Ventana: el reinicio (≤ 5 s).
- **Node oficial verificado**: versión y SHA-256 fijados en `node.json` (copiados de `SHASUMS256.txt` de
  nodejs.org); el CI compara con ESOS valores, no con lo que baje en el momento.
- **Sin huérfanos**: el envoltorio sale cuando se cierra su entrada estándar (la app la tiene abierta mientras
  vive). Probado matando la app de golpe: el Node salió solo.

## 4. Arranque, reinicios, apagado y respaldo

1. `setup` → `servidor_local::iniciar` (solo escritorio y solo `app.starseed.os`; Nexus y Café no).
2. Comprueba el paquete (`starseed-node`, `servidor/server.js`, `servidor/.next/BUILD_ID`,
   `servidor/starseed-arranque.cjs`). Si falta algo → **respaldo**.
3. Elige puerto, lanza el Node, sondea la salud cada 250 ms (tope 60 s). Lista → navega (si la ventana no está
   ya en ese origen) y la página de arranque dice «Listo».
4. Vigila cada 500 ms. Si el Node muere: pausa 0,5 s / 2 s / 5 s y relanza en el mismo puerto **sin recargar la
   página**. Más de 3 caídas en 5 min → respaldo. Probado: `kill -9` al Node → nueva firma, mismo puerto, sin
   recarga.
5. `RunEvent::Exit` → cierra la tubería, espera 1,5 s y mata si hace falta.
6. **Respaldo** = lo de antes de esta versión: vuelve a la página de arranque, dice por qué y abre la web
   publicada; sin internet, lo dice y reintenta cada 15 s.

`invoke('servidor_local_estado')` → `{fase, puerto, origen, motivo, reinicios, version_paquete, commit_paquete,
registro}` para pintarlo en la app (pendiente T6).

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
- Android e iOS: `tauri.android.conf.json` / `tauri.ios.conf.json` devuelven la ventana a la web publicada
  (la página de arranque es solo de escritorio). Nexus y Café pisan después con su `-c`.

## 6. Tamaños

Medido el 2026-11-07 sobre el build de main de la Mac (`.next` de producción) y los Node 22.23.4 oficiales:

| Pieza | Sin comprimir | gzip | xz |
|---|---:|---:|---:|
| `.next/server` + `.next/static` + `public` (2.749 archivos) | ≈ 462 MB | 45,6 MB | 24,5 MB |
| `node_modules` trazado del standalone (≈ 1.900 archivos, sin sharp) | ≈ 40 MB | ≈ 8 MB | ≈ 6 MB |
| Node macOS universal (arm64 107 + x64 110) | 217 MB | ≈ 71 MB | ≈ 46 MB |
| Node Linux x64 | 119 MB | ≈ 38 MB | ≈ 30 MB |
| Node Windows x64 (`node.exe`) | ≈ 85 MB | ≈ 30 MB | ≈ 26 MB |

| Instalador | Hoy (v0.4.3) | Estimado con servidor local | Instalado en disco |
|---|---:|---:|---:|
| macOS `.dmg` (universal) y `.app.tar.gz` del updater | 7 MB | ≈ 125–135 MB | ≈ 720 MB |
| Windows `-setup.exe` (NSIS, LZMA) | 2 MB | ≈ 55–65 MB | ≈ 590 MB |
| Windows `.msi` | 3 MB | ≈ 85–95 MB | ≈ 590 MB |
| Linux `.deb` / `.rpm` | 4 MB | ≈ 90–100 MB | ≈ 620 MB |
| Linux `.AppImage` | 79 MB | ≈ 165–175 MB | — |
| Android `.apk` | 32 MB | sin cambio | — |

Son estimaciones (compresión medida por pieza); las reales las escribe el CI en el resumen de cada job. Formas de
bajar: Node solo arm64 en macOS (−36 MB comprimido, Intel caería a la web), quitar del build nativo las consolas
que solo viven en la Mac (`/genesis`, `/metagenesis`, `/api/mando/**`), y la fase 2 (§10), que evita bajar el
instalador entero en cada actualización.

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
| Genesis / MetaGenesis / PoliGenesis (`/genesis`, `/metagenesis`, `/poligenesis`) | **No aplica** | Consolas de la Mac y del A1 (`/api/mando/*` es 404 fuera de la Mac) |
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
# Armado en seco (standalone de mentira + Node de esta máquina; en macOS firma ad-hoc de verdad) y arranque del paquete
node --test native/servidor-local/__tests__/preparar.test.mjs
# Web
npx vitest run src/lib/nativa/__tests__/sin-conexion.test.ts
```

Probado además en Linux con la app real (`tauri build --debug --bundles deb`): el `.deb` lleva
`/usr/bin/starseed-node` y `/usr/lib/StarSeed OS/servidor/.next/…`; la app (Xvfb) lanzó el Node en
`127.0.0.1:47610`, la salud dio `listo` con su firma, WebKitGTK pidió `GET /` al servidor local, un `kill -9` al
Node lo relanzó en el mismo puerto sin recargar la página y, al matar la app, el Node salió solo.

## 9. Android, iOS, Nexus y Café

### 9.1 Android — plan exacto

Hoy: la APK abre la web publicada (`tauri.android.conf.json`); sin internet solo lo que el service worker ya guardó.

| Opción | Qué es | Tamaño | Licencia | Veredicto |
|---|---|---|---|---|
| **A · nodejs-mobile** (fork `digidem/nodejs-mobile`, v24.18.0-0 del 2026-08-11, Node 24) | `libnode.so` para arm64-v8a, armeabi-v7a y x86_64 (SDK ≥ 24) que corre el MISMO standalone y el MISMO envoltorio | zip de las 3 ABI 73,4 MB (lite 54,4 MB): ≈ +20–25 MB por ABI en el APK, + ≈ 50 MB del servidor comprimido | la de Node (MIT y terceros); GitHub no la detecta en el fork: confirmarla antes de distribuir | **El camino completo**: un solo código de servidor para escritorio y Android |
| B · Export estático parcial | `output: 'export'` de las secciones que no usan API ni middleware | pequeño | — | No: el OS usa middleware, rutas dinámicas y 48 grupos de `/api`; sería otra app |
| C · Precarga del service worker en la APK | La app pide al SW que guarde todas las páginas principales y `/_next/static` («Descargar para usar sin internet») | ≈ 50 MB en caché, APK igual | propia | **Paso rápido** mientras llega A: abre todo sin red, sin servidor (lo de `/api` falla igual que en A sin claves) |

Pasos de A (cada uno una tarea):
1. CI Android: descargar `nodejs-mobile-android-24.18.0-0.zip` con SHA fijado (como `node.json`), poner
   `libnode.so` en `jniLibs/<abi>` del proyecto que genera `cargo tauri android init` (ganchos de `build.rs` /
   `android_parche.rs`, como el servicio de antenas) y el servidor en `assets/servidor` (comprimido).
2. Kotlin (`PuenteNativo.kt`): en el primer arranque de cada versión, extraer `assets/servidor` a
   `filesDir/servidor/<buildId>` (≈ 500 MB; con barra de progreso en la página de arranque); arrancar Node en un
   hilo con el shim JNI de los ejemplos de nodejs-mobile (`startNodeWithArguments`), mismo entorno
   (`STARSEED_PUERTO`, `STARSEED_FIRMA`…) y el envoltorio sin cambios.
3. `network_security_config` que permita texto plano SOLO a `127.0.0.1`.
4. Rust en móvil: el mismo `servidor_local_logica.rs` (la salud y la firma ya son puras) con un lanzador Kotlin en
   vez de `std::process`; la ventana de Android pasa a `index.html` como en escritorio.
5. Medir RAM (Next ≈ 200–300 MB) y arranque en la tablet; si no cabe, C como modo por defecto en aparatos con poca
   memoria.

### 9.2 iOS
Sin app nativa publicada (ver `apps-nativas-segundo-plano.md`). nodejs-mobile iOS corre V8 sin JIT (lento); queda
para cuando haya cuenta de desarrollador. Mientras, la PWA.

### 9.3 Nexus y Café
Son otro repositorio (`alexbordongarrigos/Starseed-Cafe`) y portales casi estáticos: no necesitan Node. Plan: el
job de Nexus/Café hace checkout de su repo y usa sus archivos como `frontendDist` (embebidos en el binario), con la
web publicada solo para lo que pida red. Pendiente T7.

## 10. Fase siguiente: actualizar el servidor local por capas, sin reinstalar

Petición de Alex del 10-10 («según el cambio se reinician los servidores dentro de la app sin reinstalarla»).
Diseño (PENDIENTE T1):
- Capas: **binario** (Rust, updater de siempre), **node** (cambia poco), **servidor** (`.next` + `public`, cambia
  en cada publicación). El CI publica `servidor-<buildId>.tar.xz` (≈ 25–30 MB) + `.sig` (misma clave minisign del
  updater) + `latest-servidor.json` en el Release.
- La app lo descarga a `<app_data>/servidor/<buildId>/`, verifica firma y SHA, y `rutas_paquete` elige la capa
  válida más nueva compatible con su Node (si no, la del instalador). Reinicio del Node en el mismo puerto: la
  ventana no cambia de origen, solo recarga.
- Rollback: si la capa nueva no da «listo» en 60 s, se marca mala y se vuelve a la anterior.
- Siguiente paso de eso: diferencias por archivo (los chunks con hash no cambian entre builds).

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
5. **Tamaño del updater**: cada actualización baja el instalador entero (≈ 130 MB en macOS) hasta la fase 2.
6. **Versión del servidor ≠ versión de la web**: las páginas son las del instalador y `/api` la de la web
   publicada; si una API cambia de forma incompatible, se nota hasta actualizar la app (la fase 2 lo acorta).
7. **Origen nuevo**: hay que iniciar sesión una vez con internet en la app nueva.

## 12. Pendientes (tareas concretas)

| Id | Tarea |
|---|---|
| T1 | Capas del servidor local con firma y rollback (§10) |
| T2 | Android opción C (precarga del SW) y luego A (nodejs-mobile, §9.1) |
| T3 | Medir en el CI los tamaños reales y corregir §6 |
| T4 | Migrar al origen local lo que solo vivía en el `localStorage` de la web publicada (importación guiada al primer arranque) |
| T5 | Pasar los 3 flujos de Genkit (server actions) a rutas `/api` para que viajen a la web con internet |
| T6 | Enseñar `servidor_local_estado` en Ajustes → Neurona y en las señales del medio («app nativa · servidor local») |
| T7 | Nexus y Café con sus archivos dentro (§9.3) |
| T8 | Quitar del build nativo lo que solo vive en la Mac (`/genesis`, `/metagenesis`, `/api/mando/**`) para bajar ≈ 100 MB |
