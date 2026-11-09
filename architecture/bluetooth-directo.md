# Contrato · Bluetooth directo entre neuronas (BLE1108A · 2026-11-08)

Petición de Alex: «el P2P sin router debe ir directo entre las antenas de los aparatos, no por una red
externa». Hasta hoy la app nativa detectaba el Bluetooth pero no llevaba datos por él
(`datos-por-la-malla.md` §1 y §4: «Bluetooth: aún sin enlace»). Desde BLE1108A dos apps nativas de
StarSeed OS (macOS y Android) cercanas hablan por Bluetooth de baja energía SIN Wi-Fi ni internet:
mensajes con acuse y archivos de hasta 20 MB. En la web es un enlace más del transporte universal,
`ble:<id>`, con la pastilla «Bluetooth directo · N ms».

## 1 · Piezas

| Pieza | Archivo | Qué hace |
|---|---|---|
| Núcleo puro (Rust) | `native/src-tauri/src/ble_trama.rs` | UUIDs, anuncio rotatorio (construir, leer, reconocer), trama, paquetes, parada y espera con acuses y rechazos, vecindario y desempate |
| Núcleo con la app (Rust) | `native/src-tauri/src/ble.rs` | Estado del proceso, hilo de plazos (250 ms), buzón, limitador, esperas de `ble_enviar`, comandos y eventos para la web, trait `Radio` |
| Radio de Android | `native/src-tauri/src/ble_android.rs` + `android/BleStarSeed.kt` | JNI sin crates (tabla de JNIEnv: 167/169/170) y cola de órdenes; Kotlin: `BluetoothLeAdvertiser`, `BluetoothLeScanner`, `BluetoothGattServer`, `BluetoothGatt` cliente, permisos |
| Parche de Android | `native/src-tauri/src/android_ble.rs` (lo aplica `build.rs`) | Permisos, `<uses-feature bluetooth_le required=false>`, proveedor `ArranqueBle`, copia de `BleStarSeed.kt` |
| Radio de macOS | `native/src-tauri/src/ble_macos.rs` | CoreBluetooth (central y periférico) en una cola de despacho propia, con `objc2-core-bluetooth =0.3.2` |
| Enlace web (puro) | `src/lib/malla/bluetooth-directo.ts` | Espejo de los tipos de Rust, `ble:<id>`, ligaduras por enlace, `saludosBle`, `enlacesBle`, velocidad honesta, señales del radar, control Wi-Fi |
| Motor web | `src/lib/malla/bluetooth-directo-motor.ts` | Saludo firmado (`nl.hola` + prueba de cuenta), colas por enlace, ritmo, entrada; secreto del enlace Wi-Fi (AES-GCM) |
| Elección y medios | `eleccion-enlace.ts`, `transporte-universal.ts`, `mensajeria/medios/medios.ts`, `datos-neurona.ts`, `sincronizacion-neuronas.ts` | Tipo `ble` (rango 0, el último), archivos grandes detrás de otro P2P, nunca en multitrayecto; medio «Bluetooth»; vía de sincronización `bluetooth` |
| Interfaz | `src/components/malla/bluetooth-directo-panel.tsx`, `src/components/mesh/use-detected-signals.ts` | Estado, interruptor, permiso y vecinos con RSSI; los vecinos como señales del radar y de Señales |

## 2 · UUIDs

| Qué | UUID |
|---|---|
| Servicio GATT de StarSeed (fijo) | `53530001-b1e0-4d2a-9c3e-537461727365` |
| ENTRADA: el central escribe (sin respuesta; también admite con respuesta) | `53530002-b1e0-4d2a-9c3e-537461727365` |
| SALIDA: el periférico notifica (el central se suscribe con el CCCD `00002902-…`) | `53530003-b1e0-4d2a-9c3e-537461727365` |
| PSM (BLE1109A): el periférico la publica, lectura, 2 bytes big-endian | `53530004-b1e0-4d2a-9c3e-537461727365` |
| Prefijo de todo anuncio StarSeed («SS» + B1) | `5353b100-0000-0000-0000-000000000000` |
| Máscara del filtro de escaneo (3 primeros bytes) | `ffffff00-0000-0000-0000-000000000000` |

## 3 · Anuncio (rota cada 5 min)

Cada app se anuncia con UN UUID de servicio de 128 bits que cambia en cada ventana de 5 min (y al cambiar
la clave de faro): el mismo esquema que el faro UDP (`faro.rs`), en 16 bytes:

```
[0..3]   53 53 B1                  prefijo (solo dice «aquí hay una neurona StarSeed», como la magia «SSF1»)
[3]      tipo << 4 | indicadores   tipo: 1 escritorio · 2 Android · 3 iOS · 4 servidor; bit 0: servidor GATT abierto
[4..8]   nonce                     nuevo en cada rotación (dos anuncios no se enlazan desde fuera)
[8..12]  etiqueta_cuenta  = HMAC-SHA256(clave de faro, "ss-ble-cuenta"  | ventana (4 B BE) | nonce)[..4]
[12..16] etiqueta_neurona = HMAC-SHA256(clave de faro, "ss-ble-neurona" | nonce | id de neurona)[..4]
```

- La ventana (segundos Unix / 300) no viaja: quien recibe prueba la suya y las dos de al lado (±5 min).
- `es_de_mi_cuenta` y `que_neurona` (contra las `conocidas` que da la web) son los de `faro.rs`. Sin la
  clave las etiquetas van a cero: los demás ven «una neurona StarSeed cerca» y nada que identifique.
- Por qué un UUID de servicio y no datos de servicio o del fabricante: macOS (`CBPeripheralManager`) solo
  deja anunciar el nombre y UUIDs de servicio, y en el paquete principal solo cabe UNO de 128 bits. En
  Android caben 3 B de indicadores + 18 B: va en el paquete principal, sin respuesta de escaneo.
- Límite honesto (como el faro): quien grabe un anuncio puede repetirlo unos minutos y fingir presencia
  (no datos): el enlace exige el saludo firmado (§5).

