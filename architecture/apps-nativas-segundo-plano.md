# Apps nativas: antenas en segundo plano, archivos, NAS y capas (contrato · 2026-10-10)

**Petición de Alex (2026-10-10):** que las apps nativas mantengan sus telecomunicaciones y señales
mesh de TODAS las antenas activas en segundo plano aun al cerrar la app, con los permisos del sistema
operativo; acceso y control total de archivos y carpetas (con su permiso); los procesadores como
NAS/servidores para los cerebros de cada cuenta; antenas nativas (Reticulum, Meshtastic, StarSeed
multicanal); Astraura 1.58 BitNet, Cactus Needle y Bonsai con capas autoadaptables
(`architecture/capas-autoadaptables.md`); y la mejor UI/UX posible.

**Regla de este documento:** cada línea dice si está **HECHO** (código en el repo y probado aquí),
**ESCRITO SIN COMPILAR** (código en el repo que solo compila el CI o la Mac) o **PENDIENTE**. Nada se
anuncia como vivo sin haberlo medido en un aparato.

---

## 0. Resumen en una pantalla (para Alex)

| Qué | Estado | Dónde se comprueba |
|---|---|---|
| Guardián de antenas en Rust (faro Wi-Fi local, LoRa, Reticulum, Internet) | HECHO (40 pruebas puras de Rust en verde) + ESCRITO SIN COMPILAR el pegamento con Tauri | `cargo test` del núcleo puro; `cargo check` en el CI (`ci.yml → tauri-check`) |
| Escritorio: cerrar la ventana la oculta, bandeja con antenas vivas, «Salir del todo», arranque con el sistema oculto | ESCRITO SIN COMPILAR | Mac: guion §11.2 |
| Android: servicio en primer plano `connectedDevice` con notificación fija, arranque al encender, exclusión de batería explicada | ESCRITO SIN COMPILAR (Kotlin inyectado por `build.rs` en el proyecto que genera Tauri) | Tablet: guion §11.1, tras un build Android del CI |
| Carpetas concedidas con el selector nativo (lectura / lectura-escritura / NAS) | HECHO el registro (pruebas) + ESCRITO SIN COMPILAR el comando | Mac: §11.2 |
| Puente serie nativo para radios LoRa (macOS/Linux) | HECHO la parte pura + ESCRITO SIN COMPILAR el comando | Mac con un Meshtastic USB |
| Capas de Astraura en el disco (≤ 15 % del libre, tope 8 GB, SHA obligatorio) | HECHO (pruebas) + ESCRITO SIN COMPILAR el comando | Mac: §11.2 |
| NAS de la cuenta y cerebro compartido | HECHO el protocolo y la política en TypeScript puro (`src/lib/nativa/nas.ts`) + comandos de lectura en Rust ESCRITOS SIN COMPILAR | Enjambre: tareas §12 |
| Bluetooth nativo, Wi-Fi Direct, USB en Android, Reticulum embebido | PENDIENTE — cada uno necesita una decisión tuya (§13) | — |
| iOS | Sin app nativa (Xcode pide equipo de desarrollo; ver doc de la 0.3.0). iPhone/iPad siguen con la PWA | — |

---

## 1. Inventario real (2026-10-10)

### 1.1 Qué se compila de verdad

- **`native/src-tauri/` es la app.** Lo prueban:
  - `.github/workflows/native-build.yml` → `projectPath: native`, `workspaces: native/src-tauri`; construye
    OS, Nexus y Café (`-c src-tauri/tauri.<sistema>.conf.json`) para macOS universal, Linux, Windows,
    Android (APK firmado con keystore propio) e iOS (best-effort; hoy no sale).
  - `.github/workflows/ci.yml → tauri-check` → `cargo check --manifest-path native/src-tauri/Cargo.toml`
    en cada push a `main` (informativo: `continue-on-error: true`).
- **`src-tauri/` (raíz) está retirado:** `identifier org.starseed.os`, solo updater, nadie lo compila
  desde el 2026-09-24 (lo dice el propio `ci.yml`). No se toca; se deja aquí documentado para que nadie
  lo «arregle» creyendo que es la app.

### 1.2 Lo que la app tenía antes de esta ola (v0.3.0)

