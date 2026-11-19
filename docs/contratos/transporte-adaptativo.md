# Transporte adaptativo común · CTL1119

**Contrato, no código.** Define el módulo común que aplica a todas las funciones de la malla P2P
(control, archivos, audio, vídeo/pantalla e internet compartido) lo que el control remoto ya
aprendió: vida por latidos, reanudación sin empezar de cero, medida de cada antena, elección con
histéresis y reparto multiantena. La lógica pura vivirá en `src/lib/`; el cableado irá en tareas
aparte. Esta tarea no escribe código de producto.

- **Ola:** CTL1119 · **Tarea:** CTL1119D.
- **Áreas:** mando y diseño.
- **Base de diseño:** `memory/diseno/identidades.md`, `memory/diseno/armonia.md` y
  `memory/diseno/referencias.md`.
- **Regla de oro:** un solo motor de transporte. Lo que ya existe se reutiliza; no se duplica.
- **Idioma:** español neutro, con acentos, en textos, comentarios y registro.

## 0. Lo que ya existe (verificado en el código)

Estas son las piezas sobre las que se construye. Las rutas son relativas a la raíz del repositorio
y las líneas se comprobaron con `grep`; si el código cambia, mandan el archivo y la función, no el
número de línea.

```bash
grep -rn "VIDA_ORDEN_MS\|SESION_INACTIVA_MS\|TOPE_SEGUNDO\|TOPE_TOTAL_SEGUNDO" src/lib/control-remoto
grep -rn "MsgOferta\|MsgAceptar\|huecosDe\|primerFaltante" src/lib/network/archivos-malla.ts
grep -rn "crearCanalMultiVias\|enlacesParaReparto\|planReparto\|crearSelectorPonderado" src/lib/malla
grep -rn "crearPuertaInternet\|decidirCompartir\|cupoBanco\|repartirRacion" src/lib/malla
grep -rn "ClaveMedidor\|detalleDeMedidor" src/lib/mando/medidores.ts
```

### 0.1 Control remoto: la referencia que se copia

| Pieza | Ruta exacta | Qué aporta |
|---|---|---|
| Vida de la orden | `src/lib/control-remoto/orden.ts:18` `VIDA_ORDEN_MS = 120_000`; `:20` `DESFASE_MAX_MS` | Cada orden vive **2 min** y la hora se tolera a ±5 min. No se cambia. |
| Vida de la sesión | `src/lib/control-remoto/sesion.ts:41` `SESION_MAX_MS`; `:42` `SESION_INACTIVA_MS = 2 * 60_000`; `:214` `caducarSesion` | La sesión dura 1 h como máximo y se cierra tras 2 min sin actividad. |
| Topes | `sesion.ts:43` `TOPE_SEGUNDO = 5`; `:44` `TOPE_MINUTO = 60`; `:46` `TOPE_ENTRADA_SEGUNDO = 60`; `:50` `TOPE_TOTAL_SEGUNDO = 70` | Los topes de órdenes son suelo de seguridad, no una cifra que el transporte pueda subir. |
| Puerta del aparato controlado | `sesion.ts:131` `PuertaControl`; `:282` `recibirSellado` | Decide el lado controlado: permiso local, misma cuenta, controlador aceptado, firma, destino, caducidad, `seq`, nonce, topes, nivel y sesión. |
| Terminar y quitar permiso | `sesion.ts:166` `terminar`; `:176` `quitarPermiso`; `:181` `revocar` | «Terminar» cierra solo la sesión; «Quitar permiso» cierra y apaga el permiso en el aparato. |
| Canal | `src/lib/control-remoto/canal.ts:131` `iniciarCanalControl`; `:294` `mandarOrden`; `:341` `SesionHacia` | Firmar, mandar, acusar y recordar la sesión hacia cada neurona. |
| Medios | `src/lib/control-remoto/medio.ts:19` `MEDIOS_ELEGIBLES`; `:219` `planOrdenes`; `:324` `politicaIce` | Orden de intentos por medio (`auto`, Bluetooth, Wi-Fi directo, router, malla, nodos) y política ICE. |
| Medida y cambio de medio | `src/lib/control-remoto/medio-estado.ts:166` `fijarEleccion`; `:189` `refrescarContexto`; `:381` `enviarOrdenPorMedio` | Mide el medio real, castiga un fallo un tiempo y reordena los intentos. |
| Calidad de pantalla | `src/lib/control-remoto/ritmo-pantalla.ts:16` `NIVELES_CUADRO`; `:48` `siguienteRitmo`; `:70` `capacidadFps` | Sube y baja tamaño, calidad y fps por el coste medido, con histéresis (2 medidas para bajar, 4 para subir). |
| Línea de medida existente | `src/lib/control-remoto/cuadro-malla.ts:136` `lineaVia` | Formato `control-fuente paso=via …` con enlace, cuadros/s, kbps y nivel; sirve de precedente. |
| Aviso y nombre | `src/components/control-remoto/punto-control.tsx:21` `PuntoColor`; `:35` `PuntoControl`; `src/components/control-remoto/banda-control.tsx:221` `BandaControl` | Punto de color con el nombre de quien controla, y banda con «Terminar» y «Quitar permiso». |

