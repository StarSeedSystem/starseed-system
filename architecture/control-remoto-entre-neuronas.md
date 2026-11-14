# Control remoto entre neuronas, nodos y cerebros (CRN1114 · 2026-11-14)

**Contrato, no código.** Dice cómo, desde cualquier neurona activa vinculada, se controla una neurona remota —pantalla y
audio en vivo, clics y teclado, archivos, terminales, procesos y cualquier capacidad que el sistema, el aparato y la red
de esa neurona ofrezcan—, por P2P directo o por una capa de conciencia que ambos lados alcanzan; cómo una neurona
declarada **nodo StarSeed** (proceso y/o transmisión) la gobierna una comunidad, página, grupo o cuenta con permisos
públicos o privados, peticiones, aprobaciones y consenso democrático automático configurable; y cómo se accede con
control total a **cerebros StarSeed** públicos o privados (cómputo, internet, Astraura) desde cualquier parte del OS.
Ensancha a páginas, grupos y comunidades las fases 2–4 de `permisos-y-control-del-dispositivo.md` (pantalla compartida,
control entre neuronas de la cuenta, Astraura actuando) y reutiliza tal cual las piezas que ya existen.

**Por qué:** Alex lo pidió así — desde la Mac, decirle a Astraura que abra un enlace, navegue y pulse en la tableta,
viendo los comandos en vivo; y que ese mismo poder llegue a nodos y cerebros gobernados. El control total de aparatos a
distancia es lo **más peligroso** de todo el sistema: por eso el contrato empieza por la revisión de seguridad (§1), que
decide si cada fase se puede construir, y no al revés.

> **Ruta nativa.** El encargo nombra `src-tauri/**`; esa carpeta está **retirada** (`src-tauri/RETIRADO.md`): la app
> nativa vive en `native/src-tauri/`. Todo lo nativo de este contrato se refiere a ella.

**Base leída (verificado en el código):** `permisos-y-control-del-dispositivo.md` §1, §4, §4.7, §4.8, §6 ·
`ronda-automatica-llamadas.md` (BAN1113C) · `metagenesis-autonoma.md` + `src/lib/metagenesis/remoto-nodos.ts` ·
`metagenesis-remoto-tunel.md` + `src/lib/metagenesis/remoto.ts` · `src/lib/chats-genesis/firma-aparato.ts` (GEN1114) ·
`src/lib/metagenesis/accesos.ts` · `native/src-tauri/src/{ventana_remota,prestamo_ventana,acceso_equipo}.rs` ·
`src/lib/malla/transporte-universal.ts` · `src/lib/apps-remotas/anfitrion.ts`.
**Hermano que me cita:** `architecture/mapa-de-senales.md` (MAP1114) usa el modelo de nodo y niveles de §3 y §6.

---

## §0 Lo que YA existe y este contrato reutiliza (verificado, archivo:línea)

