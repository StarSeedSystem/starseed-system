# Contrato · Enlace Wi-Fi directo entre neuronas, sin router (2026-11-08 · WFD1108A)

Petición de Alex: «P2P sin router debe ser directo entre las antenas de los aparatos, no por una red
externa». Para lo pesado (archivos grandes, llamadas, pantalla, transmisiones) StarSeed OS abre SOLO una
red Wi-Fi entre dos neuronas, sin router y sin que nadie se una a mano a un punto de acceso. Encima corre,
sin cambios, el transporte local de siempre: el canal TCP 47071 de la app nativa (`malla_local.rs`) y el
WebRTC señalizado por él (`red-local-nativa*.ts`, `senal-nativa.ts`).

## 1 · Piezas

| Pieza | Archivo | Qué hace |
|---|---|---|
| Protocolo (puro) | `src/lib/malla/enlace-wifi-directo.ts` | Capacidades, roles, mensajes, credenciales, confianza y máquina de estados (`pasoWifi`) |
| Orquestación (pura) | `src/lib/malla/enlace-wifi-orquestacion.ts` | Cuándo abrir/proponer/nada, ajuste, registro de enlaces activos, textos de la interfaz |
| Motor | `src/lib/malla/enlace-wifi-motor.ts` | Firma, cifra, manda, recibe, habla con lo nativo; vías de control registrables; hooks de la interfaz |
| Rust puro | `native/src-tauri/src/enlace_wifi_logica.rs` | Capacidades por plataforma, archivos con Kotlin, validación (SSID, WPA2, sesión, IP) |
| Comandos Tauri | `native/src-tauri/src/enlace_wifi.rs` | `enlace_wifi_*` y el evento `enlace-wifi://estado` |
| macOS | `native/src-tauri/src/enlace_wifi_macos.rs` | CoreWLAN (objc2): unirse, volver a la red de antes; Ubicación |
| Android (Kotlin) | `native/src-tauri/android/EnlaceWifiDirecto.kt` | Punto de acceso local, grupo Wi-Fi Direct (dueño) y unirse a uno (cliente); permisos |
| Parche Android | `native/src-tauri/src/enlace_wifi_parche.rs` (+ `build.rs`) | Permisos, proveedor `ArranqueEnlaceWifi` y el Kotlin en el proyecto que genera Tauri |
| Interfaz | `src/components/malla/banda-enlace-wifi.tsx`, `src/components/settings/neurons/ajuste-enlace-wifi.tsx`, `src/ai/astraura/mesh/senales-enlace-wifi.ts` | Chat y ficha de la neurona, Ajustes › Neuronas › Medios, Radar y Señales |

## 2 · Protocolo de negociación

Cuatro mensajes de control. Viajan por CUALQUIER enlace que ya llegue a esa neurona: primero las vías
registradas con `registrarViaControlWifi` (Bluetooth LE de BLE1108A: la que prueba que está al lado) y, si
no, el transporte universal, canal de aplicación `enlace-wifi` (red local nativa, malla de la cuenta,
vínculo entre cuentas o relé cifrado del servidor). En el cable:

```json
{ "t": "enlace.wifi.<tipo>", "s": <sobre firmado v2 de mesh-identity: { v: 2, b: <mensaje>, ts, nonce, s, k, f }> }
```

El `t` de fuera tiene que ser el de dentro (`b.t`). El sobre se verifica (firma ECDSA de la identidad de
malla + guarda contra repeticiones por huella, instante y nonce) y SOLO se atiende si el remitente es de
confianza (`remitenteDeConfianza`): neurona vinculada con esa misma huella, ligada por el canal local con
esa huella (vínculo o prueba de cuenta, MLL1107A) o llegada por la malla de la cuenta. Lo demás se ignora
sin contestar.

