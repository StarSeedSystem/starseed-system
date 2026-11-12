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

### 8.5 Ajustes › Neuronas › «Esta neurona» (VER1107B)

`src/components/settings/neurons/esta-neurona.tsx`, arriba en Ajustes › Neuronas (`neurons-panel.tsx`; la
pastilla del servidor local y sus capas, `EstadoServidorLocal`, vive ahora dentro de esta tarjeta). Enseña,
cada dato SOLO si se conoce: versión de la app nativa (y de dónde se leyó), medio y app (OS/Café/Nexus),
build + versión + sha de la web (`/version.json`), sistema operativo y versión, arquitectura, equipo o
modelo, Tauri, servidor local y capas, y la última comprobación («hace 5 min · …»).

- «Buscar actualizaciones» (apps nativas): `comprobarActualizacion({ forzar: true })`
  (`src/lib/actualizaciones/comprobar.ts`, el MISMO camino que la ventana): solo busca y dice el resultado
  («lista para instalar», «se está preparando», «al día»…). No abre la ventana.
- «Actualizar a la X» (escritorio, solo si el canal la ofrece): `actualizarEscritorio` con su progreso y
  luego «Reiniciar para aplicar». Si el updater dice que no hay nada: «Ya tienes la X.Y.Z».
- Android: «Descargar la X (.apk)», el de la misma firma (`decidirActualizacionAndroid`).
- Web y PWA: sin botones; la versión nueva llega sola (service worker).
- En cada neurona de la lista y en el detalle de Mensajes › Neuronas: versión, medio y aparato por la
  presencia, «Nueva versión disponible» y «Pedir actualización» (sincronizacion-neuronas.md §9).

## 9 · Canal de pruebas con actualización dentro de la app (ACT1108A · 2026-11-08)

Petición de Alex: «esas actualizaciones ya deberían pasar directamente desde dentro de la app instalada,
con versiones nuevas, para que se actualice sola». Hasta hoy las pruebas eran borradores de GitHub
(`native-build.yml` por `workflow_dispatch`): un borrador pide sesión de GitHub, el updater no lo ve, y
todas decían **0.5.0** (la misma que la publicada), así que «Actualizar» no encontraba nada.

### 9.1 Dos canales

| Canal | Quién lo mira | Escritorio (updater de Tauri) | Android (APK) |
|---|---|---|---|
| **oficial** (por defecto) | toda app cuya versión NO lleva «-prueba.» | `releases/latest/download/latest.json` (de siempre; Nexus y Café, su `latest-nexus.json` / `latest-cafe.json`) | el `.apk` del Release, como antes (no hay manifiesto oficial de APK: si algún día se publica `latest-android.json` en el Release oficial, la app lo usa sola) |
| **pruebas** | toda app cuya versión lleva «-prueba.» (`0.5.1-prueba.23`) | `releases/download/canal-pruebas/latest-prueba.json` **y** el oficial; gana el mayor por semver | `releases/download/canal-pruebas/latest-prueba-android.json` **y** el oficial; gana el versionCode mayor |

- `canal-pruebas` es UNA prerelease fija: publicada (sin sesión de GitHub), **nunca «Latest»**
  (`--latest=false`; además las prereleases no cuentan para `releases/latest`), con la etiqueta movida al
  commit de cada prueba (no es una etiqueta `v*`: no dispara nada). Cada prueba reemplaza sus archivos.
- El canal oficial (`latest.json`, las etiquetas `v*`, los borradores) **no cambia**. Única diferencia:
  el versionCode de los APK oficiales (§9.2).
- Solo **StarSeed OS**, escritorio y Android. Nexus, Café e iOS no se construyen en el canal de pruebas.
- Quién decide el canal: la propia app, por su versión. Rust: `canal_actualizacion_logica.rs`
  (`endpoints_escritorio`, `manifiestos_android`); web: `src/lib/actualizaciones/canal-pruebas.ts`
  (`elegirPublicada`). Una app de pruebas siempre mira también el oficial: cuando salga la 0.5.1 oficial
  la instala encima (0.5.1-prueba.N < 0.5.1) y vuelve sola al canal oficial.

### 9.2 Versiones y versionCode

- Versión de una prueba: **`<oficial + 1 parche>-prueba.<n.º de ejecución>`** (con `tauri.conf.json` en
  0.5.0 → `0.5.1-prueba.23`). Semver (las reglas de `tauri-plugin-updater`, y ahora también de
  `compararVersiones` en la web): `0.5.0 < 0.5.1-prueba.9 < 0.5.1-prueba.23 < 0.5.1`.
- Se sella en el CI (no en el repo) con `native/scripts/canal-pruebas.mjs sellar`: `tauri.conf.json`
  (`version`, `bundle.android.versionCode`, `bundle.windows.wix.version` = `0.5.1.<n>` porque el MSI solo
  admite números, y los endpoints del updater = [pruebas, oficial]) y `Cargo.toml` (`version`).
- versionCode de Android (Android solo instala ENCIMA un versionCode mayor o igual; uno menor obliga a
  desinstalar = perder datos). Con c(v) = mayor·10⁶ + menor·10³ + parche (lo que calculaba Tauri):
  - **oficial = c(v) · 1000** (0.5.1 → 5 001 000). Cambio respecto a hoy (antes c(v): 0.5.0 → 5000); es
    lo que permite que una oficial se instale encima de una de pruebas. Va en los dos canales.
  - **pruebas ∈ [(c(base) − 1)·1000 + 1, c(base)·1000 − 1]**, siempre mayor que la prueba anterior (el
    plan lee el `versionCode` del `latest-prueba-android.json` vigente): 0.5.1-prueba.* → 5 000 001…5 000 999.
  - Orden: oficial 0.5.0 (5000 hoy) < todas las pruebas de 0.5.1 < oficial 0.5.1 (5 001 000). Con 999
    pruebas sobre la misma base el plan falla en alto: toca publicar la oficial (o subir la base).

### 9.3 Qué sube cada prueba (prerelease `canal-pruebas`)

| Archivo | Lo escribe | Contenido |
|---|---|---|
| instaladores de escritorio de StarSeed OS (`.dmg`, `.app.tar.gz`+`.sig`, `-setup.exe`, `.msi`, `.AppImage`, `.deb`, `.rpm`, sus `.sig`) | tauri-action (`build-desktop`) | firmados con la clave del updater de siempre (`TAURI_SIGNING_PRIVATE_KEY`) |
| `latest-prueba.json` | job `canal-pruebas-publicar` | el `latest.json` de tauri-action (firmas incluidas) con las notas de la prueba; sin firma no se publica (sale en rojo) |
| `StarSeed-os-<versión>.apk` | `build-android` | firmado con el MISMO keystore que el oficial (`ANDROID_KEYSTORE_*`); la huella SHA-256 del certificado sale en el resumen del job |
| `latest-prueba-android.json` | `build-android` | `{ version, versionCode, apk, sha256, bytes, notas, pub_date, canal }` (se sube DESPUÉS del APK) |

Al final, `canal-pruebas-publicar` borra todo lo que ya no apunta ningún manifiesto vigente: si una
plataforma falla en una prueba, su manifiesto sigue en la prueba anterior y sus archivos se quedan.
Dos pruebas a la vez van en fila (`concurrency: native-canal-pruebas`).

