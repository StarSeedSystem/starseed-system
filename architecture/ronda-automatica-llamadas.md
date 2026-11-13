# Ronda automática de llamadas (BAN1113C · 2026-11-13)

Contrato, no código. Dice cómo MetaGenesis («Genesis» en todo texto visible) hace llamadas de prueba entre la Mac y la
tableta **sin que Alex esté delante**, qué no se puede automatizar y qué lo sustituye, cómo se juzga cada comprobación con
números, qué impide que el modo se convierta en una puerta abierta y en qué fases se construye.

Base leída: `mac-main` = `12dd86d91`. Hermanos: `architecture/llamadas-telefonia.md` (§9c carriles, §11 director y banco,
§12 ronda), `architecture/centro-versiones-1105.md` §11–12, `architecture/permisos-y-control-del-dispositivo.md` §1 y §4.8.

> **Ojo con la ruta de la app nativa.** El encargo nombra `src-tauri/**`; esa carpeta está retirada
> (`src-tauri/RETIRADO.md`). La app nativa vive en `native/src-tauri/` y todo lo nativo de este contrato se refiere a ella.

---

## §0 Lo que existe y lo que no (verificado)

**Medido en la Mac hoy (13-11, ~20:20, órdenes de solo lectura):**
- `comprobaciones_prueba.py ver 41`: 18 comprobaciones; c1 y c2 `falla`, c3 y c10 `bien`, 14 pendientes (§3 las mapea).
- `pruebas-banco.json`: 5 llamadas; cada una con `id, desde, hasta, duracion_s, con, terminada, medios, enlaces,
  kbps_rapido, lados, version_relacion, version_mac`; cada lado (`mac`, `maggaboard`) con `voz` (`inventado_pct_max`,
  `perdida_pct_max`, `bajo_suelo_lineas`, `jitter_ms_max`, `mudo_s`…), `video` (`fps_recibidos_med`, `fps_enviados_med`,
  `negros`, `pausas`…), `camara` y `lineas`. Las líneas de la tableta llegan a la Mac **8 s después** de su hora interna
  (llamada 19:15:13: `19:17:29 web (Maggaboard) 19:17:21 …`).
- Mac: 8 núcleos, 8 GB; `kern.memorystatus_vm_pressure_level` = **2 (aviso)**; `memory_pressure -Q` dice 39 % libre a la
  vez (ese porcentaje NO basta: §5); swap 8,69 GB de 10,24 GB; 11 GB libres en `/System/Volumes/Data`; `ronda.py estado`:
  sin ronda, carga 7,2 con umbral 4,0. El servidor local de la app (`servidor-local.log`) es lo que carga la ventana; a las
  20:19 la app estaba cerrada.

**Lo que ya existe y este contrato reutiliza (archivo:línea):**

