# Contrato · Enlace Wi-Fi directo entre neuronas, sin router ni hotspot (2026-11-08 · WFD1108A · reescrito 2026-11-09 · WFA1109A)

Petición de Alex: «P2P sin router debe ser directo entre las antenas de los aparatos, no por una red
externa». Para lo pesado (archivos grandes, llamadas, pantalla, transmisiones) StarSeed OS abre SOLO una
red Wi-Fi entre dos neuronas, sin router y sin que nadie se una a mano a un punto de acceso. Encima corre,
sin cambios, el transporte local de siempre: el canal TCP 47071 de la app nativa (`malla_local.rs`) y el
WebRTC señalizado por él (`red-local-nativa*.ts`, `senal-nativa.ts`).

## 0 · El modelo (WFA1109A · corrección de Alex, 09-11)

Alex: «debe ser Wi‑Fi directo sin hotspot, más bien mesh P2P». WFD1108A resolvía Mac ↔ Android con un punto de
acceso del Android al que el Mac se unía con CoreWLAN **dejando su Wi‑Fi de casa**. Eso ya no es el camino normal.

### 0.1 · La realidad física (se dice tal cual en la interfaz)

- **Android ↔ Android: P2P de verdad, sin punto de acceso.** Wi‑Fi Aware (NAN: publicar/suscribir + ruta de datos
  con IPv6 de enlace local) o, si falta Aware, Wi‑Fi Direct **concurrente** con el Wi‑Fi de casa. Nunca el hotspot local.
- **Apple ↔ Apple: AWDL.** Network.framework con peer‑to‑peer y Bonjour `_starseed-p2p._tcp`. Conserva el Wi‑Fi de infraestructura.
- **Mac ↔ Android: NO hay Wi‑Fi P2P común.** Apple solo expone AWDL; Android solo Aware/Wi‑Fi Direct. Su enlace directo es
  **Bluetooth** (con el carril rápido L2CAP de BLE1109A). El punto de acceso sigue siendo posible, pero solo con permiso
  explícito de las dos neuronas, porque cuesta el Wi‑Fi del Mac.

### 0.2 · Tabla por pareja (`decidirParP2p`, `src/lib/malla/wifi-p2p.ts`)

| Pareja | Enlace pesado | Capacidad que lo habilita | Qué pasa sin él |
|---|---|---|---|
| Android ↔ Android | Aware > Wi‑Fi Direct concurrente | `wifi-aware`, `wifi-direct-concurrente` | Bluetooth |
| Mac ↔ Mac (y, documentado, iOS ↔ Mac/iOS) | AWDL | `awdl` en las dos | Bluetooth |
| Mac ↔ Android | **ninguno** → Bluetooth | — | Bluetooth (ligero + carril BLE1109A) |
| Mac ↔ Android con permiso de las DOS | red directa por punto de acceso | `punto-acceso-optin` en las dos | Bluetooth |
| Linux ↔ Android (LNX1109B) | Wi‑Fi Direct (Linux como GO, o Linux cliente en una 2.ª tarjeta) | `wifi-direct-concurrente` en las dos | Bluetooth (BlueZ + L2CAP, bluetooth-directo.md §16) |
| Linux ↔ Windows / Linux ↔ Linux (LNX1109B) | Wi‑Fi Direct estándar (uno GO, otro cliente por nombre y contraseña) | `wifi-direct-concurrente` en las dos | Bluetooth |
| Linux ↔ Mac | **ninguno** → Bluetooth (Apple solo habla AWDL) | — | Bluetooth (ligero + carril rápido) |

Las cuatro cadenas viajan en `cap.lanas` de las capacidades (`enlace.wifi.oferta/respuesta`, y en una respuesta de
rechazo también): una app anterior no las trae y se la trata como WFD1108A (Android con Wi‑Fi Direct de los dos lados =
`wifi-direct-concurrente`; nada de punto de acceso mientras no lo anuncie). `elegirRoles/rolesValidos` excluyen
`corewlan`/`guiado` si no están los dos permisos. El ranking del planificador (`planificarVias`, `elegirEnlaces`) ya pone
cualquier enlace `nativo:` (incluidos `nativo:awdl:<huella>` y `nativo:fe80::…%iface`) por encima de BLE para lo pesado.

