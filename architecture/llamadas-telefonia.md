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

**Relevo de vídeo sin hueco (LLA1110D + LLA1110C).** `streamDe`/`lienzoDe` enseñan el lienzo del vídeo ligero si su
carril es el de datos **o** si WebRTC no trae imagen (par sin conectar o pista viva pero muda). La sesión de vídeo
ligero vive mientras la pista de WebRTC no traiga imagen: en datos → WebRTC el lienzo sigue hasta que el `<video>`
tiene cuadros (solo se MANDA por datos si el carril de este lado es el de datos); en WebRTC → datos arranca en cuanto
WebRTC se cae. Segunda defensa en la ventana: el adaptador cae al último lienzo pintado (`video-datos/lienzos.ts`).
Con un solo par, la ventana enseña la línea «Voz: … · Vídeo: …» (`vista.textoCarriles`) bajo la del medio y en el
panel «Medio»; forzar por flujo desde ese panel queda para más adelante (`forzarCarril` ya existe).

**Rollback explícito.** El cortés que cede hace `setLocalDescription({type:"rollback"})` antes de aceptar la oferta
cruzada: con el rollback implícito, Chromium dejaba muda para siempre la pista de vídeo remota del cortés aunque se
decodificaran los cuadros (banco: la tableta veía negro el vídeo de la Mac). Además, si tras responder quedan pistas
propias sin negociar, se vuelve a ofertar.

**Cámara.** `afinarCamara` intenta abrir la preferida con la del sistema abierta; si el error es de cámara ocupada
(`NotReadableError`, `AbortError`), suelta la del sistema y reintenta, y si tampoco, reabre la del sistema; cada fallo
va al registro (`camara cambio-a-preferida-fallo …`). `obtenerMedios` anota sus fallos (`camara obtener-medios-fallo
… error=…`) y `alternarCamara` reintenta sin `deviceId` si la elegida no abre (`camara elegida-no-abre …`).

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

### 9. Reparto voz/vídeo en un enlace estrecho (LLA1111B, `video-datos/reparto.ts`)

Prueba.35 (Mac ↔ tableta por Bluetooth): el vídeo ligero solo se movía con el micro silenciado. Dos causas que se suman:
el motor Bluetooth (`malla/bluetooth-directo-motor.ts`, `bombear`) saca SIEMPRE antes su carril de voz que el de vídeo y
escribe en parada y espera (≈ 42 ms de acuse por escritura): con voz cada 60 ms el carril de voz nunca está vacío y el de
vídeo no sale; y la sesión de vídeo solo capturaba con menos de 2 KiB de voz en cola (`hayHueco`, todo o nada). En la Mac,
toda la llamada: `video-datos tx … kbps=0 motivos=cola-video:…`.

Reglas del reparto (solo vídeo ligero por el carril de datos con contadores, hoy el Bluetooth; WebRTC y la red local no
cambian: sin `bytesEntrados` la sesión sigue el camino de antes):

- **Un solo carril, la voz primero.** Los fragmentos de vídeo entran en el carril de la VOZ (cada escritura lleva voz y
  vídeo juntos) y la voz entra siempre directa, nunca espera a la sesión de vídeo. `vozOcupada` no cuenta como
  contrapresión los bytes de la ventana de vídeo.
- **Ningún fragmento tapa a la voz más de una escritura.** Ventana = lo que cabe en una escritura de `CICLO_OBJETIVO_MS`
  (100 ms): `(100 − R)·C` bytes, entre 300 B y 1,5 KiB. El vídeo solo entra con el carril (que cuenta lo que está en vuelo
  hasta el acuse) por debajo de dos ventanas, y cada fragmento cabe en una ventana. Un paquete de voz espera como mucho la
  escritura en vuelo y sale en la siguiente.
- **Lo que cabe se mide.** De `bytesEntrados` y `colaVozBytes` sale lo acusado; cada escritura acusada con el carril ocupado da
  un par (bytes, ms) y se ajusta `ms = R + bytes/C`. Cabe `8·C·(1 − R/ciclo)` kb/s; el presupuesto del vídeo es eso menos la
  voz medida, con un 10 % de margen.
- **Control (cada segundo, `ControlReparto`).** Baja al presupuesto (`capacidad`), ×0,6 si la voz espera > 260 ms
  (`retraso-voz`), ×0,7 si el receptor informa > 15 % de fotogramas perdidos (`perdida-receptor`, control `rep` cada 2 s);
  sube +15 % (≥ 4 kb/s) si la voz espera < 210 ms y el vídeo quiere más (`hay-sitio`). Una cubeta de fichas a la tasa
  objetivo pasa los fragmentos: un clave grande sale a ese ritmo, nunca de golpe (claves cada ≥ 5 s).
- **Escalón por coste real (`CosteEscalon`).** `PERFILES_VIDEO_REPARTO` va de 160×120 a 1 fps hasta 320×240 a 12 fps;
  abajo bajan primero los fps (6 → 1) a 160×120. El escalón es el más alto cuyo coste previsto (kb/s configurados × lo que el
  códec gasta de verdad en texto por fotograma, media móvil) cabe en el objetivo; subir pide un 10 % de holgura y 3 s.