| Pieza | Dónde | Qué da |
|---|---|---|
| Llamar a una neurona | `src/lib/mensajeria/neuronas/llamadas-neurona.ts:171` `llamarANeurona` | decide motor (`planLlamada`, `ruta-llamada-neurona.ts:33`) y llama |
| Llamada sin servidor | `src/lib/llamadas/acciones.ts:429` `empezarLlamadaSinChat({…, neurona, sinServidor})` | señalización por el enlace directo |
| Contestar | `acciones.ts:738` `aceptarTimbre(t, {camara})` | hoy solo desde la tarjeta: «La persona decide: nada se contesta solo» (`llamadas-neurona.ts:366`) |
| Colgar | `acciones.ts:821` `colgarLlamada(motivo)` → `motor.ts:2728` |
| Mudo / cámara | `motor.ts:521` `alternarMicro`, `motor.ts:538` `alternarCamara`, `motor.ts:704` `cambiarCamara` |
| Forzar carril por flujo | `motor.ts:1984` `forzarCarril(flujo, carril)`; `carriles.ts:238`; el forzado solo manda si está arriba (`carriles.ts:307-308`) |
| Silencio de WebRTC = caído | `carriles.ts:68` `SILENCIO_WEBRTC_MS = 1000` |
| Conexión WebRTC | `motor.ts:1299` `new RTCPeerConnection({ iceServers })` (sin `iceTransportPolicy`) |
| Línea de llamada al registro | `voz-datos/diagnostico.ts:23` `anotarLlamada(hito, neurona, detalle)` → `ble_registro_anexar` (`native/src-tauri/src/ble.rs:1590`) → `enlaces.log` |
| Registro de la tableta en la Mac | espejo por Bluetooth, `bluetooth-directo-motor.ts:926-947`: cada ~25 s, **nunca con voz o vídeo en cola**, acotado a 200 líneas y en bytes, repetidas colapsadas |
| Canal de aplicación por la malla | `malla/transporte-universal.ts` `enviarMensaje(…, canal, cuerpo, {esperarAcuseMs})` / `alRecibirMensaje` (`:660`); el origen trae `{tipo, enlaceId, etiqueta, syncDeviceId?}` (`:651`) |
| Firma «de mi cuenta» | `native/src-tauri/src/llamada_entrante.rs:68-75` `llamada_timbre_firmar` (HMAC con la clave de faro de la cuenta, ts + nonce); verificación SOLO en Rust y solo para tramas del TCP 47071 (`:79-95`), **sin comando para la web** |
| Saludo Bluetooth firmado + prueba de cuenta | `bluetooth-directo-motor.ts:777-787`, `:836-838`; control solo de la neurona ligada con su huella (`:955-958`) |
| Diálogo nativo que la web no puede pulsar | `native/src-tauri/src/acceso_equipo.rs:109-121` (`tauri_plugin_dialog`, escritorio) |
| Medios concedidos a la página de la app sin preguntar si el sistema ya los dio | `permisos_medios.rs:134-140`; estado: `permisos_medios.rs:178` `medios_estado` |
| Pantalla encendida | `src/lib/install/usar-despierto.ts` (`navigator.wakeLock`) |
| Ronda de aparatos (cerrojo) | `scripts/puente/ronda.py`: 30 min por defecto, **90 máx. desde el inicio** (`:54-55`); calma = sin pesados, carga1 ≤ `max(2, 0,5·núcleos)` (`:397-401`), presión < aviso (`:283`) |
| Peticiones al director | `director_pruebas_logica.py:13-15` (`app-abrir`, `ronda-iniciar`, `ronda-terminar`…) |
| Banco | `banco_pruebas_logica.py`: agrupa por hora **interna** de cada línea (`:71`), corta llamada a 90 s de hueco o 5 s tras colgar (`:24-25`), **guarda solo las 10 últimas** (`:22`, `:713`), una sugerencia nunca marca (`:5-6`) |

**Lo que NO existe** (y por eso hay que construirlo):
1. Ninguna vía de MetaGenesis hacia la app abierta: el director lo dice al rechazar (`director_pruebas.py:486-487`, «pedirle
   desde fuera … no es posible»).
2. Nada contesta solo (`llamadas-neurona.ts:366`).
3. Ninguna marca de escenario en el registro: el banco no puede saber qué llamada era de qué prueba.
4. Ninguna forma de quitar la ruta IP a una llamada sin tocar la radio.

---

## §1 El bucle

### §1.1 Piezas nuevas (nombres fijos)

| Pieza | Dónde corre | Qué hace |
|---|---|---|
| `scripts/puente/banco_llamadas.py` (+ `_logica.py`) | Mac, Python | lleva la **serie**: toma la ronda, mira la calma, escribe la orden, espera la evidencia, juzga, escribe `banco-llamadas.json` |
| `~/.starseed/produccion/banco-llamadas/orden.json` | disco Mac | la orden en curso (la escribe SOLO `banco_llamadas.py`) |
| `~/.starseed/produccion/banco-llamadas/calma.json` | disco Mac | la última lectura de calma (cada 30 s mientras hay serie) |
| `GET /api/banco-llamadas` (`src/app/api/banco-llamadas/route.ts`) | servidor local de la app de la Mac | devuelve `orden.json` + `calma.json`; fuera del servidor local (web publicada, tableta) responde `{disponible:false}` |
| `src/lib/banco-llamadas/**` | web de las dos apps | el **actor**: modo banco, guion, contestador, marcas en el registro |
| `native/src-tauri/src/banco_llamadas.rs` (+ `_logica.rs`) | Rust, las dos apps | armar/desarmar (diálogo nativo), estado en memoria, firmar y verificar órdenes con la clave de faro |

### §1.2 Los pasos

