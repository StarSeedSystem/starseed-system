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
3. Si WebRTC conecta más tarde: **la voz que ya funciona se queda** (LLA1110D; antes volvía a WebRTC y provocaba el
   salto de dos veces por segundo de la prueba 33). Solo vuelve si la voz por datos se degrada de forma sostenida
   (ver «Carriles por flujo»).
4. A los 15 s sin audio por ninguno: la llamada acaba con motivo claro en los dos extremos (señal `fallo`),
   con «Reintentar». Nunca queda «conectando».

Vídeo por BLE a calidad normal no cabe: desde LLA1108H la llamada **escala sola al Wi-Fi directo** y, mientras tanto
(o si es imposible), lleva **vídeo ligero** por el enlace de datos (ver «Escalada y vídeo ligero» más abajo).

### 9c. Carriles por flujo (LLA1110D, `carriles.ts`)

**Por qué saltaba el medio (prueba 33, llamada 3, Wi-Fi encendido).** Dos señales se contradecían en los DOS extremos:
`hayRutaIpHacia` no contaba la red local nativa (TCP 47071) como ruta IP, así que `decidirAccionMedio` decía «sin IP →
enlace de datos» y arrancaba la voz por Bluetooth; WebRTC conectaba por la LAN medio segundo después y la misma
función decía «WebRTC conectado → volver a WebRTC», que paraba la voz por datos mandando `voz.c fin`. El oyente pasivo
de `vigilarMedio` arrancaba la voz por datos con CUALQUIER texto `voz.*` del otro, **incluido ese `fin`** y los paquetes
de audio aún en vuelo: cada extremo rearrancaba lo que el otro acababa de parar. Reproducido en el banco real: 77
reinicios por extremo en 40 s con el código de main (≈2 por segundo, como en el registro).

**Arreglo de la causa.** (1) La red nativa cuenta como ruta IP (`voz-datos/transporte.ts`, caché asíncrona de 3 s;
`null` mientras no se sabe), y un WebRTC conectado es en sí la prueba de que hay IP (`motor.rutaIp`). (2) Solo un
`voz.c hola` arranca la voz por datos del otro lado; un `fin` con motivo `carril:…` la para también aquí; nunca la
rearranca un `fin` ni audio en vuelo. (3) La voz que funciona no se reinicia porque aparezca otro camino.

**El modelo: cada flujo tiene su carril.** Flujos: `senal`, `voz`, `video`, `pantalla`, `datos`. Carriles: `webrtc`,
`awdl`, `wifi-aware`, `wifi-direct`, `lan-tcp`, `ble-l2cap`, `ble-gatt` (el enlace de datos se nombra por su tipo y su
capacidad: Bluetooth por debajo de 60 kb/s es `ble-gatt`). `SelectorCarriles` (puro, uno por par) recibe en cada tic
(500 ms) una muestra por carril (arriba, rtt, pérdida, kb/s) y aplica:

| Flujo | Primera elección | Se mueve cuando | Evidencia | Enfriamiento | Sube a uno mejor |
|---|---|---|---|---|---|
| voz | la arranca `decidirAccionMedio` (WebRTC, o datos sin IP / ICE sin conectar a 6 s) | su carril cae (media evidencia) o se degrada (pérdida ≥ 15 %, rtt ≥ 1.2 s, o 4 s sin recibir) | 6 s | 30 s | **no** |
| vídeo / pantalla | WebRTC si está; si no, vídeo ligero por datos | cae o se degrada | 3 s | 10 s | sí, tras 3 s sano |
| señal | el canal por donde llega (directo o servidor) | — (lo lleva el transporte universal) | — | — | — |

Con Bluetooth y Wi-Fi arriba, la voz se queda en Bluetooth y el vídeo va por WebRTC (el ejemplo de Alex); solo con
Bluetooth, los dos por él, la voz primero (cola propia). Cada flujo cae y vuelve por su cuenta. Mientras la voz de un par
va por datos, el emisor de audio de WebRTC de ese par lleva `null` (no hay voz doble).

