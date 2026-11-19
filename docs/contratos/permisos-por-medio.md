# Permisos por medio — matriz real (PRM1119B)

**Fuente:** auditoría de `architecture/permisos-y-control-del-dispositivo.md`, `architecture/permisos-unificados.md`, `architecture/permisos-enlaces-directos.md`, `src/lib/nativa/permisos-registro.ts`, `src/lib/permisos/contrato.ts`, `native/src-tauri/src/permisos_*.rs`, `config/permisos-por-so.json`.

**Regla (no negociable):** «automático» = pedir en el momento justo con su porqué, abrir la pantalla EXACTA del sistema, notar la concesión al volver y seguir solo. **Nunca** autoconcederse: ni escribir en TCC.db, ni interfaces privadas, ni pulsar diálogos por guion, ni `pm grant`/`appops set`, ni perfiles MDM/PPPC salvo organización que los firme.

---

## 1. Medios (plataformas) cubiertos

| Medio | Identificador interno | Qué es |
|---|---|---|
| **macOS** (13 Ventura – 15 Sequoia) | `macos` | App nativa Tauri firmada (certificado propio o ad-hoc) |
| **Android** (12 – 16) | `android` | APK (fuera de Play) o PWA en Chrome/FF |
| **Windows** (10/11, apps de escritorio sin empaquetar) | `windows` | App nativa Tauri (sin MSIX) |
| **Linux X11** | `linux-x11` | App nativa Tauri / AppImage |
| **Linux Wayland** | `linux-wayland` | App nativa Tauri / Flatpak |
| **iOS** (15+) | `ios` | Solo PWA (no hay app nativa firmada) |
| **Navegador web** (Chrome, Firefox, Safari, Edge) | `web` | `https://starseed-os.vercel.app` y servidor local |

> **Nota:** iOS no permite app nativa propia hoy; la PWA corre en WebKit y hereda sus límites (sin `getDisplayMedia`, sin `showDirectoryPicker`, notificaciones solo en iOS 16.4+ con gesto).

---

## 2. Catálogo de permisos (filas de la matriz)

| Id | Título | Grupo | Qué habilita en StarSeed OS |
|---|---|---|---|
| `bluetooth` | Bluetooth | malla | Hablar directo con otras neuronas cercanas |
| `red-local` | Red local | malla | Encontrar neuronas en la misma red (mDNS, multicast) |
| `ubicacion-wifi` | Ubicación (nombres de Wi-Fi) | malla | Leer SSIDs para enlace directo Android↔escritorio |
| `ubicacion` | Ubicación (mapa) | malla | Situar el aparato en el mapa de Señales |
| `cercanos` | Dispositivos cercanos | malla | Bluetooth LE / Wi-Fi Aware / Wi-Fi Direct (Android) |
| `nfc` | NFC | malla | Enlazar dos aparatos acercándolos |
| `notificaciones` | Notificaciones | comunicación | Avisos de mensajes/llamadas con ventana cerrada |
| `microfono` | Micrófono | comunicación | Llamadas, transmisiones, comandos de voz |
| `camara` | Cámara | comunicación | Videollamadas, transmisiones, visión de Astraura |
| `llamadas` | Llamadas en pantalla completa | comunicación | Llamada a pantalla completa con bloqueo (Android 14+) |
| `pantalla` | Grabación/compartir pantalla | pantalla-control | Compartir en llamadas, prestar ventana, Astraura ve |
| `accesibilidad` | Accesibilidad (controlar) | pantalla-control | Otras neuronas/Astraura pulsan y escriben |
| `monitor-entrada` | Monitorización de entrada | pantalla-control | Pausar control remoto al detectar actividad local |
| `automatizacion` | Automatización otras apps | pantalla-control | Astraura pide a Música, Finder, etc. (macOS) |
| `superposicion` | Mostrar sobre otras apps | pantalla-control | Aviso «te están controlando» + orbe siempre encima (Android) |
| `arranque` | Abrir al iniciar sesión | segundo-plano | Neurona disponible sin abrirla manualmente |
| `bateria` | Sin límite de batería | segundo-plano | Antenas vivas con pantalla apagada (Android) |
| `carpetas` | Carpetas protegidas | archivos | Escritorio, Documentos, Descargas por selector |
| `disco-completo` | Acceso total al disco | archivos | Compartir cualquier carpeta/volumen (macOS) |
| `todos-archivos` | Acceso a todos los archivos | archivos | Compartir cualquier archivo del aparato (Android 11+) |
| `instalar` | Instalar apps desconocidas | sistema | Auto-actualización desde canal StarSeed |
| `no-molestar` | Acceso a No molestar | sistema | Centro de control enciende/apaga DND real |
| `escribir-ajustes` | Modificar ajustes del sistema | sistema | Centro de control cambia brillo real (Android) |
| `capacidades` | Capacidades del aparato | sistema | CPU, RAM, disco, batería, temperatura (solo lectura) |