### 0.3 · Wi‑Fi Aware (Android ↔ Android) — construido

- Kotlin: `android/WifiAwareStarSeed.kt` (SDK 29+, `FEATURE_WIFI_AWARE`, `ACTION_WIFI_AWARE_STATE_CHANGED`). Servicio
  `starseed-malla`; el aviso son 9 bytes: versión (1) + huella de 8 bytes de la neurona (`sha256("starseed-malla:v1:<id>")`). Sin secretos.
- Reutiliza la máquina de estados de WFD1108A: método nuevo `wifi-aware` (rol «ap» = quien publica, «cliente» = quien se
  suscribe). Quien publica genera una contraseña por sesión (20 caracteres) y la manda **cifrada** por el canal firmado
  (`enlace.wifi.listo`, igual que las credenciales de WFD1108A). Quien se suscribe encuentra la huella esperada, escribe un
  «hola» (versión + su huella) y pide la ruta de datos como iniciador; el publicador la abre como respondedor.
- Direcciones: `WifiAwareNetworkInfo.peerIpv6Addr` + la interfaz de la `LinkProperties` → `fe80::…%aware_data0`
  (`ip_otro`/`ip_propia` en el estado). La web las valida con `ipEnlaceLocalV6` (forma canónica, solo `fe80::/10` con ámbito;
  espejo de `ip_p2p` en Rust).
- Canal: un segundo oyente TCP **`[::]:47073`** (`PUERTO_P2P`, mismo protocolo, buzón y limitador que 47071; el socket IPv4
  de Android ya ocupa 47071). El motor da a `RedNativa` la pista `fe80::…%iface` con el puerto 47073.
- Permisos: `NEARBY_WIFI_DEVICES` (13+, `neverForLocation`) / `ACCESS_FINE_LOCATION` (≤12), los mismos que ya pide el
  primer arranque (PER1108A: «Dispositivos cercanos»; solo cambió su texto). Función `android.hardware.wifi.aware` `required=false`.
- Interruptor: `STARSEED_SIN_WIFI_AWARE=1` (en el entorno del build: el Kotlin sale como una variante vacía con la misma API y
  el puente dice `aware:false`; en ejecución, `aware_activo`/`lanas_android` lo respetan).
- **Sin verificar en aparato** (Kotlin no se compila en local; lo compila CI): la ruta de salida del socket sin enlazar a la
  `Network` de Aware depende del enrutado `local_network` de Android; si algún aparato no la tuviera, el respaldo sería un
  puente por la `Network` (no construido).

### 0.4 · Wi‑Fi Direct concurrente (Android ↔ Android sin Aware) — reutiliza WFD1108A

Es el grupo Wi‑Fi Direct de `EnlaceWifiDirecto.kt` (dueño/cliente), que en la mayoría de aparatos convive con el Wi‑Fi de casa.
Se anuncia como `wifi-direct-concurrente`. Entre dos Android ya no se usa el punto de acceso local. No se demostró la
concurrencia aparato por aparato: si el sistema apaga el Wi‑Fi de casa, el aviso de «una sola radio» de WFD1108A sigue vigente.

### 0.5 · AWDL (Apple ↔ Apple) — construido para macOS, iOS documentado

- `src/awdl_macos.rs`: Network.framework por `dlsym` (macOS 10.15+; sin el símbolo → «no disponible», sin caída). Escucha y
  anuncia `_starseed-p2p._tcp` con peer‑to‑peer y busca vecinos igual. Comandos `awdl_iniciar(neurona)`, `awdl_detener`, `awdl_estado`.
- Vecinos como dirección virtual `awdl:<huella de 16 hex>` (nombre de servicio derivado del id de neurona). Una conexión por
  mensaje: [preámbulo `AWDL1:<huella>\n`] + trama estándar `SSM1` + trama de acuse. El preámbulo solo es una etiqueta de
  ruteo; la identidad la prueba el saludo firmado y la sesión CIF1108A, exactamente igual que por TCP. Se entrega a
  `malla_local` (`entregar_externo`: mismo buzón, limitador, avisos y eventos) y `vecinos_locales` suma los vecinos AWDL.
