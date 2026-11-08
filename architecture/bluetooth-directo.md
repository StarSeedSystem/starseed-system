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
| Windows, Linux, iOS | — | Sin radio en esta app: `ble_estado` dice «no-disponible» con su motivo (§9) |

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

- **Windows y Linux**: sin radio. `btleplug` solo hace de central (sin papel periférico ni servidor GATT):
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
