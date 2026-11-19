# Permisos por medio — Matriz real de StarSeed OS (PRM1119, 2026-11-19)

**Qué es:** la tabla completa de **permiso × medio** (sistema operativo + forma de abrir la app) para StarSeed OS.
Cubre: **micrófono, cámara, pantalla, accesibilidad/control, ubicación, Bluetooth, red local, notificaciones, segundo plano, almacenamiento/archivos, entrada virtual, energía, NFC, contactos, calendario, pantalla completa, superposición, automatización, monitorización de entrada, disco completo, carpetas, arranque, no molestar, escribir ajustes, capacidades, dispositivos cercanos, ubicación (Wi-Fi), llamadas, batería, instalar apps, todos los archivos**.

Para cada celda se especifica:
1. **Cómo se detecta** (API, propiedad, método)
2. **Cómo se pide** (aviso del sistema, solo Ajustes, por uso, declaración en manifiesto, nada)
3. **Si hay enlace directo a Ajustes** (URL scheme, intent, pantalla exacta, qué pulsar)
4. **Cómo distinguir «falta» (nunca se pidió) de «denegado a mano»** en ese medio

**Regla de oro (PRM1119):** al instalar y al abrir, pedir lo que falte y sea útil; si la persona lo denegó a mano, **no volver a pedirlo solo**, pero mostrarlo en la lista con botón «Abrir ajustes». Nunca se concede nada por la persona.

---

## 1. Medios cubiertos

