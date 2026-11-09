# Llamadas con superficie de telefonía (LLA1108C)

Contrato corto. Código: `src/lib/llamadas/superficie/*` (lógica pura) y `src/components/llamadas/superficie/*` (interfaz).

## 1. Superficie
Una sola superficie (`SuperficieLlamada`) para voz, vídeo, pantalla, transmisión en vivo y grupo. No conoce los motores: recibe una `VistaLlamada` y unas `AccionesLlamada` (`vista.ts`). Una acción ausente deja su botón desactivado con su motivo; no hay botones muertos. El adaptador `adaptador-directa.ts` conecta la llamada directa por enlace local (`LlamadaDirectaFlotante`); el motor de llamadas por cuenta (`motor.ts`) se conecta igual con otro adaptador (pendiente).

## 2. Estados y tamaños (`maquina.ts`)
Estados: `entrante`, `saliente`, `conectada`, `en-espera`, `reconectando`, `terminada` (más `inactiva`). El motor manda (`sincronizar.ts` traduce su estado a eventos). La espera no cuenta en el cronómetro. `terminada` guarda duración y medio y se queda hasta «Cerrar».
Tamaños: `burbuja` (arrastrable, también con flechas), `panel`, `pantalla-completa`. La máquina guarda solo el tamaño de DESTINO y el previo: la capa visual interpola con CSS, por eso la transición es interrumpible; con «reducir movimiento» no hay transición. Esc sale de pantalla completa y vuelve al tamaño previo.
Pantalla completa (PER1108A): en la app nativa se usa el comando de VENTANA `ventana_pantalla_completa` (nunca `requestFullscreen` de elemento: WebKit congeló el Mac); en la web, la del documento. El modo completo se pinta a viewport completo aunque el sistema la rechace.

## 3. Controles
Silenciar, cámara, girar cámara (si hay más de una), compartir pantalla, espera/reanudar, imagen en imagen, rejilla/orador, resaltar puntero (pantalla), colgar, cronómetro, salida de audio (`setSinkId` donde exista; Safari/WebKit no lo tiene) y rutas nativas por contexto opcional (`contexto-nativo.tsx`, vacío por defecto). Cambio de tipo sin colgar: `puedeCambiarTipo` + `diferenciaPistas` (qué pistas añadir/quitar sobre la misma conexión); el motor aplica la renegociación. Calidad: `calidad-llamada.ts` reutiliza `clasificarPar`/`etiquetaRuta` (BLE1108B), `calidadDesde` y `cifradoDe` (CIF1108A); lo no medido sale «sin medir».

## 4. Medio de transmisión (`selector-medio.ts`)
«Automático» (el planificador) o un medio fijado. Si no puede llevar el tipo (Bluetooth no lleva audio ni vídeo todavía) o no hay enlace, se dice y la llamada sigue por el medio actual. Si el fijado se cae, se re-rutea a otro capaz para no cortar.

## 5. Invitar (`grupo-invitar.ts`)
Usuarios, neuronas y grupos; pasa a malla de grupo con los límites de hoy (6 personas, 4 con vídeo). Se muestran y explican; un grupo que no cabe entero no entra a medias.

## 6. Grabación y consentimiento (`grabacion.ts`, `grabadora-local.ts`)
Apagada por defecto; orden explícita. Se avisa a TODOS por el canal de datos ANTES de grabar; si el aviso no llega a alguien, no se graba. Indicador rojo «Grabando» en todas las neuronas mientras alguien graba; quien entra tarde recibe el aviso (`avisosParaNuevo`). Local (`MediaRecorder` → OPFS). Al parar: Archivos, Biblioteca o descartar.

## 7. Astraura en la llamada (`astraura-llamada.ts`)
Opt-in por llamada y por neurona. Una sola neurona genera (`elegirGenerador`, local primero, desempate igual en todas) y la respuesta se difunde por el canal de datos con id único: cada neurona activa la muestra una vez (deduplicada) con los mismos ajustes de voz; leer en voz alta es otro opt-in. Sin reconocedor de voz no hay transcripción y el panel lo dice.

## 8. Integración nativa (LLA1108D)


Objetivo: en el teléfono, una llamada de StarSeed se comporta como una llamada del sistema (pantalla de
bloqueo, auriculares, rutas de audio, proximidad, segundo plano) con la interfaz propia de StarSeed.

### 8. Arquitectura

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

### 8. Comandos (Tauri)

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

### 8. Eventos (a la web)

`llamada-nativa://contestar|rechazar|colgar|silenciar|ruta|proximidad|espera`, carga `{id, valor}`.
La web los traduce a las acciones que ya tenían los motores (contestar, rechazar, colgar, alternar micro).

### 8. Android

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

### 8. Escritorio

macOS: durante la llamada se evita el sueño y App Nap (`NSProcessInfo.beginActivity`). Windows y Linux: no
hacen nada y `llamada_nativa_capacidades` devuelve `nativa: false`.

### 8. iOS (plan, sin compilación todavía)

