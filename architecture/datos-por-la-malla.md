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
| Bluetooth directo (app nativa, sin router) · enlace `ble:<id>` (BLE1108A, `bluetooth-directo.md`) | sí, con acuse de la otra app | sí (≤ 20 MB; lo grande va detrás de cualquier P2P más rápido) | no (sin canal de medios por BLE) | no |
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
  Desde ARC1108A (§8): un trozo cuenta solo cuando el almacén terminó de guardarlo, los errores dicen
  el lado y la ruta, y los archivos que llegan juntos se deciden en UNA ventana del envío.
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
  Lo que llega junto se decide además en la ventana global del envío (§8.4); el botón de carpeta del
  compositor manda una carpeta con sus subcarpetas y lo escrito acompaña al envío.
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
- Desde BLE1108A el Bluetooth de baja energía lleva datos entre dos apps nativas (macOS y Android)
  SIN Wi-Fi ni internet: mensajes y archivos ≤ 20 MB a 10–60 KB/s (lo medido se enseña en la pastilla
  «Bluetooth directo · N ms»). Contrato: `architecture/bluetooth-directo.md`. Windows, Linux e iOS aún
  sin radio (allí se dice el motivo). LoRa sigue siendo solo texto.

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

- Solo entre neuronas VINCULADAS (vínculo de MSH1107A, recordado o de esta sesión) o de TU MISMA CUENTA
  (MLL1107A, §6.6): ese vínculo, o la cuenta, es el consentimiento. Una IP cuenta como «la neurona X»
  solo tras un `nl.hola` firmado con la identidad de malla (`wrapSigned` v2 + `acceptFreshness`) cuya
  huella es LA MISMA que guardó el vínculo, o que trae la prueba de cuenta (`cta`) calculada con la
  clave de faro de la cuenta sobre ESA huella. Sin eso, de esa IP no se atiende nada (ni `tu.*`, ni
  `archivo.*`, ni `nl.sen`). La sincronización (`sync`) sigue entrando de cualquiera porque va firmada
  y es la que CREA el vínculo.
- Las señales `nl.sen` (oferta, respuesta, cierre) también van firmadas y solo se aceptan de la IP
  ligada con la misma huella: nadie de la red puede colar un SDP (ni su huella DTLS).
- Los archivos SIEMPRE preguntan (`mismaCuenta: false`), igual que por un enlace QR.
- El canal Rust sigue cortando lo que no es de la red local, ≤ 8 conexiones a la vez, 3 s por conexión.

### 6.3 · Protocolo por el canal

```
{"t":"nl.hola","s":<sobre firmado de { t:"nl.hola", v:1, de:{neurona,sync?,cuenta?,nombre}, para,
   lim?:{max_cuerpo,limite_mensajes,limite_ventana_ms}, webrtc, resp?, ts, cta? }>}
   cta = hex(HMAC-SHA256(clave de faro, "ss-nl-cuenta-v1|<huella del sobre>|<de.neurona>|<para>|<ts>")[0..16])
{"t":"nl.sen","s":<sobre firmado de { t:"nl.sen", v:1, k:"oferta"|"respuesta"|"cierre", s:"nativo-…",
   de, para, sdp?, n?, ts }>}
{"t":"nl.lote","m":["<texto>", …]}      ← varios textos en una trama (≤ 32, ≤ 64 KiB − 512 B)
{"t":"tu.msg",…} / {"t":"archivo.…",…}   ← lo de siempre, tal cual (o dentro de un lote)
```

- Saludo: cada 15 s la app mira el canal y saluda a las vinculadas que su faro oye (por id o por la
  última IP del vínculo) y, si tiene la clave de faro, a las neuronas de su cuenta que el faro reconoce
  por su id (MLL1107A), si no hay ligadura de < 2 min y no se saludó esa IP en 30 s. Quien recibe un
  saludo válido liga y contesta (`resp:true`, que no se contesta). Antes de mandar un mensaje a una
  neurona que el faro oye sin ligadura, se la saluda YA y se espera ≤ 1,5 s (§6.6).
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

### 6.6 · Por qué la Mac mandó por el servidor a la tablet de al lado (MLL1107A · 2026-11-07)

