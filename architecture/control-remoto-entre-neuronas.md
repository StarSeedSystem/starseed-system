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

**Sesiones en vivo de entidades, canales y estaciones (SES1115Q):** el uso de este canal por páginas, grupos y transmisiones, y por qué las sesiones de documento no viajan por él, está en `architecture/sesiones-en-vivo-entidades-y-transmisiones.md`.

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

## §11 Lo que la fase 1 es de verdad, tal como está construida (2026-11-15 · ORD1114P/Q/T/V)

- **Firma en la página, todo lo demás nativo.** La firma ECDSA por aparato de cada orden (con `seq`, nonce y
  caducidad) la verifica la **página** del aparato controlado. La sesión, el indicador, la parada, el interruptor
  «dejar que me controlen» y el registro encadenado son **nativos** (Rust; en Android el indicador e interruptor,
  Kotlin). Eso basta para la fase 1, que no da a quien manda más poder que el que ya tiene la página (órdenes de
  app). **Antes de cualquier fase que dé más poder que la página (fase 3: clics y teclado del sistema), la
  verificación de la firma tiene que pasar al lado nativo.**
- **Interruptor nativo.** Apagado de fábrica y por aparato; solo lo enciende el «Sí» de un diálogo nativo
  (macOS: el de `tauri-plugin-dialog`, como «Acceso al equipo»; Android: el de Kotlin); la página solo puede
  pedir el diálogo. Apagarlo (página, «Terminar y quitar el permiso», menú de la barra) es inmediato y sin
  diálogo. Con él apagado, Rust niega la sesión con `interruptor-nativo-apagado` y lo anota.
- **Android 14 y posteriores** dejan descartar la notificación en curso del control. **CTL1117G (decisión del dueño, 17-11):** el
  servicio la VUELVE A PONER (`startForeground`, misma sesión, sin tocar token ni pausa) y el control sigue; solo «Terminar» (pastilla o
  aviso) y las paradas de siempre (caducidad, pérdida real del indicador…) lo cierran. Traza nativa `control-aviso repuesto motivo=descartado|ausente n=… [error=…] notificaciones=…`;
  si reponerla falla, se apunta y NO se termina mientras la pastilla siga a la vista.
- **Ver la pantalla del otro aparato no está construido todavía.**
- Windows, Linux e iOS niegan la sesión (`sin-indicador-nativo`): les falta el borde, el atajo o la pausa local.

---

## §12 Fases 2 y 3 tal como se construyen para Mac → Android (2026-11-15 · PAN1115J, AND1115K, VEN1115L)

Primer destino: la Mac manda, la tableta Android es la controlada, misma cuenta. Lo que sigue son enunciados de lo que
se construye; ninguno promete más que §2.3, §2.4 y §3, y lo que aquí no está, no se hace.

**Las dos fuentes de pantalla (las elige el aparato controlado, no quien manda).**
- **Capturas por accesibilidad.** Pocos cuadros por segundo. La persona enciende **una vez** el servicio de
  accesibilidad (en Android, antes «permitir ajustes restringidos») y el interruptor **«Ver la pantalla sin preguntar en
  cada sesión»**; con los dos encendidos no se pregunta nada por sesión. Sin esa persona delante, ninguno se enciende
  desde otro aparato.
- **Proyección de pantalla.** Fluida. Android **pregunta en cada sesión** y no se puede saltar; si la persona no está
  delante para contestar, no hay pantalla por esta vía.
- Si no hay ninguna de las dos, `pantalla-iniciar` se cumple y dice **qué falta** (`servicio-accesibilidad`,
  `ajustes-restringidos`, `consentimiento-pantalla`, `escribir-ajustes`); quien manda lo enseña con esas palabras y la
  persona lo arregla **en el aparato**. Los cuadros no se guardan ni se anotan.

