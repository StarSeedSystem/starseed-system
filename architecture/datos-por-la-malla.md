# Contrato · Datos de cualquier formato por la malla (NEU1107A · 2026-11-07)

Petición de Alex (07-11): los chats de neuronas, de personas y de grupos no son solo texto. Llevan
llamadas de voz y vídeo, pantalla compartida, transmisiones en tiempo real y archivos de cualquier
formato, por la malla o por cualquier medio, respetando el «Medio de transmisión» de cada chat
(automático o métodos elegidos). Cada llamada, archivo o transmisión dice por qué vía fue (la misma
pastilla de vía que los mensajes) y, si ningún medio sirve, el motivo honesto. Nada se inventa: lo
que no se midió es «sin medir».

## 1 · Qué tipo de dato va por qué medio (hoy)

| Medio (ajustes del chat) | Mensaje | Archivo | Llamada (voz, vídeo, pantalla) | Transmisión en vivo |
|---|---|---|---|---|
| Enlace directo sin internet (`local`) | sí | sí (≤ 4 GB) | sí: llamada directa 1:1 | sí |
| Red local (app nativa) · canal TCP `nativo:<ip>` (§6) | sí, con acuse de la otra app | sí (≤ 4 GB, a su ritmo) | no: va por el enlace `local:nativo-…` que se abre solo | no: ídem |
| Wi-Fi local (P2P de la cuenta) | sí | sí (≤ 4 GB) | no (*) | sí |
| P2P por internet / TURN | sí | sí (≤ 4 GB) | no (*) | sí |
| Servidor StarSeed | sí | neurona propia: ≤ 50 MB | sí: sistema de llamadas | neurona propia: sí (texto/JSON/binario; audio/vídeo no) |
| Relé cifrado | sí | no | no | no |
| LoRa (Meshtastic) | ≤ 200 B | no | no | no |
| Bluetooth | aún sin enlace en el navegador | no | no | no |
| Correo @star.seed | solo en Correos; sin buzón, guardar y reenviar por la malla (§7.2) | adjuntos de Correos (servidor) | no | no |

(*) La malla de la cuenta son canales de DATOS: no lleva audio ni vídeo como LLAMADA. La llamada con
internet abre su propia conexión WebRTC, señalizada por el servidor (con TURN si lo hay), y añade los
enlaces sin internet del chat como canal directo. Por eso, con internet, «llamada» cuenta como
servidor. Desde GRP1107A, audio, vídeo y pantalla también viajan como TRANSMISIÓN en vivo por esos
canales de datos (segmentos de ~2 s, §7.3), y un GRUPO llama sin internet por los enlaces de cada par
(§7.1).

- **Archivos P2P**: el motor de siempre (`src/lib/network/archivos-malla.ts`): oferta → el receptor
  ACEPTA → trozos de 16 KB a disco, lista de SHA-256, reintento por trozo, reanuda desde el último
  guardado y multitrayecto si hay varios enlaces al mismo aparato y el chat los permite todos (si
  no, se fuerza uno: `enlaceForzadoParaArchivo`). Confirmaciones: Enviado · Recibido · Verificado.
- **Archivos por el servidor** (solo a tus propias neuronas): almacenamiento de la cuenta, sin
  recomprimir, con el SHA-256 del archivo entero en el anuncio; el otro aparato lo baja y lo verifica.
- **Llamadas**: `planLlamada` (neuronas) y `planLlamadaChat` (personas y grupos). Sin servidor, la
  llamada directa va por el enlace emparejado (1:1, misma red, sin TURN) con su timbre propio; con
  servidor, el sistema de llamadas (`MotorLlamada`) con los enlaces locales DE ESE CHAT como
  `canalesDirectos`. Un enlace cuyo aparato es de alguien que no está en el chat no recibe nada.
- **Transmisiones en vivo** (`flujo-datos.ts`): abrir · trozos · cerrar, sin acuse por trozo; el
  receptor acusa cada 10 trozos o 2 s (recibidos y perdidos). Formatos: texto (el último gana), JSON
  (registros) y binario (base64, se junta al cerrar, ≤ 64 MB en memoria). Lo vivo no se guarda.

## 2 · Decisiones puras y pruebas