- **Pausa con histéresis.** Suelo `SUELO_KBPS` = 12 kb/s (≈ 1 fps a 160×120). Bajo el suelo 3 s seguidos → pausa: no se
  captura, se manda `pausa` al otro, el último fotograma se queda en pantalla y los dos ven «Vídeo en pausa: la señal solo
  alcanza para la voz» (en `videoDatos.calidadTexto` → línea de estado). Se reanuda sola, con `sigue` y un clave, tras 5 s
  seguidos con la voz esperando poco y sitio para el doble del suelo (y ≥ 4 s en pausa); si vuelve a pausarse antes de 20 s
  de reanudar, la calma pedida se duplica (hasta 40 s). Igual cuando el estrecho es el propio lado.
- **Línea de estado veraz.** Con reparto dice lo MEDIDO (fps y kb/s que salen de verdad) o el aviso de pausa.

Registro (`medio=video-datos`), cada 5 s y en cada cambio de estado:

```
video-datos reparto activo motivo=capacidad kbps obj=40 voz=50 video=44 cabe=94 enlace=166+43ms espera-voz=200ms vent=1180B coste=x1.8 fps=4 perd-rx=0%
video-datos pausa motivo=suelo cabe=31kbps voz=50kbps retraso=180ms calma-pedida=5s
video-datos sigue motivo=sitio-de-nuevo cabe=92kbps voz=48kbps retraso=140ms
video-datos otro-en-pausa motivo=suelo (se queda el último fotograma)
video-datos perfil=160×120 · 4 fps · 18 kbps · VP8 motivo=hay-sitio coste=x1.9
```
(`enlace=C+R`: capacidad serializada en kb/s y acuse fijo; `cabe`: voz + vídeo con escrituras de 100 ms; los descartes siguen
en `video-datos tx … motivos=…`, ahora también `pausa:N`).

Límites conocidos: la voz Opus de 24 kb/s ocupa ≈ 48 kb/s de texto en el carril (base64 + JSON con el id de la llamada):
con 40 kb/s no cabe ni sola. Con el vídeo en pausa y solo voz, las escrituras son iguales y el modelo supone la capacidad
anunciada; si el enlace real es más estrecho que lo anunciado (80 kb/s anunciando 160), el vídeo se queda en pausa aunque
cupiera ≈ 1 fps. La espera de la voz es inherente a la parada y espera (≈ 2 escrituras): el arreglo de fondo sería un
Bluetooth con escrituras solapadas o prioridad estricta dentro del carril (en `malla/`).

Banco: `pruebas-reales/llamadas-medio` casos `ble-160`, `ble-80`, `ble-40`, `ble-caida`, `ble-micro`.

### 9. La voz sigue al carril y dice la verdad bajo el suelo (VOZ1111J, `voz-datos/niveles.ts`)

**Dónde se doblaba la voz.** No entre la web y la app nativa (ese paso no cuesta aire): `ble_enviar` (`native/src-tauri/src/ble.rs`)
lleva el texto JSON tal cual dentro de la trama `SSB1` y del marco L2CAP (+17 B). El desperdicio estaba EN EL AIRE y en
dos capas: (1) `voz.p` (`voz-datos/paquete.ts`, `armarPaquete`) = base64 de las tramas + ≈ 110 B de JSON con el id de la
llamada por paquete: Opus 24 kb/s en paquetes de 60 ms → ≈ 48 kb/s de texto (dentro de un `nl.lote` cada comilla además se
escapa); (2) con el enlace cifrado (CIF1108A, el caso Mac ↔ tableta) `sesion-cifrada.ts` vuelve a pasar el texto a base64 en
`{"t":"nl.cif",…}`: ×4/3 + ≈ 96 B por escritura (`bluetooth-directo-motor.ts`, `bombear`, `cifrarHacia`). La capa (1) es de
la voz y se quita aquí; la (2) es de la malla y queda pendiente (ver «Límites»).

**Formato compacto «b1» (negociado).** `{"t":"voz.b","d":<base64>}` con cabecera binaria de 14 B (versión, códec, etiqueta
FNV-16 del id de la llamada, q en unidades de 20 ms, reloj de 32 bits, unidades cubiertas, nº de tramas y de redundantes) y
por trama 1 B (hueco de silencio | duración en unidades) + largo. Las unidades cubiertas sin trama son **silencio declarado**
(DTX: −48 dBFS durante > 200 ms, no se mandan y al otro lado suenan a silencio, no son pérdida). Se anuncia en el saludo
(`voz.c` `hola` con `fmt:["b1"]`); un aparato `0.5.1-prueba.36` no manda `fmt`, ignora `voz.b` y el control `rep`, y con él
se sigue hablando `voz.p` con tramas de 20 ms (su decodificador numera tramas de 20 ms) en los dos sentidos.

