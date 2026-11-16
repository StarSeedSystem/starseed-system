# Enlaces directos a los permisos de cada sistema (FAC1116 · 2026-11-16)

**Qué es:** para cada permiso que StarSeed OS pide, en cada sistema, la pantalla de Ajustes MÁS HONDA que el sistema deja
abrir desde una app, y las palabras exactas de qué pulsar allí. **Por qué:** el 15-11 Alex tuvo que buscar a mano, en los
ajustes de Android, los permisos de la función de control («facilitar esos procesos con los enlaces directos a los
permisos de accesos de los ajustes de cada sistema operativo donde se instale»).

**Código:** la tabla es `src/lib/nativa/permisos-enlaces.ts` (de ella sale este documento; una prueba vigila que no se
separen) · un solo comando nativo por sistema, `permisos_sistema_abrir` (`native/src-tauri/src/permisos_sistema.rs`:
macOS `open x-apple.systempreferences:…`, Windows `explorer ms-settings:…`, Android `peticion.json` →
`ArranqueStarSeed.kt › abrirPanel`, Linux ninguno) · la ventana `src/components/nativa/lista-permisos.tsx` (botón +
«qué pulsar» bajo cada permiso) · la banda del control remoto `banda-control.tsx` (botón de `control_abrir_ajuste` +
pasos bajo cada cosa que falta).

**Regla (contrato `permisos-y-control-del-dispositivo.md` §1):** abrir una pantalla NUNCA concede nada: el interruptor lo
pulsa la persona. Ni `adb`, ni `pm grant`, ni TCC.db, ni pulsar diálogos por guion. Donde el sistema no deja abrir una
pantalla fiable, la interfaz lo DICE y no abre otra distinta.

## Niveles

| Nivel | Qué significa |
|---|---|
| **directo** | se abre la pantalla de ese permiso (la de StarSeed, o la lista donde está su interruptor) |
| lista | se abre la categoría; hay que localizar StarSeed OS en la lista |
| ficha de la app | el sistema no tiene pantalla propia: se abre la ficha de la app y se entra en «Permisos» |
| aviso del sistema | no hay pantalla previa: el propio sistema pregunta al usarlo |
| **sin enlace** | el sistema no deja abrir una pantalla fiable (se dice en la interfaz) |
| no se pide | este sistema no lo pide |

## Resumen: qué tiene enlace de verdad

- **macOS:** TODOS los permisos con pantalla tienen enlace directo (`Privacy_*`: Accesibilidad, Grabación de pantalla,
  Monitorización de entrada, Automatización, Acceso total al disco, Archivos y carpetas, Bluetooth, Micrófono, Cámara,
  Localización, Red local). Notificaciones y Ítems de inicio abren su lista. Sin comprobar en un aparato: el ancla
  `Privacy_LocalNetwork` (macOS 15, ¿?).
- **Android con enlace directo:** Notificaciones, Superposición, Modificar ajustes del sistema, Acceso a todos los archivos,
  Instalar apps desconocidas, Notificaciones a pantalla completa (14+) y Batería (diálogo del sistema). **Lista:**
  Accesibilidad (intenta la ficha del propio servicio con `ACCESSIBILITY_DETAILS_SETTINGS`; si el aparato no la tiene,
  la lista de Accesibilidad — sin comprobar en un aparato, ¿?) y No molestar. **Sin pantalla propia (ficha de la app):**
  Micrófono, Cámara, Ubicación, Dispositivos cercanos y «Permitir ajustes restringidos» — este último vive en el menú ⋮
  de la ficha y Android solo lo muestra después de un primer intento de activar el servicio.
- **Windows:** enlace directo para Bluetooth, Ubicación, Notificaciones, Micrófono, Cámara y Aplicaciones de inicio
  (`ms-settings:`). **Sin enlace:** Red local (el Firewall pregunta solo). Pantalla y entrada no se piden.
- **Linux:** no hay enlace para nada (cada escritorio pone sus ajustes y la app no sabe cuál es). X11 no pide
  permisos; Wayland pregunta con su portal en cada sesión.

## La tabla (una fila por permiso y sistema)

### macOS 13–15