**Una plataforma colgada o caída no retiene a las demás ni deja el manifiesto mentiroso (CI1111M · run 43033153388).**
- Tiempos: el paso de dependencias de Linux (apt) tiene tope de 14 min, 3 intentos con tope propio y
  `Acquire::Retries/Timeout`; `build-desktop` y `build-android` tienen `timeout-minutes` (50 / 60) y
  `canal-pruebas-publicar` 15. Una plataforma que se cuelga acaba en rojo y el publicador corre en cuanto
  las demás terminan (`!cancelled()`): `latest-prueba.json` sale SIN ella y el resumen dice cuál falta.
- Nombres: el paquete del updater de macOS se llamaba `StarSeed.OS_universal.app.tar.gz` en TODAS las versiones y
  cada prueba pisaba el de la anterior mientras el manifiesto aún apuntaba a él con la firma vieja. En pruebas,
  `assetNamePattern: [name]_[version]_[arch][ext]` le pone la versión (`StarSeed.OS_0.5.1-prueba.37_universal.app.tar.gz`,
  y su `.sig`). Windows (`…_<v>_x64-setup.exe`), Linux (`…_<v>_amd64.AppImage`) y el APK ya la llevaban. El
  manifiesto vigente apunta a archivos que ninguna prueba posterior toca; `sobrantes` borra los de la
  anterior solo DESPUÉS de escribir el nuevo manifiesto.
- Además `publicar` solo incluye una plataforma si el archivo de su URL lleva la versión de esta prueba, existe
  en la prerelease con su `.sig` y la firma del manifiesto es la de ese `.sig`; si no, la deja fuera y lo dice.
- Las apps ya instaladas (prueba.35/36/37) leen siempre la misma URL fija de `latest-prueba.json`; el nombre del
  archivo al que apunta es indiferente para ellas.
- Canal oficial: sin esas ventanas (cada etiqueta `v*` tiene su propio Release en borrador con su `latest.json`
  y sus archivos; nada se publica hasta que Alex lo publica). Sí comparte el job: los topes y el apt acotado le valen.

### 9.4 Cómo se lanza

```
gh workflow run native-build.yml -R StarSeedSystem/starseed-system --ref main \
  -f canal=pruebas -f systems=os -f plataformas=escritorio,android -f servidor_local_android=true
```

(`etiqueta` no hace falta: el canal de pruebas siempre usa `canal-pruebas`. `systems` no cambia nada en
este flujo: la matriz del canal de pruebas ya es solo `os`.)

### 9.5 Dentro de la app

**Escritorio** (`canal_actualizacion.rs::buscar`, usado por la vigilancia de 6 h, `check_update` y
`buscar_actualizacion`): una app de pruebas hace un `check()` por canal con `updater_builder().endpoints(…)`
y se queda con la versión mayor (el updater con varios endpoints se queda con el PRIMERO que responde).
Un canal sin manifiesto (404) no tumba al otro. La vigilancia instala sola, sin preguntar; si la persona
no mira la ventana, reinicia; si mira, deja «lista» y ahora además una **notificación del sistema
«Lista: reinicia…»**. La ventana y «Esta neurona» siguen igual.

**Android** (`canal_actualizacion.rs` + `android/ActualizadorApk.kt`, inyectado por `build.rs` con
`android_actualizador.rs`, solo StarSeed OS, aunque el servicio de antenas esté apagado):

1. `apk_actualizar { instalar }` escribe `filesDir/starseed/actualizacion/peticion.json` con los
   manifiestos de su canal. Kotlin (FileObserver) lo recoge en un hilo propio.
2. Kotlin lee los manifiestos (solo `https://github.com/StarSeedSystem/starseed-system/releases/…`),
   elige el versionCode mayor y, si es mayor que el instalado, **descarga el APK dentro de la app**
   (solo de `…/releases/download/…`, redirecciones solo a github.com / *.githubusercontent.com, ≤ 800 MB).
3. Comprueba **SHA-256 = el del manifiesto**, que el APK es **del mismo paquete**, que su **versionCode
   es el anunciado** y que su **firma es la de la app instalada** (si Android no deja leer alguna firma,
   decide él al instalar: rechaza otra firma). Si algo no casa, lo borra y dice por qué.
4. Abre el **instalador del sistema** (`ACTION_VIEW` + `content://` de su FileProvider propio,
   `ProveedorActualizacion`, que solo expone `files/starseed/actualizacion/`). **Android siempre pide a la
   persona que confirme «Instalar»**; la primera vez, además, permitir que StarSeed OS «Instale apps
   desconocidas» (`REQUEST_INSTALL_PACKAGES`): la app abre ese ajuste con un texto claro y, al volver con
   el permiso, abre el instalador sola.
5. Estado en `estado.json` (`apk_estado`): `buscando · descargando (con %) · lista · permiso · instalador ·
   instalada · al-dia · error · sin-actualizador`. Tras instalar, la app nueva arranca, dice «Instalada» y
   borra el APK.
6. Cada 6 h Rust pide una búsqueda **sin instalar**: si hay versión nueva, Kotlin la baja, la verifica y
   deja una notificación (una por versión); al abrir la app, la ventana «Hay una versión nueva» la ofrece.

**Web** (`aviso-actualizacion.tsx`, «Esta neurona», `comprobar.ts`, `/api/os/versiones`):
`/api/os/versiones` añade `canalPruebas` (`{ version, fecha, notas, android }`, de los dos manifiestos,
caché 10 min; la lista `versiones` no cambia). Una app de pruebas ve «**Canal de pruebas ·
0.5.1-prueba.23**» y sus notas; en escritorio instala con el updater; en Android, «Actualizar ahora» /
«Instalar la X aquí» descarga dentro de la app y abre el instalador. Con una APK sin el actualizador
interno (anteriores a ACT1108A), o si falla, se ofrece el `.apk` como antes.

Comandos nuevos (todas las plataformas; fuera de Android responden «solo Android»): `apk_actualizar`,
`apk_estado`, `apk_instalar` — en `COMANDOS_APP` de `build.rs` y como `allow-apk-*` en
`capabilities/default.json`. Dependencia nueva en Cargo.toml: `semver = "1"` (ya estaba en el árbol por
tauri-utils; es el mismo comparador del updater). Ningún crate se descarga de más.

### 9.6 Los datos se conservan

- **Escritorio:** mismo identificador (`app.starseed.os`) en los dos canales → misma carpeta de datos
  (`app_data_dir`: antenas, capas, carpetas concedidas, servidor local) y mismo almacenamiento del WebView
  (localStorage, IndexedDB, cookies). El updater solo reemplaza el paquete de la app.
- **Android:** mismo paquete y **misma firma** (mismo keystore en los dos canales; el job lo enseña con la
  huella del certificado) → Android actualiza encima y conserva `filesDir`, bases de datos y el
  almacenamiento del WebView. El versionCode creciente (§9.2) evita el «App no instalada» que obligaría a
  desinstalar.

### 9.7 Lo que Alex hace UNA vez

1. Lanzar una prueba (§9.4) e instalar **a mano** esa primera build que ya conoce el canal: en la Mac, el
   `.dmg` de la prerelease `canal-pruebas` (clic derecho → Abrir la primera vez); en Android, el
   `StarSeed-os-0.5.1-prueba.N.apk` (se instala ENCIMA de la 0.5.0: misma firma, datos conservados).
   Las builds anteriores (0.5.0, borradores) no saben del canal de pruebas.
2. En Android, la primera actualización desde dentro: aceptar «Instalar apps desconocidas» para StarSeed OS
   cuando la app lo pida, y en cada versión pulsar «Instalar» (Android no deja saltarlo).