```
 Genesis/supervisor            Mac: Python                 Mac: app (web+Rust)             Tableta: app (web+Rust)
 ──────────────────            ───────────                 ───────────────────             ───────────────────────
 pedir banco-serie c2×10 ──▶ director_pruebas: valida
                             banco_llamadas.py serie:
                             1 calma ok 3 lecturas/2 min
                             2 ronda-iniciar 90 min
                             3 escribe orden.json n=1 ──▶ 4 sondea GET /api/banco-llamadas
                                                            (cada 5 s, solo si ARMADA)
                                                          5 Rust firma orden (faro) ──────▶ 6 canal «banco-llamadas»:
                                                            por transporte-universal          Rust verifica firma,
                                                                                              de == par armado,
                                                                                              para == yo, ts ±5 min,
                                                                                              nonce nuevo
                                                          7 ◀────────── acuse «lista» ─────── (medios_estado: cámara y
                                                                                              micro concedidos; sin
                                                                                              otra llamada)
                                                          8 anota «banco inicio esc=… n=1»
                                                          9 llamarANeurona / empezar…SinChat
                                                            (perfil del escenario) ───────▶ 10 timbre con sesión de la
                                                                                              orden ⇒ aceptarTimbre
                                                                                              {camara:true}; anota
                                                                                              «banco contesta esc=…»
                                                          11 guion: a los t s mudo, cámara,
                                                             corte IP lógico… (ambas puntas
                                                             cumplen SU parte de la orden)
                                                          12 cuelga quien diga el guion
                                                          13 anota «banco fin esc=… n=1 cuelga=mac»
                             14 espera evidencia: líneas de la
                                tableta con hora ≥ fin, o 120 s
                             15 lee enlaces.log, juzga la llamada
                                (§3), escribe banco-llamadas.json
                             16 pausa ≥ 60 s; renueva la ronda
                                si quedan < 15 min; n=2 … ──▶ (vuelve a 4)
                             17 al acabar: ronda-terminar, veredicto
                                de la serie (sugerencia, §3.3)
```

- **Canal Python → app de la Mac:** archivo + ruta GET del servidor local. La guarda del servidor local exige para
  `/api/*` la cookie `starseed_pase` que solo tiene la ventana de la app (`native/servidor-local/guarda.cjs:12-20`): ni otra
  web del navegador ni otro programa leen la orden por ahí. Python no escribe en la app; la app sondea.
- **Canal app de la Mac → tableta:** `transporte-universal` con un canal nuevo `banco-llamadas`, por el mejor enlace vivo
  (Bluetooth incluido). El cuerpo va firmado en Rust (§4.3); el origen del mensaje NO prueba quién es (el canal de llamada
  directa se fía del `de` del cuerpo, `llamada-directa-respaldo.ts:115-120`), por eso la firma.
- **Canal de la evidencia:** el de siempre (`anotarLlamada` → `enlaces.log`; la tableta por el espejo Bluetooth). Las
  marcas nuevas son líneas `llamada` con el mensaje `banco <evento> esc=<id> serie=<s> n=<k> …`, de modo que el agrupador
  del banco (`banco_pruebas_logica.py:125-140`) las mete en el grupo de esa llamada sin cambiar sus reglas.
- **Quién dispara cada paso:** Python solo escribe `orden.json`; la app de la Mac es quien llama; la tableta solo contesta
  órdenes verificadas y cumple su parte del guion. Ninguna punta hace nada por un mensaje que no sea una orden firmada.
- **Orden (`orden.json`, v1):** `{v:1, serie, n, de_n, escenario, para:<neurona tableta>, tipo:"video"|"audio",
  medio:"auto"|"solo-ble"|"sin-ip-desde-inicio", guion:[{t_s, quien:"mac"|"tableta"|"ambos", accion:"mudo"|"micro"|
  "camara-off"|"camara-on"|"corte-ip"|"vuelve-ip"|"colgar"}], dur_s, creada, caduca}`. Lista cerrada de acciones; nada
  de texto libre llega al motor.

### §1.3 Tiempos de un ciclo (c2: 2 min)
Preparar y acuse ≤ 15 s · timbre→contestar ≤ 5 s · guion 120 s · espera de evidencia hasta 120 s (el espejo Bluetooth no
sale mientras hay voz o vídeo en cola, `bluetooth-directo-motor.ts:930`, y luego va cada ~25 s) · pausa 60 s. **Unos
5 min por llamada: 10 llamadas ≈ 50 min, dentro de los 90 de una ronda** (`ronda.py:55`). Si la serie no cabe, se corta
y dice «serie incompleta: k de 10» (no encadena rondas por su cuenta).

---

## §2 Lo que no se automatiza y qué lo sustituye

**Hecho de la plataforma (no del código):** desde Android 10 una app que no es del sistema no puede apagar el Wi-Fi
(`WifiManager.setWifiEnabled` devuelve `false`). Tampoco puede mover los aparatos. El banco no lo intenta.

