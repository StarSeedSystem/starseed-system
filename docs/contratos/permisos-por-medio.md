# Matriz de permisos por medio — StarSeed OS

**Contrato:** PRM1119B · 2026-11-19
**Fuente única:** `src/lib/permisos/matriz.ts` (módulo puro, sin `node:*`, importable por cliente)
**Documento generado desde el código:** una prueba vigila que no se separen.

---

## 1. Medios (sistemas destino)

| Código | Nombre | Plataformas cubiertas |
|---|---|---|
| `macos` | macOS 13 Ventura – 15 Sequoia (mín. 10.15) | Escritorio nativo (Tauri) |
| `android` | Android 12 – 16 | Móvil/tableta nativo (Tauri/Android) |
| `windows` | Windows 10/11 (apps de escritorio sin empaquetar) | Escritorio nativo (Tauri) |
| `linux-x11` | Linux X11 | Escritorio nativo (Tauri) |
| `linux-wayland` | Linux Wayland | Escritorio nativo (Tauri) |
| `web` | Navegador web (Chromium, Safari, Firefox) | PWA / web publicada |
| `terminal` | Terminal / CLI (sin interfaz gráfica) | Servidor local, scripts |
| `ios` | iOS 15+ (solo PWA, sin app nativa firmada) | iPhone / iPad (Safari/PWA) |

---

## 2. Permisos (catálogo unificado)

| Código | Título | Grupo | Qué permite en StarSeed OS |
|---|---|---|---|
| `bluetooth` | Bluetooth | malla | Hablar directamente con otras neuronas cercanas |
| `red-local` | Red local | malla | Encontrar otras neuronas en la red local |
| `ubicacion-wifi` | Ubicación (nombres de Wi-Fi) | malla | Ver nombres de redes Wi-Fi para conexión directa |
| `ubicacion` | Ubicación (mapa) | malla | Situar el aparato en el mapa de Señales |
| `cercanos` | Dispositivos cercanos | malla | Bluetooth/Wi-Fi P2P (Android) |
| `nfc` | NFC | malla | Enlazar aparatos acercándolos (Android) |
| `notificaciones` | Notificaciones | comunicación | Avisar de mensajes/llamadas con ventana cerrada |
| `microfono` | Micrófono | comunicación | Llamadas, transmisiones, grabaciones |
| `camara` | Cámara | comunicación | Videollamadas, transmisiones, grabaciones |
| `llamadas` | Llamadas en pantalla completa | comunicación | Llamadas a pantalla completa con bloqueo (Android 14+) |
| `pantalla` | Grabación/compartir pantalla | pantalla-control | Compartir pantalla/ventana, prestar ventana, Astraura ve |
| `accesibilidad` | Accesibilidad (controlar aparato) | pantalla-control | Otras neuronas/Astraura pulsan y escriben |
| `monitor-entrada` | Monitorización de entrada | pantalla-control | Pausar control al detectar actividad local |
| `automatizacion` | Automatización de otras apps | pantalla-control | Astraura pide cosas a otras apps (macOS) |
| `superposicion` | Mostrar sobre otras apps | pantalla-control | Aviso de control encima con botón parar (Android) |
| `arranque` | Abrir al iniciar sesión | segundo-plano | Neurona disponible y avisando sin abrirla |
| `bateria` | Sin límite de batería | segundo-plano | Antenas vivas con pantalla apagada (Android) |
| `carpetas` | Carpetas protegidas | archivos | Compartir Escritorio/Documentos/Descargas (macOS) |
| `disco-completo` | Acceso total al disco | archivos | Compartir cualquier carpeta/volumen (macOS) |
| `todos-archivos` | Acceso a todos los archivos | archivos | Compartir cualquier archivo (Android 11+) |
| `instalar` | Instalar apps desconocidas | sistema | Actualizarse sola desde canal StarSeed (Android) |
| `no-molestar` | Acceso a No molestar | sistema | Centro de control enciende/apaga No molestar (Android) |
| `escribir-ajustes` | Modificar ajustes del sistema | sistema | Centro de control cambia brillo real (Android) |
| `capacidades` | Capacidades del aparato | sistema | Leer CPU, RAM, disco, batería, temperatura |

