# 🖥️ StarSeed Native — empaquetado nativo (Tauri 2)

Envuelve los **tres sistemas StarSeed** (que ya viven como webs desplegadas) en
una **aplicación nativa por sistema operativo**, cada una con su icono, con
**actualización incremental DENTRO de la app** (updater de Tauri, sin reinstalar)
y **acceso real a terminal/procesos del dispositivo** para el "compañero de
control profundo" de Aurora.

| Sistema         | Web que carga                          | Icono de origen                                                                 |
| --------------- | -------------------------------------- | ------------------------------------------------------------------------------- |
| **StarSeed OS** | `https://starseed-os.vercel.app`       | `icons-src/os.png` (real — copia de `public/starseed-symbol-square.png`)         |
| **StarSeed Nexus** | `https://starseed-nexus.vercel.app` | `icons-src/nexus.png` (placeholder; el real es `logo-detallado.png` del repo Nexus) |
| **StarSeed Café** | `https://starseed-cafe.vercel.app`   | `icons-src/cafe.png` (placeholder; el real es `StarSeed-Café-detallado.png` del repo Café) |

---

## 1 · ¿Qué es esto exactamente?

No es una reimplementación: es una **cáscara nativa** (Tauri 2) que muestra la
web ya desplegada en una ventana nativa y le añade lo que un navegador **no puede
dar**:

- **App nativa por SO** con su propio icono, nombre e identificador
  (`app.starseed.os` / `.nexus` / `.cafe`).
- **Updater incremental in-app**: la app se actualiza sola desde GitHub Releases
  sin que el usuario reinstale nada.
- **Control profundo del dispositivo**: terminal, procesos, archivos, sistema,
  notificaciones y autoarranque — el "compañero" que Aurora usa, con el usuario
  concediendo permisos.

La web se carga en **remoto**: la ventana apunta a la URL desplegada (ver §5).
Por eso este proyecto **no compila el frontend** — solo el "cuerpo" nativo en
Rust. Toda la UI sigue siendo la web de Vercel, que se sigue actualizando por su
lado (Next.js). El updater de Tauri actualiza el **cascarón nativo** (permisos,
plugins, versión de la app), no el HTML de dentro.

> **Un solo binario, tres apps.** El crate `starseed-native` es único; cada
> sistema se compila por separado con su fichero de configuración y su icono.

---

## 2 · Requisitos para construir en local

> ⚠️ Este scaffold está escrito a mano y **no se ha compilado aquí** (la red del
> entorno es limitada). Los comandos de abajo son para el dueño o el CI.

1. **Rust** ≥ 1.77.2 (`rustup`).
2. **Tauri CLI 2.x**:
   ```bash
   cargo install tauri-cli --version "^2" --locked
   ```
3. **Dependencias de sistema** de Tauri según tu SO
   (WebKitGTK/`libappindicator`/`librsvg` en Linux; Xcode CLT en macOS; WebView2
   + Build Tools en Windows). Ver <https://v2.tauri.app/start/prerequisites/>.
4. **Node** (solo para generar iconos con `npx @tauri-apps/cli icon`).

> **No** uses `npm create tauri-app`: eso genera un proyecto nuevo. Aquí ya están
> todos los ficheros; solo hay que compilar con la CLI usando los que se proveen.

---

## 3 · Generar los iconos

Los iconos de cada plataforma se generan desde un PNG **cuadrado** de origen:

```bash
cd native/src-tauri
npx @tauri-apps/cli@latest icon ../icons-src/os.png      # StarSeed OS
npx @tauri-apps/cli@latest icon ../icons-src/nexus.png   # StarSeed Nexus
npx @tauri-apps/cli@latest icon ../icons-src/cafe.png    # StarSeed Café
```

Esto rellena `native/src-tauri/icons/` (`.png`, `.icns`, `.ico`, Android…).
Detalles y cómo sustituir los placeholders de Nexus/Café en
[`src-tauri/icons/README.md`](./src-tauri/icons/README.md).

> El PNG debe ser cuadrado (idealmente 1024×1024). Por eso el origen del OS es
> `starseed-symbol-square.png` (512×512) y **no** `starseed-symbol.png`, que es
> vertical (1000×1497) y el generador rechazaría.

---

## 4 · Construir cada sistema

Desde `native/` (que contiene `src-tauri/`):

```bash
# StarSeed OS — usa la config base tauri.conf.json
cargo tauri build

# StarSeed Nexus — override por JSON Merge Patch
cargo tauri build -c tauri.nexus.conf.json

# StarSeed Café
cargo tauri build -c tauri.cafe.conf.json
```

