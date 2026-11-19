# Contrato · Transporte adaptativo común (CTL1119)

**Estado:** diseño, sin código de producto en esta tarea. **Fecha:** 2026-11-19.
**Origen:** Alex (18-11): lo aprendido con el control remoto se aplica a la transmisión de archivos,
al enjambre de datos y al internet compartido de la malla comunitaria local multicapa.
**Área:** mando, diseño. El medidor vive en Genesis y conserva su identidad de cristal.

## 1 · Lo que ya existe (grep verificado el 19-11-2026)

Las rutas de abajo son las reales del repositorio. No hay una ruta de producto nueva en este contrato:
se reutiliza lo que ya funciona y se le añade una capa común de decisión y medida.

### 1.1 · Control entre neuronas

| Pieza | Ruta real | Qué se reutiliza |
|---|---|---|
| Orden firmada, vida de 2 min, dominio | `src/lib/control-remoto/orden.ts:14-18` | `AUD_CONTROL`, canal `control-neuronas`, `VIDA_ORDEN_MS = 120_000`, ECDSA P-256 |
| Puerta y topes | `src/lib/control-remoto/sesion.ts:41-54`, `:218-275` | 5 órdenes/s, 60/min, entrada 60/s, total 70/s, sesión 1 h, 2 min sin actividad |
| Permiso y revocación | `src/lib/control-remoto/sesion.ts:74`, `:163-188` | permiso apagado de fábrica; «Terminar» cierra sesión; «Quitar permiso» cierra y apaga |
| Canal y envío | `src/lib/control-remoto/canal.ts:131`, `:294` | `iniciarCanalControl`, `mandarOrden`, respuesta por nonce; cuerpo sellado |
| Elección de medio | `src/lib/control-remoto/medio.ts:19`, `:136`, `:164`, `:219`, `:291`, `:324`, `:380` | medio real medido, plan de órdenes, opciones, política ICE, línea de registro |
| Automático con histéresis | `src/lib/control-remoto/auto-enlace.ts:18-30`, `:141`, `:146`, `:156` | mejor directo; 6 s de permanencia; mejora clara: ≥30 % y ≥15 ms de RTT, ≥50 % de caudal |
| Estado vivo y aviso | `src/lib/control-remoto/medio-estado.ts:21-22`, `:26`, `:160`; `src/lib/control-remoto/aviso-peticion.ts:34`, `:110` | instantánea, refresco 4 s, medida 2,5 s; punto de color con el nombre completo y el código |
| Sesiones y pantalla | `src/lib/control-remoto/registro-sesiones.ts:199`; `src/app/control-remoto/page.tsx`; `src/components/control-remoto/punto-control.tsx` | sesión compartida, indicador nativo, ventana existente |

### 1.2 · Archivos y enjambre de datos

| Pieza | Ruta real | Qué se reutiliza |
|---|---|---|
| Puerta universal | `src/lib/malla/transporte-universal.ts:813`, `:1149`, `:1188`, `:1271`, `:1382` | `canalParaArchivo`, `enviarArchivo`, `abrirCanalDatos`, `abrirFlujo`, `iniciarTransporteUniversal` |
| Motor de archivos | `src/lib/network/archivos-malla.ts:1-45`, `:308`, `:636`, `:1604`, `:1665` | oferta/aceptar/progreso/trozo/fin/ok; latido de progreso; reanudar desde el primer trozo que falta |
| Multitrayecto | `src/lib/malla/canal-multitrayecto.ts:54` | reparto de trozos entre varios enlaces abiertos al mismo aparato |
| Elección y reparto | `src/lib/malla/eleccion-enlace.ts:247`, `:274`, `:308`, `:341` | orden de enlaces, enlaces para reparto, plan por capacidad, selector ponderado |
| Vías selladas | `src/lib/malla/archivo-seguro.ts:28-32`, `:93`, `:118` | capacidades del par, filtro de vías, armado del canal |
| Enjambre de datos | `src/lib/enjambre/iman.ts:21`; `src/lib/enjambre/semilla.ts:28`, `:134`; `src/lib/enjambre/espejo.ts:20`, `:30`; `src/lib/enjambre/almacen.ts:44`; `src/lib/enjambre/planificador.ts:49`, `:80` | imán `starseed:?`, semilla, espejos, almacén de trozos, reintentos y motivos de fallo |
| Interoperabilidad | `src/lib/malla/localsend/envio.ts:75`; `src/lib/malla/localsend/protocolo.ts:14-18` | envío LocalSend, puerto 53317, trozo 16 KiB |
| Llegadas juntas | `src/lib/network/envios-entrantes.ts:16`, `:98` | ventana de 20 s para decidir un envío completo |