| Pieza | Estado |
|---|---|
| Tauri 2, `tray-icon` activado en `Cargo.toml` | Sin bandeja creada: el feature estaba pero nadie la construía |
| Plugins | shell, notification, dialog, fs, os, process, deep-link; solo escritorio: updater, autostart (LaunchAgent en macOS, sin argumentos) |
| Capabilities | `default` (todas las plataformas, `remote.urls` de las 3 webs): shell `sh/bash/cmd/powershell -c`, fs lectura de `**` y escritura de `$HOME/**`, notificaciones, diálogos, os, process, deep-link. `desktop-only`: autostart y updater |
| Comandos propios | `run_terminal`, `check_update`, `reiniciar_para_actualizar`, `estado_actualizacion`, `device_info` |
| Updater | Un canal por sistema (`latest.json`, `latest-nexus.json`, `latest-cafe.json`), cada 6 h, reinicio solo si nadie mira |
| Segundo plano | **Ninguno.** Cerrar la ventana cerraba la app; en Android, cerrar la actividad dejaba que el sistema matara el proceso |
| Android | Lo que genera `cargo tauri android init` en el CI: una actividad, permiso `INTERNET`. Nada más |
| Versiones | 0.3.0 en `tauri.conf.json` y `Cargo.toml` |

### 1.3 Lo que la web del OS espera de la app

- `src/lib/neurons/maquina.ts` → `core.invoke('device_info')` para la huella del aparato (hostname).
- `src/lib/neurons/medio.ts`, `src/lib/apps-oficiales/dispositivo-actual.ts`,
  `src/lib/astraura/capas/perfil-medio.ts` → detectan `__TAURI__` para decir «app nativa».
- `src/components/pwa/actualizacion-nativa.tsx` + `src/lib/pwa/actualizacion-nativa-logica.ts` → updater.
- Malla y radios: `src/ai/astraura/mesh/meshtastic-adapter.ts` usa Web Serial y Web Bluetooth del
  NAVEGADOR. **Dentro de la app nativa eso no existe**: WKWebView (macOS), WebKitGTK (Linux) y el
  WebView de Android no traen Web Serial ni Web Bluetooth; WebView2 (Windows) tampoco expone Web
  Serial. Por eso, hasta hoy, la app nativa sabía MENOS de radios que Chrome. El puente serie nativo
  (§3.2) cierra esa brecha en macOS y Linux.

---

## 2. Segundo plano por sistema

### 2.1 Qué puede seguir vivo con la app cerrada

| Sistema | Mecanismo | Qué sigue vivo | Límite honesto |
|---|---|---|---|
| **Android** | Servicio en primer plano tipo `connectedDevice` con notificación fija | Proceso entero: guardián de antenas (faro Wi-Fi local, nodos Meshtastic por TCP, Internet) | Doze puede dormir la CPU si la persona no excluye la app de la optimización de batería (§2.3). Bluetooth y USB necesitan el plugin Kotlin de la siguiente ola |
| **macOS** | Cerrar la ventana la oculta; Dock y bandeja para volver; LaunchAgent con `--segundo-plano` | Todo el proceso (guardián, puente serie) | Si la persona elige «Salir del todo», se apaga todo (es lo que pidió) |
| **Windows** | Bandeja; clave `Run` del registro con `--segundo-plano` | Todo el proceso | El puente serie aún no (crate `serialport`, §13) |
| **Linux** | Bandeja si hay `libayatana-appindicator3` (la trae el AppImage; el `.deb` la declara); XDG autostart con `--segundo-plano` | Todo el proceso | **Sin appindicator, cerrar sale del todo** (la app comprueba la librería antes de crear la bandeja: sin ella `tray-icon` aborta el proceso) |
| **iOS** | — | Nada | No hay app nativa (§0). iOS solo permite fondo para modos concretos (`bluetooth-central`, audio, ubicación) y exige firma de Apple Developer |

### 2.2 Escritorio (macOS, Windows, Linux) · ESCRITO SIN COMPILAR

Código: `native/src-tauri/src/segundo_plano.rs` + `nativa.rs` + `lib.rs`.

- **Cerrar la ventana la oculta** si «Segundo plano» está encendido (lo está por defecto, es la
  petición) **y** hay por dónde volver (bandeja o Dock de macOS). Si no hay por dónde volver, cerrar
  sale como siempre: nunca una app viva sin forma de abrirla ni de apagarla.
- **Bandeja** con «Abrir StarSeed», una línea con las antenas vivas («Antenas vivas: Wi-Fi local,
  Internet») que se actualiza sola, y «Salir del todo (apaga las antenas)».
- **macOS:** clic en el icono del Dock con la ventana oculta → `RunEvent::Reopen` la vuelve a mostrar.
- **Primer cierre:** una notificación dice dónde sigue la app y cómo salir del todo. Solo una vez.
- **Arranque con el sistema:** el plugin autostart se registra con el argumento `--segundo-plano`; al
  arrancar así la ventana empieza oculta y solo trabaja el guardián. Las instalaciones que ya tenían
  el arranque activado conservan la entrada vieja (sin argumento) hasta que se apague y encienda de
  nuevo; la UI lo dice.
- Preferencia en `<app_config_dir>/segundo-plano.json` (`activo`, `avisado`).

### 2.3 Android · ESCRITO SIN COMPILAR

