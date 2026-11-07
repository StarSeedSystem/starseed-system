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
| Servidor StarSeed | sí | neurona propia: ≤ 50 MB | sí: sistema de llamadas | neurona propia: sí |
| Relé cifrado | sí | no | no | no |
| LoRa (Meshtastic) | ≤ 200 B | no | no | no |
| Bluetooth | aún sin enlace en el navegador | no | no | no |
| Correo @star.seed | solo en Correos | adjuntos de Correos (servidor) | no | no |

(*) La malla de la cuenta son canales de DATOS: no lleva audio ni vídeo. La llamada con internet
abre su propia conexión WebRTC, señalizada por el servidor (con TURN si lo hay), y añade los enlaces
sin internet del chat como canal directo. Por eso, con internet, «llamada» cuenta como servidor.

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
- **Correos**: el buzón @star.seed aún solo va por el servidor (`NO_ADMITIDOS.correo`); al adjuntar
  se dice por dónde viaja y que por la malla se manda desde el chat o la pestaña «Neuronas».

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
- **Llamadas de grupo sin internet**: estrella por varios enlaces locales con timbre por el enlace
  y una sala que no dependa de la sesión del servidor.
- **Correos por la malla**: guardar y reenviar del buzón por la malla, y reconciliar al volver.
- **Archivos a otras cuentas por el servidor** desde el chat de neurona (hoy solo P2P: el
  almacenamiento de la cuenta solo comparte con tus propias neuronas).
- **Flujos de audio/vídeo genéricos** por canal de datos (hoy el audio y el vídeo van como llamada).

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