### 0.2 Envío de archivos y enjambre de datos

| Pieza | Ruta exacta | Qué aporta |
|---|---|---|
| Motor de archivos | `src/lib/network/archivos-malla.ts:129` `CanalArchivos`; `:229` `MsgOferta`; `:286` `MsgAceptar`; `:308` `MsgProgreso`; `:323` `MsgChunk`; `:329` `MsgFin` | Oferta, aceptación, trozos, progreso, fin y verificación. La transferencia se vigila por inactividad. |
| Reanudación existente | `archivos-malla.ts:547` `huecosDe`; `:636` `primerFaltante` | El receptor dice qué trozos tiene y el emisor continúa por el primero que falta. No se empieza de cero. |
| Multitrayecto de un archivo | `src/lib/malla/canal-multitrayecto.ts:54` `crearCanalMultitrayecto`; `src/lib/malla/canal-multitrayecto-vias.ts:123` `crearCanalMultiVias` | Reparte trozos por varios enlaces al mismo aparato, salta colas llenas, reenvía lo de una vía muerta y mide la velocidad. |
| Elección y reparto | `src/lib/malla/eleccion-enlace.ts:247` `elegirEnlaces`; `:274` `enlacesParaReparto`; `:308` `planReparto`; `:341` `crearSelectorPonderado` | Orden por rango medido, reparto por capacidad y selector ponderado suave. Bluetooth no frena al resto. |
| Puerta única | `src/lib/malla/transporte-universal.ts:557` `enviarMensaje`; `:813` `canalParaArchivo`; `:1149` `enviarArchivo` | Elige el enlace real y devuelve por dónde fue y si hubo acuse. |
| Relevo y espera | `src/lib/malla/relevo/motor.ts:515` `enviarMensaje`; `:570` `canalHacia` | Espera a que aparezca una ruta y **reanuda** el envío cuando vuelve el relevo; encola sin perder lo pendiente. |
| Armar vías | `src/lib/malla/archivo-seguro.ts:93` `filtrarVias`; `:118` `armarCanalArchivo` | Decide qué vías valen para un archivo según tamaño, cifrado y ajustes. |
| Bandeja de entrantes | `src/lib/network/envios-entrantes.ts:98` `agruparEnvios`; `:123` `enviosPorDecidir`; `src/components/network/transferencias-archivo-panel.tsx:253` `TransferenciasArchivoLista` | Agrupa por carpeta, pide decisión y muestra progreso, medio y velocidad. |

### 0.3 Internet compartido por la malla

| Pieza | Ruta exacta | Qué aporta |
|---|---|---|
| Puerta de internet | `src/lib/malla/puerta-internet.ts:25` `CAPACIDAD_PUERTA_INTERNET`; `:40` `TOPES_PUERTA_POR_DEFECTO`; `:147` `crearPuertaInternet`; `:314` `registrarConectorPuerta` | Una neurona con internet presta un `GET https` cifrado de punta a punta, opt-in, con cuota, batería, plazo y hosts permitidos. |
| Decisión de compartir | `src/lib/malla/internet/decision-compartir.ts:54` `decidirCompartir` | Cruza audiencia (`mi-cuenta`, `entidad`, `publico`), ajustes, contadores, puerta y modo banco. |
| Cupo y reparto | `src/lib/malla/internet/cupo-banco.ts:71` `cupoBanco`; `src/lib/malla/internet/reparto-banco.ts:13` `repartirRacion` | Ración diaria o por ventana, y reparto proporcional a la capacidad de cada nodo. |
| Contadores | `src/lib/malla/internet/contadores.ts:38` `sumarBytes`; `:101` `usadoHoyMb` | Bytes por día y mes, por audiencia, con día local. |
| Conexión limitada | `src/lib/malla/internet/conexion-limitada.ts:17` `clasificarConexion` | Distingue conexión limitada, no limitada o desconocida para avisar y racionar. |
| Preferencias del aparato | `src/lib/malla/preferencias-red-compartida.ts:20` `PreferenciasRedAparato`; `:37` `PREFERENCIAS_POR_DEFECTO`; `:53` `sanearPreferenciasRed` | Interruptor apagado por defecto, tope de «con quién», solo Wi-Fi, kbps de subida, batería y modo automático. |
| Superficie | `src/components/mesh/mapa-senales/internet/seccion-internet.tsx:94` `SeccionInternet`; `interruptor-modo-mesh.tsx:37` `InterruptorModoMesh`; `racion-banco.tsx:34` `RacionBanco` | Interruptores y ración visibles en el mapa de señales. |
| Recursos de la red | `src/app/api/mando/recursos-red/route.ts` `GET`; `src/lib/mando/recursos-red.ts:108` `resumirRecursosRed` | Ofertas por medio, préstamos vivos y volúmenes bajos; solo local y sin claves ni rutas del disco. |