**A quién se conecta solo**: a las neuronas de TU cuenta que anuncian el servidor abierto, con señal
≥ −92 dBm, sin enlace ya y sin intento en los últimos 20 s; si las dos se conocen por id, conecta (como
central) la de id MENOR (`conecto_yo`): nunca dos enlaces cruzados. Si este aparato aún no sabe qué
neurona es la otra (le falta en `conocidas`), conecta igual: es de tu cuenta. Como mucho 6 enlaces. A un
vecino de otra cuenta solo se conecta a mano (`ble_abrir`), y el saludo decide si se habla.

## 4 · GATT, trama y paquetes

- **Servicio** con ENTRADA (escritura sin respuesta, central → periférico) y SALIDA (notificación,
  periférico → central). El enlace es simétrico por encima: cada lado manda y recibe.
- **Trama** (como `malla_local_trama.rs`): `"SSB1" | versión 1 | tipo 1 (mensaje) | largo (4 B BE) |
  cuerpo`; el cuerpo es un objeto JSON en UTF-8 de **≤ 16 KiB** (la web lo firma y lo verifica).
- **Paquete** (una escritura o notificación, ≤ MTU − 3 y ≤ 512 B):

```
DATOS    01 | id (2 B) | índice (2 B) | trozo de la trama
ACUSE    02 | id (2 B)                          el mensaje entero llegó, es válido y se guardó
RECHAZO  03 | id (2 B) | motivo                 1 hueco · 2 grande · 3 inválido · 4 límite
```

- **MTU**: Android pide 517 (`requestMtu`) → paquetes de 512 B; macOS usa
  `maximumWriteValueLengthForType:` (central) y `maximumUpdateValueLength` (periférico). Sin negociar, 20 B.
- **Parada y espera por mensaje** (en cada sentido): uno en vuelo; el siguiente sale con su acuse. Sin
  acuse 5 s después de entregar el último paquete a la radio → se reenvía entero (4 intentos); ningún
  mensaje espera más de 120 s. El receptor descarta un mensaje con un hueco (pide «hueco» una vez) y
  reconoce los repetidos (acuse perdido) por su id: los acusa otra vez y no los entrega dos veces.
- **Contrapresión**: Android, una escritura detrás de otra (`onCharacteristicWrite`) y una notificación
  en vuelo por servidor (`onNotificationSent`); macOS, `canSendWriteWithoutResponse` /
  `peripheralIsReadyToSendWriteWithoutResponse:` y `updateValue…` → `…IsReadyToUpdateSubscribers:`.
  Rust no suelta un paquete hasta que la radio lo pide (`siguiente_paquete`).
- **Límites**: 120 mensajes por enlace cada 10 s (limitador, como el TCP), 256 KiB en cola por enlace, 6
  enlaces. La web anuncia los suyos en el saludo y nunca manda más del 90 % del cupo del otro.

## 5 · Saludo (misma cuenta o neurona vinculada)

El de la red local (`datos-por-la-malla.md` §6.3 y §6.6), por cada enlace: `nl.hola` firmado con la
identidad de malla, con la prueba de cuenta `cta` (HMAC con la clave de faro, atada a la huella que firma)
o aceptado por el vínculo de MSH1107A con la misma huella (`aceptarHola`). Sin saludo válido, de ese enlace
solo se escucha el saludo: ni `tu.*`, ni `archivo.*`, ni control. `webrtc: false` (por Bluetooth no se
señaliza WebRTC: sin red IP no conectaría).

- Quien abrió el enlace por el anuncio saluda a la neurona que el anuncio reconoció. En un enlace sin
  reconocer (el otro conectó, o su id faltaba) se saluda a ciegas a las neuronas de la cuenta y vinculadas
  aún sin ligar (≤ 6 saludos de ~1 KiB): solo la de verdad lo acepta y contesta.
- Cada 15 s y en cada `ble://cambio`; una ligadura vale 5 min; un enlace se liga a UNA neurona.

## 6 · Permisos y segundo plano por sistema

| Sistema | Permisos | Segundo plano |
|---|---|---|
| Android 12+ | `BLUETOOTH_SCAN` (`neverForLocation`), `BLUETOOTH_ADVERTISE`, `BLUETOOTH_CONNECT` («Dispositivos cercanos»), pedidos con un diálogo que explica para qué (una vez; luego desde el panel «Permitir Bluetooth cercano»; si Android ya no deja preguntar, abre los ajustes de la app) | El núcleo y la radio viven en el proceso: con el servicio «Segundo plano» (`ServicioAntenas`, tipo `connectedDevice`) se sigue anunciando, escaneando (con filtro: Android lo deja con la pantalla apagada) y aceptando enlaces con la app cerrada; lo recibido espera en el buzón (128, 10 min) a que la web lo pida |
| Android ≤ 11 | `BLUETOOTH` y `BLUETOOTH_ADMIN` (normales) y `ACCESS_FINE_LOCATION` (Android lo exige para escanear; la ubicación del aparato tiene que estar activada) — declarados con `maxSdkVersion=30` | Igual |
| macOS | `NSBluetoothAlwaysUsageDescription` en `Info.plist` (sin ella macOS cierra la app); macOS pregunta la primera vez; si se negó, el botón abre Ajustes del Sistema › Privacidad › Bluetooth | Con la ventana cerrada y la app en la bandeja sigue igual (la cola de CoreBluetooth es del proceso) |
| Linux (LNX1109B) | Ninguno de la app: BlueZ por D-Bus del sistema (§16). Hace falta acceso a `org.bluez` (sesión de escritorio local; si no, grupo `bluetooth` o regla de polkit) | El hilo `starseed-ble-linux` vive con el proceso (bandeja) |
| Windows, iOS | — | Sin radio en esta app: `ble_estado` dice «no-disponible» con su motivo (§9) |

Interruptores: «Encender/Apagar» del panel (`ble_activar`, se guarda en `ble.json`); en el build de Android,
`STARSEED_SIN_BLUETOOTH_ANDROID=1` saca el APK sin Bluetooth directo (y sin el servicio de antenas no se
inyecta: usa `PuenteNativo`).

## 7 · Qué lleva y a qué ritmo (honesto)