| Pieza | Dónde | Qué aporta a este contrato |
|---|---|---|
| Firma por aparato (GEN1114) | `src/lib/chats-genesis/firma-aparato.ts:499` `crearClaveAparato`, `:577` `firmarEntrada` | clave **ECDSA P-256 `extractable:false`** en IndexedDB (solo firma, no se exporta); carga canónica `{aud,cuenta,aparato(huella),seq,t,caduca,destino,chat,entrada}` firmada r‖s; `seq` monótono reservado en transacción; nivel `texto`/`completo`; **la clave puede firmar lo que pida cualquier código de la página** (`:11-14`) → quien decide es el lado controlado |
| Verificación y nivel | `src/lib/chats-genesis/puerta-chats.ts:17` (reenvío = misma entrada firmada), `:351` (`alto` desde `texto` → no sale nada) | reintento tras fallo de red reenvía **el mismo `seq`+nonce**, nunca uno nuevo; nonce repetido = 409 |
| Canal de banco de llamadas (BAN1113C) | `ronda-automatica-llamadas.md` §1.2, §4 | el **primer uso** del canal general (§2): orden firmada por `transporte-universal` canal `banco-llamadas`, verificada en Rust (`de`, `para`, ts ±5 min, nonce, modo armado), vocabulario de acción **cerrado**, banda visible, parar en Rust, registro, nunca se arma a distancia |
| Préstamo de ventana con sesión nativa (SEG1111T) | `native/src-tauri/src/prestamo_ventana.rs:64` `exigir(app, webview, token, ventana)` | el patrón de sesión: **empieza con diálogo nativo en el aparato**, token opaco 128 bits en memoria de Rust, exige ventana `main` + mismo origen + token + ventana de la sesión; capturar/teclear acotados |
| Motor de captura+entrada | `native/src-tauri/src/ventana_remota.rs:27` `ventanas_prestables`, `:133` `entrada_ventana` (xcap 0.9, enigo 0.6) | el único motor de captura y clic en escritorio; **enigo/xcap son de escritorio** (no Android, no iOS) |
| Acceso al equipo (SEG1111U) | `native/src-tauri/src/acceso_equipo.rs:91` `exigir`, `:304` `anotar`, `:352` `clasificar` (en `..._logica.rs`) | la **única** concesión que abre ejecutar programas; interruptor por aparato dado en diálogo nativo, visible siempre, quitable con un clic; registro encadenado por SHA-256; clasifica órdenes que se confirman una a una |
| Transporte de la malla | `src/lib/malla/transporte-universal.ts` `enviarMensaje(…, canal, cuerpo, {esperarAcuseMs})` / `alRecibirMensaje` | elige el mejor enlace vivo (local, nativo TCP, cuenta WebRTC, par WebRTC, relé, LoRa); **el origen del mensaje NO prueba quién lo manda** (de ahí la firma); `CanalSellado` (MPT1108B) cifra el cuerpo extremo a extremo |
| Nodos de MetaGenesis | `src/lib/metagenesis/remoto-nodos.ts:56` `ACCIONES` (lista blanca), `:187` `textoAFirmar`, `:25` `TTL_NODO_MS`, `:27` `ORDEN_CADUCA_MS` | el patrón de nodo: latido → líder → foto; orden **firmada** (HMAC en el bus público; RLS directo en tablas de miembros); acción de **lista blanca**, nonce, caduca 15 min |
| Accesos a MetaGenesis | `src/lib/metagenesis/accesos.ts:46` `miAccesoMetaGenesis`, `:69` `darAcceso`, `:80` `quitarAcceso` | el patrón de gobierno privado: RLS por cuenta; los **dueños** dan y quitan acceso con rol; «no puede quedarse sin dueño» (`:39`) |
| Cerebro/motor remoto por túnel | `src/lib/metagenesis/remoto.ts:59` `motorUrlValida`, `:127` `crearFetchRemoto` | el token de sesión va **solo a una URL de motor válida** (https, sin ruta/puerto, `*.trycloudflare.com` o el propio origen); entre orígenes **nunca cookies** (`credentials:"omit"`) |
| Control host (lado controlado) | `src/lib/apps-remotas/anfitrion.ts:54` `crearAnfitrion` | capturar→dibujar→pista; ya acota calidad; hoy depende de la sesión nativa de préstamo |

**Lo que NO existe** (y por eso se construye): una firma por aparato aplicada a **órdenes de control** (hoy GEN1114 firma
entradas de chat; bank mode firma por HMAC de cuenta, que no distingue **qué** neurona manda); niveles (ver/controlar/
modificar/administrar) con su lista de capacidades por sesión; el gobierno de nodos por páginas/grupos/comunidades con
consenso; y el acceso con control a cerebros desde cualquier parte del OS (hoy solo la consola de `/metagenesis`).

---

## §1 Revisión de seguridad antes de construir

El control total a distancia es la función de mayor riesgo del sistema. Esta sección decide **si** cada fase se puede
construir y **qué** se deja fuera. Cada abuso, con cómo lo impide el contrato; lo que no se puede hacer seguro en una
fase, se **aplaza** a una posterior.