### 0.4 Medidores de Genesis

| Pieza | Ruta exacta | Qué aporta |
|---|---|---|
| Claves de medidor | `src/lib/mando/medidores.ts:64` `ClaveMedidor`; `:3380` `ORDEN_POR_DEFECTO` | Lista cerrada y orden de los medidores del pulso. |
| Detalle | `medidores.ts:2258` `detalleDeMedidor`; `src/app/api/mando/medidores/route.ts` | Filas, resumen y acciones legales; la ruta es local y pasa por `guardianMando`. |
| Pantalla | `src/components/mando/centro-mando.tsx:893` `CentroMando` | Pinta los medidores y sus ventanas. |

### 0.5 Lo que falta y justifica este contrato

1. Un **modelo de flujos** común: hoy el control tiene medios y la pantalla tiene ritmo, los
   archivos tienen multitrayecto y la puerta de internet tiene su cuota, pero cada uno mide y
   elige a su manera.
2. Un **latido único** con vida por latidos para sesión, medio y flujo, sin inventar plazos
   distintos en cada función.
3. Una **reanudación común** de sesión y transferencia, apoyada en lo que ya existe
   (`seq`, token de sesión, `huecosDe`, `primerFaltante`, `id` de petición de la puerta).
4. Una **medida común** (fps o caudal, retardo, pérdidas, medio) que alimente un medidor de
   Genesis y sirva a control, archivos, audio, vídeo e internet.
5. Una **asignación por flujo** con cambio en caliente, histéresis y reparto multiantena, con el
   registro de qué flujo va por qué medio a la vista.

## 1. Principios y alcance

1. **Un solo transporte.** El módulo común no sustituye a `transporte-universal` ni al motor de
   archivos: los envuelve. Elige medio, mide, reparte, reanuda y publica medidas; las funciones
   de cada área siguen siendo las dueñas de su protocolo.
2. **La seguridad no se negocia con el rendimiento.** Ningún cambio de antena, latido o reparto
   puede debilitar la firma, la vida de 2 min de cada orden, los topes, el aviso con nombre, ni
   «Terminar» y «Quitar permiso».
3. **El aparato controlado decide.** El transporte solo propone; la puerta del aparato acepta o
   rechaza. El permiso de control nace apagado y solo lo enciende la persona dueña.
4. **Un voto de comunidad no anula al dueño.** Sobre un aparato personal, ninguna votación,
   página, grupo o entidad puede abrir lo que el dueño no ofreció como nodo.
5. **Medir antes de elegir.** Sin medida no se finge velocidad ni calidad. Un medio sin medir no
   gana a uno medido por el simple hecho de estar disponible.
6. **Degradar, no romper.** Si no hay medio suficiente, el flujo baja calidad o espera; el control
   queda en `reanudando` con aviso antes que viajar por una vía que no puede garantizarlo, y solo
   se cierra al cumplirse el plazo de inactividad.

**Fuera de alcance de esta tarea:** escribir código de producto. El contrato y la cola son el
entregable; las tareas de la cola construyen la lógica pura con sus pruebas.

## 2. Modelo: sesión, flujo y antena

### 2.1 Sesión

Una **sesión** es la unidad lógica entre dos extremos. Sobrevive al cambio de medio y no se
confunde con la conexión física.

```
Sesion {
  id: string,                 // estable durante toda la vida lógica
  de: huella, para: neurona,
  cuenta: string,
  token: string,              // lo emite el destino; opaco y de un solo uso por apertura
  seq: number,                // monótono; nunca se reinicia al cambiar de medio
  inicio, ultimaActividad,
  nivel: "ver" | "controlar" | "modificar" | "administrar",
  flujos: Flujo[],
  estado: "abierta" | "reanudando" | "cerrada" | "terminada-por-el-dueno"
}
```

La sesión de control mantiene las reglas de `sesion.ts`: 1 h de vida máxima, 2 min sin actividad,
token emitido por el destino y `seq` monótono. Cambiar de antena **no** reinicia `seq`, no cambia
el token y no sube el nivel.

### 2.2 Flujos

Cada sesión se separa en flujos con requisitos propios. Un flujo es independiente: puede cambiar
de medio, degradarse o esperar sin arrastrar a los demás.