3. A partir de ahí: cada `gh workflow run … -f canal=pruebas` llega solo (escritorio: se instala sola y
   avisa «Lista: reinicia»; Android: se descarga sola y avisa; un toque en «Instalar»).

### 9.8 Riesgos

- **versionCode oficial cambia** (×1000): necesario para pasar de pruebas a oficial sin desinstalar. Si
  algún día se compila un APK oficial sin este flujo (Tauri por defecto, 0.5.1 → 5001), no se instalaría
  encima de una prueba (5 000 0xx): hay que compilarlo con `canal-pruebas.mjs sellar --oficial`.
- **Primera instalación manual** inevitable: una 0.5.0 instalada no conoce el canal ni el actualizador.
- **Firma de Android**: si cambia el keystore de los secretos, Android rechaza instalar encima (y la app lo
  dice antes de abrir el instalador si puede leer las dos firmas). Sin `ANDROID_KEYSTORE_*` el APK no sale.
- **Firma del updater**: sin `TAURI_SIGNING_PRIVATE_KEY` no hay `latest-prueba.json` (el job sale en rojo).
- **macOS sin notarizar**: el updater funciona (firma propia); la primera instalación manual pide «Abrir».
  Windows: el MSI de pruebas es `0.5.1.<n>` (WiX ignora el 4.º número al decidir si es «más nuevo»; la
  plantilla de Tauri permite instalar encima igual). Linux: glibc ≥ 2.39, como el oficial.
- **(INT1108C · run 42452615312)** Linux en pruebas sale SIN `.rpm`: RPM no admite el «-» de
  `0.5.1-prueba.N` y tumbaba el job; `.deb` y `.AppImage` sí (el updater de Linux usa el AppImage). Y en
  Windows `canal-pruebas.mjs` no se reconocía como entrada (`file://D:\…` ≠ `file:///D:/…`): `sellar` no
  hacía nada y los instaladores salían como 0.5.0. Ahora la comprobación es portátil (`esEntradaCli`, como
  `preparar.mjs`) y el paso de sellado falla en alto si `tauri.conf.json` no dice la versión del plan. El
  MSI de pruebas se estrena con `0.5.1.<n>` (WiX); si diera guerra, `--bundles nsis` en Windows para
  pruebas. El canal oficial no cambia.
- **Android no deja instalar sin la persona**: no hay actualización silenciosa sin ser «propietario del
  dispositivo» o tienda. Si la app no está a la vista, el instalador se abre al volver a ella.
- **Sin verificar en un aparato real** todavía: el Kotlin (`ActualizadorApk.kt`) solo se compila en el CI
  de Android (y va en el APK de StarSeed OS de LOS DOS canales); las pruebas de Rust comprueban el parche
  del manifiesto, que Kotlin y Rust dicen lo mismo y la lógica pura. Si el Kotlin rompiera el build de
  Android, la variable de entorno `STARSEED_SIN_ACTUALIZADOR_ANDROID=1` en el job lo deja fuera (el APK
  sale como antes y la web ofrece el .apk). Primera prueba real: instalar la build de pruebas N, lanzar la
  N+1 y ver los dos caminos.
- **Choques de integración**: `lib.rs`, `build.rs`, `Cargo.toml` y `capabilities/default.json` también los
  toca NOT1108A; los cambios de ACT1108A son pocos y van marcados.

### 9.9 · «Nada apareció»: causas y arreglo (ACT1108B · 2026-11-08)

Prueba real: 0.5.1-prueba.22 en un Mac y una tablet Android 16, publicada la .23; no salió ninguna ventana,
«Actualizar» de la Librería no hizo nada y el Mac dijo «Could not fetch a valid release JSON from the remote».
Ese día `releases/download/…` (y `releases/latest/download/…`) devolvió **504 desde GitHub** mientras
`api.github.com` respondía bien.

**Causas (comprobadas en el código)**
1. **La web leía el canal de pruebas por UNA sola ruta, sin reintento y en silencio.** `/api/os/versiones`
   pedía los manifiestos con `releases/download`; con 504 devolvía `canalPruebas: null`, y para una app de
   pruebas la «versión que cuenta» pasaba a ser la oficial (más vieja): salía **«al día»** sin avisar.
2. **El updater de escritorio tenía una sola ruta y sin reintento**, y los fallos se traducían a «nada»:
   `decidirAviso` ignora un error del updater (no abre ventana, solo lo apunta) y `AvisoActualizacion`
   tragaba cualquier excepción. Además, con el canal de pruebas caído y el oficial vivo, `buscar` devolvía
   «al día» (**el falso «ya estás en la última versión»**).
3. **El botón «Actualizar» de la Librería lanzaba `starseed:actualizar-version` y NADIE lo escuchaba.**
   Además solo aparecía según la fecha del build de la WEB, que no dice nada de la versión de la app.
4. **No había sitio donde mirar:** la versión y «Buscar actualización» estaban dentro de Configuración ›
   Neuronas › Esta neurona. La búsqueda automática existía (Rust a los 25 s y cada 6 h; la web al montar y
   cada 6 h) pero sin interruptor ni estado visible, y su resultado solo se veía si había ventana.
5. El **Mac** vio el error crudo del plugin (`ReleaseNotFound`), que es lo que el plugin dice ante cualquier
   respuesta no válida, incluido un 504.

**Reintentos y ruta alternativa (mismo diseño en Rust, Kotlin y TypeScript)**
- Rutas: directa (`releases/download/<tag>/<archivo>`) → **API** (`releases/tags/<tag>` o `releases/latest`
  → id del asset → `releases/assets/<id>` con `Accept: application/octet-stream`; repositorio público, sin
  token) → directa → API. Pausas 0, 0, 15 s y 40 s (≈ 1 min). Solo con red caída, tiempo agotado, 5xx o 429;
  una firma inválida o un 404 no se reintentan, y si la API dice que el archivo no existe, ese canal «aún
  no tiene nada» (no es un fallo).
- **Escritorio** (`canal_actualizacion_red.rs` + `canal_actualizacion.rs`): el manifiesto se pide con un
  `updater_builder().endpoints([url de la API]).header("Accept","application/octet-stream")`; el paquete se
  baja con `Update::download` poniendo `download_url` = URL de la API del asset, y se instala con
  `Update::install`. **Se eligió esto antes que un segundo manifiesto escrito por el CI** porque no cambia el
  CI, no puede quedar desfasado del primero y cubre también el manifiesto (un segundo manifiesto en
  `releases/download` fallaría igual que el primero). Dependencias: `reqwest` y `rustls` (ya estaban en el
  árbol por tauri-plugin-updater; solo se usan para listar los archivos del Release).
- **La firma minisign la sigue verificando tauri-plugin-updater sobre los bytes descargados**, vengan por
  la ruta que vengan: no se tocó ni se desactiva nada.
- **Android** (`ActualizadorApk.kt`, `conRutas`): igual para los manifiestos y el APK; el SHA-256, el
  paquete y la firma se comprueban después, sin cambios. `api.github.com` entra en la lista de hosts.
- **Web** (`rutas-github.ts`, `leer-publicadas.ts`): `/api/os/versiones` lee por directa → API; si el
  servidor falla, la propia app lee GitHub directo. La respuesta añade `canalPruebasError` cuando el canal
  no se pudo leer (≠ «aún no hay ninguna prueba»): una app de pruebas nunca dice «al día» en ese caso.
