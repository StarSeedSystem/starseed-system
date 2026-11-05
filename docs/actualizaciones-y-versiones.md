# Guía de Actualizaciones y Versiones · StarSeed OS

> Centro de Versiones (VER1105N). Contrato: `architecture/centro-versiones-1105.md`.  
> Director de lanzamientos: `scripts/puente/director_lanzamientos.py` (lógica pura en `lanzamientos_logica.py`).  
> Estado en `~/.starseed/produccion/lanzamientos-estado.json`. Panel en MetaGenesis → grupo «Lo que sale» → pastilla «Versiones».

---

## 1. Qué es el Centro de Versiones

Un panel en MetaGenesis que muestra, para cada medio y formato (web, PWA, macOS, Windows, Linux, Android, iOS, canales del actualizador y Librería):

- Versión servida y estado (`al-día`, `generando`, `verificando`, `atascado`, `no-disponible`).
- Enlaces de descarga directa a los archivos de la release de GitHub.
- Un botón por medio para regenerar sus archivos oficiales.
- El lanzamiento en curso: cada paso y cada job de CI en tiempo real.
- Controles para lanzar, pausar, reintentar y activar el modo automático.

---

## 2. Cómo se lanza una versión desde MetaGenesis

### 2.1 Requisitos previos (el director los comprueba solo)

1. **Lista de tareas terminada** (`esperando-lista`):  
   Todas las tareas de `config/lanzamientos.json → colas` están integradas en `main` (su id aparece en `git log origin/main`) o descartadas.

2. **Publicación verificada** (`esperando-publicacion`):  
   `origin/main` = `HEAD` y la autopublicación (`autopublicar.py`) está en fase `publicado` con ese sha (pruebas, CI, Vercel y humo en verde).

3. **Tope diario**: máximo 1 lanzamiento nativo al día (`config/lanzamientos.json → tope_dia`).

### 2.2 Pasos del lanzamiento (máquina de estados, §2 del contrato)

| Fase | Qué hace el director | Qué ves en el panel |
|------|----------------------|---------------------|
| `preparando` | Sube la versión (menor por defecto) en `tauri.conf.json`, `Cargo.toml` y `os-release.ts`; genera notas a partir de las tareas integradas; corre `os-release.test.ts`; hace commit «Lanzamiento vX.Y.Z». | «preparando vX.Y.Z», commit sha, notas. |
| `etiquetando` | `git tag vX.Y.Z <sha>` + `git push origin vX.Y.Z` (solo la etiqueta). Espera a que arranque `native-build.yml`. | «etiquetando», enlace al run de GitHub Actions. |
| `compilando` | Sigue el run job a job (`gh run view --json jobs`). Cada job = un paso visible con medio, estado, duración, enlace. | Tabla de jobs: macOS, Windows, Linux, Android, iOS, canales. |
| `verificando-archivos` | Comprueba que cada archivo esperado existe en la release con tamaño mínimo y su `.sig`; valida JSON de canales (versión, firma, URL a archivo existente). | Por medio: `al-día` / `atascado` / `no-disponible`, lista de faltantes/pequeños. |
| `publicando` | `gh release edit vX.Y.Z --draft=false --latest`. | «publicando». |
| `verificando-medios` | Cada URL `releases/latest/download/…` responde 200; canales sirven la versión nueva. | «verificando-medios» → `lanzado` + aviso en Chat Director con versión y enlaces. |

### 2.3 Botones del panel (API `POST /api/mando/lanzamientos`)

| Botón | Acción (`accion`) | Cuándo está activo |
|-------|-------------------|---------------------|
| **Lanzar versión** | `lanzar` | En `esperando-lista`, `lanzado` o sin estado. Inicia el flujo saltándose el interruptor automático. |
| **Pausar / Reanudar** | `pausar` / `reanudar` | En cualquier fase salvo `lanzado`. Congela el director; `pausado: true` en el estado. |
| **Reintentar paso** | `reintentar` | Solo en `atascado`. Vuelve a la fase guardada en `volver_a` (normalmente `esperando-publicacion` o `etiquetando`). |
| **Generar/Actualizar (por medio)** | Petición `regenerar` de ese medio | Siempre. Lanza `workflow_dispatch` a `native-build.yml` con `plataformas` y `etiqueta` del lanzamiento vigente. Para `web`: dispara la autopublicación. |
| **Interruptor «Lanzar sola al terminar cada lista»** | Cambia `auto` en `~/.starseed/produccion/lanzamientos.json` | Persistente. Si está ON y se cumplen los requisitos, el director lanza solo. |