| Módulo (puro, sin red ni DOM) | Decide | Pruebas |
|---|---|---|
| `src/lib/mensajeria/neuronas/datos-neurona.ts` | `LLEVA`/`motivoNoLleva`, `planParaDatos` (reutiliza `mediosParaEnviar`), `planLlamada`, topes por medio, vía de archivos y flujos, fases y registro de llamadas, vista previa segura, lo que se acepta de la red | `__tests__/datos-neurona.test.ts` |
| `src/lib/mensajeria/neuronas/flujo-datos.ts` | protocolo `fd.*`, reductor del flujo, acuses, troceo | `__tests__/flujo-datos.test.ts` |
| `src/lib/llamadas/medio-llamada-chat.ts` | `planLlamadaChat`, `enlacesDelChat` | `src/lib/llamadas/__tests__/medio-llamada-chat.test.ts` |
| `src/lib/malla/eleccion-enlace.ts` | qué enlace real llega a qué destino (se reutiliza) | `eleccion-enlace.test.ts` |

Motores (cliente, perezosos): `archivos-neurona.ts`, `llamadas-neurona.ts`, `flujos-neurona.ts`;
transporte: `abrirCanalDatos` (canal de datos en vivo por UN enlace P2P) en `transporte-universal.ts`;
llamada directa con pantalla en `llamada-directa.ts` (`llamarPorEnlace(…, { pistaPantalla })`).

## 3 · Dónde se ve

- **Mensajes › Neuronas › un chat**: en la cabecera, llamada de voz, videollamada y compartir
  pantalla; en el compositor, el clip (varios archivos, también arrastrando) y «Transmitir en vivo».
  Cada burbuja: tarjeta de archivo (progreso, aceptar/rechazar, cancelar, reanudar, SHA-256, vista
  previa y guardar), de llamada (sonando → en curso → duración, perdida, rechazada) o de flujo.
- **Chats de personas y grupos**: si el medio del chat no incluye el servidor, o no hay internet,
  aparece la barra «Por la malla» (archivos P2P a cada miembro; en un 1:1, llamada directa de voz,
  vídeo o pantalla). Los botones de llamada de la cabecera siguen `planLlamadaChat`: servidor con
  canales directos del chat, o llamada directa sin internet si es lo único posible, o el motivo.
- **Correos**: el buzón @star.seed va por el servidor; sin él, el correo se guarda cifrado y viaja
  por la malla (GRP1107A, §7.2) con su bandeja «Por la malla». Los adjuntos siguen yendo por el
  servidor (al adjuntar se dice; por la malla, desde el chat o la pestaña «Neuronas»).
- **Grupos sin internet** (GRP1107A, §7.1): llamada y vídeo de grupo en la barra «Por la malla» y en
  los botones del chat; en «Neuronas», un botón de llamada por sección de cerebros.
- **Transmitir en vivo** (GRP1107A, §7.3): Texto · Voz · Vídeo · Pantalla por canal de datos.

## 4 · Límites honestos

**Navegador**
- Compartir pantalla (`getDisplayMedia`) solo en navegadores de escritorio; se pide en el mismo
  gesto del botón. En móvil, el botón dice que no se eligió pantalla.
- Un enlace sin internet vive en la PESTAÑA donde se emparejó; al cerrarla, se cae (y se dice).
- Lo recibido y verificado se guarda en IndexedDB (cuota del navegador). De lo enviado se guarda una
  copia ≤ 512 MB para reanudar tras recargar; más grande, solo se reanuda con la pestaña viva.
- Sin TURN, el P2P por internet puede no conectar tras NAT simétricos (se dice al fallar ICE).
- Nunca se ejecuta lo recibido: HTML y similares se enseñan como texto plano; el resto, «Guardar».

**App nativa (Tauri)**
- Desde MLT1107A el canal local nativo es un enlace más (`nativo:<ip>`, §6): mensajes y archivos con
  las neuronas VINCULADAS de la misma red, y señalización del enlace WebRTC directo sin QR (llamadas,
  pantalla y flujos). Pantalla compartida en el WebView: sin verificar.