Prueba real (07-11, ~22:20 UTC): Mac «MaggaBook» con la app 0.5.0 instalada (sirve sus páginas de la
etiqueta v0.5.0 en 127.0.0.1:47610) → tablet «Maggaboard» (Android, web publicada de main), misma
Wi-Fi, chat de Neuronas en «Automático». Llegó como «Servidor StarSeed · 375 ms ✓».

Medido y leído (nada supuesto):
- **Red**: TCP Mac → 192.168.0.12:47071 contesta el acuse `SSM1` `{"ok":true}` en 77–147 ms (sonda
  con `{"t":"tu.ping"}`): ni aislamiento de clientes ni cortafuegos. El grupo 239.255.70.83 está unido
  en `en0` (`netstat -gn`, `route -n get`): la Mac no se une por la interfaz equivocada.
- **Faro**: escuchando el grupo 4 min desde la Mac (socket atado al grupo con `SO_REUSEADDR`, sin
  quitárselo a la app) solo llegan los faros PROPIOS (cada 15,0 s, «cuenta», id de MaggaBook); de
  192.168.0.12, ninguno. Cuadra con `nettop` del socket de la app: en 30 s entran 130 B = 2 × (37 B
  del faro + 28 de cabeceras), es decir, solo su propio eco. La Mac no oye a la tablet.
- **Código que corre la Mac**: en v0.5.0 no existen `red-local-nativa*.ts` ni `senal-nativa.ts`
  (MLT1107A entró en `3e2421e6e7`, 07-11 06:04, después de la etiqueta del 06-11 23:15);
  `enlacesDisponibles` de v0.5.0 solo conoce `local` (QR), `cuenta`, `par`, `rele` y `lora`. Para una
  neurona, el plan de «Automático» solo tenía el servidor.
- **La malla de la cuenta** (`cuenta`, WebRTC señalizado por Supabase), la otra vía local que sí
  conoce la 0.5.0, solo se abre con el botón de sincronización directa del panel de dispositivos
  (`device-network-panel.tsx`, `ensureMesh`) y se cierra al desmontarlo: al chatear no está.
- **En main** el enlace `nativo:<ip>` existía, pero solo entre neuronas con un vínculo de «Sincronizar
  ahora» y solo tras el ciclo de 15 s; sin eso el mensaje iba al servidor sin decir por qué.

Arreglo (web, llega a la tablet al publicar la web y a la Mac con la próxima versión nativa):
| Pieza | Qué cambia |
|---|---|
| `red-local-nativa.ts` | `cta` en `nl.hola` (`textoPruebaCuenta`, `mismaPrueba`); `aceptarHola(…, { cuentaProbada })` liga tus neuronas sin vínculo (también si el vínculo guardaba otra huella); `destinosHola({ cuenta })` saluda a las de la cuenta que el faro reconoce; `ipsDeNeurona`; `diagnosticoHacia` (ligada · caída · sin canal · no se oye · sin confianza · sin respuesta) |
| `red-local-nativa-motor.ts` | `pruebaCuenta`/`huellaPropia` (HMAC con la clave de faro de `antenas_config`, releída cada minuto; nunca se registra), `asegurarLigadura(neurona, ≤1,5 s)`: saluda ya y espera a la ligadura; si ya se saludó hace poco y no contestó (app 0.5.0), no espera |
| `transporte-universal.ts` | `prepararEnlaceNativo(neurona)` |
| `mensajeria/medios/enviar.ts` | `candidatosMalla` asegura el canal antes de elegir medio (solo a una neurona concreta; los chats de personas no esperan) y, si no se pudo, añade el descarte «Red local (app nativa): <motivo>» que se ve en la pastilla |

Arreglo (Rust, solo con la próxima versión nativa): el faro también sale por difusión
(255.255.255.255:47070) y a cada aparato que se oye se le contesta con un faro DIRECTO (una vez por
IP y minuto, `toca_respuesta_directa`): si un sentido funciona, se encuentran los dos.

Límites que siguen: la Mac 0.5.0 no puede mandar por la red local (su web no tiene el enlace) ni
contesta al `nl.hola`; hasta la próxima versión, solo el enlace QR («Vincular sin internet») lleva
mensajes Mac ↔ tablet sin servidor. Una app 0.5.0 ignora `nl.*` y `archivo.*` por el TCP.
Pruebas: `red-local-nativa.test.ts` (+5), `red-local-nativa-motor.test.ts` (+8),
`mensajeria/medios/__tests__/enviar-red-nativa.test.ts` (6), Rust `antenas` (+2).

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

