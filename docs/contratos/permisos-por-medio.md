# Matriz de permisos por medio — StarSeed OS

**Versión:** 1.0 (2026-11-19) · **Contrato vivo:** se actualiza con cada medio nuevo que el OS soporte.

Este documento define, para cada **permiso** que el OS necesita, en cada **medio** (plataforma + forma de ejecutar), cómo se detecta su estado, cómo se pide, si hay enlace directo a Ajustes, y cómo distinguir «falta (nunca se preguntó)» de «denegado a mano».

> **Regla de oro (PRM1119):** al instalar y al abrir, se pide lo que falte y sea útil; si la persona lo denegó a mano, no se vuelve a pedir solo, pero se muestra en la lista con «Abrir ajustes». **Nunca se concede nada por la persona.**

---

## 1. Catálogo de permisos (ids canónicos)

| Id | Nombre visible | Qué habilita en el OS |
|---|---|---|
| `microfono` | Micrófono | Llamadas, comandos de voz, visión de Astraura |
| `camara` | Cámara | Videollamadas, visión de Astraura |
| `pantalla` | Pantalla / Grabación de pantalla | Compartir pantalla en llamadas, Astraura ve la pantalla, prestar ventana |
| `ubicacion` | Ubicación | Mapa del Hub, nombres de Wi-Fi para la malla, geolocalización nativa |
| `notificaciones` | Notificaciones | Avisos del sistema, mensajes, alertas de la malla |
| `almacenamiento` | Almacenamiento persistente | Guardar datos offline, IndexedDB, Cache API |
| `movimiento` | Movimiento y orientación | Sensores para XR, brújula, detector de agitación |
| `archivos` | Archivos y carpetas | Selector nativo de carpetas, carpetas vinculadas, NAS |
| `bluetooth` | Bluetooth | Antenas de la malla, Meshtastic, dispositivos cercanos |
| `red-local` | Red local | Descubrimiento mDNS, sincronización P2P, servidor local |
| `accesibilidad` | Accesibilidad / Control del sistema | Prestar ventana, Astraura actúa, control remoto entre neuronas |
| `monitor-entrada` | Monitorización de entrada | Pausar control remoto por actividad local, teclas globales |
| `automatizacion` | Automatización (app por app) | Astraura maneja otras apps (macOS) |
| `disco-completo` | Acceso total al disco | Leer/escribir cualquier archivo sin selector |
| `carpetas` | Archivos y carpetas (selector) | Carpetas específicas (Escritorio, Documentos, volúmenes) |
| `arranque` | Abrir al iniciar sesión | Segundo plano, siempre disponible |
| `superposicion` | Mostrar sobre otras apps (Android) | Indicador de control remoto, ventana siempre encima |
| `no-molestar` | Acceso a No molestar (Android) | Silenciar notificaciones del sistema durante control |
| `escribir-ajustes` | Modificar ajustes del sistema (Android) | Brillo, Wi-Fi, Bluetooth, modo oscuro desde el Centro de Control |
| `todos-archivos` | Acceso a todos los archivos (Android) | Gestión completa de almacenamiento compartido |
| `instalar` | Instalar apps desconocidas (Android) | Instalar APKs desde la app (actualizaciones, Meshtastic) |
| `bateria` | Exención de optimización de batería (Android) | Segundo plano fiable, antenas siempre activas |
| `llamadas` | Notificaciones a pantalla completa (Android 14+) | Llamadas entrantes con pantalla completa |
| `capacidades` | Capacidades del aparato | CPU, GPU, memoria, disco, batería, temperatura (solo lectura) |

---

## 2. Matriz permiso × medio

### 2.1 Navegador web (Chrome, Edge, Firefox, Safari — escritorio y móvil)