| Clase | Por Bluetooth directo |
|---|---|
| Mensajes | sí, con acuse de la otra app (confirmado) |
| Archivos | sí, ≤ 20 MB, trozos de 10 KiB (`tamanoTrozo`: caben en base64 en una trama de 16 KiB), por el motor de siempre (`archivos-malla.ts`: pregunta, SHA-256, reanuda). Un archivo de más de 256 KiB va detrás de cualquier P2P más rápido (también internet o TURN) y solo sale por Bluetooth si no hay otro. Nunca se reparte en multitrayecto |
| Llamadas, pantalla, transmisiones en vivo | no. El audio de baja tasa (Opus a 16 kbps ≈ 2 KB/s) cabría en el aire, pero no hay canal de medios por él todavía (los medios van por WebRTC, que necesita red IP) |

**Ritmo**: lo que se enseña es lo MEDIDO por Rust (ida y vuelta del último mensaje acusado; rendimiento
del último de ≥ 2 KiB). Sin medida: «sin medir (por Bluetooth suele ir a 10–60 KB/s)». Estimación sin
medir: 20 MB entre 6 y 35 min. Lo más rápido es Android ↔ Android con MTU 517 y PHY 2M; macOS ↔ Android
suele quedar por debajo. Con un router delante, el enlace TCP o WebRTC de la red local va primero.

**El aire no va cifrado** (Bluetooth sin emparejar): lo que viaja es lo mismo que por el TCP de la red
local — sobres firmados y mensajes del transporte —, y por eso un secreto (la contraseña del enlace Wi-Fi)
nunca viaja en claro (§8).

## 8 · Control para el enlace Wi-Fi directo (WFD1108A)

> **(INT1108C)** La negociación que se usa es la de WFD1108A (`wifi-directo.md` §2 y §9): sus cuatro mensajes
> firmados (`enlace.wifi.oferta/respuesta/listo/cierre`, credenciales cifradas con ECDH para el otro) viajan
> por este Bluetooth como `tu.msg` del canal `enlace-wifi` clavado a `ble:<id>` (`puente-ble-wifi.ts`), y las
> ligaduras de §5 dan la confianza. El control propio de abajo (`enviarControlEnlace`, `alControlEnlace`,
> `cifrarSecretoEnlace`) sigue disponible pero sin uso.

El agente WFD1108A monta el enlace Wi-Fi directo (LocalOnlyHotspot o Wi-Fi Direct en Android, unirse con
CoreWLAN en macOS) y lo NEGOCIA por este Bluetooth. Dos mensajes de control, firmados como `nl.sen`:

```
{"t":"enlace.wifi.oferta","s":<sobre firmado de {
   t:"enlace.wifi.oferta", v:1, s:"<sesión 8–64 [A-Za-z0-9_-]>", de, para,
   modo:"hotspot"|"wifi-direct", ssid (≤ 32), banda?:"2.4"|"5"|"6", ip?:<IPv4 privada>, puerto?:≥1024,
   secreto?:{ iv:<12 B base64>, ct:<base64> }, caduca:<epoch ms, ≤ 10 min>, ts }>}
{"t":"enlace.wifi.respuesta","s":<sobre firmado de {
   t:"enlace.wifi.respuesta", v:1, s, de, para, k:"acepto"|"rechazo"|"unido"|"fallo", ip?, motivo?, ts }>}
```

- **Mandar**: `bluetoothDirectoActivo()?.enviarControlEnlace(neurona, { t, s, modo, ssid, caduca, secreto? })`
  (el motor añade `v`, `de`, `para`, `ts`, lo firma y lo manda por el enlace ligado con esa neurona; sin
  ligadura dice que no). Se resuelve con el acuse de la otra app.
- **Recibir**: `bluetoothDirectoActivo()?.alControlEnlace((c, { neurona, enlaceId, huella }) => …)`. Solo
  llega lo que viene de la neurona LIGADA a ese enlace, firmado con su misma huella, para esta neurona, sin
  caducar (`leerControlEnlace`, saneado).
- **Secreto**: `cifrarSecretoEnlace(claveFaro, { de, para, s }, contraseña)` /
  `descifrarSecretoEnlace(claveFaro, { de, para, s }, secreto)`: AES-GCM 256 con clave =
  HMAC-SHA256(clave de faro, `"ss-enlace-wifi-v1|<sesión>"`) y datos asociados `"de|para|sesión"`. Solo las
  neuronas de la misma cuenta lo descifran (una vinculada de otra cuenta no tiene la clave: para ella,
  red abierta o no hay oferta).
- Con la red Wi-Fi arriba, el faro y el canal TCP 47071 (`nativo:<ip>`) se encuentran solos: los datos
  grandes, las llamadas y la pantalla pasan a ir por ahí (rango 0 delante del Bluetooth).

## 9 · Lo que no está (con motivo)

- **Windows** (Linux ya lo tiene desde LNX1109B, §16): sin radio. `btleplug` solo hace de central (sin papel periférico ni servidor GATT):
  dos PCs no se hablarían entre sí y un PC solo vería a los móviles. No compensa una crate nueva por medio
  enlace; queda pendiente (BlueZ por D-Bus en Linux y WinRT `GattServiceProvider` en Windows sí tienen
  periférico).
- **iOS**: el mismo código de CoreBluetooth de macOS valdría, pero iOS en segundo plano no anuncia el UUID
  (va al «área de desbordamiento») y exige los modos `bluetooth-central`/`bluetooth-peripheral`: pendiente.
- **Llamadas y transmisiones** por Bluetooth (§7).

## 10 · Pruebas

- Rust (`cargo test --lib`): `ble_trama` (12: UUID y hex, anuncio y reconocimiento, rotación sin
  clave, trama y paquetes, MTU mínimo, los dos sentidos, paquete perdido, acuse perdido, sin acuse
  nunca, limitador del otro, cola llena con cierre y basura, vecindario y desempate), `ble` (2: eventos de Kotlin y el núcleo de verdad frente
  a otra app hecha con un `Enlace` puro), `ble_android` (2: órdenes y paquetes en hex), `android_ble` (4:
  manifiesto, idempotencia con los otros bloques en el orden de `build.rs`, Kotlin ↔ Rust).
- macOS: `ble_macos.rs` se comprueba con `cargo check --target aarch64-apple-darwin` en una caja aparte con
  las mismas crates y versiones (objc2 0.6.5, objc2-foundation 0.3.2, objc2-core-bluetooth 0.3.2, dispatch2
  0.3.1). La JNI de Android, con `cargo check --target aarch64-linux-android`. `BleStarSeed.kt` se compila
  con `kotlinc` (1.9.25 y 2.1.20) contra `android.jar` 35.