---

## 3. Matriz: Permiso × Medio

### 3.1 Cómo se pide (`como`)

| Permiso | macOS | Android | Windows | Linux X11 | Linux Wayland | Web | Terminal | iOS (PWA) |
|---|---|---|---|---|---|---|---|---|
| `bluetooth` | aviso | aviso | nada | nada | nada | no-disponible | nada | no-disponible |
| `red-local` | aviso | nada | por-uso | nada | nada | no-disponible | nada | aviso |
| `ubicacion-wifi` | aviso | por-uso | por-uso | nada | nada | geolocalización | nada | geolocalización |
| `ubicacion` | por-uso | por-uso | por-uso | nada | nada | geolocalización | nada | geolocalización |
| `cercanos` | — | aviso | — | — | — | no-disponible | — | no-disponible |
| `nfc` | — | declaracion | — | — | — | no-disponible | — | no-disponible |
| `notificaciones` | aviso | aviso | nada | nada | nada | aviso (Notification API) | nada | aviso |
| `microfono` | aviso | aviso | por-uso | nada | nada | aviso (getUserMedia) | nada | aviso |
| `camara` | aviso | aviso | por-uso | nada | nada | aviso (getUserMedia) | nada | aviso |
| `llamadas` | — | panel | — | — | — | no-disponible | — | no-disponible |
| `pantalla` | aviso-y-panel | por-uso | nada | nada | por-uso | aviso (getDisplayMedia) | nada | no-disponible |
| `accesibilidad` | aviso-y-panel | panel | nada | nada | por-uso | no-disponible | nada | no-disponible |
| `monitor-entrada` | aviso-y-panel | — | — | — | — | no-disponible | — | no-disponible |
| `automatizacion` | por-uso | — | — | — | — | no-disponible | — | no-disponible |
| `superposicion` | — | panel | — | — | — | no-disponible | — | no-disponible |
| `arranque` | aviso | declaración | aviso | aviso | aviso | no-disponible | nada | no-disponible |
| `bateria` | — | aviso | — | — | — | no-disponible | — | no-disponible |
| `carpetas` | por-uso | — | — | — | — | selector (showDirectoryPicker) | — | selector |
| `disco-completo` | panel | — | — | — | — | no-disponible | — | no-disponible |
| `todos-archivos` | — | panel | — | — | — | no-disponible | — | no-disponible |
| `instalar` | — | panel | — | — | — | no-disponible | — | no-disponible |
| `no-molestar` | — | panel | — | — | — | no-disponible | — | no-disponible |
| `escribir-ajustes` | — | panel | — | — | — | no-disponible | — | no-disponible |
| `capacidades` | nada | nada | nada | nada | nada | nada | nada | nada |

**Leyenda:**
- `aviso` — la app hace que el sistema pregunte con su propio diálogo
- `aviso-y-panel` — primera vez aviso del sistema; después solo en Ajustes (macOS: Accesibilidad, Pantalla, Monitorización)
- `panel` — solo lo da la persona en una pantalla de Ajustes que la app abre
- `por-uso` — el sistema pregunta cada vez que se usa (o al usarlo la primera vez)
- `declaracion` — basta con declararlo en el manifiesto; nadie pregunta
- `nada` — este sistema no lo pide (ya concedido por defecto o no aplica)
- `no-disponible` — el medio no soporta este permiso
- `selector` — `showDirectoryPicker` / File System Access API
- `geolocalización` — `navigator.geolocation` (API web estándar)

---

### 3.2 Lectura de estado (`lectura`)