| # | Abuso | Cómo lo impide el contrato | Veredicto |
|---|---|---|---|
| A | **Origen web comprometido** (XSS en `starseed-os.vercel.app`, dependencia envenenada, despliegue ajeno) que pide firmas a la clave del aparato y manda órdenes | La clave firma lo que le pidan (`firma-aparato.ts:11-14`), así que la firma **no** basta por sí sola. El poder lo da **lo que el lado CONTROLADO acepta**, no quien firma: (1) el interruptor local «dejar que me controlen» por aparato, dado en diálogo nativo (`acceso_equipo.rs:91`), apagado de fábrica; (2) nivel `completo` para toda orden `alto`, que concede la Mac, nunca la web (`puerta-chats.ts:351`); (3) terminal/archivos solo con «Acceso al equipo» ya dado EN el aparato. Una web comprometida de una neurona **ya armada** no gana nada que esa web no tuviera (puede abrir su propia cámara); hacia **otra** neurona, solo llega al nivel que esa otra concedió, con indicador visible y parar en Rust | **Se construye**, porque el lado controlado es el que decide y el techo es la concesión local, no la firma |
| B | **Voto de comunidad malicioso** que se apropia de un aparato personal | **Cláusula pétrea:** el permiso del dueño de un aparato personal **nunca** lo anula un voto (§6). Una comunidad solo gobierna lo que el dueño **ofreció como nodo**; jamás llega a su sesión personal, sus archivos ni su interruptor de parada. El consenso solo abre nodos **públicos** declarados; el nivel `administrar` de un nodo lo tiene su dueño o el admin de la entidad, nunca se gana por un voto que el dueño no configuró | **Se construye** (fase 5), con el suelo del dueño inviolable |
| C | **Orden reenviada o repetida** por un relé o un atacante en la red | Firma por aparato (ECDSA) sobre carga canónica con **`seq` monótono** + **nonce** + **`caduca`**; el lado controlado lleva los `seq`/nonce vistos y rechaza repetidos (como `puerta-chats`, `remoto-nodos.ts:419` caducada, nonce repetido = 409). El reintento legítimo reenvía **la misma** orden firmada (`puerta-chats.ts:17`), no una nueva | **Se construye** |
| D | **Operador de un nodo público** que lee los datos de un invitado que corre en él | Terminal/archivos en un nodo público **solo dentro de un contenedor o usuario aislado**, nunca la sesión personal de nadie (§4). El cuerpo de las órdenes y la pantalla de una sesión privada van por **canal sellado** (`CanalSellado`, cifrado extremo a extremo) y por P2P antes que por relé; el operador del nodo o del relé transporta, no lee. La **tela de compatibilidad** de contenedores (apple/container, dockur/windows, budtmo/docker-android) es de otra tarea: aquí solo se exige el aislamiento como condición | **Se construye para cómputo aislado; el acceso a la sesión personal de un host se queda FUERA para siempre** |
| E | **Clave de aparato robada** (se copia el almacenamiento del navegador) | La privada es `extractable:false` y vive como `CryptoKey`, **no exportable** (`firma-aparato.ts:513`): no se puede copiar, solo usar en ESE navegador. Si se borran los datos del sitio, la clave **no se sustituye sola** (`:19-20`): se detecta y se pide emparejar de nuevo. Revocar un aparato (`revocarme`) corta su poder en el lado controlado aunque la clave siga | **Se construye**; robar la clave exige ejecutar en el aparato (cae en A) |
| F | **Armado a distancia** del modo control de un aparato | Imposible por diseño: armar es un **diálogo nativo** que la web no puede pulsar (`acceso_equipo.rs:109-121`); un mensaje de la malla solo puede **pedir** que se abra (`banco_armar_pedir` en BAN1113C §4.2). Ninguna orden enciende el interruptor | **Se construye** |
| G | **Teclear en campos sensibles o sobre diálogos del sistema** | El ejecutor nativo rechaza campos de contraseña (`AXSecureTextField`/`isPassword`/`ES_PASSWORD`) y los diálogos de permisos del sistema (PER1111S §4 regla 4); nunca escribe con el aparato bloqueado (regla 6). La app **jamás se autoconcede** permisos (PER1111S §1; prueba `inventario-nativo.test.ts`) | **Se construye** (fase 3+), con las lagunas conocidas de PER1111S §4.7 declaradas |
| H | **Indicador o registro saboteados** desde la página | El indicador, el atajo de parada y el registro viven en **Rust/Kotlin**, no en la web; la web ya no tiene `core:tray`/`core:menu` (SEG1111U). Parar cierra el canal en Rust aunque la página esté colgada. El registro es de solo-añadir encadenado por hash (`acceso_equipo.rs`), y quitar una línea se nota | **Se construye** |

**Lo que este contrato declara imposible de hacer seguro y deja fuera:** controlar la **sesión personal** de un host
desde un nodo público (D: solo contenedor aislado); **autoconceder** permisos del sistema (PER1111S §1); **desbloquear**
un aparato a distancia (los sistemas no lo permiten y no se intenta, PER1111S §4 regla 6); y, hasta que exista entrada
por nombre y argumentos tipados, cerrar del todo el riesgo de un **binario propio que esquive** la clasificación de
«Acceso al equipo» (SEG1111U §4.8.2: lo acota el aviso, el clic de quitar y el registro, no lo impide).

---

## §2 El canal único

Una orden viaja **firmada por el aparato que manda**, por la malla/P2P o por una capa de conciencia que ambos alcanzan,
y **solo surte efecto si el lado controlado la acepta**. Es el mismo canal para todo: entre neuronas de una cuenta, entre
nodos de una entidad y hacia un cerebro.

### §2.1 Anatomía de una orden

```
Orden (v:1, firmada por aparato — ECDSA de GEN1114):
  { v:1, de:<huella aparato>, cuenta:<id>, para:<neurona/nodo/cerebro destino>,
    nivel:"ver"|"controlar"|"modificar"|"administrar",
    sesion:<token de la sesión abierta en el destino>, seq:<monótono>, nonce,
    t, caduca,  accion:{ nombre:<lista cerrada>, args:<tipados> } }
  firma = ECDSA-P256(SHA-256, carga canónica)      # r‖s, como firma-aparato.ts:618
```

