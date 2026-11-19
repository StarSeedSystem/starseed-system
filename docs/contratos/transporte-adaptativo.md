# Contrato · Transporte adaptativo común multiantena por flujos

**CTL1119 · 19-11-2026 · área mando/diseño.** Fuente de verdad para aplicar a archivos e
internet compartido lo que ya funciona en el control entre neuronas. **Esta tarea no escribe
código de producto**: fija el contrato, las medidas y la cola pequeña que lo construye.

## 0 · Lo que pide Alex y lo que no entra

Alex (18-11): lo aprendido con el control remoto debe valer para las demás funciones de la malla
P2P —archivos y capas de internet de la malla comunitaria local multicapa—. En una transmisión
se deben poder usar **varios medios a la vez** cuando sea más eficiente, con autoenrutado por
tipo de flujo: por ejemplo vídeo por Wi‑Fi Direct, audio por el Wi‑Fi del router y control por
Bluetooth directo, o la combinación que convenga en cada caso.

Este contrato exige, y la cola §6 construye:

1. separar cada sesión en **flujos** (control, audio, vídeo/pantalla, archivos y datos de
   internet compartido) con requisitos propios de retardo, caudal y fiabilidad;
2. **medir cada antena disponible** por flujo, sin inventar lo que no se mide;
3. **asignar cada flujo** a la antena que mejor lo cumpla, o repartirlo entre varias, con cambio
   en caliente e histéresis;
4. dejar el **control** siempre por la vía más fiable y de menor retardo;
5. registrar y mostrar **qué flujo va por qué medio** en el medidor de calidad de Genesis.

No entra aquí: escribir módulos de producto, cambiar el orquestador, añadir un segundo
transporte ni abrir antenas o permisos nuevos. Eso vive en las tareas CTA1119A–F de la cola.

## 1 · Lo que ya existe (verificado con grep el 19-11-2026)

### 1.1 Control entre neuronas

| Pieza | Ruta exacta | Lo que aporta |
|---|---|---|
| Superficie y ventana | `src/app/control-remoto/page.tsx` → `/control-remoto`; `src/components/control-remoto/ventana-control/ventana-control.tsx` | La persona ve y dirige la sesión; no es una ruta de API |
| Anatomía de la orden | `src/lib/control-remoto/orden.ts:14` `AUD_CONTROL`, `:16` `CANAL_CONTROL`, `:18` `VIDA_ORDEN_MS = 120_000`, `:20` `DESFASE_MAX_MS` | Dominio separado, canal `control-neuronas` y vida de 2 min |
| Firma por aparato | `src/lib/control-remoto/orden.ts` (`verificarFirma`, ECDSA P‑256/SHA‑256) | La orden se firma sobre los bytes exactos de `JSON.stringify(carga)` |
| Puerta del aparato controlado | `src/lib/control-remoto/sesion.ts` (`PuertaControl`, 13 comprobaciones) | Forma → permiso → cuenta → controlador aceptado → firma → destino → hora → `seq`/nonce → tope → acción → argumentos → nivel → sesión |
| Topes de órdenes | `src/lib/control-remoto/sesion.ts:43` `TOPE_SEGUNDO = 5`, `:44` `TOPE_MINUTO = 60`, `:46` `TOPE_ENTRADA_SEGUNDO = 60`, `:50` `TOPE_TOTAL_SEGUNDO = 70`, `:52` `MAX_CONTROLADORES = 4`, `:53` `MAX_PENDIENTES = 5` | Nada de ráfagas; las lecturas tienen su propio cupo |
| Sesión | `src/lib/control-remoto/sesion.ts:41` `SESION_MAX_MS = 1 h`, `:42` `SESION_INACTIVA_MS = 2 min` | La sesión vive por actividad, no por un plazo fijo |
| Permiso local | `src/lib/control-remoto/sesion.ts` (`permisoDeFabrica`: `encendido: false`) y `src/lib/control-remoto/canal.ts` (`leerPermisoLocal`, `guardarPermisoLocal`) | Apagado de fábrica; solo la persona dueña lo enciende y acepta |
| Aviso y parada | `src/components/control-remoto/punto-control.tsx`, `banda-control.tsx`, `aviso-peticion-control.tsx`, `anfitrion-control.tsx`; `src/lib/control-remoto/nativo.ts` | Punto de color con el nombre, «Terminar» y «Quitar permiso» |
| Medio del control | `src/lib/control-remoto/medio.ts:19` `MEDIOS_ELEGIBLES`, `:22` `CLAVE_MEDIO`; `medio-estado.ts`; `medio-palabras.ts` | Elección por aparato controlado y traducción a palabras llanas |
| Automático con histéresis | `src/lib/control-remoto/auto-enlace.ts:18` `PERMANENCIA_MS = 6 s`, `:20` `REEVALUAR_MS = 4 s`, `:22-25` mejora de 30 % y 15 ms en retardo o 50 % en caudal | El enlace en uso no se deja por otro que no sea claramente mejor |
| Pantalla sin WebRTC | `src/lib/control-remoto/cuadro-malla.ts:12` `PARTE_CUADRO_MAX`, `:18` `UMBRALES_MALLA`; `ritmo-pantalla.ts` | Cuadros JPEG por la malla, con nivel y ritmo adaptados |
| Lado nativo | `native/src-tauri/src/control_neuronas*.rs`, `acceso_equipo*.rs`, `banco_latido.rs` | Indicador, parada y registro viven fuera de la web |