| Caso real | El banco hace en su lugar | Lo que ese sustituto NO prueba |
|---|---|---|
| «Solo Bluetooth» (c2, c3, c4) con el Wi-Fi de la tableta apagado | **`sin-ip-desde-inicio`**: las dos puntas crean la conexión con `iceTransportPolicy:"relay"` y sin servidores ICE (cambio en `motor.ts:1299`, solo con perfil de banco): WebRTC no reúne candidatos y nunca conecta; además `forzarCarril("voz"/"video", "ble-l2cap")` y escalada Wi-Fi directa en «Nunca» (`motor.ts:2082-2087`) durante la llamada | la convivencia de antenas (con el Wi-Fi encendido el Bluetooth de la tableta comparte radio a 2,4 GHz: el banco puede salir **peor o mejor** que la vida real; sin confirmar cuál) |
| Apagar el Wi-Fi a mitad de llamada (c1) | **`corte-ip` lógico** a la hora del guion, en las dos puntas: los emisores WebRTC quedan sin pista (`replaceTrack(null)`), lo recibido por WebRTC se ignora, `transporte-universal` deja de usar enlaces con IP hacia esa neurona hasta `vuelve-ip`. El motor ve el silencio (1 s, `carriles.ts:68`) y debe pasar la voz al Bluetooth | eventos reales de red del sistema y de la WebView (`offline`, cierre de sockets, ICE `failed`), la caída del TCP 47071 y del relé de la cuenta, la re-búsqueda de red de Android, el regreso del Wi-Fi con IP nueva. **El fallo real de c1 puede estar justo ahí** |
| Alejar los aparatos (c5, c6) | **tope de capacidad** del enlace por guion (la cubeta del reparto ya admite tope: `video-datos/reparto.ts:129`) bajando 160 → 60 → 30 kb/s | pérdidas y retardos reales de radio |
| Mirar la pantalla (c9 en parte, c11, c13, c15, c17) | nada | todo: siguen siendo de Alex |
| Permisos (c12) | nada; el banco nunca pide ni concede (§4) | — |

**Regla de honestidad (obligatoria en el código):** cada veredicto del banco lleva `medio_real:false` cuando usó un
sustituto y la sugerencia dice «simulado: …». Una comprobación cuyo texto pide el caso real (c1, c5, c6, c10 «sin Wi-Fi»)
**nunca** queda «bien» solo con el banco: el banco sugiere «bien (simulado)» y la comprobación sigue pendiente de una
repetición de Alex con las manos. Alternativa real para c1 desde el lado de la Mac: §7, decisión 2.

---

## §3 Escenarios (uno por comprobación de la prueba 41)

Números calculados con lo que el banco ya extrae (`banco_pruebas_logica.py:227-321`), por lado (`mac`, `maggaboard`).
«Válida» = llamada con calma (§5) antes y durante, marcas `banco inicio/fin` de las dos puntas y evidencia de la tableta
completa (al menos una línea `video-datos rx` y una `voz-datos rx` suyas después de la mitad de la llamada); una llamada
no válida **no cuenta** ni a favor ni en contra y se dice por qué.

