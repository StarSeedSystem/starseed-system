# Contrato · Permisos completos por medio (PRM1119 · parte 1 de 3)

> **Tarea:** `PRM1119B-d1` · **Ola:** `PRM1119` · **Fecha:** 2026-11-21 · **Estado:** contrato; esta
> parte **no escribe código de producto**. La parte 2 escribe `src/lib/permisos/matriz.ts` y sus
> pruebas; la parte 3 abre la cola por medio en `starseed_memory_root/olas/`.

> **Pedido de Alex (19-11):** revisar los permisos completos de **todos** los sistemas —macOS,
> Android, Linux, Windows, iOS, navegadores web, terminal y cualquier medio donde se use StarSeed
> OS— y pedirlos desde la instalación o al abrir la app cuando se detecte que faltan, **salvo los
> que la persona haya denegado a mano**. Nunca se concede nada por la persona.

> **Base leída:** `AUDITORIA-PRM.md`; `architecture/permisos-y-control-del-dispositivo.md` (§1, §2,
> §5); `architecture/permisos-enlaces-directos.md`; `src/lib/nativa/permisos-registro.ts`;
> `src/lib/nativa/permisos-enlaces.ts`; `src/lib/permisos/{contrato,permission-engine}.ts`;
> `src/lib/aurora/senses/request-permission.ts`; `native/src-tauri/src/permisos_sistema.rs`;
> `native/src-tauri/Info.plist`; y `memory/diseno/{identidades,armonia,referencias}.md`.

## 0 · Convenciones y límites honestos

- **[verificado]**: leído en el código de este repositorio (`archivo:línea`). **[conocimiento]**:
  se sabe de fuera y **hay que medirlo en un aparato** antes de prometerlo. **[por medir]**: ni
  siquiera hay una implementación en este árbol que lo haga.
- **Este documento no sustituye** el contrato de referencia `architecture/permisos-y-control-del-
  dispositivo.md`; lo ordena **por medio** y fija la regla de «falta» frente a «denegado a mano».
  Donde ambos discrepan, manda el contrato de referencia y se corrige este.
- **iOS:** hoy no hay app nativa publicada; iPhone/iPad usan la PWA o el navegador
  (`architecture/apps-nativas-segundo-pleno.md`: «Sin app nativa»). Lo de iOS en la matriz es
  **[conocimiento]/[por medir]**, no una promesa. Lo mismo vale para una futura app Tauri iOS:
  necesita su `Info.ios.plist` y sus pruebas en aparato.
- **Terminal:** no es una app con diálogos de permiso. Sus permisos son del **sistema** (TCC,
  grupos, udev, polkit, firewall) y se conceden a la persona, al binario o al servicio, no al
  código de StarSeed. El terminal **hereda** el permiso del proceso padre; por eso un servicio de
  launchd con `zsh` como primer argumento puede leer la carpeta y no su contenido
  (`CLAUDE.md` §💠, trampa 4).
- **Nada de este documento concede nada.** Abrir una pantalla de Ajustes deja el interruptor en
  manos de la persona. Escribir en TCC.db, usar `tccutil`, `pm grant`, `appops set`, pulsar
  diálogos por guion o perfiles MDM/PPPC está prohibido (contrato §1); prueba
  `src/lib/nativa/__tests__/permisos-registro.test.ts` › «nada de la app se autoconcede».

## 1 · Vocabulario de estado (el mismo en todos los medios)