---

## 3. Matriz completa: permiso × medio

### 3.1 macOS

| Permiso | Cómo se detecta | Cómo se pide | Enlace directo a Ajustes | «Falta» vs «Denegado a mano» |
|---|---|---|---|---|
| `bluetooth` | `CBManager.authorization` | Aviso al arrancar CoreBluetooth (`NSBluetoothAlwaysUsageDescription`) | **directo** `x-apple.systempreferences:…Privacy_Bluetooth` | `denied` = denegado a mano; `notDetermined` = falta |
| `red-local` | No hay API pública; se deduce si malla local responde | Aviso al primer envío multicast (`NSLocalNetworkUsageDescription`) | **directo** `…Privacy_LocalNetwork` (macOS 15+) | No se puede leer: «desconocido» siempre |
| `ubicacion-wifi` | `CLLocationManager.authorizationStatus` | Aviso (`requestWhenInUseAuthorization`) | **directo** `…Privacy_LocationServices` | `denied` = denegado; `notDetermined` = falta |
| `ubicacion` | `CLLocationManager.authorizationStatus` | **Por uso**: solo al pulsar «Usar mi ubicación» | **directo** `…Privacy_LocationServices` | Igual que arriba (mismo permiso del sistema) |
| `notificaciones` | Plugin `isPermissionGranted` (parcial) | Aviso del plugin | **lista** Ajustes › Notificaciones | Plugin no distingue `denied` de `prompt` |
| `microfono` | `AVCaptureDevice.authorizationStatusForMediaType(.audio)` | Aviso (WebKit con textos Info.plist) | **directo** `…Privacy_Microphone` | `denied` = denegado; `notDetermined` = falta |
| `camara` | `AVCaptureDevice.authorizationStatusForMediaType(.video)` | Aviso (WebKit) | **directo** `…Privacy_Camera` | `denied` = denegado; `notDetermined` = falta |
| `pantalla` | `CGPreflightScreenCaptureAccess()` | **Aviso→Panel**: `CGRequestScreenCaptureAccess()` UNA vez, después solo Ajustes | **directo** `…Privacy_ScreenCapture` | `false` = no concedido (no distingue negado de nunca) |
| `accesibilidad` | `AXIsProcessTrusted()` | **Aviso→Panel**: `AXIsProcessTrustedWithOptions({prompt:true})` | **directo** `…Privacy_Accessibility` | `false` = no concedido (no distingue negado de nunca) |
| `monitor-entrada` | `IOHIDCheckAccess(kIOHIDRequestTypeListenEvent)` | **Aviso→Panel**: `IOHIDRequestAccess(kIOHIDRequestTypeListenEvent)` | **directo** `…Privacy_ListenEvent` | `0`=concedido, `1`=denegado, `2`=sin preguntar |
| `automatizacion` | `AEDeterminePermissionToAutomateTarget` (por app destino) | **Por uso**: primer Apple Event a cada app pregunta | **directo** `…Privacy_Automation` | No se puede leer sin app destino |
| `arranque` | Plugin autostart (`fondo_estado.arranque_con_sistema`) | Plugin lo activa (LaunchAgent; macOS avisa) | **lista** Ajustes › General › Ítems de inicio | `true/false` legible |
| `carpetas` | No hay API pública | **Por uso**: selector de carpetas concede la elegida | **directo** `…Privacy_FilesAndFolders` | No legible |
| `disco-completo` | **No hay API pública** (leer TCC.db prohibido) | **Panel**: no hay aviso, solo interruptor en Ajustes | **directo** `…Privacy_AllFiles` | **No se puede leer**: «desconocido» siempre |
| `capacidades` | `sysctl`, `IOKit`, `NSProcessInfo` | **Nada** (solo lectura) | **no-hace-falta** | Siempre `no-aplica` |