### 1.2 Archivos y datos por la malla

| Pieza | Ruta exacta | Lo que aporta |
|---|---|---|
| Puerta única de envío | `src/lib/malla/transporte-universal.ts:431` `enlacesDisponibles`, `:557` `enviarMensaje`, `:660` `alRecibirMensaje`, `:1149` `enviarArchivo` | Elige el enlace real más directo; archivos, mensajes y flujos comparten puerta |
| Enlaces reales | `src/lib/malla/eleccion-enlace.ts:75` `EnlaceDisponible`; tipos `local`, `nativo`, `ble`, `cuenta`, `par`, `rele`, `lora` | Cada enlace declara si está abierto, a quién alcanza, `rttMs`, `capacidadKbps` y qué clases admite |
| Protocolo de archivos | `src/lib/network/archivos-malla.ts:16-35` (`archivo.oferta`, `aceptar`, `progreso`, `chunk`, `fin`, `ok`, `error`, `cancelar`) | Oferta con SHA‑256, trozos, acuse y latido |
| Reanudación | `src/lib/network/archivos-malla.ts:289` `desde`, `:299` `huecos`, `:309` `archivo.progreso`; `:547` `huecosDe` | Se reanuda por índice o por rangos que faltan; nunca se finge un trozo guardado |
| Reparto multitrayecto | `src/lib/malla/canal-multitrayecto.ts:54` `crearCanalMultitrayecto`; `src/lib/malla/eleccion-enlace.ts:292` `pesosPorCapacidad` | Reparte trozos por capacidad medida; cada trozo por un solo camino, nunca duplicado |
| Envío agrupado | `src/lib/network/envios-entrantes.ts:98` `agruparEnvios`, `:123` `enviosPorDecidir` | Varios archivos forman un envío y una sola ventana de aceptación |
| Inspección previa | `src/lib/network/inspeccion-archivos.ts:80` `extensionDe`, `:195` `listarZip` | Se inspecciona antes de aceptar; no se ejecuta nada |
| Cifrado y sellado | `src/lib/malla/archivo-seguro.ts:118` `armarCanalArchivo`; `src/lib/malla/recepcion-sellada.ts:59` `recibirArchivo` | El archivo viaja sellado de punta a punta |
| Entrada decidida | `src/lib/malla/cristal/centinela-archivos.ts:29` `decidirEntrada` | La política de recepción se decide en el receptor |
| LocalSend | `src/lib/malla/localsend/envio.ts`, `protocolo.ts`; descarte en `src/lib/malla/eleccion-enlace.ts` | Solo archivos, solo app nativa y solo red local; no vale para mensajes ni flujos |
| Relé y saltos | `src/lib/malla/rele-archivo.ts`, `rele-bidireccional.ts` | Mensajes y archivos por relevo, con sobre y acuse |
| Pruebas | `src/lib/network/__tests__/archivos-malla*.test.ts`, `canal-multitrayecto.test.ts` | Integridad, reanudación, multitrayecto y archivos grandes |