- **Gancho F7** (`Ruta::Espejo` / `espejos`): una neurona que ya tiene el paquete lo serviría a las demás
  (red-sin-dependencias.md §7.7). Hoy `rutas_espejo()` devuelve vacío; el reintento ya sabe usarlo.

**Interfaz**
- **Ajustes › «Versión y actualizaciones»** (`/cuenta#version-actualizaciones`, primera tarjeta de Ajustes y
  entrada del buscador de Ajustes): versión, canal (oficial / pruebas) y aparato; última comprobación y
  «Buscar ahora»; progreso; «Instalar y reiniciar» (escritorio) o «Instalar» (Android, con la nota de
  «Instalar apps desconocidas»); interruptor «Buscar actualizaciones automáticamente» (por defecto sí).
  El canal no se elige: lo marca la versión instalada (la app de pruebas mira pruebas y oficial).
- Mismo estado en la ventana «Hay una versión nueva», en Esta neurona (enlace) y en la Librería: el botón
  «Actualizar» de la entrada de StarSeed OS ahora ejecuta el flujo de verdad y enseña sus estados.
- Búsqueda automática: ~20 s tras arrancar y cada 6 h (`planificador-auto.ts`); al volver la red si la
  última falló por no haberla; «Más tarde» deja la versión pendiente en Ajustes/Librería.
- Errores en español con «Reintentar»: «GitHub no respondió (504). Lo intento por otra ruta…»,
  «Sin conexión: lo intentaré cuando vuelva la red.» (`errores.ts`).
- **Sin verificar en aparato real**: el Kotlin (solo compila en el CI de Android) y el flujo completo con un
  504 de verdad.

### Firma de macOS (PER1108A · 2026-11-08)

**Qué cambia.** Los dos canales firman el BUNDLE `.app` entero con el identificador estable `app.starseed.os` (el de `tauri.conf.json`): así el `Info.plist` y los recursos quedan sellados y macOS (TCC) pregunta por Bluetooth, red local,
micrófono, cámara y ubicación. Antes la app salía con `flags=0x20002(adhoc,linker-signed)` e identificador `starseed_native-<hash>` y macOS negaba el Bluetooth sin preguntar.

**Cómo.** El paso «macOS · preparar la firma del bundle» (`native/scripts/firma-macos-preparar.sh`) deja la identidad en `APPLE_SIGNING_IDENTITY` para `tauri-action`: Tauri firma la `.app` ANTES de hacer el `.dmg` y el `.app.tar.gz` del
updater (y su firma minisign), así que el paquete del updater lleva la app ya firmada.

| Modo | Cuándo | Efecto |
|---|---|---|
| Certificado propio | existen los secretos `MACOS_CERT_P12_BASE64` y `MACOS_CERT_PASSWORD` | se importa a un llavero temporal; el requisito designado es identificador + certificado: los permisos concedidos SOBREVIVEN a las actualizaciones |
| Ad-hoc (`-`) | no hay secretos (hoy) | el bundle queda sellado y macOS pregunta, pero el hash cambia en cada build: macOS puede volver a preguntar tras cada actualización |

**Hardened runtime: apagado** (`bundle.macOS.hardenedRuntime: false`). Encenderlo exige entitlements (`audio-input`, `camera`, `bluetooth`, `network.client` y `network.server`) y sin ellos macOS niega micrófono, cámara y Bluetooth. Sin notarización de Apple no aporta
nada (Gatekeeper sigue pidiendo «clic derecho → Abrir»). Si algún día hay Developer ID: encenderlo, añadir `Entitlements.plist` y notarizar a la vez.

**Comprobación en el CI** (`native/scripts/verificar-firma-macos.mjs`, tras el build): `codesign -dv` no puede decir `linker-signed`, el `Info.plist` debe estar atado, los recursos sellados, el identificador ser `app.starseed.os`, no debe haber
`runtime`, y `codesign --verify --deep --strict` debe pasar. Limitación: `tauri-action` ya subió los archivos cuando se comprueba; si falla, el job sale en rojo y esa prueba no debe usarse.

**Lo que Alex hace UNA vez para tener el certificado propio** (no lo ha ejecutado ningún agente; Alex lo aprueba y lo corre en su Mac):

```sh
# 1 · Certificado autofirmado de firma de código (10 años) con openssl
cd "$(mktemp -d)" && cat > cert.cnf <<'EOF'
[req]
distinguished_name = dn
x509_extensions = ext
prompt = no
[dn]
CN = StarSeed OS Signing
O = StarSeedSystem
[ext]
basicConstraints = critical,CA:false
keyUsage = critical,digitalSignature
extendedKeyUsage = critical,codeSigning
EOF
openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -config cert.cnf -keyout clave.pem -out cert.pem
# 2 · Empaquetar en .p12 (pide la contraseña: invéntala y guárdala en tu gestor)
openssl pkcs12 -export -inkey clave.pem -in cert.pem -out starseed-firma.p12 -name "StarSeed OS Signing" -legacy
# 3 · Comprobar que se importa a un llavero (opcional)
security create-keychain -p prueba prueba.keychain-db && security import starseed-firma.p12 -k prueba.keychain-db -P "<la contraseña>" -T /usr/bin/codesign
security find-identity -p codesigning prueba.keychain-db; security delete-keychain prueba.keychain-db
# 4 · Secretos del repositorio (la contraseña se teclea, no se pega en el historial)
base64 -i starseed-firma.p12 | gh secret set MACOS_CERT_P12_BASE64 --repo StarSeedSystem/starseed-system
gh secret set MACOS_CERT_PASSWORD --repo StarSeedSystem/starseed-system
# 5 · Guardar clave.pem y starseed-firma.p12 en un sitio seguro (si se pierden, se crea otro certificado y los permisos se piden una vez más)
rm -f clave.pem cert.pem cert.cnf
```

La primera app firmada con el certificado nuevo pide los permisos otra vez una sola vez; a partir de ahí se conservan entre actualizaciones. Mientras tanto, en un Mac con la app ya instalada y sin permiso, el arreglo manual (comprobado el 08-11) es
`codesign --force --deep --sign - --identifier app.starseed.os "/Applications/StarSeed OS.app"`.

## 10 · Versiones de prueba con su medidor y «Aprobar» (VER1111F · 2026-11-11)

Petición de Alex: «los medidores deberían estar activos, con medidores de las versiones de prueba, y una opción para que,
cuando una prueba se apruebe, se lancen las actualizaciones con los builds completos de las versiones oficiales de todos
los sistemas de las apps». Hasta hoy nada unía las dos etapas y Genesis no enseñaba nada de una prueba.

### 10.1 La sección «Versiones de prueba» (panel «Versiones»)

`src/components/mando/versiones-prueba.tsx`, dentro de `PanelVersiones`, sondea `GET /api/mando/lanzamientos/pruebas`
cada 30 s (pestaña visible). Enseña la prueba en marcha y las 4 últimas publicadas o fallidas. Lógica pura:
`src/lib/mando/lanzamientos-pruebas.ts`; fuentes (solo servidor): `lanzamientos-pruebas-fuentes.ts`; tipos:
`lanzamientos-pruebas-tipos.ts`.