| Mensaje | De → a | Campos (todos llevan `v: 1, sesion, de, para, ts`) |
|---|---|---|
| `enlace.wifi.oferta` | quien necesita el ancho → la otra | `cap` (capacidades), `epub` (clave pública ECDH P-256 JWK, sin `d`), `clase` (`archivo`·`llamada`·`pantalla`·`flujo`·`manual`), `nombre` |
| `enlace.wifi.respuesta` | la otra → quien ofreció | `acepta`; si no: `motivo` (`nunca`·`persona`·`sin-capacidad`·`ocupada`·`sin-confianza`·`version`); si sí: `cap`, `epub`, `roles` |
| `enlace.wifi.listo` fase `red` | punto de acceso → cliente | `cred`: sobre v3 de `recipient-crypto.ts` (ECDH efímero → HKDF-SHA256 → AES-GCM-256) para la `epub` del cliente con `{ ssid, clave, banda, ipAp, puerto: 47071, metodo, caduca }` |
| `enlace.wifi.listo` fase `unida` | cliente → punto de acceso | `ip` (la del cliente en la red nueva), `mbps` (radio del cliente, si su sistema la da) |
| `enlace.wifi.cierre` | cualquiera | `motivo` (`persona`·`inactivo`·`plazo`·`permiso-denegado`·`sin-soporte`·`fallo-nativo`·`no-encontrada`·`credenciales`·`roles`·`rechazo`·`sustituida`) |

**Las credenciales NUNCA van en claro**: `leerMensajeWifi` descarta un `listo` de fase `red` sin sobre v3;
el estado del motor, la instantánea de la interfaz, `estado.json` y `enlace_wifi_estado` no llevan la
contraseña. Vive en `credenciales.json` del punto de acceso (carpeta privada de la app, se borra al
cerrar y al arrancar) y, en el cliente, en memoria lo justo para unirse (en la vía guiada del Mac, en
pantalla para la persona de ESE aparato).

### 2.1 · Roles (`elegirRoles`, determinista: las dos neuronas calculan lo mismo)

Un cliente `wifi-direct` (Android) solo entra sin preguntar en un grupo `wifi-direct`; un cliente
`corewlan`/`guiado` entra en cualquiera (un grupo Wi-Fi Direct es una red WPA2 normal). Puntos: Android de
punto de acceso +100; Wi-Fi Direct ↔ Wi-Fi Direct +50 (las dos conservan su Wi-Fi de casa); punto de acceso
local ↔ CoreWLAN +40 (Android ↔ Mac); Wi-Fi Direct ↔ CoreWLAN +30; punto local ↔ guiado +20; Wi-Fi
Direct ↔ guiado +10; cliente con una sola radio −20; permiso por preguntar −3. Empate: punto de acceso la
neurona de id menor. Sin combinación (dos Mac, Wi-Fi apagado, permiso denegado) → `null` y se sigue por el
enlace de antes. Quien ofreció comprueba los roles que eligió el otro (`rolesValidos`).

### 2.2 · Máquina de estados (`pasoWifi`, una negociación a la vez: hay una radio)

```
inactivo ─abrir→ ofreciendo ─respuesta sí→ abriendo-red (soy AP) ─red-lista→ esperando-union ─listo unida→ activo
                            └respuesta sí→ esperando-red (soy cliente) ─listo red (descifrado)→ uniendo ─unida→ activo
inactivo ─oferta (Automático)→ abriendo-red | esperando-red
inactivo ─oferta (Preguntar)→ decidiendo ─persona sí→ abriendo-red | esperando-red   (no / plazo → cerrado + respuesta «persona»)
cualquier fase ─cierre del otro / error nativo / plazo→ fallido (respaldo) · activo ─cierre/inactividad→ cerrado
```

Plazos (`PLAZOS_WIFI`): respuesta 15 s, persona 45 s, levantar la red 30 s, esperar la red 45 s, unirse
60 s (guiado 180 s), esperar al cliente 75 s (+180 s si es guiado). Al vencer: `cierre` al otro, se apaga
lo nativo y la acción `respaldo` dice «Enlace Wi-Fi directo: … Se sigue por el enlace de antes.».
Ofertas cruzadas: queda la de la neurona de id menor. Ocupada con otra neurona: `respuesta` «ocupada».
Inactividad: quien lo pidió lo cierra tras 5 min sin uso (cola del canal nativo, flujos vivos retenidos con
`retenerFlujo`); la otra solo tras 15 min (por si quien lo pidió desapareció sin cerrar).