**Escalera (Opus).** 24 kb/s·20 ms·paquete 60 → 16·20·60 → 12·40·80 → 10·60·120 → 8·60·120 → 6·60·180 (kb/s de texto en
«b1»: ≈ 39 → 10). Con un aparato anterior las tramas se quedan en 20 ms. ADPCM/μ-law solo agrandan el paquete. Entradas cada
segundo: el modelo medido del carril (`MedidorEnlace` de `reparto.ts`: `ms = R + bytes/C`), la espera de la voz en el
carril, los descartes propios y el informe del otro (`rep` cada 2 s: % perdido, % tarde, kb/s, `corte`). Un escalón cabe si
`v/C + R/(2·paquete) ≤ 1 − holgura` (el Bluetooth junta en una escritura lo que espera: el ciclo queda en ≤ 2 paquetes).
Baja al instante con atasco (espera > máx(300 ms, 2,5 paquetes)), descartes, pérdida > 3 % o tarde > 5 % informados, o si el
modelo dice que no cabe; sube UN escalón tras 6 s de calma y con 30 % de holgura; si la subida falla en < 12 s, la calma se
duplica (hasta 48 s). Redundancia (cada paquete repite la última trama del anterior) solo con pérdida informada ≥ 1 % y el
escalón cabiendo dos veces. El búfer de fluctuación toma como suelo el tamaño del paquete que llega (+20 ms, tope 400 ms).

**Bajo el suelo.** Quien oye: 3 s seguidos con > 25 % de audio inventado (ocultación o búfer vacío) → deja de reproducir
fragmentos (silencio limpio) y la línea de estado dice «La señal no alcanza para la voz: en silencio hasta que mejore,
vuelve sola»; sale con 3 s < 8 %. Quien habla: 3 s de atasco en el último escalón, o el `rep` con `corte` → «La señal no
alcanza para la voz: al otro le llega a trozos; vuelve sola al mejorar». Va en `medio.calidadTexto` (`textoCalidadVoz`) y
`medio.nivel` = «mala»: la ventana de la llamada ya lo pinta, sin cambios en `superficie/` ni en `components/llamadas/`.

**Reserva para el vídeo.** `voz-datos/reserva.ts`: cada sesión publica los kb/s de texto de su escalón; `presupuestoVideo`
resta la mayor entre eso y la voz medida. La voz baja → el vídeo gana ese sitio; sube → lo devuelve.

**Escrituras aisladas en el modelo (VOZ1111L).** `MedidorEnlace` contaba solo escrituras seguidas (carril ocupado de un acuse al
siguiente). Con la voz ligera en un carril holgado no hay escrituras seguidas: el modelo se quedaba con lo medido durante una
caída y el vídeo seguía en pausa ~24 s tras volver la capacidad. Ahora una escritura que empieza con el carril vacío también da
su par (de que entra a su acuse, los dos a mitad del intervalo de 20 ms). Y un par de más de 1,5 s sale del modelo en cuanto hay 6
más nuevos (`EDAD_PAR_MS`): con la voz ligera, 40 pares eran 5–8 s de memoria del carril de antes. Solo el vídeo cuenta las
aisladas (`MedidorEnlace(…, { aisladas: false })` en la voz): con paquetes de tamaño casi fijo el ajuste cae en «supuesto»
(C = lo anunciado) y la escalera de la voz creía caber un escalón de más en un carril estrecho. Y en el vídeo, con escrituras aisladas, la pendiente
solo se cree si los tamaños abarcan ≥ 25 ms de serialización a lo anunciado (la voz sola no: sería ruido del muestreo de
20 ms); si no, «supuesto» con el acuse fijo del Bluetooth
(`ACUSE_BLE_MS` = 42 ms): C = bytes / (ms − 42), como mucho lo anunciado. Sin eso la voz ligera de un carril de 40 kb/s
parecía dejar ≈ 47 kb/s y el vídeo volvía en falso a mitad del estrecho. Todo esto (aisladas, olvido de 1,5 s, «supuesto» con acuse) solo mientras
no entra vídeo (en pausa) y no en el medidor de la voz; con el vídeo en marcha el modelo es el de LLA1111B.

Queda (no es de la voz): en el instante de una caída, el vídeo que ya estaba en el carril con la ventana de la capacidad de
antes (`ventanaBytes`, hasta 1,5 KiB, dos ventanas) tarda ≈ 260 ms en salir a 40 kb/s; el banco lo mide en `ble-caida`
(«esperó ≈ 259 ms tras un vídeo», también sin VOZ1111J).

Registro (`medio=enlace-datos`), cada 5 s (dos líneas: el registro corta cada detalle a 200 caracteres) y en cada cambio:

```
voz-datos tx n=5 opus=6k trama/paq=60/180ms texto=10k fmt=b1 cabe=13k enlace=15k+53ms entregado=16k espera=860ms paq=38 tiradas=0 otro:perd=0% tarde=0%
voz-datos rx paq=37 perd=0.2% tardias=0 ocultadas=+4 inventado=0% jitter=200ms
voz-datos nivel 3→5 motivo=descartes opus=6kbps trama=60ms paq=180ms texto≈10kbps cabe=13kbps espera=1320ms desc=4 rx-otro=perd 0% tarde 0% calma=6s
voz-datos formato=b1 (compacto) nivel=0      ·      voz-datos formato=p (aparato anterior) nivel=0
voz-datos bajo-suelo rx audio-inventado=100/66/76% (en silencio, aviso)   ·   voz-datos sobre-suelo rx audio-inventado=0%
voz-datos bajo-suelo tx motivo=descartes cabe=9kbps   ·   voz-datos sobre-suelo tx
```

Límites: la reserva solo vale con UNA sesión de voz activa; con varias (o los dos extremos del banco en una página) manda la
voz medida en el carril (VOZ1111L). El doble base64 del cifrado sigue en el aire:
con el enlace cifrado el suelo sube (banco: casos `-cif`); quitarlo es de `malla/` (cifrar a binario) o del marco nativo.
Banco: `voz-40`, `voz-24`, `voz-16`, `voz-caida`, `voz-suelo`, `voz-*-cif`, `vozvideo-80`, `vozvideo-40` (LEEME).

