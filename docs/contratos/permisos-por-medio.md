# Matriz de permisos por medio — StarSeed OS

**Versión:** 1.0 (2026-11-19) · **Contrato:** PRM1119 · **Fuente de verdad:** `src/lib/permisos/matriz.ts`

Este documento define la matriz real **permiso × medio** para todos los sistemas donde corre StarSeed OS. Cada celda explica: cómo se detecta el estado, cómo se pide, si hay enlace directo a ajustes, y cómo distinguir «falta» de «denegado a mano».

---

## 1. Medios cubiertos

| Código | Medio | Descripción |
|--------|-------|-------------|
| `macos` | macOS (app nativa Tauri / PWA en Safari) | App de escritorio firmada o PWA instalada |
| `windows` | Windows 10/11 (app nativa Tauri / PWA en Edge) | App de escritorio o PWA instalada |
| `linux-x11` | Linux X11 (app nativa / PWA en Chrome/Firefox) | Sesión gráfica X11 |
| `linux-wayland` | Linux Wayland (app nativa / PWA en Chrome/Firefox) | Sesión Wayland (GNOME, KDE, Sway…) |
| `android` | Android (app nativa / PWA en Chrome) | App instalada (APK/AAB) o PWA |
| `ios` | iOS / iPadOS (PWA en Safari) | Solo PWA: no hay app nativa firmada |
| `web-chrome` | Navegador Chrome/Edge (desktop) | Origen seguro (https:// o localhost) |
| `web-firefox` | Navegador Firefox (desktop) | Origen seguro |
| `web-safari` | Navegador Safari (desktop) | Origen seguro |
| `web-embedded` | Visor embebido (Claude, Electron, Tauri webview) | Sin diálogos de permiso del sistema |
| `terminal` | Terminal (CLI, SSH, scripts) | Sin interfaz gráfica; permisos por entorno |

---

## 2. Permisos canónicos

| ID | Nombre | Categoría | Descripción breve |
|----|--------|-----------|-------------------|
| `microfono` | Micrófono | Comunicación | Captura de audio para llamadas, voz, grabaciones |
| `camara` | Cámara | Comunicación | Captura de vídeo para videollamadas, visión |
| `pantalla` | Grabación/compartir pantalla | Pantalla-Control | Compartir ventana o pantalla completa en llamadas, prestar ventana, Astraura ve |
| `accesibilidad` | Accesibilidad / Control del aparato | Pantalla-Control | Enviar teclas/clics a otras apps; control remoto entre neuronas, Astraura actúa |
| `monitor-entrada` | Monitorización de entrada | Pantalla-Control | Detectar uso de teclado/ratón para pausar control remoto |
| `ubicacion` | Ubicación precisa (GPS) | Malla | Situar el aparato en el mapa de Señales; «Usar mi ubicación» |
| `ubicacion-wifi` | Ubicación (nombres de Wi-Fi) | Malla | Ver SSID de redes cercanas para red directa (macOS/Windows) |
| `cercanos` | Dispositivos cercanos (Bluetooth/Wi-Fi P2P) | Malla | Anunciarse y conectar por Bluetooth, Wi-Fi Aware, Wi-Fi Direct |
| `bluetooth` | Bluetooth clásico / BLE | Malla | Comunicación directa con otras neuronas cercanas |
| `red-local` | Red local (descubrimiento mDNS/UPnP) | Malla | Encontrar otras neuronas en la misma red sin internet |
| `nfc` | NFC | Malla | Enlazar dos aparatos acercándolos |
| `notificaciones` | Notificaciones push/sistema | Comunicación | Avisos de mensajes/llamadas con app cerrada |
| `llamadas` | Llamadas en pantalla de bloqueo | Comunicación | Llamada a pantalla completa con teléfono bloqueado (Android) |
| `almacenamiento` | Almacenamiento persistente (Storage API) | Archivos | Persistencia de datos en navegador (IndexedDB, Cache) |
| `archivos` | Archivos y carpetas (File System Access) | Archivos | Acceso a carpetas elegidas por el usuario (Chromium) |
| `carpetas` | Carpetas protegidas (Escritorio, Documentos, Descargas) | Archivos | Acceso a carpetas del sistema que piden confirmación |
| `disco-completo` | Acceso total al disco | Archivos | Compartir cualquier carpeta/volumen sin elegir una a una (macOS) |
| `todos-archivos` | Acceso a todos los archivos | Archivos | Acceso amplio al sistema de archivos (Android 11+) |
| `segundo-plano` | Ejecución en segundo plano | Segundo-Plano | Mantener la neurona viva con pantalla apagada |
| `arranque` | Autoarranque al iniciar sesión | Segundo-Plano | Neurona disponible sin abrir la app manualmente |
| `bateria` | Sin límite de optimización de batería | Segundo-Plano | Antenas vivas con pantalla apagada (Android/macOS) |
| `superposicion` | Mostrar sobre otras apps | Pantalla-Control | Aviso visible de «te están controlando», orbe Astraura (Android) |
| `automatizacion` | Automatización de otras apps | Pantalla-Control | Astraura pide acciones a otras apps (macOS) |
| `no-molestar` | Acceso a No Molestar | Sistema | Centro de control enciende/apaga No Molestar real |
| `escribir-ajustes` | Modificar ajustes del sistema | Sistema | Centro de control cambia brillo real de pantalla (Android) |
| `instalar` | Instalar apps de fuentes desconocidas | Sistema | Auto-actualización desde canal StarSeed (Android) |
| `capacidades` | Leer capacidades del aparato | Sistema | CPU, RAM, disco, batería, temperatura (sin pedir nada) |

---

## 3. Matriz completa: Permiso × Medio

### 3.1 micrófono

| Medio | ¿Se detecta? | Cómo se pide | Enlace a ajustes | «Falta» vs «Denegado a mano» |
|-------|--------------|--------------|------------------|------------------------------|
| `macos` | Sí (`navigator.permissions.query({name:'microphone'})`) | Aviso nativo del sistema al llamar `getUserMedia()` | **Directo**: Ajustes del Sistema › Privacidad y seguridad › Micrófono | `denied` = denegado a mano; `prompt` = falta |
| `windows` | Parcial (solo si usuario cambió global) | Por uso: `getUserMedia()` pide si global está ON | **Directo**: Configuración › Privacidad y seguridad › Micrófono | No hay `denied` distinguible; si global OFF → «falta» |
| `linux-x11` | No | No pide (PulseAudio/PipeWire sin permisos app) | **Sin-enlace**: Ajustes de sonido › Entrada | Siempre «falta» (no hay denegado app) |
| `linux-wayland` | No | Portal de PipeWire pide al compartir | **Aviso**: Selector de PipeWire cada uso | «Falta» hasta que el usuario elige en el portal |
| `android` | Sí (`PermissionManager.checkPermission`) | Aviso nativo al instalar o primer uso | **Ficha**: Ajustes › Apps › StarSeed OS › Permisos › Micrófono | `DENIED` = denegado a mano; no asked = falta |
| `ios` (PWA) | Sí (`navigator.permissions.query`) | Aviso Safari al primer `getUserMedia()` | **Directo**: Ajustes › Safari › Micrófono | `denied` = denegado; `prompt` = falta |
| `web-chrome` | Sí (`navigator.permissions.query`) | Diálogo Chrome al primer `getUserMedia()` | **Directo**: 🔒 › Configuración del sitio › Micrófono | `denied` = denegado a mano; `prompt` = falta |
| `web-firefox` | Sí | Diálogo Firefox al primer uso | **Directo**: 🛡️ › Permisos › Micrófono | `denied` = denegado; `prompt` = falta |
| `web-safari` | Sí | Diálogo Safari al primer uso | **Directo**: Safari › Ajustes › Sitios web › Micrófono | `denied` = denegado; `prompt` = falta |
| `web-embedded` | No (visor suprime diálogos) | **No se puede pedir** | **Aviso**: «Abre en tu navegador» | Siempre «no disponible en este visor» |
| `terminal` | No | N/A | N/A | N/A |

---

### 3.2 cámara

| Medio | ¿Se detecta? | Cómo se pide | Enlace a ajustes | «Falta» vs «Denegado a mano» |
|-------|--------------|--------------|------------------|------------------------------|
| `macos` | Sí (`navigator.permissions.query({name:'camera'})`) | Aviso nativo al llamar `getUserMedia({video:true})` | **Directo**: Ajustes del Sistema › Privacidad y seguridad › Cámara | `denied` = denegado a mano; `prompt` = falta |
| `windows` | Parcial | Por uso: `getUserMedia()` si global ON | **Directo**: Configuración › Privacidad y seguridad › Cámara | Igual que micrófono |
| `linux-x11` | No | No pide (V4L2 sin permisos app) | **Sin-enlace**: Ajustes de privacidad del escritorio | Siempre «falta» |
| `linux-wayland` | No | Portal de PipeWire al compartir | **Aviso**: Selector PipeWire cada uso | «Falta» hasta elección en portal |
| `android` | Sí | Aviso nativo al instalar/primer uso | **Ficha**: Ajustes › Apps › StarSeed OS › Permisos › Cámara | `DENIED` = denegado; no asked = falta |
| `ios` (PWA) | Sí | Aviso Safari al primer uso | **Directo**: Ajustes › Safari › Cámara | `denied` = denegado; `prompt` = falta |
| `web-chrome` | Sí | Diálogo Chrome al primer uso | **Directo**: 🔒 › Configuración del sitio › Cámara | `denied` = denegado; `prompt` = falta |
| `web-firefox` | Sí | Diálogo Firefox | **Directo**: 🛡️ › Permisos › Cámara | `denied` = denegado; `prompt` = falta |
| `web-safari` | Sí | Diálogo Safari | **Directo**: Safari › Ajustes › Sitios web › Cámara | `denied` = denegado; `prompt` = falta |
| `web-embedded` | No | **No se puede** | **Aviso**: «Abre en tu navegador» | «No disponible en este visor» |
| `terminal` | No | N/A | N/A | N/A |

---

### 3.3 pantalla (grabación/compartir)

| Medio | ¿Se detecta? | Cómo se pide | Enlace a ajustes | «Falta» vs «Denegado a mano» |
|-------|--------------|--------------|------------------|------------------------------|
| `macos` | Sí (`navigator.permissions.query({name:'screen-capture'})` no estándar; se deduce por `getDisplayMedia`) | `getDisplayMedia()` → aviso nativo; **tras denegar, solo en Ajustes** | **Directo**: Ajustes del Sistema › Privacidad y seguridad › Grabación de pantalla y audio del sistema | `denied` o error `NotAllowedError` = denegado a mano; si no पूछा = falta |
| `windows` | Sí (borde en ventana compartida) | `getDisplayMedia()` → selector Windows; **no hay permiso previo** | **No-hace-falta**: Windows no pide permiso para capturar | Siempre «falta» (se resuelve al usar) |
| `linux-x11` | No | `getDisplayMedia()` → **cualquier app ve todo** (X11) | **No-hace-falta**: X11 no protege pantalla | Siempre «falta» (no hay denegado) |
| `linux-wayland` | No | `getDisplayMedia()` → **portal Wayland** pregunta cada vez | **Aviso**: Selector del portal (GNOME/KDE) cada uso | «Falta» hasta elección en portal |
| `android` | No (solo al usar) | `getDisplayMedia()` → **diálogo sistema cada vez** (Android 10+) | **Aviso**: Diálogo «Grabar pantalla» cada inicio | No hay estado previo; siempre «por uso» |
| `ios` (PWA) | No | `getDisplayMedia()` → **no soportado en Safari iOS** | **Sin-enlace**: No disponible en PWA iOS | Siempre «no disponible» |
| `web-chrome` | Parcial | `getDisplayMedia()` → selector Chrome | **Directo**: 🔒 › Configuración del sitio › Pantalla (solo si se dio antes) | `denied` = denegado; `prompt` = falta |
| `web-firefox` | Parcial | `getDisplayMedia()` → selector Firefox | **Directo**: 🛡️ › Permisos › Pantalla | `denied` = denegado; `prompt` = falta |
| `web-safari` (desktop) | Parcial | `getDisplayMedia()` → selector Safari | **Directo**: Safari › Ajustes › Sitios web › Pantalla | `denied` = denegado; `prompt` = falta |
| `web-embedded` | No | **No se puede** | **Aviso**: «Abre en tu navegador» | «No disponible en este visor» |
| `terminal` | No | N/A | N/A | N/A |

---

### 3.4 accesibilidad (control del aparato)

| Medio | ¿Se detecta? | Cómo se pide | Enlace a ajustes | «Falta» vs «Denegado a mano» |
|-------|--------------|--------------|------------------|------------------------------|
| `macos` | Sí (AXIsProcessTrustedWithOptions) | **Aviso-y-panel**: primera vez aviso; luego **solo en Ajustes** | **Directo**: Ajustes del Sistema › Privacidad y seguridad › Accesibilidad | `denied` o `kAXTrustedCheckOptionPrompt=NO` false = denegado; `prompt` = falta |
| `windows` | No (no hay API estándar) | **No pide**; apps escritorio mandan input salvo admin/UAC | **No-hace-falta**: No hay permiso (no llega a admin/login) | Siempre «falta» (limitación de Windows) |
| `linux-x11` | No | **No pide**; XTEST/X11 permite input | **No-hace-falta**: X11 no restringe | Siempre «falta» |
| `linux-wayland` | No | **Portal Escritorio Remoto** pide cada sesión | **Aviso**: Portal (GNOME/KDE) cada sesión | «Falta» hasta permitir en portal |
| `android` | Sí (`AccessibilityManager.isEnabled`) | **Panel**: Ajustes › Accesibilidad › Apps instaladas › StarSeed OS | **Lista**: Ajustes › Accesibilidad › Apps instaladas | `enabled=false` = denegado/falta; no hay distinción nativa |
| `ios` (PWA) | No | **No disponible** en PWA | **Sin-enlace**: No hay acceso en PWA iOS | Siempre «no disponible» |
| `web-*` | No | **No disponible** en web | N/A | N/A |
| `terminal` | No | N/A | N/A | N/A |

---

### 3.5 monitor-entrada (monitorización de entrada)

| Medio | ¿Se detecta? | Cómo se pide | Enlace a ajustes | «Falta» vs «Denegado a mano» |
|-------|--------------|--------------|------------------|------------------------------|
| `macos` | Sí (AXIsProcessTrusted) | **Aviso-y-panel**: como Accesibilidad | **Directo**: Ajustes del Sistema › Privacidad y seguridad › Monitorización de entrada | Igual que Accesibilidad |
| `windows` | No | No existe | N/A | N/A |
| `linux-*` | No | No existe | N/A | N/A |
| `android` | No | No existe como permiso separado | N/A | N/A |
| `ios` | No | No existe | N/A | N/A |
| `web-*` | No | No disponible | N/A | N/A |

---

### 3.6 ubicación (GPS precisa)

| Medio | ¿Se detecta? | Cómo se pide | Enlace a ajustes | «Falta» vs «Denegado a mano» |
|-------|--------------|--------------|------------------|------------------------------|
| `macos` | Sí (`navigator.permissions.query({name:'geolocation'})`) | **Por-uso**: al pulsar «Usar mi ubicación» | **Directo**: Ajustes del Sistema › Privacidad y seguridad › Localización | `denied` = denegado; `prompt` = falta |
| `windows` | Parcial | **Por-uso**: mapa usa geolocation del navegador | **Directo**: Configuración › Privacidad y seguridad › Ubicación | `denied` = denegado; `prompt` = falta |
| `linux-x11` | Parcial | Geolocation del navegador (si hay Wi-Fi/DB) | **Sin-enlace**: Configuración del escritorio › Privacidad | `denied` = denegado; `prompt` = falta |
| `linux-wayland` | Parcial | Igual que X11 | Igual | Igual |
| `android` | Sí | **Por-uso**: al pulsar «Usar mi ubicación» (Android 12+ permite aproximada) | **Ficha**: Ajustes › Apps › StarSeed OS › Permisos › Ubicación | `DENIED` = denegado; no asked = falta |
| `ios` (PWA) | Sí | **Por-uso**: Safari pregunta al usar geolocation | **Directo**: Ajustes › Safari › Ubicación | `denied` = denegado; `prompt` = falta |
| `web-*` | Sí | **Por-uso**: diálogo navegador al usar geolocation | **Directo**: 🔒/🛡️ › Permisos › Ubicación | `denied` = denegado; `prompt` = falta |
| `web-embedded` | No | **No se puede** | **Aviso**: «Abre en tu navegador» | «No disponible en este visor» |

---

### 3.7 ubicación-wifi (nombres de redes Wi-Fi)

| Medio | ¿Se detecta? | Cómo se pide | Enlace a ajustes | «Falta» vs «Denegado a mano» |
|-------|--------------|--------------|------------------|------------------------------|
| `macos` | Parcial (se deduce si malla local responde) | **Aviso**: mismo permiso «Localización» que GPS | **Directo**: Ajustes del Sistema › Privacidad y seguridad › Localización | Igual que `ubicacion` (mismo permiso sistema) |
| `windows` | No | **Por-uso**: Windows 11 24H2+ pide «Ubicación» para ver SSID | **Directo**: Configuración › Privacidad y seguridad › Ubicación | `denied` = denegado; `prompt` = falta |
| `linux-*` | No | No pide (NM/DBus sin permiso app) | N/A | N/A |
| `android` | No (usa `cercanos` para Bluetooth/Wi-Fi P2P) | N/A | N/A | N/A |
| `ios` | No | N/A | N/A | N/A |
| `web-*` | No | N/A (web no ve SSID) | N/A | N/A |

---

### 3.8 cercanos (Bluetooth / Wi-Fi P2P / Wi-Fi Aware)

| Medio | ¿Se detecta? | Cómo se pide | Enlace a ajustes | «Falta» vs «Denegado a mano» |
|-------|--------------|--------------|------------------|------------------------------|
| `macos` | No (se deduce por respuesta malla) | **No pide** directo; usa `bluetooth` + `red-local` | N/A | N/A |
| `windows` | No | No pide | N/A | N/A |
| `linux-*` | No | No pide | N/A | N/A |
| `android` | Sí (`NearbyDevicesPermission`) | **Aviso**: diálogo «Dispositivos cercanos» al instalar/usar | **Ficha**: Ajustes › Apps › StarSeed OS › Permisos › Dispositivos cercanos | `DENIED` = denegado; no asked = falta |
| `ios` (PWA) | No | No disponible en PWA | N/A | N/A |
| `web-*` | No | Web Bluetooth API pide por dispositivo, no global | **Aviso**: Selector de dispositivo cada uso | No hay estado global |

---

### 3.9 bluetooth (clásico / BLE)

| Medio | ¿Se detecta? | Cómo se pide | Enlace a ajustes | «Falta» vs «Denegado a mano» |
|-------|--------------|--------------|------------------|------------------------------|
| `macos` | Sí (`navigator.bluetooth?.getAvailability()` + `permissions.query`) | **Aviso**: Web Bluetooth pide por dispositivo; nativo: aviso al usar | **Directo**: Ajustes del Sistema › Privacidad y seguridad › Bluetooth | `denied` = denegado; `prompt`/disponible = falta |
| `windows` | Sí (nativo) | **No pide** para apps escritorio | **Directo**: Configuración › Bluetooth y dispositivos | Siempre «falta» (no hay denegado app) |
| `linux-*` | Sí (BlueZ/D-Bus) | **No pide** | **No-hace-falta**: Solo hace falta Bluetooth encendido | Siempre «falta» |
| `android` | Sí | Incluido en `cercanos` (permiso `BLUETOOTH_CONNECT`/`SCAN`) | **Ficha**: Ajustes › Apps › StarSeed OS › Permisos › Dispositivos cercanos | `DENIED` = denegado; no asked = falta |
| `ios` (PWA) | No | Web Bluetooth **no soportado en Safari iOS** | N/A | Siempre «no disponible» |
| `web-chrome` | Sí | Web Bluetooth: selector por dispositivo | **Aviso**: Selector cada uso | No hay estado global |
| `web-firefox` | No | No implementado | N/A | N/A |
| `web-safari` | No | No implementado | N/A | N/A |

---

### 3.10 red-local (descubrimiento mDNS/UPnP/SSDP)

| Medio | ¿Se detecta? | Cómo se pide | Enlace a ajustes | «Falta» vs «Denegado a mano» |
|-------|--------------|--------------|------------------|------------------------------|
| `macos` | Parcial (se deduce si malla responde) | **Aviso**: macOS 15+ pide «Red local» al primer bind | **Directo**: Ajustes del Sistema › Privacidad y seguridad › Red local | `denied` = denegado; `prompt` = falta |
| `windows` | No (Firewall pregunta al escuchar) | **Por-uso**: Firewall de Windows al primer listen | **Sin-enlace**: Firewall de Windows (elige «Redes privadas») | No hay estado app; «falta» hasta que Firewall permite |
| `linux-*` | No | **No pide** | **No-hace-falta** | Siempre «falta» |
| `android` | Sí (`CHANGE_WIFI_MULTICAST_STATE`, `ACCESS_WIFI_STATE`) | **Al instalar** (permisos normales) | **No-hace-falta**: Se conceden al instalar | Siempre concedido si app instalada |
| `ios` (PWA) | Sí (`NSLocalNetworkUsageDescription`) | **Al instalar/primer uso**: aviso «Buscar dispositivos en la red» | **Directo**: Ajustes › StarSeed OS › Red local | `denied` = denegado; `prompt` = falta |
| `web-*` | No | Web no tiene mDNS/UPnP nativo | N/A | N/A |

---

### 3.11 nfc

| Medio | ¿Se detecta? | Cómo se pide | Enlace a ajustes | «Falta» vs «Denegado a mano» |
|-------|--------------|--------------|------------------|------------------------------|
| `macos` | No | No disponible | N/A | N/A |
| `windows` | No | No disponible para apps | N/A | N/A |
| `linux-*` | No | No estándar | N/A | N/A |
| `android` | Sí (`NFC` permission) | **Declaración**: en `AndroidManifest.xml`; no pide al usuario | **No-hace-falta**: Basta con NFC encendido en el aparato | Siempre «falta» (no hay denegado) |
| `ios` | No | No en PWA | N/A | N/A |
| `web-*` | No | Web NFC (solo Chrome Android, origen seguro) | **Aviso**: Selector cada uso | No hay estado global |

---

### 3.12 notificaciones

| Medio | ¿Se detecta? | Cómo se pide | Enlace a ajustes | «Falta» vs «Denegado a mano» |
|-------|--------------|--------------|------------------|------------------------------|
| `macos` | Parcial (`Notification.permission` + `UNUserNotificationCenter`) | **Aviso**: `Notification.requestPermission()` | **Lista**: Ajustes del Sistema › Notificaciones › StarSeed OS | `denied` = denegado; `default` = falta |
| `windows` | No (activadas por defecto) | **No pide**; se apagan en Configuración | **Directo**: Configuración › Sistema › Notificaciones › StarSeed OS | Siempre «falta» (no hay denegado app) |
| `linux-*` | No | **No pide** (libnotify/dbus) | **No-hace-falta** | Siempre «falta» |
| `android` | Sí (`NotificationManager.areNotificationsEnabled`) | **Aviso**: `POST_NOTIFICATIONS` (Android 13+) al instalar/primer uso | **Directo**: Ajustes › Apps › StarSeed OS › Notificaciones | `areNotificationsEnabled=false` = denegado/falta |
| `ios` (PWA) | Sí (`Notification.permission`) | **Aviso**: Safari pide al llamar `requestPermission()` | **Directo**: Ajustes › Notificaciones › StarSeed OS | `denied` = denegado; `default` = falta |
| `web-*` | Sí (`Notification.permission`) | **Aviso**: `Notification.requestPermission()` | **Directo**: 🔒/🛡️ › Permisos › Notificaciones | `denied` = denegado; `default` = falta |
| `web-embedded` | No | **No se puede** | **Aviso**: «Abre en tu navegador» | «No disponible en este visor» |

---

### 3.13 llamadas (pantalla de bloqueo)

| Medio | ¿Se detecta? | Cómo se pide | Enlace a ajustes | «Falta» vs «Denegado a mano» |
|-------|--------------|--------------|------------------|------------------------------|
| `macos` | No | No existe | N/A | N/A |
| `windows` | No | No existe | N/A | N/A |
| `linux-*` | No | No existe | N/A | N/A |
| `android` | Sí (`NotificationManager.canUseFullScreenIntents`) | **Panel**: Ajustes › Acceso especial › Notificaciones a pantalla completa | **Directo**: Ajustes › Apps › Acceso especial › Notificaciones a pantalla completa | `false` = denegado/falta; Android 13- no aplica |
| `ios` | No | No en PWA | N/A | N/A |
| `web-*` | No | No estándar | N/A | N/A |

---

### 3.14 almacenamiento (Storage API persistente)

| Medio | ¿Se detecta? | Cómo se pide | Enlace a ajustes | «Falta» vs «Denegado a mano» |
|-------|--------------|--------------|------------------|------------------------------|
| `macos` (web) | Sí (`navigator.storage.persisted()`) | `navigator.storage.persist()` | **No-hace-falta**: Navegador decide | `false` = no persistido (falta); no hay denegado |
| `windows` (web) | Sí | Igual | Igual | Igual |
| `linux-*` (web) | Sí | Igual | Igual | Igual |
| `android` (web) | Sí | Igual | Igual | Igual |
| `ios` (PWA) | Sí | Igual (Safari 15.4+) | Igual | Igual |
| `web-*` | Sí | `navigator.storage.persist()` | **No-hace-falta** | `false` = falta; no hay denegado |
| `native` | N/A | N/A (filesystem nativo) | N/A | N/A |

---

### 3.15 archivos (File System Access API - carpetas)

| Medio | ¿Se detecta? | Cómo se pide | Enlace a ajustes | «Falta» vs «Denegado a mano» |
|-------|--------------|--------------|------------------|------------------------------|
| `macos` (web) | Sí (`'showDirectoryPicker' in window`) | `showDirectoryPicker()` → **selector nativo** | **No-hace-falta**: Usuario elige cada vez | No hay estado persistente; «falta» hasta elegir |
| `windows` (web) | Sí (Chromium) | Igual | Igual | Igual |
| `linux-*` (web) | Sí (Chromium) | Igual | Igual | Igual |
| `android` (web) | Sí (Chrome) | Igual | Igual | Igual |
| `ios` (PWA) | **No** (`showDirectoryPicker` no existe) | **No disponible** | **Sin-enlace**: Usar «subir carpeta» (`<input webkitdirectory>`) | Siempre «no disponible» |
| `web-chrome/edge` | Sí | `showDirectoryPicker()` | **No-hace-falta** | Usuario elige cada vez |
| `web-firefox/safari` | **No** | **No disponible** | **Sin-enlace**: «Subir carpeta» o backend neurona | Siempre «no disponible» |

---

### 3.16 carpetas protegidas (Escritorio, Documentos, Descargas)

| Medio | ¿Se detecta? | Cómo se pide | Enlace a ajustes | «Falta» vs «Denegado a mano» |
|-------|--------------|--------------|------------------|------------------------------|
| `macos` (native) | No (sandbox) | **Por-uso**: selector nativo pide confirmación primera vez | **Directo**: Ajustes del Sistema › Privacidad y seguridad › Archivos y carpetas | No hay estado legible; «falta» hasta que usuario elige |
| `windows` (native) | No | **Por-uso**: selector nativo | **Sin-enlace**: No hay pantalla permisos carpeta | N/A |
| `linux-*` | No | No pide | N/A | N/A |
| `android` | No (usa `todos-archivos`) | N/A | N/A | N/A |
| `ios` | No | N/A | N/A | N/A |
| `web-*` | No | N/A (FSA elige cualquier carpeta) | N/A | N/A |

---

### 3.17 disco-completo / todos-archivos

| Medio | ¿Se detecta? | Cómo se pide | Enlace a ajustes | «Falta» vs «Denegado a mano» |
|-------|--------------|--------------|------------------|------------------------------|
| `macos` (native) | No (sandbox no deja saber) | **Panel**: Ajustes › Privacidad y seguridad › Acceso total al disco | **Directo**: Ajustes del Sistema › Privacidad y seguridad › Acceso total al disco | No legible; se verifica por lo que se puede abrir |
| `android` | Sí (`Environment.isExternalStorageManager`) | **Panel**: Ajustes › Acceso especial › Acceso a todos los archivos | **Directo**: Ajustes › Apps › Acceso especial › Acceso a todos los archivos | `false` = denegado/falta |
| `windows` | No | No existe equivalente | N/A | N/A |
| `linux-*` | No | No existe | N/A | N/A |

---

### 3.18 segundo-plano / arranque / batería

| Permiso | macOS | Windows | Linux | Android | iOS (PWA) | Web |
|---------|-------|---------|-------|---------|-----------|-----|
| `segundo-plano` | `NSApplication` + `LSUIElement` | Service / Startup | systemd/user service / autostart | `FOREGROUND_SERVICE` + notificación | **No** (PWA no corre en bg) | **No** (Service Worker limitado) |
| `arranque` | **Aviso**: Ajustes › General › Ítems de inicio | **Aviso**: Configuración › Apps › Inicio | **Aviso**: `~/.config/autostart/` | `RECEIVE_BOOT_COMPLETED` (al instalar) | **No** | **No** |
| `bateria` | `ProcessInfo.performExpiringActivity` | Power Throttling | `systemd-inhibit` | **Aviso**: «Ignorar optimizaciones» | **No** | **No** |

**Detección:** Solo en nativo (Tauri). En web/PWA: **no disponible**.
**Enlace:** Según tabla arriba (directo/lista/ficha/aviso).
**Falta vs Denegado:** En nativo, `denied` = denegado a mano; no asked = falta. En web: siempre «no disponible».

---

### 3.19 superposición / automatización / no-molestar / escribir-ajustes / instalar

| Permiso | macOS | Windows | Linux | Android | iOS | Web |
|---------|-------|---------|-------|---------|-----|-----|
| `superposicion` | N/A | N/A | N/A | **Panel**: Ajustes › Apps › Acceso especial › Mostrar sobre otras apps | N/A | N/A |
| `automatizacion` | **Por-uso**: macOS pide app por app | N/A | N/A (D-Bus/portal) | N/A | N/A | N/A |
| `no-molestar` | N/A (Shortcuts/Focus) | N/A | N/A | **Panel**: Ajustes › Notificaciones › Acceso a No molestar | N/A | N/A |
| `escribir-ajustes` | N/A | N/A | N/A | **Panel**: Ajustes › Apps › Acceso especial › Modificar ajustes del sistema | N/A | N/A |
| `instalar` | N/A (firmado/notarizado) | N/A (MSIX/Store) | N/A (package manager) | **Panel**: Ajustes › Apps › Acceso especial › Instalar apps desconocidas | N/A | N/A |

---

### 3.20 capacidades (leer hardware)

| Medio | ¿Se detecta? | Cómo se pide | Nota |
|-------|--------------|--------------|------|
| `macos` (native) | Sí (`sysctl`, `IOKit`, `ioreg`) | **No pide** (nada) | CPU, RAM, disco, batería, temp |
| `windows` (native) | Sí (`WMI`, `GetSystemInfo`) | **No pide** | Igual |
| `linux-*` (native) | Sí (`/proc`, `/sys`, `lscpu`) | **No pide** | Igual |
| `android` (native) | Sí (`ActivityManager`, `BatteryManager`) | **No pide** | Igual |
| `ios` (PWA) | Parcial (`navigator.deviceMemory`, `navigator.hardwareConcurrency`) | **No pide** | Solo lo que expone Safari |
| `web-*` | Parcial (`deviceMemory`, `hardwareConcurrency`, `battery` API) | **No pide** | Muy limitado |

---

## 4. Reglas de petición (algoritmo único)

> **Regla canónica** (implementada en `src/lib/permisos/matriz.ts`):
>
> 1. **Al instalar** y **al abrir la app**: consultar qué permisos *útiles* faltan en este medio.
> 2. **Útil** = permiso que alguna función del OS usa en la fase actual (`FASE_ACTUAL = 1`).
> 3. Para cada permiso útil que falte:
>    - Si el estado del sistema es **«concedido»** o **«no-aplica»**: no hacer nada.
>    - Si el estado es **«denegado»**: **no volver a pedir solo**; mostrar en la lista con acción «Abrir ajustes» y texto «Denegado: se cambia en Ajustes».
>    - Si el estado es **«sin-preguntar»**, **«no-concedido»**, **«desconocido»**: pedir **de uno en uno** (regla del navegador/SO), con su porqué honesto.
>    - Si el permiso es **«por-uso»**: no pedir antes; al usar la función, disparar el diálogo del sistema.
>    - Si el permiso es **«panel»**, **«aviso-y-panel»** y ya se pidió una vez (`yaPedido=true`): acción «Abrir ajustes».
> 4. **Omisión**: la persona puede omitir cada permiso o todos; lo omitido cuenta como «visto» y no se vuelve a preguntar solo.
> 5. **Re-apertura**: la lista se vuelve a evaluar al volver a la app (estados se releen); lo que el sistema ya concedió se salta.
> 6. **Nunca autoconceder**: ni base de datos de permisos, ni clics por guion en diálogos del sistema.

---

## 5. Implementación técnica

- **Registro único**: `src/lib/nativa/permisos-registro.ts` (fuente de verdad de qué permisos hay por sistema, cómo se piden, si se leen, fase, funciones).
- **Enlaces directos**: `src/lib/nativa/permisos-enlaces.ts` (pantalla exacta y qué pulsar en cada sistema).
- **Máquina de estados**: `src/lib/nativa/permisos-inicio.ts` (lista, cola, de uno en uno, vistos, omisión).
- **Motor web real**: `src/lib/aurora/senses/request-permission.ts` (petición real en gesto, `estadoPermiso`, `ayudaPermiso`, `entornoPermisos`).
- **Contrato unificado**: `src/lib/permisos/contrato.ts` (tipos `EstadoPermiso`, `PermisoOS`, `ResultadoPermisoOS`, `normalizarEstado`, `estadoDeResultado`).
- **Motor unificado (cliente)**: `src/lib/permisos/permission-engine.ts` (API `PermissionEngine` sobre el contrato).
- **Matriz pura nueva**: `src/lib/permisos/matriz.ts` (este documento en código, con `necesitaParaMedio`, `pedirAlInstalarYAbrir`, tests).

---

## 6. Verificación en todas las pantallas

La matriz debe comprobarse en los tamaños contractuales (`memory/diseno/armonia.md` §Matriz de comprobación):

- **Móvil**: 280, 360×780, 430×932
- **Tablet**: 768×1024
- **Escritorio**: 1024×1366, 1280×800, 1920×1080
- **TV**: 3840×2160
- **Estados**: claro/oscuro, texto largo, loading/vacío/error, alto contraste, movimiento reducido
- **Entrada**: táctil y puntero (dianas ≥ 44 px)
- **Sistemas**: iOS, Android, macOS, Windows, Linux (safe areas, teclado virtual, scroll, fallback tipográfico)
- **Puerta**: sin overflow horizontal, sin texto cortado, contraste ≥ 4.5:1, cero errores de consola