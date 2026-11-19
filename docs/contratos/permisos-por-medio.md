# Permisos por medio

Contrato de los permisos de StarSeed OS en **todos los medios** donde se usa: macOS, iOS, Android,
Linux, Windows, navegadores web y terminal. La regla ejecutable y la matriz viven en
`src/lib/permisos/matriz.ts`; la lista de cada neurona sigue leyendo el registro único
`src/lib/nativa/permisos-registro.ts` y sus enlaces directos `src/lib/nativa/permisos-enlaces.ts`.

## La regla

1. **Al instalar** (primera apertura) y **al abrir** se pide lo que **falta** y es útil en ese
   momento. Lo que solo se pregunta al usarse no se pide antes: se anota para ese momento.
2. **Denegado a mano no se vuelve a pedir solo.** Se distingue de «falta» con la señal que da cada
   sistema (abajo, por medio) y se enseña en la lista con **«Abrir ajustes»**.
3. **Nunca se concede nada por la persona.** La app solo puede: enseñar el aviso del sistema, abrir
   la pantalla de Ajustes que corresponda o esperar a que se use. No escribe bases de permisos,
   no usa interfaces privadas y no pulsa diálogos por guion.

Estados que entiende la regla: `concedido`, `falta`, `denegado-a-mano`, `no-se-puede-saber` y
`no-aplica`. Acciones posibles: `pedir`, `abrir-ajustes`, `por-uso`, `nada` y `listo`.

## Cómo se lee cada columna

- **Detección**: `api-estado` (la API dice concedido/denegado/preguntar), `api-uso` (solo se sabe al
  usarlo), `sistema` (se lee de los ajustes o de un servicio), `inferida` (se deduce del
  comportamiento), `no-se-puede` (no hay forma) o `no-hace-falta`.
- **Petición**: `aviso` (el sistema pregunta), `panel` (solo se da en una pantalla de Ajustes),
  `por-uso` (pregunta cada vez o la primera vez que se usa), `declaracion` (basta declararlo) o
  `nada`.
- **Ajustes**: `directo` (pantalla de ese permiso), `lista` (categoría donde hay que buscar
  StarSeed), `ficha` (ficha de la app), `aviso` (no hay pantalla previa), `sin-enlace` (no hay
  pantalla fiable: se explican los pasos) o `no-hace-falta`.
- **Instalar / abrir**: si el permiso es útil en ese momento (`sí`) o se deja para cuando se use
  (`—`).

## macOS

| Permiso | Detección | Petición | Ajustes | Falta vs denegado a mano | Instalar / abrir |
|---|---|---|---|---|---|
| Micrófono | api-estado | aviso | directo | `notDetermined` es falta; apagado por la persona es denegado | sí / sí |
| Cámara | api-estado | aviso | directo | `notDetermined` es falta; apagado es denegado | sí / sí |
| Pantalla | api-estado | panel | directo | Sin fila es falta; interruptor apagado es denegado | — / — |
| Accesibilidad / control | api-estado | panel | directo | `AXIsProcessTrusted` falso sin fila es falta; apagado es denegado | — / — |
| Entrada virtual | api-estado | panel | directo | Mismo permiso de Accesibilidad; apagado es denegado | — / — |
| Ubicación | api-estado | por-uso | directo | `notDetermined` es falta; `denied`/`restricted` es denegado | — / — |
| Bluetooth | api-estado | aviso | directo | `notDetermined` es falta; `denied` es denegado | sí / — |
| Red local | inferida | aviso | directo | Si la malla local responde está; si no, no se sabe si falta o se negó | sí / — |
| Notificaciones | api-estado | aviso | lista | `notDetermined` es falta; `denied` es denegado | sí / — |
| Segundo plano | sistema | aviso | lista | Sin registrar es falta; retirado en Ítems de inicio es denegado | sí / — |
| Archivos | api-uso | por-uso | directo | El aviso de la carpeta es falta; el silencio tras negar es denegado | — / — |
| Energía | no-hace-falta | nada | no-hace-falta | `IOPMAssertion` no pide permiso | — / — |

## iOS

| Permiso | Detección | Petición | Ajustes | Falta vs denegado a mano | Instalar / abrir |
|---|---|---|---|---|---|
| Micrófono | api-estado | aviso | ficha | `notDetermined` es falta; `denied` es denegado | sí / sí |
| Cámara | api-estado | aviso | ficha | `notDetermined` es falta; `denied` es denegado | sí / sí |
| Pantalla | api-uso | por-uso | aviso | ReplayKit pregunta en cada emisión | — / — |
| Control | no-hace-falta | nada | no-hace-falta | iOS no permite controlar otras apps | — / — |
| Entrada virtual | no-hace-falta | nada | no-hace-falta | iOS no permite inyectar teclas ni clics | — / — |
| Ubicación | api-estado | por-uso | ficha | `notDetermined` es falta; `denied`/`restricted` es denegado | — / — |
| Bluetooth | api-estado | aviso | ficha | `notDetermined` es falta; `denied` es denegado | sí / — |
| Red local | inferida | aviso | ficha | El aviso sale en el primer Bonjour; después no se sabe | sí / — |
| Notificaciones | api-estado | aviso | ficha | `notDetermined` es falta; `denied` es denegado | sí / — |
| Segundo plano | no-hace-falta | nada | no-hace-falta | Se declara en el manifiesto; iOS decide | — / — |
| Archivos | api-uso | por-uso | no-hace-falta | El selector de documentos elige cada archivo | — / — |
| Energía | no-hace-falta | nada | no-hace-falta | La gobierna el sistema | — / — |