### 1.3 Internet compartido por la malla

| Pieza | Ruta exacta | Lo que aporta |
|---|---|---|
| Ajustes y decisión | `src/lib/malla/internet/tipos.ts` (`AjustesInternet`, audiencias), `decision-compartir.ts:54` `decidirCompartir` | Quién puede usar la salida y con qué límite |
| Banco y reparto | `src/lib/malla/internet/cupo-banco.ts:71` `cupoBanco`; `reparto-banco.ts:13` `repartirRacion`; `contadores.ts:38` `sumarBytes` | Ración diaria u horaria por audiencia y reparto por capacidad |
| Servicio de puerta | `src/lib/malla/puerta/servicio.ts:283` `iniciarPuertaMalla`, `:112` `estadoPuerta` | Anuncia la salida, elige puerta y aplica el proxy |
| Túnel y tabla | `src/lib/malla/puerta/tunel.ts:362` `crearGestorPuerta`, `:263` `validarDestino`; `tabla.ts:188` `TablaPuertas`, `:153` `puntuarPuerta` | Tramas con ventana y acuses; elección de la mejor puerta |
| Capas compartibles | `src/lib/malla/puerta/capas.ts`, `capas-fuentes.ts`; `puerta-internet.ts` (`puerta.http.v1`) | Internet, servidores propios, LAN y routers como capas; respaldo `GET` sellado |
| Actividad y papeles | `src/lib/malla/puerta/actividad.ts`, `roles.ts`, `politica.ts` | Qué carril se usa, con qué papel y con qué límites |
| Oferta de recursos | `src/lib/recursos/oferta.ts:57` `ofertaVisiblePara`, `:67` `capacidadPrestable`; `bolsa.ts:17` `planificar` | Lo que cada neurona ofrece y lo que se le puede pedir |
| Superficie local | `src/app/api/mando/recursos-red/route.ts` (solo local) | Resume ofertas, préstamos y volúmenes sin claves, IPs ni rutas |
| Interfaz | `src/components/settings/neurons/ajuste-puerta-internet.tsx`; `/red-mesh`, `/senales`, `/sincronizacion` | La persona enciende, ve y corta lo compartido |

### 1.4 Medidores y superficies de Genesis

- `/api/mando/medidores` (solo local) y `src/lib/mando/medidores.ts:64` `ClaveMedidor` son el
  catálogo de medidores del pulso. Hoy no existe una clave de transporte.
- `/api/mando/recursos-red` ya resume la red, y `src/components/control-remoto/ventana-control/medio/indicador-medio.tsx`
  ya enseña el medio del control con `src/lib/control-remoto/medio-palabras.ts`.
- La puerta arranca desde `src/components/network/malla-neuronas-mount.tsx` con
  `iniciarPuertaMalla`; el latido de presencia lenta vive en `src/lib/neurons/presencia.ts`.
- Ninguna de estas superficies comparte hoy una misma medida por flujo: el control mide su
  enlace, los archivos su caudal y la puerta sus carriles, cada uno por su cuenta.

### 1.5 Lo que falta y justifica el módulo común

Falta un **lenguaje único de flujos, medidas y asignación** que las tres funciones usen sin
duplicar reglas. El control ya tiene histéresis y elección, pero solo para su canal; los archivos
reparten por capacidad, pero no eligen por requisitos de flujo; la puerta elige puerta y carril,
pero no comparte su medida con los demás. El módulo `transporte-adaptativo` es pura lógica: no
abre enlaces, no firma, no concede permisos y no sustituye a `transporte-universal`.

## 2 · Los flujos y sus requisitos

La unidad de decisión es el **flujo**, no la sesión ni el archivo. Una sesión de control puede
tener control + audio + vídeo/pantalla; un envío de archivos es un flujo de archivos; una salida
a internet es un flujo de datos compartidos. Los valores son objetivos de ingeniería y se
calibran con medidas; no son promesas de marketing.