| Flujo | Retardo objetivo | Caudal típico | Fiabilidad | Reparto multiantena |
|---|---:|---:|---|---|
| `control` | < 50 ms | pocos kbps | 99,99 %; se pierde una orden, se reintenta la misma | **Nunca**: una sola vía, la más fiable y de menor retardo |
| `audio` | < 150 ms | 32–128 kbps | 99,9 %; tolera pérdidas con FEC | Duplicar solo si una vía no cumple la fiabilidad |
| `video` / `pantalla` | < 200 ms interactivo | 1–8 Mbps | 99 %; tolera pérdida y baja fps | Capas o trozos si el códec lo permite; por defecto, una vía |
| `archivos` | no crítico | el máximo posible | 100 %; SHA-256 y reanudación | Sí, por capacidad medida |
| `internet` | < 300 ms | el máximo permitido por la cuota | 99 %; petición idempotente | Sí, por capacidad y cuota |

**Requisitos declarados, no supuestos.** Cada flujo lleva su tabla de requisitos y el motor la
consulta; no se deduce del nombre ni del tipo de archivo.

### 2.3 Antenas y medios

Se llama **antena** a un medio físico o lógico disponible. El modelo reutiliza los tipos que ya
existen (`TipoEnlace` en `eleccion-enlace.ts`, `MedioElegido` en `medio.ts`) y añade la medida:

```
Antena {
  id, tipo, etiqueta,               // "Bluetooth directo", "Wi-Fi directo", "Wi-Fi del router"…
  abierta: boolean, alcanza: {...},
  capacidades: { caudalKbps, rttMs, perdidaPct, jitterMs, energia },
  medidaEn: number | null,          // sin medida = null, nunca un cero fingido
  coste: "bajo" | "medio" | "alto", // batería y datos
  privacidad: "directa" | "cuenta" | "rele" | "tercero"
}
```

No se exponen IP, MAC, SSID ni rutas del disco en la medida pública: solo el nombre del medio y
sus números. Los identificadores internos se quedan en el aparato.

## 3. Latidos y vida por latidos

### 3.1 Qué late

Late cada extremo, por cada flujo, y late cada antena en uso. Un latido es una trama pequeña,
autenticada y sin efecto: **no ejecuta acciones, no abre sesión, no sube nivel y no gasta la cuota
de órdenes de la aplicación**.

```
Latido {
  v: 1,
  sesion: string, flujo: "control" | "audio" | "video" | "archivos" | "internet",
  medio: string, seq: number, t: number, nonce: string,
  salud: { caudalBps, rttMs, perdidaPct, jitterMs, colaBytes, fps? },
  firma: string        // firma de sesión o sello del canal; nunca una clave en claro
}
```

En el control, el latido viaja por el mismo canal sellado que las órdenes y se verifica con la
sesión abierta. Tiene su propio tope (1 por segundo y por flujo) y **no consume** los topes de
órdenes (`TOPE_SEGUNDO`, `TOPE_MINUTO`, `TOPE_TOTAL_SEGUNDO`), que siguen intactos. Un latido
nunca sustituye una orden: la orden que no llega se reintenta con la **misma** firma, `seq` y
nonce, como ya hace `puerta-chats`.

### 3.2 Cadencia y vida

| Qué | Cada | Se declara muerto tras | Qué pasa |
|---|---:|---:|---|
| Antena | 2 s | 3 latidos perdidos (6 s) | Se saca de la lista de candidatas; no se cierra la sesión. |
| Flujo `control` | 1 s | 3 perdidos (3 s) | Se intenta otra antena; si no hay, se avisa y la sesión queda en `reanudando` hasta el plazo de 2 min. |
| Flujo `audio` / `video` | 1 s | 3 perdidos | Se baja calidad o se cambia de antena; el flujo puede pausarse. |
| Flujo `archivos` | 5 s | 3 perdidos | Se pausa y queda reanudable; no se pierde lo recibido. |
| Flujo `internet` | 5 s | 3 perdidos | Se reintenta la misma petición por otra puerta; no se cobra dos veces. |
| Sesión de control | 5 s | 2 min sin actividad | Se cierra por `SESION_INACTIVA_MS`; reabrir exige a la persona dueña. |

**La vida de la orden no se toca.** `VIDA_ORDEN_MS = 120_000` sigue siendo el techo de cualquier
orden, también de las que viajan al reanudar. Un latido no alarga ese plazo ni permite ejecutar
una orden vieja.

### 3.3 Reglas de vida

- Un medio que deja de latir no se declara muerto para siempre: se reintenta con espera creciente
  (2 s, 4 s, 8 s, 15 s) y vuelve solo cuando responde.
- La sesión no muere por cambiar de medio; muere por inactividad, por «Terminar», por «Quitar
  permiso» o por caducidad. El cambio de medio solo la pone en `reanudando`.
- Un flujo que se queda sin antena no arrastra a los demás. El control tiene prioridad: si el
  vídeo ocupa la única vía buena, el vídeo baja antes que el control.
- El silencio no es vida: si no hay latido, no se supone que el otro lado sigue. Genesis lo
  enseña como «sin latido», no como «conectado».