**Desempate.** Director = el par descortés de la negociación (id menor), el mismo en los dos extremos
(`soyDirector`). Si el director tiene la voz por WebRTC sana, ignora el `hola` del otro; el otro, sin recibir nada por
datos 4 s, la degrada y vuelve a WebRTC (una vez). Quien mueve la voz a WebRTC manda `fin carril:webrtc` y el otro le
sigue sin esperar evidencia propia (cuenta como cambio: enfriamiento).

**Forzar un carril.** `motor.forzarCarril("video", "webrtc")`; `forzarCarril(flujo, null)` vuelve a automático. Si el
carril forzado no está arriba, manda la elección automática. Interfaz para la ventana: `estado().carriles` (y
`motor.carriles()`): por par `{ parId, voz, video, pantalla, senal, datos, forzados, texto, director }`; `texto` ya
dice «Voz: Bluetooth · Vídeo: WebRTC». LLA1110C aún no lo pinta.

**Negociación sin choques.** «Perfect negotiation» con papeles fijos: cortés = id mayor (`soyCortes`). Toda oferta sale
por `motor.ofertar`: **sin ruta IP no se oferta** (por Bluetooth ICE no conecta nunca y las ofertas solo ocupaban el
enlace); queda `ofertaPendiente` y sale al aparecer la ruta IP. Una oferta cruzada: el descortés la ignora, el cortés
cede (rollback implícito) y responde. Cámara: `alternarCamara` es una operación a la vez (dos toques no se pisan).

**Llamar sin internet (`inicio-sin-servidor.ts`).** La tableta sin Wi-Fi nunca llamaba: `planLlamada` solo conocía el
enlace WebRTC local o el servidor, y `empezarLlamadaSinChat` creaba la sesión en Supabase antes de nada. Ahora, si hay
un enlace directo con la neurona (`hayEnlaceDirectoCon`), la llamada va por él: id de sesión local (uuid), sin tema de
Supabase (solo el canal por el transporte universal), ICE sin servidores, identidad de la última conocida en el aparato,
y el timbre es el mismo mensaje urgente de siempre (`via: "sistema-llamadas"`, el otro lado suena igual). Lo del servidor
queda en `starseed.llamadas.pendientes-servidor.v1` y se escribe al volver la red.

**Registro.** Como mucho 4 líneas por minuto y flujo; 12 de negociación por par.
- `llamada carril par=… flujo=video de=ble-l2cap a=webrtc motivo=webrtc-mejor-sostenido muestras=[webrtc:ok rtt=20 · ble-l2cap:ok rtt=80 kbps=165]`
- `llamada carril par=… flujo=voz hola-ignorado motivo=director-en-webrtc` · `llamada carril flujo=video forzado=webrtc`
- `llamada negociacion par=… rol=descortes oferta-en-espera motivo=negociacion-necesaria sin-ruta-ip`
- `llamada negociacion par=… rol=cortes colision cede-y-responde` · `… estado=have-local-offer`
- `llamada inicio paso=sesion-servidor fallo error=…` · `llamada inicio paso=via ok via=local motivo=sin internet: va por el enlace directo` · `llamada inicio paso=timbre ok por-el-enlace-directo`
- `llamada camara encender-fallo pedida=elegida error=…` · `llamada camara encendida estado=live pares=1`

**Banco real.** `pruebas-reales/llamadas-medio/` (ver su LEEME): dos motores reales en Chromium con RTCPeerConnection,
cámara y micro falsos, señalización en bucle y un enlace de datos simulado.

**Sin verificar en aparatos:** la detección de la red nativa como ruta IP en la tableta, el `hola`/`fin` cruzados por el
Bluetooth real, la llamada sin servidor de la tableta a la Mac (timbre por la malla sin internet) y el vídeo WebRTC por la
LAN entre la Mac y la tableta.

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
`contestada`, `medio=webrtc`, `medio=enlace-datos`, `medio=video-datos`, `escalada-wifi`, `fallo`, `reintento`.
LLA1108H añade por sentido el códec final: `voz-datos tx=<c> (comunes: …)` / `voz-datos rx=<c>` y
`video-datos tx=<c>` / `video-datos rx=<c>` (más `rx-sin-decodificador`, `pide-clave`, `perfil=…`).