- Por el canal TCP los archivos van al ritmo que deja el limitador del otro: con la app 0.5.0 o
  anterior (30 tramas/10 s) ≈ 55 KB/s; con la de MLT1107A (300/10 s) ≈ 550 KB/s. Lo grande va por
  el enlace WebRTC en cuanto está abierto (el TCP solo lleva un archivo si es el único P2P).
- Bluetooth y LoRa como portadores de datos llegan con la app nativa; LoRa seguirá siendo solo texto.

## 5 · Pendiente (con motivo)

- **Verificar con dos aparatos reales** (no se puede en una sola máquina): llamada directa con
  pantalla por un enlace emparejado; archivo de >1 GB reanudado tras recargar; transmisión en vivo
  con acuses; timbre de una llamada por internet entre dos neuronas; llamada desde un chat 1:1 sin
  internet con su burbuja por «chat-malla»; archivos a cada miembro de un grupo por la malla.
- ~~Canal local nativo en el transporte universal~~ → hecho en MLT1107A (§6); falta verificarlo con
  dos aparatos reales (§6.5).
- ~~Llamadas de grupo sin internet~~ → hechas en GRP1107A (§7.1): malla COMPLETA (no estrella),
  timbre por cada enlace y sala `malla-grupo:…` sin sesión del servidor.
- ~~Correos por la malla~~ → hechos en GRP1107A (§7.2): guardar cifrado, reenviar, recibos y
  reconciliar al volver (subida idempotente con `meta.mallaId`).
- **Archivos a otras cuentas por el servidor** desde el chat de neurona (hoy solo P2P: el
  almacenamiento de la cuenta solo comparte con tus propias neuronas).
- ~~Flujos de audio/vídeo genéricos por canal de datos~~ → hechos en GRP1107A (§7.3).
- Lo que GRP1107A deja para aparatos reales y para después está en §7.5.

## 6 · Red local entre apps nativas, sin internet (MLT1107A · 2026-11-07)

Petición de Alex (07-11): entre dos apps nativas de StarSeed OS en la misma red local y SIN internet
(la Mac y la tablet), que todo viaje solo: mensajes, archivos de cualquier tamaño, llamadas, pantalla
y transmisiones. Antes solo la sincronización usaba el canal TCP 47071; el transporte universal no lo
conocía y, sin un emparejado por QR, no había enlace WebRTC.

### 6.1 · Piezas

| Pieza | Archivo | Qué hace |
|---|---|---|
| Protocolo (puro) | `src/lib/malla/red-local-nativa.ts` | `nl.hola` firmado y `aceptarHola` (solo vinculadas, misma huella), ligaduras IP↔neurona (5 min), `destinosHola`, límites y cubeta de fichas, `armarTrama`/`desempaquetarLote` (`nl.lote`), `enlacesNativos`, `candidatosConIp`, `esEnlaceRedLocalNativa` |
| Señalización (pura) | `src/lib/malla/senal-nativa.ts` | `pasoSenal` (máquina de estados), `quienOfrece`, topes por fase, reintentos 15 s·2ⁿ ≤ 10 min, `leerSenal` (`nl.sen`) |
| Motor | `src/lib/malla/red-local-nativa-motor.ts` | Colas por IP, saludos, entrada, señalización con `ofrecerPorCanal`/`responderPorCanal`; lo arranca `iniciarSincronizacionNeuronas` solo en la app nativa |
| Elección | `src/lib/malla/eleccion-enlace.ts` | Tipo `nativo`, rango 0; en el rango 0 el WebRTC antes que el TCP (`ordenEnRango`); el TCP no lleva flujos y nunca reparte un archivo con un WebRTC |
| Transporte | `src/lib/malla/transporte-universal.ts` | `enlacesDisponibles` lo incluye; `enviarNativo` (acuse de la app = confirmado); canal de archivos; `abrirCanalDatos` lo descarta con motivo |
| WebRTC sin QR | `src/lib/malla/emparejar-sin-internet.ts` | `ofrecerPorCanal`/`responderPorCanal`: mismo enlace que el QR, sesión `nativo-…`, `par.origen = "red-local-nativa"` |
| Canal (Rust) | `native/src-tauri/src/malla_local*.rs` | Limitador 300 tramas/10 s por IP (antes 30); `malla_local_estado` dice `max_cuerpo`, `limite_mensajes`, `limite_ventana_ms` |
| Pastilla | `src/lib/mensajeria/medios/medios.ts` (`etiquetaVia`, `nombreDeVia`) | «Mesh · Red local (app nativa)» para `nativo:<ip>` y `local:nativo-…`; medio «sin internet» (`local`) en los ajustes del chat |