- **Firma por aparato, no por cuenta.** Bank mode firma con HMAC de la **clave de faro de la cuenta** (prueba «es mi
  cuenta», no **cuál** neurona). El control entre neuronas, y sobre todo el gobierno de nodos, necesita saber **qué**
  neurona manda y con qué **concesión**: por eso la orden se firma con la clave por aparato de GEN1114
  (`firma-aparato.ts`), cuya pública (`spki`) el destino conoce de `neuron_devices` y empareja contra la cuenta.
- **Vocabulario cerrado, nunca texto libre al motor.** La `accion.nombre` sale de una lista blanca por nivel (como
  `ACCIONES` de `remoto-nodos.ts:56` y el guion cerrado de bank mode); los `args` son tipados y validados en el destino
  (patrón `validarArgs`, `remoto-nodos.ts:137`). Ninguna cadena de la orden llega a enigo, a un shell ni al DOM como
  código.
- **La sesión la emite el destino.** Antes de la primera orden, el destino abre una **sesión** con su propia **lista de
  capacidades** (qué acciones admite ese aparato en este momento, por su OS y sus permisos) — igual que PER1111S §4
  regla 4 y la sesión de préstamo (`prestamo_ventana.rs:64`). El ejecutor nativo comprueba cada acción contra esa lista
  **antes** de ejecutarla; las acciones de clase «confirmar» paran la cola hasta el «Sí» local.

### §2.2 Transporte: P2P directo o capa de conciencia

- **P2P directo (preferido):** `transporte-universal` elige el mejor enlace vivo (local emparejado, TCP nativo, WebRTC de
  la cuenta o de un par, Bluetooth, LoRa). Para una sesión **privada**, el cuerpo va por `CanalSellado` (cifrado extremo
  a extremo) y se **prefiere P2P o servidor propio antes que un relé público aunque haya internet** (misma regla que
  `salas/sala.ts` `elegirTransporte`).
- **Capa de conciencia compartida (cuando no hay P2P):** un relé que ambos lados alcanzan — el bus firmado de
  MetaGenesis (`relevo_eventos`, órdenes HMAC porque la tabla es pública) o las tablas con RLS de miembros
  (`metagenesis-autonoma.md`), o el relé de la cuenta. Como la orden va firmada extremo a extremo y, si es privada,
  sellada, **el operador del relé transporta pero no forja ni lee**.
- La pantalla y el audio en vivo viajan como **pista** (WebRTC o pista nativa al WebView), igual que las llamadas y el
  préstamo de ventana; el canal de órdenes y el de medios son el mismo transporte, distintos flujos.

### §2.3 Niveles (los cuatro que pidió Alex)

| Nivel | Qué desbloquea | Qué exige en el destino |
|---|---|---|
| **ver** | Ver pantalla y oír audio en vivo, leer estado y registro | pantalla concedida (captura); nada más |
| **controlar** | + mover puntero, pulsar y teclear **dentro de la superficie prestada**; órdenes de app (abrir enlace, navegar, llamar) | Accesibilidad/entrada del OS (§3); campos de contraseña y diálogos del sistema rechazados (regla G) |
| **modificar** | + archivos, ajustes, procesos en primer y segundo plano, instalar | **«Acceso al equipo» ya dado EN el aparato** (§4); en nodo público, solo en contenedor aislado |
| **administrar** | + cambiar los permisos y el gobierno del **propio nodo**, enrolar o revocar otros controladores | ser el **dueño** del aparato o el **admin** de la entidad del nodo; nunca se gana por voto (§6, cláusula B) |

Cada nivel **contiene** a los anteriores. El nivel efectivo de una sesión = el **mínimo** entre lo que concedió el dueño/
entidad y lo que el OS del destino permite ahora. Un aparato `texto` de GEN1114 nunca sube de `ver` sin que la Mac/el
dueño lo marque `completo`.

### §2.4 Límites, indicador, registro y parada (de PER1111S §4, reutilizados tal cual)

- **Límites:** `seq` sin repeticiones, `t` dentro de ±5 min, `caduca` (como el timbre de faro y `ORDEN_CADUCA_MS`);
  tope de eventos de entrada por segundo y ≤ 512 caracteres por orden de texto (como `prestamo_ventana`); sesión con
  caducidad (1 h máx, se renueva confirmando) y cierre por **2 min sin actividad**, **reposo**, **pantalla bloqueada**,
  **indicador desaparecido** (SEG1111T §4.7).