## 4. Reanudación sin perder sesión ni transferencia

### 4.1 Sesión

Al cambiar de antena o tras un corte corto, el extremo que manda envía `reanudar-sesion` por la
vía nueva:

```
reanudar-sesion {
  sesion, token, ultimoSeq, ultimoAcuse, medioNuevo, t, nonce, firma
}
```

El destino comprueba, en este orden: sesión abierta o en `reanudando`, token vigente, misma
cuenta, controlador aceptado, hora dentro de ±5 min, `seq` mayor que el último visto, nonce nuevo,
y que no hayan pasado 2 min desde la última actividad. Si todo vale, responde con el `seq`
esperado y la sesión sigue con el **mismo** `id` y el **mismo** token. Si falla, no se inventa una
sesión nueva: se responde `sin-sesion` y solo la persona dueña puede abrir otra.

Un reintento legítimo reenvía la **misma** orden firmada; nunca una nueva con otro `seq`. La
ventana de 2 min es la de la actividad de la sesión; no se amplía por tener muchos latidos.

### 4.2 Transferencia de archivos

La reanudación ya existe y se conserva:

1. El receptor guarda los trozos por índice y calcula `huecosDe(tenidos, trozos)`.
2. Al volver la vía, envía `reanudar` con el `id` del archivo, su hash y los huecos.
3. El emisor continúa desde `primerFaltante(tenidos, trozos)` y no vuelve a mandar lo que ya está.
4. Los trozos que iban por una vía muerta se reenvían por las demás; el receptor ignora duplicados
   y reensambla por índice (`canal-multitrayecto-vias.ts`).
5. Al terminar se verifica el SHA-256 completo; un archivo incompleto nunca se da por bueno.

**Ventana de reanudación de archivos:** 24 h por defecto, contadas desde la última actividad. Se
implementa como vida del estado guardado en OPFS/IDB, no como un socket abierto. Pasado ese plazo
se ofrece empezar de nuevo, con aviso; nunca se borra lo recibido sin decirlo.

### 4.3 Internet compartido

La petición de la puerta ya lleva un `id` (`PeticionPuerta`). La reanudación reutiliza **ese mismo
`id`** y la misma URL, aunque cambie la neurona que hace de puerta:

- la puerta nueva descarta un `id` ya visto y responde el resultado guardado si lo tiene;
- no se descuenta dos veces de la cuota;
- el plazo original se respeta; si caducó, se responde `plazo` y no se reintenta a ciegas;
- si la petición era privada, se vuelve a cifrar para la pública de la puerta nueva, con el mismo
  `id` y el mismo contenido.

## 5. Bucle de calidad y caudal

### 5.1 Medir

Cada ventana (1 s para control, audio y vídeo; 3 s para archivos e internet) se calcula:

- **caudal**: bytes útiles / tiempo, en bps o kbps; nunca bytes de cabecera ni reintentos;
- **retardo**: ida y vuelta medida con el acuse o el latido, en ms;
- **pérdidas**: tramas perdidas / tramas esperadas, en %;
- **jitter**: variación del retardo entre muestras, en ms;
- **fps**: solo vídeo/pantalla, cuadros decodificados / segundo;
- **medio**: el nombre real del enlace usado, no el que se pidió.

Una medida sin muestras suficientes se publica como `sin-medir`, no como cero. La ventana se
descarta al cambiar de medio y se empieza a medir de nuevo, sin arrastrar la media vieja.

### 5.2 Decidir

El bucle compara la medida con los requisitos del flujo y actúa en este orden:

| Flujo | Primero | Después | Nunca |
|---|---|---|---|
| `control` | Cambiar a una antena mejor si la actual falla | Reducir audio/vídeo para dejarle sitio | Bajar su fiabilidad, su firma o sus topes |
| `audio` | Bajar bitrate y subir FEC | Cambiar de antena | Cortar sin avisar |
| `video` | Bajar fps, luego resolución, luego calidad | Cambiar de antena o de capa | Bajar por debajo del mínimo legible sin decirlo |
| `archivos` | Bajar concurrencia o tamaño de trozo | Repartir mejor entre vías | Perder trozos ya confirmados |
| `internet` | Bajar concurrencia | Repartir entre puertas | Saltarse la cuota o el modo banco |

**Histéresis:** un cambio de calidad necesita 2 medidas seguidas para bajar y 4 para subir, como
`ritmo-pantalla.ts`. Entre el umbral de bajada y el de subida hay una banda muerta; si la medida
cae dentro, no se toca nada. El periodo mínimo entre cambios es 4 s (8 s para control).

### 5.3 Regla de protección del control