### 6.2 · Consentimiento y seguridad

- Solo entre neuronas VINCULADAS (vínculo de MSH1107A, recordado o de esta sesión): ese vínculo es el
  consentimiento. Una IP cuenta como «la neurona X» solo tras un `nl.hola` firmado con la identidad de
  malla (`wrapSigned` v2 + `acceptFreshness`) cuya huella es LA MISMA que guardó el vínculo. Sin eso,
  de esa IP no se atiende nada (ni `tu.*`, ni `archivo.*`, ni `nl.sen`). La sincronización (`sync`)
  sigue entrando de cualquiera porque va firmada y es la que CREA el vínculo.
- Las señales `nl.sen` (oferta, respuesta, cierre) también van firmadas y solo se aceptan de la IP
  ligada con la misma huella: nadie de la red puede colar un SDP (ni su huella DTLS).
- Los archivos SIEMPRE preguntan (`mismaCuenta: false`), igual que por un enlace QR.
- El canal Rust sigue cortando lo que no es de la red local, ≤ 8 conexiones a la vez, 3 s por conexión.

### 6.3 · Protocolo por el canal

```
{"t":"nl.hola","s":<sobre firmado de { t:"nl.hola", v:1, de:{neurona,sync?,cuenta?,nombre}, para,
   lim?:{max_cuerpo,limite_mensajes,limite_ventana_ms}, webrtc, resp?, ts }>}
{"t":"nl.sen","s":<sobre firmado de { t:"nl.sen", v:1, k:"oferta"|"respuesta"|"cierre", s:"nativo-…",
   de, para, sdp?, n?, ts }>}
{"t":"nl.lote","m":["<texto>", …]}      ← varios textos en una trama (≤ 32, ≤ 64 KiB − 512 B)
{"t":"tu.msg",…} / {"t":"archivo.…",…}   ← lo de siempre, tal cual (o dentro de un lote)
```

- Saludo: cada 15 s la app mira el canal y saluda a las vinculadas que su faro oye (por id o por la
  última IP del vínculo), si no hay ligadura de < 2 min y no se saludó esa IP en 30 s. Quien recibe un
  saludo válido liga y contesta (`resp:true`, que no se contesta).
- Colas por IP: `control` (tu.*, nl.*) pasa delante de `datos` (archivo.*, en orden estricto). Cada
  trama espera el acuse de la otra app; 6 fallos seguidos (0,5 s·2ⁿ ≤ 8 s) → caído 30 s (se dice en
  el envío y el enlace sale cerrado). El motor de archivos ve la cola ×4 y frena a ~256 KiB; por
  encima de 4 MiB el canal dice que no.
- Ritmo: cubeta de fichas con ráfaga 30 % y ritmo 60 % del cupo del otro (sus límites llegan en su
  saludo; sin ellos, 30/10 s de la app anterior): en cualquier ventana ≤ 90 % de su cupo.
- Señalización: cada 5 s, por cada ligadura con WebRTC en las dos apps y sin enlace local abierto con
  esa neurona, ofrece la de id menor (SDP completo, candidatos ya reunidos); la otra responde. A cada
  SDP recibido se le AÑADE una copia de cada candidato mDNS con la IP real (la del TCP): si el punto
  de acceso bloquea mDNS, ICE prueba la IP. Abierto, el enlace es `local:nativo-…` y por él van las
  llamadas directas (`llamarPorEnlace`), la pantalla y los flujos, como con QR.

### 6.4 · Pruebas (deterministas)

`src/lib/malla/__tests__/red-local-nativa.test.ts` (17), `senal-nativa.test.ts` (13),
`red-local-nativa-motor.test.ts` (12, dos apps en memoria: ligadura, suplantación, mensajes,
lotes y orden, ritmo con app anterior, caída, tope de cola, señalización, fallo y reintento),
`eleccion-enlace.test.ts` (+5), `transporte-universal.test.ts` (+3), `medios.test.ts` (+2);
Rust `malla_local_trama` (+2: dos trozos por trama, limitador 300/10 s).