**Por qué así:** Tauri regenera `src-tauri/gen/android` en cada `cargo tauri android init` del CI, así
que nada que se escriba a mano ahí sobrevive. El `build.rs` de la app corre durante la compilación
Rust del APK con las mismas variables que usa el propio Tauri para escribir su Kotlin
(`TAURI_ANDROID_PROJECT_PATH`, `WRY_ANDROID_LIBRARY`, `WRY_ANDROID_PACKAGE`; comprobado en
`tauri-2.12.2/build.rs`). Ese es el momento: después de `init` y antes de que Gradle compile el Kotlin
y procese el manifiesto.

- `native/src-tauri/src/android_parche.rs` (puro, con pruebas) inserta entre marcadores
  `<!-- STARSEED-SEGUNDO-PLANO:... -->` los permisos y los componentes en
  `app/src/main/AndroidManifest.xml`, sin duplicar permisos que ya estén. Es idempotente.
- Copia los Kotlin de `native/src-tauri/android/*.kt` (paquete fijo `app.starseed.nativa`, con el
  nombre real de la librería sustituido) a `app/src/main/java/app/starseed/nativa/`.
- Solo se aplica a **StarSeed OS** (`app.starseed.os`). Nexus y Café son portales web: no llevan
  guardián ni servicio. Escape: `STARSEED_SIN_SERVICIO_ANDROID=1` desactiva el parche.

**Permisos que se declaran y por qué** (lo que la persona ve en «Permisos» de Android):

| Permiso | Tipo | Para qué |
|---|---|---|
| `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_CONNECTED_DEVICE` | normal | El servicio en primer plano de las antenas |
| `FOREGROUND_SERVICE_DATA_SYNC` | normal | Reservado para transferencias grandes (NAS, capas) con la app abierta; **no** se usa para el servicio continuo: Android 15 limita `dataSync` a 6 h cada 24 h y prohíbe lanzarlo desde el arranque |
| `CHANGE_WIFI_MULTICAST_STATE` | normal | Recibir los faros (Android descarta el multicast si no se pide) y además es el requisito de Android 14 para el tipo `connectedDevice` |
| `ACCESS_NETWORK_STATE`, `ACCESS_WIFI_STATE` | normal | Saber si hay Wi-Fi y red |
| `POST_NOTIFICATIONS` | en ejecución (13+) | La notificación fija. Sin ella el servicio funciona pero la persona no lo ve: la UI lo dice |
| `RECEIVE_BOOT_COMPLETED` | normal | Arrancar al encender (`connectedDevice` sí puede lanzarse desde el arranque en Android 15) |
| `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` | normal | Abrir el diálogo del sistema para excluir la app de la optimización de batería. **Solo si la persona pulsa el botón**, después de leer por qué (Doze duerme la CPU y los faros se oyen tarde) |

**Componentes:**

- `ArranqueStarSeed` (ContentProvider, se crea al arrancar el proceso, antes que la actividad):
  carga la librería Rust, arranca el guardián en `filesDir/starseed` por JNI
  (`PuenteNativo.iniciarGuardian`), y vigila la carpeta: si la web cambia `segundo-plano.json`
  arranca o para el servicio; si escribe `peticion.json` con `bateria`, abre el diálogo del sistema.
  El servicio se arranca en `onActivityResumed`, cuando Android lo permite (app visible).
- `ServicioAntenas` (`foregroundServiceType="connectedDevice"`): notificación fija «StarSeed · antenas»
  con el resumen que escribe Rust (`estado-antenas.json`), toma el `MulticastLock`, botón «Detener».
  Escribe `servicio.json` (vivo, desde, motivo, notificaciones permitidas, batería exenta) para que la
  UI diga la verdad.
- `ArranqueAlEncender` (BOOT_COMPLETED y MY_PACKAGE_REPLACED): si la persona lo dejó encendido,
  arranca el servicio.
- Sin `WakeLock` permanente: gasta batería y no hace falta con la exclusión de batería.

---

## 3. Antenas

El **guardián** (`native/src-tauri/src/antenas.rs`) vive en hilos de Rust del proceso, no en la
página: por eso sigue con la ventana cerrada. Cada antena dice `viva`, `detectada`, `apagada`,
`sin-permiso` o `no-disponible` con su motivo en una frase. **Nada se marca viva sin medirlo.**