- Interruptor `STARSEED_SIN_AWDL=1`. La web lo enciende una vez (`nativo.awdl`) cuando la capacidad trae `awdl`.
- iOS: mismas API (`nw_*`), mismo servicio y mismo protocolo; no hay app iOS en este repositorio: **solo documentado**.

### 0.6 · Punto de acceso: opt‑in, apagado por defecto

- Ajustes › Neuronas › Medios: «Permitir red directa por punto de acceso (la Mac deja su Wi‑Fi mientras dure)».
  Por aparato; clave `starseed.neuronas.medios.punto-acceso.v1` ("0"/"1"). Las capacidades de punto de acceso solo se
  muestran y anuncian (`punto-acceso-optin`) si está encendido.
- **Migración** (marca `starseed.neuronas.medios.punto-acceso.migracion` = 1): quien tuviera WFD1108A en «Automático» o
  «Preguntar» queda en «no» una sola vez; lo que la persona elija después no se vuelve a tocar.
- Nombres en la interfaz: «Wi‑Fi P2P (sin router ni hotspot)» para Aware/Wi‑Fi Direct/AWDL y «Red directa por punto de
  acceso» para el opt‑in. La pastilla del enlace: «Wi‑Fi P2P · Aware/AWDL/Wi‑Fi Direct · sin router».
- Ajustes explica una línea por pareja (`TEXTO_PAREJAS`): Android ↔ Android = Aware/Wi‑Fi Direct, Apple ↔ Apple = AWDL,
  Mac ↔ Android = Bluetooth.

### 0.7 · La llamada (LLA1108H) sin hotspot

`decidirEnlaceWifi` devuelve `{accion:"nada", sinP2p:true}` cuando para esa pareja no hay carril sin hotspot (capacidades del
otro conocidas por una oferta/respuesta anterior, o desconocidas y la propia no ofrece nada sin permiso). El motor lo expone
en `instantanea().sinP2p`; `pasoWifiDe` da el paso `sin-p2p`, la llamada **no** llama a `escalarWifi`/`avisarEnvioPesado`
más, no sale ningún aviso de Wi‑Fi y sigue por video ligero por Bluetooth + carril rápido BLE1109A. Para la pantalla
compartida el texto es «La pantalla no cabe por Bluetooth y entre estos aparatos no hay Wi‑Fi P2P sin hotspot».

### 0.9 · Linux (LNX1109B · 2026-11-09): carril `wifi-direct` con roles `go` / `cliente` y `concurrente`

Código: `enlace_wifi_linux.rs` (D-Bus, solo Linux) y `enlace_wifi_linux_logica.rs` (puro y probado). Mismos comandos
(`enlace_wifi_capacidades/_abrir_ap/_credenciales/_unirse/_estado/_cerrar`), mismo evento `enlace-wifi://estado` y la
MISMA negociación firmada `enlace.wifi.*` con las credenciales cifradas por ECDH en `enlace.wifi.listo`: Linux solo pone la radio.

- **GO (`ap`, método `wifi-direct`)**: wpa_supplicant (`fi.w1.wpa_supplicant1.Interface.P2PDevice`): `P2PDeviceConfig`
  (`SsidPostfix=StarSeed`, `GOIntent=15`), `GroupAdd` autónomo (sin grupo persistente) y, con la señal `GroupStarted`,
  `Group.SSID` + `Group.Passphrase` → `DIRECT-xy-StarSeed` con la contraseña WPA2 aleatoria de wpa_supplicant (se valida con
  `ssid_de_grupo_valido`/`clave_valida`; solo viaja por `enlace_wifi_credenciales` → cifrado). El grupo vive en una interfaz
  virtual `p2p-<if>-N`, **en paralelo al Wi‑Fi de casa**. Android 10+ y Windows se unen por nombre y contraseña (los GO admiten
  clientes WPA2). La IP del propietario (192.168.49.1/24 por defecto) la tiene que poner NetworkManager/systemd-networkd en
  esa interfaz; si no hay IP tras 12 s se cierra el grupo con `fallo-nativo` y el motivo (no se anuncia una red muerta).