| Flujo | Qué transporta | Retardo objetivo | Caudal objetivo | Fiabilidad | Orden | Prioridad | Reparto | Medios que pueden servirlo |
|---|---|---:|---:|---|---|---:|---|---|
| `control` | órdenes, gestos, teclas, lecturas | p95 ≤ 120 ms local; ≤ 250 ms por capa | ≥ 16 kbit/s | pérdida ≤ 1 %; acuse y `seq` | sí, estricto | 0 | no; primario + respaldo | Wi‑Fi Direct, red local, Bluetooth directo, WebRTC, TCP nativo; capa solo si no hay directo |
| `audio` | voz y llamada | p95 ≤ 200 ms | 64–128 kbit/s | pérdida ≤ 2 % con ocultación | por muestras | 1 | puede duplicar si el dueño lo permite | Bluetooth, red local, Wi‑Fi Direct, WebRTC |
| `video` | cámara y pantalla | p95 ≤ 150 ms; 15–30 fps local, 4–10 por malla | 1,5–8 Mbit/s local | pérdida ≤ 5 % tolerable; clave periódica | no estricto | 2 | sí, por teselas o por capas | Wi‑Fi Direct, red local, WebRTC; malla solo con nivel mínimo |
| `internet` | peticiones y descargas de la puerta | interactivo ≤ 300 ms; descarga sin plazo fijo | el que dé el carril | TCP: 100 %; nunca duplicar un `POST` | por petición | 3 | sí para `GET/HEAD`; no para `POST` | red local, Wi‑Fi Direct, LAN, capas propias, puerta de otra neurona |
| `archivos` | cualquier archivo | no crítico | el máximo medido | 100 % por SHA‑256; reanudable | no | 4 | sí, por capacidad | multitrayecto, TCP nativo, WebRTC, BLE ≤ 20 MB; nunca LoRa |

Reglas de la tabla:

1. **Un flujo no hereda el requisito de otro.** El vídeo puede perder un cuadro; el control no
   puede perder una orden. El archivo puede esperar; la voz no.
2. **Lo que no se mide es `null`, no cero.** Una antena sin medida no gana por optimismo.
3. **La prioridad manda en conflicto.** Antes de degradar control se degrada archivos; antes de
   degradar audio se degrada vídeo; nunca se quita capacidad reservada al control para dar más
   caudal a una descarga.
4. **LoRa (Meshtastic) solo lleva mensajes cortos.** No lleva archivos, ni vídeo, ni audio, ni
   la orden de control como camino principal.
5. **El control solo usa caminos consentidos.** Si el único camino es un relé o una puerta que
   no consintió ese aparato, el flujo queda sin asignar y se dice por qué.

## 3 · El módulo común `transporte-adaptativo`

Vive en `src/lib/transporte-adaptativo/` como módulos **puros** (sin red, sin DOM, sin `node:*`):
`tipos.ts`, `sesion.ts`, `medidas.ts`, `medidores.ts`, `calidad.ts`, `reanudacion.ts`, `eleccion.ts`.
La cola §6 añade dos adaptadores de cableado: `archivos.ts` e `internet.ts`. Ningún módulo nuevo
sustituye a `src/lib/malla/transporte-universal.ts`; lo alimenta.

### 3.1 Sesión, latidos y vida por latidos

- **Una sesión, un `sesionId`.** Se crea una vez y **no cambia al cambiar de antena**, de enlace
  ni de medio. El cambio de medio es un cambio de camino, no una sesión nueva.
- **Latido por flujo.** Cada flujo activo late con su periodo: control, audio y vídeo cada 2 s;
  archivos e internet cada 5 s mientras hay transferencia. En reposo se late cada 15 s para no
  gastar radio, y un flujo inactivo no mantiene viva la sesión.
- **Vida por latidos, no por paquetes sueltos.** El umbral de **degradado** es
  `max(3 × periodo, 6 s)` y el de **caído** es el doble. Solo un latido autenticado del mismo
  `sesionId` y del mismo flujo prolonga la vida; uno viejo, de otro flujo o de otra sesión, no.
- **La sesión del control conserva sus reglas.** `SESION_MAX_MS = 1 h` y `SESION_INACTIVA_MS = 2 min`
  de `src/lib/control-remoto/sesion.ts` siguen mandando; este módulo no los alarga ni los acorta.
- **Sin sondeos en bucle.** El latido es un evento periódico pequeño y agregado; no se crea una fila
  por latido ni se sondea cada enlace cada segundo.