| Antena | macOS | Linux | Windows | Android | Con la app cerrada |
|---|---|---|---|---|---|
| Wi-Fi local (faro) | HECHO | HECHO | HECHO | HECHO (+ MulticastLock) | Sí |
| LoRa · Meshtastic por serie USB | Puente serie | Puente serie | PENDIENTE (`serialport`) | PENDIENTE (USB host Kotlin) | Sí (escritorio) |
| LoRa · Meshtastic por TCP 4403 (meshtasticd o nodo con Wi-Fi) | HECHO | HECHO | HECHO | HECHO | Sí |
| LoRa · Meshtastic por Bluetooth | PENDIENTE (`btleplug`) | PENDIENTE | PENDIENTE | PENDIENTE (Kotlin) | — |
| Bluetooth (malla BLE propia) | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | — |
| Wi-Fi Direct | — | — | — | PENDIENTE (Kotlin `WifiP2pManager`) | — |
| Reticulum (`rnsd` del sistema) | Detecta | Detecta | — | — | Lo que haga `rnsd` |
| Internet | HECHO | HECHO | HECHO | HECHO | Sí |

### 3.1 Faro Wi-Fi local (`faro.rs`) · HECHO

Datagrama UDP de 37 bytes cada 15 s al grupo `239.255.70.83:47070` con TTL 1 (nunca sale del router).
No lleva nombre ni id en claro; un nonce nuevo por faro. Con la **clave de faro de la cuenta**
(32 bytes) se comprueba «es de mi cuenta» (`HMAC(clave, "ss-faro-cuenta"|ventana5min|nonce)[..8]`) y
«es mi tablet» probando los ids de neurona conocidos. Sin clave solo se cuenta «N neuronas StarSeed
cerca». Banderas: NAS, LoRa viva, en 2.º plano.

**Permisos del sistema para el faro:** macOS 15+ pide «Red local» la primera vez (la frase sale de
`native/src-tauri/Info.plist`, que Tauri fusiona con el suyo: `NSLocalNetworkUsageDescription`);
Windows enseña el aviso del Firewall al abrir el puerto UDP 47070 (hay que permitir «Redes
privadas»); Android necesita `CHANGE_WIFI_MULTICAST_STATE` (§2.3). Si el router aísla a los clientes
(«AP isolation», típico de redes de invitados) o filtra multicast, los faros no se oyen: es el router,
y la fila Wi-Fi lo dirá como «viva» (emite) con «0 neuronas en esta red».

**Clave de faro** (`src/lib/nativa/faro-clave.ts`, HECHO): 32 bytes aleatorios por cuenta, guardados
en los ajustes privados de la cuenta (RLS por dueño) y repartidos a cada neurona al iniciar sesión.
Nunca viaja en un faro. Límite honesto: quien grabe un faro puede reemitirlo ~10 min y fingir
presencia, nunca datos; el canal que se abre después (WebRTC, NAS) exige su propio saludo.

### 3.2 LoRa y Meshtastic (`serie.rs` + `src/lib/nativa/serie-nativa.ts`)

- Serie USB en macOS y Linux: se abre el dispositivo (solo rutas que el guardián reconoce como radio:
  `cu.usbserial*`, `cu.usbmodem*`, `ttyUSB*`, `ttyACM*`…), se configura con `stty` 115200 8N1 crudo y
  los bytes van a la web por el evento `starseed://serie`. La web los pasa al mismo decodificador de
  `@meshtastic/core` que usa Web Serial (`serie-nativa.ts` ofrece un `ReadableStream`/`WritableStream`).
- Linux sin permiso: el error dice exactamente `sudo usermod -aG dialout $USER`.
- TCP 4403: el guardián prueba `127.0.0.1` (meshtasticd) y los hosts que la persona añada.

### 3.3 Reticulum (investigado el 2026-10-10)

- **RNS 1.3.8** (10 jul 2026) es la referencia, en Python. Su licencia, la **«Reticulum License»**, es
  tipo MIT con dos cláusulas añadidas: no puede usarse en sistemas que dañen a personas **ni, directa o
  indirectamente, para crear una inteligencia artificial** o datos de entrenamiento. StarSeed es un OS
  con IA (Astraura): **meterlo dentro de la app es decisión tuya**, y por esa cláusula la recomendación
  es NO empaquetarlo.
- Lo que hace la app hoy: **detecta** si `rnsd` está instalado y corriendo (proceso o puerto 37428) y lo
  dice. No lo instala ni lo trae.
- Alternativas sin esa cláusula: **Reticulum-rs** de Beechat (MIT, 334 ★, sin versiones publicadas,
  TCP/serie/Kaonic, interop parcial); **reticulum-rs-core** de FreeTAKTeam/LXMF-rs (EPL-2.0, 0.13.0 del
  2026-10-03, TCP y RNode/LoRa probados en campo); **`@reticulum/core`** 0.9.7 en JavaScript
  (EUPL-1.2). Las tres son dependencias nuevas: decisión tuya (§13).

### 3.4 StarSeed multicanal

