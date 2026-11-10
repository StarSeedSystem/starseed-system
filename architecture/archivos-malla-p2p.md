# Archivos por la malla P2P (Ola 369)

> **SOP de la Ola 369 (2026-09-26).** Fuente de verdad del motor de transferencia de archivos
> de cualquier formato entre neuronas cercanas — `src/lib/network/archivos-malla.ts`. Léelo antes
> de tocar ese archivo, `webrtc-mesh.ts` (solo se le añadió `bufferedAmount`, ver §3),
> `malla-neuronas-panel.tsx`/`malla-neuronas-mount.tsx` o
> `transferencias-archivo-panel.tsx`.

## 0. El problema que resuelve

Alex, verbatim: «archivos de todo tipo de formato compartibles entre neuronas cercanas, ya sea
de envíos privados a la misma cuenta con sus cerebros o a otra cuenta de otro usuario, para
transferencias de datos e información directa mesh P2P». Antes de esta ola, la malla de
neuronas (Ola 366) solo intercambiaba mensajes de control pequeños (ficha, latidos, un turno de
Astraura — Ola 367, un relé de IA genérico — Ola 368): ningún archivo de tamaño real (una foto,
un vídeo, un PDF) podía viajar de un dispositivo a otro sin pasar por Supabase Storage.

## 1. Diseño — agnóstico de transporte

El motor (`src/lib/network/archivos-malla.ts`) no importa `webrtc-mesh.ts` en su núcleo: todo lo
que necesita de un transporte es la interfaz `CanalArchivos`:

```ts
export interface CanalArchivos {
  enviar(texto: string): boolean;
  enviarBinario?(buf: ArrayBuffer): boolean; // opcional, no usado hoy — ver §3
  bufferedAmount?(): number;                  // opcional — backpressure real si existe
  alMensaje(cb: (data: string | ArrayBuffer) => void): () => void;
}
```

Hoy hay UN adaptador real, `canalDesdeMesh(mesh, deviceId)`, que envuelve el mesh WebRTC
COMPARTIDO de la misma cuenta (`lan-sync.ts: getSharedMesh()`, el mismo que usan `astraura-por-
malla.ts` e `ia-por-malla.ts` — nunca se abre un segundo mesh). `iniciarMotorArchivosPorMalla()`
(análogo a `iniciarServidorAstrauraPorMalla()`) engancha el motor compartido a `mesh.onPeer` y
despacha cada mensaje `archivo.*` con `contexto.mismaCuenta = true` (el mesh WebRTC de
`lan-sync.ts` **solo** conecta dispositivos de la MISMA cuenta, así que cualquier peer que
aparece ahí ya es "mío" por construcción).

**Punto de adaptación para el vínculo entre CUENTAS DISTINTAS** (`os_mesh_vinculos`, módulo de
otra área de esta misma ola, worktree separado — no se importó nada suyo aquí): cuando exista
`enviarAPar(vinculoId, texto)` / `onMensajeDePar(vinculoId, cb)`, basta con:

```ts
const canal: CanalArchivos = {
  enviar: (texto) => enviarAPar(vinculoId, texto),
  alMensaje: (cb) => onMensajeDePar(vinculoId, (data) => cb(data)),
};
motor.manejarMensaje(canal, data, { mismaCuenta: false, verificarPermiso });
```

No hace falta tocar `archivos-malla.ts` para eso — es exactamente para lo que existe
`CanalArchivos`. Esta ola deja el hook de permiso (§4) ya deniega por defecto hasta que ese
módulo exista.

## 2. Protocolo (JSON, namespace `archivo.*`)

```
remitente → receptor  archivo.oferta    {id, nombre, tipo(mime), tamano, sha256, trozos, tamanoTrozo, destino}
receptor → remitente   archivo.aceptar   {id, desde?}       — desde = reanudar en ese índice
receptor → remitente   archivo.rechazar  {id, motivo}
remitente → receptor  archivo.chunk     {id, index, datosB64}
remitente → receptor  archivo.fin       {id}
receptor → remitente   archivo.ok        {id}               — hash verificado
receptor → remitente   archivo.error     {id, motivo}        — hash NO coincide u otro fallo
cualquiera → otro      archivo.cancelar  {id}
```