**Cómo viajan.** La orden `pantalla-iniciar` (nivel `ver`) pide la fuente a lo nativo; el aparato pinta los cuadros en un
lienzo y los manda como **pista de vídeo** de una conexión P2P que se negocia por el canal de control: la oferta y los
candidatos de quien manda entran como órdenes `pantalla-senal`, la contestación (con los candidatos del aparato
dentro) vuelve en la respuesta. Reutiliza la configuración ICE de las llamadas, sin tocar su motor. El siguiente cuadro
se pide cuando el anterior ya se pintó: nunca hay cola de cuadros. La entrada firmada sale por un **canal de datos de
la misma conexión** si está abierto y, si no, por el canal de control. Con la conexión caída o sin ella, la sesión
sigue siendo de órdenes (fase 1).

**Órdenes nuevas (vocabulario cerrado; el sobre y la firma no cambian).**
`ver`: `pantalla-iniciar`, `pantalla-parar`, `pantalla-senal`, `leer-aparato`.
`controlar`: `gesto` (hasta 10 dedos, hasta 64 puntos por dedo, `x`/`y` de 0 a 1 de la pantalla tal como la enseñan los
cuadros, `dt` en ms, `sigue` mantiene los dedos puestos), `tecla` (`atras`, `inicio`, `recientes`, `notificaciones`,
`ajustes-rapidos`, `bloquear`, `captura`, `volumen-subir`, `volumen-bajar`, `silencio`, `menu-energia`), `volumen`
(`multimedia`, `llamada`, `timbre`, `alarma`; 0 a 1), `brillo` (0 a 1), `texto` (hasta 512 caracteres, sin controles
salvo salto de línea y tabulación). Un argumento fuera de rango, de más o con otra forma se rechaza como `argumentos`.
Como la orden firmada entera no pasa de 4 KB, quien manda **parte un gesto grande en varias órdenes** (todas «siguen»
menos la última, y todas nombran **todos** los dedos) y **funde** los gestos que esperan turno solo si llevan los mismos dedos.

**Entrada.** Tope de **60 órdenes de entrada por segundo** por aparato (cuenta aparte del tope de las órdenes de app).
La página del aparato controlado **no ejecuta** la entrada: comprueba lo de siempre (forma, firma, sesión, nivel, tope) y
entrega la orden, con su sobre intacto, a `control_entrada`, que la vuelve a comprobar en lo nativo (aparato aceptado,
regla G, pausa local). Fuera de una sesión de `controlar` esa entrega no se hace nunca.

**Regla G, también en lo nativo.** La entrada se rechaza (`regla-g`) mientras la ventana en primer plano sea un diálogo
de permisos o de consentimiento, el instalador de paquetes, los ajustes de accesibilidad, de administración del
dispositivo o de acceso especial, o las pantallas de permisos de control de esta app; y el texto se rechaza en un campo
de contraseña. El panel de ajustes rápidos, la cortina de notificaciones y los ajustes ordinarios **sí** se pueden
manejar. *(FSG1116, 16-11: los ajustes ordinarios ya **no**; ver §12.2.)*

**Toque local.** Un toque de la persona en el aparato pausa la entrada remota (`pausa-local`) hasta que pasan **3 s sin
tocar**; quien manda ve el estado `pausa-local`. Si Android no da una señal fiable de ese toque, el aparato lo dice con
palabras y **no lo finge**.

**Comprobación nativa del que manda.** Antes de actuar, lo nativo comprueba que cada orden de entrada viene de un aparato
**aceptado**. Aceptarlo para entrada se confirma en un **diálogo nativo que enseña su código de aparato**, y la clave
pública aceptada se guarda en lo nativo. Esto cumple lo que §11 exigía antes de dar más poder que la página.

**Qué permite cada nivel en Android.**
- `ver`: ver la pantalla (por la fuente que la persona haya habilitado), leer volumen, brillo, batería, red y estado de
  la pantalla del aparato, y las órdenes de fase 1 que son de `ver`. Ningún toque, tecla ni cambio.
- `controlar`: lo de `ver` y, además, toques y gestos multitáctiles, las teclas de la lista, volumen, brillo y texto,
  con regla G, pausa local y tope. Exige el servicio de accesibilidad encendido por la persona; sin él no hay toque.
- `modificar` y `administrar`: **no existen todavía** y se siguen rechazando.