### 3.2 Android (12–16)

| Permiso | Cómo se detecta | Cómo se pide | Enlace directo a Ajustes | «Falta» vs «Denegado a mano» |
|---|---|---|---|---|
| `cercanos` | `BluetoothAdapter` + `PackageManager.checkPermission` | Aviso (`BLUETOOTH_SCAN/CONNECT/ADVERTISE`, `NEARBY_WIFI_DEVICES`) | **ficha** Info app › Permisos › Dispositivos cercanos | `PERMISSION_GRANTED` vs `DENIED` (dos negativas = ya no pregunta) |
| `ubicacion` | `Context.checkSelfPermission(ACCESS_FINE_LOCATION)` | **Por uso**: solo con `pedir` (`ubicacion_ahora`) | **ficha** Info app › Permisos › Ubicación | `GRANTED` vs `DENIED`; `shouldShowRequestPermissionRationale` = denegado a mano |
| `nfc` | `NfcAdapter.isEnabled()` | **Declaración** (normal, sin pregunta) | **no-hace-falta** | Siempre concedido si NFC encendido |
| `notificaciones` | `NotificationManagerCompat.areNotificationsEnabled()` | Aviso (`POST_NOTIFICATIONS` en 13+) | **directo** Ajustes › Apps › StarSeed › Notificaciones | `areNotificationsEnabled()` = true/false |
| `microfono` | `Context.checkSelfPermission(RECORD_AUDIO)` | Aviso (dos negativas = ficha de la app) | **ficha** Info app › Permisos › Micrófono | `GRANTED` vs `DENIED`; `shouldShowRequestPermissionRationale` |
| `camara` | `Context.checkSelfPermission(CAMERA)` | Aviso (dos negativas = ficha de la app) | **ficha** Info app › Permisos › Cámara | Igual que micrófono |
| `llamadas` | `Settings.canDrawOverlays()` + `USE_FULL_SCREEN_INTENT` | **Panel** (acceso especial) | **directo** Ajustes › Acceso especial › Notificaciones a pantalla completa | `canDrawOverlays()` legible |
| `pantalla` | **No se puede leer antes** | **Por uso**: `createScreenCaptureIntent()` cada sesión | **aviso** del sistema | **No se lee antes**: siempre «desconocido» hasta usar |
| `accesibilidad` | `Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES` | **Panel**: `ACTION_ACCESSIBILITY_SETTINGS` (+ ajustes restringidos 13+) | **lista** Ajustes › Accesibilidad › Apps instaladas | `ENABLED_ACCESSIBILITY_SERVICES` contiene el servicio |
| `superposicion` | `Settings.canDrawOverlays()` | **Panel**: `ACTION_MANAGE_OVERLAY_PERMISSION` | **directo** Ajustes › Acceso especial › Mostrar sobre otras apps | `canDrawOverlays()` = true/false |
| `bateria` | `PowerManager.isIgnoringBatteryOptimizations()` | Aviso del sistema (`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`) | **directo** Diálogo del sistema | `isIgnoringBatteryOptimizations()` = true/false |
| `todos-archivos` | `Environment.isExternalStorageManager()` | **Panel**: `ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION` | **directo** Ajustes › Acceso especial › Acceso a todos los archivos | `isExternalStorageManager()` = true/false |
| `instalar` | `PackageManager.canRequestPackageInstalls()` | **Panel**: `ACTION_MANAGE_UNKNOWN_APP_SOURCES` | **directo** Ajustes › Acceso especial › Instalar apps desconocidas | `canRequestPackageInstalls()` = true/false |
| `no-molestar` | `NotificationManager.isNotificationPolicyAccessGranted()` | **Panel**: `ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS` | **lista** Ajustes › Notificaciones › Acceso a No molestar | `isNotificationPolicyAccessGranted()` = true/false |
| `escribir-ajustes` | `Settings.System.canWrite()` | **Panel**: `ACTION_MANAGE_WRITE_SETTINGS` | **directo** Ajustes › Acceso especial › Modificar ajustes del sistema | `canWrite()` = true/false |
| `arranque` | `PackageManager.getComponentEnabledSetting(BOOT_COMPLETED)` | **Declaración** (`RECEIVE_BOOT_COMPLETED`) | **no-hace-falta** | Servicio declarado = activo |
| `capacidades` | `ActivityManager`, `BatteryManager`, `PowerManager` | **Nada** (solo lectura) | **no-hace-falta** | Siempre `no-aplica` |