## 8 · Archivos: integridad por la red local y la ventana de un envío (ARC1108A · 2026-11-08)

### 8.1 · Por qué fallaban casi todos con «hash-no-coincide» (prueba real del 08-11)

Mac «MaggaBook» (prueba de escritorio de main en edcf74362f) → tableta «Maggaboard» (APK de prueba
del mismo commit, servidor local dentro: páginas en 127.0.0.1), Mensajes › Neuronas en «Automático»,
18 archivos (de 21 B a 50 MB). 17 en «Error · hash-no-coincide»; solo llegó el vídeo de 8 MB. Los
mensajes de texto, bien en los dos sentidos.

- **La vía real** (guardada en la burbuja del remitente, `starseed.mensajeria.malla.v1` del
  almacenamiento local de la Mac): `local:nativo-…`, el ENLACE WebRTC que las dos apps abren solas
  señalizándolo por el canal TCP (§6.3). La pastilla lo llama igual que al canal TCP («Mesh · Red
  local (app nativa)»), pero NO fue el TCP: fue un data channel que admite binario, y el motor negoció
  `modo: "binario"`.
- **Causa raíz** (`archivos-malla.ts`): el camino BINARIO de `manejarMensaje` llamaba a
  `guardarTrozo` sin esperar y contaba el trozo como recibido en el acto. Con un almacén asíncrono
  (OPFS con `createWritable`, IndexedDB) el «fin» verificaba antes de que la escritura terminara: leía
  un trozo vacío y el SHA-256 no coincidía. El vídeo pasó porque releer sus 511 trozos anteriores
  daba tiempo a que terminara la última escritura. Las pruebas usaban el almacén en memoria, que
  guarda en el acto: el fallo no se veía.
- **Descartado con pruebas**: `b64ABuf` devuelve los bytes exactos aunque Node los saque de su
  reserva compartida; los trozos binarios se decodifican como copia exacta; ninguna trama del canal
  TCP pasa de 64 KiB (lotes de dos trozos de 16 KiB en base64, como mide `malla_local_trama.rs`); los
  límites de trozo son los mismos en los dos lados.
- **Segundo fallo de la misma prueba**: por el canal TCP, una trama cuyo acuse se pierde se reenvía y
  llega DOS veces. Un «fin» repetido tras verificar reensamblaba sobre el almacén ya limpio y el
  archivo recibido quedaba VACÍO (o se mandaba un «hash-no-coincide» a un archivo ya bueno).

### 8.2 · Arreglo (solo web: llega a las apps cuando se publica la web)

- **Un trozo cuenta SOLO cuando el almacén terminó de guardarlo**, por los dos caminos (base64 y
  binario): `recibirTrozo` único; un duplicado en vuelo no se escribe dos veces; un fallo del almacén
  se recuerda y se dice. «fin» espera a tener todos los trozos (≤ 15 s, varios caminos) y a que
  terminen TODAS las escrituras; es idempotente (repite el «ok» sin tocar nada).
- **Almacén en cadena** OPFS → IndexedDB → memoria (`crearAlmacenEnCadena`): OPFS solo si hay
  `createWritable` (`opfsEscribible`: WKWebView de Safari < 26 y WebView de Android antiguos solo
  tienen `getDirectory`); si uno falla al escribir (cuota, permisos, origen 127.0.0.1), el trozo va al
  siguiente y nunca se pierde en silencio. Al releer, bytes exactos (`bytesExactos`: vistas y Blobs).
- **Errores que dicen dónde y por qué** (`archivo.error` lleva `detalle`, `lado` y `desde`):
  `hash-no-coincide`, `faltan-trozos` (conserva lo recibido), `almacen-receptor`, `fallo-verificacion`
  y, del lado del remitente, `canal-no-recupera` y `sin-confirmacion`. La burbuja del remitente dice
  «Falló en el receptor: …» y la RUTA exacta (`rutaDeArchivo`: canal TCP 47071 o enlace directo
  WebRTC, hacia quién); las burbujas antiguas con el código suelto se traducen
  (`motivoArchivoLegible`).