- **Indicador imposible de pasar por alto:** ventana/borde de color siempre encima + icono rojo en la barra/bandeja
  (escritorio) o notificación en curso no descartable + superposición (Android), **en Rust/Kotlin**. Sin indicador
  posible, no hay control (como «Acceso al equipo»: sin bandeja, no se usa).
- **Parar con un toque que siempre funciona:** cierra el canal en Rust aunque la web esté colgada; atajo global fijo;
  **cualquier tecla o movimiento local pausa** el control al instante.
- **Registro de solo-añadir encadenado por hash** en el aparato controlado (como `acceso_equipo.log`), resumido en
  Genesis y en la ficha de la neurona; nunca guarda las capturas.

### §2.5 Fase 0 = el canal de bank mode, exactamente

La ronda automática de llamadas (BAN1113C) es el **primer uso** de este canal, no un camino aparte. Es la instancia más
estrecha del mismo diseño:

| Rasgo del canal general (§2.1–§2.4) | Cómo lo cumple bank mode HOY (BAN1113C) | Qué ensancha CRN sobre él |
|---|---|---|
| Orden firmada, verificada en el destino | `banco_orden_firmar`/`_verificar` en Rust, clave de faro, ts ±5 min, nonce, `de`==par armado, `para`==yo (§4.3) | la firma pasa de **HMAC de cuenta** a **ECDSA por aparato** (GEN1114): la orden prueba **qué** neurona, no solo la cuenta |
| Vocabulario cerrado | guion `{mudo,micro,camara-off/on,corte-ip,vuelve-ip,colgar}` (§1.2) | se añaden las acciones de `controlar`/`modificar` por nivel, siempre de lista blanca |
| Sesión emitida por el destino + lista de capacidades | «armar» por diálogo nativo; solo contesta si cámara/micro concedidos (§4.6) | la sesión declara su **lista de capacidades** por OS y nivel (§2.1) |
| Indicador, parar en Rust, nunca armar a distancia, registro | banda fija + icono + apagado por tiempo/uso; `banco_armar_pedir` solo pide (§4) | idénticos; se reutilizan |

Es «fase 0» porque **solo contesta llamadas** de una **única** neurona armada, sin pantalla, clic ni archivos: el canal
probado en lo mínimo. CRN construye encima sin tocar su camino: bank mode sigue siendo una serie de pruebas; el canal
general le añade identidad por aparato, niveles y vocabulario, reusando su firma/verificación en Rust, su banda y su
parada.

---

## §3 Qué desbloquea cada nivel por sistema, y el techo de cada OS

Hechos de PER1111S §2 (verificados) y del motor nativo (`ventana_remota.rs`: xcap/enigo son de escritorio). **La app
nunca se autoconcede permisos** (PER1111S §1; prueba `inventario-nativo.test.ts` prohíbe TCC.db/`tccutil`/`pm grant`/
`appops`): el control vive **dentro** del techo de cada sistema.

| Sistema | `ver` (captura) | `controlar` (clic/teclado) | Techo duro |
|---|---|---|---|
| **macOS** | Grabación de pantalla (aviso→panel, la activa la persona) | Accesibilidad + Monitorización de entrada (la persona en Ajustes); enigo/xcap funcionan | Accesibilidad/Pantalla/Entrada **solo las concede la persona**; Automatización de apps es por-uso, por app; no se desbloquea la pantalla |
| **Android** | MediaProjection (consentimiento **cada** sesión) + servicio en primer plano | **Servicio de accesibilidad** que la persona habilita (fuera de tienda, antes «permitir ajustes restringidos») + superposición para el indicador; `dispatchGesture` inyecta toques | sin el servicio de accesibilidad **no hay clic**; captura exige consentimiento por sesión |
| **iOS** | compartir **su propia** pantalla (ReplayKit), no capturar otras apps | **no puede controlar otras apps** (la plataforma no lo permite) | iOS solo puede ser **controlador** (manda órdenes) o destino de **`ver`** de su propia pantalla; nunca destino de clics |
| **Windows** | Graphics Capture (borde amarillo) | `SendInput` funciona | **no** sobre ventanas elevadas (UIPI) ni el escritorio seguro (UAC); saltarlo pide `uiAccess` firmado = fuera de alcance |
| **Linux X11** | cualquier cliente lee la pantalla | XTest (lo que usa enigo) | sin aislamiento (riesgo del propio X11) |
| **Linux Wayland** | portal `ScreenCast` (por sesión, con *restore token*) | portal `RemoteDesktop` (pregunta por sesión); **enigo no funciona** hoy salvo libei experimental | el portal pregunta cada sesión; control limitado |
| **Web (navegador, no app)** | `getDisplayMedia` de **su** pestaña | **nada** fuera de su página | sin puente nativo: una neurona solo-web puede ser **controlador** o compartir su propia pantalla, **nunca** destino de control del sistema |