| Dato | De dónde sale |
|---|---|
| N, versión, commit, fecha, enlace al run | `gh run list --workflow native-build.yml` (workflow_dispatch en main) + `gh run view --json jobs`: es de pruebas si tiene el job «canal de pruebas · versión y prerelease» sin omitir; N = número de ejecución; versión = `<NATIVE_VERSION + 1 parche>-prueba.N` |
| build por plataforma | jobs `os · macos-latest/windows-latest/ubuntu-24.04/android`: en cola · compilando (desde `startedAt`) · publicando (escritorio compilado, falta «latest-prueba.json y limpieza») · publicada · falló (nombra el job; un omitido por otro fallo nombra el que falló). iOS omitido no cuenta |
| esperando a main | `~/.starseed/opus1031/lanzar-prueba<N>.log` (solo lectura): vacío y < 4 h 10 min = esperando; «ya está en origin/main» + JSON = pedido; «se acabó la espera» = expiró; vacío y más viejo = mudo |
| qué sirve hoy el canal | `latest-prueba.json` y `latest-prueba-android.json` (directa → API, `leerJsonConRutas`) |
| qué trae | `git log --no-merges <commit de la prueba anterior>..<commit>`, agrupado por id de tarea (`LLA1111A: …` o `<ola> · ID: …`); lo que no lleva id, al final |
| main después de lo probado | `git log <commit>..HEAD` del repo (solo si lo probado está dentro de HEAD) |
| comprobaciones y aprobación | `~/.starseed/produccion/pruebas-comprobaciones.json` (§10.3) |
| lo que dice el director | `lanzamientos-estado.json` → `aprobacion`, `aprobaciones`, `aprobacion_ultima` |
| web | `autopublicar-estado.json` → último sha publicado y verificado |

Lo que Genesis no sabe se dice en la tarjeta («Sin saber: …») y lo que no se pudo leer, arriba (`avisos`). Mientras el
lanzador espera, el commit solo se sabe si el registro lo escribe (línea «espero <sha> en origin/main», pendiente de añadir
al lanzador del supervisor) o si se registraron las comprobaciones con `--sha`.

Resumen de una línea, puro (`resumenPruebas`): «prueba.36 · Android compilando 12 min · 3 de 8 comprobaciones», en
`GET /api/mando/lanzamientos/pruebas` (`resumen`) y en `GET /api/mando/lanzamientos` (`resumenPruebas`, null si tarda
más de 1,5 s), para que otros medidores lo enseñen.

### 10.2 «Aprobar»

- Se ofrece cuando la prueba está **publicada en todas las plataformas para las que se compiló**. Las comprobaciones
  pendientes o que fallan **no bloquean**: la confirmación las enseña una por una.
- La confirmación dice la versión de prueba, la oficial que la corona (`0.5.1-prueba.36` → `0.5.1`), el commit y qué se
  lanza: macOS, Windows, Linux y Android de OS, Nexus y Café; iOS sigue en la PWA; los tres canales del actualizador; la
  web (la publica la autopublicación desde main: qué commit sirve hoy). Dice también que la prueba solo compiló OS.
- `POST /api/mando/lanzamientos/pruebas {accion:"aprobar", numero, sha, lanzar_sha}`: solo `guardianMando` **y** desde
  esta máquina (`esPeticionDeEstaMaquina`) **y** desde la página (`Sec-Fetch-Site: same-origin`); otra neurona ve «se
  aprueba desde Genesis en la Mac». La ruta vuelve a leerlo todo en ese momento (no se fía del panel), comprueba que el
  commit es el de la prueba, que está publicada en todas y que `lanzar_sha` es la cabeza de main AHORA. Una segunda
  pulsación con la aprobación ya registrada responde `repetida` y no escribe nada. Si el director no ha leído aún otra
  petición, 409.
- Registra la aprobación en el archivo de comprobaciones (cuándo, versión, commit, commit a lanzar, quién y el estado de
  cada comprobación en ese momento) y escribe en `lanzamientos-peticion.json`:
  `{"accion":"aprobar-prueba","version":"0.5.1-prueba.36","sha":"<40>","lanzar_sha":"<40>","quien":"genesis","t":…}`.

**El director** (`pasada`): la petición `aprobar-prueba` se toma **después** de saber que dirige y de traer main (si no
dirige, se queda para el líder). `decidir_aprobacion` (pura) la acepta solo si: viene de `genesis`; la versión es de prueba;
el commit está en origin/main y el que se lanza lo contiene; no hay otro lanzamiento a medias (fase `esperando-lista`,
`lanzado` o `esperando-publicacion` sin `preparado_sha`) ni otra aprobación en curso; la oficial es más nueva que la del repo y
no es mayor. Aceptada: `esperando-publicacion` con `lista_sha = lanzar_sha`, `version_aprobada` y `aprobacion` en curso, y a
partir de ahí **sus pasos de siempre** (§2.2 publicado y verificado → §2.3 commit de versión → etiqueta → compilación →
archivos → publicación → medios). La versión es la oficial que corona la prueba, no «menor».

- **La pausa general sigue.** `pausado` solo deja pasar la pasada que trae la petición y las de una aprobación en curso.
  Al llegar a `lanzado` la aprobación se cierra (`aprobaciones[-1].estado = "lanzada"`) y la pausa vuelve a mandar.
  El automático (`lanzamientos.json`) no se toca.
- **Lo probado es lo que se lanza.** Dentro del cerrojo de commits, antes del commit de versión, `cabeza_para_preparar`
  exige `HEAD == lanzar_sha`. Si main se movió, la aprobación queda `caducada` con el motivo, el director vuelve a
  `esperando-lista` y se avisa en el Chat Director: nunca sube la versión encima de commits sin probar.
- Un arreglo de código del director (§3) cambia lo probado: la aprobación queda `superada` y, en pausa, se para.

**Lanzar un commit que no es la cabeza de main no es posible hoy**: `_preparar` sube la versión encima de `HEAD` y
`_etiquetar` exige que ese commit esté en origin/main. Por eso, si main avanzó, la confirmación lo dice («Main avanzó N
commits desde lo probado», con lo añadido agrupado por tarea) y Alex elige entre **aprobar y lanzar main tal como está**
(lo probado + N sin probar, `lanzar_sha` = cabeza) o **cancelar**. Para lanzar exactamente lo probado con el enjambre
integrando, main tiene que estar quieto desde la aprobación hasta el commit de versión.

### 10.3 Comprobaciones en aparatos

Un archivo, `~/.starseed/produccion/pruebas-comprobaciones.json`, para el panel y para el comando:

```json
{"formato": 1, "pruebas": {"36": {"version": "0.5.1-prueba.36", "sha": "<40>",
  "comprobaciones": [{"id": "c1", "texto": "…", "aparato": "Mac", "estado": "pendiente|bien|falla",
                      "nota": "", "quien": "director", "t": "<ISO>"}],
  "aprobacion": null}}}
```

Clave = número de la prueba («36», «prueba36», «prueba.36» y «0.5.1-prueba.36» valen lo mismo). Escritura atómica
(tmp + rename) en los dos lados; un texto repetido no se duplica. Alex marca con un toque en el panel (Bien · Falla ·
Pendiente · Nota; `POST {accion:"marcar"}`, también desde MetaGenesis remoto). Los directores, desde la terminal:

```
python3 scripts/puente/comprobaciones_prueba.py registrar 36 --sha a8051ea953 --aparato Mac "Tres llamadas solo por Bluetooth con cámara"
python3 scripts/puente/comprobaciones_prueba.py marcar 36 c1 falla --nota "vídeo negro" --quien director
python3 scripts/puente/comprobaciones_prueba.py ver 36
```