El control es el flujo que manda. Si su retardo sube o su pérdida crece y comparte antena con
audio o vídeo, el motor baja primero esos flujos. Si aun así no cumple, cambia de antena; si no
hay ninguna que cumpla, deja la sesión en `reanudando` con aviso y la cierra al plazo de 2 min sin
actividad; el permiso queda como estaba. **Nunca** se mantiene una sesión de control viva por una
vía que no puede entregar órdenes a tiempo.

## 6. Elección, cambio y reparto multiantena

### 6.1 Puntuación por flujo

Cada antena recibe una puntuación de 0 a 100 por flujo, con los requisitos de §2.2:

```
puntuacion = 100 * (
    w_caudal   * min(1, caudal / caudalObjetivo) +
    w_retardo  * max(0, 1 - rtt / retardoMaximo) +
    w_fiabilidad * (1 - perdida / 100) +
    w_energia  * (1 - costeEnergetico)
) - castigoPrivacidad
```

Los pesos dependen del flujo. El control pondera fiabilidad y retardo por encima de caudal; los
archivos e internet ponderan caudal; audio y vídeo buscan el equilibrio. `costeEnergia` vale 0,
0,5 o 1 para coste bajo, medio o alto. `castigoPrivacidad` vale 0 para vía directa o de la cuenta,
10 para relé y 25 para tercero; el control descarta directamente al tercero si hay otra vía. Una
antena no elegible (cerrada, sin alcance, sin cifrado exigible, con cuota agotada) no puntúa: se
descarta con motivo.

### 6.2 Elección con histéresis

- **Control:** una sola vía. Gana la de mayor fiabilidad; a igualdad, la de menor retardo. No se
  reparte, no se duplica y no va por un relé de terceros si hay una vía directa o de la cuenta.
  Solo se cambia si la actual falla o si otra la supera en retardo un 25 % durante 3 medidas
  seguidas. Se prefiere Bluetooth directo o red local para el control antes que internet.
- **Audio y vídeo:** se cambia si otra supera la puntuación un 15 % durante 2 medidas seguidas.
  El audio puede duplicarse por dos vías solo si una sola no alcanza la fiabilidad exigida; el
  vídeo puede repartir capas o trozos solo si el códec lo soporta, y nunca se inventa.
- **Archivos e internet:** se cambia si otra supera la puntuación un 10 % durante 2 medidas. El
  reparto se hace por capacidad medida / (1 + retardo/250 ms), como ya hace
  `canal-multitrayecto-vias.ts`. Una vía recién añadida y aún sin medir recibe una fracción
  inicial pequeña (la mediana, con tope del 15 %) y solo crece cuando su medida la justifica; en
  la elección, una medida `null` nunca desplaza a una medida real.

**Antirrebote:** un cambio no se repite hasta que pasa el periodo mínimo (8 s control, 4 s el
resto). Un medio que acaba de fallar queda castigado 15 s (`CASTIGO_FALLO_MS` en el control) y no
vuelve a ser candidato hasta que pasa ese tiempo o se mide de nuevo.

### 6.3 Cambio en caliente

El cambio es **hacer antes de romper**:

1. Se prueba la antena nueva con un latido o un sondeo pequeño.
2. Se manda `cambiar-flujo` firmado, con `sesion`, `flujo`, `medioNuevo`, `seq`, `t`, `nonce`.
3. El destino acusa y confirma que puede recibir por la vía nueva.
4. Se empieza a enviar por la nueva y se drena la vieja; los trozos en vuelo se reenvían si no
   llegó su acuse.
5. Solo entonces se cierra la vieja. Si algo falla, se vuelve a la anterior sin perder la sesión.

En archivos e internet el cambio puede ser **aditivo**: se añade una vía sin quitar la actual y el
reparto se recompone. En control y en audio/vídeo en vivo el cambio es con solape mínimo, para no
cortar.

### 6.4 Reparto y ejemplo de asignación

El reparto multiantena se permite cuando el flujo lo admite y hay más de una antena que llega al
**mismo** destino. Se reparte por capacidad, con contrapresión por vía y reenvío de lo último que
llevaba una vía muerta, como ya existe. El control queda fuera del reparto.

Ejemplo de Alex (18-11, noche), que el algoritmo **puede** producir si las medidas lo justifican,
nunca por regla fija:

| Flujo | Antena de ejemplo | Por qué |
|---|---|---|
| `control` | Bluetooth directo | Menor retardo y sin router; poca carga |
| `audio` | Wi-Fi del router | Caudal suficiente y baja latencia |
| `video` / `pantalla` | Wi-Fi Directo | Más caudal y sin competir con el router |
| `archivos` | Wi-Fi Directo + red local + Wi-Fi del router | Reparto por capacidad medida |
| `internet` | Wi-Fi del router + puerta de otra neurona | Reparto con cuota y audiencia |

La combinación real la deciden las medidas de cada momento, el sistema y los permisos. Si el
Bluetooth no da para el control, se usa la vía más fiable que haya; si no hay ninguna, se avisa,
la sesión queda en `reanudando` y solo se cierra al cumplirse el plazo de inactividad. No se
finge una conexión.