- **Cliente (`cliente`, método `wifi-direct`)**: NetworkManager `AddAndActivateConnection` de una red WPA2 con ese SSID y
  contraseña (conexión no guardada, `autoconnect=false`; se borra al cerrar), **solo en un dispositivo Wi‑Fi libre**
  (estado «desconectado»: segunda tarjeta o adaptador USB). Si la única está en la red de casa, **no se une** (`sin-soporte`,
  motivo «habría que dejar tu Wi‑Fi de casa»): es la regla de Alex. Con la IP puesta, `ip_ap` (la pista de IP para el canal
  TCP 47071) es la pasarela que dio la red (`Ip4Config.Gateway`) y, si no, 192.168.49.1; la web abre el canal local como siempre.
- **NM `Device.WifiP2P` (DeviceType 30)**: solo se sondea (`StartFind`/`Peers` descubren pares) pero NetworkManager no abre
  grupos con contraseña, así que no es el camino de los carriles; el `motivo` lo dice cuando es lo único que hay.
- **Capacidades** (`enlace_wifi_capacidades`, `lanas` incluye `wifi-direct-concurrente` si hay GO o cliente posible):
  `ap=["wifi-direct"]` si wpa_supplicant ofrece P2P **y** el dispositivo P2P es virtual (`p2p-dev-*`, es decir STA + P2P a la
  vez); `cliente=["wifi-direct"]` si NM tiene un Wi‑Fi libre; `permiso="concedido"`; `radio_unica=true` solo si no hay ninguno
  de los dos. Sin NM ni wpa_supplicant en el bus, sin P2P o sin interfaz virtual: vacío y con `motivo` (nunca se tira la red de
  casa). **Interruptor de emergencia: `STARSEED_SIN_WIFI_DIRECT_LINUX=1`.**
- **Pendiente de un PC real**: versión de wpa_supplicant (≥ 2.6 para `Passphrase`) y que `p2p_disabled` esté a 0; que NM
  gestione/ponga IP en `p2p-<if>-N`; qué chips admiten GO + STA a la vez (`iw list`, «valid interface combinations»); que
  Android 10+ y Windows entren por SSID/contraseña; polkit (NM `network-control` para la sesión local).

### 0.8 · Pasos con aparatos (Alex tiene un Mac y una tableta Android; faltan segundos aparatos)

1. Mac ↔ Android (disponible hoy): ninguna ventana de Wi‑Fi; una llamada con cámara debe quedarse en Bluetooth ligero. Activar
   el permiso del punto de acceso en AMBOS lleva al camino de WFD1108A.
2. Android ↔ Android (necesita otro Android con Aware): ligar por Bluetooth, enviar un archivo grande; la pastilla debe decir
   «Wi‑Fi P2P · Aware · sin router» y el Wi‑Fi de casa seguir conectado. `adb logcat` filtrando `WifiAware`.
3. Mac ↔ Mac (necesita otro Mac): abrir StarSeed en los dos con Bluetooth y Wi‑Fi encendidos (no hace falta estar en la misma
   red); `awdl_estado` debe listar al vecino y la pastilla decir «Wi‑Fi P2P · AWDL · sin router».

Lo que sigue (§1–§9) es WFD1108A y vale **solo** para los métodos `hotspot-local`, `wifi-direct`, `corewlan` y `guiado`; donde
dice que Mac ↔ Android abre el punto de acceso «solo» o por defecto, mandan las reglas de este apartado §0.

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
| P2P puro (WFA1109A) | `src/lib/malla/wifi-p2p.ts`, `punto-acceso-ajuste.ts` | Carriles, decisión por pareja, textos, opt-in del punto de acceso y su migración |
| Wi-Fi Aware (WFA1109A) | `native/src-tauri/android/WifiAwareStarSeed.kt` (+ variante vacía en `enlace_wifi_parche.rs`) | Publicar/suscribir `starseed-malla`, ruta de datos IPv6 |
| P2P Rust (WFA1109A) | `native/src-tauri/src/wifi_p2p_logica.rs`, `awdl.rs`, `awdl_macos.rs`, `malla_local.rs` (oyente `[::]:47073`) | Huellas, tramas, preámbulo AWDL, Network.framework |
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
- Windows: `enlace_wifi_capacidades` dice «aún no» (sin métodos; WIN1109B). Linux: ver §0.9 (LNX1109B). Windows tendría Wi-Fi Direct
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

## 9 · Con el Bluetooth directo (INT1108C · 2026-11-08)