| Permiso | macOS | Android | Windows | Linux X11 | Linux Wayland | Web | Terminal | iOS |
|---|---|---|---|---|---|---|---|---|
| `bluetooth` | sí | sí | sí | sí | sí | no | no | no |
| `red-local` | parcial | — | no | sí | sí | no | no | parcial |
| `ubicacion-wifi` | sí | sí | no | no | no | sí | no | sí |
| `ubicacion` | sí | sí | no | no | no | sí | no | sí |
| `cercanos` | — | sí | — | — | — | no | — | no |
| `nfc` | — | sí | — | — | — | no | — | no |
| `notificaciones` | parcial | sí | no | no | no | sí | no | sí |
| `microfono` | sí | sí | no | no | no | sí | no | sí |
| `camara` | sí | sí | no | no | no | sí | no | sí |
| `llamadas` | — | sí | — | — | — | no | — | no |
| `pantalla` | sí | no | sí | sí | no | no | no | no |
| `accesibilidad` | no-concedido* | sí | sí | sí | no | no | no | no |
| `monitor-entrada` | sí | — | — | — | — | no | — | no |
| `automatizacion` | no | — | — | — | — | no | — | no |
| `superposicion` | — | sí | — | — | — | no | — | no |
| `arranque` | sí | sí | sí | sí | sí | no | no | no |
| `bateria` | — | sí | — | — | — | no | — | no |
| `carpetas` | no | — | — | — | — | sí | — | sí |
| `disco-completo` | no | — | — | — | — | no | — | no |
| `todos-archivos` | — | sí | — | — | — | no | — | no |
| `instalar` | — | sí | — | — | — | no | — | no |
| `no-molestar` | — | sí | — | — | — | no | — | no |
| `escribir-ajustes` | — | sí | — | — | — | no | — | no |
| `capacidades` | sí | sí | sí | sí | sí | sí | sí | sí |

* `no-concedido`: macOS no distingue «negado» de «nunca preguntado» en Accesibilidad (`AXIsProcessTrusted` devuelve `false` en ambos casos).

**Leyenda:**
- `sí` — la app puede leer el estado real (`concedido`/`denegado`/`sin-preguntar`)
- `parcial` — a veces, o de forma indirecta (ej. notificaciones macOS: plugin da `isPermissionGranted` pero no distingue `denied` de `default`)
- `no` — el sistema no expone API para leerlo
- `no-concedido` — el sistema devuelve un estado que no distingue negado de sin-preguntar

---

### 3.3 Enlace directo a Ajustes (`enlace`)

| Permiso | macOS | Android | Windows | Linux X11 | Linux Wayland | Web | Terminal | iOS |
|---|---|---|---|---|---|---|---|---|
| `bluetooth` | directo | ficha | directo | no | no | no | no | no |
| `red-local` | directo* | — | sin-enlace | no | no | no | no | no |
| `ubicacion-wifi` | directo | ficha | directo | no | no | no | no | no |
| `ubicacion` | directo | ficha | directo | no | no | no | no | no |
| `cercanos` | — | ficha | — | — | — | no | — | no |
| `nfc` | — | no | — | — | — | no | — | no |
| `notificaciones` | lista | directo | directo | no | no | no | no | no |
| `microfono` | directo | ficha | directo | sin-enlace | sin-enlace | no | no | no |
| `camara` | directo | ficha | directo | sin-enlace | sin-enlace | no | no | no |
| `llamadas` | — | directo | — | — | — | no | — | no |
| `pantalla` | directo | aviso | no | no | aviso | no | no | no |
| `accesibilidad` | directo | lista | no | no | aviso | no | no | no |
| `monitor-entrada` | directo | — | — | — | — | no | — | no |
| `automatizacion` | directo | — | — | — | — | no | — | no |
| `superposicion` | — | directo | — | — | — | no | — | no |
| `arranque` | lista | no | directo | sin-enlace | sin-enlace | no | no | no |
| `bateria` | — | aviso | — | — | — | no | — | no |
| `carpetas` | directo | — | — | — | — | no | — | no |
| `disco-completo` | directo | — | — | — | — | no | — | no |
| `todos-archivos` | — | directo | — | — | — | no | — | no |
| `instalar` | — | directo | — | — | — | no | — | no |
| `no-molestar` | — | lista | — | — | — | no | — | no |
| `escribir-ajustes` | — | directo | — | — | — | no | — | no |
| `capacidades` | no | no | no | no | no | no | no | no |