- **Reintentar y reanudar**: el remitente conserva el archivo tras un error o un rechazo; un
  reintento del MISMO archivo (mismo id, SHA-256 y tamaño) que el receptor ya aceptó no vuelve a
  preguntar y reanuda desde el PRIMER trozo que falta (`primerFaltante`, no «el mayor + 1»: con
  huecos se perdían trozos); con `faltan-trozos` el remitente reanuda solo (2 veces como mucho).
  Tras mandar «fin» el remitente queda «verificando» y, si el otro no contesta en 60 s + 50 ms por
  trozo, pasa a error con «Reintentar» (antes se quedaba colgado: el .bin de 50 MB de la prueba).

### 8.3 · La oferta, ampliada (opcional y compatible)

```
archivo.oferta { …lo de siempre…, lote?, loteTotal?, loteMensaje?, ruta?, inicioB64?, vista?, contenido? }
archivo.error  { id, motivo, detalle?, lado?: "receptor"|"remitente", desde? }
```

- `lote` (id del envío), `loteTotal`, `loteMensaje` (≤ 1000 caracteres, lo escrito en el compositor);
  `ruta` relativa (`File.webkitRelativePath`: botón «carpeta» del chat de neurona; sin «..» ni raíz);
  `inicioB64` (≤ 512 B); `vista` (miniatura JPEG/PNG/WebP ≤ 24 000 caracteres o ≤ 1200 de texto; nunca
  SVG ni HTML como imagen); `contenido` (ZIP y Office/APK/JAR: ≤ 100 entradas de su directorio
  central, leídas por el remitente de los últimos 256 KB). Todo se sanea al recibirlo. Una oferta con
  todo al máximo cabe en una trama del canal TCP (probado). Un remitente anterior no manda nada de
  esto: el receptor agrupa por remitente y ventana de 20 s.
- La recepción dice por dónde llegó y cómo se verificó quién lo manda (`ContextoRecepcion.via` y
  `verificacion`): canal TCP (huella del saludo firmado), enlace WebRTC señalizado con firma, enlace
  con código, malla de la cuenta o vínculo entre cuentas.

### 8.4 · La ventana de un envío (receptor)

Petición de Alex (08-11): «cuando se envían varios archivos, las preguntas de aceptar o rechazar del
receptor en UNA sola ventana, con vistas de carpetas y archivos, seleccionar cuáles aceptar o
rechazar, aceptar todos y rechazar todos, vistas previas, la información del envío y su mensaje, y
una inspección de seguridad con IA».

| Pieza | Archivo | Qué hace |
|---|---|---|
| Agrupar (puro) | `src/lib/network/envios-entrantes.ts` | `agruparEnvios` (por `lote`; sin él, remitente + 20 s), `enviosPorDecidir`, `arbolDeEnvio` (carpetas por ruta relativa), `idsDeCarpeta`, `idsPendientes` |
| Inspección (pura) | `src/lib/network/inspeccion-archivos.ts` | `inspeccionarArchivo` (extensión frente a tipo declarado y a bytes reales, con familias ZIP/ISO-BMFF/RIFF/EBML; ejecutables y scripts; doble extensión y RTLO; Office con macros; SVG/HTML con código; PDF con acciones; ZIP con rutas de escape, programas, macros, cifrado o compresión desmesurada; tamaños raros), `listarZip`, `resumenParaIA`, `leerVeredictoIA` |
| IA | `src/lib/network/inspeccion-ia.ts` | `astrauraChat` (turno de agente, sin contexto personal, solo fuentes gratis) con el RESUMEN de metadatos; fragmentos de texto (≤ 500) solo si la persona los permite |
| Vista previa | `src/lib/network/vista-previa-envio.ts` | Miniatura que viaja con la oferta (o texto) |
| Ventana | `src/components/network/envios-entrantes.tsx` | `VentanaEnvio` (diálogo Radix) y `EnviosEntrantes` (montaje global vía `TransferenciasArchivoToast`) |

- Se abre sola con el envío más antiguo por decidir; «Más tarde» o Esc la deja en una pastilla
  flotante («Envío de … · N por decidir · Revisar»), igual que los envíos que esperan detrás.
- Cabecera: quién lo manda y cómo se verificó (huella), por dónde llega, cuántos archivos (y cuántos
  anunció: «llegando 9 de 18»), cuánto ocupan, cuántos por decidir y el mensaje del envío.