El nivel efectivo = mínimo(concedido, techo del OS ahora). Si el OS no puede, la sesión lo dice en palabras y queda en el
nivel que sí puede (p. ej. iOS destino: solo `ver`).

---

## §4 Terminal y archivos

- **Solo con «Acceso al equipo» dado EN ese aparato** (`acceso_equipo.rs`, SEG1111U): es la única concesión que abre
  ejecutar programas y tocar archivos fuera de lo prestado. Una orden `modificar` que llegue sin esa concesión se
  responde `necesita-acceso` y **no** ejecuta; nunca dispara el diálogo del sistema ni se autoconcede.
- **Clasificación una-a-una** que ya existe (`acceso_equipo_logica::clasificar`): borrar/sobrescribir, ajustes/permisos/
  procesos/privilegios, credenciales, enviar datos fuera, instalar y órdenes opacas se **confirman en el aparato** aunque
  el acceso esté dado. El contrato no finge detectar pagos ni un binario propio que esquive (SEG1111U §4.8.2).
- **En un nodo público, nunca la sesión personal de nadie:** terminal y archivos solo dentro de un **contenedor o
  usuario aislado** que el nodo ofrece para eso (la tela de compatibilidad —apple/container, dockur/windows,
  budtmo/docker-android— es de **otra tarea**; aquí solo se exige el aislamiento como condición de seguridad, cláusula D).
- **Procesos en primer y segundo plano:** órdenes de lista blanca (lanzar/parar/ver), cada una registrada; segundo plano
  sigue las reglas de `apps-nativas-segundo-plano.md`.

---

## §5 Astraura como la mano

Una instrucción en lenguaje natural se convierte en una **secuencia de órdenes del canal**, nunca en acción directa:

1. **Astraura planifica** (en la neurona que manda): «abre este enlace, navega, pulsa Entrar» → una cola de órdenes de
   lista blanca `{abrir-enlace, capturar, localizar(objetivo), clic(x,y), teclear(texto)}`, cada una del nivel `controlar`.
2. **Localizar = captura → elementos clicables.** El motor estilo **OmniParser** (microsoft/OmniParser, divagr18/qwenputer,
   JMAN730/opendroid: captura → elementos estructurados) corre **en el aparato controlado** (es donde está la pantalla real
   y donde el ejecutor nativo valida el clic contra la ventana con el foco, `ventana_remota.rs`), y devuelve a Astraura los
   elementos para decidir el siguiente clic. Relayarlo (parsear en la neurona que manda) queda como **decisión abierta**
   (§9.3): sube latencia y saca capturas del aparato.
3. **Transmisión en vivo** de lo que hace: la pista de pantalla (`ver`) va a la neurona que manda **mientras** se ejecuta
   la cola, con el indicador encendido en el aparato controlado y cada clic/tecla en el registro. Alex ve los comandos en
   vivo, como pidió (Mac → tableta).
4. **Lo que Astraura hace sola / confirma / nunca:** idéntico a PER1111S §4 regla 4 — sola dentro de la ventana que la
   persona le asignó; **confirmación nativa cada vez** para pagos, credenciales, ajustes del sistema, borrar, publicar,
   instalar, aceptar términos; **nunca** campos de contraseña, diálogos de permisos, apagar el indicador ni el aparato
   bloqueado. La lista de capacidades por sesión (§2.1) lo hace cumplir en el ejecutor.

---

## §6 Nodos: proceso y transmisión, gobernados

Una neurona (un aparato; `neuronas-un-aparato.md`) puede declararse **nodo StarSeed**: **de proceso** (presta cómputo y
agentes, como el `contenedor` de `remoto-nodos.ts:82`) y/o **de transmisión** (releva señales de la malla). El modelo que
sigue es el que **MAP1114 (`mapa-de-senales.md`) referencia** para pintar los nodos y señales del mapa.

### §6.1 Qué es un nodo y sus estados (para el mapa de señales)

- **Tipos:** `proceso`, `transmision`, o ambos. Un nodo publica su **latido** (vivo/caído por `TTL_NODO_MS` = 15 min,
  `remoto-nodos.ts:25`) con su capacidad (cómputo, enlaces de malla activos) — la misma foto que ya leen los nodos de
  MetaGenesis.
- **Dueño y entidad:** todo nodo tiene un **dueño** (la cuenta del aparato) y puede estar **enrolado** a una entidad
  (comunidad, página, grupo o cuenta) que lo gobierna dentro de lo que el dueño ofreció.
- **Visibilidad:** `privado` (configurado a mano) o `publico` (gobernado democráticamente).
- **Niveles sobre el nodo:** los de §2.3 (ver/controlar/modificar/administrar) aplican al nodo como al aparato.