### 9. Escalada al Wi-Fi directo y vídeo ligero (LLA1108H)

Caso real 09-11 (0.5.1-prueba.30): voz por Bluetooth sí; vídeo no, y el log no mostraba ningún evento `enlace-wifi`:
el motor real (`MotorLlamada`) nunca pedía el enlace directo (solo lo hacían `llamadas-neurona.ts`, archivos y flujos).

**Escalada (`escalada-wifi.ts`, `motor.ts › revisarEscalada`)**. Cada 500 ms, por par: si el único camino no lleva
IP (`hayRutaIp === false`; ahora cuenta como ruta IP un enlace Wi-Fi directo activo, `enlaceWifiDe`) y hay cámara,
pantalla o la voz por datos va «regular/mala», la llamada llama a `escalarWifi(clase, flujoLocal)` →
`avisarEnvioPesado({ clase: "llamada" | "pantalla", flujo })` → `alNecesitarAncho`. Una vez por clase y par cada
60 s; la propuesta no se repite dentro de la misma llamada (`clave` por llamada). Decide el ajuste (§5 de
`wifi-directo.md`): Automático abre; **Preguntar** propone con un toque en los dos aparatos; **Nunca** no hace nada.
El flujo local se pasa a `retenerFlujo`: el enlace se retiene mientras la llamada tenga pistas vivas y se suelta
por las reglas de inactividad al colgar. Cuando aparece una ruta IP (false → true) y WebRTC no está conectado, el
motor reinicia ICE (`restartIce`, sin colgar, ≥1,5 s entre intentos) y el vigilante de LLA1108E vuelve a WebRTC sin
cortar en cuanto conecta; entonces se suelta el vídeo ligero y el vídeo va por WebRTC.

**Pasos que enseña la superficie** (`estado.escalada.texto`, en el chip; el aviso del Mac va en el motivo):
«Voz por Bluetooth · el video llegará al abrir el Wi‑Fi directo» → «Abriendo Wi‑Fi directo…» (+ «Este Mac tiene una
sola radio Wi-Fi: deja tu red de casa mientras dure») → «Video por Wi‑Fi directo (sin router)». Con «Preguntar»:
«Acepta abrir el Wi‑Fi directo para tener video completo». Con vídeo ligero activo: «Video ligero por Bluetooth
(baja resolución)» y, en `textoMedio`, la calidad («160×120 · 4 fps · 40 kbps · VP8»); con «Nunca»: «Wi‑Fi directo
desactivado en los ajustes: el video va ligero por Bluetooth».

**Vídeo ligero (`video-datos/*`)**. Mientras la voz va por el enlace de datos y WebRTC no conecta existe una
`SesionVideoDatos` por par (también para RECIBIR aunque mi cámara esté apagada).
- Códec: WebCodecs `VideoEncoder`/`VideoDecoder`, VP8 (`vp8`) o H.264 baseline (`avc1.42001e`, Annex B,
  `latencyMode: "realtime"`) solo donde `isConfigSupported` lo confirme; si no, JPEG desde canvas a ≤3 fps.
  Android WebView (Chromium): VP8/H.264; WKWebView de Mac: lo que ofrezca (normalmente H.264).
- Escalera de calidad `PERFILES_VIDEO`: 160×120·4 fps·40 kbps → 320×240·12 fps·150 kbps; clave cada ~2 s o a petición.
- Adaptación (`adaptacion.ts`): techo = ½ de la capacidad del enlace − 28 kbps de voz (sin medida: el suelo);
  presión (cola de voz ≥ 700 B, enlace «ocupado», cola de vídeo ≥ 4 KiB o fragmentos descartados) tira fotogramas y,
  con 2 avisos en 2 s, baja un escalón; tras 6 s en calma sube uno.
- **Prioridad audio > vídeo > lo demás**: cola propia de vídeo en el motor BLE (`enviarVideo`, tope 24 KiB, lo más
  viejo se tira), servida solo cuando no hay control ni voz esperando; la voz nunca espera por una imagen.