- Web (vitest): `bluetooth-directo.test.ts` (9), `bluetooth-directo-motor.test.ts` (7: dos apps en memoria
  con un puente que trocea y rearma como `ble.rs`; un archivo de verdad con MTU 23),
  `bluetooth-directo-eleccion.test.ts` (7), `contrato-bluetooth.test.ts` (10), `datos-neurona.test.ts` (+1).
- BLE1109A: Rust `ble_l2cap` (10: PSM, marcos partidos y pegados, escritura parcial, máquina del carril y su
  retroceso) y 2 más en `ble` (eventos y relevo/vuelta a GATT); web: 3 más en `bluetooth-directo-motor.test.ts`
  (capacidad y vuelta a GATT sin soltar el enlace, prioridades con el canal rápido, saneo y texto). Ver §15.

## 11 · Lo que necesita aparatos reales (pendiente)

- Mac + tableta Android con el Wi-Fi APAGADO en los dos: que se reconozcan por el anuncio, se conecten
  solas (la de id menor), se liguen con el saludo y un mensaje de Neuronas diga «Bluetooth directo · N ms ✓».
- Medir el rendimiento real (Mac ↔ Android, Android ↔ Android) con un archivo de 5 MB y uno de 20 MB, y
  ajustar la horquilla «sin medir» (10–60 KB/s) y el umbral de 256 KiB con lo medido.
- Android con la app cerrada y la pantalla apagada (servicio «Segundo plano»): que siga anunciando y
  aceptando, y que lo recibido aparezca al abrir la app. Android 11 (ubicación) y Android 14/15.
- El diálogo de permisos y el «Permitir Bluetooth cercano» tras negarlo dos veces (ajustes de la app).
- macOS: el aviso del sistema la primera vez y que, negado, el panel lo diga y abra Ajustes.
- Rotación del anuncio cada 5 min con un enlace abierto (no debe cortarlo) y reconexión al alejarse y
  volver; dos Macs o dos Android a la vez (6 enlaces como mucho).

## 12 · Fiabilidad en aparatos reales (BLE1108B · prueba de campo 08-11, build 0.5.1-prueba.26)

Mac ↔ tableta SM-X900, Wi-Fi de la tableta apagado. El texto iba; el vídeo no. Causas halladas y arreglos:

| # | Síntoma | Causa en el código | Arreglo |
|---|---|---|---|
| 1 | Se cae a mitad de un archivo | El motor de archivos mandaba trozos sin esperar al portador (`enviar` sin acuse): la cola de datos se llenaba, los fallos seguidos (`FALLOS_PARA_CAIDA`) tiraban el enlace y no había latido que distinguiera «lento» de «muerto» | Contrapresión: `CanalArchivos.esperarListo` (cola < 32 KiB y enlace ligado) antes de CADA trozo y `enviarConAcuse` (un trozo confirmado, el siguiente). Latido de 8 s en Rust (`P_LATIDO`=4, sin acuse); sin nada del otro lado en 26 s se cierra con motivo |
| 2 | No reconecta | Backoff plano de 30 s en la web y en Rust; tras una caída Android no volvía a anunciar ni a escanear | Rust `ESCALA_RECONEXION_MS` 0/2/5/15 s (se olvida a los 2 min o si el enlace vivió ≥ 5 s); web `esperaCaidaBle` 2/5/15 s; Kotlin `reanudarRadio()` tras cada desconexión; la ligadura se rehace con `nl.hola` a los 2/5/15 s (`insistirHola`) |
| 3 | La oferta tardó minutos | La oferta (con la vista previa) podía no caber en una trama y se mandaba UNA vez; si el otro aún no tenía el enlace ligado se perdía y solo un reintento posterior la repetía | `ofertaQueCabe` (quita vista → contenido → inicio hasta caber), reenvío cada 6 s (1 s si falla) mientras nadie conteste y el receptor ignora la repetición (misma sha256 y tamaño en `pendiente-aceptar`) |
| 4 | Un corte pierde el archivo | El canal de archivos era por ENLACE: al renacer con otro id el motor hablaba a un canal muerto | `canalArchivos` devuelve un canal por NEURONA, estable entre enlaces; el motor reintenta (500 ms·2ⁿ), la oferta se repite y el receptor contesta `archivo.aceptar{desde,huecos}`: sigue desde lo confirmado (el SHA-256 se comprueba al final) |
| 5 | «Esperando un medio disponible» | El buzón solo reintentaba por reloj | `crearDisparadorReintento`: al registrarse un enlace local o ligarse uno BLE (`alLigarBle`) reintenta a los 150 ms, y repite si llegó con una vuelta en marcha |
| 6 | Cabecera «Desconectada» con BLE vivo | `presencia-viva.ts` solo miraba LAN, malla y faro | Fuente `vias` (registro de conectores `descubrirVias` + enlaces BLE): «En línea · vía Bluetooth directo · N ms». Orden: local, red local, malla misma red, faro, **ble**, malla, cuenta |

**Política de archivos grandes por Bluetooth.** Sobre 256 KiB el glue propone Wi-Fi directo (respeta Preguntar/Automático); en la propuesta, «Enviar por Bluetooth igualmente» con el tiempo estimado (`duracionArchivoBle`) hasta el tope de 20 MB; más allá solo por Wi-Fi. La ventana de aceptar dice el medio y el tiempo: «por Bluetooth: ~N min estimado» (`textoMedioEnvio`; con la velocidad medida del enlace, o la media de 80–480 kbit/s «sin medir»).

**Registro del enlace.** Anillo de 200 eventos por neurona (400 en total) en la web (`registro-enlace-ble.ts`: abierto, ligado, reconectado, perdido, caída, rechazo, cifrado, envío fallido, hola, reintento) y anillo de 300 en Rust (`ble_registro`) con radio, MTU, conexiones y, al cerrar un enlace, motivo, vida, bytes, cola, reintentos, silencio y latidos. El panel «Registro del enlace» (Bluetooth directo) los une por hora y permite copiar o guardar. En escritorio se añade a `~/Library/Logs/app.starseed.os/enlaces.log` (otro directorio de datos fuera de macOS) con `ble_registro_anexar`, rotado a `.1` al pasar de 1 MiB.