### 1.3 · Internet compartido por la malla

| Pieza | Ruta real | Qué se reutiliza |
|---|---|---|
| Puerta GET sellada | `src/lib/malla/puerta-internet.ts:25-45`, `:147`, `:263`, `:314` | opt-in, topes de cuota/batería/tamaño, anti-SSRF, capacidades y anuncio |
| Túnel adaptativo | `src/lib/malla/puerta/tunel.ts:121-136`, `:234-243`, `:362` | ventana por capacidad medida, carril lento, binario, acuses agrupados |
| Anuncios y vida | `src/lib/malla/puerta/tabla.ts:10-14`, `:69`, `:153`, `:188` | reanuncio 30 s, caducidad 90 s, 3 saltos, puntuación de puerta |
| Ajustes y cupo | `src/lib/malla/internet/decision-compartir.ts:54`; `src/lib/malla/internet/cupo-banco.ts:71`; `src/lib/malla/internet/reparto-banco.ts:13`; `src/lib/malla/internet/almacen-contadores.ts:58`; `src/lib/malla/internet/conexion-limitada.ts:17` | decidir compartir, banco diario, reparto, contadores, conexión limitada |
| Relé y faros | `src/ai/astraura/mesh/server-relay.ts:332`, `:432`, `:642`, `:768` | relé cifrado, multi-destino, emisión y lectura de faros |
| Pantallas | `src/components/mesh/mapa-senales/internet/seccion-internet.tsx:94`; `src/components/settings/neurons/ajuste-puerta-internet.tsx:48`; `src/app/(app)/red-mesh/page.tsx` | interruptores actuales, ajustes de neurona y centro de red |
| API local de Genesis | `src/app/api/mando/recursos-red/route.ts` | `guardianMando`, 404 fuera de local; nunca claves, IPs ni rutas absolutas |

```bash
grep -n "iniciarCanalControl\|mandarOrden\|VIDA_ORDEN_MS" src/lib/control-remoto/{canal,orden}.ts
grep -n "enviarArchivo\|canalParaArchivo\|abrirFlujo\|motorArchivosCompartido" src/lib/malla/transporte-universal.ts src/lib/network/archivos-malla.ts
grep -n "crearPuertaInternet\|pedirPorPuerta\|REANUNCIO_MS\|CADUCA_ANUNCIO_MS" src/lib/malla/puerta-internet.ts src/lib/malla/puerta/tabla.ts
```

## 2 · Flujos y requisitos propios

Una sesión no es un tubo: es un conjunto de flujos con exigencias distintas. El transporte adaptativo
decide por flujo, no por archivo ni por aparato. Los valores son el punto de partida; la medida los
ajusta y lo que no se mide se muestra «sin medir», nunca como aprobado.

| Flujo | Prioridad | Retardo objetivo | Caudal | Pérdidas / fiabilidad | Reanudación |
|---|---|---|---|---|---|
| Control (órdenes, toques, teclas) | P0 | p95 ≤ 150 ms | ≥ 8 kbps | < 1 %; firma y acuse obligatorios | No se reanuda una orden: se repite solo si no caducó (2 min, `seq`/`nonce`) |
| Audio (voz, llamada) | P1 | p95 ≤ 200 ms; jitter ≤ 30 ms | 48–128 kbps | < 2 % con ocultación; sin reintento infinito | No: es vivo; se re-sincroniza |
| Vídeo / pantalla | P1 | p95 ≤ 300 ms | 0,8–8 Mbps adaptativo | < 5 %; keyframe al recuperar | No: es vivo; se pide keyframe |
| Archivos | P2 | Sin objetivo; manda el caudal | El máximo que deje el enlace | 100 % de integridad (SHA-256); trozo reintentable | Sí: desde el primer trozo que falta, sin empezar de cero |
| Datos de internet compartido | P3 | Mejor esfuerzo | El que permita la cuota y el banco | Idempotencia; `GET` repetible, `POST` nunca se duplica | Sí cuando el protocolo admite rango; si no, reintento idempotente |