CallKit: `CXProvider` + `CXCallController` para llamada entrante/saliente con interfaz del sistema solo en
bloqueo; `AVAudioSession` en `playAndRecord`/`voiceChat` con rutas; PushKit VoIP para despertar la app
(obligatorio reportar la llamada a CallKit al recibir el push). Sin servidor APNs la malla local solo
funciona con la app abierta. Se mapea con los mismos comandos y eventos de este contrato.

### 8. Pruebas

TS: mapeo de estados y eventos, no-op en la web, enlace con motores falsos y vista del hook. Rust:
validación, máquina de estados, lectura de eventos, parche de manifiesto (aplicar dos veces = igual).
Kotlin lo compila CI. En teléfono real: contestar desde bloqueo, Bluetooth, proximidad, rechazo de
pantalla completa en Android 14+.

### 8. Para la interfaz (LLA1108C)

`useLlamadaNativa()` en `src/lib/llamadas/nativa/use-llamada-nativa.ts`: `{disponible, capacidades, rutas,
ruta, proximidad, pantallaCompletaLista, fijarRuta, permitirProximidad, pedirPantallaCompleta}`.

### 8.5 Llamada entrante: suena, enciende la pantalla y abre su ventana (LLA1108F)

**Causa del fallo visto (SM-X900, Android 16, 0.5.1-prueba.29).** Solo salió una notificación porque (1) el canal
`CANAL_ENTRANTE` era inmutable y se creó antes con un sonido/importancia que ya no se podían cambiar; (2) el
timbre no se tocaba en ningún sitio (un `ConnectionService` autogestionado debe sonar él mismo); (3) la web llamaba
a `iniciar` tarde, con el JS ya frenado; (4) en Android 14+ `USE_FULL_SCREEN_INTENT` puede estar denegado en una
instalación fuera de la tienda y sin él no hay pantalla ni encendido; (5) la app cerrada no tenía quien escuchara.
Arreglo en capas: canal `…-v2` (el viejo se borra), `TimbreLlamada` propio (`RingtoneManager` + vibración, respeta
silencio/vibrar/No molestar), `FULL_WAKE_LOCK` corto, `ActividadLlamadaStarSeed` real (Contestar, Rechazar, Ignorar,
Responder con mensaje, Silenciar…) y el marco «timbre» para la app cerrada.

**Quién suena (`decision-timbre.ts`, puro).** Ignorada → nadie. Silenciada → nadie, y entra «Llamada silenciada
(hasta 18:30)» con «Deshacer». Si no: suena la web solo si la app está visible o no hay parte nativa; si no, suena la
nativa. Nunca las dos. Al llegar la señal la web llama ya a `llamada_nativa_iniciar` con nombre, iniciales, tipo,
medio, uid/neurona/chat y `silencioHasta` (`cargaIniciarNativo`); desde ahí manda la parte nativa aunque el JS se congele.

| Estado | Android | Escritorio |
|---|---|---|
| Primer plano | Tarjeta web (`timbre.tsx`), tono web; nativa callada | Tarjeta web |
| Segundo plano | Timbre nativo + vibración + heads-up + ventana completa; Contestar abre la app en la llamada | Ventana `llamada-entrante` siempre encima y en todos los espacios + notificación con sonido |
| Bloqueado | Igual con `setShowWhenLocked`/`setTurnScreenOn` y wake lock | Ventana + notificación |
| Cerrada | `ServicioAntenas` (primer plano) mantiene el proceso; el marco «timbre» (§8.6) llega por TCP 47071, Rust lo verifica y llama a Kotlin | Igual que segundo plano si la app sigue en bandeja; si no corre, nada escucha |

**Por versión de Android.** 12: no hay permiso de pantalla completa que pedir; bastan canal y wake lock, y Contestar
va por `PendingIntent` a la actividad (restricción de trampolines). 14: hace falta `canUseFullScreenIntent()`; si no,
se guía a `ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT` (PER1108A `pedirLlamadas` y Ajustes) y mientras tanto heads-up +
wake lock. 16: como 14, con permiso de notificaciones y servicio `connectedDevice` obligatorios; el canal se versiona
porque su sonido no se puede cambiar.

**Ignorar.** Para timbre, pantalla completa y vibración de esta llamada; quien llama sigue oyendo tono hasta el
tiempo máximo (no recibe «rechazada»); queda una entrada silenciosa en perdidas. **Silenciar…** por ámbito (persona,
neurona, grupo/chat, medio, todas) y duración (15 min, 1 h, 8 h, hasta mañana, hasta que se reactive). La política
(`silencio-llamadas.ts`) se espeja a `silencios-llamadas.json` (Rust↔Kotlin, fusión por `mod` con lápidas) para que
la parte nativa la respete con el JS congelado. Ajustes › Notificaciones lista los silencios activos con «Quitar».

### 8.6 Marco «timbre» (app cerrada)