- Archivos en árbol de carpetas (casilla por carpeta), lista o cuadrícula (se recuerda en este
  aparato), casillas, «Seleccionar todo», «Aceptar seleccionados», «Rechazar todos» y «Aceptar
  todos». Lo marcado como PELIGRO no va preseleccionado y «Aceptar todos» pide confirmarlo.
- Vistas previas seguras: antes de aceptar, la miniatura o el texto de la oferta; ya verificado,
  imagen, audio, vídeo o texto del archivo real (`tipoSeguroPara`: nunca HTML ejecutable); PDF y lo
  demás, icono con tipo y tamaño.
- Tras aceptar, el progreso de cada archivo (y su error, con el lado) sigue en la misma ventana; al
  llegar, la inspección se repite con los bytes REALES (primeros 64 KB y directorio del ZIP).
- La IA nunca acepta ni rechaza: informa por archivo y en conjunto. Las tarjetas de Mensajes ›
  Neuronas siguen con su Aceptar/Rechazar por archivo (mismo motor).

### 8.5 · Pruebas (deterministas)

- `src/lib/network/__tests__/archivos-malla-rutas.test.ts` (20): los motores REALES de los dos lados
  por las DOS rutas («Red local (app nativa)»: data channel binario y tramas TCP de Rust con lotes,
  acuse y acuses perdidos) con un almacén asíncrono como OPFS, los 18 formatos y, si están en la
  máquina, los archivos reales de `~/.starseed/pruebas-malla/` con su SHA-256. Antes del arreglo: 18/18
  en error por el enlace local y un archivo vaciado por un «fin» repetido. Más: varios trozos con el
  último a medias, vistas con desplazamiento, almacén que devuelve vistas, OPFS sin `createWritable`,
  primer almacén que falla, ningún almacén, «fin» repetido, reintento sin volver a preguntar,
  reanudar desde el primer hueco, `faltan-trozos` que se reanuda solo, remitente sin confirmación,
  oferta máxima en una trama y saneado de vistas y rutas.
- `envios-entrantes.test.ts` (5, también con motores reales), `inspeccion-archivos.test.ts` (30, sin
  falsos positivos en los 18 formatos), `src/components/network/__tests__/envios-entrantes.test.tsx` (8).

### 8.6 · Lo que necesita aparatos reales (pendiente)

- Repetir la prueba de los 18 archivos Mac → tableta y tableta → Mac con la web publicada: los 18
  «Verificado (SHA-256)» por `local:nativo-…` y también forzando el canal TCP (WebRTC desactivado).
- Qué almacén elige cada WebView (`almacen.tipo`): WKWebView de macOS (¿OPFS con `createWritable`?) y
  WebView de Android en el origen 127.0.0.1 (¿OPFS? ¿IndexedDB?); el .bin de 50 MB en la tableta
  (memoria si cae a la memoria).
- La ventana del envío en la tableta (vertical y horizontal) y en el teléfono; las miniaturas que
  genera el WKWebView (HEIC) y el WebView de Android; «Inspeccionar con IA» con el router real.

### 8.7 · Archivos grandes sin que el remitente se rinda (ARC1108B · 2026-11-08)

Prueba real del 08-11 (~04:09 UTC): Mac (prueba de escritorio native-21, web 7cc064fdf8, ya con
ARC1108A) → tableta «Maggaboard» (APK native-21, servidor local), los 18 archivos a la vez por
multitrayecto (enlace directo WebRTC + canal TCP 47071, 39 ms). Los 16 de menos de 200 KB,
verificados. `video.mp4` (8 034 291 B): «Falló en el receptor: no confirmó la verificación a tiempo —
sin respuesta en 85 s». `grande-50MB.bin`: «verificando» al 100 %. Con native-20 (sin ARC1108A) el
vídeo pasaba: no había plazo, se esperaba lo que hiciera falta.

**Causas** (reproducidas con los motores reales y un almacén LENTO y EN SERIE, como IndexedDB/OPFS del
WebView, que atiende una operación detrás de otra):