## Android

| Permiso | Detección | Petición | Ajustes | Falta vs denegado a mano | Instalar / abrir |
|---|---|---|---|---|---|
| Micrófono | api-estado | aviso | ficha | `DENIED` sin aviso previo es falta; con aviso previo es denegado | sí / sí |
| Cámara | api-estado | aviso | ficha | `DENIED` sin aviso previo es falta; con aviso previo es denegado | sí / sí |
| Pantalla | api-uso | por-uso | aviso | MediaProjection pregunta cada vez | — / — |
| Accesibilidad / control | sistema | panel | lista | Servicio ausente es falta; desactivado tras activarlo es denegado | — / — |
| Entrada virtual | sistema | panel | lista | Misma accesibilidad | — / — |
| Ubicación | api-estado | aviso | ficha | `DENIED` sin preguntar es falta; «no volver a preguntar» es denegado | sí / — |
| Bluetooth / cercanos | api-estado | aviso | ficha | `DENIED` sin preguntar es falta; «no volver a preguntar» es denegado | sí / — |
| Red local | no-hace-falta | nada | no-hace-falta | Android no lo pide | — / — |
| Notificaciones | api-estado | aviso | ficha | Desactivadas sin preguntar es falta; tras denegar es denegado | sí / — |
| Segundo plano | sistema | panel | directo | Sin optimización ignorada es falta; si ya se pidió y sigue igual es denegado | sí / — |
| Archivos | sistema | panel | directo | Acceso total falso es falta; si ya se pidió y sigue falso es denegado | — / — |
| Energía | sistema | panel | directo | Ignorar batería falso es falta; si ya se pidió y sigue falso es denegado | sí / — |

## Linux

| Permiso | Detección | Petición | Ajustes | Falta vs denegado a mano | Instalar / abrir |
|---|---|---|---|---|---|
| Micrófono | api-uso | por-uso | sin-enlace | X11 no pide; Wayland/PipeWire pregunta al usarlo | — / — |
| Cámara | api-uso | por-uso | sin-enlace | X11 no pide; Wayland pregunta al usarla | — / — |
| Pantalla | api-uso | por-uso | aviso | X11 no pide; Wayland pregunta con su selector | — / — |
| Control | api-uso | por-uso | aviso | X11 es libre; Wayland pregunta en cada sesión | — / — |
| Entrada virtual | api-uso | por-uso | aviso | X11 es libre; Wayland pregunta en cada sesión | — / — |
| Ubicación | api-uso | por-uso | sin-enlace | GeoClue no expone estado por app | — / — |
| Bluetooth | no-hace-falta | nada | no-hace-falta | BlueZ no pide; basta con tenerlo encendido | — / — |
| Red local | no-hace-falta | nada | no-hace-falta | Linux no lo pide | — / — |
| Notificaciones | no-hace-falta | nada | no-hace-falta | El escritorio no pide | — / — |
| Segundo plano | sistema | nada | sin-enlace | La entrada de `~/.config/autostart` existe o no | sí / — |
| Archivos | no-hace-falta | nada | no-hace-falta | Permisos POSIX; solo Flatpak o Snap usan portal | — / — |
| Energía | no-hace-falta | nada | no-hace-falta | La app no cambia la energía | — / — |

## Windows

| Permiso | Detección | Petición | Ajustes | Falta vs denegado a mano | Instalar / abrir |
|---|---|---|---|---|---|
| Micrófono | inferida | por-uso | directo | Si pregunta al usarlo es falta; si ya no pregunta y no hay audio es denegado | sí / — |
| Cámara | inferida | por-uso | directo | Si pregunta al usarla es falta; si ya no pregunta y no hay imagen es denegado | sí / — |
| Pantalla | no-hace-falta | nada | no-hace-falta | Windows no pide para capturar | — / — |
| Control | no-hace-falta | nada | no-hace-falta | No pide, pero no llega a ventanas de administrador | — / — |
| Entrada virtual | no-hace-falta | nada | no-hace-falta | `SendInput` no pide permiso | — / — |
| Ubicación | inferida | por-uso | directo | Si pregunta al usarla es falta; si ya no pregunta es denegado | — / — |
| Bluetooth | no-hace-falta | nada | no-hace-falta | No pide a apps de escritorio | — / — |
| Red local | inferida | por-uso | sin-enlace | El Firewall pregunta la primera vez; si ya no pregunta y no conecta es denegado | — / — |
| Notificaciones | sistema | nada | directo | Activadas por defecto; se apagan en Configuración | — / — |
| Segundo plano | sistema | aviso | directo | Sin la entrada en Inicio es falta; quitada es denegado | sí / — |
| Archivos | no-hace-falta | nada | no-hace-falta | Las carpetas del usuario se leen sin pedir | — / — |
| Energía | no-hace-falta | nada | no-hace-falta | La gobierna el sistema | — / — |