Petición de Alex: dos apps de StarSeed OS sin router ni internet se encuentran solas por Bluetooth, los
mensajes van por ahí al momento y, ante algo pesado, se ofrece el enlace Wi-Fi directo según el ajuste.
Pegamento: `src/lib/malla/puente-ble-wifi.ts` (lo arranca `iniciarSincronizacionNeuronas`, junto a los dos
motores). Pruebas: `src/lib/malla/__tests__/puente-ble-wifi.test.ts` (los dos motores REALES en memoria).

- **Vía de control `ble`**: cada neurona ligada por el Bluetooth directo (`bluetooth-directo.md` §5) es una
  vía registrada con `registrarViaControlWifi`: `cercana: true` (prueba de proximidad), `kbps` = lo medido
  por Rust en ese enlace y `ligaduras()` = las del Bluetooth vigentes. Los cuatro mensajes de §2 viajan tal
  cual como `tu.msg` del canal `enlace-wifi` CLAVADO al enlace (`enviarMensaje({ enlaceId: "ble:<id>" })`);
  el Bluetooth solo entrega `tu.*` de un enlace ligado y el oyente de `iniciarEnlaceWifi` lo recibe con
  origen `{ tipo: "ble" }`. Si la vía no llega, sigue el transporte universal como siempre.
- **Confianza**: `remitenteDeConfianza` recibe también las ligaduras de las vías (`ligadurasDeVias`): una
  neurona de TU cuenta ligada por Bluetooth (saludo firmado con esa huella + prueba de cuenta) negocia sin
  vínculo previo, igual que ligada por el canal local.
- **El control propio de BLE1108A** (`enviarControlEnlace` / `alControlEnlace`, oferta con `modo/ssid/secreto`)
  no se usa: el protocolo de §2 lleva capacidades, `epub`, roles y credenciales ECDH. Queda como estaba.
- **Lo pesado avisa al motor** (`avisarEnvioPesado` → `alNecesitarAncho`) también desde los chats de
  Neuronas, que no pasan por `enviarArchivo`/`abrirFlujo`: un archivo (`archivos-neurona.ts`, una vez por
  archivo aunque el buzón lo reintente), una llamada o la pantalla sin camino (`llamadas-neurona.ts`) y una
  transmisión sin camino (`flujos-neurona.ts`). Decide `decidirEnlaceWifi`: Automático abre, **Preguntar**
  propone, Nunca nada.
- **Aviso de un toque**: con «Preguntar», la propuesta («¿Abrir un enlace Wi-Fi directo con …?» → «Abrir»)
  y la pregunta de la otra neurona («… pide abrir …» → «Aceptar», 45 s) salen como aviso global (sonner),
  además de la banda del chat: quien recibe la pregunta puede no tener ese chat abierto. En el Mac el aviso
  dice siempre que deja su red Wi-Fi mientras dure.
- **Ya activo**: el canal TCP de la red directa (`nativo:<ip>`, rango 0, orden 1) y el WebRTC que señaliza
  (`local:nativo-…`, orden 0) van delante del Bluetooth (orden 2) en `elegirEnlaces`: archivos grandes (el
  Bluetooth no pasa de 20 MB), llamadas, pantalla y transmisiones van solos por la red directa; al cerrarse,
  los mensajes vuelven al Bluetooth (o al router si lo hay).
- **Límite honesto**: un archivo de 8–20 MB que ya empezó por Bluetooth sigue por él aunque el Wi-Fi se abra
  a mitad; uno de más de 20 MB espera en el buzón y su reintento sale por la red directa.

## 9 · La llamada pide el enlace sola (LLA1108H · 2026-11-09)

Caso real 09-11: videollamada Mac ↔ tableta solo con Bluetooth; la voz iba por el enlace de datos (LLA1108E) pero
el log no tenía ningún evento `enlace-wifi`: el motor real de llamadas (`src/lib/llamadas/motor.ts`) no llamaba a
`avisarEnvioPesado`. Ahora sí. Detalle completo en `llamadas-telefonia.md` §9 «Escalada al Wi-Fi directo».