### 3.3 Windows 10/11 (apps de escritorio sin empaquetar)

| Permiso | Cómo se detecta | Cómo se pide | Enlace directo a Ajustes | «Falta» vs «Denegado a mano» |
|---|---|---|---|---|
| `bluetooth` | `Windows.Devices.Radios.Radio.GetRadiosAsync()` | **Nada** (apps de escritorio no piden) | **directo** `ms-settings:bluetooth` | API WinRT lee estado radio |
| `red-local` | Firewall pregunta al escuchar fuera de 127.0.0.1 | **Por uso**: Firewall de Windows pregunta 1ª vez | **sin-enlace** (Firewall lo abre) | No legible: elegir «Redes privadas» |
| `ubicacion-wifi` | No hay API nativa para apps de escritorio | **Por uso**: desde Win11 24H2 WLAN pide «Ubicación» | **directo** `ms-settings:privacy-location` | No legible |
| `ubicacion` | Navegador da ubicación (no hay vía nativa) | **Por uso**: mapa usa geolocalización del navegador | **directo** `ms-settings:privacy-location` | No legible nativamente |
| `notificaciones` | Activadas por defecto | **Nada** | **directo** `ms-settings:notifications` | No legible |
| `microfono` | Permitido salvo apagado global | **Por uso**: `ms-settings:privacy-microphone` | **directo** `ms-settings:privacy-microphone` | No legible (solo intentándolo) |
| `camara` | Permitida salvo apagado global | **Por uso**: `ms-settings:privacy-webcam` | **directo** `ms-settings:privacy-webcam` | No legible (solo intentándolo) |
| `pantalla` | **Nada**: cualquier app captura (Graphics Capture) | **No se pide** | **no-hace-falta** | Siempre `no-aplica` |
| `accesibilidad` | `SendInput` funciona (salvo UIPI/UAC) | **No se pide** | **no-hace-falta** | Siempre `no-aplica` (pero no llega a ventanas elevadas) |
| `arranque` | App lo activa (autostart) | App lo activa | **directo** `ms-settings:startupapps` | Legible en Configuración › Inicio |
| `capacidades` | WMI, `PowerGetThermalHeadroom`, etc. | **Nada** | **no-hace-falta** | Siempre `no-aplica` |

### 3.4 Linux X11