### 6.5 · Lo que necesita dos aparatos reales (pendiente)

- Que la Mac y la tablet (apps nativas con este cambio, misma red, sin internet) se liguen solas tras
  «Sincronizar ahora» y digan «Mesh · Red local (app nativa)» en los mensajes.
- Que el WebRTC se abra sin QR en los WebView reales (WKWebView en macOS/iOS, WebView de Android):
  `RTCPeerConnection` con `iceServers: []` y candidatos `.local`; medir si hace falta la copia con IP.
- Llamada de voz, vídeo y pantalla por `local:nativo-…`; archivo de > 1 GB por el WebRTC y uno
  pequeño solo por el TCP (desactivando WebRTC) con su ritmo real.
- La app 0.5.0 (sin este cambio de Rust) frente a una nueva: los límites se respetan (30/10 s).
- Cortafuegos: macOS «Red local» y Windows «Redes privadas» para el TCP 47071 (ya en §2 del contrato
  de sincronización); ningún puerto nuevo (el WebRTC usa los suyos, efímeros, dentro de la red).

## 7 · Grupos, correos y medios por la malla (GRP1107A · 2026-11-07)

Petición de Alex (07-11): mensajes, correos, llamadas, transmisiones y archivos de todo tipo por
cualquier señal, mesh o internet, en toda la red privada y pública. Faltaban tres piezas.

### 7.1 · Llamadas de grupo sin internet (malla completa)

| Pieza | Archivo | Qué hace |
|---|---|---|
| Decisión (pura) | `src/lib/llamadas/grupo-malla.ts` | `planGrupoMalla` (a quién suena), `decidirMediosGrupo` (vídeo o solo voz), sala `malla-grupo:<hilo>:<aleatorio>`, protocolo `llg.inv`/`llg.res`/`llg.fin` (`leerMensajeGrupo`, `admitirInvitacion`), `paresSinEnlace` |
| Plan del chat (pura) | `src/lib/llamadas/medio-llamada-chat.ts` | `planLlamadaChat` devuelve `via: "malla-grupo"` (con `grupo`) en un grupo sin servidor |
| Motor | `src/lib/llamadas/grupo-malla-motor.ts` | Timbre por cada enlace, respuesta por el mismo enlace, `MotorLlamada` con un canal DIRECTO por enlace (`abrirCanalLlamadaPorEnlace`), `iceServers: []`, sin `tema` (ni Supabase ni TURN); arranca con el buzón de la malla |
| Dónde | `acciones.empezarLlamada` (botones del chat), barra «Por la malla» de un grupo (Llamada/Vídeo de grupo), cada sección de «Neuronas» (botón de llamada), tarjeta global de timbre y ventana de llamada |

- **Topología**: cada aparato abre un canal por CADA enlace suyo con aparatos de los miembros; si
  todos tienen enlace con todos, `MotorLlamada` teje la malla completa (una RTCPeerConnection por
  par, como con servidor). La pareja sin enlace no se ve ni se oye: quien llama lo dice con los
  `alcanza` de cada `llg.res` («Ana y Luis no tienen enlace sin internet entre sí…»). No hay
  reenvío de medios por un tercero (eso sería una estrella o un SFU: no se finge).
- **A quién suena**: enlaces ABIERTOS cuyo aparato dice ser de un miembro (también tus otros
  aparatos, como un teléfono que suena en todos); nunca un aparato que no dice de quién es. Los
  enlaces `local:nativo-…` (dos apps nativas vinculadas) cuentan igual.
- **Tope y degradación**: 6 aparatos contándote (`MAX_GRUPO_MALLA`); con más de 4, solo voz; con un
  enlace que MIDE < 700 kbps, solo voz (con la medida); < 64 kbps avisa de cortes; sin medir, vídeo
  con aviso «capacidad sin medir». Quien entra recalcula con SUS enlaces.
