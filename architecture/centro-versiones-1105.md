# Centro de Versiones · lanzar cada formato desde MetaGenesis (contrato · 2026-11-05)

> Pedido de Alex del 2026-11-05: un panel en el pulso de MetaGenesis con las versiones de cada medio y
> formato (sitio web oficial y cada sistema operativo), enlaces y estado actual, un botón por medio que
> genere sus archivos oficiales con el protocolo de ese sistema; cada versión con su fecha e información
> completa en la Librería; en cada medio instalado, un aviso de actualización (ventana emergente,
> notificaciones y Librería) con actualización opcional, automática y sin perder datos; y, cuando termine
> la lista de tareas y esté publicado y verificado, lanzar la actualización en todos los sistemas desde
> MetaGenesis, con cada paso visible en tiempo real y los directores resolviendo solos lo que falle.
> Se lee ANTES de tocar `native-build.yml`, el updater, `os-release.ts`, los avisos de versión o el panel.

## 0 · Lo que ya existía (no se duplica)

- `.github/workflows/native-build.yml`: OS, Nexus y Café para macOS (.dmg universal + `.app.tar.gz`),
  Windows (.msi + `-setup.exe`), Linux (.AppImage, .deb, .rpm), Android (.apk firmado con el keystore de
  los secretos) e iOS (.ipa sin firma, *best-effort*: hoy sale vacío). Release en borrador por etiqueta
  `v*`; `latest.json`, `latest-nexus.json` y `latest-cafe.json` firmados con la clave del updater.
  Último lanzamiento: v0.3.0 (2026-10-09), 18 min de CI.
- `native/src-tauri/src/lib.rs`: el updater de escritorio (`check` → `download_and_install` → `restart`).
- `src/lib/version/os-release.ts`: fuente única de la versión (`OS_VERSION`, `NATIVE_VERSION`, notas).
- `src/lib/actualizaciones/*` (capas, canaria, aplicadores), `src/components/pwa/update-banner.tsx`,
  `src/lib/notifications/update-notifications.ts` (aviso `update-app`).
- `scripts/puente/autopublicar.py`: publica la web con puertas (pruebas, CI, Vercel, humo). Es la puerta
  «publicado y verificado» de este contrato.

## 1 · Medios y formatos (lo que enseña el panel)

| Medio | Formatos | Cómo se genera | Cómo se confirma |
|---|---|---|---|
| `web` · Sitio web oficial | starseed-os.vercel.app (+ Nexus y Café) | autopublicación | `/version.json` sirve el sha |
| `pwa` · App web instalable | manifiesto + service worker | con la web | SW nuevo activo |
| `macos` | `.dmg` universal, `.app.tar.gz` + `.sig` | job `<sistema> · macos-latest` | archivos con tamaño mínimo |
| `windows` | `.msi`, `-setup.exe` (+ `.sig`) | job `<sistema> · windows-latest` | ídem |
| `linux` | `.AppImage`, `.deb`, `.rpm` (+ `.sig`) | job `<sistema> · ubuntu-24.04` (glibc ≥ 2.39) | ídem |
| `android` | `.apk` firmado | job `<sistema> · android` | ídem |
| `ios` | `.ipa` | job iOS (sin firma) | **no disponible** hasta que haya cuenta de Apple; en iOS se usa la PWA |
| `canales` | `latest.json`, `latest-nexus.json`, `latest-cafe.json` | job de canales | JSON válido, versión y firma por plataforma, URL a un archivo existente |
| `libreria` | ficha de cada versión | `/api/os/versiones` | la versión nueva aparece |

Estados por medio: `al-dia` · `generando` · `verificando` · `atascado` · `no-disponible` (con el porqué).

## 2 · El lanzamiento, paso a paso (máquina de estados del director)

Director: `scripts/puente/director_lanzamientos.py` (lógica PURA en `lanzamientos_logica.py`). Corre en
cada pasada de la autopublicación (cada 5 min, proceso nuevo) y solo en la neurona líder de dirección.
Estado en `~/.starseed/produccion/lanzamientos-estado.json`; peticiones del panel en
`~/.starseed/produccion/lanzamientos-peticion.json`; ajustes en `config/lanzamientos.json`.