| Permiso | Cómo se detecta | Cómo se pide | Enlace a Ajustes | «Falta» vs «Denegado a mano» |
|---|---|---|---|---|
| `microfono` | `navigator.permissions.query({name:"microphone"})` → `state` | `navigator.mediaDevices.getUserMedia({audio:true})` | Chrome/Edge: `chrome://settings/content/microphone` · Firefox: `about:preferences#privacy` · Safari: Ajustes del sistema › Privacidad › Micrófono | `prompt` = falta · `denied` = denegado a mano |
| `camara` | `navigator.permissions.query({name:"camera"})` → `state` | `navigator.mediaDevices.getUserMedia({video:true})` | Análogos a micrófono | `prompt` = falta · `denied` = denegado a mano |
| `pantalla` | **No consultable** (`permissions.query` no expone `display-capture`) | `navigator.mediaDevices.getDisplayMedia({video:true})` | Chrome/Edge: `chrome://settings/content/screen-capture` · Firefox: `about:preferences#privacy` · Safari: no hay API | Solo al usar: si `getDisplayMedia` lanza `NotAllowedError` → denegado; si no se llamó nunca → falta |
| `ubicacion` | `navigator.permissions.query({name:"geolocation"})` → `state` | `navigator.geolocation.getCurrentPosition()` | Chrome/Edge: `chrome://settings/content/location` · Firefox: `about:preferences#privacy` · Safari: Ajustes del sistema › Privacidad › Localización | `prompt` = falta · `denied` = denegado a mano |
| `notificaciones` | `Notification.permission` (`"default" \| "granted" \| "denied"`) | `Notification.requestPermission()` | Chrome/Edge: `chrome://settings/content/notifications` · Firefox: `about:preferences#privacy` · Safari: Ajustes del sistema › Notificaciones | `"default"` = falta · `"denied"` = denegado a mano |
| `almacenamiento` | `navigator.storage.persisted()` → `true/false` | `navigator.storage.persist()` | No hay pantalla dedicada; se gestiona en «Datos de sitios» | `false` + nunca se llamó a `persist()` = falta · `false` tras `persist()` = denegado |
| `movimiento` | `DeviceMotionEvent.requestPermission` (iOS/Safari) o `permissions.query({name:"accelerometer"})` | `DeviceMotionEvent.requestPermission()` (iOS) o `getUserMedia` con sensores | iOS: Ajustes › Safari › Movimiento y orientación | iOS: `prompt` = falta · `denied` = denegado; resto: `prompt`/`denied` igual |
| `archivos` | `navigator.permissions.query({name:"file-system"})` o `showDirectoryPicker` lanza error | `window.showDirectoryPicker({mode:"readwrite"})` | Chrome/Edge: `chrome://settings/content/fileSystem` | `prompt` = falta · `denied` = denegado a mano |
| `bluetooth` | **No en web estándar** (Web Bluetooth solo en origins seguros y con gesto) | `navigator.bluetooth.requestDevice({filters:[...]})` | Chrome/Edge: `chrome://settings/content/bluetooth` | Solo al usar: error `NotAllowedError` = denegado |
| `red-local` | **No consultable** (mDNS, fetch a localhost) | Se pide implícito al hacer fetch/WebSocket a IP local | Chrome/Edge: `chrome://settings/content/localNetwork` (macOS 15+) | Firewall/privacidad: error de red = denegado por sistema |
| `capacidades` | `navigator.deviceMemory`, `navigator.hardwareConcurrency`, Battery API, Thermal API | **No se pide** (solo lectura) | — | — |

> **Nota Safari/iOS:** `permissions.query` no expone `microphone`, `camera`, `geolocation` en Safari ≤ 17. La detección se hace intentando el acceso y mapeando el error.

---

### 2.2 App nativa Tauri (macOS 13–15, Windows 10/11, Linux X11/Wayland, Android 12–16)

La app nativa usa **tres vías** según el permiso:

| Vía | Permisos | Qué hace la app |
|---|---|---|
| **Aviso del sistema** | `microfono`, `camara`, `ubicacion`, `notificaciones`, `bluetooth`, `red-local` (macOS 15) | La app invoca la API nativa; el SO muestra su diálogo. |
| **Aviso → panel** (macOS) | `pantalla`, `accesibilidad`, `monitor-entrada` | Primera vez: API nativa muestra aviso con botón «Abrir Ajustes». Después: solo panel. |
| **Solo panel** | `disco-completo`, `automatizacion`, `carpetas`, `arranque`, `superposicion`, `no-molestar`, `escribir-ajustes`, `todos-archivos`, `instalar`, `bateria`, `llamadas` | La app abre la pantalla exacta de Ajustes (`permisos_sistema_abrir`). |

#### macOS (13 Ventura – 15 Sequoia)

| Permiso | Detección (lectura) | Petición | Enlace directo (panel) | «Falta» vs «Denegado a mano» |
|---|---|---|---|---|
| `microfono` | `AVCaptureDevice.authorizationStatusForMediaType(.audio)` | `AVCaptureDevice.requestAccess(for:.audio)` | `x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone` | `notDetermined` = falta · `denied` = denegado a mano |
| `camara` | `AVCaptureDevice.authorizationStatusForMediaType(.video)` | `AVCaptureDevice.requestAccess(for:.video)` | `...Privacy_Camera` | Igual que micrófono |
| `pantalla` | `CGPreflightScreenCaptureAccess()` (bool) | `CGRequestScreenCaptureAccess()` (aviso 1 vez) | `...Privacy_ScreenCapture` | `false` + nunca se pidió = falta · `false` tras pedir = denegado a mano |
| `accesibilidad` | `AXIsProcessTrusted()` (bool, vivo) | `AXIsProcessTrustedWithOptions({kAXTrustedCheckOptionPrompt:true})` | `...Privacy_Accessibility` | **macOS no distingue**: `false` = «no concedido» (falta o denegado). La app lo trata como «falta» la primera vez y «denegado a mano» si ya pidió y sigue `false`. |
| `monitor-entrada` | `IOHIDCheckAccess(kIOHIDRequestTypeListenEvent)` → 0/1/2 | `IOHIDRequestAccess(kIOHIDRequestTypeListenEvent)` | `...Privacy_ListenEvent` | `2` = sin preguntar (falta) · `1` = denegado a mano |
| `ubicacion` | `CLLocationManager.authorizationStatus()` | `requestWhenInUseAuthorization()` | `...Privacy_LocationServices` | `notDetermined` = falta · `denied` = denegado a mano |
| `bluetooth` | `CBManager.authorization` | CoreBluetooth pide al arrancar | `...Privacy_Bluetooth` | `notDetermined` = falta · `denied` = denegado |
| `red-local` | **No hay API pública** (se deduce si malla local responde) | `NSLocalNetworkUsageDescription` al primer multicast | `...Privacy_LocalNetwork` (macOS 15+) | No se puede leer → se asume «falta» si la malla no responde |
| `notificaciones` | Plugin notificaciones: `isPermissionGranted()` | Plugin pide al sistema | `x-apple.systempreferences:com.apple.preference.notifications` | Parcial: no distingue `denied` de `notDetermined` → se trata como «falta» si no `granted` |
| `disco-completo` | **No hay API pública** (leer TCC.db prohibido §1) | **Solo panel** | `...Privacy_AllFiles` | No se puede leer → siempre «desconocido»; botón «Abrir ajustes» |
| `automatizacion` | `AEDeterminePermissionToAutomateTarget` (por app destino) | Por uso: primer Apple Event pregunta | `...Privacy_Automation` | Solo se sabe al usarla → «desconocido» hasta entonces |
| `carpetas` | **No hay API pública** | Selector nativo `NSOpenPanel` | `...Privacy_FilesAndFolders` | No se lee → «desconocido» |
| `arranque` | `fondo_estado.arranque_con_sistema` (plugin autostart) | Plugin activa LaunchAgent | `x-apple.systempreferences:com.apple.LoginItems-Settings.extension` | `true/false` legible |
| `capacidades` | `recursos_ia_detectar`, `NSProcessInfo.thermalState` | **No se pide** | — | — |