`STARSEED_PRODUCCION_DIR` cambia la carpeta (las pruebas usan una temporal). El comando nunca aprueba. Ejemplo
compartido por las dos pruebas: `src/lib/mando/__tests__/fixtures/pruebas-comprobaciones.json`.

### 10.4 Pruebas

`scripts/puente/test_aprobar_prueba.py` (petición, decisión, pausa, main movido, doble pulsación, no-líder, lanzada,
arreglo, nada sin petición; con falsos y un repo temporal), `test_comprobaciones_prueba.py`,
`src/lib/mando/__tests__/lanzamientos-pruebas.test.ts`, `src/components/mando/__tests__/versiones-prueba.test.tsx`.

## 11 · Director de pruebas y banco de pruebas (PRB1111W · 2026-11-12)

Hasta esta sección una versión de prueba (`0.5.1-prueba.N`) solo existía porque el supervisor corría a mano cuatro
guiones de `~/.starseed/opus1031/` (`lanzar-prueba-cuando.sh`, `vigilar-prueba39.sh`, `respaldo-prueba39.sh`,
`comprobaciones-prueba39.sh`) y luego leía a mano la evidencia de los aparatos. Ahora hay dos servicios en
`scripts/puente/` y una sola puerta para pedirles cosas: archivos pequeños (peticiones) que escribe Genesis o un
comando del mismo guion.

### 11.1 Qué hace cada uno

- **`director_pruebas.py`** (lógica pura en `director_pruebas_logica.py`). Actúa **solo por petición**; lo único que
  hace sin que se lo pidan es seguir hasta el final lo que ya había en marcha: sigue el run, publica los manifiestos
  que el run no actualizó (lo que hacía el guion de respaldo), avisa **una vez** al chat de dirección cuando la
  prueba está publicada o ha fallado (con el nombre del job que falló) y crea la entrada de la versión en
  `pruebas-comprobaciones.json`.
- **`banco_pruebas.py`** (lógica pura en `banco_pruebas_logica.py`). Lee los registros del Mac, los deduce a
  aparatos, llamadas y sugerencias, y escribe `pruebas-banco.json`. Solo vuelve a escribir cuando cambió lo leído
  (campo `firma`). No toca la red.

### 11.2 Peticiones

Carpeta `~/.starseed/produccion/pruebas-peticiones/<id>.json`; las atendidas pasan a `hechas/` con `estado`,
`resultado` (una frase legible) y `t_fin`. Acciones (conjunto cerrado): `compilar`, `cancelar`, `reintentar`,
`republicar`, `pedir-arreglo`, `app-abrir`. Desde una terminal:

```
python3 scripts/puente/director_pruebas.py pedir compilar [--sha <40 hex>] --quien alex|claude|hermes
python3 scripts/puente/director_pruebas.py pedir cancelar|reintentar|republicar [--numero N] --quien …
python3 scripts/puente/director_pruebas.py pedir pedir-arreglo --prueba 39 --comprobacion c7 [--plataforma …] [--nota "…" (500)] --quien …
python3 scripts/puente/director_pruebas.py pedir app-abrir --quien …
python3 scripts/puente/director_pruebas.py estado | pausar "motivo" | reanudar
```

Reglas que el código hace cumplir:

- **Solo la última.** `compilar` sin commit toma la cabeza de `main` publicada; con commit espera a que
  `origin/main` lo contenga (como el lanzador). Una petición nueva **sustituye** a la que sigue esperando; mientras
  hay una prueba compilando se **rechaza** con el motivo («ya está compilando la prueba N; espera a que acabe»).
- **Una en vuelo.** El estado guarda el run seguido; ningún `compilar` se atiende con otro en curso. `cancelar` y
  `reintentar` (solo los jobs fallidos) actúan sobre ese run.
- **Reiniciable.** La intención se escribe en disco antes de lanzar (si se mata entre medias, la pasada siguiente
  encuentra el run en vez de lanzar otro); doble pasada idempotente; cerrojo `flock`; el archivo
  `pruebas-director.pausa` (primera línea = motivo) deja al director solo mirando.
- **Validación.** Acción de un conjunto fijo, commit de 40 hex que desciende de lo exigido, enteros; los comandos
  son listas fijas y ningún texto de una petición llega a un shell.
- **Quieto = sin red.** Sin nada en vuelo y sin peticiones, la pasada no llama a `gh` ni a git por la red.

### 11.3 Archivos que lee Genesis

Los formatos exactos (con un ejemplo por archivo y qué campos pueden ser `null`) están en la carpeta de trabajo de
esta tarea (`formatos.md`) y se resumen aquí:

| Archivo (en `~/.starseed/produccion/`) | Quién lo escribe | Contenido |
| --- | --- | --- |
| `pruebas-director-estado.json` | director | `t` y `cada_s` (última pasada y cada cuánto debe pasar), si está pausado, qué espera y por qué, el run en vuelo con `plataformas[]` (`en-cola|compilando|compilada|publicada|fallo|omitida|cancelada`), las últimas peticiones con su resultado |
| `pruebas-banco.json` | banco | `aparatos[]`, `llamadas[]` (ambos lados, números y 3 a 6 líneas crudas), `sugerencias[]`, `firma` |
| `pruebas-comprobaciones.json` | `comprobaciones_prueba.py` | lo que ya había, más por comprobación `senal` (opcional) y `arreglo` (`{t, quien, nota, peticion}`, opcional) |

Ningún archivo lleva rutas absolutas del disco ni claves.

### 11.4 La evidencia: qué sabe y qué no

Sabe, del **Mac**: la versión instalada (del paquete de la app), si la app está abierta, el último arranque y los
errores de arranque de sus registros. De las **llamadas** (de `enlaces.log`, con las líneas de la tableta marcadas
`(Maggaboard)` como el otro lado): escalón y tasa de la voz, audio inventado, espera de la voz, imágenes por
segundo enviadas y recibidas, pausas con su motivo, qué enlaces la llevaron, kbps medidos del canal rápido y los
intentos de cámara.

Señales de las comprobaciones (vocabulario cerrado; se asignan con `python3 scripts/puente/comprobaciones_prueba.py
senales N`, que mira el texto de cada comprobación): `enlace-ble-hora`, `voz-sin-corte`, `llamada-ble`,
`video-sin-negro`, `video-fps-ble`, `video-sin-pausa-mudo`, `video-pausa-ancho`, `voz-limpia-lejos`, `camara-abre`,
`camara-cambia`, `camara-conserva`, `arranque-limpio`. Para cada comprobación con señal el banco propone `bien` o
`falla` con el motivo y la llamada que usó. **Una sugerencia nunca marca nada**: lo hace una persona o un director.
Una prueba nueva hereda las comprobaciones de la anterior (copiadas, con su señal); no se proponen sugerencias si la
versión instalada no es la de la prueba.

**No puede saber**: la versión de la tableta (nada del Mac la registra: figura como `desconocida`); si una voz
viaja por WebRTC (no hay marca en el registro); cómo se escribe un fallo de cámara (no hay ejemplo real, por eso
solo cuenta los intentos); el estado del Wi‑Fi; ni la prueba de «una hora por Bluetooth» si el registro cubre menos
de una hora. Donde no lo sabe lo dice, no lo adivina.

### 11.5 «Pedir arreglo» y «Abrir la app»