## 3 · Una vez dentro

El motor da a la red nativa una **pista** («esa neurona está en esa IP», `RedNativa.pista`, 30 min): se la
saluda (`nl.hola` firmado) en la IP de la red directa y, mientras dure la pista, esa neurona se busca SOLO
ahí (no por el router de casa). Además, el faro de cada app sale por multicast y por difusión
(255.255.255.255) y contesta en directo a quien oye (MLL1107A): el Mac, en la red del Android, le llega por
difusión y el Android le contesta por unicast. El canal TCP 47071 escucha en `0.0.0.0` y admite IPs
privadas: la red directa (192.168.49.x de Wi-Fi Direct, 192.168.x.x/10.x del punto de acceso local) lo es.
Encima, la señalización WebRTC de siempre abre el enlace local por el que van llamadas, pantalla y flujos.
Al cerrar se quita la pista.

## 4 · Permisos y realidad de cada sistema

### 4.1 · Android (app StarSeed OS; Kotlin inyectado por `build.rs`, interruptor `STARSEED_SIN_ENLACE_WIFI_ANDROID=1`)

- **Punto de acceso local** (`WifiManager.startLocalOnlyHotspot`, Android 8+): sin internet, nombre y
  contraseña al azar que elige Android (≥ 11: `softApConfiguration`; 8–10: `wifiConfiguration`). La IP se
  saca de la interfaz nueva que aparece (o de su nombre `swlan*`/`ap*`/`softap*`/`wlan1`). Falla con el
  punto de acceso con datos encendido (`ERROR_INCOMPATIBLE_MODE`). En aparatos sin STA+AP a la vez,
  Android puede soltar el Wi-Fi de casa mientras dura (depende del chip: prueba en aparato).
- **Grupo Wi-Fi Direct** (dueño): Android 10+ con `WifiP2pConfig.Builder` (nombre `DIRECT-xy-StarSeed`,
  contraseña de 16 caracteres al azar); antes, el grupo autónomo con los del sistema. IP 192.168.49.1.
  Conserva el Wi-Fi de casa en casi todos los aparatos.
- **Unirse a un grupo** (cliente): Android 10+ con `connect(config con nombre y contraseña)`, sin que nadie
  pulse nada. A una red normal Android no se une sin preguntar: por eso entre dos Android va Wi-Fi Direct.
- Permisos en el manifiesto (bloque `STARSEED-ENLACE-WIFI`): `ACCESS_WIFI_STATE`, `CHANGE_WIFI_STATE`,
  `ACCESS_NETWORK_STATE`, `NEARBY_WIFI_DEVICES` (`neverForLocation`), `ACCESS_FINE_LOCATION`
  (`maxSdkVersion="32"`), `uses-feature android.hardware.wifi.direct required="false"`.
- En tiempo de ejecución: «Dispositivos cercanos» (13+) o «Ubicación» (≤ 12). Se pide con la app a la
  vista (`enlace_wifi_permiso` o al abrir/unirse); la acción espera y sigue al volver. Texto claro en
  Ajustes y en el error: Android la exige para redes Wi-Fi; StarSeed no usa la ubicación. Hasta Android 12
  el punto de acceso puede fallar con la Ubicación del aparato apagada (se dice).

### 4.2 · macOS (siempre cliente)

- macOS no da Wi-Fi Direct ni API para levantar un punto de acceso. Se une con **CoreWLAN**
  (`CWWiFiClient.sharedWiFiClient.interface` → `scanForNetworksWithName:error:` →
  `associateToNetwork:password:error:`), objc2 0.6 que ya estaba en el árbol; cada selector se comprueba
  con `respondsToSelector:`.