#### Windows 10/11 (escritorio sin empaquetar)

| Permiso | Detección | Petición | Enlace directo (ms-settings:) | «Falta» vs «Denegado a mano» |
|---|---|---|---|---|
| `microfono` | **No legible** (solo intentándolo) | Por uso: `getUserMedia` | `privacy-microphone` | No se lee → se pide al usar; error = denegado por usuario |
| `camara` | **No legible** | Por uso: `getUserMedia` | `privacy-webcam` | Igual que micrófono |
| `ubicacion` | **No legible** (desde 24H2 apps de escritorio) | Por uso: API WLAN / geolocation del navegador | `privacy-location` | No se lee → se pide al usar |
| `notificaciones` | **No legible** (activadas por defecto) | **No se pide** (activas por defecto) | `notifications` | — |
| `pantalla` | **No se pide** (Graphics Capture borde amarillo) | **No se pide** | — | — |
| `accesibilidad` | **No se pide** (SendInput funciona salvo UIPI) | **No se pide** | — | — |
| `bluetooth` | **No se pide** (WinRT mira «Radios») | **No se pide** | `bluetooth` | — |
| `red-local` | Firewall pregunta la 1ª vez | Por uso: escuchar puerto | **Sin enlace** (Firewall lo abre) | Firewall = denegado por sistema |
| `arranque` | Autostart en Registro/Inicio | App lo activa | `startupapps` | Legible |
| `capacidades` | `DeviceInfo`, `PowerManager`, WMI | **No se pide** | — | — |

#### Linux (X11)

| Permiso | Detección | Petición | Enlace | «Falta» vs «Denegado a mano» |
|---|---|---|---|---|
| `pantalla` | **No se pide** (X11 sin aislamiento) | **No se pide** | — | — |
| `accesibilidad` | **No se pide** (XTest / enigo) | **No se pide** | — | — |
| `bluetooth` | BlueZ por D-Bus (polkit si empareja) | **No se pide** | — | — |
| `microfono` / `camara` | WebKitGTK decide por origen (`permisos_medios.rs`) | WebKitGTK pregunta | **Sin enlace** (cada escritorio pone la suya) | WebKitGTK gestiona; app no lee estado |
| `notificaciones` | **No se pide** | **No se pide** | — | — |
| `arranque` | `.desktop` en `~/.config/autostart` | App lo crea | **Sin enlace** | Archivo existe = concedido |
| `capacidades` | `id -nG`, `/dev/uinput`, `systemctl`, `gst-inspect` | `preparar-linux.sh` con `pkexec` (diálogo root = consentimiento) | **Sin enlace** | `evaluar_linux` devuelve `pendiente` = falta, `preparado` = listo |

#### Linux (Wayland)

| Permiso | Detección | Petición | Enlace | «Falta» vs «Denegado a mano» |
|---|---|---|---|---|
| `pantalla` | Portal `org.freedesktop.portal.ScreenCast` | Portal pregunta cada sesión (restore token) | **Aviso del sistema** | Portal gestiona; `denied` = denegado a mano |
| `accesibilidad` | Portal `RemoteDesktop` / libei experimental | Portal pregunta cada sesión | **Aviso del sistema** | Portal gestiona |
| `microfono` / `camara` | WebKitGTK + PipeWire / portal Camera (Flatpak) | WebKitGTK / portal | **Sin enlace** | WebKitGTK / portal gestiona |
| `bluetooth`, `red-local`, `notificaciones`, `arranque`, `capacidades` | Igual que X11 | Igual que X11 | Igual que X11 | Igual que X11 |

#### Android 12–16