| Permiso | Nivel | Pantalla | Qué pulsar allí |
|---|---|---|---|
| `macos/bluetooth` | **directo** | Ajustes del Sistema › Privacidad y seguridad › Bluetooth | Activa el interruptor de StarSeed OS. |
| `macos/red-local` | **directo** | Ajustes del Sistema › Privacidad y seguridad › Red local | Activa el interruptor de StarSeed OS. (macOS 15 o posterior; en versiones anteriores no existe este permiso.) |
| `macos/ubicacion-wifi` | **directo** | Ajustes del Sistema › Privacidad y seguridad › Localización | Activa «Localización» arriba y el interruptor de StarSeed OS. |
| `macos/ubicacion` | **directo** | Ajustes del Sistema › Privacidad y seguridad › Localización | Activa «Localización» arriba y el interruptor de StarSeed OS. |
| `macos/notificaciones` | lista | Ajustes del Sistema › Notificaciones | Busca StarSeed OS en la lista y activa «Permitir notificaciones». |
| `macos/microfono` | **directo** | Ajustes del Sistema › Privacidad y seguridad › Micrófono | Activa el interruptor de StarSeed OS. |
| `macos/camara` | **directo** | Ajustes del Sistema › Privacidad y seguridad › Cámara | Activa el interruptor de StarSeed OS. |
| `macos/pantalla` | **directo** | Ajustes del Sistema › Privacidad y seguridad › Grabación de pantalla y audio del sistema | Activa el interruptor de StarSeed OS y, si macOS lo pide, pulsa «Salir y volver a abrir». |
| `macos/accesibilidad` | **directo** | Ajustes del Sistema › Privacidad y seguridad › Accesibilidad | Activa el interruptor de StarSeed OS (te pedirá tu contraseña o Touch ID: eso lo haces tú). |
| `macos/monitor-entrada` | **directo** | Ajustes del Sistema › Privacidad y seguridad › Monitorización de entrada | Activa el interruptor de StarSeed OS. |
| `macos/automatizacion` | **directo** | Ajustes del Sistema › Privacidad y seguridad › Automatización | Se rellena sola la primera vez que StarSeed OS maneja otra app: allí activa la app que quieras. |
| `macos/disco-completo` | **directo** | Ajustes del Sistema › Privacidad y seguridad › Acceso total al disco | Activa el interruptor de StarSeed OS y reabre la app. |
| `macos/carpetas` | **directo** | Ajustes del Sistema › Privacidad y seguridad › Archivos y carpetas | Activa las carpetas que quieras compartir bajo StarSeed OS. |
| `macos/arranque` | lista | Ajustes del Sistema › General › Ítems de inicio | En «Permitir en segundo plano» activa StarSeed OS. |
| `macos/capacidades` | no se pide | — | Leer las capacidades del aparato no pide nada. |

### Android 12–16

| Permiso | Nivel | Pantalla | Qué pulsar allí |
|---|---|---|---|
| `android/cercanos` | ficha de la app | Información de la app StarSeed OS | Pulsa «Permisos» › «Dispositivos cercanos» › «Permitir». |
| `android/ubicacion` | ficha de la app | Información de la app StarSeed OS | Pulsa «Permisos» › «Ubicación» › «Permitir solo mientras la app está en uso» (y «Usar ubicación precisa» si quieres el punto exacto). |
| `android/nfc` | no se pide | — | NFC no pide permiso: basta con que esté encendido en el aparato. |
| `android/notificaciones` | **directo** | Ajustes › Aplicaciones › StarSeed OS › Notificaciones | Activa «Permitir notificaciones». |
| `android/microfono` | ficha de la app | Información de la app StarSeed OS | Pulsa «Permisos» › «Micrófono» › «Permitir solo mientras la app está en uso». |
| `android/camara` | ficha de la app | Información de la app StarSeed OS | Pulsa «Permisos» › «Cámara» › «Permitir solo mientras la app está en uso». |
| `android/llamadas` | **directo** | Ajustes › Aplicaciones › Acceso especial › Notificaciones a pantalla completa (Android 14 o posterior) | Activa «Permitir notificaciones a pantalla completa». En Android 13 o anterior no hace falta. |
| `android/pantalla` | aviso del sistema | Aviso del sistema | Android pregunta cada vez que empieza a compartirse la pantalla: elige «Pantalla completa» o «Una sola app» y pulsa «Empezar ahora». |
| `android/accesibilidad` | lista | Ajustes › Accesibilidad › Aplicaciones instaladas | Pulsa «StarSeed OS», activa el interruptor y confirma con «Permitir». Si sale en gris, antes pulsa ⋮ en la ficha de la app › «Permitir ajustes restringidos». |
| `android/superposicion` | **directo** | Ajustes › Aplicaciones › Acceso especial › Mostrar sobre otras apps › StarSeed OS | Activa «Permitir mostrar sobre otras apps». |
| `android/bateria` | **directo** | Diálogo del sistema «¿Permitir que StarSeed OS ignore las optimizaciones de batería?» | Pulsa «Permitir». |
| `android/todos-archivos` | **directo** | Ajustes › Aplicaciones › Acceso especial › Acceso a todos los archivos › StarSeed OS | Activa «Permitir acceso para administrar todos los archivos». |
| `android/instalar` | **directo** | Ajustes › Aplicaciones › Acceso especial › Instalar apps desconocidas › StarSeed OS | Activa «Permitir desde esta fuente». |
| `android/no-molestar` | lista | Ajustes › Notificaciones › Acceso a No molestar | Pulsa StarSeed OS y activa «Permitir acceso a No molestar». |
| `android/escribir-ajustes` | **directo** | Ajustes › Aplicaciones › Acceso especial › Modificar ajustes del sistema › StarSeed OS | Activa «Permitir modificar los ajustes del sistema». |
| `android/capacidades` | no se pide | — | Leer las capacidades del aparato no pide nada. |