| Estado | Qué significa | Qué hace StarSeed |
|---|---|---|
| `concedido` | El sistema confirma que el permiso está dado. | No vuelve a pedirlo; lo muestra como listo. |
| `falta` | El sistema no lo tiene y **no consta** que la persona lo haya negado. | Lo pide **solo si es útil** y en el momento justo. |
| `denegado-a-mano` | La persona lo negó o lo revocó expresamente. | **No lo vuelve a pedir solo**; lo muestra con «Abrir ajustes» si hay enlace. |
| `por-uso` | El sistema pregunta **cada vez** que se usa; no existe una concesión previa. | No lo pide al abrir: lo pide al usarlo, en el gesto de la persona. |
| `no-aplica` | Ese medio no pide ese permiso (lo da, lo declara o no lo tiene). | Lo dice; no abre una pantalla que no existe. |
| `no-disponible` | El medio no soporta la capacidad (navegador sin File System Access, Android WebView sin `getDisplayMedia`…). | Lo dice y ofrece la alternativa real. |
| `desconocido` | El sistema **no deja leer** el estado (macOS Accesibilidad, red local, disco completo; Windows micro/cámara; iOS red local). | Se trata como `falta` **solo si no hay constancia de negativa**; si la hay, `denegado-a-mano`. |

**Regla de oro de la distinción:** `desconocido` **nunca** se convierte en `denegado-a-mano` por
sospecha. Para pasar de uno a otro hace falta **evidencia**: o el sistema lo dice, o consta que
la persona ya vio el aviso y aun así no hay concesión, o consta que antes estaba concedido y ahora
no. Sin evidencia, es `falta` y se puede pedir una vez.

## 2 · Matriz permiso × medio (detectar, pedir, enlace a ajustes)

### 2.1 macOS

| Permiso | Cómo se detecta | Cómo se pide | ¿Hay enlace a ajustes? | Comentario |
|---|---|---|---|---|
| microfono | AVCaptureDevice.authorizationStatusForMediaType("audio") | aviso (iOS) | Sí | TCC |
| camara | AVCaptureDevice.authorizationStatusForMediaType("video") | aviso | Sí | TCC |
| pantalla | CGPreflightScreenCaptureAccess() | aviso→panel (macOS 15+ pide reabrir) | Sí | TCC |
| accesibilidad | AXIsProcessTrusted() | aviso→panel | Sí | TCC |
| monitor-entrada | IOHIDCheckAccess() | aviso→panel | Sí | TCC |
| ubicacion | CLLocationManager.authorizationStatus() | por-uso | Sí | TCC |
| bluetooth | CBManager.authorization | aviso (al arrancar CoreBluetooth) | Sí | TCC |
| red-local | No se lee (se deduce de respuesta de malla) | aviso (primer envío multicast) | Sí | TCC (macOS 15+) |
| notificaciones | Plugin Tauri (isPermissionGranted) | aviso | Sí | TCC |
| arranque | fondo_arranque plugin | aviso (plugin autostart) | Sí | Preferencias > Usuarios y grupos > Lista de inicio |

**Diferencias macOS:**
- **Accesibilidad, pantalla, monitor-entrada:** `AXIsProcessTrusted()` devuelve `true` si concedido, `false` si denegado, `nil` si nunca preguntado. No distingue denegado de sin-preguntar.
- **Red local:** macOS no expone API para leer este permiso; se deduce de si la malla local responde.
- **Notificaciones:** El plugin Tauri (`isPermissionGranted`) no distingue «denegado» de «sin preguntar».

**TCC «denied» ⇒ diceDenegado.**
**AntesConcedido ⇒ antesConcedido** (se revocó).
**Accesibilidad, red local, disco completo, entrada virtual** no se leen ⇒ `ilegible`, nunca denegado por sospecha.

### 2.2 Android