### 9. El reparto sobre lo que el enlace de verdad dice (LLA1111Q, 2026-11-11)

**Lo que pasó (prueba 37, `0.5.1-prueba.37`, Mac ↔ tableta solo por Bluetooth).** La radio medía 192–380 kb/s con sus
mensajes de 4–6 KB (`ble l2cap-kbps … kbps=237`) y el modelo de la llamada leía 8–35 kb/s (`video-datos reparto pausa
motivo=suelo … enlace=34+42ms … vent=300B`; `voz-datos tx n=5 opus=6k … enlace=15k+32ms`). La voz se quedó en 6 kb/s
(la tableta inventó el 68 % del audio) y el vídeo en pausa salvo 10 s. Tres causas, todas del modelo y no de la radio:
1. **La cubeta del emisor.** `bluetooth-directo-motor.ts` (`bombear`, `nuevaCubeta` de `red-local-nativa.ts`) gasta una
   ficha por escritura, sea del tamaño que sea: el otro admite 120 mensajes / 10 s, se manda al 60 % → **7,2 escrituras/s**
   (ráfaga de 36). La voz en paquetes de 60–180 ms más ping, pong e informes (≈ 1,8 escrituras/s por lado) pedían más de
   eso: la cubeta se vaciaba y TODO esperaba su ficha (≈ 140 ms por escritura).
2. **El modelo medía esa espera como capacidad.** `MedidorEnlace` deducía la duración de cada escritura de lo que bajaba
   la cola entre muestras: con la espera por fichas dentro y el acuse supuesto de 42 ms (`ACUSE_BLE_MS`), «bytes / (tiempo
   − 42)» con escrituras de 300 B daba decenas de kb/s.
3. **Se alimentaba sola.** Poca capacidad leída → ventana de 300 B → escrituras pequeñas → poco caudal → poca capacidad.
El carril fijo del banco (capacidad fija, acuse fijo de 42 ms, sin tope de escrituras) es exactamente lo que suponía el
modelo: no podía fallar así.

**Qué manda ahora.** Todo lo que mueve el escalón de la voz, la parte del vídeo, la ventana y la pausa sale de lo que el
enlace dice de sí mismo:
- **Duración de cada escritura medida por el emisor** (`escriturasLlamada` del motor: de entregarla a la app nativa a su
  acuse, sin la espera por fichas; adición marcada `LLA1111Q` en `bluetooth-directo-motor.ts`). Es el par (bytes, ms) del
  modelo `ms = R + bytes/C` (`ajustarEscrituras`): la pendiente solo se cree si los tamaños separan las escrituras más de
  3 veces lo que se desvían de la recta (sin ruido, como el carril fijo, basta cualquier variación; en el aparato el
  acuse va de 25 a 115 ms y la pendiente de escrituras de 300–2000 B es ruido); si no, **C = lo que mide la app nativa**
  con sus mensajes grandes (`capacidadKbps` del enlace, `l2cap-kbps`, en vivo) y R = la mediana de lo que queda. Ningún
  acuse fijo en ningún cálculo con medidas (`ACUSE_ARRANQUE_MS` = 50 ms solo hasta las 6 primeras escrituras).
- **El tope de escrituras del emisor** (`escriturasPorS` del motor, de los límites que el otro anuncia firmados) va en el
  modelo como `cicloMinMs` (139 ms). El ciclo de reparto es `max(100 ms, cicloMinMs)`: lo que cabe es `8·C·(1 − R/ciclo)`
  y la ventana `(ciclo − R)·C` (300 B – 2,25 KiB), no 300 B.
- **La voz no gasta escrituras de más.** Con tope de escrituras el paquete de cada escalón dura al menos ≈ 1,1 ciclos
  (`nivelConCiclo`: 160 ms con tramas de 20/40 ms, 180 con 60 ms; los kb/s del escalón no cambian): ≈ 6 escrituras/s y la
  cubeta no se vacía. Ping, pong e informe salen en la misma escritura que el siguiente paquete (sin voz, a los 600 ms).
  Un escalón cabe si `v/C + R / max(2·paquete, cicloMinMs) ≤ 1 − holgura` (con paquetes de menos de medio ciclo, varios
  salen en una escritura). Atasco = espera > `max(300 ms, 2,5 paquetes, 2,5 ciclos)`; para subir, ≤ `max(200 ms, 1,5
  paquetes, 2 ciclos)`. Con tope, la espera que cuenta es el **percentil 90 por escritura** (lo que esperó en el carril lo
  acusado en cada una), no el máximo: una escritura del espejo del registro (5 KB) no es un atasco de la voz.
  Al subir, **de una vez** al escalón más alto que cabe con holgura (no uno a uno): cada cambio rehace el códec Opus y
  suena un instante apagado al otro lado; al volver la capacidad tras una caída, cuatro subidas eran cuatro huecos
  (`voz-caida` fallaba por eso ya antes; `voz-suelo` empezaba a fallar en cuanto la voz volvía a subir).