### Windows 10/11

| Permiso | Nivel | Pantalla | Qué pulsar allí |
|---|---|---|---|
| `windows/bluetooth` | **directo** | Configuración › Bluetooth y dispositivos | Activa «Bluetooth». |
| `windows/red-local` | **sin enlace** | Firewall de Windows (lo abre el propio Windows) | No hay pantalla de Configuración para esto: Windows pregunta solo la primera vez que StarSeed OS escucha en la red. Elige «Redes privadas». |
| `windows/ubicacion-wifi` | **directo** | Configuración › Privacidad y seguridad › Ubicación | Activa «Servicios de ubicación» y «Permitir que las aplicaciones de escritorio accedan a tu ubicación». |
| `windows/ubicacion` | **directo** | Configuración › Privacidad y seguridad › Ubicación | Activa «Servicios de ubicación» y «Permitir que las aplicaciones de escritorio accedan a tu ubicación». |
| `windows/notificaciones` | **directo** | Configuración › Sistema › Notificaciones | Activa «Notificaciones» y, en la lista, StarSeed OS. |
| `windows/microfono` | **directo** | Configuración › Privacidad y seguridad › Micrófono | Activa «Permitir que las aplicaciones de escritorio accedan al micrófono». |
| `windows/camara` | **directo** | Configuración › Privacidad y seguridad › Cámara | Activa «Permitir que las aplicaciones de escritorio accedan a la cámara». |
| `windows/pantalla` | no se pide | — | Windows no pide permiso para compartir pantalla; marca con un borde la ventana que se comparte. |
| `windows/accesibilidad` | no se pide | — | Windows no pide permiso para mandar teclas y clics (no llega a ventanas de administrador). |
| `windows/arranque` | **directo** | Configuración › Aplicaciones › Inicio | Activa StarSeed OS en la lista. |
| `windows/capacidades` | no se pide | — | Leer las capacidades del aparato no pide nada. |

### Linux (X11)