- **Pedir arreglo** publica **un** mensaje en el chat de dirección dirigido a `claude-cowork` y `hermes`
  (`director_chat.publicar`), con la versión, la comprobación, la nota (máx. 500) y el resumen de la evidencia, y
  anota `arreglo` en la comprobación. Repetirlo dentro de 5 minutos no hace nada nuevo.
- **Abrir la app** ejecuta solo `open -b app.starseed.os` en el Mac (nunca cierra ni mata la aplicación; si ya está
  abierta, la trae al frente).
- **¿Se puede pedir una actualización?** No desde fuera mientras la app está abierta: comprueba actualizaciones a
  los ~25 s de arrancar y cada 6 h, y no tiene enlace profundo, argumento ni archivo vigilado para forzarlo.
  Abrir una app cerrada sí provoca una comprobación a los ~25 s. Añadir un disparador exigiría un cambio en la app
  nativa (fuera de esta tarea).

### 11.6 Programación e instalación

Va en `SERVICIOS` de `instalar-servicios.py` con la clave `pruebas` (director en bucle: una pasada por minuto, que
también ejecuta el banco). Instalación (la hace el supervisor, no el código):

```
STARSEED_SOLO=pruebas python3 /Users/alex/Documents/starseed-os-main/scripts/puente/instalar-servicios.py /Users/alex/Documents/starseed-os-main /opt/homebrew/bin/python3
```

Después de instalarlo, los cuatro guiones a mano se **retiran** (no se borran: se dejan sin ejecutar). Mientras
convivan con el director, `lanzar-prueba-cuando.sh` y el director podrían lanzar dos veces: no los dejes juntos.

### 11.7 Pruebas

`test_director_pruebas.py` (reglas de petición, solo la última, una en vuelo, doble pasada, reinicio a media
compilación, pausa, petición mal formada, aviso una vez, arreglo repetido, sin red en reposo),
`test_banco_pruebas.py` (con `fixtures/enlaces-log-prueba39.txt`, extracto saneado del registro real),
`test_instalar_servicios_pruebas.py`, `test_comprobaciones_prueba.py`.

### 11.8 La evidencia pertenece a una versión (PRB1111Y · 2026-11-12)

Regla de Alex: Genesis no muestra nada que no sea verdad. Una comprobación de la prueba N solo se juzga con evidencia
que produjo la N.

- **Desde cuándo corre la Mac la N.** El banco guarda una memoria propia, `pruebas-banco-version.json` (en la carpeta
  de producción, no en `/tmp`: sobrevive a reinicios de la Mac y del servicio y a las actualizaciones), con la versión,
  el `desde` y la `fuente`. Al ver una versión nueva toma el instante en que se instaló el paquete (el cambio de inodo,
  `ctime`, del `Info.plist` de la app: la fecha de modificación no sirve porque el instalador deja la de compilación),
  nunca antes de la última vez que vio la versión anterior; sin ese dato, «ahora» (lo prudente). Una vez escrito, el
  `desde` no se mueve aunque el sistema vuelva a tocar el paquete. Se publica en `aparatos[mac].version_desde`.
- **Cada llamada dice con qué versión se hizo** (`version_relacion`: `esta|otra|desconocida`; `version_mac` si se sabe).
  Las de otra versión quedan como historia y no producen sugerencias.
- **Señales de dos aparatos** (`DOS_APARATOS`): `enlace-ble-hora`, `voz-sin-corte`, `llamada-ble`, `video-fps-ble`,
  `video-sin-pausa-mudo`, `video-pausa-ancho`, `voz-limpia-lejos`. Solo se proponen si la Mac y la tablet dieron
  señal dentro de lo que se juzga: en una llamada, líneas de las dos puntas; en `enlace-ble-hora`, una hora de
  registro ya con esta versión con señal de la tablet en al menos 3 de sus 6 tramos de diez minutos. Si no, queda en
  `sin_evidencia` con «la tablet no da señal desde …». `video-sin-negro` y las tres de cámara las mide la Mac sola.
- **Sin evidencia es un estado, no un veredicto**: `sin_evidencia[]` con `razon` y `produciria`. `arranque-limpio` se
  juzga con un arranque posterior a la actualización a la N.
- No se sabe la versión de la tablet, así que «dos aparatos con señal» no prueba que la tablet corra la N.

Pruebas: `test_banco_pruebas.py` (clases `EvidenciaDeUnaVersion`, `MemoriaDeVersion`; la situación real —prueba.39 con
una llamada hecha con la .37— es el primer caso).

### 11.9 Leer bien las llamadas de la 39 y no caerse nunca (PRB1111AB · 2026-11-12)

La 39 cambió lo que escriben las llamadas (control de congestión rehecho) y el banco se cayó con la primera
(`TypeError` al promediar un `fps` que faltaba en una línea `reparto carril=…`), dejando el archivo congelado. Ahora:

- Se leen las líneas nuevas: escalón y tasa de la voz, `BAJO-SUELO`, lo que dice el otro extremo (`otro:perd=…/tarde=…`),
  el modelo del enlace (`enlace=kbps+ms/ciclo`) y lo entregado (`entregado=`), la espera de la voz (`espera=a/b ms`:
  `a` percentil 90 por escritura, `b` lo más que esperó; `voz-datos/sesion.ts`, `textoEnlace` en `reparto.ts`), y las
  imágenes por segundo enviadas y pintadas en cada sentido. Las líneas de reparto que no son un estado
  (`reparto carril=…`) ya no cuentan como «activo».
- **Nunca se cae por una línea**: lo ilegible se cuenta y se nombra (`fuente.ilegibles`, `problemas`); una sección,
  una punta, una llamada o una señal que no se puede leer queda anotada y lo demás se escribe.
- El aviso del director lleva el mensaje y el sitio del error (sin rutas), una sola vez.

Formatos: `formatos.md` v1.4. Pruebas: `RegistroDeLaPrueba39` (con `fixtures/enlaces-log-prueba39-real.txt`, las líneas
reales de la 39) y `AvisoDelBanco`.

## 12 · Ronda de aparatos y reloj del CI (RON1112C · 2026-11-12)

El 11-11 a las 22:22 la autopublicación tomó un candidato y arrancó sus puertas locales; la carga de la Mac fue de 34 a
60 durante veinte minutos, justo mientras Alex hacía las llamadas de prueba con la tableta. La voz y el vídeo dependen de
temporizadores, así que esos números no valieron y una llamada se cayó. Nada avisaba a los trabajos pesados de que había
una ronda, ni a Alex de que la Mac no estaba tranquila. Además, esa misma noche la autopublicación vetó un candidato con un
CI sano porque el plazo del CI contaba también las puertas locales. Este apartado arregla las dos cosas.

### 12.1 La ronda de aparatos

Un archivo, `~/.starseed/produccion/ronda-aparatos.json` (formato en `formatos.md` §(e)), que escribe SOLO el director de
pruebas a petición. Dice quién la pidió, para qué, desde cuándo y hasta cuándo.

- **Se pide** con las acciones `ronda-iniciar` (motivo obligatorio ≤ 200 en `nota`; `minutos` 1 a 90, 30 por defecto) y
  `ronda-terminar`, que son las dos peticiones nuevas del director de pruebas. Lo mismo desde la sección «Ronda de
  aparatos» del panel «Pruebas» de Genesis que desde la línea de órdenes:
  `python3 scripts/puente/director_pruebas.py pedir ronda-iniciar --nota "llamadas con la tableta" --minutos 30` y
  `… pedir ronda-terminar`. Iniciar con una ronda activa la RENUEVA. Terminarla es una pulsación, sin confirmación.