- **El vídeo sale con la voz.** El transporte avisa (`alSalirVoz`) justo después de encolar cada texto de la voz; el
  vídeo mete entonces sus fragmentos y su informe, en el mismo turno: van en la MISMA escritura y no gastan ficha. Sin
  voz en el último medio segundo (micro en silencio) sale solo, a los 1,5 ciclos.
- **Control del vídeo (`ControlReparto`), por la espera de la voz.** Con tope de escrituras: baja ×0,6 si el p90 pasa
  de 2 ciclos (278 ms) o el máximo de 2,5 (el atasco de la escalera de la voz: el vídeo cede ANTES); sube +15 % si el
  p90 es < 1,6 ciclos y el vídeo quiere más; sin tope, como LLA1111B (260/210 ms sobre el máximo). Techo: lo que cabe
  menos la reserva de la voz. **Ventana = dos ciclos de su tasa** (`ventanaParaTasa`), nunca más de lo que cabe en una
  escritura: una escritura no lleva más vídeo del que el vídeo necesita, y la voz que llega detrás espera menos.
- **Suelo y pausa.** El suelo es lo que cuesta DE VERDAD el escalón de 1 fps (×1,25; `sueloMedido`), al menos 12 kb/s:
  con un códec que gasta el doble de lo configurado, 12 kb/s eran 0,8 fps sin pausa (`ble-80`). Reanudar es una
  **prueba**: vuelve al suelo, no sube en 3 s (`PRUEBA_S`) y, si la voz se atasca en ella, a la pausa AL MOMENTO con la
  calma doblada. En pausa la capacidad se sigue midiendo sin vídeo ni voz: las escrituras de la voz o de sus controles
  dan R, la app nativa da C; un vídeo en pausa vuelve sin que nadie hable (`ble-real-mudo`).

**El tope de la espera de la voz detrás del vídeo.** El vídeo puede tener en el carril, como mucho, dos ventanas (la
escritura en vuelo y la siguiente): 2 × 2304 B en claro = 6,2 KB en el aire con el cifrado, ≈ 118 ms a la serialización
media del calibrado y 176 ms a la más lenta medida (35 B/ms). Dos ventanas más un paquete de voz caben en la cola de voz
del Bluetooth (6 KiB, `MAX_COLA_VOZ_BLE`) sin que tire nada, y `vozOcupada` no retiene la voz por esos 4608 B.

Registro, cada 5 s (lo que el control usó; la radio al lado del modelo):
```
video-datos reparto activo motivo=hay-sitio obj=115 voz=35 vid=65 cabe=168 enlace=191k+17ms/139 nativo=191k entregado=106k esc=7x1.9K espera=180/180ms vent=2304B fps=6.5 perd-rx=0%
voz-datos tx n=0 opus=24k 20/160ms texto=36k b1 otro:perd=0%/tarde=0% cabe=207k enlace=237k+40ms/139 nativo=237k entregado=94k esc=6x2K espera=120/120ms paq=803 tiradas=0
voz-datos ciclo-emisor=139ms paq=160ms (una escritura por paquete, sin esperar fichas)
video-datos pausa motivo=prueba-fallida cabe=22kbps voz=10kbps enlace=36k+38ms nativo=… entregado=… espera=…/…ms calma-pedida=10s
```
(`enlace=C+R/ciclo`: el modelo y el ciclo mínimo del emisor; `nativo`: lo que mide la radio con mensajes ≥ 2 KiB;
`esc=escrituras/s x bytes medios`; `espera=p90/máx` de la voz en el carril. Si `enlace` y `nativo` discrepan mucho, o
`esc` va pegado a 7,2 con escrituras pequeñas, es el fallo de la prueba 37 otra vez.)

**Banco (LLA1111Q, 90–120 s cada caso, uno a uno).** Carril calibrado `ble-real`: antes voz en 6 kb/s, 6 huecos/min,
vídeo 0 fps (pausa «suelo» con `enlace=25–38k`); ahora Opus 24 kb/s en paquetes de 160 ms (36 kb/s de texto), 0 huecos,
pérdida 0,1 %, vídeo 6 fps en los dos sentidos (≈ 55–65 kb/s de texto), espera tras vídeo ≤ 139 ms. `ble-real-mudo`:
antes 3,2 / 0 fps, ahora 6,3 / 6,6. `ble-80` ya no se queda en 0,8 fps sin aviso: se pausa con aviso. Queda marginal
`ble-caida` en el instante de la caída (la voz espera 208–287 ms tras el vídeo que ya estaba en el carril, según la
corrida; con el código de antes 214–244): el vídeo que entró con la capacidad de antes no se puede sacar del carril.

**Qué prueban los carriles simulados y qué no.** El carril fijo del banco prueba la lógica en carriles estrechos y nada
más; el control de LLA1111B y VOZ1111J estaba afinado contra él y falló en el aparato. El carril calibrado (`ble-real`,
`pruebas-reales/llamadas-medio`) añade lo que el registro de la prueba 37 enseña (acuse variable, tope de escrituras,
cifrado, señalización y espejo en el mismo enlace) y reproduce aquel fallo con el código de antes; no prueba la radio
(reparto del aire entre los dos sentidos, pausas largas, GATT sin canal rápido, la medida nativa que llega cada 15 s).
Lo que manda es la siguiente ronda en los aparatos.

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

## 11. Paso de carril al instante, timbre en cola y vídeo que sube (MLL1111C · 2026-11-11)