- Desde macOS 14 CoreWLAN no da nombres de red sin **Ubicación**: `CLLocationManager
  requestWhenInUseAuthorization` (+ `NSLocationWhenInUseUsageDescription` y `NSLocationUsageDescription`
  en `Info.plist`). Sin ella, o si la red no aparece tras 5 búsquedas, la **vía guiada**: la banda enseña
  «Únete a la red «StarSeed-xxxx»» con nombre y contraseña para copiar y `enlace_wifi_comprobar` (TCP al
  47071 del Android desde una IP de su misma /24) detecta sola que ya está dentro.
- **Una sola radio**: mientras dura, el Mac deja su red de casa (sin internet por Wi-Fi). Se avisa siempre
  (propuesta, pregunta, banda activa, Ajustes). Al cerrar: `disassociate`, 8 s para que macOS vuelva solo a
  una red conocida; si no, la de antes con contraseña `nil` (la pone el llavero del sistema si la conoce);
  si no, apagar y encender el Wi-Fi (macOS se une a sus redes conocidas); si nada, se dice «elígela en el
  menú Wi-Fi». La contraseña de la red de casa nunca se lee ni se guarda.
- Si la app se firma algún día con *hardened runtime*, hará falta el derecho
  `com.apple.security.personal-information.location`.

### 4.3 · macOS ↔ macOS, Windows, Linux, iOS

- Dos Mac: sin punto de acceso no hay red directa (`elegirRoles` → `null`). En la misma red ya van por el
  canal local; sin red común, AWDL / Multipeer Connectivity sería el camino (no construido: necesita
  `MCSession` con su propio transporte, no un enlace IP para el TCP 47071).
- Windows y Linux: `enlace_wifi_capacidades` dice «aún no» (sin métodos). Windows tendría Wi-Fi Direct
  (`WiFiDirectAdvertisementPublisher`) y punto de acceso (`NetworkOperatorTetheringManager`); Linux,
  NetworkManager (`nmcli dev wifi hotspot` / `connect`). Otra ola.
- iOS: sin API pública para levantar redes; `NEHotspotConfiguration` une pidiendo confirmación. Otra ola.

## 5 · Orquestación y ajuste

`decidirEnlaceWifi` (puro): **nada** si ya hay uno en marcha, ajuste «Nunca», esta app (o la otra) no
puede, ya vais por la misma red (`red-local`/`wifi-directo`), archivo < 8 MiB, el enlace de ahora ya da el
ancho de la clase (archivo 8 Mb/s, llamada 1,5, pantalla 4, flujo 6), no hay proximidad probada (vía
`cercana` registrada: Bluetooth LE) o falló con esa neurona hace < 2 min. Si no: **abrir** (Automático) o
**proponer** (Preguntar: la banda enseña «Abrir enlace Wi-Fi directo»). En el Mac va siempre el aviso de la
radio única. Lo llaman el transporte universal al mandar un archivo (`enviarArchivo`) y al poner un flujo
(`abrirFlujo`, que además lo retiene mientras viva). A mano: «Abrir enlace Wi-Fi directo» en la ficha de la
neurona vinculada (`PanelVinculo`).

Ajuste por aparato en **Ajustes › Neuronas › Medios** (`AjusteEnlaceWifi`): Automático / **Preguntar**
(por defecto: en un Mac deja la red de casa) / Nunca. Con «Nunca» también se rechazan las ofertas.

## 6 · Interfaz

- Pastilla de la vía: `Mesh · Wi-Fi directo (sin router) · N ms ✓` (la vía guarda `ruta: "wifi-directo"`
  al salir o entrar por `nativo:<ip>` del otro en la red directa; `detalleVia` → «Wi-Fi directo entre las
  dos neuronas (sin router)»).
- Radar y Señales: la señal de la neurona (por id o `lan:<ip>`) gana «Enlace Wi-Fi directo: activo · N
  Mb/s · sin router», «Red directa» y su IP; la colocación lo dice.
- Chat de la neurona y su ficha: «Enlace Wi-Fi directo: activo · N Mb/s» (o «sin medir») con «Cerrar»;
  la fase en marcha; la pregunta; la propuesta; el fallo y el respaldo; la vía guiada del Mac.
- N Mb/s es la velocidad de la radio que da el sistema (CoreWLAN `transmitRate` en el Mac; el Android la
  recibe en el `listo` fase `unida`). Android no da la de sus clientes: si no hay Mac, «sin medir».