- **Timbre**: `llg.inv { v, s, h, tc, tipo, video, de:{uid,nombre}, miembros, titulo?, ts }` por
  cada enlace; suena solo si soy miembro, quien llama es miembro y el enlace DICE ser de quien llama;
  vale 2 min (y 30 s de adelanto). Suena 45 s. `llg.res { si, de, alcanza, motivo? }` vuelve por el
  mismo enlace (si dicen todos que no, la llamada cuelga sola: «Nadie del grupo puede atender»).
  `llg.fin` (quien llama colgó antes) para el timbre solo si llega por el enlace de quien llamó.
- **La vía visible**: toast con `textoViaGrupo` («Mesh · Sin internet · malla completa · 3 aparatos
  · solo voz»), línea en la tarjeta del timbre y píldora en la ventana de llamada (`LlamadaActiva.via`).
- Una sala `malla-grupo:` no existe en el servidor: al colgar no se llama a `terminarSesion`.

### 7.2 · Correos por la malla (guardar y reenviar)

| Pieza | Archivo | Qué hace |
|---|---|---|
| Decisión (pura) | `src/lib/mail/correo-malla.ts` | `nuevoCorreoMalla`, `rutasCorreo` (servidor · entrega · relevo, con los medios elegidos), protocolo `cm.correo`/`cm.recibo`, `aplicarRecibo` (nunca retrocede), `decidirEntrada`, `tocaReintento`, `fusionarConServidor`, textos |
| Bóveda | `src/lib/mail/boveda-correo-malla.ts` | AES-GCM 256 con clave NO extraíble en IndexedDB (`starseed-correo-malla`), IV por correo; sin IndexedDB, en memoria y `cifrado() === false` (se dice) |
| Motor | `src/lib/mail/correo-malla-motor.ts` | Guarda ANTES de intentar nada; canal `correo-malla` del transporte universal (acuse de la otra app); sube con `composeMail({ mallaId })`; reintenta cada 30 s y al volver la red; cada cambio parte de la versión más reciente |
| Buzón | `src/lib/mail/os-mail.ts` | `composeMail({ mallaId })` idempotente (si ya hay un hilo tuyo con ese id, lo devuelve y completa su mensaje si quedó a medias); `MailThreadSummary.mallaId` |
| Interfaz | `src/components/messages/correos-panel.tsx`, `correos-malla.tsx` | Sin red (o si el buzón no responde por red) el correo va por la malla; bandeja «Por la malla» con estado, recibos y vía |
| Ajustes | `medios.ts` | `ORDEN_AUTO.correo = ["correo", "local", "wifi-local", "p2p-internet", "turn"]` |

- **Rutas**: con internet y sesión, el buzón (si «correo» está permitido). Sin él: a la neurona de
  CADA destinatario que aún no lo tenga (el enlace de menor latencia medida) y a UNA neurona de TU
  cuenta de relevo (si ninguna lo tiene ya). Un salto: el relevo solo sube al buzón, no reenvía.
  LoRa y el relé no llevan correos; a otra cuenta solo se entrega si es destinataria.
- **Recibos**: Enviado (salió por un enlace y su app acusó) · En tránsito (relevo `cm.recibo
  en-transito`) · Entregado (cada destinatario `entregado`) · En el servidor (subido por ti o por el
  relevo, `en-servidor` vuelve por la malla). Un recibo cuenta solo si el enlace por el que llega
  DICE ser de quien firma; «entregado» solo de un destinatario; «en tránsito»/«en el servidor» solo
  de una neurona tuya.
- **Sin perder nada**: se guarda cifrado antes de salir; los reintentos (15 s·2ⁿ ≤ 10 min) siguen
  hasta «en el servidor»; entregado por la malla y luego con internet, también se sube (reconciliar),
  sin duplicar. Lo recibido por la malla que ya está en el buzón no se enseña dos veces.
- **Límites**: cuerpo ≤ 48 000 caracteres y ≤ 20 destinatarios por la malla; los ADJUNTOS no viajan
  así (se dice: van por el chat o «Neuronas»). La bandeja «Por la malla» deduplica con los hilos de
  la carpeta abierta.

### 7.3 · Audio, vídeo y pantalla por canal de datos