- **Interfaz del motor (solo añadidos):** `OpcionesVozDatos.carrilesExtra?(parId)` (otros carriles medidos para el flujo de
  datos); `carriles.ts` exporta `SILENCIO_WEBRTC_MS`, `esperaReintentoIce`, `MARGEN_CAPACIDAD`, `capacidadCarril`,
  `ordenPorCapacidad`; `ReglaFlujo` gana `caidaMs?` y `porCapacidad?`. Nada se renombra ni se quita.
- **Caído ≠ degradado.** Caído (ICE caído, o WebRTC sin bytes de entrada 1 s con la voz por él): voz y señal se van en el
  primer tic; vídeo, pantalla y datos tras 1 s. Degradado sigue pidiendo la evidencia entera (la voz se queda donde
  funciona). Línea: `carril conmutacion par=… flujo=voz de=webrtc a=ble-l2cap motivo=webrtc-caido deteccion=vida|estado-ice
  sin-entrada=Xms senal=offline@…|ninguna`.
- **Señales de red:** el motor escucha `senales-red.ts` desde el primer par vigilado (`carril senal-red escucha
  senales=online/offline,network-information vida-webrtc=1000ms`); un aviso (`carril senal-red offline sin red`) mide y
  revisa los carriles a 150, 450 y 900 ms.
- **Vídeo hacia el carril ancho.** La prueba 35 muestra que el vídeo SÍ subía a WebRTC 3,5 s después de conectar (19:01:20 y
  19:03:18); a las 19:03:53 WebRTC se cayó y los reintentos de ICE salían cada ~60 s y nunca reconectaron, así que la tableta
  siguió con vídeo ligero por Bluetooth. Ahora, con ruta IP viva y WebRTC caído, ICE se reintenta a 3, 6, 12 y luego cada
  15 s (`medio=webrtc … se reintenta WebRTC sin colgar intento=N siguiente-en=Xms`), y el vídeo sube con la histéresis de
  siempre (3 s sano; 10 s de enfriamiento si acababa de bajar). El lienzo del vídeo ligero sigue hasta que el `<video>` de
  WebRTC trae imagen (sin hueco negro).
- **Timbre:** `empezarLlamadaSinChat` usa `timbreConCola`; la ventana se abre con «Buscando una vía hasta <nombre>…» si el
  primer aviso no sale; tras 30 s sin vía cuelga diciendo «No encontramos ninguna vía hasta <nombre> en 30 s.».
- **Banco** (`pruebas-reales/llamadas-medio`): `paso-ip`, `paso-ip-silencioso`, `timbre-cola`, `video-sube`, `wifi-directo`.

## 12. Quién dice que hay imagen por WebRTC (LLA1111A/H · 2026-11-11)

**El fallo.** En el banco real (`pruebas-reales/llamadas-video`, caso `carriles`, 14–17 vueltas de 20 con el código anterior) el
vídeo subía a WebRTC y la tableta se quedaba en negro. Medido: en unas, la pista seguía `muted` con el decodificador al día
(`framesDecoded` subía; un `<video>` nuevo la pintaba a 1280×720) y la superficie no montaba `<video>` de una pista muda; en otras,
la pista muda **no entregaba ni un cuadro a ningún sumidero** (un `<video>` nuevo, una copia de la pista, apagarla y encenderla, un
`MediaStreamTrackProcessor`: nada) con el decodificador decodificando. Medido en Chromium; el WebView de Android es el mismo motor (inferido, sin
medir en la tableta); reenganchar el flujo no la recupera. Las estadísticas de WebRTC solas no bastan para decir «hay imagen».

**La regla.** La imagen del otro por WebRTC cuenta cuando (1) se decodifican cuadros nuevos (`getStats`, no la marca `muted`) **y**
(2) el `<video>` de la superficie los pinta (`ImagenRemota` → `acciones.videoWebPinta` → `MotorLlamada.informarVideoWebPinta`). Si el
`<video>` lleva ≥ 2,5 s sin pintar (caduca a los 2 s sin cuadros nuevos; 12 s en pantalla compartida), el motor deja de dar por buena
la imagen web: entrega el lienzo del vídeo ligero y **cuenta al otro lado** (`app` `k:"web-imagen"`, `si:false`, cada 4 s) que no
ve su vídeo por WebRTC; el otro sigue mandando el vídeo ligero mientras lo diga (y no antes de 10 s de silencio). Un aparato de
la versión anterior ignora el mensaje (`k` desconocido) y se comporta como antes. Sin aviso de la superficie (pestaña oculta,
`null`), valen solo las estadísticas. Diagnóstico en `enlaces.log`: `veo-su-video-webrtc=si|no` y `el-otro-ve-mi-video-webrtc=si|no`.

**El lienzo no se quita hasta que el `<video>` pinta un cuadro nuevo** (sin negro en el relevo en ningún sentido).

**Medios.** Bluetooth lleva la voz y el vídeo ligero (no la pantalla: sube sola a Wi‑Fi directo). `opcionesMedio` lo dice con los
carriles reales (qué lleva cada medio ahora) y solo «Automático» es elegible desde ahí; a mano se fija el carril de cada flujo en «Medio».

**Cámara.** Cambiar de cámara abre la nueva **antes** de tocar nada: si no abre, sigue la anterior (con su imagen), se dice por qué
y **no** se guarda como preferencia; solo la que de verdad abrió se recuerda (`recordarDispositivo` tras abrir).