* macOS 15+; en versiones anteriores no existe este permiso.

**Leyenda:**
- `directo` — se abre la pantalla exacta de ese permiso (interruptor de StarSeed OS)
- `lista` — se abre la categoría; hay que localizar StarSeed OS en la lista
- `ficha` — el sistema no tiene pantalla propia: se abre la ficha de la app → «Permisos»
- `aviso` — no hay pantalla previa: el propio sistema pregunta al usarlo
- `sin-enlace` — el sistema no deja abrir una pantalla fiable; se dice en la interfaz
- `no` — este medio no tiene enlace (no aplica o no hay app nativa)

---

## 4. Detección de «falta» vs «denegado a mano»

| Medio | Cómo se distingue |
|---|---|
| **macOS** | `AVAuthorizationStatus` / `CBManagerAuthorization` / `CLAuthorizationStatus`: `0 = sin-preguntar`, `1|2 = denegado`, `3|4 = concedido`. Accesibilidad y Pantalla: `no-concedido` (no distingue). Red local y notificaciones: solo parcial. |
| **Android** | `PermissionChecker.checkSelfPermission` + `shouldShowRequestPermissionRationale`: si `DENIED` y `rationale = false` → denegado a mano (dos negativas = ya no pregunta). Servicios especiales (accesibilidad, superposición, etc.): `Settings.Secure` / `canDrawOverlays` / `isNotificationPolicyAccessGranted` → `true/false` directo. |
| **Windows** | No hay API pública para leer micrófono/cámara/ubicación/notificaciones. Solo se sabe intentándolo (`getUserMedia` falla, `Geolocation` falla). Firewall: no se lee. |
| **Linux X11** | No hay aislamiento: pantalla y accesibilidad = `no-aplica`. Micrófono/cámara: no hay API unificada; cada escritorio (GNOME/KDE) pone la suya. |
| **Linux Wayland** | Portales: `ScreenCast` y `RemoteDesktop` preguntan en cada sesión; no hay estado persistente legible. Micrófono/cámara: PipeWire + portal Camera (Flatpak) o WebKitGTK. |
| **Web** | `navigator.permissions.query({name})`: `granted`/`denied`/`prompt`. Safari/Firefox: micrófono/cámara/pantalla **no expuestos** en `permissions.query` → `no-disponible` en lectura, solo `pedirPermiso` al usar. `getUserMedia`/`getDisplayMedia`: `NotAllowedError` = denegado; `OverconstrainedError`/`NotFoundError` = no-disponible. |
| **Terminal** | No hay permisos de UI. Solo capacidades del proceso (UID, grupos, capabilities de Linux). |
| **iOS (PWA)** | Igual que Web (Safari): `permissions.query` no expone micrófono/cámara/pantalla. Notificaciones: `Notification.requestPermission` solo en gesto de usuario. Geolocalización: `navigator.geolocation`. No hay `getDisplayMedia` en iOS Safari. |

---

## 5. Regla de petición (implementada en `matriz.ts`)

> **Al instalar y al abrir, pedir lo que falte y sea útil; si la persona lo denegó a mano, no volver a pedirlo solo, pero mostrarlo en la lista con «Abrir ajustes».**

### Algoritmo (puro, sin E/S)