| Pieza | Archivo | Qué hace |
|---|---|---|
| Decisión (pura) | `src/lib/mensajeria/neuronas/flujo-medios.ts` | Segmentos `m1|seg|parte|total|b64`, `aplicarTrozoMedios` (reensamblar; a medias = perdido entero), `medirEnlace` (enviado vs confirmado), `ajustarRitmo`, `debeDescartarSegmento`, `bitsGrabacion`, `elegirMime` |
| Formato | `flujo-datos.ts` | Formato «medios» (no junta nada en memoria; cuenta bytes) |
| Motor | `src/lib/mensajeria/neuronas/transmision-medios.ts` | `MediaRecorder` en segmentos webm de 2 s con su ritmo; solo P2P (`abrirFlujoNeurona({ soloP2P })`); `crearReproductorMedios` (MediaSource «sequence»; sin él, archivo a archivo) |
| Interfaz | `datos-hilo.tsx` | «Transmitir en vivo»: Texto · Voz · Vídeo · Pantalla, con la vía y el ritmo; la burbuja del que recibe reproduce |

- **Tope medido**: tras cada segmento se mide en 6 s lo ENVIADO frente a lo que el otro CONFIRMA
  (acuses `fd.acuse`); si confirma < 75 %, eso es el tope (kbps en el enlace) y se graba a lo que
  cabe en su 80 % (descontando base64); sin saturar, un escalón más tras 2 medidas; un tope medido
  se olvida tras 4 medidas sin saturar. Cola del enlace > 500 KB: un escalón menos; > 1 MB: se salta
  el segmento. Escalones: vídeo 150–1200 kbps, voz 16–64 kbps; sin medir, 300/32 y «sin medir».
- Retraso honesto: ~2 s (un segmento) más la red; pequeños cortes entre segmentos al reiniciar
  `MediaRecorder`. Con un enlace sin internet hay llamada directa (sin ese retraso): mejor esa.

### 7.4 · Pruebas (deterministas)

`src/lib/llamadas/__tests__/grupo-malla.test.ts` (15), `grupo-malla-motor.test.ts` (8, enlaces en
memoria), `medio-llamada-chat.test.ts` (16, +3); `src/lib/mail/__tests__/correo-malla.test.ts` (17),
`correo-malla-motor.test.ts` (7, tres aparatos en memoria), `boveda-correo-malla.test.ts` (3, WebCrypto
real), `src/components/messages/__tests__/correos-malla.test.tsx` (3);
`src/lib/mensajeria/neuronas/__tests__/flujo-medios.test.ts` (10),
`src/components/messages/neuronas/__tests__/transmitir-medios.test.tsx` (2).

### 7.5 · Lo que necesita aparatos reales (pendiente)

- **Grupo sin internet** con 3 aparatos vinculados por pares (QR o apps nativas): que suene en los
  dos, que al aceptar se vean los tres (malla completa) y que, quitando el enlace B–C, el aviso diga
  que B y C no se oyen. Medir CPU y subida con 4 aparatos con vídeo y con 6 en solo voz (el umbral
  de 4/700 kbps es una estimación: ajustarlo con lo medido).
- **Correos**: Mac sin internet → tablet (relevo) que luego tiene internet → el correo aparece una
  sola vez en el buzón de Ana y «En el servidor» vuelve a la Mac; y Mac → móvil de Ana sin internet
  (entrega directa) y después reconciliación. Comprobar IndexedDB y la clave no extraíble en Safari
  (WKWebView) y en el WebView de Android; en una pestaña privada de Firefox, que diga «en memoria».
- **Medios por canal de datos**: por la malla de la cuenta (canal de datos) entre dos aparatos;
  que MediaSource admita los segmentos webm encadenados en Chrome/Edge/Firefox y el respaldo archivo
  a archivo en Safari (MediaRecorder de Safari graba `audio/mp4`/`video/mp4`: comprobar que el otro
  lado lo reproduce); afinar el umbral de saturación (75 %) con acuses reales, que llegan con retraso.
- Lo que no está: reenviar medios de un grupo por un tercero cuando una pareja no tiene enlace (SFU
  en una neurona), adjuntos de correo por la malla (hoy por el chat o «Neuronas»), y que un
  destinatario suba al buzón un correo que solo él recibió por la malla (no puede escribir como el
  remitente: lo sube el remitente o su relevo al tener internet).