**Qué se para y cuándo.** Pantalla, conexión y entrada paran juntas cuando la sesión se cierra, caduca (1 h) o pasa
2 min sin actividad, cuando el indicador desaparece, cuando la persona toca **Terminar** o apaga el interruptor, o cuando
la conexión cae. Con la sesión abierta, quien manda lee el estado del aparato cada 5 s, lo que cuenta como actividad.

**Lo que se queda fuera.**
- **macOS e iOS como aparatos controlados** (§3): iOS nunca recibe clics; macOS necesita su propia ronda (Grabación de
  pantalla, Accesibilidad y Monitorización de entrada, que solo concede la persona).
- El nivel **`modificar`** (archivos, ajustes, procesos, instalar) y **`administrar`**.
- Audio en vivo, portapapeles y transferencia de archivos.
- Un destino que no sea Android, y pantalla o control entre cuentas distintas.

### §12.1 Costuras decididas al unir las tres partes (2026-11-15 · UNI1115M)

**a. Comandos de Tauri: lo que la web manda y lo que Rust espera.** Tauri 2 pasa los argumentos en camelCase salvo que el
comando diga `rename_all = "snake_case"`; por eso solo `control_pantalla_iniciar` lo dice (lleva `lado_max`). La tabla
vive en `src/lib/control-remoto/nativo-comandos.ts`; `nativo-comandos.test.ts` (web, lee las firmas de Rust) y la prueba
`los_argumentos_de_los_comandos_son_los_de_la_tabla_de_la_web` (Rust, lee la tabla) fallan si un lado se desvía.

| Comando | Argumentos (web = Rust) | Devuelve |
|---|---|---|
| `control_capacidades` | — | `{ pantalla, entrada, falta }` (seam 1) |
| `control_abrir_ajuste` | `cual` | `{ ok }` · abre Ajustes o el diálogo nativo; lo hace la persona |
| `control_pantalla_iniciar` | `sesion`, `lado_max`, `calidad`, `fuente` | `{ ok, fuente, ancho, alto, giro }` o `{ ok:false, motivo, falta? }` |
| `control_pantalla_cuadro` | `sesion`, `desde` | bytes: cabecera de 12 bytes + JPEG, o cero bytes |
| `control_pantalla_parar` | `sesion` | `{ ok }` |
| `control_estado_aparato` | — | volumen, brillo, batería, red, pantalla |
| `control_entrada` | `sesion`, `sobre` | `{ ok }` o `{ ok:false, motivo }` |
| `control_entrada_aceptar` | `spki`, `cuenta`, `nombre` | `{ ok, pendiente, codigo }`; solo PIDE el diálogo |
| `control_entrada_aceptados` | — | `{ ok, controladores:[{ huella(8), nombre, codigo }] }` |
| `control_entrada_quitar` | `huella` (completa) | `{ ok, quitados }` o `{ ok:false, motivo }` · solo resta de la lista aceptada (PENB2) |

**b. `calidad`** es un **entero de 1 a 100** en el vocabulario de la web, en la llamada y en Rust (`u32`); no hay
fracciones. Lo nativo la acota a JPEG 20..95. `lado` (web) / `lado_max` (nativo): entero, 240..2048 en la web, 160..2048 en Rust.

**c. `sesion`** es **siempre el token de la sesión nativa** de la fase 1 (el que Rust da en `control_neuronas_abrir` y
`abrir-sesion` devuelve a quien manda); la página lo usa tal cual en `control_pantalla_*` y `control_entrada`, y la carga
firmada lo lleva en `carga.sesion`, que Rust compara con el mismo token.

**d. La carga de un `gesto`** viaja dentro del sobre firmado en **`carga.accion.args`** (`{ dedos, sigue }`), igual que
las demás órdenes. Cada punto es `[x, y, dt_ms]`: `x`,`y` de 0 a 1 del cuadro tal como se ve y **`dt_ms` = milisegundos
desde el punto anterior de ESE dedo** (en el primer punto de un dedo nuevo, 0; en el primero de una orden que continúa a
un dedo, desde su último punto de la orden anterior). La ventana, el vocabulario de la web, Rust y Kotlin usan esta misma
definición; Kotlin suma los `dt_ms` para la duración del trazo. Topes iguales en las dos orillas: 10 dedos, 64 puntos por dedo.