La app no inventa otro transporte: alimenta el **transporte universal**
(`src/lib/malla/transporte-universal.ts`, contrato `architecture/transporte-universal-sin-internet.md`).
El guardián le dice qué neuronas de la cuenta están en la misma red (`vecinos`, con su IP y si sirven
NAS), y el transporte elige el enlace (local, cuenta, par, relé, LoRa) con `eleccion-enlace.ts`.

---

## 4. Archivos y carpetas

### 4.1 Escritorio · registro HECHO, comando ESCRITO SIN COMPILAR

- **El gesto es el permiso:** `carpetas_conceder(modo)` abre el **selector nativo del sistema** desde
  Rust. La web no puede pasar una ruta y concederla: así una página comprometida no se regala acceso.
- Modos: `lectura` o `lectura-escritura`. `nas` (compartir con mis otras neuronas) siempre empieza
  apagado. «Raíz del disco» o «carpeta personal entera» se marcan `amplia` y la UI lo avisa en ámbar.
- Revocar la quita del registro y la **prohíbe** en el alcance de `tauri-plugin-fs` desde ya (hasta
  el siguiente arranque; después manda otra vez la capability).
- **Límite honesto:** el alcance de `tauri-plugin-fs` no distingue lectura de escritura. El modo
  `lectura` lo hacen cumplir los comandos propios (NAS) y la interfaz; la web conserva los permisos de
  escritura que ya le da `default.json` (`$HOME/**`).
- Cada arranque vuelve a añadir al alcance las concedidas (`<app_data_dir>/carpetas-concedidas.json`).
- **macOS:** la app no está en App Sandbox (se distribuye sin Mac App Store), así que no necesita
  marcadores con seguridad (`security-scoped bookmarks`); los necesitaría el día que vaya a la tienda.
  Escritorio, Documentos, Descargas y discos externos piden permiso del sistema (TCC) la primera vez;
  «Acceso total al disco» solo si la persona lo activa en Ajustes del Sistema.
- **Aviso honesto sobre la capability actual:** `default.json` ya deja leer `**` y escribir `$HOME/**`
  a la web remota, y `run_terminal` da una terminal. Las carpetas concedidas son la forma correcta;
  **estrechar** esas reglas a «datos de la app + concedidas» es decisión tuya (§13) porque puede
  romper usos de Aurora que hoy dependan de ellas.

### 4.2 Android · PENDIENTE (plugin Kotlin, siguiente ola)

- **Tienda y por defecto:** Storage Access Framework (`ACTION_OPEN_DOCUMENT_TREE` +
  `takePersistableUriPermission`): la persona elige la carpeta y el permiso sobrevive a reinicios.
- **APK propio (sideload):** `MANAGE_EXTERNAL_STORAGE` («Acceso a todos los archivos»), pedido con una
  pantalla que explique por qué. Google Play solo lo concede tras revisión a gestores de archivos,
  copias de seguridad, antivirus y similares; para la tienda se usa SAF.
- Hoy en Android `carpetas_conceder` devuelve un error que lo dice.

---

## 5. NAS y cerebros de la cuenta

Cada procesador puede servir **sus carpetas NAS** y **su cerebro** (Astraura local) a las **demás
neuronas de la misma cuenta**, por el transporte universal.

- **Protocolo** (`src/lib/nativa/nas.ts`, HECHO, puro y probado): canal de aplicación `nas`;
  peticiones `listar`, `leer` (trozos ≤ 256 KiB), `estado` y `cerebro.preguntar`; respuestas con
  `ok` o un error con motivo legible.
- **Permisos, en dos capas:**
  1. En la web que sirve (`autorizarPeticionNas`): solo si el origen es de la MISMA cuenta (uid
     verificado por el enlace, nunca por lo que diga el mensaje), solo carpetas con `nas: true`,
     ruta dentro de la carpeta, sin `..`, y nunca escritura (la escritura remota queda para una ola
     con confirmación en el aparato que sirve).
  2. En Rust (`nas_listar`, `nas_leer`): vuelve a comprobar contra el registro, **canonicaliza** la
     ruta (un enlace simbólico no escapa de la carpeta) y limita el tamaño del trozo.
- **Cifrado:** los enlaces P2P van por WebRTC (DTLS); el relé del servidor es cifrado extremo a
  extremo (`server-relay`); **LoRa nunca lleva archivos** (máx. 200 B).
- **Cerebro:** `cerebro.preguntar` solo se atiende si la neurona anuncia el papel (bandera en el faro y
  en `neuron_devices.capabilities`) y reenvía al Astraura local (`127.0.0.1:8790` o el demonio de voz
  `127.0.0.1:4444`); lo privado nunca sale de la cuenta (regla de `capas-autoadaptables.md` §5).

---

## 6. Capas de Astraura en la app (`disco.rs` + `src/lib/nativa/capas-nativas.ts`)

- Presupuesto: **15 % del disco libre, tope 8 GB**, calculado sobre (libre + lo que ya ocupan las capas)
  para que no baje solo por descargar.