### 3.2 Reanudación sin perder sesión ni transferencia

- **Sesión.** Al volver un enlace se reutiliza el mismo `sesionId`, el mismo controlador y el
  mismo `seq` siguiente. Nunca se reinicia el contador ni se reutiliza un `nonce`; una orden
  reintentada reenvía **la misma orden firmada** (mismo `seq` y `nonce`), como ya exige la puerta.
- **Archivos.** Se reanuda con lo que ya existe: `archivo.aceptar.desde` (primer trozo que falta)
  o `huecos` (rangos), y el remitente manda solo eso. El `id` de la transferencia y su lista de
  hashes no cambian al cambiar de medio. Un trozo confirmado por el almacén del receptor no se
  vuelve a pedir; un trozo perdido se pide solo a él.
- **Internet.** Un `GET/HEAD` puede repetirse por otra antena con el mismo `id` lógico; un `POST`
  **nunca** se duplica: si ya salió, se espera su respuesta o se informa del fallo. La ventana y
  los acuses del túnel de la puerta siguen siendo la verdad de lo entregado.
- **Un plan, no una promesa.** `PlanReanudacion` devuelve `desde`, `huecos`, `sesionId`, `seq` y
  `reintentar`; si el receptor no puede confirmar, el plan es `null` y se dice por qué. Nunca se
  inventa un acuse.

### 3.3 Bucle de calidad y caudal

- **Una ventana, una media.** Cada flujo acumula muestras de una ventana corta (1 s en control,
  audio y vídeo; 1–5 s en archivos e internet) y calcula una media móvil exponencial con
  `α = 1/8`. La primera muestra fija la media; ninguna ventana vacía la pone a cero.
- **Subir cuesta más que bajar.** Se baja de nivel tras **2 medidas** por encima del umbral y se
  sube tras **4 medidas** por debajo, igual que `src/lib/control-remoto/ritmo-pantalla.ts`. Así no
  se oscila entre dos calidades.
- **Qué se ajusta por flujo:** vídeo baja resolución o calidad de cuadro; audio baja su tasa de
  bits; archivos ajustan el tamaño de trozo y la ventana en vuelo (nunca el hash ya anunciado);
  internet ajusta concurrencia y tamaño de trama; **control no baja calidad**: si no cumple,
  cambia de antena o avisa.
- **Cuando no cabe, se cambia de antena.** Si el flujo lleva 2 ventanas sin alcanzar su mínimo, el
  bucle pide reevaluar la asignación (§3.4); no insiste con el mismo camino ni finge que mejora.
- **El bucle no esconde el fallo.** Devuelve `nivel`, `cambio`, `motivo` y `degradado`; el
  medidor enseña la medida real y, si se degradó, por qué.

### 3.4 Elección y cambio de antena con histéresis

`elegirAntena(flujo, antenas, anterior, ahora, opciones)` trabaja en dos pasos:

1. **Filtros duros, antes de puntuar.** Se descarta una antena si no está abierta, no alcanza al
   destino, no admite la clase de envío, no tiene cifrado exigible, supera `maxBytes`, no tiene el
   consentimiento del dueño o va por datos móviles medidos cuando la política lo prohíbe. Un
   descarte lleva siempre su motivo legible; no se convierte en un cero silencioso.
2. **Puntuación por flujo.** Con las que quedan, se normalizan retardo, jitter, pérdida y caudal
   medidos, y se aplican pesos por flujo: control pesa fiabilidad y retardo; vídeo y archivos
   pesan caudal; audio pesa jitter y pérdida; internet pesa caudal y, en interactivo, retardo. Un
   enlace **directo** gana a un relevo, TURN o servidor mientras exista y esté abierto.

**Histéresis (no se cambia por ruido):**

- El enlace en uso se queda salvo que el aspirante sea **claramente mejor**: ≥ 30 % y ≥ 15 ms
  mejor en retardo, o ≥ 50 % más de caudal, con las mismas constantes que
  `src/lib/control-remoto/auto-enlace.ts`.
- **Permanencia mínima de 6 s** y reevaluación cada 4 s, o inmediata si el enlace actual falla o
  desaparece. Tras 3 cambios en 30 s se abre una pausa de 30 s para el mismo flujo.