---

## 3. Qué ve cada medio instalado y cómo se actualiza (§5 del contrato)

### 3.1 Fuente única de versiones: `GET /api/os/versiones`

- Pública, caché 10 min, 1 consulta a GitHub por petición.
- Devuelve: versiones con fecha, notas, archivos por sistema (tamaño + enlace), requisitos y permisos de `config/permisos-por-so.json`.

### 3.2 Comprobación de actualización (`comprobarActualizacion(medio)` — función pura)

| Medio | Qué compara |
|-------|-------------|
| **web / PWA** | Sha servido en `/version.json` vs. sha instalado. |
| **Escritorio (macOS/Windows/Linux)** | `NATIVE_VERSION` (Tauri updater) vs. versión publicada. |
| **Android** | `versionCode`/`versionName` nativa vs. publicada. |
| **iOS** | Siempre PWA (no hay app nativa firmada hoy). |

### 3.3 Aviso al usuario (una vez por versión nueva)

1. **Ventana emergente** (modal) con versión instalada, nueva, notas y botón «Actualizar».
2. **Notificación `update-app`** en el centro de notificaciones del OS.
3. **Botón en la ficha «StarSeed OS» de la Librería** (historial de versiones visible).

### 3.4 Actualización (opcional y automática, sin perder datos)

| Medio | Mecanismo | Datos preservados |
|-------|-----------|-------------------|
| **Escritorio** | Updater de Tauri (`check` → `download_and_install` → `restart`). Firma propia (sin notarización Apple / certificado Windows: primera vez «clic derecho → Abrir» / SmartScreen). | La carpeta de datos de la app no se toca. |
| **Android** | Descarga `.apk` de la misma firma → abre instalador del sistema. | Android conserva datos al actualizar con la misma firma. |
| **Web / PWA** | Service Worker registra nueva versión → recarga controlada. | `localStorage`, `IndexedDB`, cachés siguen intactos. |
| **iOS** | Usa la PWA (añadir a pantalla de inicio). | Igual que web/PWA. |

---

## 4. Permisos que pide cada sistema (§6 del contrato)

**Regla**: ninguna app se da permisos a sí misma; cada sistema los pide a la persona.  
Fuente única: `config/permisos-por-so.json` (declara TODO lo que el OS usa en cada sistema).

| Sistema | Qué se declara | Cuándo se pide |
|---------|----------------|----------------|
| **Android** | `AndroidManifest.xml` completo (permisos, servicios, receivers). | En la bienvenida o al primer uso de cada capacidad; estado visible en Ajustes → Apps → StarSeed OS → Permisos. |
| **macOS** | `Info.plist` con *usage description strings* (`NSCameraUsageDescription`, `NSMicrophoneUsageDescription`, etc.) + capabilities de Tauri (`tauri.conf.json → macOSPrivateApi`, `allowlist`). | Primera vez que la funcionalidad lo requiere; diálogo nativo de macOS. Sin notarización: «clic derecho → Abrir» la primera vez. |
| **Windows** | Capabilities de Tauri (`allowlist`) + manifiesto de la app (MSIX/MSI). | SmartScreen la primera vez; permisos de runtime (micrófono, cámara, ubicación) vía diálogos de Windows. |
| **Linux** | Capabilities de Tauri + `.desktop` + polkit si hace falta. | Según el portal de permisos del escritorio (GTK/KDE); Tauri usa `xdg-desktop-portal`. |
| **Web / PWA** | Permisos de la API web (Notifications, Camera, Microphone, Clipboard, Idle Detection, etc.). | Diálogo del navegador al primer uso; estado visible en `chrome://settings/content` / `about:preferences#privacy`. |
| **iOS (PWA)** | Permisos web estándar (Notifications, Camera, Microphone, etc.). | Diálogo de Safari al primer uso; gestión en Ajustes → Safari → Permisos. |

---

## 5. Qué pasa si algo falla (autorreparación, §3 del contrato)