- **Disparo**: `MotorLlamada` (opción `vozDatos.escalarWifi`, cableada en `acciones.ts › extrasDeNeurona`) llama a
  `avisarEnvioPesado({ clave, destino: { neuronDeviceId }, clase: "llamada" | "pantalla", flujo })` cuando contestó
  alguien, el único camino hacia el par no lleva IP y hay cámara, pantalla o la voz va regular/mala. `avisarEnvioPesado`
  admite ahora `flujo` y lo pasa a `alNecesitarAncho` → `retenerFlujo`: el enlace vive mientras la llamada tenga
  pistas vivas y se cierra por las reglas de inactividad de §5 al colgar. `clave` es por llamada.
- **Ajuste**: igual que para archivos y flujos. Automático abre; Preguntar propone con el aviso de un toque en los dos
  aparatos (en el Mac, con «deja tu red de casa mientras dure»); Nunca no abre y la llamada sigue con vídeo ligero.
- **Ruta IP**: `hayRutaIpHacia(neurona)` cuenta como ruta un enlace Wi-Fi directo activo (`enlaceWifiDe`). Al pasar de
  «sin IP» a «con IP», la llamada reinicia ICE y sube de Bluetooth a WebRTC (voz y vídeo) sin colgar (LLA1108E §9).
- **Pasos para la persona** (`pasoWifiDe` sobre `InstantaneaWifi`): abriendo → «Abriendo Wi‑Fi directo…»; propuesta →
  «Acepta abrir el Wi‑Fi directo…»; activo + WebRTC → «Video por Wi‑Fi directo (sin router)».
- **Pruebas**: `src/lib/llamadas/__tests__/escalada-wifi-llamada.test.ts`.
- **Prueba en dispositivos**: Mac y tableta solo con Bluetooth, ajuste en «Preguntar». Videollamada desde la Mac:
  voz por Bluetooth y «Video ligero por Bluetooth (baja resolución)»; aparece la propuesta en los dos; al aceptar,
  «Abriendo Wi‑Fi directo…» y después «Video por Wi‑Fi directo (sin router)» sin cortar la voz. En `enlaces.log`:
  `llamada escalada-wifi … clase=llamada`, `enlace-wifi …`, `llamada medio=webrtc … ruta IP nueva`, `llamada medio=webrtc … vuelve a WebRTC sin cortar`.

## 10 · Windows: Wi-Fi Direct, pasarela del navegador y llamadas (WIN1109B · 2026-11-09)

Windows deja de ser «aún no»: abre y se une a grupos **Wi-Fi Direct estándar** (carril `wifi-direct`), con el mismo
`enlace.wifi.*` firmado y cifrado (§2) que Android; los datos van por el canal TCP 47071 de siempre (§3). Código:
`enlace_wifi_windows.rs` (WinRT) conectado a `enlace_wifi.rs`; lo puro (nombre y contraseña del grupo, IPs, máquina de
estados, capacidades) en `win_p2p_logica.rs::wifi`.

### 10.1 · Capacidades que ve la web (`enlace_wifi_capacidades`)

`plataforma: "windows"`, `ap: ["wifi-direct"]`, `cliente: ["wifi-direct"]`, `lanas: ["wifi-direct", "wifi-direct-concurrente"]`,
`radio_unica: false`, `permiso: concedido | preguntar | denegado`, con `motivo` si no hay adaptador, el Wi-Fi está apagado,
Windows deniega la radio (Privacidad) o `STARSEED_SIN_WIFI_DIRECT_WINDOWS=1`. La comprobación corre en un hilo y se
repite cada ~20 s; mientras no termina, `motivo` = «Comprobando…» sin roles. `wifi-direct-concurrente` se anuncia mientras
haya Wi-Fi encendido: el grupo de Windows va por el adaptador virtual de Wi-Fi Direct y **no suelta el Wi-Fi de casa**
(a confirmar en aparato, §10.4). No hay `hotspot-local` en Windows (usaría la radio de casa).

### 10.2 · Papeles

- **Dueño del grupo (`ap`)**: `WiFiDirectAdvertisementPublisher` con `IsAutonomousGroupOwnerEnabled`, `LegacySettings`
  (`DIRECT-xy-StarSeed`, `xy` al azar; contraseña de 16 alfanuméricos del CSPRNG de Windows) y
  `WiFiDirectConnectionListener`. Android 10+ y Linux se unen por nombre y contraseña. La contraseña solo sale por
  `enlace_wifi_credenciales` hacia la web, que la cifra con ECDH en `enlace.wifi.listo` fase `red`; nunca va en el
  estado, en eventos ni en el registro. IP del dueño: 192.168.137.1 o 192.168.49.1 (la que tenga el equipo).