**e. Giro.** Los cuadros llegan **ya derechos**, como los ve la persona en la tableta (Android entrega la captura con la
orientación actual y `x`,`y` se multiplican por el ancho y alto de esa pantalla). El `giro` de la cabecera y el de
`pantalla-iniciar` son solo informativos: la web **siempre** le da `giro: 0` a la ventana, que no gira la imagen, y el
toque cae donde se hizo en las cuatro orientaciones del aparato. La ventana sigue sabiendo girar (`giro` 90/180/270) por si
un día un origen manda cuadros sin enderezar.

**f. Levantar un dedo con otros apoyados.** Un `gesto` con `sigue:true` **nombra todos los dedos que siguen abajo**; un
dedo que falta en él **se levanta al instante** (lo nativo lo suelta donde estaba, en el mismo gesto en que los otros
continúan). La ventana manda primero el último punto de todos, luego un `gesto` sin el dedo levantado, y la cola de quien
manda no funde gestos de dedos distintos ni quita dedos al partir uno grande.

**g. Aceptar a quien manda para la entrada.** Cuando la persona pulsa **Aceptar** en el panel de ESTE aparato y el nivel
es `controlar`, la página llama a `control_entrada_aceptar`; lo nativo enseña su diálogo con el **código del aparato** y
solo el «Sí» de la persona lo acepta (no hay otro camino: `control_entrada` rechaza `no-autorizado` mientras tanto). El
panel enseña quién está aceptado (`control_entrada_aceptados`) y la lista nativa se vacía al apagar el interruptor.

**Panel y ventana.** En el aparato controlado el panel dice lo que `control_capacidades().falta` pide, con un botón por
cosa (`control_abrir_ajuste`), el interruptor «Ver la pantalla sin preguntar en cada sesión» (su diálogo nativo) y si la
pantalla o la entrada se usan ahora. En quien manda, junto a cada neurona que ya aceptó hay «Abrir ventana de control»
(flotante, montada una vez en la cáscara de la app: sigue al cambiar de sección) y «Abrir en una pestaña»
(`/control-remoto?neurona=<id>&nombre=<nombre>`, parámetros de consulta para la interfaz estática de las apps nativas);
«Pedir controlarla desde aquí» abre la ventana sola cuando esa neurona acepta. Las frases de cada motivo de rechazo y de
cada estado están en `src/lib/control-remoto/palabras.ts`.

**Lo que solo se ve en los aparatos.** Cuántos cuadros por segundo da cada fuente de verdad, si la conexión sale por
Wi-Fi o por un relé, si Android avisa del toque local, qué ventanas cuenta la regla G como diálogo de permisos en cada
versión de Android y cómo se siente la latencia del multitáctil: ninguna prueba en un contenedor lo demuestra.

### §12.2 Revisión SEG1116 cerrada en lo nativo (2026-11-16 · FSG1116)

**Regla G al despachar (C1).** Cada gesto remoto se despacha en trozos de ≤ 200 ms encadenados con `continueStroke`, y
la regla G se decide **antes de cada trozo** (el primero y cada continuación), no al encolar. Si delante aparece algo
protegido, no se despacha nada nuevo: la cola se tira y los dedos que sigan abajo se levantan donde están (su flujo
táctil es de la ventana que recibió el primer toque). Un cambio de ventana con cola o dedos abajo hace lo mismo.

**Consentimientos que no se contestan desde otro aparato (C1).** El interruptor, aceptar un controlador, «ver sin
preguntar» y la proyección (también mientras pregunta la pantalla de Android) **congelan** la entrada remota desde el
instante en que se piden hasta que se cierran: la regla G lo niega todo, la cola y el gesto en curso se cortan, y no se
enseña un segundo consentimiento mientras haya uno abierto. El «Sí» además se ignora si desde que se pidió se despachó
un gesto remoto, si hay uno en el aire o si el toque vino de un aparato de entrada virtual. **Garantía:** mientras uno
de esos diálogos está abierto, este servicio de accesibilidad no inyecta nada. **Límite:** Android no deja a una ventana
saber con certeza si un toque fue inyectado; la comprobación del aparato virtual es una defensa añadida, sin verificar
en el aparato. Otro servicio de accesibilidad instalado por la persona queda fuera de este control.