1. `esperando-lista` — la lista de tareas de la ola de versiones (`config/lanzamientos.json → colas`)
   está terminada: cada tarea integrada EN MAIN (su id en `git log`) o descartada.
2. `esperando-publicacion` — `origin/main` = `HEAD` y la autopublicación está `al-dia`/`publicado` con
   ese sha (pruebas, CI, Vercel y humo en verde).
3. `preparando` — sube la versión (menor por defecto) en `native/src-tauri/tauri.conf.json`,
   `native/src-tauri/Cargo.toml` y `src/lib/version/os-release.ts` (versión, fecha, notas a partir de las
   tareas integradas), corre `src/lib/__tests__/os-release.test.ts` y hace el commit «Lanzamiento vX.Y.Z».
   Vuelve a 2 hasta que ese commit esté publicado.
4. `etiquetando` — `git tag vX.Y.Z <sha>` y `git push origin vX.Y.Z` (solo la etiqueta; nunca force).
5. `compilando` — sigue el run de `native-build.yml` job a job (`gh run view --json jobs`): cada job es un
   paso visible con su medio, estado y enlace.
6. `verificando-archivos` — cada archivo esperado existe en la release con su tamaño mínimo y su `.sig`;
   los canales son JSON válido con versión, firma y URL existentes para darwin-aarch64, darwin-x86_64,
   windows-x86_64 y linux-x86_64.
7. `publicando` — `gh release edit vX.Y.Z --draft=false --latest`.
8. `verificando-medios` — cada URL de `releases/latest/download/…` responde 200 y los canales sirven la
   versión nueva. Al terminar: `lanzado`, aviso en el Chat Director con la versión y los enlaces.

`atascado` en cualquier paso lleva el motivo y lo que el director hizo. Topes: 1 lanzamiento nativo al día,
2 reintentos por job, CI ≤ 60 min, nunca una versión mayor (eso sigue siendo de Alex).

## 3 · Autorreparación (los directores)

`clasificar_fallo(log)` decide sobre el log del job que falló:

- `reintentar` — red, tiempo, límite de la API, runner caído → `gh run rerun <id> --failed` (≤ 2).
- `sin-firma` — falta un secreto de firma → el medio sigue SIN FIRMAR y se dice (no bloquea).
- `codigo` — error de compilación/prueba → tarea al enjambre con el log, el job y los archivos; el
  lanzamiento espera a que se integre y vuelve a 3 con un parche (`X.Y.Z+1`).
- `credencial` — keystore, clave del updater o permisos de GitHub → aviso a Alex (nunca se toca una
  credencial).

## 4 · El panel (pulso de MetaGenesis · grupo «Lo que sale»)

Pastilla «Versiones» (`clave: "versiones"`): versión publicada, versión en curso y tono (normal · aviso ·
peligro). Al abrirla, `PanelVersiones`:

- Una fila por medio: icono, formatos con su enlace de descarga, versión servida, estado y **botón**
  «Generar/Actualizar» (petición `regenerar` de ese medio: `workflow_dispatch` con `plataformas` y
  `etiqueta` del lanzamiento vigente; para `web`, «Publicar ahora» de la autopublicación).
- El lanzamiento vigente: cada paso de §2 y cada job de §2.5 en tiempo real (sondeo cada 5 s con la
  pestaña visible), con su estado, duración, enlace al run y lo que hizo el director.
- Botones: «Lanzar versión» (petición `lanzar`), «Pausar/Reanudar», «Reintentar paso» y el
  interruptor «Lanzar sola al terminar cada lista».
- API local `GET/POST /api/mando/lanzamientos` (mismo guardián que las demás de `/api/mando`).

## 5 · Librería y avisos en cada medio instalado

- `GET /api/os/versiones` (pública, caché 10 min, 1 consulta a GitHub): las versiones con fecha, notas,
  archivos por sistema con tamaño y enlace, requisitos y permisos de `config/permisos-por-so.json`.
- La ficha «StarSeed OS» de la Librería enseña la versión instalada, la nueva y el historial.
- `comprobarActualizacion(medio)` (puro) compara lo instalado con lo publicado en ese medio:
  web/PWA (sha), escritorio (versión nativa vía Tauri), Android (versión nativa), iOS (PWA).