## 13. La llamada sobrevive a perder el Wi-Fi, no persigue rutas que no llevan nada y el lado lento deja de ser el débil (LLA1112A · 2026-11-12)

Registro de la prueba 39 (`0.5.1-prueba.39`, Mac ↔ tableta). Tres fallos:

**B · Apagar el Wi-Fi de la tableta colgaba** (04:28:40–04:29:50 UTC, «La llamada falló… Se perdió el enlace directo» con el
Bluetooth `b3` abierto). Esa llamada no era del motor de llamadas: no dejó ninguna línea `llamada` en el registro porque fue por la
**llamada directa** (`malla/llamada-directa.ts`). `planLlamada` (`mensajeria/neuronas/datos-neurona.ts`) elige «enlace-local» en cuanto
hay un enlace WebRTC local con esa neurona, y la llamada directa solo tiene ese enlace; al desaparecer del registro,
`suscribirEnlacesLocales` la acababa en el acto. Ahora:
- **Con enlace local Y un enlace de datos sin IP (Bluetooth) con esa neurona, la llamada va por el motor de llamadas**
  (`llamadas/ruta-llamada-neurona.ts`, bloque `LLA1112A` en `llamadas-neurona.ts`; con servidor si hay internet y sesión, si no
  sin servidor): carriles por flujo, la voz pasa al Bluetooth y vuelve sin colgar.
- **La llamada directa (sin Bluetooth) ya no cuelga al perder su enlace**: pasa a otro enlace vivo con esa neurona si lo hay, o dice
  «Reconectando…» y espera **`ESPERA_VUELTA_ENLACE_MS` = 20 s** (pide uno nuevo por el canal de la app); el primero que llega
  retoma la conversación con las pistas puestas. Solo sin ningún enlace en 20 s acaba («no volvió en 20 s»). Por qué 20 s: el enlace
  local se rehace solo al volver la red, el Bluetooth de la prueba 39 religó en 1–6 s, y es algo más que los 15 s sin audio con los que
  el motor da por fallida una llamada que no arranca: lo que una persona espera con «Reconectando…» antes de colgar ella.

**C · Con solo Bluetooth, la Mac reintentaba WebRTC 8 veces por llamada** (`ruta IP nueva (Wi-Fi directo): se reintenta WebRTC sin
colgar intento=N`, cada 15–35 s) con la ventana en «Reconectando…» y el aviso «No se pudo conectar con Yo por el enlace directo…»
hasta colgar. `hayRutaIpHacia` es verdad con cualquier ruta ANUNCIADA (un enlace local registrado, la red nativa con su ligadura
vigente, el Wi-Fi directo) y `revisarEscalada` reintentaba ICE cada 15 s para siempre. En la tercera llamada (04:37) sí había red
nativa (`senal-enviada app via=nativo`) y aun así ICE nunca conectó. Ahora (`carriles.ts › decidirReintentoIce`):
- **Pruebas de tráfico**: solo se reintenta por una ruta que lleva algo (`transporte.ts › rutaIpConTrafico`: Wi-Fi directo activo,
  enlace local con su ida y vuelta medida, red nativa con rtt medido). Sin esa opción (otro motor, el banco) se reintenta como antes.
- **Escala más larga** 3, 6, 12, 30, 60 y 120 s, contada **por fuente** (`fuenteRutaIpHacia`: «wifi-directo», «local:…», «nativo»), y
  como mucho **`TOPE_REINTENTOS_ICE_RUTA` = 4** por la misma fuente (cubren 51 s); otra fuente, o la ruta que vuelve tras irse,
  empieza la cuenta.
- **«Reconectando…» solo si no hay otro carril**: el participante está «conectado» mientras la voz por datos esté abierta y llevando
  audio en algún sentido, o el vídeo ligero llegue. El aviso de ICE fallido **no se pone** con la voz por datos activa y **se retira**
  en cuanto la llamada está en pie (`aviso-retirado`).
- **Nombre del aparato**: en una llamada a una neurona el otro se ve con el nombre de su aparato (`OpcionesVozDatos.nombreAparato`,
  el título de la llamada: «Maggaboard»), no con el de la cuenta ni «Yo».

**A · El lado que escribe despacio y a ráfagas** (03:47:04–03:47:54, Mac en reposo: la Mac en `opus=6k … BAJO-SUELO … otro:tarde=57.5%`
con su enlace leído a 160 kb/s y esperando 72/89 ms; la Mac inventó hasta el 67 % de la voz de la tableta; la tableta cortó su vídeo a
1 fps por `retraso-voz`). Comprobado en el banco con el carril de la tableta (`ble-tableta`, abajo):
1. **El búfer era corto para un carril que entrega a ráfagas** — sí. Subía 20 ms por vaciado y bajaba 10 ms cada 5 s: con paradas de
   cientos de ms tardaba diez vaciados en llegar. Ahora sigue a cómo llega el audio (`BufferJitter.llegada`: percentil 95 del desfase
   llegada − marca de trama sobre el menor, más una trama, en los últimos 120 paquetes; tope 640 ms).