Reglas de asignación: el control siempre por la vía más fiable y de menor retardo; los flujos masivos
nunca le quitan su enlace reservado. Un medio que no cumple el mínimo de un flujo no se le asigna, salvo
que no quede ninguno: entonces se dice el motivo y se degrada de forma declarada (por ejemplo, bajar
el vídeo de resolución), nunca en silencio.

El enjambre de datos usa los mismos flujos y la misma medida: una semilla, un imán o un espejo se
trata como flujo de archivos, su progreso es un latido y su reanudación es por trozo. Así el enjambre
no necesita un segundo sistema de vida ni un segundo medidor.

## 3 · Módulo común (diseño)

Un solo módulo puro, `src/lib/transporte-adaptativo/`, sin red ni DOM. Los motores reales se conectan
después con adaptadores; este contrato no los cablea.

| Archivo | Tipos y funciones | Responsabilidad |
|---|---|---|
| `tipos.ts` | `Flujo`, `RequisitoFlujo`, `MedidaAntena`, `MuestraCalidad`, `AsignacionFlujo`, `EstadoVida`, `PuntoReanudacion`, `MedidaFlujo` | vocabulario único para control, archivos e internet |
| `requisitos.ts` | `REQUISITOS_POR_FLUJO`, `requisitosDeFlujo`, `medidaValida`, `textoMedida` | mínimos por flujo y validación de una medida |
| `latido.ts` | `ritmoDe`, `latir`, `estadoVida`, `sesionSigue` | vida por latidos, no por un plazo fijo |
| `reanudacion.ts` | `puntoDeReanudacion`, `puedeReanudar`, `reanudarFlujo` | conservar sesión y transferencia al cambiar de antena |
| `calidad.ts` | `ventana`, `ewma`, `puntuarAntena`, `comparar` | bucle de calidad/caudal y umbrales de mejora |
| `asignacion.ts` | `asignarFlujos`, `repartirMismoFlujo`, `cambiarEnCaliente` | elección, histéresis y reparto multiantena |
| `registro.ts` | `lineaAsignacion`, `leerLineaAsignacion` | qué flujo va por qué medio, en clave=valor |
| `medidor.ts` | `resumenMedidor`, `filaDeFlujo`, `estadoSemaforo` | lo que pinta el medidor de Genesis |

Invariantes del módulo:

1. **Una sesión, un `sesionId`.** Cambiar de antena no cambia la sesión. Cada flujo tiene un `flujoId`
   estable; `generacion` solo sube cuando hay un reinicio real, no cuando se cambia de medio.
2. **Vida por latidos.** Cada flujo late con su ritmo (control 2 s, audio/vídeo 5 s, archivos e
   internet 10 s). Tres latidos perdidos lo declaran «dudoso»; cinco, «muerto». Un latido de progreso
   reinicia la espera sin reiniciar el hash, el cursor ni la sesión. En control se conservan además la
   sesión de 1 h y los 2 min sin actividad de `sesion.ts`: el latido observa, no debilita.
3. **Reanudación.** Archivos: `PuntoReanudacion` lleva `sesionId`, `flujoId`, `cursor`, `total`,
   `sha256` y la última `seq`; se reanuda desde el primer trozo que falta. Si el hash no coincide se
   reinicia SOLO esa transferencia, con un motivo visible. Internet: se reanuda por la misma sesión y
   solo con peticiones idempotentes. Control: una orden no se reanuda; se vuelve a firmar con `seq` y
   `nonce` nuevos y solo si no caducó.