| Permiso | Detección (`servicio.json`) | Petición | Enlace (nivel) | «Falta» vs «Denegado a mano» |
|---|---|---|---|---|
| `microfono` | `microfono: true/false` | `permiso:microfono` → runtime | ficha de la app | `false` + nunca se pidió = falta · `false` tras pedir = denegado (2 negativas = ya no pregunta) |
| `camara` | `camara: true/false` | `permiso:camara` → runtime | ficha de la app | Igual que micrófono |
| `ubicacion` | `ubicacion: true/false/null` | `permiso:ubicacion` → runtime (`ubicacion_ahora`) | ficha de la app | `null` = no medido · `false` tras pedir = denegado |
| `notificaciones` | `notificaciones: true/false` | `permiso:notificaciones` (13+) | **directo** `ACTION_APP_NOTIFICATION_SETTINGS` | `false` + nunca se pidió = falta · `false` tras pedir = denegado |
| `bluetooth` / `cercanos` | `BLUETOOTH_SCAN/CONNECT/ADVERTISE` + `NEARBY_WIFI_DEVICES` (13+) | `permiso:cercanos` (runtime) | ficha de la app › Permisos › Dispositivos cercanos | Igual que micrófono |
| `pantalla` | **No legible antes de pedir** | `createScreenCaptureIntent()` → confirmación CADA sesión | **Aviso del sistema** | Solo al usar; token de 1 uso (14+) |
| `accesibilidad` | `Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES` | **Solo panel** `ACTION_ACCESSIBILITY_SETTINGS` (+ ajustes restringidos 13+) | **lista** (intenta ficha del servicio) | `false` = no activado (falta o denegado); app no distingue |
| `superposicion` | `Settings.canDrawOverlays()` | **Solo panel** `ACTION_MANAGE_OVERLAY_PERMISSION` | **directo** | `false` = falta/denegado |
| `no-molestar` | `isNotificationPolicyAccessGranted` | **Solo panel** `ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS` | **lista** | `false` = falta/denegado |
| `escribir-ajustes` | `Settings.System.canWrite` | **Solo panel** `ACTION_MANAGE_WRITE_SETTINGS` | **directo** | `false` = falta/denegado |
| `todos-archivos` | `Environment.isExternalStorageManager` | **Solo panel** `ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION` | **directo** | `false` = falta/denegado |
| `instalar` | `instalar_apps: true/false` | **Solo panel** `ACTION_MANAGE_UNKNOWN_APP_SOURCES` | **directo** | `false` = falta/denegado |
| `bateria` | `bateria_exenta: true/false` | Diálogo del sistema `ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` | **directo** (diálogo) | `false` = denegado (diálogo solo sale 1 vez) |
| `llamadas` | `USE_FULL_SCREEN_INTENT` (14+) | **Solo panel** `ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT` | **directo** | `false` = falta/denegado |
| `arranque` | `RECEIVE_BOOT_COMPLETED` + servicio foreground | Declaración en manifiesto | — | Declarado = concedido |
| `capacidades` | `ActivityManager`, `BatteryManager`, `PowerManager` | **No se pide** | — | — |

---

### 2.3 PWA instalada (modo standalone)

| Diferencia vs web | Detalle |
|---|---|
| `notificaciones` | `Notification.permission` funciona igual; `badge` y `vibrate` disponibles |
| `almacenamiento` | `navigator.storage.persist()` más fiable; cuota mayor |
| `pantalla` | `getDisplayMedia` disponible en Chrome/Edge desktop; **no en iOS/Safari PWA** |
| `archivos` | `showDirectoryPicker` en Chrome/Edge; **no en Firefox/Safari** |
| `bluetooth` | Web Bluetooth en Chrome/Edge con gesto; **no en Safari/Firefox** |
| `arranque` | `beforeinstallprompt` / `appinstalled` eventos; `launch_handler` en manifest |
| Detección de medio | `window.matchMedia('(display-mode: standalone)').matches` |