`destino: {tipo: "dispositivo"|"cerebro"|"biblioteca", id?}` — decide qué hace el RECEPTOR con el
archivo una vez completado (ver §5). Cada mensaje se serializa con `JSON.stringify` y viaja por el
MISMO canal de texto que la ficha de dispositivo, los latidos, `astraura.*` e `ia.*` — cada
protocolo se autoidentifica por el prefijo de `t` y descarta en silencio lo que no es suyo
(`esMensajeArchivoMalla`), exactamente igual que los otros dos.

## 3. Codificación: base64, NO binario crudo — decisión y justificación

`enviarBinario`/`bufferedAmount` son **opcionales** en `CanalArchivos` a propósito. Se evaluaron
dos caminos:

1. **Binario real**: `RTCDataChannel` SÍ puede llevar `ArrayBuffer` (`binaryType =
   "arraybuffer"`), pero `webrtc-mesh.ts` hoy solo transporta STRINGS — su `onmessage` descarta
   cualquier dato que no sea `typeof "string"` y `sendToPeer`/`onPeer` están tipados a `string`.
   Añadir el camino binario de verdad exige tocar el NÚCLEO de envío/recepción de un archivo
   COMPARTIDO con otras DOS áreas trabajando en paralelo en esta misma ola (relé de IA genérico y
   vínculos entre cuentas) — mucha superficie de riesgo para un archivo que ya cambió dos veces
   esta semana (Olas 366/367).
2. **Base64 sobre el canal de texto que YA existe**: ninguna pieza del núcleo de `webrtc-mesh.ts`
   se toca (salvo el punto 3 de abajo, que es aditivo y de coste cero). Además, el FUTURO canal de
   PAR entre cuentas descrito en §1 es, con toda probabilidad, un relé (Supabase Realtime/
   broadcast o similar) — no un `RTCDataChannel` propio — así que lo más seguro es que solo pueda
   llevar JSON/texto de todos modos: diseñar el protocolo binario-primero habría significado
   mantener DOS caminos (binario para el mesh, base64 para el relé) por un archivo que ya funciona
   perfectamente bien en base64.

**Se eligió base64** para todo transporte: trozos de **16 KiB en crudo** (`tamanoChunkBase64`,
configurable), que codificados pesan ~21.9 KiB — bajo cualquier límite típico de mensaje SCTP/
Realtime. El +33% de overhead de base64 es el coste aceptado de la portabilidad.

Lo único que SÍ se tocó en `webrtc-mesh.ts` (aditivo, opcional en el tipo, cero riesgo para
quien ya construía un `MeshHandle` de mentira en sus pruebas):

```ts
bufferedAmount?: (deviceId: string) => number; // getter sobre RTCDataChannel.bufferedAmount
```

Esto permite backpressure REAL (§6) incluso enviando strings — el `bufferedAmount` de un
`RTCDataChannel` crece igual mande binario o texto. `enviarBinario` queda documentado como el
punto de extensión de una ola futura que sí quiera pagar esa complejidad por el ~25% de ahorro
de ancho de banda.

## 4. Integridad — lista de hashes (SHA-256)

WebCrypto (`crypto.subtle.digest`) no tiene hash incremental (no hay `update()`/`final()` como en
otras APIs de hashing). El esquema, calculado IGUAL en remitente y receptor:

1. Por cada trozo `i`: `hash_i = SHA-256(trozo_i)` (32 bytes).
2. Raíz = `SHA-256(concat(hash_0, hash_1, …, hash_n))` — una lista de hashes / Merkle de UNA sola
   capa (no un árbol completo: bastaba para detectar cualquier alteración de cualquier trozo sin
   mantener el árbol completo en memoria, y es mucho más barato que rehacer los `n·(n-1)` niveles
   de un Merkle tree real para un caso de uso que solo necesita "¿llegó exactamente lo que se
   mandó?", no pruebas de pertenencia por trozo).

El remitente calcula la raíz ANTES de ofertar (`calcularHashLista`, una pasada de lectura extra
del archivo — memoria acotada al tamaño de un trozo, nunca el archivo entero) y la anuncia en
`archivo.oferta.sha256`. El receptor la recalcula tras `archivo.fin` sobre lo que ensambló; si no
coincide, borra lo recibido y responde `archivo.error {motivo:"hash-no-coincide"}` — nunca entrega
un archivo sin verificar.

**Coste**: dos pasadas de lectura del archivo en el remitente (una para el hash, otra para
enviar los trozos) — ambas O(tamaño de trozo) en memoria, nunca el archivo completo. Para un
archivo de 4 GB con trozos de 16 KiB eso es ~256 000 iteraciones de hash de 16 KiB cada una: rápido
en cualquier hardware moderno, y el doble de I/O de disco es un precio aceptado por conocer el
hash ANTES de ofertar (así el receptor sabe de antemano cuánto validar).

## 5. Almacenamiento — nunca el archivo entero en RAM

`AlmacenTrozos` abstrae DÓNDE viven los trozos mientras llegan:

| Prioridad | Implementación | Cuándo se usa |
|---|---|---|
| 1 | `crearAlmacenOPFS()` | `navigator.storage.getDirectory()` disponible — un archivo por trozo bajo `archivos-malla/<id>/<index>` |
| 2 | `crearAlmacenIDB()` | si no hay OPFS pero sí `indexedDB` — object store `trozos`, clave `<id>:<index>` (mismo patrón que `astraura/experiencias-idb.ts`) |
| 3 | `crearAlmacenEnMemoria()` | última red — un `Map` del propio módulo; funciona pero no sobrevive a recargar la pestaña |

`crearAlmacenAuto()` elige en ese orden, nunca lanza. El Blob final solo se **ensambla** una vez,
al terminar (`AlmacenTrozos.ensamblar`), para entregarlo a quien lo pidió — el resto del tiempo
solo hay UN trozo (16 KiB) en memoria por vez, tanto al leer (remitente, `Blob.slice().
arrayBuffer()`) como al escribir (receptor).

**Límites**: aviso informativo por encima de 500 MB (`limiteAvisoBytes`, no bloquea); tope duro
configurable en 4 GB por defecto (`limiteMaxBytes`) — una oferta que lo supere se rechaza SIN
llegar a ofertarse (`enviarArchivo` devuelve `{ok:false, error}` de inmediato).

## 6. Backpressure

Antes de encolar cada trozo, si el `CanalArchivos` expone `bufferedAmount()`, el remitente
comprueba que esté por debajo de `umbralBufferAlto` (1 MiB por defecto); si no, espera en pasos
de 30ms (nunca ocupa el hilo, nunca lanza) hasta que baje. Con `canalDesdeMesh` esto lee el
`bufferedAmount` REAL del `RTCDataChannel` (§3). Sin esa función (un canal que no la implementa,
p. ej. un futuro relé sin esa noción), el motor simplemente no frena — degrada a "tan rápido como
el canal deje", nunca a un error.

## 7. Políticas de recepción

| Origen | Comportamiento por defecto | Ajustable |
|---|---|---|
| Misma cuenta (`mismaCuenta:true`) | **Auto-aceptar** | `setPreferenciaAutoAceptarMismaCuenta(false)` → pasa a "preguntar" (localStorage `starseed.archivos.auto-aceptar-misma-cuenta.v1`) |
| Otra cuenta, SIN permiso | **Denegar** — ni siquiera se pregunta | Depende de `verificarPermiso()` (ver abajo) |
| Otra cuenta, CON permiso | **Preguntar** — nunca se auto-acepta de otra cuenta | — |

`verificarPermisoArchivosPorDefecto()` devuelve `false` — hasta que el módulo de vínculos
consentidos (`os_mesh_vinculos`) exponga el permiso real, CUALQUIER oferta de otra cuenta se
deniega. Es el hook que esa área debe sustituir (pasando `contexto.verificarPermiso` al llamar
`motor.manejarMensaje`), sin tocar este archivo.

## 8. Reanudación tras desconexión

`archivo.aceptar.desde` es el mecanismo: al recibir una `archivo.oferta` con un `id` que YA tiene
trozos guardados en el `AlmacenTrozos` (una reoferta tras reconectar), el receptor calcula
`desde = max(índices guardados) + 1` y lo devuelve en el `aceptar`. El remitente retoma el envío
desde ese índice — **nunca** desde 0. Requisitos para que esto funcione:

- El remitente reintenta con el **mismo** `idTransferencia` (parámetro de `enviarArchivo`) — eso
  es responsabilidad de quien orquesta el reintento (la UI, o en el futuro un vigilante
  automático), el motor no reintenta solo.
- El remitente conserva el `Blob`/`File` original en memoria entre el intento fallido y el
  reintento — `MotorArchivos.archivoDeEnvio(id)` lo expone (el motor NO lo descarta al fallar, solo
  al completarse con éxito o al ser rechazado), así que ni siquiera la UI necesita guardar su
  propia copia para el botón «Reintentar».
- Un envío que falla a mitad de trozo (`canal.enviar()` devuelve `false`) se marca `error` de
  inmediato — nunca sigue "progresando" con trozos que en realidad no llegaron.

## 9. Biblioteca / cerebros — «Añadir a la Biblioteca» sin subir solo

Cuando `destino.tipo` es `"cerebro"` o `"biblioteca"` (o el usuario lo pide desde la UI tras un
`destino:"dispositivo"`), `registrarArchivoLocalEnBiblioteca(ref, estado, folderId?)` registra el
archivo YA recibido como un `SavedItem` (`type:"file"`) en `entity-library.ts`, con
`url: "local-archivos-malla://<id>"` — un esquema propio que marca el ítem como **SOLO EN ESTE
DISPOSITIVO**. **Nunca sube a Supabase por sí solo** (regla de la Entidad Única: una referencia,
no una copia automática): el botón «Subir a mi cuenta» (`subirArchivoLocalACuenta`) es la acción
explícita que sube el Blob YA ensamblado (`uploadFile`, sujeto a su límite de 50 MB por archivo —
un archivo P2P mayor puede recibirse perfectamente pero no subirse hasta que ese límite general
del OS cambie) y reescribe la `url` del ítem con la real de Storage.

## 10. UI

- **`malla-neuronas-panel.tsx`**: botón «Enviar archivo» (`EnviarArchivoBoton`) por dispositivo
  propio online y conectado (selector de archivos múltiple, cualquier tipo); pestaña nueva
  «Archivos (N)» con `TransferenciasArchivoLista` — progreso, velocidad estimada, cancelar,
  reintentar, y para lo recibido: Abrir / Guardar / Añadir a la Biblioteca.
- **`malla-neuronas-mount.tsx`**: arranca `iniciarMotorArchivosPorMalla()` junto a los otros
  roles servidor, y pinta `TransferenciasArchivoToast` — tarjetas flotantes globales de ofertas
  ENTRANTES que esperan Aceptar/Rechazar (política "preguntar"), visibles aunque el panel esté
  cerrado.
- Mobile-first, iconos lucide, `cursor-pointer`, sin emojis — mismo estilo que el resto de la
  malla.

## 10b. Cifrado de archivo de punta a punta y multitrayecto (MPT1108A, 2026-11-08)
Contrato completo en `red-sin-dependencias.md` §5.2. Resumen para quien toque el motor:
- `crearCanalSellado(canal, …)` (`src/lib/malla/canal-sellado.ts`) envuelve el canal y el motor sigue en claro. Sustituye `archivo.oferta` por `archivo.oferta.cif` (sobre ECDH P‑256 → HKDF → AES‑GCM por destinatario, con clave de contenido, manifiesto y firma) y sella cada `archivo.chunk` con AES‑256‑GCM (nonce = id + índice, AAD = id|índice|total|longitud). El trozo gana 16 bytes; el canal sellado anuncia `tamanoTrozo` menos 16 y `maxTextoBytes` al 55 %.
- Los trozos de una transferencia sellada que no pasan el tag, o llegan en claro, se descartan antes del motor; los duplicados (varias vías) los sigue ignorando el motor. El hash por trozo y el SHA‑256 del archivo siguen siendo del contenido en claro.
- `CanalArchivos` tiene dos métodos opcionales nuevos: `resumenVias()` (reparto por vías y velocidad) y `modoCifrado(id)`. El motor los copia a `EstadoTransferencia.repartoVias`, `velocidadBps` y `cifradoArchivo` (`archivo` o `sin-cifrado-de-archivo` para un par antiguo).
- `crearCanalMultiVias` (`canal-multitrayecto-vias.ts`) reparte los trozos por vías de cualquier clase (directas, cuenta, relés, router) con capacidad, latencia, contrapresión por vía y reequilibrio; reenvía por las demás los últimos trozos de una vía que muere. Debe ir DEBAJO del canal sellado.
- Tests: `src/lib/malla/__tests__/{cifrado-archivo,multitrayecto-vias,puerta-internet}.test.ts`.

### 10b.1 · Enchufado en el camino real (MPT1108B, 2026-11-08)
- **Emisor.** `canalParaArchivo(destino, bytes, opciones?)` y `enviarArchivo(…)` de `transporte-universal.ts` ya devuelven un canal armado por `armarCanalArchivo` (`archivo-seguro.ts`): el planificador (`planificarVias`) deja pasar los enlaces directos del mismo aparato (con el ajuste «Automático», todos, Bluetooth incluido) y, si el par anuncia `archivo.e2e.v1`, se añaden los relés permitidos y todo va por `crearCanalMultiVias` bajo `crearCanalSellado`. Con un solo enlace no hay multitrayecto, pero sí sellado. Las notificaciones de buzón (`archivos-neurona.ts`) usan el mismo camino; allí `permitirRele` solo es cierto si los ajustes del chat permiten el servidor y no se forzó un enlace.
- **Receptor.** Todos los receptores (malla de la cuenta, enlace local, TCP nativo, Bluetooth, vínculos) llaman a `recibirArchivo(motor, canal, data, ctx)` (`recepcion-sellada.ts`): abre `archivo.oferta.cif` y los trozos sellados con UN almacén de claves por sesión (la oferta puede llegar por un enlace y los trozos por otros) y deja pasar sin cambios lo que viene en claro (par antiguo, marcado «sin cifrado de archivo»).
- **Capacidades.** Se anuncian `archivo.e2e.v1` y `multitrayecto.v1` en: la sincronización de neuronas (primeras de la lista de 16), el saludo `nl.hola` del TCP nativo y del Bluetooth (`ar`, más la pública ECDH `ep`, dentro del sobre firmado), la ficha del mesh WebRTC (`archivo`, `epub`) y la presencia de cuenta (`neuron_devices.capabilities.archivo/epub`). Todos los campos son opcionales: una app anterior no los entiende ni los necesita. Una neurona de la que no se sabe nada se trata como antigua.
- **Claves.** Orden: vivo → instantánea de la cuenta → certificado → servidor (`claves-destinatario.ts`, `archivo-seguro-real.ts`). Una copia sellada por neurona destinataria con clave; sin ninguna clave, el archivo va como antes, marcado, y sin relés.
- **Relés.** `rele-archivo.ts`: salto por otra neurona de la misma cuenta (`archivo.salto` → `archivo.salto.llega`, con tope de batería, de datos al día y de tamaño; nunca para otra cuenta ni salto dentro de salto) y relé cifrado de StarSeed (`tu:archivo-rele:<id>`, 24 KiB por trozo). Solo texto cifrado, siempre como refuerzo de una vía directa, y con tope de bytes por vía (64 MiB). Los de terceros, solo con permiso expreso.
- **Interfaz.** `cifrado-vias-archivo.tsx`: candado «Cifrado de archivo» o aviso «Sin cifrado de archivo», reparto vivo, velocidad total y «Verificado (SHA-256)». Está en la burbuja de transferencia, en la ventana de recepción y en el panel de transferencias.
- Tests: `src/lib/malla/__tests__/archivo-seguro.test.ts` (motor real: tres vías con una que muere, par antiguo, dos destinatarios, relé, claves, salto) y `src/components/network/__tests__/cifrado-vias-archivo.test.tsx`.

## 10c. Anuncio temprano y preparación en un Worker (ARC1110A, 2026-11-10)

**Qué pasó (Prueba.29 y Prueba.32).** Desde la tablet, el mensaje del archivo aparecía al instante en la Mac y la ventana para
aceptarlo, minutos después. Causa (probada leyendo el camino): `enviarArchivo` calculaba el SHA-256 de TODO el archivo
(`calcularHashLista`, un `slice().arrayBuffer()` por trozo de 63 KiB) **antes** de mandar la oferta, en el hilo principal del
WebView de Android; la oferta lleva la raíz, así que no podía salir antes. Además, la vista previa se esperaba antes de empezar
y cada fuente de claves podía esperar sin tope.

**Flujo nuevo** (aparatos que anuncian `archivo.anuncio.v1`; el resto sigue como antes):

```
remitente                                           receptor
  enviarArchivo ─ estado «Preparando 0 %» ─ vuelve ya
  archivo.anuncio {id,nombre,tipo,tamano,trozos,tamanoTrozo,sha256:"",preparando:true} ─►  tarjeta «<neurona> está preparando el archivo…»
  (Worker: SHA-256 por bloques de 4 MiB, «Preparando 42 %»)                               aceptar ─► archivo.preaceptar {id} ─► remitente: «ya lo aceptó»
  archivo.oferta {…sha256…}  ─────────────────────────────────────────────────────────►  preaceptada: empieza SOLA (sin segunda pregunta)
                                                                                           si el centinela/la resonancia avisan: se pregunta igual
  archivo.aceptar … trozos … fin / ok  (igual que siempre; la verificación SHA-256 no cambia)
```

- **Rechazar de antemano**: `archivo.rechazar` con solo el anuncio; el remitente deja de preparar y NO manda la oferta. Se recuerda 60 s
  (si llega la oferta de ese id, se vuelve a rechazar; un «Reintentar» pasados 60 s no se rechaza solo).
- **Política**: «denegar» corta en el anuncio; «auto-aceptar» enseña la tarjeta en «preparando» y se acepta sola al llegar la oferta;
  «preguntar» pregunta una vez (la notificación `onOfertaEntrante` sale con el anuncio y no se repite con la oferta).
- **Cifrado**: el anuncio se sella como una oferta (`archivo.oferta.cif`, mismo sobre, misma clave de contenido que reutiliza la
  oferta real): quien reenvía no ve el nombre ni el tamaño. Sin sellar no se manda nada. Por vías directas sin cifrado de archivo
  (par sin claves) el anuncio va en claro como ya iba la oferta. Un receptor que exige cifrado descarta un anuncio en claro.
- **Compatibilidad**: la capacidad `archivo.anuncio.v1` va en `CAPACIDADES_ARCHIVO` (saludo / presencia). `CanalArchivos.admiteAnuncio?()`
  es `true` solo si TODAS las neuronas destinatarias la anuncian; sin ella (par anterior, canal sin armar) no se manda anuncio ni
  `preaceptar` y el flujo es exactamente el anterior. Un receptor anterior que recibiera un anuncio lo descartaría (el guard no lo conoce).
- **Preparación** (`src/lib/malla/preparacion-archivo*.ts`): la MISMA raíz que `calcularHashLista`, leyendo en bloques de ~4 MiB (no un viaje
  al proveedor de contenidos por trozo) y calculando en paralelo los hashes de un bloque; en un Worker (`preparacion-archivo.worker.ts`)
  con avance y cancelación; si no hay Worker o no arranca en 4 s, en el hilo cediendo el turno entre bloques. Nunca el archivo entero en
  memoria. `enviarArchivo` devuelve `{ok,id,aviso,listo}`: `listo` se resuelve `true` cuando salió la oferta y `false` si se canceló,
  rechazó o falló (estado `error`, código `preparacion`). Un reintento con el mismo id y el mismo archivo no vuelve a calcular el hash.
- **Sin esperas muertas**: la vista previa (`opciones.vista` puede ser una promesa) se espera como mucho 3 s; cada fuente de claves
  (`resolverClaves`) como mucho 2,5 s; `archivos-neurona` ya no espera la vista antes de llamar al motor. Un «Aceptar» pulsado en el
  mensaje del chat antes de que el motor conozca la transferencia se recuerda y se aplica al llegar el anuncio/la oferta.
- **No hecho**: mandar trozos mientras aún se prepara (la oferta lleva la raíz y el receptor solo pide trozos tras ella). La reserva mínima de
  ancho para datos durante una llamada vive en `bluetooth-directo-motor.ts` (BLE1110A).

**Diagnóstico** (`src/lib/network/archivos-diagnostico.ts`): eventos «archivo» del Registro del enlace → `enlaces.log` (y el espejo de la
tablet con `(Maggaboard)`). Solo ids, tamaños y tiempos; nunca nombres ni contenido:
`archivo <id> anuncio-enviado|anuncio-recibido|preaceptado rol=…|preparado ms=… via=worker|hilo|oferta-enviada|oferta-recibida|aceptado rol=…|primer-trozo rol=…|progreso 25|50|75 rol=…|completo kbps=… vias=…|verificado rol=…|fallo motivo=… lado=…`.
Se lee con `grep ' archivo ' ~/Library/Logs/app.starseed.os/enlaces.log`.

Tests: `archivos-malla-anuncio.test.ts` (motor real, dos neuronas), `archivo-anuncio-sellado.test.ts`, `preparacion-archivo.test.ts`.

## 11. Qué falta (fuera de alcance de esta ola)

- **Camino binario real** (§3): documentado como extensión futura si el ahorro de ancho de banda
  llega a justificar tocar el núcleo compartido de `webrtc-mesh.ts`.
- **Vínculo entre cuentas distintas**: el adaptador (§1) está listo, pero el módulo de vínculos
  consentidos en sí es de otra área/worktree — no se integró aquí.
- **Verificación con dos dispositivos reales**: todo lo de arriba se probó con un par de motores
  conectados por un canal en memoria (`crearParEnMemoria` en las pruebas) — nunca con dos
  dispositivos físicos por WebRTC de verdad (latencia real, ICE/TURN, velocidad real de OPFS en
  un móvil de gama baja con un archivo de varios cientos de MB).
- **Progreso del remitente durante un corte**: el remitente marca `error` en cuanto un `enviar()`
  falla, pero no reintenta solo — el reintento (mismo `idTransferencia`) es responsabilidad de
  quien orquesta (hoy, el botón «Reintentar» de la UI).

## 12. Tests

`src/lib/network/__tests__/archivos-malla.test.ts` (19 pruebas, con un PAR de motores conectados
por un canal en memoria, sin mesh/red real): protocolo puro (guard + parse + hash + base64),
política por defecto (misma cuenta / otra cuenta con y sin permiso), transferencia pequeña y
multi-trozo íntegras de punta a punta, trozo alterado en tránsito → `archivo.error`, cancelar a
mitad de camino (determinista: se cancela desde dentro del propio envío del trozo N, sin
temporizadores), reanudación tras una desconexión simulada (determinista: se corta el canal justo
tras un trozo concreto y se comprueba que el reintento retoma en el índice siguiente, no en 0),
backpressure (el remitente no manda nada mientras `bufferedAmount` esté alto), rechazo con
motivo, y tope de tamaño máximo.

**Verificado en esta ola**: `vitest run src/lib/network src/components/network` →
**138 pruebas / 13 archivos en verde** (incluye las 19 nuevas de `archivos-malla.test.ts`, sin
tocar ninguna de las otras 12 suites de esos dos directorios) y `tsc --noEmit -p .` limpio.
`next build` **no** se ejecutó (regla del área: nunca con el enjambre vivo / nunca en esta sesión
de agente).