```ts
function accion(permiso: DefPermiso, estado: EstadoSistema, yaPedido: boolean): AccionPermiso {
  // 1. Fases futuras: no se piden todavía
  if (permiso.fase > FASE_ACTUAL) return "mas-adelante";

  // 2. Ya concedido o no aplica en este medio
  if (estado === "concedido" || estado === "no-aplica") return "listo";

  // 3. Según cómo se pide en ESTE medio
  switch (permiso.como) {
    case "nada":
    case "declaracion":
      return "nada";                    // se da solo o no hace falta pedir
    case "por-uso":
      return "por-uso";                 // el sistema pregunta al usarlo
    case "panel":
      return "abrir-ajustes";           // solo en Ajustes
    case "aviso-y-panel":
      return yaPedido || estado === "denegado" ? "abrir-ajustes" : "pedir";
    case "aviso":
      return estado === "denegado" ? "abrir-ajustes" : "pedir";
  }
}
```

### Estados de entrada (`EstadoSistema`)

| Valor | Significado |
|---|---|
| `concedido` | La persona dio el permiso |
| `denegado` | La persona lo negó **explícitamente** (dos negativas en Android, «No» en macOS, etc.) |
| `sin-preguntar` | El sistema nunca mostró el diálogo |
| `no-concedido` | El sistema no distingue negado de sin-preguntar (macOS Accesibilidad/Pantalla) |
| `desconocido` | No se pudo leer (sistema no expone API, o error) |
| `no-aplica` | Este medio no pide este permiso |

### Acciones de salida (`AccionPermiso`)

| Valor | Qué hace la UI |
|---|---|
| `pedir` | Dispara el aviso del sistema (botón «Permitir») |
| `abrir-ajustes` | Abre la pantalla exacta de Ajustes (botón «Abrir ajustes») |
| `por-uso` | No se pide ahora; el sistema lo hará al usar la función |
| `nada` | No hay nada que hacer (ya concedido por defecto o declaración) |
| `mas-adelante` | Llega con una fase posterior del contrato |
| `listo` | Ya concedido o no aplica |

---

## 6. Qué permisos pide cada función del OS (fase actual = 1)

| Función | Permisos obligatorios | Permisos opcionales | Por uso |
|---|---|---|---|
| `malla-radios` | `bluetooth`, `red-local` | `ubicacion-wifi`, `cercanos` | — |
| `mapa-senales` | — | `ubicacion` | — |
| `llamadas` | `microfono`, `camara`, `notificaciones` | — | `pantalla` (compartir) |
| `avisos` | `notificaciones` | — | — |
| `actualizacion-sola` | — | `instalar` (Android) | — |
| `siempre-disponible` | — | `arranque`, `bateria` | — |
| `prestar-ventana` | — | `pantalla`, `accesibilidad` (macOS) | — |
| `compartir-pantalla` | — | — | `pantalla` |
| `astraura-ve` | — | — | `pantalla` |
| `astraura-actua` | — | `accesibilidad`, `monitor-entrada`, `automatizacion`, `superposicion` | — |
| `control-entre-neuronas` | — | `pantalla`, `accesibilidad`, `monitor-entrada`, `superposicion`, `arranque` | — |
| `centro-control-nativo` | — | `no-molestar`, `escribir-ajustes`, `automatizacion` | — |
| `carpetas-compartidas` | — | `carpetas`, `disco-completo`, `todos-archivos` | `carpetas` |
| `prestar-proceso` | — | `capacidades` | — |

> **Regla:** los permisos `opcionales` de la lista son **obligatorios** para la función que los usa. Si falta uno, la función no está `listo`.

---

## 7. Referencias de código

- Matriz pura y lógica: `src/lib/permisos/matriz.ts`
- Tests: `src/lib/permisos/__tests__/matriz.test.ts`
- Registro nativo (fuente histórica): `src/lib/nativa/permisos-registro.ts`
- Enlaces directos: `src/lib/nativa/permisos-enlaces.ts`
- Nativo Tauri: `native/src-tauri/src/permisos_sistema.rs`, `permisos_medios.rs`
- Documentos de arquitectura: `architecture/permisos-y-control-del-dispositivo.md`, `architecture/permisos-enlaces-directos.md`