- Si hay versión nueva: ventana emergente (una vez por versión), aviso `update-app` en Notificaciones y
  botón en la Librería. «Actualizar» es opcional y automático: escritorio → updater de Tauri
  (los datos de la app no se tocan); Android → descarga el .apk de la misma firma y abre el instalador
  (Android conserva los datos al actualizar con la misma firma); web/PWA → service worker; iOS → PWA.

## 6 · Permisos (la verdad)

Ninguna app puede darse a sí misma todos los permisos: cada sistema los pide a la persona. Lo que sí se
hace: declarar TODO lo que el OS usa en cada sistema (`config/permisos-por-so.json` como fuente única:
Android `AndroidManifest`, macOS `Info.plist` con sus textos de uso, capabilities de Tauri) y pedirlos en
la bienvenida o al primer uso, con su estado visible. Sin firma de Apple/Windows, macOS pide «clic
derecho → Abrir» la primera vez y Windows enseña SmartScreen; el updater funciona igual (firma propia).

## 7 · Lo que sigue siendo de Alex

- Cuenta de Apple Developer (iOS y notarización de macOS) y certificado de Windows: son pagos.
- Versiones mayores. Credenciales y secretos.
- Alex autorizó el 2026-11-05 que el director etiquete y publique versiones menores y parches nativos
  cuando la lista esté terminada, publicada y verificada (este contrato, §2).

## 8 · La versión instalada de verdad (VER1107B · 2026-11-07)

### 8.1 El fallo y su causa (comprobada)

Síntoma: en las apps de escritorio y Android salía «Hay una versión nueva» y, al pulsar «Actualizar
ahora», el updater contestaba «Ya estás en la última versión.» (texto de `check_update` en `lib.rs`).

Causa: `leerInstalada()` (`src/lib/actualizaciones/version-por-medio.ts`) hacía
`const { app } = await import("@tauri-apps/api/app")`. Eso no puede funcionar nunca: `@tauri-apps/api` no
es dependencia de la web (ni en `package.json` ni en `node_modules`) y ese módulo tampoco exporta `app`.
Siempre lanzaba, se caía a `/version.json` → `build` (un id de build de la web como `"mvq6sg7z-kt91hk"`),
`compararVersiones` lo leía como `0` (las partes no numéricas cuentan 0) y TODA versión publicada salía
«más nueva». El updater nativo compara el binario real con `latest.json` (0.5.0) y decía, con razón, «al día».

### 8.2 Reglas para leer y comparar la versión (fuente: `src/lib/nativa/info-neurona.ts`)

1. La versión de la app nativa se lee del objeto GLOBAL de Tauri (`withGlobalTauri: true`), en este orden:
   `invoke("info_neurona")` (apps con VER1107B) → `__TAURI__.app.getVersion()` (todas: `core:app:default`)
   → `invoke("plugin:app|version")`. Solo vale una versión numérica (`esVersionSemver`: `0.5.0`, `v1.2.3`,
   `0.6.0-beta.1`, `1.1`). **Nunca** el build de la web: en la app nativa no se pide `/version.json`.
2. Si no se sabe la versión instalada, no se abre nada (queda «desconocida» en la última comprobación).
   `debeAvisar`, `hayActualizacion` y `decidirAviso` devuelven «no» con cualquier lado que no sea semver.
3. Escritorio: si la lista publicada (`/api/os/versiones`) dice que hay algo más nuevo, ANTES de abrir se
   pregunta al canal del updater de esa app con `buscar_actualizacion` (solo `check()`: no descarga, no
   instala, no emite eventos). Si el canal no ofrece nada más nuevo → «StarSeed OS X está publicada, pero
   aún se está preparando para este sistema»: **sin ventana y sin aviso en Notificaciones**; se guarda en la
   última comprobación (`starseed.actualizacion.ultima-comprobacion.v1`) y lo enseña Ajustes › Esta neurona.
   Si el updater falla (red), tampoco se abre. La ventana enseña la versión que ofrece el canal.
4. Android: no hay updater; la ventana solo se abre si la versión publicada trae el `.apk` de la misma
   firma (`decidirActualizacionAndroid`); sin él, también «se está preparando».
5. Si al pulsar «Actualizar ahora» el updater dice que no hay nada, esa versión queda VISTA y se dice
   «Ya tienes la X.Y.Z.» (la instalada; si lo publicado es más nuevo, «la N aún se está preparando…»).
   El botón pasa a «Entendido».