- Fragmentos `voz.v` al MTU (1200 B útiles por defecto) cifrados por la sesión del enlace; control `voz.w`
  (`hola` con los códecs que se saben DECODIFICAR, `kf`, `fin`). Fragmento perdido → el receptor descarta el
  fotograma y los diferenciales siguientes y pide un clave (`kf`, ≤1/s); jamás se pinta una imagen a medias.
- La imagen que llega se pinta en un canvas cuyo `captureStream` es el `stream` del participante remoto.

**Códec por sentido** (voz y vídeo). Cada lado anuncia lo que sabe decodificar; el que emite elige el mejor de lo
que sabe codificar y el otro decodifica. Cada paquete lleva su códec, así que un «adpcm» de un lado y un «opus» del
otro son válidos: cada uno decodifica lo que recibe. Si llega uno que no se sabe decodificar, se anota
(`rx-sin-decodificador`) y se vuelve a saludar para que el otro rehaga la elección (antes se tiraba en silencio).

**Pruebas**: `__tests__/escalada-wifi-llamada.test.ts` (dos `MotorLlamada` reales por BLE falso: pide `llamada`, vídeo
ligero, sube a WebRTC sin colgar, Preguntar/Nunca, cadena real `avisarEnvioPesado`), `video-datos/__tests__`
(fragmentación, pérdida → clave, presión, prioridad) y `malla/__tests__/bluetooth-directo-motor.test.ts` (cola de vídeo).

### 9. Vídeo ligero: por qué salía en negro y cómo se cierra (VID1110A)

Prueba.32 (Mac ↔ tableta, solo Bluetooth): audio bien, vídeo negro en las dos puntas, VP8 negociado y paquetes recibidos. El
registro no decía en qué etapa moría el fotograma. Etapas y lo que se cambió (`video-datos/*`):

| Etapa | Riesgo encontrado | Cambio |
|---|---|---|
| Captura | `crearFuenteDePista` leía de un `<video>` sin montar en el documento: WKWebView no lo decodifica (`readyState` 0 → `capturar()` devolvía siempre `null`) | El `<video>` se monta fuera de vista (2×2 px, no `display:none`), se reanuda si el motor lo pausa y se cuentan los fotogramas negros (`negros=`; si todos lo son: `fuente-negra`) |
| Codificación | Los errores del `VideoEncoder` se tragaban (`error: () => enc = null`) y se reintentaba sin fin | `alError` con motivo; 3 errores seguidos o 12 capturas sin salida → el códec se **veta** y se renegocia (VP8 → H.264 → JPEG) con un nuevo `hola` |
| Transporte | La cola de vídeo del Bluetooth (24 KiB) tira lo más viejo: un clave de más de ≈ 24 KiB de texto perdía sus primeros fragmentos y nunca llegaba entero (el otro lado pedía clave sin fin: `pide-clave`) | Salida paciente: la sesión sólo mete fragmentos mientras `cola + fragmento ≤ topeColaVideoBytes()`; un clave sustituye al fotograma pendiente; lo que lleva > 2,5 s esperando se tira y se pide otro clave |
| Decodificación | Un `VideoDecoder` que no devuelve imágenes ni da error dejaba al otro lado «recibiendo» pero negro | 10 fotogramas completos sin ninguna imagen → decodificador vetado, `hola` sin ese códec, el emisor pasa a otro |
| Pintado | Se enseñaba `canvas.captureStream()` en un `<video>`; un canvas fuera del documento no emite fotogramas en WKWebView y en ningún motor emite si no se repinta | La **ruta robusta**: el canvas donde se pinta se monta tal cual en el mosaico (`LienzoLigero`; `ParticipanteLlamada.lienzo` → `VistaLlamada.remotoLienzo`). Sin `<video>` ni `MediaStream`. El `stream` sigue existiendo (grabación) y se crea al pedirlo |
| Vista propia | Cambiar de cámara a mitad de llamada no avisaba al vídeo ligero, que seguía leyendo la pista parada | `cambiarCamara` llama a `alCambiarVideoLocal()` |