| Permiso | Cómo se detecta | Cómo se pide | Enlace directo a Ajustes | «Falta» vs «Denegado a mano» |
|---|---|---|---|---|
| `bluetooth` | BlueZ por D-Bus (polkit si empareja) | **Nada** | **no-hace-falta** | Solo necesita Bluetooth encendido |
| `red-local` | **Nada** | **Nada** | **no-hace-falta** | No pide permiso |
| `notificaciones` | **Nada** (libnotify/DBus) | **Nada** | **no-hace-falta** | No pide permiso |
| `microfono` | WebKitGTK pregunta a la app | **Nada** (app decide por origen) | **sin-enlace** (cada escritorio distinto) | No hay pantalla única |
| `camara` | WebKitGTK pregunta a la app | **Nada** | **sin-enlace** | No hay pantalla única |
| `pantalla` | **Nada**: cualquier cliente lee pantalla | **No se pide** | **no-hace-falta** | Siempre `no-aplica` |
| `accesibilidad` | XTest (enigo) | **No se pide** | **no-hace-falta** | Siempre `no-aplica` |
| `arranque` | `.desktop` en `~/.config/autostart` | App lo crea | **sin-enlace** (cada escritorio distinto) | Archivo existe = activo |
| `capacidades` | `/proc`, `sysfs`, `lm-sensors`, `upower` | **Nada** | **no-hace-falta** | Siempre `no-aplica` |

### 3.5 Linux Wayland

| Permiso | Cómo se detecta | Cómo se pide | Enlace directo a Ajustes | «Falta» vs «Denegado a mano» |
|---|---|---|---|---|
| `bluetooth` | BlueZ por D-Bus | **Nada** | **no-hace-falta** | Solo necesita Bluetooth encendido |
| `red-local` | **Nada** | **Nada** | **no-hace-falta** | No pide permiso |
| `notificaciones` | **Nada** | **Nada** | **no-hace-falta** | No pide permiso |
| `microfono` | Portal `org.freedesktop.portal.Camera` (PipeWire) | **Por uso**: portal pregunta | **sin-enlace** | Portal no deja leer antes |
| `camara` | Portal `Camera` en Flatpak | **Por uso**: portal pregunta | **sin-enlace** | Portal no deja leer antes |
| `pantalla` | Portal `org.freedesktop.portal.ScreenCast` | **Por uso**: selector en cada sesión (restore token) | **aviso** del sistema | Portal no deja leer antes |
| `accesibilidad` | Portal `RemoteDesktop` (libei experimental) | **Por uso**: portal pregunta cada sesión | **aviso** del sistema | Portal no deja leer antes |
| `arranque` | `.desktop` en `~/.config/autostart` | App lo crea | **sin-enlace** | Archivo existe = activo |
| `capacidades` | Igual que X11 | **Nada** | **no-hace-falta** | Siempre `no-aplica` |

### 3.6 iOS (PWA en WebKit)

| Permiso | Cómo se detecta | Cómo se pide | Enlace directo a Ajustes | «Falta» vs «Denegado a mano» |
|---|---|---|---|---|
| `bluetooth` | Web Bluetooth API (no estándar en iOS) | **No disponible** | **no-hace-falta** | No usable en PWA |
| `red-local` | `NSLocalNetworkUsageDescription` en nativo | **Solo nativo** | **no-hace-falta** | PWA no accede |
| `ubicacion` | `navigator.geolocation` | **Por uso**: gesto + aviso Safari | **ficha** Ajustes › StarSeed › Ubicación | `permissions.query({name:'geolocation'})` |
| `notificaciones` | `Notification.permission` (iOS 16.4+) | **Por uso**: gesto + aviso Safari | **ficha** Ajustes › Notificaciones › StarSeed | `Notification.permission` = `granted/denied/default` |
| `microfono` | `getUserMedia({audio:true})` | **Por uso**: gesto + aviso Safari | **ficha** Ajustes › StarSeed › Micrófono | `permissions.query({name:'microphone'})` (Safari no expone) |
| `camara` | `getUserMedia({video:true})` | **Por uso**: gesto + aviso Safari | **ficha** Ajustes › StarSeed › Cámara | `permissions.query({name:'camera'})` (Safari no expone) |
| `pantalla` | **No existe** `getDisplayMedia` en iOS | **No disponible** | **no-hace-falta** | Siempre `no-disponible` |
| `archivos` | `showDirectoryPicker` **no existe** | **No disponible** | **no-hace-falta** | Solo File System Access API (no en iOS) |
| `capacidades` | `navigator.deviceMemory`, `navigator.hardwareConcurrency` | **Nada** | **no-hace-falta** | Solo lectura básica |