> Regenera los iconos con el PNG del sistema correspondiente **antes** de cada
> build (el CI ya lo hace por ti; ver §7).

### Qué produce cada SO

| SO       | Artefactos                                                                 |
| -------- | -------------------------------------------------------------------------- |
| macOS    | `.app` + `.dmg` (y `.app.tar.gz` + `.sig` para el updater)                  |
| Windows  | `.msi` + `.exe` (NSIS) (y `.zip`/`.sig` para el updater)                    |
| Linux    | `.deb` + `.AppImage` + `.rpm` (y `.sig` para el updater)                    |
| Android  | `.apk` / `.aab` vía `cargo tauri android build` (ver §8)                    |

Salen en `native/src-tauri/target/release/bundle/`.

---

## 5 · Cómo carga la web desplegada (URL remota en Tauri 2)

En `tauri.conf.json`, la ventana principal define su `url` con la web desplegada:

```json
"app": {
  "withGlobalTauri": true,
  "windows": [
    { "label": "main", "title": "StarSeed OS", "url": "https://starseed-os.vercel.app" }
  ]
}
```

Tauri 2 acepta una **URL externa** en `app.windows[].url`: al no haber assets
embebidos, la app carga esa web directamente. `withGlobalTauri: true` expone
`window.__TAURI__` para que la web (Aurora) invoque los comandos nativos.

**Clave de seguridad:** una web **remota** solo puede invocar comandos de Tauri
si su origen está declarado en la capability. Por eso
[`capabilities/default.json`](./src-tauri/capabilities/default.json) incluye:

```json
"remote": {
  "urls": [
    "https://starseed-os.vercel.app",
    "https://starseed-nexus.vercel.app",
    "https://starseed-cafe.vercel.app"
  ]
}
```

Sin ese bloque `remote.urls`, `window.__TAURI__.core.invoke(...)` desde la web
desplegada sería rechazado. (`build.frontendDist`/`devUrl` también apuntan a la
misma URL para que el CLI no busque un `dist/` local.)

---

## 6 · Updater incremental in-app (cómo funciona)

1. En `tauri.conf.json` → `bundle.createUpdaterArtifacts: true` hace que el
   bundler genere los artefactos de actualización y sus firmas `.sig`.
2. `plugins.updater.endpoints` apunta al `latest.json` del repo:
   `https://github.com/StarSeedSystem/starseed-system/releases/latest/download/latest.json`.
   El CI (tauri-action) genera ese `latest.json` con la versión, las URLs por
   plataforma y las firmas.
3. `plugins.updater.pubkey` lleva la **clave pública** del updater — YA es la
   real (id `EF709C4D9C391CE5`, generada con `cargo tauri signer generate`;
   ver §11), la misma que usa el proyecto retirado `src-tauri/` de la raíz.
   Tauri valida la firma antes de instalar; sin firma válida, **no** actualiza.
4. Automática e inteligente (desde la 0.2.0): SOLO en el sistema OS
   (`app.starseed.os`) y SOLO escritorio, `src/lib.rs` arranca en `run()` un
   hilo en segundo plano que espera ~25s (para no competir con la primera
   carga de la web) y comprueba actualizaciones cada 6h. Si hay una nueva,
   descarga + instala (`update.download_and_install(...)`, reinstalación
   completa del bundle) emitiendo progreso a la web por el evento
   `starseed://actualizacion` (fases `buscando` → `descargando` →
   `instalando` → `lista`/`al-dia`/`error`). Si la ventana principal NO está
   visible/enfocada, reinicia sola (`app.restart()`); si el usuario la está
   mirando, deja la instalación lista y espera a que pulse «Reiniciar ahora»
   (comando `reiniciar_para_actualizar`). El comando **`check_update`**
   reutiliza EXACTAMENTE el mismo camino de código (mismo botón manual = mismo
   ciclo automático) y **`estado_actualizacion`** devuelve el último estado
   conocido. La web escucha todo esto en
   `src/components/pwa/actualizacion-nativa.tsx` (repo del OS). Nexus/Café NO
   tienen este canal todavía (ver el comentario en `run()`).

En Windows el modo de instalación es `passive` (barra de progreso, sin
interacción). En móvil (Android) NO hay updater de Tauri: la web compara la
versión instalada contra el último Release de GitHub y enlaza al .apk cuando
hay uno más nuevo (mismo componente `actualizacion-nativa.tsx`). iOS no tiene
ningún canal de actualización (el .ipa es sin firmar, solo para pruebas).

---