| Medio (`TipoMedio`) | Descripción | Sistemas operativos donde existe |
|---|---|---|
| `app-nativa` | App Tauri nativa (Rust + WebView) | macOS, Android, Windows, Linux (X11/Wayland) |
| `app-instalada` | PWA instalada (display-mode: standalone) | iOS, iPadOS, Android, macOS, Windows, Linux |
| `navegador` | Navegador web normal (Chrome, Safari, Firefox, Edge…) | Todos |
| `navegador-claude` | Navegador integrado de Claude (Electron) | macOS, Windows, Linux |
| `local` | Desarrollo en localhost (http://localhost:9002) | Todos (detectado por host) |

**Contextos extra:** `terminal` (CLI/TTY), `tv` (Android TV, tvOS, web en Smart TV), `plegable` (Android foldable, iPadOS stage manager).

---

## 2. Catálogo de permisos (IDs canónicos)

| ID | Grupo | Título corto |
|---|---|---|
| `microfono` | audio-video | Micrófono |
| `camara` | audio-video | Cámara |
| `pantalla` | pantalla-control | Grabación / compartición de pantalla |
| `accesibilidad` | pantalla-control | Accesibilidad / control del aparato |
| `ubicacion` | ubicacion-red | Ubicación (mapa / GPS) |
| `bluetooth` | ubicacion-red | Bluetooth |
| `red-local` | ubicacion-red | Red local (mDNS, SSDP, multicast) |
| `notificaciones` | comunicacion | Notificaciones push / locales |
| `segundo-plano` | segundo-plano | Ejecución en segundo plano |
| `almacenamiento` | archivos-almacenamiento | Almacenamiento (File System Access API) |
| `entrada-virtual` | entrada-salida | Teclado/ratón virtual, inyección de entrada |
| `energia` | sistema-dispositivo | Exención de optimizaciones de batería |
| `nfc` | ubicacion-red | NFC |
| `contactos` | comunicacion | Contactos |
| `calendario` | comunicacion | Calendario |
| `archivos` | archivos-almacenamiento | Archivos (picker nativo) |
| `pantalla-completa` | pantalla-control | Ventana a pantalla completa |
| `superposicion` | pantalla-control | Mostrar sobre otras apps |
| `automatizacion` | pantalla-control | Automatización de otras apps (Apple Events, etc.) |
| `monitor-entrada` | pantalla-control | Monitorización de entrada (teclado/ratón global) |
| `disco-completo` | archivos-almacenamiento | Acceso total al disco |
| `carpetas` | archivos-almacenamiento | Carpetas protegidas (Escritorio, Documentos, Descargas) |
| `arranque` | segundo-plano | Abrir al iniciar sesión / encender |
| `no-molestar` | sistema-dispositivo | Acceso a No molestar / Focus |
| `escribir-ajustes` | sistema-dispositivo | Modificar ajustes del sistema (brillo, etc.) |
| `capacidades` | sistema-dispositivo | Leer capacidades (CPU, RAM, disco, batería, temp) |
| `cercanos` | ubicacion-red | Dispositivos cercanos (BLE + Wi-Fi Aware/Direct) |
| `ubicacion-wifi` | ubicacion-red | Ubicación para nombres de Wi-Fi |
| `llamadas` | comunicacion | Llamadas en pantalla completa / pantalla de bloqueo |
| `bateria` | segundo-plano | Sin límite de batería (exención optimizaciones) |
| `instalar` | sistema-dispositivo | Instalar apps de orígenes desconocidos |
| `todos-archivos` | archivos-almacenamiento | Acceso a todos los archivos (Android MANAGE_EXTERNAL_STORAGE) |

---

## 3. Matriz por sistema operativo (app nativa)

### 3.1 macOS (13 Ventura – 15 Sequoia; app mínima 10.15)

| Permiso | Cómo se detecta | Cómo se pide | Enlace directo a Ajustes | Distinguir «falta» vs «denegado a mano» |
|---|---|---|---|---|
| **microfono** | `AVCaptureDevice.authorizationStatusForMediaType(.audio)` | `aviso-sistema` (WebKit / nativo) | `x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone` → «Activa el interruptor de StarSeed OS» | `notDetermined` = falta · `denied` = denegado a mano |
| **camara** | `AVCaptureDevice.authorizationStatusForMediaType(.video)` | `aviso-sistema` | `x-apple.systempreferences:com.apple.preference.security?Privacy_Camera` → «Activa el interruptor de StarSeed OS» | `notDetermined` = falta · `denied` = denegado a mano |
| **pantalla** | `CGPreflightScreenCaptureAccess()` (bool) | `aviso-luego-ajustes` — `CGRequestScreenCaptureAccess()` enseña aviso **una vez**; después solo en Ajustes | `x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture` → «Activa el interruptor de StarSeed OS y, si macOS lo pide, pulsa «Salir y volver a abrir»» | Si `CGPreflightScreenCaptureAccess()`=false y nunca se llamó a `CGRequestScreenCaptureAccess()` = **falta**; si la app está en la lista pero el interruptor está **apagado** = **denegado a mano** |
| **accesibilidad** | `AXIsProcessTrusted()` (bool, vivo sin reiniciar) | `aviso-luego-ajustes` — `AXIsProcessTrustedWithOptions({kAXTrustedCheckOptionPrompt:true})` enseña aviso con «Abrir Ajustes» | `x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility` → «Activa el interruptor de StarSeed OS (te pedirá tu contraseña o Touch ID: eso lo haces tú)» | `AXIsProcessTrusted()`=false y nunca se mostró prompt = **falta**; app en lista pero interruptor **apagado** = **denegado a mano** |
| **monitor-entrada** | `IOHIDCheckAccess()` (concedido/negado/desconocido) | `aviso-luego-ajustes` — `IOHIDRequestAccess(kIOHIDRequestTypeListenEvent)` | `x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent` → «Activa el interruptor de StarSeed OS» | `kIOHIDAccessTypeUnknown` = **falta** · `kIOHIDAccessTypeDenied` = **denegado a mano** |
| **automatizacion** | `AEDeterminePermissionToAutomateTarget` (por app destino) | `por-uso` — primer Apple Event a cada app pregunta | `x-apple.systempreferences:com.apple.preference.security?Privacy_Automation` → «Se rellena sola la primera vez que StarSeed OS maneja otra app: allí activa la app que quieras» | No hay API global. Por app destino: `no` = denegado para esa app; nunca se intentó = **falta** |
| **bluetooth** | `CBManager.authorization` (enum) | `aviso-sistema` (al arrancar CoreBluetooth) | `x-apple.systempreferences:com.apple.preference.security?Privacy_Bluetooth` → «Activa el interruptor de StarSeed OS» | `notDetermined` = **falta** · `denied` = **denegado a mano** |
| **red-local** | **No hay API pública**; se deduce si la malla local responde | `aviso-sistema` (al primer envío multicast/local) | `x-apple.systempreferences:com.apple.preference.security?Privacy_LocalNetwork` → «Activa el interruptor de StarSeed OS (macOS 15+; en versiones anteriores no existe)» | No hay API. Si malla local no responde tras configurarla = **probablemente denegado**; si nunca se intentó = **falta** |
| **ubicacion-wifi** | `CLLocationManager.authorizationStatus()` | `aviso-sistema` (`requestWhenInUseAuthorization`) | `x-apple.systempreferences:com.apple.preference.security?Privacy_LocationServices` → «Activa «Localización» arriba y el interruptor de StarSeed OS» | **Mismo permiso que `ubicacion`**: `notDetermined` = falta · `denied` = denegado a mano |
| **ubicacion** | `CLLocationManager.authorizationStatus()` | `por-uso` — aviso solo al pulsar «Usar mi ubicación» | `x-apple.systempreferences:com.apple.preference.security?Privacy_LocationServices` → «Activa «Localización» arriba y el interruptor de StarSeed OS» | Igual que `ubicacion-wifi` (es el **mismo** permiso del sistema) |
| **notificaciones** | Plugin notificaciones: `isPermissionGranted` (no distingue negado de sin preguntar) | `aviso-sistema` (plugin) | `x-apple.systempreferences:com.apple.preference.notifications` → «Busca StarSeed OS en la lista y activa «Permitir notificaciones»» | Plugin: `denied` puede ser denegado a mano **o** nunca preguntado. Si nunca se pidió = **falta** |
| **llamadas** | Entitlement + configuración en Ajustes > Notificaciones > StarSeed OS | `solo-ajustes` | `x-apple.systempreferences:com.apple.preference.notifications` → «En «Permitir en segundo plano» activa StarSeed OS» | Si app no tiene entitlement o no está en lista = **falta**; si está en lista pero desactivado = **denegado a mano** |
| **arranque** | Plugin autostart: `fondo_estado.arranque_con_sistema` | `aviso-sistema` (la app lo activa; macOS avisa «Ítem de fondo añadido») | `x-apple.systempreferences:com.apple.LoginItems-Settings.extension` → «En «Permitir en segundo plano» activa StarSeed OS» | Si `arranque_con_sistema`=false = **falta o denegado**; la app lo activa ella, así que si no está = no se pidió o se quitó |
| **carpetas** | **No hay API**; selector de carpetas concede la elegida | `por-uso` | `x-apple.systempreferences:com.apple.preference.security?Privacy_FilesAndFolders` → «Activa las carpetas que quieras compartir bajo StarSeed OS» | No hay API. Si selector no muestra opción = **falta**; si carpeta en lista pero desactivada = **denegado a mano** |
| **disco-completo** | **No hay API pública** (leer TCC.db prohibido por §1) | `solo-ajustes` | `x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles` → «Activa el interruptor de StarSeed OS y reabre la app» | No hay API. Si app no abre rutas fuera de sandbox = **falta o denegado**; **no se puede distinguir** |
| **capacidades** | `recursos_ia_detectar`, `info_neurona`, `NSProcessInfo.thermalState` | `nada-sistema` | — (no hace falta) | No aplica: no se pide |

---

### 3.2 Android (12 – 16; probado en SM-X900 con Android 16)

| Permiso | Cómo se detecta | Cómo se pide | Enlace directo a Ajustes | Distinguir «falta» vs «denegado a mano» |
|---|---|---|---|---|
| **cercanos** | `ContextCompat.checkSelfPermission(NEARBY_WIFI_DEVICES)` + `BLUETOOTH_SCAN/CONNECT/ADVERTISE` | `aviso-sistema` | Ficha app > Permisos > «Dispositivos cercanos» > «Permitir» | `shouldShowRequestPermissionRationale` **true** = denegado antes (falta o denegado) · **false** y no concedido = **nunca se pidió (falta)** |
| **ubicacion** | `ContextCompat.checkSelfPermission(ACCESS_FINE_LOCATION/COARSE_LOCATION)` | `por-uso` (solo al pulsar «Usar mi ubicación») | Ficha app > Permisos > «Ubicación» > «Permitir solo mientras la app está en uso» (+ «Usar ubicación precisa») | Igual que `cercanos` |
| **nfc** | `NfcAdapter.isEnabled()` | `declaracion-manifiesto` (normal, sin pregunta) | — (no hace falta) | Se concede al declarar en manifiesto |
| **notificaciones** | `NotificationManagerCompat.areNotificationsEnabled()` | `aviso-sistema` (POST_NOTIFICATIONS, 13+) | Ajustes > Aplicaciones > StarSeed OS > Notificaciones > «Permitir notificaciones» | `shouldShowRequestPermissionRationale` true = **denegado a mano** · false = **falta** |
| **microfono** | `ContextCompat.checkSelfPermission(RECORD_AUDIO)` | `aviso-sistema` (dos negativas = ya no pregunta) | Ficha app > Permisos > «Micrófono» > «Permitir solo mientras la app está en uso» | Igual que notificaciones |
| **camara** | `ContextCompat.checkSelfPermission(CAMERA)` | `aviso-sistema` | Ficha app > Permisos > «Cámara» > «Permitir solo mientras la app está en uso» | Igual que micrófono |
| **llamadas** | `Settings.canDrawOverlays(USE_FULL_SCREEN_INTENT)` (14+) | `solo-ajustes` | Ajustes > Aplicaciones > Acceso especial > Notificaciones a pantalla completa > «Permitir notificaciones a pantalla completa» | Si `canDrawOverlays`=false = **falta o denegado**; no hay rationale |
| **pantalla** | **No se puede leer antes de pedir** (MediaProjection) | `por-uso` — `createScreenCaptureIntent()` pide confirmación **cada sesión** | Diálogo MediaProjection del sistema → «Elige «Pantalla completa» o «Una sola app» y pulsa «Empezar ahora»» | Cada sesión es nueva: **no hay estado persistente** |
| **accesibilidad** | `Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES` contiene el servicio | `solo-ajustes` — `ACTION_ACCESSIBILITY_SETTINGS` | Ajustes > Accesibilidad > Aplicaciones instaladas > «StarSeed OS» > activar > confirmar «Permitir». Si gris: ⋮ > «Permitir ajustes restringidos» | Servicio **no está en lista** = **falta** · está pero **desactivado** = **denegado a mano** |
| **superposicion** | `Settings.canDrawOverlays()` | `solo-ajustes` — `ACTION_MANAGE_OVERLAY_PERMISSION` | Ajustes > Aplicaciones > Acceso especial > Mostrar sobre otras apps > StarSeed OS > «Permitir mostrar sobre otras apps» | `canDrawOverlays()`=false = **falta o denegado**; no hay rationale |
| **bateria** | `PowerManager.isIgnoringBatteryOptimizations()` | `aviso-sistema` (diálogo `ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`) | Diálogo del sistema «¿Permitir que StarSeed OS ignore las optimizaciones de batería?» → «Permitir» | Diálogo **no se mostró** = **falta** · se mostró y denegó = **denegado a mano** |
| **todos-archivos** | `Environment.isExternalStorageManager()` | `solo-ajustes` — `ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION` | Ajustes > Aplicaciones > Acceso especial > Acceso a todos los archivos > StarSeed OS > «Permitir acceso para administrar todos los archivos» | `isExternalStorageManager()`=false = **falta o denegado**; no hay rationale |
| **instalar** | `PackageManager.canRequestPackageInstalls()` | `solo-ajustes` — `ACTION_MANAGE_UNKNOWN_APP_SOURCES` | Ajustes > Aplicaciones > Acceso especial > Instalar apps desconocidas > StarSeed OS > «Permitir desde esta fuente» | `canRequestPackageInstalls()`=false = **falta o denegado**; no hay rationale |
| **no-molestar** | `NotificationManager.isNotificationPolicyAccessGranted()` | `solo-ajustes` — `ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS` | Ajustes > Notificaciones > Acceso a No molestar > StarSeed OS > «Permitir acceso a No molestar» | `isNotificationPolicyAccessGranted()`=false = **falta o denegado**; no hay rationale |
| **escribir-ajustes** | `Settings.System.canWrite()` | `solo-ajustes` — `ACTION_MANAGE_WRITE_SETTINGS` | Ajustes > Aplicaciones > Acceso especial > Modificar ajustes del sistema > StarSeed OS > «Permitir modificar los ajustes del sistema» | `canWrite()`=false = **falta o denegado**; no hay rationale |
| **capacidades** | `ActivityManager`, `BatteryManager`, `PowerManager.getThermalHeadroom()` | `nada-sistema` | — | No aplica |
| **bluetooth** | Ver `cercanos` (12+ usa mismo permiso) | `aviso-sistema` | Ver `cercanos` | Ver `cercanos` |
| **red-local** | Android 16 anuncia protección opcional; hoy **nada** | `nada-sistema` | — | No aplica |
| **ubicacion-wifi** | Mismo permiso que `ubicacion` | `por-uso` | Ver `ubicacion` | Ver `ubicacion` |
| **arranque** | `RECEIVE_BOOT_COMPLETED` + servicio en primer plano (declaración) | `declaracion-manifiesto` | — | Se concede al instalar |

---

### 3.3 Windows 10/11 (apps de escritorio sin empaquetar)

| Permiso | Cómo se detecta | Cómo se pide | Enlace directo a Ajustes | Distinguir «falta» vs «denegado a mano» |
|---|---|---|---|---|
| **bluetooth** | APIs WinRT miran «Radios» | `nada-sistema` (apps de escritorio no piden consentimiento) | `ms-settings:bluetooth` → «Activa «Bluetooth»» | **No aplica**: no se pide permiso a apps de escritorio |
| **red-local** | Firewall de Windows pregunta al primer `listen()` fuera de 127.0.0.1 | `por-uso` | **Sin enlace** (Firewall lo abre Windows) → «Elige «Redes privadas»» | Regla **no existe** = **falta** · existe pero **bloquea** = **denegado a mano** (raro) |
| **ubicacion-wifi** | APIs WLAN (Win11 24H2+) piden «Ubicación» a apps de escritorio | `por-uso` | `ms-settings:privacy-location` → «Activa «Servicios de ubicación» y «Permitir que las aplicaciones de escritorio accedan a tu ubicación»» | No hay API para leer estado global. Si API WLAN falla = **falta o denegado** |
| **ubicacion** | Mapa usa ubicación del navegador (no vía nativa en Windows) | `por-uso` | `ms-settings:privacy-location` → igual que arriba | Igual que `ubicacion-wifi` |
| **notificaciones** | Activadas por defecto | `nada-sistema` | `ms-settings:notifications` → «Activa «Notificaciones» y, en la lista, StarSeed OS» | **No aplica**: activadas por defecto |
| **microfono** | Permitido salvo que se apague global «Permitir apps de escritorio» | `por-uso` | `ms-settings:privacy-microphone` → «Activa «Permitir que las aplicaciones de escritorio accedan al micrófono»» | No hay API global. Si captura falla = **falta o denegado** |
| **camara** | Permitida salvo que se apague global «Permitir apps de escritorio» | `por-uso` | `ms-settings:privacy-webcam` → «Activa «Permitir que las aplicaciones de escritorio accedan a la cámara»» | Igual que micrófono |
| **pantalla** | Graphics Capture (borde amarillo) — **no pide permiso** | `nada-sistema` | — (no hace falta) | **No aplica** |
| **accesibilidad** | `SendInput` funciona salvo UIPI (ventanas elevadas) y Secure Desktop | `nada-sistema` | — (no hace falta) | **No aplica**: no se pide (saltarlo exige `uiAccess=true` firmado en Program Files) |
| **arranque** | App lo activa (autostart en Registro/Startup) | `aviso-sistema` | `ms-settings:startupapps` → «Activa StarSeed OS en la lista» | Entrada autostart **no existe** = **falta** · existe pero **desactivada** = **denegado a mano** |
| **capacidades** | WMI, Core Audio, `WmiMonitorBrightnessMethods`, `Windows.Devices.Radios` | `nada-sistema` | — | No aplica |

---

### 3.4 Linux X11

| Permiso | Cómo se detecta | Cómo se pide | Enlace directo a Ajustes | Distinguir «falta» vs «denegado a mano» |
|---|---|---|---|---|
| **bluetooth** | BlueZ por D-Bus (polkit solo al emparejar) | `nada-sistema` | — | **No aplica** |
| **red-local** | Sin aislamiento de red | `nada-sistema` | — | **No aplica** |
| **notificaciones** | libnotify / D-Bus | `nada-sistema` | — | **No aplica** |
| **microfono** | WebKitGTK/PipeWire decide por origen | `nada-sistema` | **Sin enlace** → «Mira Sonido > Entrada y que el micrófono no esté silenciado» | En X11 **no hay aislamiento**: si no funciona = config escritorio, no permiso |
| **camara** | WebKitGTK/PipeWire decide por origen | `nada-sistema` | **Sin enlace** → «Comprueba que no la use otra app» | Igual que micrófono |
| **pantalla** | X11: cualquier cliente lee la pantalla | `nada-sistema` | — | **No aplica** |
| **accesibilidad** | XTest (enigo) — cualquier app manda teclas/clics | `nada-sistema` | — | **No aplica** |
| **arranque** | `.desktop` en `~/.config/autostart` | `aviso-sistema` (la app crea la entrada) | **Sin enlace** → «StarSeed OS crea su entrada en ~/.config/autostart; para quitarla, bórrala desde el gestor de inicio de tu escritorio» | `.desktop` **no existe** = **falta** · existe pero **desactivado** = **denegado a mano** |
| **capacidades** | procfs, sysfs, lm-sensors | `nada-sistema` | — | No aplica |

---

### 3.5 Linux Wayland

| Permiso | Cómo se detecta | Cómo se pide | Enlace directo a Ajustes | Distinguir «falta» vs «denegado a mano» |
|---|---|---|---|---|
| **pantalla** | Portal `org.freedesktop.portal.ScreenCast` con selector | `por-uso` (cada sesión; *restore token* opcional) | **Aviso-sistema** → «Elige la pantalla o ventana y pulsa «Compartir»» | **Cada sesión es nueva**: no hay estado persistente. Portal deniega = **denegado en esa sesión** |
| **accesibilidad** | Portal `RemoteDesktop` (pregunta cada sesión); enigo **no funciona** salvo libei experimental | `por-uso` (cada sesión) | **Aviso-sistema** → «Pulsa «Permitir» en el diálogo del portal» | Igual que pantalla: **sin estado persistente** |
| *Resto* | Igual que X11 | Igual que X11 | Igual que X11 | Igual que X11 |

---

### 3.6 iOS / iPadOS (16 – 18; solo PWA y navegador — no hay app nativa Tauri)

| Permiso | Cómo se detecta | Cómo se pide | Enlace directo a Ajustes | Distinguir «falta» vs «denegado a mano» |
|---|---|---|---|---|
| **microfono** | `navigator.permissions.query({name:'microphone'})` | `por-uso` (getUserMedia) | Ajustes > StarSeed OS > Permisos > «Activa «Micrófono»» | `prompt` = **falta** · `denied` = **denegado a mano** |
| **camara** | `navigator.permissions.query({name:'camera'})` | `por-uso` (getUserMedia) | Ajustes > StarSeed OS > Permisos > «Activa «Cámara»» | Igual que micrófono |
| **pantalla** | `getDisplayMedia()` (iOS 15+ Safari / PWA) | `por-uso` | Selector de compartición iOS → «Elige «Pantalla» o «Ventana» y pulsa «Iniciar transmisión»» | **Cada sesión nueva**; `navigator.permissions.query({name:'display-capture'})` no implementado en Safari |
| **ubicacion** | `navigator.permissions.query({name:'geolocation'})` | `por-uso` | Ajustes > StarSeed OS > Permisos > «Activa «Ubicación» y elige «Mientras se usa la app» o «Siempre»» | `prompt` = **falta** · `denied` = **denegado a mano** |
| **ubicacion-wifi** | **Mismo permiso que `ubicacion`** | `por-uso` | Ver `ubicacion` | Ver `ubicacion` |
| **bluetooth** | Web Bluetooth `requestDevice()` (requiere interacción usuario) | `por-uso` | Aviso Web Bluetooth en Safari → «Pulsa «Permitir» cuando el navegador lo pida al escanear» | No hay API de permisos en Safari. `requestDevice()` rechaza = **denegado en esa sesión** |
| **red-local** | iOS 14+ aviso «Red local» al primer mDNS/SSDP | `aviso-sistema` | Ajustes > StarSeed OS > Permisos > «Activa «Red local»» | Aviso **no salió** = **falta** · salió y denegó = **denegado a mano** (se ve en Ajustes > StarSeed OS > Red local) |
| **notificaciones** | `Notification.permission` (PWA/web push Safari 16.4+) | `aviso-sistema` | Ajustes > StarSeed OS > Permisos/Notificaciones > «Activa «Permitir notificaciones»» | `default` = **falta** · `denied` = **denegado a mano** |
| **nfc** | **No expuesto en iOS Safari/PWA** | `no-aplica` | — | **No aplica** |
| **almacenamiento** | File System Access API **no en iOS**; file picker nativo | `por-uso` | Selector de archivos iOS → «Elige el archivo o carpeta» | **Cada picker nuevo**; no hay estado persistente |
| **capacidades** | `navigator.deviceMemory`, `navigator.hardwareConcurrency`, Battery API | `nada-sistema` | — | No aplica |

---

## 4. Adaptación por tipo de medio (app-instalada, navegador, navegador-claude, local)

En **PWA instalada (`app-instalada`)**, **navegador normal (`navegador`)**, **navegador de Claude (`navegador-claude`)** y **localhost (`local`)**:

| Permiso nativo | Adaptación en web/PWA |
|---|---|
| `pantalla` | `por-uso` vía `getDisplayMedia()`; selector del navegador cada vez |
| `accesibilidad` | `no-aplica` (web no controla otras apps ni lee entrada global) |
| `monitor-entrada` | `no-aplica` |
| `automatizacion` | `no-aplica` |
| `bluetooth` | `por-uso` vía Web Bluetooth `requestDevice()` |
| `red-local` | `no-aplica` (WebRTC/mDNS sin permiso separado) |
| `ubicacion` / `ubicacion-wifi` | `por-uso` vía Geolocation API |
| `notificaciones` | `aviso-sistema` vía Notification API / Push API |
| `almacenamiento` / `archivos` | `por-uso` vía File System Access API (donde exista) o file picker |
| `superposicion` | `no-aplica` (web no dibuja sobre otras apps) |
| `arranque` | `no-aplica` (PWA usa `beforeinstallprompt` / service worker) |
| `bateria` / `energia` | `no-aplica` (web no controla optimizaciones de batería del SO) |
| `instalar` | `no-aplica` (PWA se instala vía `beforeinstallprompt`) |
| `todos-archivos` / `disco-completo` / `carpetas` | `por-uso` vía File System Access API / file picker |
| `no-molestar` / `escribir-ajustes` | `no-aplica` |
| `capacidades` | `nada-sistema` (APIs web: `navigator.deviceMemory`, `hardwareConcurrency`, Battery API) |
| `cercanos` | `no-aplica` (Web Bluetooth cubre BLE; Wi-Fi Aware/Direct no en web) |
| `llamadas` | `no-aplica` (web no tiene pantalla de bloqueo nativa) |

**En iOS/iPadOS (`so: "ios" | "ipados"`)** los enlaces `directo`/`lista` se convierten en `ficha-app` apuntando a **Ajustes > StarSeed OS > Permisos**, porque iOS no tiene deep links a pantallas de permisos individuales.

---

## 5. Reglas de petición (algoritmo)

Código de referencia: `src/lib/permisos/matriz.ts` → `accionParaPermiso(def, estado, yaPedido)`

```
SI def.fase > FASE_ACTUAL          → "mas-adelante" (se enseña, no se pide)
SI estado == "concedido"           → "listo"
SEGÚN def.como:
  "nada-sistema" | "declaracion-manifiesto" → "nada"
  "por-uso"                          → "por-uso"
  "solo-ajustes"                     → "abrir-ajustes"
  "aviso-luego-ajustes"              → SI yaPedido O estado=="denegado" → "abrir-ajustes" SINO → "pedir"
  "aviso-sistema"                    → SI estado=="denegado" → "abrir-ajustes" SINO → "pedir"
  "no-aplica"                        → "nada"
```

**Regla PRM1119:** al instalar y al abrir la app, recorrer `permisosParaMedio(medioActual)` y para cada uno con `esAccionable(accion) == true` y que la persona **no haya visto antes** (`vistos` no incluye el id), ejecutar la acción (`pedir` o `abrir-ajustes`). Si la persona **denegó a mano** (`estado == "denegado"`), **no volver a pedir automáticamente**; en la lista se muestra con estado «Denegado: se cambia en Ajustes» y botón «Abrir ajustes» (si `hayBoton(enlace)`).

---

## 6. Detección del medio actual

`detectarMedio()` (puro, en `matriz.ts`) lee:
- `window.__TAURI__` / `__TAURI_INTERNALS__` → `app-nativa`
- `navigator.userAgent` contiene `Electron` + `Claude` → `navegador-claude`
- `matchMedia("(display-mode: standalone)")` o `navigator.standalone` → `app-instalada`
- `location.host` es `localhost` / `127.0.0.1` / `[::1]` → `local`
- Resto → `navegador`

Sistema operativo por `navigator.userAgent`:
- `Macintosh` / `Mac OS X` (sin iPhone/iPad) → `macos`
- `iPhone` → `ios`
- `iPad` → `ipados`
- `Android` → `android`
- `Windows` → `windows`
- `Linux` → `linux-x11` (fallback; nativo corrige a `linux-wayland` si `WAYLAND_DISPLAY`)

Contexto extra:
- `process.stdout.isTTY` → `terminal`
- TV / plegable: requieren CSS media queries o UA específico (pendiente)

---

## 7. Verificación en todas las pantallas (matriz de comprobación)

| Tamaño | Entrada | Sistemas | Estados |
|---|---|---|---|
| 280 (plegable cerrado) | táctil | iOS, Android | claro/oscuro, loading, error, alto contraste, motion reducido |
| 360×780 (móvil) | táctil | iOS, Android | ídem |
| 430×932 (móvil grande) | táctil | iOS, Android | ídem |
| 768×1024 (tablet) | táctil + puntero | iPadOS, Android tablet | ídem |
| 1024×1366 (tablet pro) | táctil + puntero | iPadOS, Android tablet | ídem |
| 1280×800 (portátil) | puntero | macOS, Windows, Linux | ídem |
| 1920×1080 (escritorio) | puntero | macOS, Windows, Linux | ídem |
| 3840×2160 (TV/4K) | puntero + mando | tvOS, Android TV, web TV | ídem |

**Puerta:** sin overflow horizontal, sin texto cortado, contraste ≥ 4.5:1, dianas ≥ 44 px, cero errores de consola.

---

## 8. Archivos del repo

| Archivo | Qué contiene |
|---|---|
| `src/lib/permisos/matriz.ts` | **Módulo puro** con la matriz, `detectarMedio()`, `accionParaPermiso()`, `textoEstadoPermiso()`, `medioTienePendientes()`, tipos y constantes. **Solo funciones puras** (entrada → salida). |
| `src/lib/permisos/__tests__/matriz.test.ts` | Tests de todas las funciones puras exportadas (cobertura: detección, acciones, textos, matrices por SO/medio). |
| `starseed_memory_root/olas/cola-permisos-por-medio-1119.json` | Cola de 3–6 tareas para aplicar la matriz por medio (ver abajo). |
| `src/lib/nativa/permisos-registro.ts` | Registro existente para app nativa (macOS, Android, Windows, Linux) — **fuente de verdad para `app-nativa`**. |
| `src/lib/nativa/permisos-enlaces.ts` | Enlaces directos a Ajustes para app nativa — **fuente de verdad para enlaces `app-nativa`**. |
| `src/lib/neurons/medio.ts` | Definición de `TipoMedio` y `detectarMedio()` cliente (usada por la UI). |

---

## 9. Cola de tareas (resumen)

Ver `starseed_memory_root/olas/cola-permisos-por-medio-1119.json` para el JSON completo. Resumen:

| ID | Título | Archivos | Depende | Prompt (resumen) |
|---|---|---|---|---|
| `PRM1119A` | Integrar `matriz.ts` en asistente de permisos nativo | `src/lib/nativa/permisos-inicio.ts`, `src/lib/nativa/permisos-inicio-ejecutor.ts` | — | Usar `permisosParaMedio(detectarMedio())` en lugar de `registroDe(sistema)` para cubrir PWA/web |
| `PRM1119B` | UI: lista de permisos por medio en Ajustes de neurona | `src/components/nativa/lista-permisos.tsx`, `src/components/nativa/asistente-permisos.tsx` | `PRM1119A` | Mostrar `enlace.pantalla` + `enlace.pulsa` + botón «Abrir ajustes» si `hayBoton`; distinguir «falta»/«denegado» con `distinguirFaltaDeDenegado` |
| `PRM1119C` | Web/PWA: pedir permisos al abrir si faltan | `src/app/(app)/layout.tsx` o provider raíz, `src/lib/permisos/gancho-inicio.ts` (nuevo) | `PRM1119A` | Al montar la app, si `medioTienePendientes(medio, vistos, estados, yaPedidos)`, abrir asistente |
| `PRM1119D` | iOS/PWA: deep links a Ajustes > StarSeed OS > Permisos | `src/lib/permisos/enlaces-ios.ts` (nuevo), tests | `PRM1119A` | Implementar `ficha-app` para iOS; probar en iPhone/iPad real |
| `PRM1119E` | Linux Wayland: detectar sesión y usar portales | `native/src-tauri/src/permisos_sistema.rs` (sesión Wayland), `src/lib/permisos/matriz.ts` | — | Añadir detección `WAYLAND_DISPLAY` / `XDG_SESSION_TYPE` en `sistemaDePermisos` y `detectarMedio` |
| `PRM1119F` | Tests de integración: matriz completa en CI | `src/lib/permisos/__tests__/matriz.integracion.test.ts` (nuevo) | `PRM1119A`..`E` | Probar `accionParaPermiso` para cada par (permiso, medio) con estados mock |

---

## 10. Referencias cruzadas

- `architecture/permisos-y-control-del-dispositivo.md` §2 (matriz nativa), §5 (fase 1), §6 (fases futuras)
- `architecture/permisos-enlaces-directos.md` (tabla de enlaces, vigila `permisos-enlaces.test.ts`)
- `src/lib/nativa/permisos-registro.ts` (registro único nativo)
- `src/lib/nativa/permisos-enlaces.ts` (enlaces directos nativos)
- `src/lib/neurons/medio.ts` (tipos de medio y detección cliente)
- `memory/diseno/armonia.md` (matriz de comprobación de tamaños/sistemas)
- `memory/orquestacion-economica.md` §0 (puertas: tsc → vitest → next build)

---

*Documento vivo: se actualiza cuando se añade un permiso, un medio o cambia la API de un sistema. Versión actual: **1** (2026-11-19).*