| Comp. | Escenario (`esc`) | Auto | Guion | Criterio por llamada | Rep. |
|---|---|---|---|---|---|
| c2 | `ble-video-2min` | sí (sustituto de medio) | vídeo, `sin-ip-desde-inicio`, 120 s, cuelga la Mac | `duracion_s ≥ 120`; ninguna línea `medio=webrtc` con conexión; en los dos lados `fps_recibidos_med ≥ 3`, `negros = 0`, `inventado_pct_max ≤ 10`, `perdida_pct_max ≤ 20`, `bajo_suelo_lineas = 0`; `terminada` y colgó quien dijo el guion | 10 |
| c3 | (las mismas llamadas de c2) | sí | — | cero «Reconectando…» y cero «ruta IP nueva» en el grupo | 10 |
| c4 | `ble-video-mudo30` | sí | como c2; t=40 s `mudo` ambos, t=70 s `micro` ambos | ninguna `pausa` de vídeo con hora dentro del tramo mudo (regla `video-sin-pausa-mudo`, `:427-435`) y `mudo_s ≥ 25` en los dos | 5 |
| c1 | `ip-corte-20s` | **simulado** | vídeo con IP; t=30 s `corte-ip` ambos; t=50 s `vuelve-ip`; 120 s | sin «La llamada falló»; voz de vuelta ≤ 2 s tras el corte (regla `voz-sin-corte`, `:388-395`); vídeo con `pintados` creciendo antes de 10 s tras el corte y `negros = 0`; tras `vuelve-ip`, vídeo de nuevo por `webrtc` ≤ 15 s | 10 |
| c5 | `ble-tope-video` | **simulado** | `solo-ble`; t=40 s tope 60 kb/s; t=80 s sin tope | aparece pausa por ancho con el aviso «la señal solo alcanza para la voz» y `volvio` = sí (regla `video-pausa-ancho`, `:436-443`) | 5 |
| c6 | `ble-tope-voz` | **simulado** | `solo-ble`; t=40 s tope 30 kb/s; t=80 s sin tope | `inventado_pct_max ≤ 10` o aviso «no alcanza para la voz» y vuelta sola (regla `voz-limpia-lejos`, `:444-453`) | 5 |
| c7 | `ble-hora` | sí, sin llamada | 60 min sin llamar, mismo Wi-Fi | regla `enlace-ble-hora` existente (6 tramos, ≥ 3 con señal de la tableta, `:504-505`) | 1 |
| c8 | `carril-forzado` | parcial | t=20 s `forzar voz ble-l2cap`, t=50 s `automatico` | líneas `carril flujo=… forzado=…` (`motor.ts:1988`) y el carril real sigue al forzado ≤ 3 s; **los botones de la ventana**, a mano | 3 |
| c9 | — | parcial | — | el banco comprueba `con = maggaboard` en cada llamada; los avisos viejos en pantalla, a mano | — |
| c10 | `tableta-llama` | sí con Wi-Fi; «sin Wi-Fi» simulado | orden al revés: llama la tableta, contesta la Mac armada | la llamada aparece en el registro de la Mac como contestada; con `sin-ip-desde-inicio`, por `enlace-datos` | 5 + 5 |
| c14 | `mac-camara` | sí | vídeo; t=20 s `camara-off` Mac; t=35 s `camara-on` | líneas `camara` de cierre y apertura; el otro lado deja de pintar y vuelve a pintar ≤ 5 s | 5 |
| c16 | `mac-obs` | parcial | `cambiarCamara` a la virtual | `camara` dice virtual y la predeterminada no cambia; el aviso visible, a mano | 3 |
| c18 | — | la serie lo usa | — | `calma.json` coincide con `ronda.py estado` | — |
| c11, c12, c13, c15, c17 | — | **no** | — | de Alex | — |

### §3.3 Veredicto de una serie
- **«bien» sugerido** si hay ≥ 8 llamadas válidas y **todas menos una** cumplen (9 de 10 en c2). Con 5 repeticiones: 5 válidas
  y 5 cumplen.
- **«falla» sugerido** si 2 o más válidas no cumplen; el motivo es el de la primera que falló, con su `id` y `esc`.
- **«sin veredicto»** en lo demás (pocas válidas): se dice cuántas y por qué no valieron (calma, evidencia incompleta).
- El banco **sugiere**; marca la dirección con `comprobaciones_prueba.py marcar` (igual que hoy, `banco_pruebas_logica.py:5`).
- Las llamadas de la serie se juzgan al acabar cada una y se guardan en `banco-llamadas.json` (series, llamadas, números,
  calma): el banco general solo guarda 10 llamadas (`:22`) y una serie de 10 lo llenaría entera.

---

## §4 Seguridad

### §4.1 Las reglas
1. **Apagado** siempre al arrancar la app; el estado vive en memoria de Rust (`banco_llamadas.rs`), nunca en disco ni en
   el almacenamiento web.
2. **Solo lo enciende la persona en ESE aparato**, con un diálogo nativo que la web no puede pulsar: en la Mac el mismo
   mecanismo que «Acceso al equipo» (`acceso_equipo.rs:109-121`); en Android un `AlertDialog` de Kotlin como
   `LlamadaEntranteStarSeed.kt:350` (si `tauri_plugin_dialog` sirve igual en Android: sin confirmar). La web solo puede
   **pedir** que se abra el diálogo (`banco_armar_pedir`); el «Sí» lo da Rust tras la pulsación.
3. El diálogo dice: con qué neurona (nombre y 8 primeros caracteres del id: **una sola**), qué hará («contestar con
   cámara y micrófono las llamadas de prueba de esa neurona»), hasta cuándo (por defecto 4 h, tope 8 h, §7.1) y cuántas
   llamadas como mucho (por defecto 40).
4. **Se ve todo el rato:** banda fija «Modo banco de llamadas · contesta solo a <neurona> · hasta las HH:MM · Apagar»
   en la ventana principal; en la Mac además un icono en la barra de menús con «Apagar el modo banco» atendido en Rust
   (como el de acceso al equipo). Si la banda no se puede pintar (la web no está), el modo no contesta: el contestador
   está en la web y la web consulta a Rust en cada orden.
