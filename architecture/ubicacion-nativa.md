# Ubicación nativa del aparato (UBI1114K · 2026-11-14)

Contrato de cómo la web de StarSeed OS sabe dónde está el aparato dentro de la app nativa. Código:
`native/src-tauri/src/ubicacion*.rs`, `native/src-tauri/android/UbicacionStarSeed.kt`,
`src/lib/senales/geo/fuente-posicion.ts`.

## 1. Por qué fallaba (14-11, build de pruebas .42)

| Sistema | Qué pasaba | Certeza | Evidencia |
|---|---|---|---|
| macOS | «Usar mi ubicación» respondía al instante sin que macOS enseñara su aviso | causa **inferida** | wry 0.57 no soporta `PermissionKind::Geolocation` en macOS («macOS / iOS: Not yet supported by platform backends», `wry/src/permissions.rs`), así que la app no puede ni conceder ni pedir nada para el `navigator.geolocation` de WKWebView; la decisión queda en WebKit, que no llegó a preguntar. `permisos_medios.rs:12,370` deja la ubicación en «por defecto». |
| macOS · entitlement | NO es la causa | **confirmada** | `tauri.conf.json` lleva `hardenedRuntime: false`; sin hardened runtime macOS no exige `com.apple.security.personal-information.location`. `Info.plist` ya tenía `NSLocationWhenInUseUsageDescription`. |
| Android | `navigator.geolocation` se deniega sin aviso | **confirmada** (fuente de wry) | `RustWebChromeClient.kt:250-285`: `onGeolocationPermissionsShowPrompt` llama a `definedGeolocationPermissions()`, que solo cuenta los permisos **declarados en el manifiesto**; vacío → `callback.invoke(origin,false,false)` al instante. Ningún parche de `build.rs` declaraba `ACCESS_FINE/COARSE_LOCATION` (el del Bluetooth declara la fina solo hasta Android 11). |
| Android · nadie contesta el aviso | con el manifiesto completo, wry sí pide el permiso en tiempo de ejecución | confirmada (fuente) | mismo método, rama `requestPermissions`. |

## 2. La vía nativa (una para todos)

Comandos (todos con su `allow-…` en `capabilities/default.json` y en `COMANDOS_APP` de `build.rs`):

| Comando | Qué hace |
|---|---|
| `ubicacion_estado` | permiso, interruptor de servicios, si vigila, y dónde se cambia en ESE sistema. **Nunca pregunta.** |
| `ubicacion_ahora(pedir)` | una medida. `pedir: true` solo cuando la persona acaba de pulsar el botón: si el permiso está sin preguntar, sale el aviso del propio sistema. |
| `ubicacion_vigilar` / `ubicacion_parar` | mantiene o corta la medición mientras la vista está abierta. No pregunta. |
| `ubicacion_ultima` | lo último medido, sin esperar. |

Respuesta de medida: `{ ok, fix?: { lat, lon, precision_m, altitud_m, precision_altitud_m, rumbo, velocidad_ms, t_ms, fuente }, error?: { codigo, motivo } }`.
Nada se redondea; `t_ms` es la hora de la **medida**. Códigos: `denegado`, `restringido`, `sin-preguntar`, `servicios-apagados`, `sin-fijar`, `no-disponible`.
«No diste permiso» (`denegado`/`restringido`/`sin-preguntar`) y «el aparato no pudo» (`servicios-apagados`/`sin-fijar`) son mensajes distintos, con cómo cambiarlo en los ajustes de ese sistema (`ubicacion_logica::motivo_de`).

- **macOS** (`ubicacion_macos.rs`): un `CLLocationManager` creado y usado en el hilo principal; sin delegado (se lee `authorizationStatus` y `location`). El aviso: `requestWhenInUseAuthorization`.
- **Android** (`UbicacionStarSeed.kt`, inyectado por `ubicacion_parche.rs`): Rust deja `peticion-<n>.json` en `files/starseed/ubicacion`, Kotlin contesta en `estado.json` (como las llamadas nativas). `LocationManager` con GPS y red; con solo la ubicación aproximada (Android 12+) usa la red y dice «aproximado». El aviso: `Activity.requestPermissions`, solo con `pedir`.
- **Windows y Linux**: `no-disponible`; la web usa la ubicación del navegador.
- **Web**: `fuente-posicion.ts` expone `getCurrentPosition`/`watchPosition`/`clearWatch` con la misma forma que `navigator.geolocation`; usa la nativa si la app la trae y, si responde `no-disponible` (APK anterior), cae al navegador. `watchPosition` nunca pregunta.

## 3. Permisos declarados

- macOS: `Info.plist` (texto honesto de los DOS usos: nombres de Wi-Fi y mapa) y `Entitlements.plist` (`personal-information.location`, audio, cámara, Bluetooth), enlazado desde `tauri.conf.json › bundle.macOS.entitlements`. Con el hardened runtime apagado macOS no exige los derechos; quedan declarados para el día que se encienda. Un derecho no concede nada: lo da la persona en el aviso.
- Android: `ACCESS_FINE_LOCATION` y `ACCESS_COARSE_LOCATION` (siempre los dos, sin tope de versión; `build.rs` aplica este parche **antes** que el del Bluetooth, que entonces no repite la fina) y la función de GPS como opcional. Nunca `ACCESS_BACKGROUND_LOCATION`. Interruptor de emergencia: `STARSEED_SIN_UBICACION_ANDROID=1`.
- Lista de permisos de la neurona (`permisos-registro.ts`, `permisos_sistema.rs`): id `ubicacion` («Ubicación (mapa)»). macOS: aviso, se lee (`CLLocationManager`, el mismo permiso que `ubicacion-wifi`). Android: aviso, se lee (`servicio.json › ubicacion`). Windows: por uso, sin lectura.

## 4. La app nunca se concede nada

Ningún comando escribe en bases de permisos del sistema; no hay orden «conceder». Las pruebas `la_peticion…`, `la_app_nunca_se_concede_nada` y la que ya vigila `permisos-registro` lo comprueban.