## 7 · Comandos nativos

| Comando | Devuelve | Notas |
|---|---|---|
| `enlace_wifi_capacidades` | `{ plataforma, ap[], cliente[], permiso, radio_unica, wifi, motivo }` | Android: de `puente.json`; macOS: CoreWLAN + Ubicación |
| `enlace_wifi_permiso` | lo mismo | Pide el permiso (el cambio llega por evento) |
| `enlace_wifi_abrir_ap { sesion, metodo }` | `EstadoEnlaceWifi` | Solo Android |
| `enlace_wifi_credenciales { sesion }` | `{ ssid, clave, banda, ip }` o null | Solo las del punto de acceso de ESA sesión |
| `enlace_wifi_unirse { sesion, metodo, ssid, clave, ipAp? }` | `EstadoEnlaceWifi` | Android `wifi-direct`; macOS `corewlan`/`guiado` |
| `enlace_wifi_estado` | `EstadoEnlaceWifi` | Sin contraseña |
| `enlace_wifi_cerrar { sesion }` | `EstadoEnlaceWifi` | Android apaga; el Mac vuelve a su red |
| `enlace_wifi_comprobar { ip, puerto? }` | `{ alcanzable, ip_local, ms }` | TCP al 47071 desde una IP de la misma /24 |

Evento `enlace-wifi://estado` cuando cambia lo nativo. Android: `filesDir/starseed/enlace-wifi/`
(`peticion.json` Rust→Kotlin, borrada al leerla; `estado.json`, `puente.json`, `credenciales.json`
Kotlin→Rust). Los permisos `allow-enlace-wifi-*` van en `capabilities/default.json`.

## 8 · Plan de pruebas

Automáticas (sin aparatos):
- `NODE_ENV=test npx vitest run src/lib/malla/__tests__/enlace-wifi-*.test.ts src/components/malla/__tests__/banda-enlace-wifi.test.tsx`:
  roles, mensajes (nunca en claro), credenciales, confianza, máquina (éxito, plazos, rechazo, «Preguntar»,
  permiso denegado, credenciales que no se abren, cruce, ocupada, inactividad), motor con dos neuronas
  (cifrado real ECDH/AES-GCM, vía BLE registrada, vía guiada, sin camino, remitente sin confianza, flujo
  vivo), sobre real de `recipient-crypto`, orquestación, pastilla, Radar y la banda.
- `cargo test --lib` (en `native/src-tauri`): lógica pura, parche de Android (idempotente, punto fijo con
  los otros tres parches, Kotlin ↔ Rust con los mismos archivos, acciones, campos y fases).

En aparato (lo que no se puede probar aquí):
1. Android 13+ ↔ Mac (macOS 14+): Automático; mandar un archivo de 200 MB a la neurona del Mac con BLE cerca
   → macOS pide «Ubicación» la primera vez → el Mac se une solo → pastilla «Wi-Fi directo (sin router)» →
   velocidad real → «Cerrar» → el Mac vuelve a su red de casa (anotar si lo hizo solo, por el llavero o por
   el apagado/encendido).
2. Lo mismo con «Ubicación» denegada → vía guiada (copiar nombre y contraseña, unirse desde el menú Wi-Fi,
   detección automática).
3. Android 10+ ↔ Android 10+: grupo Wi-Fi Direct, los dos conservan el Wi-Fi de casa; llamada de vídeo por
   el enlace directo (WebRTC) y cierre por inactividad a los 5 min de colgar.
4. Android 8/9 de punto de acceso (punto local) y Android 12 con la Ubicación del aparato apagada (error claro).
5. Permiso denegado para siempre en Android → «permiso denegado» en Ajustes y «Volver a pedir».
6. Punto de acceso con datos encendido en el Android → error claro y respaldo.
7. Medir: tiempo hasta «activo», Mb/s de la radio frente a lo medido en un archivo, y que la pista lleva el
   canal TCP por la red directa (pastilla y `malla_local_estado`).