**Qué protege la regla G (A1).** Se decide por **paquete** y por el **tipo de ventana** que da Android, nunca por nombres
de clase o títulos. La lista es una sola, `native/src-tauri/src/control_regla_g.txt`: Rust la lee y `build.rs` escribe
con ella la de Kotlin. Protegidos siempre (cualquier ventana suya a la vista): controlador de permisos, instaladores,
**Ajustes entera** (sus pantallas permitidas no se distinguen con fiabilidad de Accesibilidad, Acceso especial o
Administradores, que se abren dentro de la misma actividad), servicios de Google (cuentas, Play Protect), gestor de
credenciales y certificados, Play Store y otras tiendas. De la interfaz del sistema, sus **actividades** (consentimiento
de captura, USB). De esta app, sus ventanas de **actividad** (su panel de control y sus diálogos): quien manda no maneja
StarSeed OS en la tableta. Además: pantalla bloqueada, foco en un campo de contraseña (tampoco el teclado en pantalla) o
nada a la vista. **Sigue permitido:** la cortina de notificaciones y los ajustes rápidos (ventanas de sistema). Es lo que
el contrato deja; quien manda puede pulsar ahí acciones de notificaciones de otras apps y ver su contenido (también
códigos de un solo uso), y cambiar interruptores rápidos (Wi-Fi, Bluetooth, modo avión). Tocar un ajuste rápido que
abre Ajustes queda parado en cuanto Ajustes sale delante. Apps de banca o autenticadores no están en la lista.

**La sesión la abre lo nativo (A2).** En Android, `control_neuronas_abrir` recibe la orden firmada `abrir-sesion` tal como
llegó y Rust la comprueba igual que la entrada (forma, controlador en `aceptados.json`, firma, hora, no repetida; las
aperturas vistas no se olvidan al cerrar). El `de` y el **nombre del indicador** salen de esa lista nativa; la página solo
puede bajar el nivel. La pantalla (`control_pantalla_iniciar`) exige además que ese controlador siga aceptado, y cada
orden de entrada debe venir del mismo controlador que abrió la sesión. En el escritorio no cambia nada: allí no hay
pantalla ni entrada nativas.

**Lo que puede y no puede una web comprometida (A3).**
- *En la tableta (la web que carga la app):* **no** puede abrir una sesión, ver la pantalla, leer cuadros, inyectar
  nada ni poner otro nombre en el indicador sin una orden firmada de un controlador aceptado en el diálogo nativo; **no**
  puede contestar ningún consentimiento. **Sí** puede: pedir que salga el diálogo de aceptar (con el nombre y la clave que
  quiera; la persona compara el código), pedir el de «ver sin preguntar» o el del interruptor, abrir pantallas de Ajustes
  de la lista cerrada, quitar controladores o apagar el control, y negarse a obedecer. Si guarda una `abrir-sesion`
  legítima, la puede usar una sola vez durante sus 2 minutos (el indicador sale igual).
- *En la Mac que manda (la web de `starseed-os.vercel.app`, donde vive la clave de firma no exportable):* **puede**
  firmar cualquier orden con esa clave mientras corre: abrir sesiones, ver la pantalla y mandar entrada dentro de
  todo lo anterior (indicador visible, regla G, pausa, topes). Quien controle el despliegue de la web controla, en la
  práctica, lo que la Mac aceptada puede hacer en la tableta. Arreglo pendiente, fuera de esta revisión: firmar con una
  clave nativa (Keychain/Keystore) y servir la web de control empaquetada.

**Medio (M1–M6).** «Terminar», la pausa local y el servicio que se va cortan el gesto en curso en ≤ 200 ms (M6). Un gesto
inyectado que Android cancela porque la persona tocó cuenta como toque local y pausa; lo propio se oye 150 ms (M1). En
pausa, con la pantalla bloqueada o tras parar no se escribe ni se sirve ningún cuadro y se borra el que hubiera (M2,
M3); los cuadros siguen pasando por un archivo privado de la app (`cuadro.bin`, reemplazado y borrado), no por memoria.
Lo que guarda el control no viaja en la copia de seguridad ni en la transferencia entre aparatos (M4). En Android los
comandos del control solo responden a la web publicada o al puerto que la app sirve en ese momento (M5).