6. Decisión pura en `src/lib/actualizaciones/decision-aviso.ts`; última comprobación en
   `src/lib/actualizaciones/ultima-comprobacion.ts`.

### 8.3 Comandos nativos nuevos (`native/src-tauri/src/neurona_info.rs` + `lib.rs`)

| Comando | Devuelve | Dónde |
|---|---|---|
| `info_neurona` | `{app_version, app_nombre, identificador, sistema (os/cafe/nexus), plataforma, so_version?, arquitectura, equipo?, modelo?, tauri_version, escritorio, actualizador}` | todas las plataformas (`tauri-plugin-os`, que ya era dependencia; Android: `getprop ro.product.manufacturer/model`) |
| `buscar_actualizacion` | `{actual, disponible?, notas?, fecha?}` (`fecha` = `pub_date` del canal) | escritorio; en móvil devuelve error |

Permisos: los dos están en `COMANDOS_APP` de `build.rs` y como `allow-info-neurona` y
`allow-buscar-actualizacion` en `capabilities/default.json`, cuyo `remote` incluye la web publicada y los
diez orígenes del servidor local `http://127.0.0.1:47610…47619` (desde tauri 2.11.1 un comando propio no
responde a un origen remoto sin su `allow-<comando>`; ver APP1107B). La guardia
`src/lib/nativa/__tests__/contrato-rust.test.ts` comprueba que lib.rs, build.rs y las capabilities casan.
Ninguna dependencia nueva.

### 8.4 Las apps ya instaladas (qué les llega y cuándo)

| App instalada | Cómo carga sus páginas | Qué ve de este arreglo |
|---|---|---|
| Escritorio 0.1–0.4.x | la ventana ES la web publicada (`https://starseed-os.vercel.app`) | llega al publicar la web. Versión por `getVersion` (core:app se concede al origen remoto). No tiene `buscar_actualizacion` → «sin-comando» → decide con la lista, ya con la versión bien leída: con la 0.5.0 publicada, la ventana sale con razón y el updater la instala. Riesgo: si esa 0.4.x se compiló con tauri ≥ 2.11.1 sin manifiesto de la app, `check_update` desde la web responde «not allowed by ACL»; la ventana lo dice y queda «Ver en la Librería». |
| Escritorio 0.5.0 | página de arranque del binario → **servidor local** `127.0.0.1:47610–47619` con el build de Next DEL INSTALADOR (APP1107A); respaldo: la web publicada | mientras sirva sus páginas locales **no le llega** el arreglo: la 0.5.0 no tiene las capas del servidor (CAP1107A llegó después de la etiqueta) y su web empaquetada trae el fallo. Lo corrige instalar la versión nativa siguiente: su `check_update` sí tiene permiso, así que cuando `latest.json` ofrezca la 0.5.1 «Actualizar ahora» la instala de verdad. Si cayó al respaldo (web publicada), el arreglo le llega como a la 0.4.x. |
| Escritorio ≥ 0.5.1 (con este cambio) | servidor local; lo nuevo de la web, por capas (CAP1107A) | todo: `info_neurona` + `buscar_actualizacion`. |
| Android 0.4.x / 0.5.0 | la web publicada (`tauri.android.conf.json`) | llega al publicar la web: `getVersion` → p. ej. 0.5.0; la ventana solo con una versión más nueva que traiga su `.apk`. |
| Nexus y Café (todas) | su propia web (`starseed-nexus` / `starseed-cafe.vercel.app`) | esta ventana no vive en su web. Su updater mira SU canal: `tauri.nexus.conf.json` → `latest-nexus.json`, `tauri.cafe.conf.json` → `latest-cafe.json` (la fusión de configuración reemplaza el array `endpoints`), generados por el job `canales-updater` de `native-build.yml`. Revisado: sin cruces. |
| iOS | PWA | nada cambia (no hay ventana). |

Lo que necesita un aparato real: ver en una Mac con la 0.5.0 que el respaldo/servidor local se comporta
como dice la tabla; en una app con este cambio, `info_neurona` en macOS/Windows/Linux/Android (nombre de
equipo, versión del SO, modelo en Android) y `buscar_actualizacion` contra el `latest.json` real.