### 3.7 Navegador web (Chrome, Firefox, Safari, Edge — escritorio y Android)

| Permiso | Cómo se detecta | Cómo se pide | Enlace directo a Ajustes | «Falta» vs «Denegado a mano» |
|---|---|---|---|---|
| `microfono` | `navigator.permissions.query({name:'microphone'})` | `getUserMedia({audio:true})` con gesto | **ficha** `chrome://settings/content/microphone` | `state: 'denied'` = denegado a mano; `'prompt'` = falta |
| `camara` | `navigator.permissions.query({name:'camera'})` | `getUserMedia({video:true})` con gesto | **ficha** `chrome://settings/content/camera` | `state: 'denied'` = denegado; `'prompt'` = falta |
| `ubicacion` | `navigator.permissions.query({name:'geolocation'})` | `navigator.geolocation.getCurrentPosition()` | **ficha** `chrome://settings/content/location` | `state: 'denied'` = denegado; `'prompt'` = falta |
| `notificaciones` | `Notification.permission` | `Notification.requestPermission()` con gesto | **ficha** `chrome://settings/content/notifications` | `'denied'` = denegado; `'default'` = falta |
| `pantalla` | **No consultable** (`getDisplayMedia` no en `permissions.query`) | `getDisplayMedia({video:true})` con gesto | **sin-enlace** | Siempre «desconocido» hasta usar |
| `archivos` | **No consultable** | `showDirectoryPicker()` / `showOpenFilePicker()` | **sin-enlace** | Siempre «desconocido» hasta usar |
| `movimiento` | `DeviceMotionEvent.requestPermission()` (iOS/Safari) | `DeviceMotionEvent.requestPermission()` con gesto | **sin-enlace** | Safari: `granted/denied`; otros: `granted` sin consultar |
| `bluetooth` | `navigator.bluetooth.requestDevice()` (solo HTTPS) | `navigator.bluetooth.requestDevice()` con gesto | **sin-enlace** | No consultable |
| `almacenamiento` | `navigator.storage.persist()` / `persisted()` | `navigator.storage.persist()` | **sin-enlace** | `persisted()` = true/false |

---

## 4. Reglas de petición (algoritmo único)

```typescript
// Pseudocódigo de la regla compartida (src/lib/permisos/matriz.ts)

function debePedir(permiso: Permiso, medio: Medio, estado: EstadoSistema, yaVisto: boolean, yaPedidoAviso: boolean): Accion {
  // 1. Fase no construida → no se pide, se enseña como "llega más adelante"
  if (permiso.fase > FASE_ACTUAL) return "mas-adelante";

  // 2. Ya concedido o no aplica en este medio → listo
  if (estado === "concedido" || estado === "no-aplica") return "listo";

  // 3. El sistema no lo pide (declaración, nada) → nada
  if (permiso.como === "nada" || permiso.como === "declaracion") return "nada";

  // 4. Por uso: el sistema pregunta al usarse, no antes
  if (permiso.como === "por-uso") return "por-uso";

  // 5. Solo panel (la persona debe ir a Ajustes)
  if (permiso.como === "panel") return "abrir-ajustes";

  // 6. Aviso→Panel (macOS Accesibilidad, Pantalla, Monitor-entrada)
  if (permiso.como === "aviso-y-panel") {
    return yaPedidoAviso || estado === "denegado" ? "abrir-ajustes" : "pedir";
  }

  // 7. Aviso simple
  if (permiso.como === "aviso") {
    // Si denegado a mano, el sistema no vuelve a preguntar → abrir ajustes
    return estado === "denegado" ? "abrir-ajustes" : "pedir";
  }

  return "nada";
}

// Regla de "no insistir en denegados a mano":
// - Si el estado del sistema es "denegado" (explícito), NUNCA se vuelve a pedir solo.
// - Se muestra en la lista con acción "abrir-ajustes" y botón "Abrir Ajustes".
// - Si el estado es "sin-preguntar" o "no-concedido" (macOS no distingue), SÍ se pide.
// - La persona puede omitir; lo omitido cuenta como "visto" y no se vuelve a preguntar solo.
```