Sobre `tu.msg` en el canal `llamada-timbre`, por el mismo TCP 47071: `{v, id, de, nombre, tipo, medio, ts, firma}`.
`firma` = HMAC-SHA256 con la clave de cuenta del faro; validez 90 s; se descartan los del propio emisor, los del
futuro y los repetidos. No lleva secretos ni contenido. Rust (`llamada_entrante.rs::al_recibir_local`) verifica,
consulta los silencios, espera 2,5 s a ver si la web viva ya tomó la llamada y, si no, hace sonar la nativa.
Contestar arranca la app y el motor JS termina la llamada con la señalización cifrada normal.
**Hecho:** LAN TCP en Android y el emisor desde la web. **Pendiente:** firma asimétrica por aparato (hoy clave
compartida de cuenta), BLE e iOS (PushKit/CallKit).

**Ventana de escritorio.** `decidir_ventana` (puro): abre si la app no está al frente y la llamada no está
ignorada/silenciada; cierra al contestar, rechazar, ignorar o terminar. La página es un `data:` URL sin capacidades
IPC; solo navega a `starseed-llamada://accion`.

## 9. Voz por enlace de datos (sin red IP) (LLA1108E)

Caso real 08-11 (0.5.1-prueba.29): la Mac llamó a la tableta con el Wi-Fi apagado y solo Bluetooth directo.
El timbre llegó (burbuja del chat por BLE), pero la señalización de la llamada solo tenía dos vías, el canal
privado de Supabase y los enlaces WebRTC locales, y ninguna existe por BLE: la tableta no podía entrar al
canal («conectando» para siempre) y la Mac nunca vio la presencia que marca «contestada».

### 9. Señalización por cualquier enlace (`canal-enlace-transporte.ts`)

`abrirCanalLlamadaPorTransporte` es una `ConexionCanal` más (`canalesDirectos`) sobre el transporte universal
(`enviarMensaje`/`alRecibirMensaje`, canal `llamada-canal`): presencia (`llc.pres`), señales de par
(`llc.senal`: oferta, respuesta, ICE, colgar, rechazo, `fallo`) y salida (`llc.fuera`) por el mejor enlace hacia
esa neurona (BLE, red local nativa, Wi-Fi directo, malla de la cuenta). Con acuse; si ningún enlace lo lleva
reintenta a 1, 2 y 4 s; el transporte descarta repetidos por id. Solo se atiende a la neurona a la que se llama
y a orígenes con consentimiento. El cifrado es el del enlace (CIF1108A): no hay segunda capa. El que llama ve
«Contestada · conectando audio…» en cuanto llega la presencia del otro, sin esperar al audio.

### 9. Qué medio lleva la voz (`voz-datos/decision.ts`)

1. Sin ruta IP hacia ese par (solo BLE u otro enlace sin IP): enlace de datos desde el primer momento.
2. Con ruta IP, si ICE no conecta en 6 s y hay enlace de datos: se pasa a él sin colgar.
3. Si WebRTC conecta más tarde: se vuelve a WebRTC sin cortar.
4. A los 15 s sin audio por ninguno: la llamada acaba con motivo claro en los dos extremos (señal `fallo`),
   con «Reintentar». Nunca queda «conectando».

Vídeo por BLE no es posible con calidad útil: la superficie lo dice y ofrece pasar a voz.

### 9. Transporte de la voz (`voz-datos/*`)

- Captura: AudioWorklet (con ScriptProcessor de reserva) a 16 kHz mono, tramas de 20 ms.
- Códec: Opus por WebCodecs `AudioEncoder` donde `isConfigSupported` lo dé (WKWebView reciente, Chrome/Android
  WebView), a 16-24 kbps; si no, IMA-ADPCM (~32 kbps) o μ-law (64 kbps) en TS puro. Se negocia en el saludo.
- Paquete `voz.p`: seq, marca de tiempo, códec y 2-3 tramas por escritura BLE.
- Contrapresión (BLE1108C): la voz tiene cola propia en el motor BLE; si hay voz esperando se retiene en la
  sesión y, si se llena, se descarta lo MÁS VIEJO (nunca segundos de retraso). Se alterna con la cola de
  datos para que ni la voz mate al chat ni al revés.
- Reproducción: jitter buffer adaptativo de 60 a 200 ms con ocultación de pérdidas (repetir y atenuar).
- Silencio, altavoz/auricular, proximidad y cronómetro siguen igual (`useLlamadaNativa`).
- Superficie: «Voz por Bluetooth directo · cifrada» y calidad (latencia, pérdida, códec).

### 9. Diagnóstico

Hitos en `~/Library/Logs/app.starseed.os/enlaces.log` (evento `llamada`): `senal-enviada`, `senal-recibida`,
`contestada`, `medio=webrtc`, `medio=enlace-datos`, `fallo`, `reintento`.

### 9. Prueba en dispositivos

Tableta con Wi-Fi y datos apagados y solo Bluetooth; Mac con BLE central enlazado a la tableta. Llamar desde la
Mac, contestar en la tableta: la Mac muestra «Contestada · conectando audio…» y a continuación «Voz por
Bluetooth directo · cifrada». Con el Bluetooth cortado a media llamada, a los 15 s ambas acaban con motivo.