1. **Tras «fin», el receptor releía TODO dos veces**: `calcularHashLista` leía cada trozo para el
   SHA-256 y `ensamblar` los volvía a leer, además de recorrer los índices de TODOS los almacenes.
   En IndexedDB cada lectura y cada escritura abría y cerraba la base (`indexedDB.open` por trozo) y
   `indicesGuardados` recorría con un cursor la tabla entera CON sus datos (las transferencias
   anteriores incluidas) en cada oferta; en OPFS cada trozo pedía la raíz y abría dos carpetas.
2. **El remitente no tenía freno respecto al receptor**: con `bufferedAmount` solo frena la cola
   del canal, no lo que el receptor aún tiene que escribir. Los 18 se aceptan a la vez y el .bin de
   50 MB (3 200 trozos de 16 KiB) llegaba entero en segundos mientras el almacén del receptor iba
   muy por detrás, todo en memoria en promesas pendientes. El vídeo terminaba antes, pero su
   verificación quedaba en la MISMA cola del almacén detrás de esas escrituras.
3. **Silencio y plazo fijo**: el receptor no decía nada entre «fin» y «ok»; el remitente lo daba por
   perdido a los 60 s + 50 ms × trozos (491 trozos → 85 s), aunque la tableta siguiera trabajando.

Medido con el motor anterior (vídeo + 50 MB a la vez, 1 ms por operación de almacén): entre el «fin»
del vídeo y su «ok» había **4 663 operaciones de almacén en cola** (más 491 lecturas de `ensamblar`
que la prueba no contaba). Con ≥ 17 ms por operación —una apertura de IndexedDB o un
`createWritable` de OPFS en el WebView de Android— eso pasa de 85 s. El .bin: 6 891 operaciones
(+ 3 200 de `ensamblar`) frente a un plazo de 220 s. Los trozos van por UN solo camino del
multitrayecto (reparto, nunca duplicados) y el receptor ya descartaba los repetidos: no era eso.
Aceptar en la ventana del envío tampoco: el remitente no cuenta plazo hasta mandar «fin».

**Arreglo** (solo web: llega a las apps cuando se publica la web):

```
receptor → remitente  archivo.progreso {id, n, fase: "recibiendo"|"esperando-trozos"|"verificando"|"ensamblando", pct?}
archivo.aceptar       { …lo de siempre…, acuses?: 1, huecos?: [[a, b], …] }
CanalArchivos         { …, tamanoTrozo?(): number }
```

- **Hash al recibir**: el SHA-256 de cada trozo se calcula mientras se guarda (`recibirTrozo`); tras
  «fin» la raíz sale de esos hashes sin releer nada (`raizDeHashes`, la MISMA definición de siempre:
  compatible con remitentes y receptores anteriores). Después, UNA sola pasada por el almacén
  (`unirVerificado`, lotes de 16 con `leerTrozos`) une el archivo y comprueba que cada trozo se
  relee igual que llegó; va juntando partes de ~4 MB en Blobs (nunca el archivo dos veces en
  memoria). Los trozos de una sesión anterior (reanudar tras recargar) se hashean en esa pasada.
- **Latido y acuse** (`archivo.progreso`): mientras recibe, el receptor dice cuántos trozos tiene YA
  guardados (cada MiB, cada segundo o 250 ms después del último); tras «fin», cada 4 s y en cada
  cambio de fase, con porcentaje. Un remitente anterior lo ignora (no es de su protocolo).
- **Ventana**: con un receptor que late (`aceptar.acuses`), el remitente no va más de 8 MiB por
  delante de lo guardado (`ventanaVueloBytes`): la memoria del receptor queda acotada.
- **Vigía por inactividad**: con latidos, el remitente solo se rinde tras 45 s SIN NINGÚN mensaje
  (`esperaSinNoticiasMs`; cada latido la reinicia) y la burbuja dice qué hace el otro («El otro
  aparato verifica y une el archivo (SHA-256)… 42 %»). Con un receptor anterior, plazo fijo más
  holgado: 90 s + 100 ms por cada 16 KiB (vídeo de 8 MB → 139 s; 50 MB → 410 s). Si el «ok» llega
  después del plazo, o vuelve a latir, la burbuja pasa a verificado / verificando.
- **Esperar trozos de otro camino**: se rinde tras 15 s SIN AVANCE (antes, 15 s en total).
- **Reanudar solo lo que falta**: el receptor manda `huecos` (rangos) y el remitente manda SOLO eso
  (con `desde`, un remitente anterior manda todo lo que va detrás del primer hueco).