---

## 5. Detección de «denegado a mano» vs «falta» por medio

| Medio | Permisos donde SÍ se distingue | Permisos donde NO se distingue (solo «no-concedido») | Cómo se maneja lo que no se distingue |
|---|---|---|---|
| **macOS** | micrófono, cámara, bluetooth, ubicación, monitor-entrada (IOHID) | accesibilidad, pantalla, automatización, disco-completo, red-local, notificaciones (parcial) | Se trata «no-concedido» como «falta» la primera vez; si la persona no concede tras abrir Ajustes, se asume denegado a mano |
| **Android** | TODOS los permisos runtime (`shouldShowRequestPermissionRationale` = true ⇒ denegado a mano) | captura de pantalla (no legible antes), servicios especiales (accesibilidad, superposición) | Para servicios: se lee `ENABLED_ACCESSIBILITY_SERVICES` / `canDrawOverlays()` = true/false |
| **Windows** | **Ninguno** (apps de escritorio no exponen estado de privacidad) | micrófono, cámara, ubicación, notificaciones | Se asume «falta» y se envía a Ajustes; si la persona no cambia, se recuerda como «denegado a mano» localmente |
| **Linux X11** | **Ninguno** (no hay aislamiento) | — | Todos `no-aplica` o `sin-enlace` |
| **Linux Wayland** | **Ninguno** (portales no dejan leer antes) | micrófono, cámara, pantalla, accesibilidad | Todos «por-uso»: se pide al usarse, no antes |
| **iOS (PWA)** | notificaciones (`Notification.permission`), geolocalización (`permissions.query`) | micrófono, cámara (Safari no expone en `permissions.query`) | Se usa `Notification.permission` y `geolocation` state; resto se intenta y se maneja error |
| **Web (Chrome/FF/Edge)** | micrófono, cámara, ubicación, notificaciones (`permissions.query` + `Notification.permission`) | pantalla, archivos, bluetooth, movimiento, almacenamiento | Para los consultables: `state === 'denied'` = denegado a mano; `'prompt'`/`'default'` = falta |

---

## 6. Enlaces directos a Ajustes (resumen por medio)

| Medio | Esquema/Comando | Ejemplo |
|---|---|---|
| **macOS** | `x-apple.systempreferences:com.apple.preference.security?Privacy_<ANCLA>` | `Privacy_Microphone`, `Privacy_Camera`, `Privacy_ScreenCapture`, `Privacy_Accessibility`, `Privacy_ListenEvent`, `Privacy_Bluetooth`, `Privacy_LocationServices`, `Privacy_LocalNetwork`, `Privacy_FilesAndFolders`, `Privacy_AllFiles`, `Privacy_Automation` |
| **macOS (notificaciones/arranque)** | `x-apple.systempreferences:com.apple.preference.notifications` / `com.apple.LoginItems-Settings.extension` | — |
| **Windows** | `ms-settings:<página>` | `privacy-microphone`, `privacy-webcam`, `privacy-location`, `notifications`, `bluetooth`, `startupapps` |
| **Android** | `Intent.ACTION_*` vía Kotlin (`panel:<id>`, `bateria`) | `panel:accesibilidad`, `panel:superposicion`, `panel:no-molestar`, `panel:escribir-ajustes`, `panel:todos-archivos`, `panel:instalar`, `panel:llamadas`, `panel:ajustes-restringidos`, `bateria` |
| **Linux** | **Ninguno fiable** (cada escritorio distinto) | Se dice en la UI: «No hay enlace directo; búscalo en Ajustes de tu escritorio» |
| **iOS (PWA)** | `App-Prefs:root=...` (no fiable desde PWA) | Se abre ficha de la app en Ajustes |
| **Web** | `chrome://settings/content/<permiso>` / `edge://...` / `about:preferences#privacy` | Se dice en la UI: «Abre la configuración del navegador › Privacidad › [Permiso]» |