**Pruebas.** Rust: `reconexion_escalonada_ya_2_5_y_15_segundos`, `latido_en_silencio_y_enlace_muerto`, `registro_de_enlaces_con_motivo_y_rotacion`. Web: `archivos-malla-ble.test.ts` (contrapresión con portador lento, corte y reanudación con SHA-256, ventana de aceptar), `registro-enlace-ble.test.ts`, `reintento-al-enlazar.test.ts`, `presencia-viva.test.ts` (solo BLE), `envios-entrantes.test.ts` (`textoMedioEnvio`), `puente-ble-wifi.test.ts` (propuesta de archivo grande), `contrato-bluetooth.test.ts` (9 comandos).

**Pendiente y a vigilar.** La causa física exacta del corte del 08-11 no se puede probar sin trazas: el próximo ensayo debe traer `enlaces.log`. Falta la conexión simétrica (hoy solo conecta la neurona de id menor; si falla, la otra no lo intenta). Los valores por defecto de antena y el asistente de permisos son de PER1108A; la identidad sin internet al arrancar, de OFF1108A.

## 13 · Ruta acordada entre los dos lados (BLE1108B · segunda parte)

Campo 08-11: tras volver el Wi-Fi, la tableta decía «P2P por internet (NAT atravesado)» y la Mac «red local» para la misma imagen. Causas: (a) `clasificar` miraba solo el TIPO de candidato (un par srflx/prflx con direcciones privadas de la misma LAN salía «internet directo» en un lado y host↔host «red local» en el otro); (b) la ventana de recibir ponía una etiqueta FIJA según quién abrió el enlace («Red local (app nativa) · enlace directo WebRTC»), no la ruta medida; (c) la pastilla del chat llamaba «ruta sin medir» a la red local.

- **Clasificador común** (`estadisticas-enlace.ts` → `clasificarPar`): relé TURN si algún lado es `relay`; **red local** si las dos direcciones son privadas (RFC 1918, ULA, enlace local) y de la misma subred (192.168/16 por /24; 10/8 y 172.16/12 por /16; ULA por /64), o host↔host (también con nombres mDNS); **internet directo (NAT atravesado)** si público↔público o srflx/prflx entre redes distintas. CGNAT 100.64/10 no es privada. Se usa para el panel de Señales, la presencia, la vía guardada y la etiqueta de recepción.
- **Acuerdo**: la oferta de archivo lleva `rutaEnlace` (la del remitente) y `archivo.aceptar` la del receptor, medida con el mismo clasificador en SU enlace (`CanalArchivos.rutaMedida`; Bluetooth: `bluetooth-directo`). Cada motor guarda `rutaEnlace`, `rutaEnlaceOtro` y `rutaEnlaceVerificada`; el mensaje lo copia a su vía (`ruta`, `rutaOtro`, `rutaVerificada`) y la info muestra «Ruta medida» y «Ruta según el otro aparato: Verificada por ambos aparatos» (o «no coincide»).
- **Textos**: «Misma red local», «Internet directo (NAT atravesado)», «Relé TURN», «Bluetooth directo (sin router)».

## 14 · Regresión de BLE1108B: ningún enlace espera una señal que puede no llegar (BLE1108C)

Campo 08-11 (Mac 0.5.1-prueba.28 central ↔ tableta SM-X900 prueba.27 periférico, sin Wi-Fi): `enlace-abierto` b1 a las 21:53:15, el saludo salió 36 s después, sin «ligado», `envio-fallido … no salió por Bluetooth en 120 s` cada ~2 min y ningún dato en ningún sentido. Con prueba.26 el texto iba.

**Causa más probable, con el código delante.** BLE1108B añadió esperas que dependen de una señal externa y NINGUNA tenía salida si la señal no llegaba:
1. `ble_trama.rs`: el enlace es parada-y-espera de un solo mensaje en vuelo. El reintento de 5 s (`PLAZO_ACUSE_MS`) solo se arma cuando la radio ya retiró TODOS los paquetes; si la radio no los retira (macOS: `canSendWriteWithoutResponse()` falso sin volver a avisar; Android: sin `onCharacteristicWrite`/`onNotificationSent`), el mensaje no reintenta nada y espera los 120 s de `PLAZO_TOTAL_MS`. El saludo (y todo lo que va detrás) queda detrás de ese mensaje: es la firma exacta del log (`envio-fallido … 120 s`, repetido).
2. `ble_macos.rs`: `bombear_central` y `bombear_servidor` salían sin más si el sistema no estaba «listo»; el único despertar era el delegado.
3. Kotlin: `VIGIA_ESCRITURA_MS` de 1,5 s por paquete frenaba el ritmo; el periférico no vigilaba que el otro se suscribiera al CCCD, y la suscripción fallida del central cerraba el enlace sin reintento ni rastro.
4. El log no decía en qué punto se atascaba (sin hitos de descubrimiento/suscripción/primer dato).

**Arreglo.**
- Rust `Enlace`: `PLAZO_ATASCO_MS`=4 s. Si la radio no retira ni un paquete del mensaje en vuelo en ese tiempo, se anota `radio-atascada` y se reenvía (4 intentos → fallo con motivo «la radio no retiró los paquetes» en ~16 s, no 120 s). Cada retirada de un paquete reinicia la cuenta: una radio lenta pero viva no se toma por atascada.
- macOS: `ESPERA_LISTO_MS`=400. Sin «listo para escribir» / «lista para actualizar» se escribe/notifica igual y se anota `listo-tarde`. Suscripción a SALIDA fallida: `sin-suscripcion` + hasta 3 reintentos (1 s) antes de cerrar.
- Android: `VIGIA_ESCRITURA_MS`=500 con `listo-tarde`; suscripción del central con hasta 3 reintentos; el periférico vigila 10 s que el otro se suscriba (`sin-suscripcion` y lo suelta). `reanudarRadio()` solo arranca el anuncio si no hay uno en marcha y el escaneo: no para el anuncio ni toca servidor/clientes.
- Web: `ESPERA_LISTO_BLE_MS`=500: con el enlace arriba, `esperarListo` del canal BLE sigue pasado ese plazo y anota `listo-tarde`; `CanalArchivos.enlaceArriba`/`alListoTarde` y `esperarListoConPlazo` hacen lo mismo para cualquier portador. Sin enlace sí se espera la señal real (reconexión de hasta 90 s). El saludo y los controles nunca pasan por `esperarListo` (solo lo usa el motor de archivos) y salen por delante de los datos.
- Hitos nuevos en `enlaces.log` en las dos plataformas: `servicios-descubiertos`, `suscrito`, `sin-suscripcion`, `suscripcion-reintento`, `listo-tarde`, `radio-atascada`, `primer-dato-recibido`, `primer-paquete-retirado` (evento Kotlin `{"e":"nota"}` con lista cerrada `NOTAS_RADIO`).