5. **Se apaga solo** al vencer la hora, al gastar las llamadas, al cerrar la app, al pulsar Apagar, y si la persona
   contesta, rechaza o hace a mano cualquier llamada (señal de que hay alguien delante).
6. **Solo contesta órdenes** que Rust verifica (§4.3), con timbre de la sesión que la orden anunció, sin otra llamada en
   curso, y solo si `medios_estado` (`permisos_medios.rs:178`) dice que cámara y micrófono ya están concedidos por el
   sistema. Si no lo están, contesta a la orden «falta permiso de cámara» y **no abre** la llamada: nunca dispara el
   diálogo del sistema ni abre Ajustes. Cumple §1 de `permisos-y-control-del-dispositivo.md`.
7. **Nadie lo enciende a distancia:** no hay orden, mensaje ni ruta que lo arme; una orden que llega con el modo apagado
   se contesta «modo banco apagado en este aparato» y se registra.
8. Nada se graba: el banco solo escribe números y marcas en el registro, nunca imagen ni sonido.

### §4.3 Cómo prueba la Mac que es de la cuenta (con lo que la malla ya tiene)
- `banco_orden_firmar(orden)` en Rust: HMAC con la **clave de faro de la cuenta** (la de `llamada_timbre_firmar`,
  `llamada_entrante.rs:70-74`) sobre `v|serie|n|escenario|de|para|ts|nonce|hash(guion)`.
- `banco_orden_verificar(orden)` en Rust (nuevo; hoy la verificación del timbre no está expuesta a la web, `:79-95`):
  clave de faro válida, `ts` dentro de ±5 min (la ventana del faro, `ble_trama.rs:49`), `nonce` no visto (como `Vistos`),
  `para` = esta neurona, **`de` = la neurona armada en el diálogo**, modo armado y no vencido, llamadas restantes > 0.
  Devuelve `{ok, motivo}` y descuenta una llamada.
- Por Bluetooth, además, el control solo entra de la neurona ligada con su huella (`bluetooth-directo-motor.ts:955-958`).

### §4.4 Un origen web comprometido
Los orígenes remotos de la ventana `main` (la web publicada y los puertos 47610–47619, `capabilities/default.json`) pueden
llamar a `llamada_timbre_firmar` (`default.json:154`) y podrán llamar a `banco_orden_firmar`. Qué puede hacer esa web:
- **En un aparato ya armado:** nada nuevo. Esa misma web ya puede abrir cámara y micrófono sin el banco
  (`permisos_medios.rs:134-140` concede los medios a las páginas de la app) y mandarlos adonde quiera. El modo banco no le
  da ninguna capacidad que no tuviera.
- **Desde otra neurona de la cuenta:** firmar órdenes y llamar a un aparato armado → ese aparato contesta con cámara.
  Limitado a: la única neurona elegida en el diálogo, la ventana de horas, el número de llamadas, la banda visible, y el
  registro de cada llamada contestada. **Aceptable** porque solo se arma con Alex delante y para una serie concreta.
- **Armar a distancia:** imposible: armar es un diálogo nativo; `banco_armar_pedir` solo lo enseña.
- **En el navegador** (no la app): no hay puente nativo; el modo no existe.

---

## §5 Un banco en calma

`banco_llamadas.py` lee cada 30 s y escribe `calma.json`; reutiliza `ronda.Mundo` (`ronda.py:322-395`) y añade lo que
falta (memoria libre, swap, disco). Umbrales (con variables de entorno para cambiarlos en las pruebas):

| Medida | Cómo se lee | Para EMPEZAR (3 lecturas seguidas en 2 min) | Durante una llamada (si no, la llamada «no válida») |
|---|---|---|---|
| Trabajo pesado conocido | `ronda.juzgar` (`ronda.py:249`) | ninguno | ninguno empezó |
| Carga 1 min | `os.getloadavg()` | ≤ 4,0 (= `carga_maxima(8)`, `ronda.py:397-401`) | ≤ 6,0 en todas las lecturas |
| Presión de memoria | `sysctl kern.memorystatus_vm_pressure_level` | = 1 (normal) | nunca 4 (crítica); un 2 se anota |
| Memoria libre | `memory_pressure -Q` (último renglón) | ≥ 25 % | se anota |
| Swap en uso | `sysctl vm.swapusage` | ≤ 85 % del total | se anota |
| Swap activo | `vm_stat` Swapouts, diferencia en 60 s | ≤ 2000 páginas/min (32 MB/min) — **inicial, sin calibrar** | ≤ 4000 páginas/min |
| Disco libre | `shutil.disk_usage("/System/Volumes/Data")` | ≥ 8 GB | ≥ 6 GB |
| App en el servidor local | `GET /api/banco-llamadas` responde | sí | sí |
| Tableta enchufada | sin confirmar que la web de Android lo sepa (`navigator.getBattery` en la WebView) | se anota si se sabe | — |