### 6.5 Registro de asignación

Siempre visible y auditable:

```
AsignacionFlujo {
  sesion, flujo, medio, papel: "unica" | "reparto" | "respaldo",
  porcentaje: number, desde: number,
  motivo: string,        // "menor retardo", "más caudal medido", "la anterior falló"…
  medida: MedidaFlujo
}
```

El registro se guarda en el aparato y se resume en Genesis: qué flujo va por qué medio, desde
cuándo y por qué. No guarda claves, IP, MAC, SSID ni rutas del disco.

## 7. Medidas comunes y medidor de Genesis

### 7.1 La medida común

Un solo tipo, calculado por el módulo puro y consumido por todas las áreas:

```
MedidaFlujo {
  sesion, flujo, medio,
  caudalBps: number | null,
  fps: number | null,
  rttMs: number | null,
  perdidaPct: number | null,
  jitterMs: number | null,
  resolucion: string | null,     // "1280x720", solo vídeo
  codec: string | null,
  ventanaMs, muestras,
  estado: "midiendo" | "bien" | "degradado" | "sin-medio" | "sin-medir",
  desde, motivo
}
```

Reglas de la medida:

- `null` significa «no medido»; nunca se rellena con 0.
- Se redondea a una cifra decimal para mostrar; el cálculo interno conserva el número.
- Se mide lo que **de verdad** se usa, no lo que se pidió.
- Se publica por flujo y por medio; el resumen por sesión suma los flujos sin ocultar el peor.
- La medida no sale del aparato con identificadores de red; Genesis solo ve nombres de medio y
  números.

### 7.2 Línea de registro

Cada 10 s, una línea por sesión:

```
transporte-calidad sesion=<8> flujo=<flujo> medio=<nombre> caudal_kbps=<n|sin-medir>
rtt_ms=<n|sin-medir> perdida=<n|sin-medir> fps=<n|sin-medir> estado=<estado>
```

La línea va al registro local de la neurona y al resumen que lee Genesis. No se escribe una línea
por muestra: sería ruido y coste.

### 7.3 Medidor de Genesis

Se añade una clave `transporte` a `ClaveMedidor` y su detalle en `medidores.ts`, servido por la
ruta local que ya existe (`/api/mando/medidores`). El medidor muestra:

- una fila por flujo activo, con el **punto de color y el nombre** del otro extremo, como
  `PuntoControl` (`punto-control.tsx:21` y `:35`);
- el medio real y el porcentaje si hay reparto;
- fps o caudal, retardo, pérdidas y estado;
- desde cuándo está en ese medio y el motivo del último cambio;
- un resumen de sesiones y un aviso si el control se quedó sin vía.

Diseño: cristal de Genesis (`mando-cristal.css`), tokens de color existentes, cuerpo de 16 px y
ningún texto por debajo de 12,8 px. La geometría sagrada, si se usa, va de fondo con `aria-hidden`
y opacidad baja (vesica piscis para dos vías que se solapan, flor de la vida para la malla); nunca
detrás del texto sin velo ni como adorno que compita con la lectura. En móvil, una fila por flujo;
en tablet y escritorio, tabla compacta. `cursor-pointer` en lo clicable y dianas de 44 px.

Composición armónica: espaciado por peldaños Fibonacci (8, 13, 21 y 34 px), proporción φ para la
columna de resumen frente a la tabla (38,2 % / 61,8 %) y radios de la familia de Genesis; la
geometría no sustituye la rejilla ni el contraste. La verificación cubre 280 y 430 px (plegable y
móvil), 768×1024 (tablet), 1280×800 y 1920×1080 (escritorio), 3840×2160 (TV), con tacto y puntero,
contraste ≥ 4,5:1, sin overflow horizontal, foco visible y `prefers-reduced-motion`. Se comprueba
en iOS, Android, macOS, Windows y Linux; en cada uno se revisan claro/oscuro, texto largo,
cargando, vacío y error.

### 7.4 Qué NO devuelve la ruta

La ruta es solo local (`guardianMando`, 404 fuera de la Mac) y **jamás** devuelve claves, tokens,
IP, MAC, SSID, rutas del disco ni el contenido de los flujos. Solo nombres de medio, flujos,
números y motivos en español.

## 8. Reglas fijas de seguridad

Estas reglas no se debilitan en ninguna tarea de la cola:

1. **Firma.** Toda orden de control va firmada por el aparato que manda, con la clave por aparato
   de GEN1114; la firma de cuenta no basta para decidir qué neurona manda.
2. **Repetición.** Cada orden vive 2 min (`VIDA_ORDEN_MS`), con `seq` monótono, nonce nuevo y
   caducidad. Un reintento legítimo reenvía la misma orden firmada; nunca una nueva.