### §6.2 Nodo privado (configurado a mano)

Como `metagenesis_accesos` (`accesos.ts`): el **dueño** (y los admin que él nombre) dan y quitan acceso por cuenta y rol,
con RLS (cada cuenta ve su fila; el dueño, todas). Peticiones de acceso → el dueño/admin aprueba o rechaza. Sin voto.
Regla heredada: un nodo **no puede quedarse sin dueño** (`accesos.ts:39`).

### §6.3 Nodo público (gobierno democrático automático configurable)

La entidad fija una **política de consenso** por nivel y acción (apoyada en la gobernanza que ya existe en
`/network/politics` y `src/lib/sharing/`): **quórum**, **umbral** (p. ej. mayoría simple, 2/3), **caducidad** de la
petición, y **voto delegado líquido** revocable (Tríada §3). Una petición de un miembro para un nivel sobre un nodo
público:

1. se registra como **petición firmada** (por aparato, §2.1);
2. junta votos hasta el quórum/umbral o la caducidad;
3. si pasa, se emite una **concesión firmada por la entidad** (clave de la entidad) con nivel, caducidad y el aparato/
   cuenta beneficiario; el nodo la verifica como verifica una orden;
4. el consenso puede ser **automático** (se aplica al alcanzar el umbral) o **con visto bueno** de un admin, según la
   política — el patrón de nodos de aprobación humana ya real del Diseñador de olas.

### §6.4 La cláusula pétrea (cláusula B de §1)

**El permiso del dueño de un aparato personal nunca lo anula un voto.** Un nodo público ofrece **solo lo que su dueño
declaró como nodo** (cómputo en contenedor aislado, relevo de señal); el consenso de la comunidad **jamás** alcanza la
sesión personal del dueño, sus archivos personales, su interruptor de «dejar que me controlen» ni su botón de parada.
`administrar` sobre un aparato personal es **solo** del dueño. El voto gobierna el **servicio público** del nodo, no la
persona.

---

## §7 Cerebros remotos

Un **cerebro** StarSeed (cómputo + internet + Astraura) se accede con control total desde cualquier parte del OS, por
P2P directo o por la capa de conciencia, con el mismo canal y el mismo gobierno que un nodo.

- **Base que ya existe:** el motor remoto de MetaGenesis por túnel (`remoto.ts`): el token de sesión va **solo a una URL
  de motor válida** (https, sin ruta/puerto, `*.trycloudflare.com` o el propio origen; `motorUrlValida:59`), **nunca
  cookies entre orígenes** (`:160`), y el 401 renueva token y reintenta una vez. CRN generaliza esto de `/metagenesis` a
  «desde cualquier parte del OS».
- **Cerebro privado:** acceso por concesión del dueño (como §6.2); su cómputo y su Astraura responden al token de la
  sesión del miembro, con RLS. El tráfico sensible, sellado y preferiblemente P2P.
- **Cerebro público:** gobierno democrático (§6.3); el cómputo se presta **en contenedor/usuario aislado** (cláusula D),
  nunca la sesión personal del host. La salida a internet del cerebro pasa por la puerta de la malla con su registro.
- **Control total** = los cuatro niveles del §2.3 sobre el cerebro: `ver` su estado, `controlar` sus agentes y su
  navegación, `modificar` su cómputo y almacenamiento (con «Acceso al equipo» o contenedor), `administrar` sus accesos
  (dueño/entidad). Astraura del cerebro remoto se maneja por las mismas órdenes del §5.

---

## §8 Fases (cada una entregable; archivos que posee)