## 7 · Control por terminal (el "compañero profundo")

El comando Rust **`run_terminal(cmd)`** (en `src/main.rs`) ejecuta un comando de
shell vía el plugin `shell` y devuelve `stdout`/`stderr`/código:

- En Unix ejecuta `sh -c "<cmd>"`; en Windows `cmd /C "<cmd>"`.
- El **scope** está declarado en `capabilities/default.json`
  (`shell:allow-execute` con validadores para `sh`, `bash`, `cmd`, `powershell`).
- Aurora lo invoca así:
  ```js
  const r = await window.__TAURI__.core.invoke('run_terminal', { cmd: 'ls -la ~' });
  console.log(r.stdout);
  ```

**Honestidad radical:** esto es, literalmente, **darle una terminal a la IA** con
los permisos del usuario. Es potente y peligroso. Solo funciona en la **app
nativa instalada** y porque el usuario, al instalarla y ejecutarla, concede esa
capacidad (la cadena capability → scope de shell la habilita). Un navegador, por
diseño de seguridad, **no puede** abrir una terminal ni controlar el sistema: por
eso existe este cuerpo nativo. Además, el dispositivo se registra como **neurona
con permiso `agent`** en la red personal (ver `src/lib/neurons/neurons.ts` en el
repo del OS).

Otros comandos expuestos: **`device_info()`** (SO, arquitectura, versión,
hostname), y los de actualización del §6 (`check_update`,
`reiniciar_para_actualizar`, `estado_actualizacion`). Los plugins `fs`,
`dialog`, `notification`, `os`, `process` y `autostart` quedan disponibles
para la web según la capability.

---

## 8 · Android (.apk / .aab)

```bash
cd native
cargo tauri android init          # una sola vez (crea gen/android/)
cargo tauri android build         # StarSeed OS
cargo tauri android build -c tauri.nexus.conf.json   # Nexus
cargo tauri android build -c tauri.cafe.conf.json    # Café
```

El workflow de CI incluye un job de Android **comentado** listo para habilitar
cuando se configure la firma de Google Play (secretos `ANDROID_*`).
iOS es posible con `cargo tauri ios build` pero requiere macOS + cuenta Apple.

---

## 9 · Qué necesita el dueño para publicar binarios **firmados**

Los binarios **sin firmar** que salen del CI **sirven para probar** (macOS: clic
derecho → Abrir; Windows: aviso de SmartScreen). Para **distribuir** sin fricción
hacen falta secretos de firma en GitHub (todos **opcionales**; el build funciona
sin ellos). Los huecos ya están puestos en `.github/workflows/native-build.yml`:

1. **Clave del updater** — YA está puesta (id `EF709C4D9C391CE5`, ver §11);
   solo hace falta si el dueño quiere ROTARLA:
   ```bash
   cargo tauri signer generate -w ~/.tauri/starseed.key
   ```
   - La **pública** → sustituye `plugins.updater.pubkey` en `tauri.conf.json`.
   - La **privada** + su contraseña → secretos
     `TAURI_SIGNING_PRIVATE_KEY` y `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
     (ya configurados en GitHub — es el secreto que firma los Releases de CI).
     ⚠️ Si se pierde la privada, no se pueden publicar más updates a los ya
     instalados; y si se rota, TODAS las apps instaladas dejan de validar
     Releases anteriores (hay que hacerlo solo si la privada se compromete).

2. **macOS (Developer ID + notarización)** — para que no aparezca "app dañada":
   `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`,
   `APPLE_ID`, `APPLE_PASSWORD` (app-specific password), `APPLE_TEAM_ID`.
   Requiere cuenta **Apple Developer** de pago.

3. **Windows (Authenticode)** — para evitar/rebajar SmartScreen:
   `WINDOWS_CERTIFICATE` (PFX en base64) + `WINDOWS_CERTIFICATE_PASSWORD`.
   Requiere un certificado de firma de código (idealmente EV).

4. **Android (Play Store)**: keystore + `ANDROID_*` (job comentado en el CI).

Mientras no existan estos secretos, el CI genera binarios de prueba y publica un
Release en **borrador** (`releaseDraft: true`) con los instaladores y el
`latest.json` del updater.

---

## 10 · Estructura de ficheros

```
native/
├── README.md                          ← este archivo
├── icons-src/                         ← PNG cuadrados de origen (fuente de los iconos)
│   ├── os.png                         (real)
│   ├── nexus.png                      (placeholder → logo-detallado.png del Nexus)
│   └── cafe.png                       (placeholder → StarSeed-Café-detallado.png del Café)
└── src-tauri/
    ├── Cargo.toml                     ← deps Tauri 2 + plugins + serde
    ├── build.rs                       ← tauri_build::build()
    ├── tauri.conf.json                ← config BASE (StarSeed OS)
    ├── tauri.nexus.conf.json          ← override Nexus (-c)
    ├── tauri.cafe.conf.json           ← override Café (-c)
    ├── capabilities/
    │   ├── default.json               ← permisos amplios + remote.urls + scope de shell
    │   └── desktop.json               ← autostart (solo escritorio)
    ├── icons/
    │   └── README.md                  ← cómo se generan (carpeta autogenerada)
    └── src/
        ├── main.rs                    ← binario de escritorio (llama a lib.rs::run())
        └── lib.rs                     ← TODA la lógica: plugins, comandos
                                          (run_terminal / check_update /
                                          reiniciar_para_actualizar /
                                          estado_actualizacion / device_info) y
                                          la vigilancia de actualización en 2º plano