4. **Bucle de calidad.** Cada antena acumula muestras por flujo en una ventana de 5 s; se calcula media
   exponencial (EWMA). Con menos de 3 muestras no hay verde: se muestra «sin medir». El bucle mide,
   compara y propone; no inventa valores.
5. **Histéresis.** Se reutilizan las constantes del control: permanencia 6 s, reevaluación 4 s, mejora
   de RTT ≥ 30 % y ≥ 15 ms, mejora de caudal ≥ 50 %. Un enlace en uso solo se deja si el otro es
   claramente mejor, o si el actual falla/desaparece. Nunca se oscila entre dos antenas parecidas.
6. **Reparto multiantena.** Primero se separan los flujos (control, audio, vídeo/pantalla, archivos,
   internet). Después, un mismo flujo puede usar varias antenas si suma caudal o fiabilidad: archivos
   por trozos ponderados por capacidad; vídeo con capa principal y respaldo; audio con duplicado
   opcional solo si la pérdida medida lo justifica. El control no se reparte a ciegas: tiene una vía
   principal y una de respaldo lista, sin duplicar órdenes.

### 3.1 · Autoenrutado por tipo de flujo

No hay un mapa fijo de «esto siempre por aquello»: hay requisitos por flujo y una medida por antena.
Cuando varias antenas están vivas, se usan a la vez si el reparto es más eficiente que una sola.

| Ejemplo con tres antenas vivas | Por qué |
|---|---|
| Vídeo/pantalla por Wi-Fi Direct | es el que más caudal da y no pasa por el router |
| Audio por el Wi-Fi del router | retardo bajo y estable, sin competir con el vídeo en el mismo enlace |
| Control por Bluetooth directo | poca carga, enlace dedicado y el menor retardo para toques y teclas |
| Archivos por Wi-Fi Direct + Wi-Fi del router + Bluetooth, por trozos ponderados | suma caudal y tolera que un enlace se caiga |
| Internet compartido por la puerta de menor retardo y cuota disponible | no compite con el control ni con el vídeo local |

Si una de esas antenas no existe o no cumple, se reasigna con la misma histéresis y se registra el
cambio. La combinación la decide la medida, no una tabla escrita de antemano.

## 4 · Medidas comunes y medidor de Genesis

Una sola medida sirve para los tres mundos. `MedidaFlujo` es la fila que comparten el control, los
archivos y la puerta de internet; cada fuente rellena lo que de verdad mide y deja `null` en lo demás.

| Campo | Unidad | Quién lo llena | Regla |
|---|---|---|---|
| `flujo` | control · audio · video-pantalla · archivos · internet | todos | sale del `flujoId`; no se deduce del tamaño |
| `medios` | lista de `TipoMedio` | todos | uno o varios; es el registro visible de qué flujo va por qué medio |
| `estado` | vivo · dudoso · muerto · reanudado | latido | «reanudado» no es verde: se dice aparte |
| `fps` | fps | vídeo/pantalla | solo si la fuente lo mide; si no, `null` |
| `kbps` | kbit/s | todos | caudal medido; nunca el nominal como si fuera medido |
| `rttMs` | ms | todos | retardo de ida y vuelta del par o de la puerta |
| `jitterMs` | ms | audio/vídeo | variación del retardo; `null` si no se mide |
| `perdidaPct` | % | audio/vídeo/archivos/internet | pérdida de la ventana; no se confunde con reintentos |
| `muestras` | n | todos | menos de 3 ⇒ «sin medir» |
| `motivo` | texto corto | todos | por qué no hay medida o por qué se degradó |

Fuentes reales: `medio-estado.ts` y `auto-enlace.ts` para el control; `archivo.progreso` y
`archivos-malla.ts` para archivos; `AnuncioPuerta`, los acuses del túnel y los contadores de
`src/lib/malla/internet/` para internet. El medidor no abre una conexión nueva: lee la instantánea.