- **Ninguna capa sin SHA-256 del catálogo** (`config/capas-astraura.json`): se descarga con `curl -C -`
  (reanudable) a `<nombre>.parcial`, se hashea a trozos de 1 MiB y, si no casa, se borra.
- `planDescargaNativa` (TS puro) elige qué capas bajar: solo entradas `usable` con medio `nativo`, en
  orden reflejo → memoria → palabra → razón, sin pasarse del presupuesto, saltando lo ya instalado con
  el mismo nombre.
- Android: sin `curl`; la descarga irá por `DownloadManager` en el plugin Kotlin (lo dice el error).

---

## 7. UI/UX de permisos y estado (sin ilusiones)

Modelo de vista puro en `src/lib/nativa/vista-antenas.ts` (HECHO): convierte el estado en filas con
icono Lucide, tono (`vivo` verde, `atento` ámbar, `apagado` gris, `bloqueado` rojo), la frase del
motivo y **una** acción concreta cuando la hay («Conceder notificaciones», «Excluir de batería»,
«Abrir la radio», «Instalar rnsd»). Reglas:

1. **Arriba, una frase:** «3 antenas vivas · sigue con la app cerrada» o «Ninguna antena viva: …».
2. **Por qué no otra:** cada antena apagada dice su motivo real (no «error»).
3. **Permisos en orden y solo al usarlos:** en Android, primero notificaciones (para ver que sigue
   viva), después batería (solo si la persona quiere faros a tiempo), Bluetooth solo al abrir una radio.
4. **Salir siempre visible:** «Salir del todo» en la bandeja y «Detener» en la notificación.
5. **Nunca un verde sin medir:** si el guardián no responde, la fila dice «sin medir».

---

## 8. API de la app para la web

Todos por `window.__TAURI__.core.invoke`. Los comandos propios no tienen manifiesto ACL (como los de
la 0.3.0): cualquier página cargada en la ventana puede llamarlos; la ventana solo carga las tres webs.

| Comando | Plataformas | Devuelve |
|---|---|---|
| `antenas_estado` / `antenas_medir` | todas | `EstadoAntenas` |
| `antenas_config` | todas | `ConfigAntenas` (la guardada) |
| `antenas_configurar(config)` | todas | `EstadoAntenas` (guarda `antenas.json`, 0600; config ENTERA: leer, cambiar, devolver) |
| `fondo_estado` / `fondo_fijar(activo)` | todas | `EstadoFondo` |
| `fondo_arranque(activo)` | todas | `EstadoFondo` |
| `fondo_pedir_bateria` | Android | `EstadoFondo` |
| `carpetas_listar` / `carpetas_conceder(modo)` / `carpetas_revocar(ruta)` / `carpetas_nas(ruta, activo)` | escritorio (Android: error honesto) | `CarpetaConcedida[]` / `CarpetaConcedida \| null` |
| `serie_puertos` / `serie_abrir(ruta, baudios)` / `serie_escribir(datos)` / `serie_cerrar` | macOS, Linux | `string[]` / `()` |
| `capas_estado` / `capas_descargar(peticion)` / `capas_verificar(nombre, sha256)` / `capas_borrar(nombre)` | escritorio | `EstadoCapasDisco` / `Verificacion` |
| `nas_listar(ruta)` / `nas_leer(ruta, desde, largo)` | escritorio | `EntradaNas[]` / `number[]` |

Eventos: `starseed://antenas` (`EstadoAntenas` cada vez que cambia), `starseed://serie`
(`{ datos: number[] }`), `starseed://serie-cerrada`. Envolturas tipadas en `src/lib/nativa/puente.ts`
(en la web normal devuelven `{ ok: false, motivo: "Solo en la app nativa" }`, nunca lanzan).

---

## 9. Seguridad

- La web no puede conceder rutas (§4.1) ni abrir un puerto que no sea una radio (§3.2).
- `antenas.json` (clave de faro) se guarda con permisos 0600.
- NAS: doble comprobación y canonicalización (§5).
- **Riesgo conocido:** sin manifiesto ACL de la app, si la ventana navegara a otro dominio ese dominio
  podría invocar los comandos. Mitigación propuesta (tarea §12-T4): filtrar la navegación de la
  ventana principal a las tres webs.

---

## 10. CI: qué se compila dónde

| Qué | Dónde | Cuándo |
|---|---|---|
| Núcleo puro de Rust (sha256, faro, carpetas, disco, antenas, serie, android_parche) | aquí, crate de prueba con `#[path]` | hecho en esta ola |
| `cargo check` de la app (Linux) | `ci.yml → tauri-check` | cada push a `main` (informativo) |
| macOS universal, Windows, Linux | `native-build.yml → build-desktop` | etiqueta `v*` o ejecución manual |
| Android (incluye el Kotlin inyectado) | `native-build.yml → build-android` | etiqueta `v*` o ejecución manual con `plataformas: android` |
| TS de `src/lib/nativa` | `vitest` (job `verify` de `ci.yml`) | cada push |