```

Y el workflow: `.github/workflows/native-build.yml`.

---

## 11 · Cómo publicar una release

1. **Sube la versión en los CUATRO sitios** (deben coincidir siempre):
   `native/src-tauri/tauri.conf.json` (`version`), `native/src-tauri/Cargo.toml`
   (`[package].version`), `package.json` (raíz del repo del OS) y, si existe,
   `native/src-tauri/Cargo.lock` (entrada del paquete `starseed-native`). La web
   tiene su PROPIA versión independiente (`OS_VERSION`/`OS_FECHA` en
   `src/lib/version/os-release.ts`, formato `AAAA.MM.DD`) — no hace falta
   tocarla para una release nativa que no cambie contenido web, pero si las dos
   cambian a la vez, `NATIVE_VERSION`/`NATIVE_TAG` de ese mismo archivo deben
   coincidir con lo que subas aquí (ahí viven también las URLs de descarga
   directa que usan la Biblioteca y `/instalar` del repo del OS).
2. **Etiqueta y empuja**: `git tag vX.Y.Z && git push origin vX.Y.Z`. Esto
   dispara `native-build.yml`, que compila OS · Nexus · Café para
   macOS/Windows/Linux (+ Android) y sube todo a un Release en **borrador**
   (`releaseDraft: true`) con nombre y cuerpo mencionando `vX.Y.Z`.
3. **Revisa y publica a mano**: el dueño abre el Release en borrador en
   GitHub, comprueba que los assets están todos (incluido `latest.json`, que
   SOLO sube el job del sistema OS) y lo publica cuando esté conforme. Nada se
   distribuye automáticamente sin este paso manual.
4. Los nombres de archivo APK/IPA se leen de `tauri.conf.json` en tiempo de
   CI (`node -p "require('./tauri.conf.json').version"`), nunca hardcodeados
   — así nunca vuelven a quedarse en una versión vieja.

### Canal de actualización por superficie

| Superficie                         | Cómo se entera de que hay algo nuevo                                                   |
| ----------------------------------- | ---------------------------------------------------------------------------------------- |
| App nativa de **escritorio** (OS)  | Sola: comprueba cada 6h (+ al arrancar) vía `latest.json`, descarga, instala y reinicia (ver §6). |
| App nativa **Android** (OS)        | La web compara versión instalada vs. último Release de GitHub (caché 6h) y enlaza al `.apk` cuando hay uno más nuevo. Sin instalación automática (Android no lo permite fuera de tiendas). |
| App nativa **iOS**                 | Sin canal: el `.ipa` es sin firmar (solo pruebas, re-firmar con AltStore/Sideloadly).      |
| **Web** (navegador / PWA)          | Cada `git push` a `main` → Vercel despliega → `register-sw.tsx` detecta el build nuevo (SW + `/version.json`) y recarga sola. Nada que ver con Releases de GitHub. |
| Nexus / Café (shell nativo)        | Aún sin canal de updater propio (no declaran `plugins.updater`); su contenido web sí se actualiza como cualquier despliegue. |

### Clave de firma del updater

Id de la clave minisign en uso: **`EF709C4D9C391CE5`** (pubkey en
`native/src-tauri/tauri.conf.json → plugins.updater.pubkey`, la misma que
corresponde al secreto `TAURI_SIGNING_PRIVATE_KEY` en GitHub). Es la MISMA
clave que usaba el proyecto retirado `src-tauri/` de la raíz — se reutilizó a
propósito para no tener que regenerar secretos en CI; ver §9 punto 1 para
cómo rotarla si alguna vez hiciera falta.