- **El control no se mueve por caudal.** Su orden es: más fiable, menor retardo, directo antes que
  capa; y si la antena elegida deja de cumplir, se pasa al respaldo, no a la de más ancho de banda.
- **Cambiar de antena no cambia permisos.** El módulo solo elige entre enlaces que ya existen;
  no abre Bluetooth, Wi‑Fi Direct, puerta ni permiso alguno, y no salta la firma ni los topes.

### 3.5 Reparto multiantena por tipo de flujo

- **Un flujo, un primario.** Cada flujo tiene una antena primaria y, si aplica, un respaldo. El
  respaldo no consume caudal hasta que el primario falla o no cumple.
- **Reparto por capacidad.** Solo los flujos que lo permiten se reparten: `archivos` (trozos),
  `video` (teselas o capas) y `internet` en `GET/HEAD`. Se reutiliza el reparto por capacidad
  medida de `src/lib/malla/canal-multitrayecto.ts` y `pesosPorCapacidad`; cada trozo o petición
  va por **un solo** camino, nunca duplicado.
- **Duplicar es una excepción.** Audio puede duplicarse si el dueño lo permite y la pérdida es
  alta; vídeo puede duplicar solo un cuadro clave. El control **no duplica** órdenes firmadas:
  usa primario + respaldo y reenvía la misma orden si falta el acuse, que es lo que ya protege la
  puerta con `seq`/nonce.
- **Asignación global con prioridad.** Se asignan primero control, luego audio, vídeo, internet y
  archivos; cada flujo reserva su mínimo y los de abajo usan el sobrante. Nunca se quita el mínimo
  del control para acelerar una descarga.
- **Ejemplo que Alex pidió, como hipótesis a medir:** vídeo por Wi‑Fi Direct, audio por el Wi‑Fi
  del router y control por Bluetooth directo. Se usa **solo si las medidas lo justifican**: si el
  Bluetooth no cumple el retardo o la fiabilidad del control, el control va por Wi‑Fi Direct y el
  vídeo se reordena. La tabla del ejemplo no manda sobre la medida.
- **Topes por medio.** Bluetooth no lleva archivos grandes ni vídeo de alta tasa; LoRa solo
  mensajes cortos; la capa compartida no se usa para el control si hay un directo. El reparto
  respeta `maxBytes`, `capacidadKbps` y la política de datos móviles ya existente.

### 3.6 Medidas comunes y medidores de Genesis

Una sola forma de medida para las tres funciones:

```
MedidaFlujo {
  flujo, sesionId, medio, enlace, desdeMs, hastaMs,
  fps | null, caudalKbps | null, rttMs | null, jitterMs | null,
  perdidaPct | null, bytes, muestras, medido
}
```

- **Unidades fijas:** `fps` para vídeo/pantalla; `caudalKbps` para archivos, audio e internet;
  `rttMs` y `jitterMs` en milisegundos; `perdidaPct` de 0 a 100; `bytes` enteros. Si no hay
  muestra, el campo es `null` y `medido` es `false`; nunca se enseña un cero falso.
- **Agregados:** p50 y p95 por ventana, no un promedio que oculte la cola. La medida de una
  antena es la del flujo que la usa, con su `medio` y su `enlace` (sin IP ni ruta del disco).
- **Medidor de Genesis:** una clave nueva `transporte` en `src/lib/mando/medidores.ts` y su lectura
  en `/api/mando/medidores` (solo local, con `guardianMando`), con una fila por flujo: estado,
  medio actual, fps o caudal, retardo y pérdidas. Mientras la clave no exista, el mismo resumen se
  ve en el indicador de medio del control y en `/api/mando/recursos-red`.
- **Nunca devuelve** claves, tokens, IPs, rutas absolutas ni contenido. Solo flujo, medio, números
  y un motivo corto.
- **Una línea de registro por cambio**, no por latido:
  `transporte flujo=<flujo> medio=<medio> enlace=<id> estado=<vivo|degradado|caido> rtt=N kbps=N perdida=N% motivo=<corto>`.
  Se escribe al cambiar de medio, de nivel o de estado, y al cerrar; nunca en bucle.