**Verificado aquí (2026-10-10):** 40 pruebas de Rust del núcleo puro (incluido el parche de Android
aplicado a un proyecto falso en disco, idempotente) y 51 de TypeScript en `src/lib/nativa/__tests__`
(con una guardia, `contrato-rust.test.ts`, que compara campo a campo los tipos TS con las estructuras
de Rust y que cada comando de `puente.ts` esté registrado en `lib.rs`); `tsc` limpio en
`src/lib/nativa`. **No se compiló aquí** (contenedor sin WebKitGTK ni NDK y con el disco al 100 %:
instalar WebKitGTK lo llenó y hubo que purgarlo): el pegamento con Tauri (`nativa.rs`,
`segundo_plano.rs`, `lib.rs`), el JNI y el Kotlin. Las firmas de la API de Tauri se comprobaron
contra el código fuente de `tauri 2.12.2`, `tauri-plugin-fs 2.6.0`, `tauri-plugin-dialog 2.8.1`,
`tauri-plugin-autostart 2.7.0` y `tauri-plugin-notification 2.5.1`. El primer `cargo check` real es
el del CI tras el push. **Publicar una versión nativa es decisión de Alex.**

---

## 11. Guion de prueba para Alex

### 11.1 Tablet Android (tras un build Android del CI)

1. **QUÉ:** compilar solo el APK, sin publicar. **POR QUÉ:** es el único sitio donde se compila el
   Kotlin. **CÓMO:** GitHub → Actions → «StarSeed Native · Build & Release» → *Run workflow* con
   `systems: os`, `plataformas: android`, `etiqueta: prueba-fondo-1010`. Queda en un Release
   **borrador** (no lo ve nadie).
   Enlace: https://github.com/StarSeedSystem/starseed-system/actions/workflows/native-build.yml
2. Si el job falla en Gradle con un error de Kotlin, copia las 20 líneas del error al Chat Director:
   el parche se puede apagar con `STARSEED_SIN_SERVICIO_ANDROID=1` mientras se arregla.
3. Instala `StarSeed-os-0.3.0.apk` del borrador en la tablet (orígenes desconocidos).
4. Abre la app e inicia sesión. Android pedirá **Notificaciones** → «Permitir».
5. Debe aparecer la notificación fija **«StarSeed · antenas»** con una línea tipo «Wi-Fi local viva ·
   Internet viva».
6. Cierra la app desde Recientes (deslizar). La notificación **debe seguir**. Con la Mac en la misma
   Wi-Fi y su app nativa nueva abierta, en ≤ 30 s el menú de la bandeja de la Mac debe decir
   «… — 1 neurona(s) StarSeed cerca», y la notificación de la tablet lo mismo de la Mac. (Dirá «tuya»
   en vez de «StarSeed» cuando la tarea T2 reparta la clave de faro de la cuenta.)
7. Ajustes de Android → Apps → StarSeed OS → Batería → «Sin restricciones» (o el botón de la app).
   Apaga la pantalla 10 min y vuelve: la tablet debe seguir en la lista de la Mac.
8. Reinicia la tablet sin abrir la app: la notificación debe volver sola al encender.
9. Toca «Detener» en la notificación: desaparece y la bandeja de la Mac deja de contarla en ≤ 60 s.

### 11.2 Mac

1. Cuando haya un build de escritorio (mismo workflow con `plataformas: escritorio`), instala el
   `.dmg` del borrador (clic derecho → Abrir la primera vez).
2. Cierra la ventana con el botón rojo: aparece el aviso «StarSeed sigue en segundo plano» y el icono
   en la barra de menús. El menú dice «Antenas vivas: …».
3. Clic en el icono del Dock: vuelve la ventana.
4. Enchufa un Meshtastic por USB: en ≤ 30 s la fila LoRa pasa a «detectada»; «Abrir la radio» la pasa
   a «viva».
5. Conexiones → Carpetas → «Conceder carpeta»: se abre el selector de macOS; elige una carpeta de
   prueba; aparece en la lista con «lectura». Revócala: desaparece.
6. Menú de la bandeja → «Salir del todo»: la app termina (comprueba en el Monitor de Actividad que no
   queda `starseed-native`).

---

## 12. Tareas para el enjambre (≤ 3 archivos, ≤ 120 líneas por archivo, prompt autosuficiente)