Ruta por motor: **WKWebView** y **Chromium (Android)** usan el mismo camino: `<video>` montado → canvas reducido → `VideoEncoder` (VP8, o
H.264 si es el que hay) → fragmentos → cola paciente → reensamblado → `VideoDecoder` → `drawImage` al canvas del mosaico. Si
`VideoEncoder`/`VideoDecoder` faltan o fallan, JPEG de canvas (≤ 3 fps), que es un camino probado (`video-negro-1110.test.ts`).

**Diagnóstico** (mismo canal que `voz-datos`, hito `medio=video-datos`), cada 5 s mientras hay vídeo ligero, una línea por sentido:

```
video-datos tx capturados=… codificados=… enviados=… descartados=… clave=… kbps=… negros=…
video-datos rx paquetes=… cuadros=… decodificados=… pintados=… errores=… ultimoError="…"|ninguno
```
Cómo leerlas: `capturados=0` → la cámara no entrega (permiso, pista parada); `capturados>0, codificados=0` → códec mudo (saldrá
`tx-error` o `tx=… (vp8 vetado …)`); `codificados>0, enviados=0` → cola del enlace; `paquetes>0, cuadros=0` → fragmentos
perdidos (`pide-clave`); `cuadros>0, decodificados=0` → decodificador (`rx-vetado`); `decodificados>0, pintados=0` →
`ultimoError="pintar: …"`; todo > 0 y negro → `negros=` casi igual a `capturados/4` (la fuente es negra: probar otra cámara).
Otras líneas: `video-datos tx-error codec=… "…"`, `video-datos rx-vetado codec=… "…"`, `video-datos fuente-negra …`.

## 9b. Cámaras y cámara remota (VID1110A)

**Elección.** `camaras.ts` clasifica cada cámara por su etiqueta (`integrada` · `continuidad` · `externa` · `virtual` · `remota`) y el
nombre que se enseña sale de ahí («Cámara de esta Mac», «Cámara del iPhone (Continuidad)», «Cámara trasera»…). **Por defecto, la del
propio aparato** (la frontal si hay varias); externa, Continuidad y virtual sólo si no hay ninguna integrada. Antes la llamada pedía
`facingMode: "user"` y macOS elegía el iPhone (Continuidad) por su cuenta. Ahora `obtenerMedios` → `afinarCamara`: con el permiso dado se
ven las etiquetas y, si lo abierto no es lo que se elegiría, se reabre la buena y se suelta la otra (si falla, se queda la del sistema;
nunca sin cámara). Registro: `llamada camara camara elegida="FaceTime HD Camera (Built-in)" (integrada) motivo=integrada|guardada|pedida|sin-integrada|sistema`.

**Qué se recuerda** (`localStorage` `starseed.llamadas.dispositivos`, v2, por neurona): cámara, micrófono y altavoz elegidos a mano
(mandan sobre la elección automática mientras sigan disponibles, por id o por etiqueta) y las opciones de cada cámara. La forma v1
(global) se migra a v2 al leerla. Sin almacenamiento todo sigue funcionando.

**Selector.** Pestaña «Calidad» de la superficie, panel «Audio y vídeo» de la ventana y la antesala (`selector-camara.tsx`): cámara
(con «predeterminada»), micrófono, altavoz donde hay `setSinkId`, y «Opciones de cámara» (resolución, fps, zoom, linterna, enfoque,
exposición, espejo) **sólo lo que `track.getCapabilities()` dice**; sin capacidades (WKWebView) lo explica. Cambiar de cámara no corta la
llamada (`replaceTrack` + recaptura del vídeo ligero). «Girar cámara» alterna entre las propias (frontal/trasera): no salta a Continuidad.