## CTL1117A · sesión que no se cae sola (2026-11-17)

- **Una sesión por neurona, compartida** (`registro-sesiones.ts`): una sola `abrir-sesion` en vuelo; con una sesión viva se reutiliza; `cerrar-sesion` sale solo al soltar el último dueño y con SU token. Rust: `abrir` con la sesión viva y el mismo controlador devuelve el mismo token (no estira la hora máxima de 1 h); cerrojo de aperturas; el indicador huérfano se quita a los 3 s sin sesión.
- **Presupuestos** (`sesion.ts`): órdenes de app 5/s · lecturas (`leer-estado`, `leer-aparato`) 5/s · entrada 60/s · techo total 70/s por controlador.
- **Un solo carril de emisión** en la ventana (`pantalla-destino.ts`): se firma y se manda en orden; «repetida» y «limite» se reenvían una vez, nunca se pierde un toque en silencio.
- **Regla G**: con una ventana protegida delante pasa SOLO la tecla Inicio, por lista positiva (`salida <paquete>` en `control_regla_g.txt`, la misma para Rust y Kotlin): únicamente si TODAS las ventanas protegidas a la vista son de la propia app, de Ajustes (sin managedprovisioning) o de una tienda. Con a la vista permisos, instaladores, credenciales/cuentas/certificados, managedprovisioning o una actividad de systemui se niega (`regla-g`); igual con consentimiento abierto/pedido, pantalla bloqueada, contraseña con foco o ninguna ventana. Traza `entrada-inicio-protegida`.
- **Latido de cuadros** (`latidoDeCuadros`, ≤1,5 s) y **pausa-local** que se quita sola a los 3 s en Android.

## CTL1117C · control con la app detrás, Inicio y motivo de parada (2026-11-17 · prueba 49)

- **Segundo plano (FALLO 1).** `WryActivity.onPause()` llama a `mWebView.onPause()`; con la actividad parada la página queda oculta (temporizadores alineados a 1 s o más, renderizador de menor prioridad). Todo lo de la pantalla remota (bucle `control_pantalla_cuadro`, lienzo, latido de cuadros) y parte de las órdenes viven en esa página. Medida nativa, SOLO con sesión y su indicador a la vista: `ControlFondo` (ControlNeuronasStarSeed.kt) reanuda el WebView (`onResume` + `resumeTimers`, como `PuertaSegundoPlano`) a los 300 ms de cada onPause/onStop y en cada latido del indicador (2 s), y pide prioridad IMPORTANTE del renderizador; al cerrar devuelve todo como estaba. Segunda red en la página: las esperas del bucle y el latido de cuadros corren con `RelojEstable` (Worker; `reloj-estable.ts`). Sin permisos nuevos.
- **Diagnóstico.** `control-fondo` (página + lo nativo: `kotlin-en-fondo`, `medida`, `reanudos`, `latido-ms`) al pasar a segundo plano, cada ~10 s y al volver; `control-sesion fin de=… motivo=… latido-ms=…` al acabar cualquier sesión; `control-entrada tecla inicio negada-por-regla-g ventanas=<clase>/<tipo>[/activa],… marcas=…`.
- **Inicio (FALLO 2).** Una ventana sin raíz cuenta como la propia app solo si es la activa y la raíz de la activa es de la app (`ventana_sin_raiz_es_propia`); la lista positiva `salida` no cambia.
- **Parada (FALLO 3).** `parada-nativa` lleva el motivo real (`resultado.detalle.motivo`); `claveParadaNativa` → frase propia. Solo `la-persona-desde-…` (indicador, notificación, superposición) dice «Terminar».
- **Inicio y systemui (CTL1117E · prueba .50).** Una actividad de `sistema` (systemui) solo niega Inicio si es la ventana activa o tiene el foco (un diálogo de verdad: captura, depuración USB…); un aviso emergente o una barra flotante sin foco no estorba. Las `protegido` que no son `salida` niegan siempre. La traza de las `sistema-actividad` (también cuando Inicio pasa) añade `foco/activa/tam/titulo` para identificarlas. La ventana reintenta una vez con la sesión más nueva del registro si la que usó caducó.

