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
| `linux` | `.AppImage`, `.deb`, `.rpm` (+ `.sig`) | job `<sistema> · ubuntu-22.04` | ídem |
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