- **Trozos más grandes donde caben** (`elegirTamanoTrozo`, fijado en la oferta: el hash depende de
  él): enlace directo WebRTC 63 KiB en binario (`TAM_TROZO_ENLACE_DIRECTO`: con su cabecera queda bajo
  64 KiB, el tope de mensaje más estricto entre data channels); canal TCP 46 KiB, uno por trama
  (`trozoArchivoParaTrama`: en base64 cabe solo en 64 KiB − 512 B, con 1 KiB de holgura);
  multitrayecto, el menor de sus enlaces. El 50 MB pasa de 3 200 trozos a 813 (directo) o 1 114
  (TCP o los dos): casi 4 y casi 3 veces menos escrituras. «Reintentar» el mismo archivo conserva su
  trozo.
- **Multitrayecto con binario**: basta con que UN enlace lleve binario; a los de solo texto (el TCP)
  el trozo les sale como `archivo.chunk` en base64 (`trozoBinarioATexto`). Cada trozo por un solo
  camino; el receptor descarta un repetido con solo leer la cabecera, antes de copiar, guardar o
  hashear nada.
- **Almacenes**: IndexedDB con UNA conexión, escrituras agrupadas en una transacción por vuelta del
  bucle (hasta 64, durabilidad «relaxed»), lecturas por lotes, índices con `getAllKeys` por rango de
  claves y borrado por rango (nunca un cursor por toda la tabla); OPFS con las carpetas abiertas una
  vez y como mucho 6 escrituras a la vez. La memoria, con tope de 256 MB.
- **¿Cabe?** Antes de aceptar (y antes de preguntar a la persona), `espacioPara`: memoria con tope o
  la cuota del disco de la página (`navigator.storage.estimate`, el doble del archivo + 16 MB). Si no
  cabe se rechaza diciendo por qué: «No cabe en el aparato que recibe: solo puede guardarlo en memoria
  (hasta 256 MB) y mide 300 MB.» (`codigo: "sin-espacio"`).

Medido con el motor nuevo (mismo escenario, 1 ms por operación, trozos de 63 KiB): 938 escrituras +
938 lecturas en total (antes 3 691 escrituras + 3 691 lecturas para el hash + otras 3 691 de
`ensamblar`); «fin»→«ok» del vídeo, 1 081 operaciones en cola, con latidos todo el rato.

**Pruebas** (`src/lib/network/__tests__/archivos-malla-grandes.test.ts`, 14): 8 MB + 50 MB a la vez
con un almacén lento y en serie por el enlace directo (binario, 63 KiB, una sola lectura por trozo al
unir), por el canal TCP real (`red-local-nativa-motor`, tramas ≤ 64 KiB) y por los dos
(multitrayecto: `reparto()` suma exactamente los trozos, ninguno escrito dos veces); con relojes
falsos, verificar 96 s con el plazo de 85 s de la prueba real: el remitente espera gracias a los
latidos y, con un receptor anterior, pasa a «sin-confirmacion» a los 85 s y el «ok» tardío lo arregla
(sin latidos esa prueba falla: comprobado); un trozo perdido por un camino se pide solo a él
(`huecos`); remitente anterior hecho a mano (16 KiB, base64) → receptor nuevo; receptor anterior →
remitente nuevo; «no cabe» antes de preguntar; un trozo que se relee distinto → error del almacén; y
el almacén de IndexedDB con un IndexedDB de mentira (una apertura, lotes, rangos). Más
`canal-multitrayecto.test.ts` (binario mixto y trozo menor).

**Lo que necesita aparatos reales**: repetir los 18 a la vez Mac ↔ tableta con la web publicada
(los 18 verificados; la burbuja del remitente con «El otro aparato verifica y une…» en el vídeo y el
.bin); medir en la tableta `almacen.tipo` y cuánto tarda una operación de almacén (con `chrome://inspect`:
¿OPFS con `createWritable` en el WebView de Android 16 y en el origen 127.0.0.1?); un vídeo de
500 MB (memoria del WebView al unir; el aviso de «no cabe» con poco espacio); y el binario mixto
del multitrayecto (que el WebView reciba trozos binarios por el directo y de texto por el TCP del
mismo archivo).