## CTL1117F · pausa local pegada y sesión caducada con la ventana abierta (2026-11-17 · prueba .50)

- **Qué se vio.** Tras un toque remoto se paraban a la vez los cuadros, las órdenes (`ordenes=0`) y, a los 2 min, la sesión (`caducada`). Una pausa local no renueva (`Control::orden` rechaza con `Pausada` y no toca `ultima_ms`), y la página no cuenta las órdenes rechazadas: una pausa que no se quita se ve exactamente así.
- **Lo que se arregla (Kotlin).** `reanudar()` se negaba mientras `esGestoPropio()` y `reanudarPorSilencio` no volvía a armar el reloj: la pausa quedaba pegada. Ahora se vuelve a armar y cada latido (2 s) comprueba que haya 3 s sin tocar (`vigilarPausa`). El toque propio cubre también un gesto en el aire (`ocupado()`) y 400 ms tras cada trozo (`COLA_GESTO_MS`, antes 150): el eco que llega tarde con el hilo principal ocupado ya no pausa. El toque de la persona sigue pausando 3 s y «Terminar» sigue mandando.
- **Ventana (Mac).** El carril único de emisión suelta el turno a los `LIMITE_CARRIL_MS` (20 s) aunque una orden no vuelva: una lectura colgada ya no deja a la sesión sin renovar. La renovación sigue siendo solo por la orden firmada.
- **Diagnóstico.** `control-pausa` (Rust, vigía, sin la página): `entra motivo=toque-fuera|gesto-cancelado desde-gesto-ms=… ignorados=… pausas=…`, `sale motivo=reanudada-sola|reanudada-vigia|reanudada-por-la-persona dur-ms=…`, `breves n=… ultima=…` (pausas más cortas que el sondeo). `control-fondo` suma `pausa=si|no` y `cuadro-ms=` (ms desde el último cuadro que Kotlin escribió; -1 = ninguno). Las líneas nativas llevan la hora de la tableta, así que al volver a verse en la Mac conservan su hora real.

## CTL1117G · aviso fijo repuesto y congelado total tras el toque (2026-11-17 · prueba .50)

- **Aviso fijo.** `DESCARTADA` ya no termina: `reponerAviso` (Kotlin) + vigilancia en cada latido (`activeNotifications` sin el id -> `ausente`). Candidatos a quién lo disparó a las 20:22:18 (sin dedo del dueño): `deleteIntent` también salta cuando la quita el sistema o nuestro propio `stopForeground(REMOVE)`/`cancel`; el único `cancel` propio es `cerrar()` (fin de sesión), tras el que `DESCARTADA` ya se ignora (`mostrando=false`).
- **Congelado.** Ningún camino de Kotlin pausa el WebView con sesión viva: `ControlFondo.soltar` (`w.onPause()`) solo corre en `cerrar`, `onDestroy` y si `mostrando=false`. La pausa local no toca el primer plano (solo `notify` del mismo id). El hilo principal no tiene esperas sin fin en la pausa; `ventanaProtegida` hace IPC por ventana pero con tiempo acotado por Android. No se encontró el disparo; se añade lo que falta para verlo: `control-pulso` (Rust, un tic/s, línea cada 30 s y `hueco hueco-pared-ms=… hueco-mono-ms=…` si el proceso estuvo parado >5 s, con su hora real).

## CTL1117H · indicador rediseñado, ajustes locales y color público (2026-11-17)