## Navegadores web

| Permiso | Detección | Petición | Ajustes | Falta vs denegado a mano | Instalar / abrir |
|---|---|---|---|---|---|
| Micrófono | api-estado | aviso | directo | Permissions API: `prompt` es falta; `denied` es denegado | sí / sí |
| Cámara | api-estado | aviso | directo | Permissions API: `prompt` es falta; `denied` es denegado | sí / sí |
| Pantalla | api-uso | por-uso | aviso | `getDisplayMedia` exige gesto y pregunta cada vez | — / — |
| Control | no-hace-falta | nada | no-hace-falta | Una página no controla el aparato | — / — |
| Entrada virtual | no-hace-falta | nada | no-hace-falta | Una página no inyecta fuera de su pestaña | — / — |
| Ubicación | api-estado | aviso | directo | Permissions API: `prompt` es falta; `denied` es denegado | sí / — |
| Bluetooth | api-uso | por-uso | ficha | Web Bluetooth elige dispositivo cada vez y no persiste | — / — |
| Red local | no-hace-falta | nada | no-hace-falta | El navegador aplica CORS; no hay permiso | — / — |
| Notificaciones | api-estado | aviso | directo | `Notification.permission`: `default` es falta; `denied` es denegado | sí / sí |
| Segundo plano | no-hace-falta | nada | no-hace-falta | Service Worker y sincronización no piden | — / — |
| Archivos | api-uso | por-uso | sin-enlace | El selector pregunta cada vez; el permiso por archivo se relee | — / — |
| Energía | api-uso | por-uso | no-hace-falta | Wake Lock exige página visible y gesto | — / — |

## Terminal

| Permiso | Detección | Petición | Ajustes | Falta vs denegado a mano | Instalar / abrir |
|---|---|---|---|---|---|
| Micrófono | no-se-puede | nada | sin-enlace | Hereda los permisos de la terminal | — / — |
| Cámara | no-se-puede | nada | sin-enlace | Hereda los permisos de la terminal | — / — |
| Pantalla | no-se-puede | nada | sin-enlace | Hereda los permisos de la terminal | — / — |
| Control | no-se-puede | nada | sin-enlace | Depende de la sesión y de la terminal | — / — |
| Entrada virtual | no-se-puede | nada | sin-enlace | Depende de la sesión gráfica | — / — |
| Ubicación | no-se-puede | nada | sin-enlace | Depende del sistema | — / — |
| Bluetooth | no-hace-falta | nada | no-hace-falta | No hay permiso para un proceso de consola | — / — |
| Red local | inferida | por-uso | sin-enlace | El firewall pregunta la primera vez; si ya no y no conecta, se negó | — / — |
| Notificaciones | no-hace-falta | nada | no-hace-falta | La terminal no pide | — / — |
| Segundo plano | sistema | nada | sin-enlace | El servicio de usuario está instalado o no | sí / — |
| Archivos | no-hace-falta | nada | no-hace-falta | Permisos POSIX del usuario | — / — |
| Energía | no-hace-falta | nada | no-hace-falta | La terminal no cambia la energía | — / — |

## Dónde se aplica

- `src/lib/permisos/matriz.ts`: la matriz y la regla puras (`clasificar`, `decidir`, `planDe`,
  `listaDe`), con pruebas en `src/lib/permisos/__tests__/matriz.test.ts`.
- `src/lib/nativa/permisos-registro.ts`: el catálogo por sistema que ya usa la lista de la neurona.
- `src/lib/nativa/permisos-enlaces.ts`: las pantallas exactas y qué pulsar en cada una.
- `src/lib/nativa/permisos-inicio.ts` y `permisos-inicio-ejecutor.ts`: la máquina de estados y quien
  pide de verdad, de uno en uno y sin insistir en lo negado.
- `native/src-tauri/src/permisos_sistema.rs`, `permisos_medios.rs` y `permisos_inicio.rs`: lo que la
  app nativa puede leer y abrir en macOS, Windows y Android.
- `config/permisos-por-so.json`: la declaración de cada sistema (capabilities, manifiestos y
  versiones mínimas).

## Lo que este contrato no permite

- Volver a pedir automáticamente lo que la persona denegó a mano.
- Conceder un permiso sin que la persona lo active en el aviso del sistema o en Ajustes.
- Inventar una pantalla de Ajustes que el sistema no tiene: cuando no hay enlace fiable se dice y se
  explican los pasos (`sin-enlace`).
- Pedir dos avisos del sistema a la vez (macOS deja la página sin clics mientras hay uno abierto).