| Permiso | Nivel | Pantalla | Qué pulsar allí |
|---|---|---|---|
| `linux-x11/bluetooth` | no se pide | — | BlueZ no pide permiso a la app; solo hace falta que el Bluetooth esté encendido. |
| `linux-x11/red-local` | no se pide | — | Linux no pide permiso para la red local. |
| `linux-x11/notificaciones` | no se pide | — | Linux no pide permiso para las notificaciones. |
| `linux-x11/microfono` | **sin enlace** | Los ajustes de sonido de tu escritorio | Linux no tiene una pantalla de permisos única: cada escritorio (GNOME, KDE…) pone la suya y la app no puede saber cuál es, así que no abre ninguna. Si la app no oye, mira Sonido › Entrada y que el micrófono no esté silenciado. |
| `linux-x11/camara` | **sin enlace** | Los ajustes de privacidad de tu escritorio | Linux no tiene una pantalla de permisos única: cada escritorio (GNOME, KDE…) pone la suya y la app no puede saber cuál es, así que no abre ninguna. Si la cámara no sale, comprueba que no la use otra app. |
| `linux-x11/pantalla` | no se pide | — | En X11 cualquier app puede ver la pantalla: no hay nada que pedir. |
| `linux-x11/accesibilidad` | no se pide | — | En X11 cualquier app puede mandar teclas y clics: no hay nada que pedir. |
| `linux-x11/arranque` | **sin enlace** | Aplicaciones al inicio de tu escritorio | Linux no tiene una pantalla de permisos única: cada escritorio (GNOME, KDE…) pone la suya y la app no puede saber cuál es, así que no abre ninguna. StarSeed OS crea su entrada en ~/.config/autostart; para quitarla, bórrala desde el gestor de inicio de tu escritorio. |
| `linux-x11/capacidades` | no se pide | — | Leer las capacidades del aparato no pide nada. |

### Linux (Wayland)

| Permiso | Nivel | Pantalla | Qué pulsar allí |
|---|---|---|---|
| `linux-wayland/bluetooth` | no se pide | — | BlueZ no pide permiso a la app; solo hace falta que el Bluetooth esté encendido. |
| `linux-wayland/red-local` | no se pide | — | Linux no pide permiso para la red local. |
| `linux-wayland/notificaciones` | no se pide | — | Linux no pide permiso para las notificaciones. |
| `linux-wayland/microfono` | **sin enlace** | Los ajustes de sonido de tu escritorio | Linux no tiene una pantalla de permisos única: cada escritorio (GNOME, KDE…) pone la suya y la app no puede saber cuál es, así que no abre ninguna. Si la app no oye, mira Sonido › Entrada y que el micrófono no esté silenciado. |
| `linux-wayland/camara` | **sin enlace** | Los ajustes de privacidad de tu escritorio | Linux no tiene una pantalla de permisos única: cada escritorio (GNOME, KDE…) pone la suya y la app no puede saber cuál es, así que no abre ninguna. Si la cámara no sale, comprueba que no la use otra app. |
| `linux-wayland/pantalla` | aviso del sistema | Aviso del sistema | Wayland pregunta con su propio selector cada vez que se comparte la pantalla: elige la pantalla o ventana y pulsa «Compartir». |
| `linux-wayland/accesibilidad` | aviso del sistema | Aviso del sistema | Wayland solo deja mandar teclas y clics por el portal de Escritorio remoto, que pregunta en cada sesión: pulsa «Permitir». |
| `linux-wayland/arranque` | **sin enlace** | Aplicaciones al inicio de tu escritorio | Linux no tiene una pantalla de permisos única: cada escritorio (GNOME, KDE…) pone la suya y la app no puede saber cuál es, así que no abre ninguna. StarSeed OS crea su entrada en ~/.config/autostart; para quitarla, bórrala desde el gestor de inicio de tu escritorio. |
| `linux-wayland/capacidades` | no se pide | — | Leer las capacidades del aparato no pide nada. |


## Lo que le falta al control remoto de una tableta (`control_capacidades().falta`)

| Falta | Qué abre | Qué pulsar allí |
|---|---|---|
| `servicio-accesibilidad` | ficha del servicio, o la lista de Accesibilidad | Aplicaciones instaladas › StarSeed OS › interruptor › «Permitir» |
| `ajustes-restringidos` | ficha de la app (no hay pantalla propia) | ⋮ › «Permitir ajustes restringidos» (sale tras un primer intento de activar el servicio) |
| `escribir-ajustes` | Modificar ajustes del sistema › StarSeed OS | «Permitir modificar los ajustes del sistema» |
| `consentimiento-pantalla` | diálogo de StarSeed OS en el aparato | «Sí», solo si quieres ver la pantalla sin preguntar |

## Qué necesita una compilación nativa para comprobarse

Lo de Kotlin (`abrirPanel`, `abrirAjuste`) y los intentos `ACCESSIBILITY_DETAILS_SETTINGS` y
`MANAGE_APP_USE_FULL_SCREEN_INTENT` solo se compilan en la CI y solo se ven en un aparato; el resto (tabla, textos,
paneles de macOS y Windows, lista de paneles de Android) está probado en vitest y en `cargo test`.