- **Hoy la Mac no empezaría:** presión 2 y carga 7,2. Es lo correcto: esas llamadas no valdrían. §7.4 decide qué hacer.
- La memoria libre de `memory_pressure` sola engaña (hoy 39 % con presión en aviso): manda la presión.
- **El cerrojo:** la serie pide `ronda-iniciar` con 90 min por `director_pruebas.py pedir` (nunca escribe
  `ronda-aparatos.json` ella misma, `ronda.py:14-15`), lo renueva cuando quedan < 15 min y lo suelta con `ronda-terminar`
  al acabar, al fallar y al recibir SIGTERM. Si otra ronda está activa y no es suya, **no empieza**. Si la ronda caduca
  a media serie, para.
- **Junto a cada llamada:** las lecturas de calma de su duración (mín./máx.) van en `banco-llamadas.json` y, en la Mac,
  una línea `llamada · banco calma carga1=… presion=… libre=…% swap=…% swapouts_min=…` al empezar y al acabar. Así
  «llamada mala» y «medida mala» se distinguen en el mismo sitio.

---

## §6 Fases

Carriles: `src/lib/llamadas/**` y `src/lib/malla/**` son del carril PRUEBAS; cada fase dice qué toca de ahí para
acordarlo antes. El dueño de `native/src-tauri/**`: **sin confirmar** (lo dice la dirección principal).

### Fase 1 — «solo Bluetooth, 2 min, las dos cámaras» ×10 de noche (c2 y c3)
Lo mínimo para que el supervisor deje corriendo `pedir banco-serie --esc ble-video-2min --rep 10` con la tableta
enchufada y lea por la mañana un veredicto con números.

| Archivo | Carril | Cambio |
|---|---|---|
| `native/src-tauri/src/banco_llamadas.rs`, `banco_llamadas_logica.rs`, `lib.rs` (registro de comandos), `capabilities/default.json` (+3 permisos), `android/…` diálogo | nativo (sin confirmar) | armar con diálogo, desarmar, estado, `banco_orden_firmar`, `banco_orden_verificar`, icono en la barra de la Mac |
| `src/lib/banco-llamadas/{modo,orden,guion,contestador,marcas}.ts` + `__tests__` | nuevo (PROCESO propone) | el actor; usa solo la API pública de llamadas |
| `src/components/banco-llamadas/banda-banco.tsx` + montaje junto a `montaje-llamadas.tsx` | nuevo | la banda visible |
| `src/app/api/banco-llamadas/route.ts` | nuevo | GET orden + calma (solo servidor local) |
| **`src/lib/llamadas/motor.ts`** (PRUEBAS) | `:1299` acepta `opc.banco?.sinIp` → `iceTransportPolicy:"relay"`, `iceServers:[]`; nada más |
| **`src/lib/llamadas/voz-datos/diagnostico.ts`** (PRUEBAS) | `HitoLlamada` + `"banco"` (una línea) |
| `src/lib/mensajeria/neuronas/llamadas-neurona.ts` | `timbreDeNeurona` avisa al contestador si la sesión es de una orden verificada (bloque marcado) |
| `scripts/puente/banco_llamadas.py`, `banco_llamadas_logica.py`, `test_banco_llamadas*.py` | PROCESO | serie, calma, juicio, archivo |
| `scripts/puente/director_pruebas_logica.py`, `director_pruebas.py` | PROCESO (compartido: bloque `# BAN…`) | acción `banco-serie` |
| `scripts/puente/banco_pruebas_logica.py` | PROCESO | `construir_llamada` añade `escenario`, `serie`, `n` si hay marca (aditivo) |

Tamaño estimado: Rust ~350 líneas + pruebas, TS ~700 + pruebas, Python ~500 + pruebas; ~2 000 con pruebas.
Nada de `src/lib/malla/**` en esta fase (usa `transporte-universal` tal cual).