| Permiso | Cómo se detecta | Cómo se pide | ¿Hay enlace a ajustes? | Comentario |
|---|---|---|---|---|
| microfono | checkSelfPermission(Manifest.permission.RECORD_AUDIO) | aviso | Sí | Ficha de la app |
| camara | checkSelfPermission(Manifest.permission.CAMERA) | aviso | Sí | Ficha de la app |
| notificaciones | checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) | aviso (Android 13+) | Sí | Ficha de la app |
| cercanos | checkSelfPermission (Bluetooth + Wi-Fi Direct) | aviso | Sí | Ficha de la app |
| ubicacion | checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) | por-uso | Sí | Ficha de la app |
| pantalla | N/A (MediaProjection pide en each session) | por-uso | N/A | Pregunta al compartir |
| accesibilidad | Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES | panel | Sí | Ajustes > Accesibilidad > Aplicaciones instaladas |
| superposicion | Settings.canDrawOverlays() | panel | Sí | Ajustes > Aplicaciones > Acceso especial |
| bateria | Settings.Secure.isIgnoringBatteryOptimizations() | aviso (diálogo) | Sí | Diálogo del sistema |
| todos-archivos | Environment.isExternalStorageManager() | panel | Sí | Ajustes > Aplicaciones > Acceso especial |
| instalar | Settings.Secure.canRequestPackageInstalls() | panel | Sí | Ajustes > Aplicaciones > Acceso especial |
| no-molestar | Settings.Secure.isNotificationPolicyAccessGranted() | panel | Sí | Ajustes > Notificaciones > Acceso a No molestar |
| escribir-ajustes | Settings.System.canWrite() | panel | Sí | Ajustes > Aplicaciones > Acceso especial |