| Fase | Qué entrega | Necesita antes | Archivos que posee |
|---|---|---|---|
| **1 · Mac↔tableta, misma cuenta: ver pantalla + órdenes de app** sobre el canal de bank mode | ver la tableta en vivo desde la Mac y mandar `abrir-enlace`/`navegar`/`llamar`, firmado por aparato, con banda, parada y registro | PER1111S fase 2 (pantalla), BAN1113C (canal), GEN1114 (firma) | `native/src-tauri/src/control_remoto.rs` (+ `_logica.rs`): sesión, verificación ECDSA, lista de capacidades, indicador, parar · `src/lib/control-remoto/{canal,orden,sesion,niveles}.ts` + `__tests__` · `src/components/control-remoto/banda-control.tsx` · reusa `apps-remotas/anfitrion.ts` y `malla/transporte-universal.ts` |
| **2 · Astraura ejecuta las órdenes con transmisión en vivo** | la cola natural→órdenes del §5, con la pista de pantalla mientras actúa | fase 1 | `src/lib/control-remoto/astraura-mano.ts` · `src/lib/control-remoto/localizar-omniparser.ts` (parser en el aparato controlado) · `native/src-tauri/src/control_remoto_parser.rs` (si el parser corre nativo) |
| **3 · Clics/teclado del sistema donde el OS lo permite** | control real (no solo app): macOS Accesibilidad+Entrada, Android servicio de accesibilidad+superposición, Windows SendInput, Wayland portal | fase 2; manifiesto declara accesibilidad/superposición (Android) | amplía `native/src-tauri/src/control_remoto.rs` + `ventana_remota.rs` · `native/src-tauri/android/…` (AccessibilityService, `dispatchGesture`) · capability nueva en `capabilities/*.json` (una fila por permiso, inventario) |
| **4 · Páginas/grupos/comunidades con peticiones y consenso** | nodos privados (a mano) y públicos (consenso configurable); peticiones, aprobaciones, voto delegado | fase 3; gobernanza de `/network/politics` | `src/lib/nodos/{gobierno,consenso,peticiones,concesion-entidad}.ts` + `__tests__` · migración `supabase/migrations/*_nodos_gobierno.sql` (RLS, políticas) · `src/lib/metagenesis/accesos.ts` como patrón · `src/components/nodos/*` |
| **5 · Nodos y cerebros remotos y su gobierno** | declarar nodo (proceso/transmisión), cerebro público/privado, acceso con control desde cualquier parte del OS | fase 4; `remoto.ts` (túnel), `metagenesis-autonoma.md` | `src/lib/nodos/declaracion.ts` · `src/lib/cerebros-remotos/{acceso,canal}.ts` · amplía `src/lib/metagenesis/remoto.ts` a todo el OS · `src/components/cerebros/acceso-remoto.tsx` |

---

## §9 Decisiones abiertas para Alex (con recomendación)

1. **Firma del canal: ¿ECDSA por aparato desde fase 1, o HMAC de cuenta (como bank mode) y por aparato más tarde?**
   *Recomendación:* ECDSA por aparato **desde fase 1**. El HMAC de cuenta no distingue qué neurona manda, y el gobierno
   de nodos (fase 4) lo necesita; reutilizar GEN1114 evita una migración de firma a mitad de camino.
2. **Capa de conciencia por defecto para una sesión privada: ¿solo P2P, o relé sellado permitido cuando no hay P2P?**
   *Recomendación:* P2P primero siempre; relé **solo sellado** (`CanalSellado`) y solo cuando no hay P2P, con aviso en la
   banda de que va por relé. Nunca relé público en claro.
3. **Parser de pantalla (OmniParser): ¿en el aparato controlado o relayado a quien manda?**
   *Recomendación:* en el **aparato controlado** (menos latencia, las capturas no salen salvo la pista de `ver` que el
   dueño ya ve). Relayar solo si el aparato controlado no tiene cómputo para el parser, y entonces por canal sellado.
4. **Consenso automático: ¿se permite que un voto aplique una concesión sin visto bueno humano?**
   *Recomendación:* sí, **configurable por la entidad**, pero con un suelo: `administrar` y `modificar` sobre cualquier
   nodo exigen siempre un admin además del umbral; `ver`/`controlar` sobre un nodo público sí pueden ser automáticos.
5. **¿Un aparato personal puede enrolarse como nodo público?** *Recomendación:* sí, pero el nodo público solo expone
   cómputo en contenedor aislado y relevo de señal; la cláusula pétrea (§6.4) deja fuera la sesión personal pase lo que
   pase. Un aparato sin contenedor solo puede ser nodo público **de transmisión**.
6. **Caducidad de la sesión de control.** *Recomendación:* 1 h máxima como el préstamo de ventana, renovable
   confirmando; 2 min de inactividad la cierran. Para Astraura trabajando una tarea larga, renovación automática
   mientras el indicador siga encendido y haya actividad.

---

*Contrato CRN1114. No incluye código: solo este documento. La revisión de seguridad (§1) manda sobre las fases (§8):
ninguna se construye si su fila de §1 no queda en «se construye».*

---

## §10 Decisiones de Alex del 14-11-2026 (anotadas al integrar · DOC1114Z)

Fuente: órdenes O1114043351 y O1114043802 de la dirección principal al carril PRUEBAS (14-11, 04:33 y 04:38), que dicen que Alex las aprobó en vivo. Mandan sobre cualquier valor por defecto o recomendación escritos más arriba en este documento.

- **Un aparato personal solo es nodo público dentro de un contenedor aislado.**
- **Regla pétrea: el voto de una comunidad nunca anula el permiso del dueño de un aparato personal.**
- **El internet público compartido por las capas de conciencia de la malla ya estaba aprobado**: no es una decisión abierta.