3. **Topes.** Se conservan `TOPE_SEGUNDO`, `TOPE_MINUTO`, `TOPE_ENTRADA_SEGUNDO` y
   `TOPE_TOTAL_SEGUNDO`. Los latidos tienen su propio tope y no los consumen.
4. **Aviso.** El punto de color con el nombre de quien controla sigue visible, y la banda ofrece
   «Terminar» y «Quitar permiso» en el aparato controlado.
5. **Terminar y quitar permiso.** «Terminar» cierra solo la sesión; «Quitar permiso» cierra y
   apaga el permiso en el aparato. Ningún cambio de antena ni reanudación los sustituye.
6. **Permiso apagado por defecto.** Solo la persona dueña lo enciende en su aparato, en un diálogo
   nativo. Ninguna orden, latido, voto o petición remota lo enciende.
7. **El dueño manda sobre su aparato personal.** Un voto de comunidad, página o grupo nunca anula
   el permiso del dueño ni abre su sesión personal, sus archivos o su interruptor de parada.
8. **El relé transporta, no lee.** Lo privado va por canal sellado; un relé de terceros solo se
   usa con permiso, con tope de bytes y sin poder leer el contenido.
9. **Sin secretos en la medida.** Ni claves, ni tokens, ni valores de variables de entorno, ni
   rutas del disco en medidas, registros, prompts o bus de eventos.

## 9. Riesgos y decisiones abiertas

| Riesgo | Qué se hace |
|---|---|
| Bluetooth da poco caudal | Solo control y audio corto; nunca vídeo ni archivos grandes si hay otra vía. |
| Wi-Fi Directo y router compiten por la radio | Se mide de verdad; si compiten, se elige una para vídeo y otra para control, no se supone. |
| iOS no deja controlar otras apps | El transporte puede ser controlador o `ver`; nunca destino de clics. |
| Relé de terceros | Solo con permiso, sellado y con tope; si hay vía directa, no se usa. |
| Batería y datos medidos | El coste entra en la puntuación; el modo banco y la cuota mandan en internet. |
| Un flujo con muchas vías gasta más | Se reparte solo cuando el beneficio medido supera el coste; si no, una vía. |
| Latido que se pierde por ráfaga | Vida por 3 latidos, no por uno; el cambio espera una ventana. |

Decisiones abiertas para las tareas de la cola: si el audio se duplica por defecto cuando hay
dos vías fiables; si el vídeo usa capas o solo una vía en la primera versión; y cada cuánto se
guarda la medida en disco sin gastar batería. Ninguna de estas decisiones puede tocar §8.

## 10. Criterios de aceptación

- El contrato describe control, archivos e internet con rutas y funciones exactas (§0).
- Existe un modelo de flujos con requisitos propios y una antena con medida (§2).
- La vida se decide por latidos, sin plazos inventados y sin tocar la vida de 2 min de la orden
  (§3).
- La reanudación conserva sesión, `seq`, token, trozos y `id` de petición (§4).
- El bucle de calidad y el cambio de antena tienen histéresis y protección del control (§5 y §6).
- Hay un registro de qué flujo va por qué medio y un medidor de Genesis que lo enseña (§6.5 y §7).
- Las reglas de seguridad de §8 se citan como invariantes en cada tarea de la cola.
- La cola tiene entre 3 y 6 tareas pequeñas, cada una con archivos, dependencia y pruebas.

Pruebas previstas por la cola: `npx vitest run` sobre las pruebas de cada módulo nuevo de
`src/lib/malla/transporte-adaptativo/` y del medidor de Genesis, con casos de vida, histéresis,
reparto, reanudación y medida. Ninguna prueba usa red, aparatos reales ni `vi.mock` de módulos de
Node. Si una tarea toca Rust nativo, añade `cargo test` en `native/src-tauri`.

## Anexo A. Ejemplo de una sesión con tres flujos

```
sesion=<8> nivel=controlar
  control   → Bluetooth directo   unica    rtt 18 ms   perdida 0,1 %   estado=bien
  audio     → Wi-Fi del router    unica    rtt 42 ms   caudal 64 kbps  estado=bien
  video     → Wi-Fi Directo       unica    rtt 61 ms   fps 24          estado=degradado
  archivos  → Wi-Fi Directo 62 % · Red local 38 %      caudal 4,2 Mbps estado=bien
  internet  → Wi-Fi del router    unica    rtt 88 ms   cuota 34 %      estado=bien
```

Si el Wi-Fi Directo cae, el vídeo baja a 12 fps, busca el router y, si el control comparte esa
vía, primero se protege el control. Si no queda ninguna vía que cumpla, la sesión queda en
`reanudando` con aviso y se cierra al cumplirse 2 min sin actividad; el permiso del aparato queda
como estaba: encendido o apagado por su dueño, nunca por el transporte.