**Diferencias Android:**
- **denegado con rationale en falso y ya pedido ⇒ diceDenegado** (el sistema ya no pregunta).
- **denegado con rationale en verdadero ⇒ falta** (aún se puede preguntar).
- **pantalla:** por-uso, se pide al compartir, no hay pantalla de ajustes persistente.
- **Bluetooth/Android 12+:** usa `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, `NEARBY_WIFI_DEVICES`.

### 2.3 Windows

| Permiso | Cómo se detecta | Cómo se pide | ¿Hay enlace a ajustes? | Comentario |
|---|---|---|---|---|
| microfono | Intentar usar (sin API de lectura) | por-uso | Sí | ms-settings:privacy-microphone |
| camara | Intentar usar (sin API de lectura) | por-uso | Sí | ms-settings:privacy-webcam |
| ubicacion | Intentar usar (sin API de lectura) | por-uso | Sí | ms-settings:privacy-location |
| notificaciones | Activadas por defecto; intentar enviar | nada | Sí | ms-settings:notifications |
| bluetooth | WinRT.Windows.Devices.Radios | nada | Sí | ms-settings:bluetooth |
| pantalla | No pide permiso (Graphics Capture) | nada | No | Marca con borde amarillo |
| accesibilidad | No pide permiso para mandar teclas | nada | No | UIPI protege ventanas elevadas |
| arranque | Leer estado del proceso | aviso | Sí | ms-settings:startupapps |

**Diferencias Windows:**
- **Windows 10/11:** Apps de escritorio no piden permiso explícito para Bluetooth, pantalla, control.
- **Firewall:** Pregunta la primera vez que la app escucha en la red local.
- **Privacidad:** Solo se puede leer el estado intentando usar la capacidad.

### 2.4 Linux (X11 y Wayland)

| Permiso | X11 | Wayland |
|---|---|---|
| pantalla | nada (cualquier cliente puede leer) | por-uso (portal ScreenCast) |
| control (teclado/ratón) | nada (XTest) | por-uso (portal RemoteDesktop) |
| micrófono/cámara | WebKitGTK pregunta | igual; PipeWire/portal Camera |
| bluetooth | nada (BlueZ por D-Bus) | igual |
| notificaciones | nada | nada |
| arranque | .desktop en autostart | igual (portal Background) |
| red-local | nada | nada |
| accesibilidad | nada (XTest) | por-uso (portal Desktop) |

**Diferencias Linux:**
- **X11:** No hay aislamiento: cualquier app puede leer pantalla y mandar entrada.
- **Wayland:** Los portales `org.freedesktop.portal.ScreenCast` y `RemoteDesktop` preguntan por uso.
- **No hay enlace único:** Cada escritorio (GNOME, KDE) tiene su pantalla de permisos.

### 2.5 iOS / Web (PWA y navegadores)

| Permiso | Cómo se detecta | Cómo se pide | ¿Hay enlace a ajustes? |
|---|---|---|---|
| microfono | navigator.permissions.query({name:'microphone'}) | aviso (getUserMedia) | Sí (ficha de la app) |
| camara | navigator.permissions.query({name:'camera'}) | aviso (getUserMedia) | Sí |
| ubicacion | navigator.permissions.query({name:'geolocation'}) | aviso | Sí |
| notificaciones | navigator.permissions.query({name:'notifications'}) | aviso | Sí |
| pantalla | Captura de pantalla PWA: invita a usar app nativa | nada | No |
| bluetooth | BluetoothPermissionStatus (Web Bluetooth) | aviso | Sí |

**Diferencias iOS/Web:**
- **iOS:** No hay app nativa; solo PWA. Los permisos se gestionan en la ficha de la app.
- **Web:** La Permissions API devuelve `granted`, `denied`, `prompt`. Sin soporte nativo, `no-disponible`.

### 2.6 Terminal

| Permiso | Cómo se detecta | Comentario |
|---|---|---|
| todos | Ninguno (hereda del proceso padre) | El terminal no tiene diálogos. Sus permisos son de TCC, grupos, udev, polkit del binario. |

**Regla terminal:** `pistaTerminal()` explica que hereda los permisos del proceso padre; no hay diálogo propio.

## 3 · Enlaces directos a pantallas de Ajustes

Ver `src/lib/nativa/permisos-enlaces.ts` para la tabla `TABLA` y las funciones `enlaceDe()`, `hayBoton()`, `textoEnlace()`.

### 3.1 macOS (enlaces fiables)

- Bluetooth: `x-apple.systempreferences:com.apple.preference.security?Privacy_Bluetooth`
- Micrófono: `x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone`
- Cámara: `x-apple.systempreferences:com.apple.preference.security?Privacy_Camera`
- Ubicación: `x-apple.systempreferences:com.apple.preference.security?Privacy_LocationServices`
- Pantalla: `x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture`
- Accesibilidad: `x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility`
- Monitorización de entrada: `x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent`
- Notificaciones: `x-apple.systempreferences:com.apple.preference.notifications`

### 3.2 Windows

- Bluetooth: `ms-settings:bluetooth`
- Micrófono: `ms-settings:privacy-microphone`
- Cámara: `ms-settings:privacy-webcam`
- Ubicación: `ms-settings:privacy-location`
- Notificaciones: `ms-settings:notifications`
- Arranque: `ms-settings:startupapps`

### 3.3 Android

- Todos los permisos especiales: `android.settings.APPLICATION_DETAILS_SETTINGS` con el paquete
- Superposición: `ACTION_MANAGE_OVERLAY_PERMISSION`
- Todos los archivos: `ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION`
- Notificaciones: `ACTION_APP_NOTIFICATION_SETTINGS`
- Accesibilidad: `ACTION_ACCESSIBILITY_SETTINGS`

## 4 · Distinguir «falta» de «denegado a mano»

| Medio | Cómo distinguir |
|---|---|
| macOS | TCC devuelve «denied» ⇒ diceDenegado. Si no se puede leer ⇒ ilegible. |
| Android | `checkSelfPermission === DENIED` y `shouldShowRequestPermissionRationale === false` ⇒ denegado-a-mano. Si `rationale === true` ⇒ falta. |
| Windows | No hay API de lectura. Se deduce de intentar usar o ver si el interruptor está apagado en ajustes manuales. |
| Linux | No hay registro único. Sin portal ⇒ desconocido. Portal pregunta ⇒ por-uso. |
| iOS | Permissions API: `denied` ⇒ denegado-a-mano. Sin soporte ⇒ no-disponible. |
| Web | Permissions API: mismos estados. getUserMedia falla con NotAllowedError ⇒ denegado. |

## 5 · Regla de oro de la distinción

`desconocido` **nunca** se convierte en `denegado-a-mano` por sospecha. Para pasar de uno a otro
hace falta **evidencia**: o el sistema lo dice, o consta que la persona ya vio el aviso y aun así
no hay concesión, o consta que antes estaba concedido y ahora no. Sin evidencia, es `falta` y
se puede pedir una vez.

<!-- SECCIONES -->
<!-- Aquí continúan las secciones detalladas por medio -->