2. **Las dos escaleras se empujaban** — sí. La voz bajaba por el «tarde» que informa el otro aunque la suya apenas esperara y el escalón
   cupiera: lo que llega tarde por las paradas del camino no se arregla bajando. Ahora el informe del otro (pérdida, tarde) solo baja la
   voz si es **suyo** (su espera > la mitad del umbral de atasco o el escalón no cabe); sin modelo medido, como antes.
3. **Paradas, no capacidad** (`MedidorEnlace`): una espera sin acuses con algo en el carril de más de `max(PARADA_MIN_MS = 320 ms, 2
   escrituras del modelo, 1,5 ciclos del emisor)` (y hasta `PARADA_MAX_MS` = 1,2 s), **aislada** (la anterior acabó hace ≥ 1 s,
`SEPARACION_PARADAS_MS`: una caída de capacidad alarga todas las escrituras seguidas y cuenta como siempre), es una **parada**: no cuenta en `esperaP90Ms` ni en
   `retrasoMaxMs` (tampoco lo que se juntó en ella, hasta que se acusa), no entra en el modelo; una bajada rápida de la voz hecha durante ella (no se sabe que es parada hasta el acuse) se deshace si
   el escalón de antes cabe y la voz ya no espera (`motivo=parada`; en una caída de capacidad de verdad el modelo no lo deja); y los
   descartes de una ventana con parada no bajan la voz si el escalón cabe. La cola de salida de la voz crece hasta la parada más larga
   reciente + un paquete (tope 640 ms): lo que se juntó sale tarde y el búfer del otro lo reproduce.
4. **La voz cede al vídeo**: con el vídeo ligero de ese lado en pausa por falta de sitio, la voz baja hasta Opus 12 kb/s
   (`ESCALON_CEDE_VIDEO`, aún un escalón bueno) y sigue ahí mientras haya vídeo ligero (`voz-datos cede-video`).
5. **Escrituras más grandes del lado lento** — no se cambió: sin medida del aparato de que ayude, y la voz ya sale con el vídeo en la
   misma escritura (LLA1111Q).

### Banco (`pruebas-reales/llamadas-medio`), casos nuevos

| Caso | Qué simula (de dónde) | Árbol de antes | Con LLA1112A |
|---|---|---|---|
| `ble-tableta` | `ble-real` con el lado B como la tableta de las 03:47: acuse 45 + Exp(35) ms (tope 160; la tableta lee `+70ms`/`+85ms`), 20–45 B/ms (`kbps=162 (2586 B en 127 ms)`), y **paradas** cada Exp(2 s) de 150–450 ms en las que B ni escribe ni entrega a su web (`espera=164/155ms`, `tardias=994 … jitter=400ms`, `inventado=67%`); app nativa 162 kb/s | voz de B en 6 kb/s (n=5), vídeo B→A 0 fps, inventado hasta 74 % | voz buena en los dos (n=0 y n≤2), vídeo B→A **0,2–0,8 fps: no llega a 3** |
| `wifi-cae` | (B) llamada con IP y Bluetooth de 160 kb/s, voz y vídeo por WebRTC; corte SILENCIOSO de la IP (Wi-Fi de la tableta apagado) 20 s y vuelta; además, la llamada directa con un enlace local que desaparece | motor elegido «directa»; la directa acaba en 2 s «Se perdió el enlace directo.» | motor de llamadas; voz en los dos en ≈ 2 s, vídeo ligero durante el corte, vídeo por WebRTC sin negro al volver; la directa sigue «Reconectando…» |
| `ruta-fantasma` | (C) solo Bluetooth, con una ruta IP anunciada (`hayRutaIp` = true) sin tráfico, 180 s, misma cuenta | reintentos cada 15 s, el aviso y «Yo» | 0 reintentos, 0 «Reconectando…», aviso retirado, «Maggaboard» |

**Qué no prueban.** Las paradas de `ble-tableta` son un modelo (Exp/Uniforme con semilla) de lo que el registro deja ver; no se sabe si en
la tableta son de la radio, de la WebView o del hilo nativo, ni su forma real. `wifi-cae` corta la IP a nivel de estado y bytes del
banco (no el sistema real ni la malla de la cuenta que rehace el enlace local), y la llamada directa del banco solo tiene el lado de la
Mac con una tableta que contesta sola. `ruta-fantasma` inyecta la prueba de tráfico (`red.ip`): no prueba que `rutaIpConTrafico` acierte
con los enlaces de verdad (rtt de la red nativa que se queda tras apagar el Wi-Fi, por ejemplo). Ninguno prueba la radio.

### Registro (`enlaces.log`)
- Cambia (campos al final): `llamada medio=webrtc par=… ruta IP nueva (Wi-Fi directo): se reintenta WebRTC sin colgar intento=1 siguiente-en=6000ms fuente=nativo trafico=si motivo=ruta-nueva`.
- Nuevas: `llamada medio=webrtc par=… ruta IP sin usar motivo=sin-trafico|tope fuente=… intentos=N` (una por fuente y motivo);
  `llamada medio=webrtc par=… aviso-retirado motivo=voz-por-datos|webrtc-conectado`; `llamada medio=enlace-datos voz-datos cede-video si techo=2 nivel 0→2`;
  `llamada directa enlace-perdido espera=20000ms` · `llamada directa enlace-recuperado enlace=… motivo=enlace-nuevo|otro-enlace-vivo|asegurado tras=…ms` · `llamada directa fin motivo=sin-enlace tras=…ms`.