---

### 2.4 Terminal / CLI (Node.js, Bun, Deno — scripts del OS)

| Permiso | Detección | Petición | Enlace | Nota |
|---|---|---|---|---|
| `accesibilidad` (macOS) | `AXIsProcessTrusted()` | `AXIsProcessTrustedWithOptions({prompt:true})` | `Privacy_Accessibility` | Solo si el script usa enigo/xcap |
| `pantalla` (macOS) | `CGPreflightScreenCaptureAccess()` | `CGRequestScreenCaptureAccess()` | `Privacy_ScreenCapture` | Solo para captura de pantalla en scripts |
| `archivos` | `fs.access()` / `fs.stat()` | **No se pide** (permisos POSIX) | — | El SO gestiona con usuario/grupos |
| `red-local` | `net.createServer()` / `dgram` | Firewall (macOS/Windows/Linux) | Firewall del SO | La app no lo gestiona |
| `bluetooth` / `serie` | `ls /dev/ttyUSB*` / `hidraw` / D-Bus BlueZ | `pkexec` / `sudo` / grupos (`dialout`, `plugdev`) | — | `permisos_sistema.rs › evaluar_linux` mide grupos |
| `capacidades` | `os.cpus()`, `os.totalmem()`, `sysfs` | **No se pide** | — | Solo lectura |

---

## 3. Regla de petición unificada (algoritmo)

```typescript
// Pseudocódigo de la regla PRM1119
function pedirPermisosFaltantes(medio: Medio, permisosUtiles: PermisoId[]) {
  for (const id of permisosUtiles) {
    const estado = await consultarPermiso(medio, id);
    
    if (estado === "concedido") continue;
    
    if (estado === "denegado") {
      // Denegado a mano: NO volver a pedir solo
      // PERO mostrar en la lista con botón "Abrir ajustes"
      mostrarEnLista({ id, estado: "denegado", accion: "abrir-ajustes" });
      continue;
    }
    
    // estado === "preguntar" | "no-disponible" | "sin-preguntar" | "no-concedido"
    // → PEDIR en el momento justo con su porqué
    const resultado = await pedirPermiso(medio, id);
    
    if (resultado.estado === "concedido") {
      continuarFlujo();
    } else if (resultado.estado === "denegado") {
      mostrarEnLista({ id, estado: "denegado", accion: "abrir-ajustes" });
    } else {
      // "no-disponible" o error: mostrar como "no aplica" o "error"
      mostrarEnLista({ id, estado: resultado.estado, accion: "ninguna" });
    }
  }
}
```

**Puntos clave:**

1. **Al instalar** (primera vez que la app nativa / PWA / web detecta que es la primera ejecución en ese medio): ejecutar `pedirPermisosFaltantes` con los permisos **críticos** para ese medio.
2. **Al abrir** (cada arranque en frío, o al volver de background > 5 min): volver a ejecutar para permisos que puedan haber cambiado (ej. usuario revocó en Ajustes).
3. **Nunca insistir** en `denegado`: la lista muestra «Abrir ajustes» con el enlace directo del §2.
4. **Contexto útil**: cada petición incluye una frase humana: «Para que Astraura pueda verte la pantalla y actuar, StarSeed OS necesita permiso de Grabación de pantalla».
5. **Orden**: permisos de aviso del sistema primero (micro, cámara, ubicación, notificaciones, bluetooth); luego aviso→panel (pantalla, accesibilidad, monitor-entrada); luego solo panel (disco-completo, automatización, carpetas, arranque, superposición, etc.).

---

## 4. Distinción «falta» vs «denegado a mano» — resumen por medio