---

## 7. Qué guarda la app para no insistir

```typescript
interface GuardadoPermisos {
  version: number;
  vistos: IdPermiso[];                    // La persona ya los vio (concedió, negó u omitió)
  resultados: Partial<Record<IdPermiso, "concedido" | "denegado" | "omitido" | "no-disponible">>;
  avisos: IdPermiso[];                    // Avisos del sistema ya enseñados (macOS no repite)
}
```

- **`vistos`**: incluye concedidos, denegados y omitidos. **Nunca se vuelve a preguntar solo** lo que esté en `vistos`.
- **`avisos`**: solo macOS `aviso-y-panel` (accesibilidad, pantalla, monitor-entrada). Sirve para saber que el aviso ya salió y ahora solo cabe «Abrir Ajustes».
- Al actualizar la app (sube `VERSION_REGISTRO`), se comparan los nuevos permisos contra `vistos`: **solo los nuevos** que la persona no vio disparan la apertura automática de la lista.

---

## 8. Pruebas de la matriz (fuente de verdad)

El archivo `src/lib/permisos/__tests__/matriz.test.ts` valida:

1. **Tabla completa**: cada `IdPermiso` tiene definición en `BASE` y entrada en al menos un `POR_SISTEMA`.
2. **Estados válidos**: `como ∈ {aviso, aviso-y-panel, panel, por-uso, declaracion, nada}`, `lectura ∈ {si, parcial, no}`.
3. **Fases**: `fase ≥ 1`, `desde ≥ 1`, `opcional` solo en permisos que la persona puede saltar sin romper la función.
4. **`accionDe`**: tabla de verdad cubriendo todos los combos (estado × como × yaPedido × fase).
5. **`necesitaPara`**: para cada `IdFuncion`, los permisos obligatorios (no opcionales) que usa están en `faltan` si no están concedidos.
6. **Enlaces**: `filasDe(sistema)` coincide con `architecture/permisos-enlaces-directos.md` (prueba de no-divergencia).
7. **No-duplicados**: `Ids` únicos en `BASE`, `ORDEN_GRUPOS` cubre todos los grupos.

---

## 9. Referencias de código (para implementadores)

| Qué | Archivo |
|---|---|
| Registro único (tipos, catálogo, `accionDe`, `necesitaPara`) | `src/lib/nativa/permisos-registro.ts` |
| Máquina de estados de la lista (vistos, cola, `abrirAsistente`) | `src/lib/nativa/permisos-inicio.ts` |
| Ejecutor (pide a Tauri/Android, relee estados) | `src/lib/nativa/permisos-inicio-ejecutor.ts` |
| Enlaces directos (pura, sin Tauri) | `src/lib/nativa/permisos-enlaces.ts` |
| Contrato unificado web/nativo (estados, `normalizarEstado`) | `src/lib/permisos/contrato.ts` |
| Motor de permisos web (wrapper) | `src/lib/permisos/permission-engine.ts` |
| Nativo: medios (mic/cam/pantalla/ubicacion) | `native/src-tauri/src/permisos_medios.rs` |
| Nativo: sistema (estado, pedir aviso, abrir panel) | `native/src-tauri/src/permisos_sistema.rs` |
| Nativo: inicio (Android runtime, pantalla completa ventana) | `native/src-tauri/src/permisos_inicio.rs` |
| Config JSON por SO (Tauri capabilities) | `config/permisos-por-so.json` |
| Documento de enlaces directos (humano) | `architecture/permisos-enlaces-directos.md` |
| Documento matriz y control (fuente) | `architecture/permisos-y-control-del-dispositivo.md` |