**Pruebas.** Rust: `radio_atascada_se_nota_y_el_mensaje_falla_pronto_con_motivo`, `radio_lenta_pero_viva_no_se_toma_por_atascada`, `el_saludo_y_el_latido_comparten_la_radio_sin_matarse`, `reanudar_radio_no_tumba_un_enlace_en_marcha`, `hitos_de_kotlin_son_los_que_rust_acepta`, `leer_evento` con notas. Web: `archivos-malla-ble.test.ts` (portador cuyo «listo» nunca llega: el archivo llega íntegro; `esperarListoConPlazo`) y `bluetooth-directo-motor.test.ts` (cola de datos llena con radio lenta: `listo-tarde` y un control sale por delante).

**Sin probar en aparatos.** La causa física exacta (¿CoreBluetooth sin aviso?, ¿CCCD sin escribir?) sigue sin demostrarse: el próximo ensayo debe traer `enlaces.log` con las líneas de arriba; la primera que falte señala el paso que no ocurre.

## 15 · Canal rápido L2CAP (BLE1109A)

Entre una Mac y una tableta Android no hay otro radio directo común (Apple solo habla AWDL; Android, Wi-Fi Direct o
Aware), así que el Bluetooth es el único camino sin router. GATT (paquetes de ≤ 512 B con acuse uno a uno) es lento;
un canal L2CAP orientado a conexión (CoC) da un flujo continuo mucho más rápido **sobre el mismo enlace `ble:<id>`**.

**PSM y papeles.** El periférico (hoy la tableta) abre un servidor L2CAP *inseguro* (`listenUsingInsecureL2capChannel`,
Android 10+) y publica su PSM en la característica de lectura `…0004` del servicio StarSeed (2 bytes big-endian, válido
solo en 0x0080–0x00FF, rango dinámico LE). El central (la Mac) la lee tras suscribirse y llama a `openL2CAPChannel`.
Sin la característica o con un PSM no válido no pasa nada: el enlace sigue por GATT. Papeles inversos (Android
central → Mac periférico): la Mac publica su canal con `publishL2CAPChannelWithEncryption(false)` y también lo expone
en `…0004`; el lado Android central solo abre el canal si le llega un PSM, así que queda **sin probar** en aparatos. El
cifrado de la sesión es el de CIF1108A (de extremo a extremo, por encima); no hay segundo cifrado.

**Marco.** `[largo u16 BE][paquete ≤ 4096 B]`, y dentro el mismo paquete `[tipo|id|idx]` de §4 (la misma máquina de
acuses, rechazos, latidos y reintentos de `ble_trama`, solo con paquete de 4096 B). Un `Desmarcador` junta lecturas
partidas y separa las pegadas; una `Salida` guarda lo que el flujo no aceptó (escritura parcial). Un largo 0 o mayor que
4096 cierra el canal (se vuelve a GATT).

**Carril y respaldo.** El núcleo (`ble.rs`) decide el carril; la radio solo mueve bytes. Con el canal abierto,
`siguiente_paquete` de GATT no entrega nada y el mensaje en vuelo se vuelve a trocear al tamaño del carril. Si el canal
se cierra (o no abre en 8 s, o una escritura se atasca 5 s), se vuelve a GATT **sin soltar el enlace ni la ligadura**
y se reintenta abrir con retroceso 0 / 2 / 5 / 15 / 60 s (un canal que vivió ≥ 10 s reinicia la escala). Las
prioridades control > voz > vídeo > datos viven en las colas del motor web y no cambian con el carril.

**Medida.** Cada acuse de un mensaje ≥ 2 KiB mide los kb/s del carril en uso (`kbps_rapido`, `kbps_gatt`); `kbps` del
enlace es el del carril activo y alimenta `capacidadKbps` (planificador y escalera de vídeo). Texto:
«Bluetooth directo · canal rápido · N kb/s» (Señales y píldora del panel); «sin medir» hasta el primer mensaje grande.
Cifras **esperadas, no medidas**: L2CAP con PHY 2M unos 80–160 KB/s (≈ 640–1300 kb/s); GATT 10–60 KB/s.

**`enlaces.log`.** `ble l2cap-abierto psm=…`, `ble l2cap-cerrado motivo=…`, `ble l2cap kbps=…` (como mucho cada 5 s) y,
en el registro web, `canal-rapido` al cambiar de carril.

**Plataformas y guardas.** macOS: `CBL2CAPChannel` con un hilo propio y su `NSRunLoop` que sondea los `NSStream` cada
5 ms (sin delegados, para no depender de la cola de CoreBluetooth). Android: hilos de lectura y escritura por canal, puente
JNI `rapido`/`siguienteRapido`; `createInsecureL2capChannel` y el servidor exigen `SDK_INT ≥ 29`, `setPreferredPhy(2M)`
`SDK_INT ≥ 26`; por debajo, GATT puro. Kotlin no se compila en local: lo comprueba la CI.

**Lo que deben confirmar los aparatos.** Que la Samsung SM-X900 (Android 16) publique y acepte el PSM; que la Mac
MaggaBook abra el canal sin emparejar; la velocidad real (`l2cap kbps=`); que la vuelta a GATT al apagar el canal no
pierda el mensaje en vuelo; el consumo con el sondeo de 5 ms.

## 16 · Windows: Bluetooth LE directo (WIN1109B · 2026-11-09)

Windows 10 (1809+) y 11 hablan **el mismo protocolo que macOS y Android**: mismos UUID (§3), misma trama (§4), mismo
saludo (§5), mismos eventos y mismas líneas de `enlaces.log` (`ble …`). Código: `ble_windows.rs` (WinRT, solo
Windows), conectado al núcleo `ble.rs` como `ble_macos.rs`; lo puro (UUID, direcciones, ids de enlace, paquete,
estado de la radio, motivos) está en `win_p2p_logica.rs::ble` con pruebas en todos los sistemas.