| Medio | Permisos con distinción clara | Permisos SIN distinción (se asume «falta» si no concedido) |
|---|---|---|
| **Web (Chromium/Firefox)** | `microfono`, `camara`, `ubicacion`, `notificaciones`, `almacenamiento`, `archivos`, `movimiento` (iOS) | `pantalla`, `bluetooth`, `red-local` |
| **Web (Safari ≤ 17)** | `notificaciones` | `microfono`, `camara`, `ubicacion`, `pantalla`, `movimiento` (solo por error) |
| **macOS** | `microfono`, `camara`, `ubicacion`, `bluetooth`, `monitor-entrada`, `arranque` | `pantalla` (bool), `accesibilidad` (bool sin distinguir), `red-local`, `notificaciones` (parcial), `disco-completo`, `automatizacion`, `carpetas` |
| **Windows** | `arranque` | `microfono`, `camara`, `ubicacion`, `notificaciones`, `pantalla`, `accesibilidad`, `bluetooth`, `red-local` |
| **Linux (X11)** | `arranque` (archivo existe) | `pantalla`, `accesibilidad`, `bluetooth`, `microfono`, `camara`, `notificaciones`, `red-local` |
| **Linux (Wayland)** | `pantalla`, `accesibilidad` (portal devuelve estado) | `microfono`, `camara`, `bluetooth`, `red-local`, `notificaciones`, `arranque` |
| **Android** | `microfono`, `camara`, `ubicacion`, `notificaciones`, `bateria` (diálogo 1 vez), `cercanos` | `pantalla`, `accesibilidad`, `superposicion`, `no-molestar`, `escribir-ajustes`, `todos-archivos`, `instalar`, `llamadas` |
| **Terminal** | `accesibilidad`, `pantalla` (macOS) | `archivos`, `red-local`, `bluetooth`, `serie` (POSIX/grupos) |

---

## 5. Enlaces directos a Ajustes — tabla canónica

> Fuente de verdad: `architecture/permisos-enlaces-directos.md` y `src/lib/nativa/permisos-enlaces.ts` (se regeneran juntos; una prueba vigila que no se separen).

| Permiso | macOS | Windows | Android | Linux |
|---|---|---|---|---|
| `microfono` | `Privacy_Microphone` | `privacy-microphone` | ficha app › Permisos | **sin enlace** |
| `camara` | `Privacy_Camera` | `privacy-webcam` | ficha app › Permisos | **sin enlace** |
| `pantalla` | `Privacy_ScreenCapture` | **no se pide** | aviso del sistema | Wayland: aviso del sistema |
| `ubicacion` | `Privacy_LocationServices` | `privacy-location` | ficha app › Permisos | **sin enlace** |
| `notificaciones` | `preference.notifications` | `notifications` | **directo** `ACTION_APP_NOTIFICATION_SETTINGS` | **no se pide** |
| `bluetooth` | `Privacy_Bluetooth` | `bluetooth` | ficha app › Permisos | **no se pide** |
| `red-local` | `Privacy_LocalNetwork` (15+) | **sin enlace** (Firewall) | **no hay permiso** | **no se pide** |
| `accesibilidad` | `Privacy_Accessibility` | **no se pide** | **lista** `ACTION_ACCESSIBILITY_SETTINGS` | Wayland: aviso del sistema |
| `monitor-entrada` | `Privacy_ListenEvent` | **no se pide** | — | — |
| `automatizacion` | `Privacy_Automation` | **no se pide** | — | — |
| `disco-completo` | `Privacy_AllFiles` | **no se pide** | **directo** `ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION` | — |
| `carpetas` | `Privacy_FilesAndFolders` | **no se pide** | — | — |
| `arranque` | `LoginItems-Settings.extension` | `startupapps` | declaración manifiesto | **sin enlace** |
| `superposicion` | — | — | **directo** `ACTION_MANAGE_OVERLAY_PERMISSION` | — |
| `no-molestar` | — | — | **lista** `ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS` | — |
| `escribir-ajustes` | — | — | **directo** `ACTION_MANAGE_WRITE_SETTINGS` | — |
| `todos-archivos` | — | — | **directo** `ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION` | — |
| `instalar` | — | — | **directo** `ACTION_MANAGE_UNKNOWN_APP_SOURCES` | — |
| `bateria` | — | — | **directo** diálogo sistema `ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` | — |
| `llamadas` | — | — | **directo** `ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT` (14+) | — |

