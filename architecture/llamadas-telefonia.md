# Llamadas y telefonía

> Este archivo reúne el contrato de las llamadas de StarSeed. La sección «Integración nativa» (LLA1108D) es
> independiente de las demás: se puede fusionar por unión.

## Integración nativa

Objetivo: en el teléfono, una llamada de StarSeed se comporta como una llamada del sistema (pantalla de
bloqueo, auriculares, rutas de audio, proximidad, segundo plano) con la interfaz propia de StarSeed.

### Arquitectura

```
motores web (llamada-directa.ts · llamadas/store.ts)
   └─ puente-llamada-nativa.ts  (observa los motores; no-op en la web)
        └─ Tauri invoke/listen ── llamada_nativa.rs ── archivos ── LlamadaNativaStarSeed.kt
                                    (validación + máquina de estados en llamada_nativa_logica.rs)
```

El puente **observa** los dos motores (suscripciones existentes); no cambia su ciclo de vida. Los motores
solo tienen una línea marcada `(LLA1108D)` que carga el puente por importación dinámica.

Rust ↔ Kotlin usa el mismo patrón que Wi‑Fi directo: carpeta `filesDir/starseed/llamada-nativa/`.
Rust → Kotlin: cola `peticion-<n>.json` (acciones `iniciar|estado|ruta|proximidad|permiso`).
Kotlin → Rust: `estado.json` (escritura atómica) con `epoca`, capacidades, ruta y lista de eventos con
número `n` creciente; Rust los emite una sola vez a la web (sondeo de 200 ms con llamada, 1 s en reposo).

### Comandos (Tauri)

| Comando | Argumentos | Resultado |
|---|---|---|
| `llamada_nativa_iniciar` | `id, nombre, tipo (voz\|video), entrante` | estado nativo |
| `llamada_nativa_estado` | `id, estado (sonando\|activa\|en-espera\|terminada), silenciada?` | estado nativo |
| `llamada_nativa_ruta_audio` | `ruta (auricular\|altavoz\|cableado\|bluetooth)` | ok |
| `llamada_nativa_proximidad` | `activa` | ok |
| `llamada_nativa_capacidades` | — | `{nativa, plataforma, rutas, ruta, pantallaCompleta, proximidad…}` |
| `llamada_nativa_permiso` | — | pide el permiso de pantalla completa; lo usa el asistente de permisos |

Todos van en `COMANDOS_APP` (build.rs), `generate_handler` y `capabilities/default.json` (`allow-*`).
Transiciones válidas: sonando → activa | terminada; activa ↔ en-espera; cualquiera → terminada. Una sola
llamada nativa a la vez (`iniciar` con otra viva falla).

### Eventos (a la web)

`llamada-nativa://contestar|rechazar|colgar|silenciar|ruta|proximidad|espera`, carga `{id, valor}`.
La web los traduce a las acciones que ya tenían los motores (contestar, rechazar, colgar, alternar micro).

### Android

- `PhoneAccount` autogestionado (`CAPABILITY_SELF_MANAGED`) + `ConnectionService` + `Connection`:
  foco de audio, botones de auriculares, prioridad sobre medios.
- Entrante: notificación `CallStyle` con Contestar/Rechazar y `fullScreenIntent`. Contestar abre una
  actividad (Android 12+ prohíbe trampolines desde notificaciones); Rechazar/Colgar/Silenciar van a un
  `BroadcastReceiver`.
- En curso: `CallStyle` con Colgar y Silenciar y servicio en primer plano `phoneCall|microphone|camera`.
- Rutas: `CallEndpoint` (API 34+), `CallAudioState` en versiones anteriores.
- Proximidad: `PROXIMITY_SCREEN_OFF_WAKE_LOCK` solo con llamada de voz en auricular; se suelta con
  altavoz, vídeo o al colgar.
- Interruptor de escape: `STARSEED_SIN_LLAMADAS_NATIVAS_ANDROID=1` en la compilación.

#### Manifiesto (bloque marcado `LLA1108D`, idempotente)

Permisos: `MANAGE_OWN_CALLS` (registrar llamadas propias en Telecom), `FOREGROUND_SERVICE`,
`FOREGROUND_SERVICE_PHONE_CALL`, `FOREGROUND_SERVICE_MICROPHONE` y `FOREGROUND_SERVICE_CAMERA` (la llamada
sigue con la pantalla apagada), `USE_FULL_SCREEN_INTENT` (mostrar la llamada sobre el bloqueo), `WAKE_LOCK`
(sensor de proximidad), `POST_NOTIFICATIONS` y `MODIFY_AUDIO_SETTINGS` (rutas de audio). Cada una lleva su
razón en un comentario del manifiesto; las ya declaradas por otros parches no se repiten.
`<uses-feature android:name="android.hardware.telephony" android:required="false"/>` mantiene la
instalación en tablets sin SIM. Componentes: proveedor de arranque, `ConnectionService`, servicio,
receptor y actividad. `RECORD_AUDIO` y `CAMERA` los declara el parche de medios.

#### Asistente de permisos (PER1108A)

Se añadió el permiso opcional `llamadas` («Llamadas sobre la pantalla de bloqueo», `VERSION_ASISTENTE` = 2).
Android 14+: si `canUseFullScreenIntent` es falso se abre la pantalla de ajustes y, si se rechaza, la
llamada entrante cae a notificación emergente (heads-up) y la app lo explica (`pantallaCompletaLista`).

#### Diferencias por versión

- Android 12 (API 31): `CallStyle` disponible; restricción de trampolines; `USE_FULL_SCREEN_INTENT` se concede sola.
- Android 13 (API 33): `POST_NOTIFICATIONS` en tiempo de ejecución.
- Android 14 (API 34): tipos de servicio en primer plano obligatorios (`phoneCall`); `USE_FULL_SCREEN_INTENT` es
  acceso especial revocable; `CallEndpoint`.
- Android 16 (API 36): comprobar que el servicio `phoneCall` arranca desde la actividad y que la notificación
  `CallStyle` conserva el estilo; revisar cambios de pantalla completa y de foco de audio.

### Escritorio

macOS: durante la llamada se evita el sueño y App Nap (`NSProcessInfo.beginActivity`). Windows y Linux: no
hacen nada y `llamada_nativa_capacidades` devuelve `nativa: false`.

### iOS (plan, sin compilación todavía)

CallKit: `CXProvider` + `CXCallController` para llamada entrante/saliente con interfaz del sistema solo en
bloqueo; `AVAudioSession` en `playAndRecord`/`voiceChat` con rutas; PushKit VoIP para despertar la app
(obligatorio reportar la llamada a CallKit al recibir el push). Sin servidor APNs la malla local solo
funciona con la app abierta. Se mapea con los mismos comandos y eventos de este contrato.

### Pruebas

TS: mapeo de estados y eventos, no-op en la web, enlace con motores falsos y vista del hook. Rust:
validación, máquina de estados, lectura de eventos, parche de manifiesto (aplicar dos veces = igual).
Kotlin lo compila CI. En teléfono real: contestar desde bloqueo, Bluetooth, proximidad, rechazo de
pantalla completa en Android 14+.

### Para la interfaz (LLA1108C)

`useLlamadaNativa()` en `src/lib/llamadas/nativa/use-llamada-nativa.ts`: `{disponible, capacidades, rutas,
ruta, proximidad, pantallaCompletaLista, fijarRuta, permitirProximidad, pedirPantallaCompleta}`.