### 16.1 · Carriles y papeles

| Carril | Windows | Notas |
| --- | --- | --- |
| `ble-gatt` | **central y periférico** | Los dos a la vez, como macOS. |
| `ble-l2cap` | **no** | WinRT no tiene API pública de L2CAP CoC en LE. La característica PSM (`…0004`) se publica con valor fijo `[0, 0]` («sin canal rápido»): los pares con BLE1109A la leen y se quedan en GATT. Windows nunca abre ni ofrece el canal rápido. |

### 16.2 · Cómo se hace

- **Periférico:** `GattServiceProvider::CreateAsync` con el servicio StarSeed, ENTRADA (`Write` y
  `WriteWithoutResponse`), SALIDA (`Notify`) y PSM (`Read`, estática). `StartAdvertising` conectable y descubrible. Ese
  anuncio lleva el UUID del *servicio*, no el rotatorio `SS·B1` de §3, así que además se publica el rotatorio con
  `BluetoothLEAdvertisementPublisher` (UUID de 128 bits en la lista, como macOS y Android). El central conecta a la
  dirección del aparato, que es la misma. Un cliente que se suscribe a SALIDA es un enlace `p:<dirección>`.
- **Central:** `BluetoothLEAdvertisementWatcher` pasivo; se queda con los anuncios cuya lista lleva un UUID que
  empieza por `SS·B1`. `BluetoothLEDevice::FromBluetoothAddressAsync` → `GetGattServicesForUuidAsync` → ENTRADA y
  SALIDA → suscripción a SALIDA (3 intentos) → escritura sin respuesta en ENTRADA. Paquete = `MaxPduSize − 3`
  (acotado a 20..512 como en §4). `SetMaintainConnection(true)` mantiene el enlace; `ConnectionStatusChanged` lo cierra.
- Ids de enlace `c:<dirección>` (somos central) y `p:<dirección>` (somos periférico), como en §2.
- Todo lo bloqueante va en hilos propios (MTA de COM); los manejadores de WinRT solo llaman al núcleo (`al_*`).

### 16.3 · Estados y `motivo`

| Situación | `ble_estado` | `motivo` (resumen) |
| --- | --- | --- |
| Radio encendida, con los papeles | `encendida` | — |
| Radio apagada | `apagada` | «El Bluetooth de este equipo está apagado: enciéndelo.» |
| Sin adaptador / sin LE | `no-disponible` | «Este equipo no tiene Bluetooth con baja energía.» |
| Privacidad de Windows deniega la radio | `sin-permiso` | Dice dónde: Configuración › Privacidad y seguridad › Dispositivos de radio; `ble_permiso` abre `ms-settings:privacy-radios`. |
| Sin papel periférico (adaptador antiguo) | `encendida`, solo central | Lo dice el motivo. |
| `STARSEED_SIN_BLE_WINDOWS=1` | `no-disponible` | «Bluetooth directo apagado en esta instalación.» |

### 16.4 · Interoperabilidad esperada

| Con | Windows central | Windows periférico |
| --- | --- | --- |
| macOS | ve el anuncio `SS·B1` de la Mac | la Mac (central) conecta al GATT de Windows |
| Android | ídem | la tableta (central) conecta |
| Windows ↔ Windows | sí (mismos papeles) | sí |
| Linux (LNX1109B) | ídem | ídem |

L2CAP solo entre Android y Mac (§15); con Windows en el enlace, GATT.

### 16.5 · Pruebas

`win_p2p_logica::ble`: UUID ↔ bytes, direcciones, ids `c:`/`p:`, paquete de PDU y de notificación, estados de la radio
y sus motivos, interruptor. `cargo check --lib --target x86_64-pc-windows-msvc` limpio. La CI de `windows-latest`
compila el resto.

### 16.6 · Lo que debe confirmar un PC con Windows real (pendiente)

1. Que el adaptador acepte **a la vez** `GattServiceProvider` anunciando y el `BluetoothLEAdvertisementPublisher` del
   UUID rotatorio (algunos controladores solo dejan un anuncio): si no, la Mac no vería a Windows y habría que anunciar
   solo el servicio y filtrar por él en los pares.
2. Que `SetMaintainConnection` mantenga el enlace con la ventana minimizada o en segundo plano.
3. Que Windows 10 sin emparejar deje conectar al central de la Mac (sin PIN) y que no salga ningún aviso de emparejado.
4. El `MaxPduSize` real y los kb/s de GATT (`ble kbps=`) frente a macOS.
5. Que la suscripción a SALIDA quede escrita (CCCD) en el primer intento con una Mac y con una tableta.
6. Que el aviso de Privacidad (Dispositivos de radio) aparezca solo la primera vez y que `ble_permiso` lleve a la hoja correcta.

## 17 · Linux (BlueZ por D-Bus) — LNX1109B · 2026-11-09

Alex: «las conexiones compatibles entre sí también deben funcionar, de todo tipo». Linux habla **el mismo protocolo** que
macOS y Android (nada paralelo): servicio y características `53530001/2/3/4-b1e0-4d2a-9c3e-537461727365` (§2), anuncio con el
UUID rotatorio (§3), trama y paquetes de §4, PSM del canal L2CAP en `…0004` y marco `[largo u16 BE][paquete ≤ 4096]` (§15).
Código: `ble_linux.rs` (radio, solo Linux) y `ble_linux_logica.rs` (rutas, direcciones, PSM y errores; puro y probado en
todos los sistemas), enchufado en `ble.rs::radio()` como `ble_macos.rs`.