---

## 6. Integración con el código existente

- **Contrato puro (tipos + normalización):** `src/lib/permisos/contrato.ts` → `EstadoPermiso`, `PermisoOS`, `ResultadoPermisoOS`, `normalizarEstado`, `estadoDeResultado`.
- **Motor de permisos (web + nativo):** `src/lib/permisos/permission-engine.ts` → `createPermissionEngine()`, `permissionEngine`.
- **Nativo Tauri (estado real + paneles + avisos):** `native/src-tauri/src/permisos_sistema.rs` → `permisos_sistema_estado`, `permisos_sistema_pedir`, `permisos_sistema_abrir`.
- **Medios nativos (micrófono/cámara/pantalla/ubicación por origen):** `native/src-tauri/src/permisos_medios.rs` → `medios_estado`, `medios_abrir_ajustes`, `decidir`.
- **Permisos de inicio (Android runtime + pantalla completa ventana):** `native/src-tauri/src/permisos_inicio.rs` → `permisos_inicio_estado`, `permisos_inicio_pedir`, `ventana_pantalla_completa`.
- **Enlaces directos (tabla + textos «qué pulsar»):** `src/lib/nativa/permisos-enlaces.ts` + `architecture/permisos-enlaces-directos.md`.
- **Registro de permisos por neurona:** `src/lib/nativa/permisos-registro.ts` → `FUNCIONES`, `permisoParaFuncion`, `estadoPermisosNeurona`.
- **Asistente de permisos (UI):** `src/components/nativa/asistente-permisos.tsx` + `lista-permisos.tsx`.
- **Unificación (plan):** `architecture/permisos-unificados.md` (pasos 0–5).

---

## 7. Pruebas de la matriz

La matriz se prueba en tres niveles:

1. **Puras (vitest):** `src/lib/permisos/__tests__/matriz.test.ts` — tabla de decisión pura `consultar → pedir → mostrar` para cada medio/permiso, con mocks de `navigator.permissions`, `Notification`, `mediaDevices`, y las funciones nativas de `permisos_sistema.rs` (versión pura exportada para test).
2. **Integración (Tauri):** `native/src-tauri/src/permisos_sistema.rs` › `#[cfg(test)]` — `panel()`, `estado_de_autorizacion()`, `evaluar_linux()`, `estados_android()`, `grupos_de()`, `uinput_de()`.
3. **E2E (Playwright + dispositivos reales):** matriz de comprobación en `architecture/director-diseno.md:80-87` — 280, 360×780, 430×932, 768×1024, 1024×1366, 1280×800, 1920×1080, 3840×2160; iOS, Android, macOS, Windows, Linux; safe areas, teclado virtual, scroll, fallback tipográfico; claro/oscuro, texto largo, loading/vacío/error, alto contraste, movimiento reducido.

---

## 8. Cambios futuros

- **iOS / iPadOS (PWA y app nativa):** añadir cuando exista `tauri ios init` y se pruebe en aparato. Hoy: WebKitGTK en Linux es el proxy más cercano.
- **visionOS / xrOS:** permisos de `ARKIT`, `WorldTracking`, `HandTracking`, `EyeTracking` — patrón «aviso del sistema» + panel.
- **Fuchsia / HarmonyOS:** mapear a capacidades equivalentes.
- **Nuevos sensores:** `serial` (Web Serial API), `hid` (WebHID), `nfc` (Web NFC), `usb` (WebUSB) — seguir el patrón «por uso» + panel si el SO lo exige.

---

**Fin del contrato.** Cualquier medio nuevo que se añada al OS **debe** añadir su fila en §2 y su entrada en §5 antes de considerar la tarea terminada.