**Cámara remota** (otra neurona de la MISMA cuenta como cámara). Diseño: la neurona con cámara la publica como flujo
(`flujos-neurona` / `transmision-medios`, `abrirFlujo` del transporte universal) con id `cam`; las demás neuronas de la cuenta la ven
como `Cámara de <neurona>` (`camaraRemotaComoInfo`, `OrigenCamaraRemota`). Al elegirla, su imagen es la fuente de vídeo de la llamada,
de la grabación y de la transmisión (`FuenteCamaraRemota`: `pista` si llega por WebRTC, `lienzo` si llega por vídeo ligero). Ruta: la
mejor que haya (WebRTC por LAN/Wi‑Fi directo; vídeo ligero por Bluetooth, mismo motor de §9). Un iPhone se une desde la app web
(Safari tiene WebRTC). **Estado: DIFERIDO.** Hecho: tipos, entrada del selector (desactivada con su motivo) y este contrato. Falta:
publicar la cámara como flujo, el puente flujo → `FuenteVideo`/`MediaStream` en el motor y aceptar sólo neuronas de la cuenta.
Mientras, el iPhone en el Mac se elige a mano como Cámara de Continuidad (se recuerda).

### 9. Prueba en dispositivos

Tableta con Wi-Fi y datos apagados y solo Bluetooth; Mac con BLE central enlazado a la tableta. Llamar desde la
Mac, contestar en la tableta: la Mac muestra «Contestada · conectando audio…» y a continuación «Voz por
Bluetooth directo · cifrada». Con el Bluetooth cortado a media llamada, a los 15 s ambas acaban con motivo.

## 10. La superficie sobre el motor real (LLA1108G)

LLA1108C solo cableó la superficie a la llamada directa. Las llamadas reales van por `MotorLlamada`; ahora la superficie también las lleva:
`superficie/adaptador-motor.ts` (`AdaptadorMotor`) traduce el estado del motor a `VistaLlamada` y da las `AccionesLlamada`;
`components/llamadas/superficie/superficie-motor.tsx` lo monta (lo usa `VentanaLlamada`; la ventana anterior queda tras `SUPERFICIE_NUEVA`).
Regla: ningún botón muerto. Cada control funciona o sale desactivado con su motivo (`matriz-controles.ts`, fijado por tests).

### 10.1 Mensajes de aplicación

Señal nueva `app` en `SenalLlamada` (`motor.enviarApp(carga)` / `motor.suscribirApp(cb)`, marcado `// LLA1108G`, aditivo). Viaja por el mismo
canal de la llamada (Supabase, enlace local o transporte universal), así que funciona sin internet. `sanearSenal` exige `carga.k` (1 a 40
caracteres) y JSON de 8 000 caracteres como máximo. De paso, `sanearSenal` ahora deja pasar la señal `texto` (transcripción compartida), que antes descartaba.
Clases (`k`): `tipo`, `espera`, `grabacion`, `grabacion-ack`, `astraura-estado`, `astraura-pregunta`, `astraura-llamada`, `trans`, `chat`,
`reaccion`, `fin-todos`, `invitacion`. Todo lo recibido pasa por `leerMensajeApp`.

### 10.2 Matriz de controles (tipo × medio × plataforma)

Medio = lo que lleva la voz: WebRTC, enlace de datos (sin ruta IP) o Bluetooth (enlace de datos por BLE).

| Control | WebRTC | Enlace de datos | Bluetooth |
|---|---|---|---|
| Micro, espera, chat, reacciones, calidad, Astraura, pantalla completa | sí | sí | sí |
| Cámara / pasar a Vídeo | sí | sí, **vídeo ligero** (LLA1108H); sin códec en el aparato: no, «el vídeo no cabe por el enlace de datos» | sí, vídeo ligero «Video ligero por Bluetooth (baja resolución)»; sin códec: no, «El vídeo no cabe por Bluetooth: cambia a Wi‑Fi o red local» |
| Compartir pantalla / pasar a Pantalla | sí (según plataforma) | no (la imagen necesita Wi‑Fi o red local) | no: «La pantalla no cabe por Bluetooth: se abre sola por Wi‑Fi directo (sin router) si lo permites» |
| Invitar / pasar a grupo (hasta 8) | sí | sí | no: por Bluetooth solo se habla de dos en dos |
| Girar cámara | con 2 cámaras y la cámara encendida | no hay vídeo | no |
| Medio de transmisión | solo «Automático»; fijar uno concreto sale desactivado («no se puede fijar a mano todavía») | | |