### 3.7 Registro visible: qué flujo va por qué medio

- El medidor de calidad enseña, por sesión, una fila por flujo con: **flujo → medio actual**
  (primario y respaldo), desde cuándo, la medida que lo justifica y, si se degradó, por qué.
- En la ventana de control, esa fila se suma a lo que ya pinta
  `src/components/control-remoto/ventana-control/medio/indicador-medio.tsx`: «Órdenes: … ·
  Pantalla: …» pasa a «Control: … · Audio: … · Vídeo: …» cuando la sesión tenga más de un flujo.
- El registro es de solo-añadir y sin repeticiones: el mismo estado no se reescribe. La persona
  puede ver la asignación sin abrir una consola ni leer un log.
- La asignación visible no concede nada: es información. Quitar un permiso, cerrar la sesión o
  pulsar «Terminar» manda sobre cualquier reparto y se refleja en la fila al instante.

## 4 · Reglas que no se debilitan

El transporte adaptativo **no toca** estas reglas; las hereda tal cual del control:

1. **Firma por aparato.** Toda orden de control sigue firmada con ECDSA P‑256/SHA‑256 sobre sus
   bytes exactos; el reparto y las medidas no firman, no re-firman ni reemplazan la firma.
2. **Protección contra repetición.** Cada orden vive **2 min** (`VIDA_ORDEN_MS = 120_000`), con
   `seq` monótono, `nonce` nuevo y reloj a ±5 min. Un cambio de antena no reinicia `seq` ni
   reutiliza `nonce`; un reintento legítimo reenvía la misma orden firmada.
3. **Topes de órdenes.** 5 por segundo y 60 por minuto por controlador; 60 entradas por segundo;
   5 lecturas por segundo; 70 en total por segundo; 4 controladores y 5 pendientes. Ningún flujo
   de vídeo, audio o archivos consume el cupo de órdenes.
4. **Aviso visible.** Punto de color con el nombre de quien controla y la banda de sesión; no se
   oculta ni se reduce por repartir el tráfico entre medios.
5. **«Terminar» y «Quitar permiso».** «Terminar» corta la sesión; «Quitar permiso» apaga el
   permiso y revoca. Ambos mandan sobre cualquier plan de flujos y se aplican al instante.
6. **Permiso apagado de fábrica.** El control sigue apagado por defecto y **solo la persona dueña
   del aparato** lo enciende y acepta un controlador. Ninguna medida, ningún flujo ni ninguna
   automatización lo encienden.
7. **Un voto de comunidad nunca anula el permiso del dueño** de un aparato personal. La malla
   puede ofrecer nodos públicos declarados; no puede abrir la sesión personal de nadie.
8. **Nada se inventa.** Sin medida, el campo es `null`. Sin enlace consentido, el flujo no se
   asigna. Sin acuse, la transferencia no se da por buena.

## 5 · Límites y no objetivos

- **No hay un segundo orquestador ni un segundo transporte.** El módulo es lógica pura que
  alimenta a `transporte-universal`, a `archivos-malla` y a la puerta; el envío real sigue donde
  está.
- **No hay código de producto en esta tarea.** Solo el contrato y la cola.
- **No se simulan medidas.** Si una antena no se midió, no se le asigna un caudal nominal salvo
  para ordenar como «estimado» y nunca se enseña como medido.
- **No se promete funcionamiento en aparatos reales** hasta la prueba de dos aparatos: Mac ↔
  Android, Mac ↔ tableta y dos redes distintas, incluida la caída de un medio en caliente.
- **No se rompe la estética ni la accesibilidad:** el medidor de flujos se comprueba en 280, 360,
  430, 768, 1024, 1280, 1920 y 3840 px, con tacto y puntero, contraste ≥ 4.5:1, dianas ≥ 44 px,
  `prefers-reduced-motion` y sin overflow horizontal, según `memory/diseno/armonia.md`.
- **No se añaden dependencias.** Se reutilizan `src/lib/malla/transporte-universal.ts`,
  `src/lib/network/estadisticas-enlace.ts`, `src/lib/malla/canal-multitrayecto.ts`,
  `src/lib/malla/puerta/*`, `src/lib/recursos/*` y los medidores existentes.