**Pruebas (sin aparatos):** Rust: firma/verificación (ventana, nonce repetido, `de` no armado, vencido, cupo 0, apagado).
TS: máquina del guion con reloj falso; contestador rechaza sin modo, otra llamada, permiso falta, orden caducada; la
banda aparece con el modo; `motor` con perfil `sinIp` crea la conexión con `relay` (prueba sobre el constructor
inyectado). Python con carpetas temporales y `Mundo` falso: calma con cada umbral; toma/renueva/suelta la ronda (también
al fallar); juicio de una llamada con el registro real de la 41 recortado (llamada 19:15:13) y con evidencia incompleta;
serie 9/10 → bien, 8/10 → falla, 7 válidas → sin veredicto.

**Solo un aparato confirma:** que la tableta contesta con cámara sin ningún diálogo; que con `relay` no hay WebRTC y el
vídeo va por `video-datos` en los dos sentidos; que la pantalla de la tableta sigue encendida una hora
(`navigator.wakeLock` en la WebView de Android: sin confirmar); que el espejo trae completas las líneas de la tableta
tras cada llamada; que 10 llamadas seguidas no dejan cámara abierta ni la app más lenta.

### Fase 2 — corte IP lógico, mudo, cámara (c1 simulado, c4, c14, c8)
`motor.ts` (PRUEBAS): `corte-ip`/`vuelve-ip` (emisores sin pista, recepción WebRTC ignorada) bajo el perfil de banco.
`malla/transporte-universal.ts` (PRUEBAS): filtro temporal «sin IP hacia esta neurona». Resumen de la tableta al colgar
(`banco fin` con sus números) para no depender del espejo. Aparato: que el paso a Bluetooth del corte lógico se parece
al real (comparar con una llamada de Alex de c1 en la misma versión).

### Fase 3 — tope de capacidad y llamadas desde la tableta (c5, c6, c10, c16, c7)
`video-datos/reparto.ts` y el envío de `voz-datos` (PRUEBAS): tope de kb/s por guion. Orden al revés (la Mac armada
contesta). Serie pasiva de una hora para c7. Panel «Banco» en «Pruebas» de Genesis (`src/app/api/mando/lanzamientos/
pruebas/**`, PROCESO) con series, números y la etiqueta «simulado».

### Fase 4 (si Alex lo decide, §7.2) — corte de red real en la Mac
`networksetup -setairportpower <if> off|on` desde `banco_llamadas.py` durante 20 s (si hace falta administrador: sin
confirmar). Prueba el lado real de la Mac de c1; el de la tableta sigue siendo manual.

---

## §7 Decisiones para Alex (con recomendación)

1. **Cuánto dura el modo armado.** Recomendación: 4 h por defecto, tope 8 h, 40 llamadas; se vuelve a armar cada noche.
2. **¿Puede el banco apagar el Wi-Fi de la Mac 20 s (Fase 4)?** Corta a la vez el enjambre, la autopublicación y el control
   remoto de la Mac durante ese tiempo. Recomendación: no al principio; sí más adelante, solo de 02:00 a 06:00 y solo en
   series c1.
3. **¿Marca el banco las comprobaciones?** Recomendación: no; sugiere, y la dirección principal marca. Las simuladas
   nunca pasan a «bien» sin una repetición de Alex.
4. **La Mac casi nunca está en calma (presión en aviso, swap 85 %).** Recomendación: aceptar que la serie espere a la
   calma (hasta 2 h, luego se rinde y lo dice) en vez de bajar los umbrales; y reiniciar la Mac antes de las noches de
   serie para vaciar el swap.
5. **Qué cámara de la tableta.** Recomendación: la frontal tapada o mirando a la pared; se prueba la imagen, no lo que
   se ve, y nada se graba.
6. **¿Contesta también la Mac armada (c10)?** Recomendación: sí en Fase 3, con su propio diálogo; nunca las dos armadas a
   la vez para la misma serie.

---

## §8 Riesgos (por orden)
1. **Evidencia de la tableta incompleta o tarde**: el espejo calla con voz o vídeo en cola y está acotado; hoy llega
   ≥ 8 s tarde. Fase 1 espera y descarta lo incompleto; Fase 2 manda el resumen de la tableta.
2. **El sustituto no es el caso real**: el corte lógico y el «sin IP» con el Wi-Fi encendido pueden pasar donde el aparato
   falla (ha ocurrido toda la semana con el simulador). Por eso la etiqueta «simulado» y la regla de §2.
3. **La Mac de 8 GB**: con el enjambre en marcha la calma se da poco; si se relajan los umbrales vuelven los falsos fallos.