- **Caduca sola**: 30 min por defecto, renovable, nunca más de 90 desde que empezó (el tope se recalcula al leer: un
  `hasta` más lejano no alarga nada). Quien admite trabajos pesados NO se fía de la bandera `activa`: compara `hasta` con
  el reloj, así que aunque el director esté parado la ronda se acaba a su hora.
- **Se atiende aun con el director en pausa** (proteger la Mac no lanza nada). Parado, sin archivo o ilegible, nadie las
  leería y la ruta de Genesis responde 409 con el motivo.
- **Falla abierto**: un archivo que falta, vacío o ilegible significa «sin ronda». Una ronda que nadie puede leer no debe
  parar la fábrica.
- **No mata nada.** Los trabajos que ya corren siguen; sólo esperan los que van a EMPEZAR.

**La puerta de admisión.** Cada lugar que lanza algo pesado en la Mac pregunta
`python3 scripts/puente/ronda.py activa` (una línea; código 0 = HAY ronda, espera; 1 = no hay). Los puntos de lanzamiento:

| Punto | Qué hace con una ronda activa |
|---|---|
| `turno_pesado.turno()` (lo usan `publicar.py`, `con-turno.py`, `aprobador_automatico.py` y `director-produccion.py`) | espera antes de pedir el cerrojo `pesado.lock`; los plazos del turno empiezan DESPUÉS |
| `scripts/enjambre/tsc-turno.sh` (tsc del enjambre) | espera; ni `MAX_ESPERA_S` ni `MAX_TSC_S` corren mientras tanto |
| `cerrojo_pesado()` del orquestador del enjambre (`starseed-enjambre.py`) | espera y reinicia `t0` (esperar una ronda no gasta `PESADO_ESPERA_S`) |
| `autopublicar._nuevo_lote` | no empieza las pruebas del puente, ni el análisis, ni gasta Jev: fase `esperando`; no se fija `desde` |
| `autopublicar.Medios.pruebas_python` | segunda guarda por si la ronda empezó entre la comprobación y el arranque |
| `director_lanzamientos._preparar` | no empieza la preparación (vitest); queda en «preparando · espero» |
| `traer_nube._puertas` (sin turno) | `esperar_ronda` antes de las pruebas locales |

Esperar una ronda **no cuenta contra ningún plazo** de ningún trabajo. Al volver, el trabajo empieza de cero.

**La verdad del silencio.** El estado de la ronda lleva `silencio`, la medición que hace el director cada pasada: qué
trabajos pesados siguen vivos (lista cerrada en la tabla de procesos: tsc, vitest, pytest, unittest, next build, más el
dueño vivo del cerrojo `pesado.lock`), cuánto llevan y cuánto SUELEN tardar (la mediana de las veces que este mismo
servicio los vio terminar, en `ronda-duraciones.json`), la carga y los núcleos y la presión de memoria de macOS.
Si hay un trabajo pesado dice «espera a que termine …, unos N min»; si la carga es alta sin un trabajo conocido, lo dice
y no adivina; si no pudo medir, dice que no sabe. Lo que NO sabe: qué hace la tableta, apps ajenas que no estén en la
lista, el disco ni la red. La pantalla trata una medición con más de 3 pasadas de antigüedad como «sin medir»: nunca
afirma calma con un dato viejo.

**Dónde se ve.** (1) Sección «Ronda de aparatos» del panel «Pruebas» (quién, para qué, cuánto queda, Mac tranquila u
ocupada, Terminar, Renovar, Empezar; con el director parado los botones se desactivan y se dice que la ronda caduca sola).
(2) «Qué corre ahora» (`EnMarcha.ronda`, sólo si está en vigor a esa hora; no cuenta como proceso vivo). Lo que viaja a
otras neuronas es sólo `{quien, motivo, desdeMs, hastaMs}`, ya sin rutas.

**Servicios.** Para que el cambio surta efecto hay que reiniciar los procesos largos, que cargan el código una vez:
el director de pruebas (`com.starseed.pruebas`: atiende las peticiones y mide el silencio), la autopublicación
(`com.starseed.produccion`) y el orquestador del enjambre (copia instalada en `~/.local/bin` por
`scripts/enjambre/instalar.sh`: hay que volver a ejecutarlo para copiar `starseed-enjambre.py` y `tsc-turno.sh`, y luego
reiniciar el enjambre como siempre). `publicar.py`, `ronda.py activa` y `tsc-turno.sh` se leen en cada ejecución. El servidor
de Genesis (Next) sólo necesita el despliegue normal de la interfaz.

### 12.2 El plazo del CI cuenta el CI

Antes el plazo de 50 min (`CI_TOPE_S`) se medía desde `desde`, el inicio de toda la pasada, que incluía las puertas
locales y la espera a que GitHub creara el run. Línea de tiempo real del candidato `6539048b4e` (11-11):

| Hora | Hecho |
|---|---|
| 20:25 | la pasada toma el candidato y empieza sus puertas locales (`desde`) |
| 20:57 | acaban las puertas locales y se sube el candidato (`empujado`) |
| 21:01 | GitHub crea el run del CI (`run.created_at`) |
| 21:17 | la regla antigua veta el candidato: `ahora - desde` = 52 min > 50, con un CI sano que llevaba 16 min |

Ahora: `ci_desde = min(max(run.created_at, empujado), ahora)` y el plazo es `ahora - ci_desde`. Con la línea de tiempo real
a las 21:17 el CI lleva 16 min y no se veta; sigue vetando a los 50 min contados desde la creación del run. Un run con
hora anterior a la subida no adelanta el reloj, uno con hora futura no cuenta. El plazo se guarda en el estado
(`ci_desde`, `run_creado`) y sobrevive a reinicios; un estado de antes sin `empujado` sigue con `desde`.

**Un run que nunca aparece** tiene su propia cota, `CI_APARICION_S` (15 min, `STARSEED_PUBLICAR_CI_APARICION_S`), contada
desde `empujado`, y su propio mensaje: «GitHub no creó el run de CI en 15 min». Mientras espera dice «Esperando a que
GitHub cree el run …». No se confunde con el tope de 50 min del CI.

### 12.3 Pruebas

`test_ronda.py` (reglas puras, caducidad y tope de 90, falla abierto, silencio con tabla de procesos y reloj falsos,
`esperar`, la CLI, tsc-turno.sh con un `ronda.py` falso), `test_director_pruebas.py` (clase `RondaDeAparatos`: pedir,
renovar, terminar, pausa, petición mal hecha), `test_autopublicar_ronda_1112.py` (la línea de tiempo real, el plazo
desde la creación del run, la cota del run que no aparece, el portón de la ronda), `test_turno_pesado.py`, y en
TypeScript `ronda-aparatos.test.ts`, `control-ronda.test.ts` y `ronda-aparatos.test.tsx`. Todas usan relojes, GitHub y tabla de
procesos falsos y escriben sólo en carpetas temporales.

**Para la puerta de integración del supervisor** (vive fuera del repo): una sola línea que debe llamar antes de lanzar
pruebas locales pesadas: `python3 /Users/alex/Documents/starseed-os-main/scripts/puente/ronda.py esperar --nombre "la puerta de integración"`
(se queda mientras haya ronda, una línea por minuto, y sale con 0 cuando ya no hay).