**Medidor de calidad (Genesis).** Una fila por flujo: punto de color, nombre del flujo, medio o medios,
cifra principal (fps en vídeo, kbps en el resto), retardo, pérdidas y estado. El punto es verde solo
con medida suficiente y requisitos cumplidos; ámbar si va degradado o reanudado; rojo si no cumple;
gris si no se midió. El nombre va siempre en texto: el color nunca es la única información. Debajo,
la tabla `flujo → medio(s)` es el registro que pide Alex, visible sin abrir otra pantalla.

**Identidad y verificación del medidor.** Usa los tokens de Genesis (`--mc-neon-cian`,
`--mc-neon-violeta`, `--mc-neon-ambar`, cristal y radios existentes), no hex sueltos. Escala φ en
tablet/escritorio/TV y 1,25 en móvil/plegable; espaciado Fibonacci; rejilla áurea 38,2/61,8 con el
flujo en peor estado como único foco. La geometría sagrada (flor de la vida o vesica piscis) va en
una capa `aria-hidden`, con opacidad baja y sin tapar cifras; nada de WebGL. Contraste ≥ 4,5:1,
dianas ≥ 44 px, `cursor-pointer` en lo clicable y `prefers-reduced-motion` respetado. Se comprueba en
280, 360×780, 430×932, 768×1024, 1024×1366, 1280×800, 1920×1080 y 3840×2160, en móvil, tablet,
escritorio, plegable y TV, sin overflow horizontal ni texto cortado.

La instantánea llega por las rutas `/api/mando/*` existentes: son SOLO locales (404 en producción) y
jamás devuelven claves, IPs ni rutas del disco. El medidor no sondea en bucle: eventos y refresco
perezoso, como el resto de Genesis.

## 5 · Reglas fijas que no se debilitan

- **Firma y repetición:** toda orden de control va firmada (ECDSA P-256), con `seq`, `nonce`, hora
  ±5 min y vida máxima de 2 min. Se conservan los topes 5/s y 60/min por aparato, la entrada 60/s y
  el techo total 70/s. Los flujos de datos no pueden saltarse esta puerta.
- **Aviso:** cualquier petición verificada enseña un punto de color con el nombre completo (solo se
  corta por encima de 40 caracteres) y su código. El aviso NUNCA enciende, acepta ni concede nada.
- **«Terminar» y «Quitar permiso»:** siguen siendo dos acciones distintas. «Terminar» cierra solo la
  sesión; «Quitar permiso» cierra la sesión y apaga el permiso en este aparato. Ninguna se sustituye
  por un cierre silencioso.
- **Permiso de control apagado por defecto.** Solo la persona dueña, en su aparato, acepta. Un voto de comunidad
  NUNCA anula el permiso del dueño de un aparato personal.
- **El control manda en su vía:** siempre por la antena más fiable y de menor retardo; los flujos
  masivos no lo desplazan. Si no hay una vía que cumpla, se dice el motivo; no se finge un verde.
- **Archivos e internet no abren permisos:** un archivo siempre pregunta aunque venga por un enlace
  emparejado; la puerta de internet es opt-in, con cuota, batería, lista de hosts y anti-SSRF. Ningún
  flujo compartido puede abrir el control, una antena o una sesión.
- **Secretos:** solo nombres de variables de entorno. Nunca valores en código, memorias, prompts,
  registros, medidores ni en el bus.

## 6 · Fuera de alcance de esta tarea

No se escribe código de producto, no se cablean pantallas ni motores, no se crean rutas nuevas y no se
toca el control remoto. La construcción va en la cola de abajo, en módulos puros con pruebas; el
cableado a los motores reales será otra tarea con su propia revisión.

## 7 · Cola de construcción

`starseed_memory_root/olas/cola-transporte-adaptativo-1119.json` contiene seis tareas pequeñas
(TAD1119A–TAD1119F), cada una de ≤ 3 archivos y ≤ 120 líneas por archivo. TDD rojo → verde, pruebas
puras con `vitest` en `src/` (y `cargo test` en `native/src-tauri` solo si una tarea toca Rust). La
primera fija tipos y requisitos; la segunda, vida y reanudación; la tercera, calidad y asignación; la
cuarta, registro y medidor; la quinta y la sexta, adaptadores puros de archivos e internet compartido.