- **T1 · Panel «Antenas» en el Hub de Conexiones.** Archivos: `src/components/connectivity/antenas-nativas-panel.tsx`
  (nuevo, ≤ 120 líneas) y su prueba `src/components/connectivity/__tests__/antenas-nativas-panel.test.tsx`.
  Prompt: «Crea un componente cliente `AntenasNativasPanel` que use `useAntenasNativas()` de
  `@/lib/nativa/use-antenas`. Si `disponible` es false, no pintes nada. Arriba `vista.titular` con un
  punto de color según `vista.tono` (vivo `#10B981`, atento `#FFBF00`, apagado gris, bloqueado
  `#DC143C`) y debajo `vista.fondo.texto` y `vista.vecinos.texto`. Una fila por `vista.filas`: icono de
  `lucide-react` cuyo nombre está en `fila.icono`, `fila.nombre`, `fila.estadoTexto`, `fila.motivo` en
  gris pequeño, `fila.conAppCerrada`, y si hay `fila.accion` un botón con `accion.etiqueta` (title =
  `accion.explicacion`) que llama `ejecutar(fila.accion)`. Botones de `vista.fondo.acciones` igual.
  Sin emojis, `cursor-pointer`, transiciones de 150–300 ms, estilo Crystal Liquid Glass del repo.
  Prueba con @testing-library/react: mockea `@/lib/nativa/use-antenas` y comprueba que con
  `vista.sinMedir` aparece «Antenas sin medir» y que el botón llama `ejecutar`.» Después, otra tarea
  de 1 archivo monta el panel como pestaña «Antenas» en `src/components/connectivity/connections-center.tsx`.
- **T2 · Clave de faro de la cuenta en cada neurona.** Archivos: `src/lib/nativa/faro-clave-cuenta.ts`
  (nuevo) y `src/lib/nativa/__tests__/faro-clave-cuenta.test.ts`. Prompt: «Implementa
  `sincronizarClaveFaro(deps)` con `deps = { leerAjuste(clave), escribirAjusteSiFalta(clave, valor),
  idNeurona(), idsNeuronasCuenta() }` inyectadas: usa `obtenerOCrearClaveFaro` de `./faro-clave` con
  la clave de ajuste `CLAVE_AJUSTE_FARO`; si `esAppNativa()` (de `./puente`), lee la config con
  `puenteNativo().antenasConfig()`, cambia `clave_faro`, `neurona` y `conocidas`, y la guarda entera
  con `antenasConfigurar`. Nunca registres la clave en consola. Prueba con dependencias falsas: crea
  la clave una vez, la reutiliza, y no llama a la app si no es nativa.» El cableado con `user_settings`
  (RLS por dueño) va en otra tarea de 1 archivo junto a `src/lib/sync/realtime-sync.ts`.
- **T3 · Radio USB dentro de la app con el adaptador Meshtastic.** Archivo:
  `src/ai/astraura/mesh/meshtastic-adapter.ts`. Prompt: «En la rama `serial` del transporte real, si
  `esAppNativa()` (de `@/lib/nativa/puente`) y no existe `navigator.serial`, pide los puertos con
  `puenteNativo().seriePuertos()` y usa `crearTransporteMeshtasticNativo(puertos[0])` de
  `@/lib/nativa/serie-nativa` en lugar de `TransportWebSerial.create()`. Si no hay puertos, devuelve el
  error "No hay ninguna radio USB enchufada". No cambies nada más.» Verificación: `npx vitest run
  src/ai/astraura/mesh`.
- **T4 · Navegación restringida de la ventana principal.** Archivos: `native/src-tauri/src/lib.rs` y
  `native/src-tauri/tauri.conf.json`. Prompt: «Crea la ventana `main` en `setup` con
  `tauri::WebviewWindowBuilder::from_config(app, &app.config().app.windows[0])?.on_navigation(|url|
  matches!(url.host_str(), Some("starseed-os.vercel.app" | "starseed-nexus.vercel.app" |
  "starseed-cafe.vercel.app")))` y `.build()?`, y pon `"create": false` en esa ventana del
  `tauri.conf.json`.» Verificación: `cargo check` del CI en verde.

## 13. Decisiones de Alex (nada de esto se hace sin su palabra)

1. **Bluetooth nativo de escritorio:** crate `btleplug` (BSD-3/MIT). Sin él, Bluetooth solo en Chrome.
2. **Serie en Windows:** crate `serialport` (MPL-2.0).
3. **Reticulum dentro de la app:** por la cláusula anti-IA de la Reticulum License, recomendado NO;
   alternativas en §3.3.
4. **Android «Acceso a todos los archivos»** (`MANAGE_EXTERNAL_STORAGE`) solo en el APK propio.
5. **Estrechar la capability de archivos** (§4.1).
6. **Apple Developer** (99 USD/año) para firmar, notarizar y tener iOS.
7. **Publicar** la versión nativa con todo esto (siempre suya).