| Control | Web escritorio | App de Mac | Android |
|---|---|---|---|
| Compartir pantalla | sí (`getDisplayMedia`) | solo si el WKWebView lo ofrece; si no, motivo | no: motivo (su WebView no lo ofrece) |
| Girar cámara | si hay 2 cámaras | igual | sí (frontal/trasera) |
| Salida de audio | `setSinkId` (Chromium) o la del sistema | igual | rutas nativas (auricular, altavoz, cable, Bluetooth) |
| Imagen en imagen | con vídeo remoto y PiP del navegador | igual | según WebView |
| Pasar a En vivo | no: se empieza desde el chat (todas) | | |
| Grabar | con `MediaRecorder`; si no, motivo | | |
| Terminar para todos | más de 2 personas y ser quien lleva más tiempo en la llamada | | |

### 10.3 Cambiar de tipo sin colgar

`AdaptadorMotor.cambiarTipo(a)` comprueba la máquina y la matriz, difunde `{k:"tipo"}` (la otra superficie avisa «… pasa a vídeo»), y
añade o quita pistas sobre la misma conexión con `alternarCamara` / `alternarPantalla` (renegociación del motor; el micro no se toca). La presencia
(`camara`/`pantalla`) confirma el tipo en los dos lados. Si el aparato falla (permiso, cámara ocupada), vuelve a como estaba y lo dice.
Con más de dos personas el tipo es «grupo».

### 10.4 Invitar, grabar, Astraura, terminar

- Invitar: `planInvitar` con tope 8; el timbre con la llamada se manda al chat de cada invitado. Quien no sea del chat entra con «Invitar con enlace».
- Grabar: local (`MediaRecorder` sobre una mezcla Web Audio de todos más la imagen disponible). Antes se difunde `grabacion` y se esperan los
  acuses `grabacion-ack`; si falta uno, no se graba (falla cerrado). Todos ven «Grabando»; quien entra tarde recibe el aviso. Se guarda en OPFS `grabaciones-llamada/`.
- Astraura: todas las neuronas activas calculan el mismo generador con `elegirGenerador`; solo ese llama al cliente existente y difunde la
  `RespuestaAstraura` con los ajustes de voz. Todas la muestran una vez (dedupe por id) y la leen con los mismos ajustes si lo pidieron.
- Terminar para todos (`fin-todos`) solo lo acepta quien entró primero (`unido` más antiguo).

### 10.5 Teclado y accesibilidad

M micro, V cámara, S pantalla, F pantalla completa (`atajos.ts`; no al escribir ni con Ctrl/Alt/Cmd). Si la matriz bloquea la acción, se muestra el motivo.
Etiquetas en cada botón, motivo en `title`, `role=status` en el chip y los avisos. Con movimiento reducido no hay animación de entrada ni reacciones flotantes.

### 10.6 Página e historial

`/llamadas` (`pagina-llamadas.tsx`): llamar por voz, vídeo o pantalla a un chat y consultar el historial local (`historial-llamadas.ts`: medio, duración,
grabación) con «Volver a llamar». Límites conocidos: la página lanza llamadas desde chats, no desde neuronas sueltas.

### 10.7 Prueba en dispositivos

1. Mac y tableta por internet, con la llamada contestada: en la Mac pulsa V; la tableta debe mostrar la imagen sin cortar el audio. Pulsa S (pantalla) y luego «Voz».
2. Pestaña Grabar, «Empezar a grabar»: la tableta muestra el aviso; al parar, guardar en Archivos. Con la tableta sin responder el acuse, no empieza.
3. Pestaña Astraura en las dos: pregunta en la Mac; sale la misma respuesta en las dos.
4. Solo Bluetooth: Cámara y Pantalla desactivadas con su motivo; chat, reacciones y Astraura funcionan.
5. Android: Pantalla desactivada con motivo; girar cámara; elegir ruta de audio.