| Carril | Papel en Linux | Cómo (BlueZ ≥ 5.46 recomendado; ver §17.2) |
|---|---|---|
| `ble-gatt` central | escanea, conecta, GATT cliente | `Adapter1.StartDiscovery` (LE, sin filtro de UUID: BlueZ no admite máscaras; se filtra por el prefijo «SS·B1» al leer `GetManagedObjects` cada segundo) → `Device1.Connect` → `ServicesResolved` → `GattCharacteristic1.AcquireNotify` de SALIDA (un fd por enlace, con su MTU) y `WriteValue` («command») a ENTRADA |
| `ble-gatt` periférico | servidor GATT + anuncio | `GattManager1.RegisterApplication` (ObjectManager + `GattService1` + 3 `GattCharacteristic1` con zbus) y `LEAdvertisingManager1.RegisterAdvertisement` (`Type=peripheral`, solo el UUID rotatorio; se re-registra al rotar). SALIDA se sirve con `AcquireNotify` (BlueZ da `device` y `mtu`: un enlace por central); si BlueZ usa `StartNotify`, difusión al único central conectado sin enlace |
| `ble-l2cap` | los dos papeles | socket `AF_BLUETOOTH`/`SOCK_STREAM`/`BTPROTO_L2CAP` (LE CoC, **sin cifrar por el aire**, como en macOS/Android; el cifrado va por encima, CIF1108A). Periférico: `bind` con PSM 0 (el kernel asigna uno dinámico 0x80–0xFF), `getsockname` → se publica en `…0004`, `accept` solo del central que ya tiene enlace GATT. Central: lee `…0004` y `connect` con el `AddressType` de `Device1`. Un hilo por canal, `poll` cada 5 ms, escrituras parciales con `ble_l2cap::Salida` |

**17.1 · Estados y `motivo`** (`ble_linux_logica::clasificar_error`, probado): sin BlueZ/`bluetoothd` → `no-disponible`
(«instala bluez y activa el servicio `bluetooth`»); sin adaptador → `no-disponible`; apagado o rfkill → `apagada`
(«`rfkill unblock bluetooth` / `bluetoothctl power on`», se recupera solo al encenderlo); sin permiso D-Bus/polkit →
`sin-permiso` («grupo `bluetooth` o sesión local»); bus de sistema inalcanzable (Flatpak/Snap sin `--system-talk-name=org.bluez`)
→ `no-disponible`. Se reintenta cada 5 s. **Interruptor de emergencia: `STARSEED_SIN_BLE_LINUX=1`** (la radio no arranca).
Mismos eventos (`ble://mensaje`, `ble://cambio`) y mismos hitos de `enlaces.log` (`enlace-abierto`, `mtu`, `servicios-descubiertos`,
`suscrito`, `sin-suscripcion`, `l2cap-psm`, `l2cap-abierto`/`cerrado`, `primer-dato-recibido`…): los escribe el núcleo.

**17.2 · Dependencias y límites.** Sin crates nuevas en el árbol: `zbus` 5.19 (Rust puro, ya en `Cargo.lock` por
notify-rust/xcap) y `libc`. `bluer` se descartó: pide `libdbus-1-dev` (libdbus-sys) y todo tokio. Límites honestos: BlueZ <
5.46 no tiene `AcquireNotify` de cliente (el enlace central se rechaza con `sin-suscripcion`); sin `MTU` en la
característica (BlueZ < 5.62) el paquete GATT es de 20 B hasta que el otro lado lo suba; un kernel sin L2CAP LE CoC deja el
enlace en GATT.

**17.3 · Interoperabilidad esperada.** Linux ↔ Android y Linux ↔ Mac: ambos papeles (Linux central de un Android/Mac
periférico, y Linux periférico de un Android/Mac central), con carril rápido L2CAP si los dos publican PSM. Linux ↔ Linux y
Linux ↔ Windows (WIN1109B usa los mismos UUID). Hasta que un PC real lo confirme (§17.4) está **compilado y probado en lo
puro y en la forma de la aplicación GATT sobre un bus D-Bus real** (`la_app_gatt_se_ve_como_la_espera_bluez`), no contra
una radio.

**17.4 · Lo que necesita un PC real (pendiente).** (1) Versión de BlueZ (`bluetoothd -v`) y que `AcquireNotify` funcione en
cliente y en servidor; (2) que la Mac/Android vea el servicio y se suscriba a SALIDA del PC, y que el PC escriba en el suyo;
(3) el PSM dinámico del `bind` con PSM 0 y la apertura Linux ↔ Android/Mac (`enlaces.log`: `l2cap-abierto psm=…`);
(4) cuántos anuncios simultáneos admite el adaptador (`LEAdvertisingManager1.SupportedInstances`); (5) que el usuario no
necesite emparejar; (6) el consumo del sondeo de 1 s a `GetManagedObjects` en un escritorio con muchos dispositivos BLE.

**17.5 · Llamadas y empaquetado en Linux.** La app enciende en WebKitGTK `enable-media-stream`, `enable-webrtc`,
`enable-mediasource`, `enable-media-capabilities` y `enable-webaudio` (`permisos_medios::encender_medios_linux`); los
permisos de cámara/micrófono/pantalla del origen propio los concede `Builder::on_permission_request` (wry conecta la señal
`permission-request` de WebKitGTK). WebRTC de WebKitGTK usa GStreamer: hacen falta `webrtcbin` y `dtlssrtpenc`
(gst-plugins-bad), `nicesrc` (libnice: `gstreamer1.0-nice`), `opusenc` (base) y `vp8enc`/`rtpvp8pay` (good). En Debian/Ubuntu:
`gstreamer1.0-plugins-base gstreamer1.0-plugins-good gstreamer1.0-plugins-bad gstreamer1.0-nice`. Al arrancar se comprueba con
`gst-inspect-1.0 --exists` y, si falta algo, queda en el registro (`[llamadas] …`). WebCodecs y AudioWorklet son lo que ofrezca
cada WebKitGTK (WebCodecs, sobre todo, falta o está tras bandera en WebKitGTK < 2.46): el motor web hace detección de
características (`codec-web.ts`) y, sin `VideoEncoder`/`VideoDecoder`, el vídeo por canal de datos cae a JPEG y la voz a ADPCM.

**17.6 · Proxy del navegador (puerta de internet).** `puerta_proxy_local({puerto})` en Linux llama a
`WebKitWebsiteDataManager::set_network_proxy_settings(Custom, http://127.0.0.1:<puerto>, ignore_hosts = localhost, 127.0.0.1,
::1, *.localhost)` en caliente y para todo el almacén de datos (iframes incluidos); `null` vuelve a `Default` (el proxy del
sistema). Capacidad `soportado=true` en `linux` (apagable con `STARSEED_SIN_PROXY_PUERTA=1`).