- **Indicador.** Se acabó el borde rojo a toda pantalla y la pastilla ancha. Siempre hay un **aviso fijo en lista** (InboxStyle: una línea por controlador con nombre, nivel y desde cuándo, en el color del controlador, con «Terminar» y «Pausar»/«Reanudar»; descartarlo lo repone, G). Además, si `indicador=punto`, un **punto de 12 dp** con borde blanco; al tocarlo se abre un panel (nombre, nivel, desde cuándo, «Terminar», «Pausar»/«Reanudar») que se pliega a los 5 s. Con `indicador=oculto` no se dibuja nada, pero la misma ventana existe con 1×1 px: es la que oye `ACTION_OUTSIDE` (el toque local que pausa), así que la pausa por toque no depende del punto.
- **Qué prueba el «indicador a la vista».** NO cambia: `visible()` en Rust = Kotlin dice `mostrando` + sesión igual + latido de `estado.json` de ≤ 6 s + sin parada. Kotlin solo pone `mostrando` tras tener el primer plano con su aviso y la ventana de la pausa añadida (si no hay «Mostrar sobre otras apps» no hay sesión, como antes). Es decir: ahora lo «visible» garantizado es el aviso fijo vivo; el punto es opcional. «Pausar» a mano solo la quita «Reanudar»; la de un toque local sigue quitándose sola a los 3 s.
- **Ajustes locales** (`control_ajustes_leer` / `control_ajustes_poner`, solo la página de ESTE aparato; ninguna orden remota los toca): `indicador` (`punto`|`oculto`) y `ver_toques` (bool). Rust los guarda (`control-ajustes.json`; en Android `ajustes.json` junto a `estado.json`), avisa a Kotlin con la petición `ajustes` y anota `ajustes` en el registro. `control-pulso` añade `indicador=… toques=…`.
- **Color público.** `color_por_defecto(id)` (Rust, `control_ajustes.rs`) = `colorPorDefecto(id)` (TS, `src/lib/neurons/color-publico.ts`): tono = (suma de bytes del id × 31 + longitud) mod 360, S 70 %, L 55 %; cinco ids fijados en las dos pruebas. El controlador puede declarar su color (`#rrggbb` en minúsculas) en `abrir-sesion` (`args.color`) y en `presentarse`; va FIRMADO y Rust lo valida en `verificar_apertura`; si falta o no vale se usa el de su huella. Otro argumento sigue siendo forma inválida.
- **Toques visibles.** Con `ver_toques`, sesión viva y sin pausa: anillo de ~450 ms + punto central en el color del controlador, estela corta si arrastra y una marca de texto de ~1,5 s al escribir («⌨ escribió N caracteres»: nunca el texto). Es una capa `TYPE_ACCESSIBILITY_OVERLAY` no tocable ni enfocable que se crea con el primer efecto y se quita al acabar el último; la regla G la salta como a todo overlay de accesibilidad.

## CTL1117I · color público firmado y lado web del indicador (2026-11-17)

- **Dónde vive el color.** `NeuronSettings.colorPublico` (`#rrggbb` en minúsculas) en `starseed.neurons.prefs.v1`, la misma clave de los demás ajustes de la neurona (viaja con la cuenta): **sin migración y sin tocar la base de datos**. Sin dato, o con uno que no vale, se usa `colorPorDefecto(id)`, así que lo ya instalado no cambia. Se elige en los ajustes de la neurona (`SelectorColorNeurona`: 12 muestras legibles en claro y oscuro + color propio) y se publica con la presencia (`PresenciaMedio.col`; las webs anteriores no lo mandan y se usa el de su id).
- **Lo firma el controlador.** `firmarSobre` (única función que firma órdenes de control) añade `args.color` = color de ESTA neurona en `presentarse` y `abrir-sesion`, dentro de lo firmado; por eso lo cubren de golpe `canal.ts`, `registro-sesiones.ts`, `pantalla-destino.ts` y el banco. La puerta web guarda el color firmado en `SesionActiva.color`.
- **Indicador web.** `BandaControl` ya no pinta banda roja: con `indicador=punto` (de fábrica, y en web/escritorio) un punto en la esquina del color de quien controla, con panelito (quién, nivel, desde, color, «Terminar»; se pliega a los 5 s). Con `oculto` no dibuja nada; el panel «Control entre mis neuronas» → «Cómo se ve que te controlan» dice quién controla y deja «Terminar», y ahí se cambian `indicador` y `ver_toques` (`ajustes-aparato.ts`; apagados con el motivo si el aparato no tiene control de pantalla propio).
- **Quién es quién.** Punto de color junto al nombre en la ventana de control, en las listas del panel y en «Tus toques»; cada clic propio en la imagen pinta al instante una onda de MI color (anillo + punto, 450 ms, sin esperar al vídeo).