- **Cliente (`cliente`)**: se une a un grupo `DIRECT-xy-…` (Android, Linux o Windows). Primero como dispositivo
  `WiFiDirectDevice` si el grupo se ve así; si no, como red por un `WiFiAdapter` **distinto del de casa**
  (`ConnectWithPasswordCredentialAsync`, reconexión manual). Con un único adaptador ya conectado al Wi-Fi de casa no se
  suelta: error `sin-soporte` con su porqué. IP: la pista `ip_ap` de la web o las habituales; la IP propia debe estar
  en la misma subred.
- Estados: `inactivo → abriendo → red-lista` (dueño) y `uniendo → unida` (cliente); `cerrando → cerrado`; `error` con
  `permiso-denegado | sin-soporte | fallo-nativo | no-encontrada`.

### 10.3 · Pasarela de internet en el webview (WebView2)

WebView2 no tiene API de proxy en caliente (no hay equivalente a `proxyConfigurations` de macOS ni a `ProxyController`
de Android). **Decisión:** al arrancar, `puerta_proxy_windows::instalar()` abre una pasarela local de paso
(`127.0.0.1:47077`, solo `std`) y pone `--proxy-server=http://127.0.0.1:47077` más la lista de exclusión de bucle
local en `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` (se lee al crear el primer webview; vale para todas las ventanas, que
comparten carpeta de datos). La pasarela:

- va **directa** a Internet siempre que la página no le haya dicho que hay puerta (la neurona con salida propia no
  cambia nada: `puerta.cjs` ni siquiera abre su proxy);
- solo encadena (`CONNECT`/HTTP) con el proxy de `puerta.cjs` mientras `puerta_proxy_local` fija su puerto, y **vuelve
  a directa** si el encadenado falla o la puerta se va;
- nunca proxifica bucle local ni redes locales (excluidos del navegador y vetados en la pasarela), limita
  conexiones y cabeceras, y contesta 400/403/501/502/503 sin colgarse.

Si el usuario ya configuró un proxy en el sistema o en la variable, o el puerto está ocupado, **no se instala**:
la capacidad de `puerta_proxy_estado` dice `soportado: false` con el motivo y el navegador sigue como estaba. Interruptor:
`STARSEED_SIN_PROXY_PUERTA=1`. Las descargas de Rust (actualizador, reqwest, curl) usan el proxy como antes.
`puerta.cjs` no cambia.

### 10.4 · Lo que debe confirmar un PC con Windows real (pendiente)

1. Que el adaptador admita ser **dueño autónomo del grupo** (`Started`, no `Aborted`) y que una tableta Android 10+
   se una por nombre y contraseña sin avisos.
2. Que el grupo se abra **sin soltar el Wi-Fi de casa** (`wifi-direct-concurrente`) y qué adaptador ve
   `WiFiAdapter::FindAllAdaptersAsync` (¿aparece el virtual?).
3. Que Windows cliente se una a un grupo Android/Linux: como `WiFiDirectDevice` (¿pide PBC/PIN en el Android?) o como
   red por un segundo adaptador. En un PC con un solo adaptador en el Wi-Fi de casa se negará (`sin-soporte`).
4. La IP real del dueño (192.168.137.1) y que `enlace_wifi_comprobar` llegue al 47071 del otro.
5. Que WebView2 respete la variable de proxy (navegar con y sin puerta; páginas, `WebSocket` y `fetch` con el proxy
   de `puerta.cjs`) y que ninguna ventana creada después la pierda.
6. Llamadas: el permiso de micrófono y cámara (el manejador de Tauri 2.12 los concede a los orígenes propios y Windows
   puede mostrar su aviso de Privacidad), AudioWorklet, WebCodecs y WebRTC (vienen con WebView2/Chromium: sin cambios
   de código). Comprobar una llamada de datos con voz y vídeo sobre el grupo Wi-Fi Direct.

> Matriz completa de plataformas y carriles (Windows, Linux, Android, Apple, web), roles y caída por carril: [`matriz-enlaces-directos.md`](matriz-enlaces-directos.md) (MTZ1109A).