El director clasifica el fallo del job con `clasificar_fallo(log)` y actúa:

| Clase | Causa típica | Acción del director |
|-------|--------------|---------------------|
| **reintentar** | Red, timeout, rate limit, runner caído, 502/503/504. | `gh run rerun <id> --failed` (máx. 2 reintentos por job). |
| **sin-firma** | Falta secreto de firma (keystore, `TAURI_SIGNING_PRIVATE_KEY`). | El medio queda **SIN FIRMAR** y se avisa (no bloquea la release). |
| **codigo** | Error de compilación/pruebas (`error[E...]`, `TSxxxx:`, `SyntaxError`, `cannot find module`). | Crea tarea al enjambre (`LZ<version>A`) con el log, job y archivos afectados; el lanzamiento espera a que se integre y vuelve a `preparando` con parche (`X.Y.Z+1`). |
| **credencial** | Keystore corrupto, contraseña incorrecta, permisos de GitHub, recurso no accesible. | **Aviso a Alex** (nunca se toca una credencial). El lanzamiento queda `atascado`. |

**Topes duros** (configurables en `config/lanzamientos.json`):
- 1 lanzamiento nativo al día (`tope_dia`).
- 2 reintentos por job (`reintentos_job`).
- CI ≤ 75 min (`ci_tope_min`).
- Nunca versión mayor (eso sigue siendo de Alex).

---

## 6. Lo que sigue siendo de Alex (§7 del contrato)

- **Cuenta de Apple Developer** (iOS y notarización de macOS) y **certificado de Windows**: son pagos y requieren acción manual.
- **Versiones mayores** (cambio del primer dígito): decisión de Alex.
- **Credenciales y secretos**: el director nunca los toca ni rota.
- Alex autorizó (2026-11-05) que el director etiquete y publique **versiones menores y parches** nativos cuando la lista esté terminada, publicada y verificada (este contrato, §2).

---

## 7. Referencia rápida para desarrollo

### Archivos de versión (fuente única)
- `native/src-tauri/tauri.conf.json` → `"version": "X.Y.Z"`
- `native/src-tauri/Cargo.toml` → `version = "X.Y.Z"`
- `src/lib/version/os-release.ts` → `NATIVE_VERSION`, `OS_VERSION` (fecha `YYYY.MM.DD`), `OS_FECHA`, `OS_NOTAS`

### Prueba de versión
```bash
npx vitest run src/lib/__tests__/os-release.test.ts
```

### Configuración del director
- `config/lanzamientos.json` (ajustes base).
- `~/.starseed/produccion/lanzamientos.json` (interruptor `auto` que cambia el panel).
- `~/.starseed/produccion/lanzamientos-estado.json` (estado vivo, lo lee el panel).
- `~/.starseed/produccion/lanzamientos-peticion.json` (cola de peticiones del panel).

### Logs y depuración
```bash
# Una pasada del director (ver salida en consola)
python3 scripts/puente/director_lanzamientos.py

# Estado en JSON (lo que consume el panel)
python3 scripts/puente/director_lanzamientos.py --json
```

### Probar la lógica pura (tests)
```bash
python3 -m pytest scripts/puente/test_lanzamientos_logica.py -v
# o si usa vitest para la parte TS:
npx vitest run src/lib/__tests__/os-release.test.ts
```

---

## 8. Glosario de estados del panel

| Estado | Qué significa |
|--------|---------------|
| `al-día` | El medio tiene todos sus archivos esperados con tamaño correcto y firmas. |
| `generando` | Se ha pedido regenerar ese medio (`workflow_dispatch` disparado); el run está en cola/en curso. |
| `verificando` | El director está comprobando archivos o canales de ese medio. |
| `atascado` | Falta algún archivo, pesa menos del mínimo o el canal tiene problemas (versión, firma, URL). Detalle en la fila. |
| `no-disponible` | iOS: no hay cuenta de Apple Developer; el `.ipa` sale vacío (best-effort). No bloquea. |

---

*Documento generado a partir de `architecture/centro-versiones-1105.md`, `scripts/puente/director_lanzamientos.py`, `scripts/puente/lanzamientos_logica.py` y `config/lanzamientos.json`. Última actualización: 2026-11-05.*