- **No se toca el nativo en esta ola** salvo que una tarea lo pida; si lo pide, su prueba es
  `cargo test` en `native/src-tauri` y no se sustituye una herramienta en servicio sin cubrir sus
  arreglos con pruebas del repo.

## 6 · Construcción en 6 tareas (cola CTL1119)

La cola vive en `starseed_memory_root/olas/cola-transporte-adaptativo-1119.json`. Cada tarea
escribe un módulo **nuevo y pequeño** (≤ 3 archivos, ≤ 120 líneas por escritura), con su prueba
pura; el cableado va en su propia tarea y es mínimo.

| Tarea | Qué construye | Archivos | Depende |
|---|---|---|---|
| **CTA1119A** | Flujos, requisitos y sesión con vida por latidos | `src/lib/transporte-adaptativo/tipos.ts`, `sesion.ts`, `__tests__/tipos-sesion.test.ts` | — |
| **CTA1119B** | Medidas comunes y fila del medidor de Genesis | `medidas.ts`, `medidores.ts`, `__tests__/medidas.test.ts` | A |
| **CTA1119C** | Bucle de calidad/caudal y reanudación | `calidad.ts`, `reanudacion.ts`, `__tests__/calidad-reanudacion.test.ts` | A, B |
| **CTA1119D** | Elección con histéresis y reparto multiantena | `eleccion.ts`, `__tests__/eleccion.test.ts` | A, B, C |
| **CTA1119E** | Cableado a archivos: adaptador y `enviarArchivo` | `archivos.ts`, `src/lib/network/__tests__/transporte-adaptativo-archivos.test.ts`, `src/lib/malla/transporte-universal.ts` | D |
| **CTA1119F** | Cableado a internet compartido: adaptador y puerta | `internet.ts`, `src/lib/malla/__tests__/transporte-adaptativo-internet.test.ts`, `src/lib/malla/puerta/servicio.ts` | D |

**Orden de trabajo (TDD de una costura por ciclo):**

1. Escribir primero la prueba que falla con el comportamiento de la tabla §2 y las constantes
   §3; luego el código justo para pasarla.
2. Probar por la interfaz pública y con datos reales de forma; sin pruebas tautológicas ni
   acopladas a la implementación.
3. Reutilizar las constantes y umbrales ya probados del control (`auto-enlace.ts`,
   `ritmo-pantalla.ts`) en vez de inventar otros.
4. CTA1119E y CTA1119F no cambian el comportamiento cuando no hay plan adaptativo: el envío
   anterior sigue siendo el respaldo exacto.

**Criterio de aceptación de cada tarea:** prueba propia en verde; `bash scripts/enjambre/tsc-turno.sh`
sin errores; ninguna prueba de la suite entera; revisión de que no introduce `any`, no debilita
§4 y no añade claves ni rutas del disco a la respuesta.

## 7 · Verificación

- Tipos: `bash scripts/enjambre/tsc-turno.sh` (un solo `tsc` a la vez, con caché por repo).
- Pruebas: `npx vitest run src/lib/transporte-adaptativo/__tests__/<archivo>.test.ts` por tarea;
  nunca la suite entera desde un agente. Se exige ver el resumen «Test Files … passed» / «Tests …
  passed»; una salida vacía o cortada no cuenta como prueba.
- Nativo: `cargo test` en `native/src-tauri` solo si una tarea toca Rust; esta ola no lo toca.
- Datos: `python3 -m json.tool starseed_memory_root/olas/cola-transporte-adaptativo-1119.json`
  para la cola y revisión de que los `id` no se repiten en el histórico.
- Visual: medidor y filas en 280, 360, 430, 768, 1024, 1280, 1920 y 3840 px; tacto y puntero;
  claro/oscuro; movimiento reducido; sin overflow ni texto cortado.
- Real: dos aparatos (Mac ↔ Android o tableta) con caída de un medio en caliente; sin esa prueba
  se dice «falta en aparatos», no «hecho».

**Lo que no está probado todavía:** el reparto simultáneo de tres flujos por tres medios
distintos en aparatos reales; el comportamiento de un plegable y de una TV; y la latencia real de
Bluetooth directo con el control. Se declaran como pendientes y no se presentan como hechos.
