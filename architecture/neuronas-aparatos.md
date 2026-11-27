# Contrato · Sincronía entre aparatos de una neurona (NEU1126F-d3 · 2026-11-27)

Petición de Maggasukha (26-11): lo que se hace en un aparato debe verse al instante en los demás aparatos de esa MISMA neurona, por LAN, Bluetooth o relé, sin copiar nunca lo que pertenece al aparato. Este documento fija el contrato de datos y transporte. No sustituye `architecture/neuronas-y-aparatos.md` (qué aparatos forman una neurona) ni `architecture/sincronizacion-neuronas.md` (cómo se vinculan dos neuronas).

La implementación pura de fusión y cola ya vive en `src/lib/neurons/sincronia-neurona.ts`; sus pruebas viven en `src/lib/neurons/__tests__/sincronia-neurona.test.ts`. Esta entrega es solo el contrato: no cablea la interfaz, no cambia el motor de ajustes de cuenta y no añade pruebas nuevas.

## 1 · Inventario honesto (2026-11-27)

| Dato | Lo que hoy se sincroniza de verdad | Canal y límite honesto |
|---|---|---|
| Ajustes guardados en `localStorage` | Las claves de `SYNCED_KEYS` y los prefijos permitidos viajan a `user_settings.prefs` y se aplican en otros aparatos con la cuenta. | `src/lib/settings-sync.ts:46` y `src/lib/sync/realtime-sync.ts:4`: subida con `mergeUserPrefs`, marcas LWW en `prefs.__meta`, `postgres_changes` más broadcast `acct:<uid>`, anti-eco por `deviceId`. Es sincronía de CUENTA, no de neurona: llega a cualquier aparato de la misma cuenta, incluso de otra neurona. |
| Identidad de la neurona y lista de aparatos | Nombre, permisos, `capabilities.aparatos` y presencia cuelgan del id de neurona y viajan con la cuenta. | `architecture/neuronas-y-aparatos.md:63`. El nombre editable del aparato se guarda además en una clave local (`starseed.neuron.aparato-nombre.v1`) y se refleja en su entrada `capabilities.aparatos`. |
| Tableros y widgets | Estado vivo en `dashboard_state` y respaldo «restaurar solo si está vacío» en `user_settings.prefs.dashboards`. | `src/lib/dashboard/dashboard-sync.ts:4` y `src/lib/dashboards-sync.ts:4`. Sincronizan entre dispositivos de la cuenta, no por neurona. |
| Cerebros y memorias | Enlaces cerebro↔servidor: reescaneo de Syncthing, empuje del bundle y datastore informativo. Un cerebro con Drive activo sincroniza `brain_memory_files` como `.md` por cerebro. | `src/lib/brains/sync.ts:4` y `src/lib/storage/gdrive-brain-sync.ts:4`. En Drive gana el más nuevo, el empate no mueve nada y ningún borrado se propaga solo. Hoy NO hay espejo P2P de memorias entre aparatos de una neurona. |
| Archivos | Adjuntos de chat de neurona por P2P (≤ 4 GB), almacenamiento de la cuenta (≤ 50 MB) o Bluetooth directo nativo (≤ 20 MB). El motor P2P trocea en 16 KB con SHA-256 y reanuda. | `src/lib/mensajeria/neuronas/datos-neurona.ts:32` y `src/lib/mensajeria/neuronas/archivos-neurona.ts:4`. El relé, LoRa (≤ 200 B) y correo no llevan archivos. La copia local en IndexedDB es de este aparato (≤ 512 MB para reanudar), no un volumen compartido. |
| Sesiones | Las sesiones vivas son una fila de `os_sesiones_vivas` con permisos, caducidad y presencia por canal privado; las llamadas abren su propia conexión con señalización del servidor. | `src/lib/mensajeria/sesiones-vivas.ts:4`. La lista NO está en realtime: se relee al montar, al cambiar de hilo o al crear/cambiar una sesión. La sesión desbloqueada de este dispositivo (`starseed.bloqueo.sesion.v1`) nunca viaja. |
| Volúmenes en otra neurona o A1 | Primitiva lista: bandas de 4 MiB con SHA-256, manifiesto y transporte inyectado. | `src/lib/storage/neurona-driver.ts:1`. No es un espejo automático de carpetas entre aparatos de una neurona. |
| Lo que NO viaja hoy | Secretos, identidades de dispositivo/malla, bloqueo y biometría, modo de rendimiento, transparencia local y colas de trabajo locales. | `src/lib/settings-sync.ts:272`: `NEVER_SYNCED_KEYS`, `NEVER_SYNCED_PREFIXES` y `NEVER_SYNCED_PATTERNS`. `starseed.brain.<id>.memory-mirror.v1` y `starseed.brain.<id>.offline-queue.v1` son locales a propósito: sincronizarlos llenaba `prefs` y duplicaba trabajos. |

Conclusión del inventario: hay sincronía fuerte por cuenta y de archivos por chat, pero falta la vía rápida entre aparatos de una neurona para llevar cambios por campo sin depender del servidor. Esa vía es la que describe este contrato.

## 2 · Ámbito y clasificación de datos

Un enlace de esta sincronía solo es válido si se cumplen las tres condiciones a la vez:

1. Mismo `neuronaId`: la fila de `neuron_devices` es la misma. Una neurona distinta de la misma cuenta no recibe estos campos.
2. Misma cuenta: se comprueba con la identidad firmada de la malla; un vecino de otra cuenta queda en el radar, nunca en la bandeja de campos.
3. Aparato reconocido: el id remoto figura en `capabilities.aparatos` y no es una lápida (`fuera < ts`, ver `src/lib/neurons/aparatos-de-neurona.ts:86`). Si no está, se ignora y se avisa; no se adopta una neurona en silencio (`architecture/neuronas-y-aparatos.md:24`).

| Clase | Qué contiene | Regla |
|---|---|---|
| Compartible por neurona | Ajustes de la cuenta que correspondan a esta neurona, configuración no sensible de cerebros, adjuntos de chat, ficha de una sesión viva y texto de interfaz. | Viaja por campo con fecha. Nunca se sustituye un blob entero. |
| Propio del aparato | `aparatoId`, `claveControl`, `permisosSistema`, `huella`, `dispositivoId`. | `src/lib/neurons/sincronia-neurona.ts:41` los excluye de la fusión y de la cola. La clave que firma órdenes de control pertenece al aparato (`architecture/neuronas-y-aparatos.md:42`), no a la neurona. |
| Secreto o estado local | Proveedores de IA, credenciales, tokens OAuth, identidad de malla, sesión desbloqueada, colas de trabajo locales, cachés de memoria y ajustes de rendimiento o transparencia. | Se rige por `NEVER_SYNCED_KEYS`, `NEVER_SYNCED_PREFIXES` y `NEVER_SYNCED_PATTERNS` (`src/lib/settings-sync.ts:272`). Ni LAN, ni Bluetooth, ni relé los sacan del aparato. |

«Permisos de la neurona» (lo que la cuenta autoriza) sí puede viajar; «permisos del sistema» (cámara, micrófono, Bluetooth o acceso a archivos concedidos por el sistema operativo a ESTE aparato) no. La distinción es de posesión, no de nombre.

La sincronía por neuronas se suma a la sincronía de cuenta: no la reemplaza y no la contradice. Si un campo viaja por ambos caminos, gana la fecha más reciente según la regla de la sección 3, y el motor de cuenta sigue siendo la copia duradera cuando no hay enlace directo.

## 3 · Sobre y fusión por campo

Cada valor viaja con su propia fecha; no se envía «el estado de la neurona» como un bloque. La unidad mínima es `RegistroCampoSync = { valor, timestamp, aparatoId }` (`src/lib/neurons/sincronia-neurona.ts:13`), con `timestamp` en milisegundos epoch del aparato que escribió. El estado local es `EstadoNeuronaSync = { neuronaId, aparatoId, campos, colaPendiente, conflictos }` (`src/lib/neurons/sincronia-neurona.ts:19`).

Reglas de `fusionarCamposNeurona` (`src/lib/neurons/sincronia-neurona.ts:67`), aplicables a cada campo del paquete remoto:

1. Si el campo es propio del aparato, se descarta antes de mirar su fecha. Nunca entra en `campos`.
2. Si el campo no existe en local, se adopta el registro remoto tal cual.
3. Si el registro remoto es más antiguo, se ignora; el local sigue mandando.
4. Si el registro remoto es más reciente, gana él y sustituye solo ESE campo. Los demás campos del estado local quedan intactos, incluso los que no venían en el paquete.
5. Si ambos tienen la misma fecha y distinto `aparatoId`, gana el de mayor id lexicográfico para que el resultado sea estable, y se escribe una entrada en `conflictos` con los dos valores. Si la fecha coincide y el `aparatoId` es el mismo, no hay conflicto: es una repetición.
6. La fusión devuelve un estado NUEVO: no muta el estado local que recibe.

El identificador del aparato remitente viaja dentro de cada registro; el tercer argumento de la función es el id de aparato remoto declarado por quien llama y hoy no interviene en la decisión, que se toma con el `aparatoId` de cada registro. Un mensaje duplicado, fuera de orden o repetido por dos transportes distintos no puede hacer retroceder un campo: ya existe una marca con fecha.

Esta es la única regla de resolución del contrato. No se inventa una hora de servidor, no se usa un reloj global y no se permite que un campo recién llegado pise otro campo distinto aunque venga en el mismo paquete.

## 4 · Cola sin enlace

Cuando no hay ninguna vía válida (ni LAN, ni Bluetooth, ni P2P de cuenta, ni relé), el cambio se aplica en local y se guarda en la cola con `encolarCambioSinEnlace` (`src/lib/neurons/sincronia-neurona.ts:112`):

- La entrada es `{ id, campo, valor, timestamp, intentos }`; `id` distingue el cambio, `timestamp` es la fecha del cambio y `intentos` empieza en cero.
- El campo se escribe también en `campos` con el `aparatoId` local, para que la interfaz vea el cambio al instante aunque no haya enlace.
- Los campos propios del aparato no se encolan ni se aplican: la función devuelve el estado sin tocar.
- Varios cambios se acumulan en orden de llegada; un mismo campo puede tener varias entradas con fechas distintas y todas conservan su fecha original.

Al volver el enlace, `procesarColaSinEnlace` (`src/lib/neurons/sincronia-neurona.ts:148`) devuelve `cambiosAEmitir` en el mismo orden y un `estadoActualizado` con `colaPendiente: []`. Los campos ya aplicados en local no se pierden al vaciar la cola.

La capa pura no decide cuándo hay enlace ni escribe a disco: el motor que se cablee debe llamar a `procesarColaSinEnlace` solo cuando pueda emitir de verdad, y debe persistir la cola en almacenamiento propio del aparato si quiere sobrevivir a un cierre. `intentos` queda reservado para una futura política de reintentos; esta parte no la define.

## 5 · Registro de conflictos

Solo se considera conflicto la colisión real: mismo campo, misma fecha y distinto aparato. La entrada es `{ campo, valorLocal, valorRemoto, timestampLocal, timestampRemoto, resueltoEn }` (`src/lib/neurons/sincronia-neurona.ts:30`). `resueltoEn` es la hora en que se aplicó el desempate estable.

El registro sirve para contar y explicar, no para revivir el valor perdedor: el campo ya quedó con el ganador según la regla 5 de la sección 3. La interfaz que se cablee en el futuro debe mostrar cuántos conflictos hay y poder abrir el detalle por campo; nunca debe presentar un cambio silencioso como si la persona no hubiera escrito nada en el otro aparato.

La función pura conserva todos los conflictos que recibe y no poda el histórico. La retención, el filtro por fecha y el borrado del registro son decisión del motor o de la interfaz, con aviso claro cuando se borre algo.

## 6 · Transportes: LAN, Bluetooth y relé

El motor que se cablee debe elegir la primera vía que cumple el filtro de la sección 2, sin preguntar a la persona. Si una vía falla, se intenta la siguiente y el cambio sigue en la cola hasta que alguien lo emite. El orden propuesto reproduce el que ya usa el motor de vinculación (`src/lib/malla/sincronizacion-neuronas-motor.ts:1`):

| Orden | Vía | Cuándo | Qué lleva y límite |
|---|---|---|---|
| 1 | Canal nativo local TCP `0.0.0.0:47071` (`nativo:<ip>`) | Ambos aparatos son nativos y se ven en la misma LAN por faro. | Preferida: mensajes con acuse y campos con fecha; archivos grandes por el motor P2P (≤ 4 GB). Sin internet. Solo para ids de aparato reconocidos. |
| 2 | Bluetooth directo nativo (`ble:<id>`) | No hay LAN, ambos tienen BLE y el vínculo nativo está aceptado. | Mensajes con acuse y archivos ≤ 20 MB (`src/lib/mensajeria/neuronas/datos-neurona.ts:44`). Ni voz, ni vídeo, ni transmisiones en vivo; lo pesado espera a una vía más rápida. |
| 3 | P2P de cuenta / transporte universal (WebRTC, Wi-Fi directo, QR, enlace de cuenta) | Hay sesión en ambos y no sirven las vías locales. | Señalización por la cuenta, nunca por un servidor de terceros; mensajes, campos y archivos ≤ 4 GB (`src/lib/network/lan-sync.ts:4`). Con NAT simétrico puede fallar: se dice, no se finge éxito. |
| 4 | Relé cifrado de la cuenta | Solo queda internet y sesión. | Únicamente mensajes y parches pequeños de campo; nunca archivos (`src/lib/mensajeria/neuronas/datos-neurona.ts:49`). Va firmado y con identidad: lo recogen solo los aparatos de ESA neurona y responde solo el destinatario. |

LoRa queda fuera de esta sincronía: lleva como mucho 200 bytes y es un canal de señales, no de estado (`architecture/datos-por-la-malla.md`). El servidor de la cuenta no es una vía P2P, pero sigue siendo la copia duradera de ajustes y el camino de respaldo cuando no hay enlace directo.

Todo lo que sale por la malla va firmado con la identidad de malla (`wrapSigned`, `unwrapSigned` y `acceptFreshness`, ya usados en `src/lib/malla/sincronizacion-neuronas-motor.ts`). Un mensaje sin firma, con identidad desconocida, caducado o dirigido a otra neurona se descarta antes de tocar `campos`. Un vecino de otra cuenta puede aparecer en el radar, pero nunca entra en la cola ni en el registro de conflictos de esta neurona.

## 7 · Pruebas ya cubiertas y alcance de esta parte

Las pruebas de la fusión por campo y de la cola sin enlace ya están escritas en `src/lib/neurons/__tests__/sincronia-neurona.test.ts`; esta parte NO las duplica. Se ejecutan con el archivo concreto:

`npx vitest run src/lib/neurons/__tests__/sincronia-neurona.test.ts`

Cubren, con `import { describe, it, expect } from "vitest"`:

- Estado inicial vacío, atado a su neurona y su aparato.
- Adopción de un campo remoto nuevo; gana solo la fecha más reciente; otros campos no se pisan.
- Inmutabilidad del estado local que entra en la fusión.
- Conflicto por fecha igual de dos aparatos, desempate estable por id y ausencia de conflicto cuando repite el mismo aparato.
- Los cinco campos propios del aparato no se copian ni se encolan.
- Cola en orden, aplicación local inmediata, emisión ordenada al volver el enlace y cola vacía sin pérdida de campos.

Fuera del alcance de esta entrega: cablear el motor de transportes, añadir interfaz de conflictos, tocar `src/lib/settings-sync.ts`, mover la clave del aparato ni cambiar la ventana de bienvenida. Quedan para su tarea propia, con sus puertas y su revisión. Si más adelante se añade interfaz, sigue `memory/diseno/identidades.md`, `memory/diseno/armonia.md` y `memory/diseno/referencias.md`: textos en español con acentos, tokens antes que hexágonos sueltos, dianas de 44 px, `cursor-pointer` en lo clicable y sin emojis como iconos.

## 8 · Criterios de aceptación y fuentes

Se considera terminada esta parte cuando:

- `architecture/neuronas-aparatos.md` existe y separa claramente lo que ya sincroniza por cuenta de lo que falta por neurona.
- El contrato coincide con `src/lib/neurons/sincronia-neurona.ts`: fusión por campo, protección de lo propio del aparato, cola ordenada y registro de conflictos.
- Queda explícito que `claveControl`, `permisosSistema`, `huella`, `dispositivoId` y `aparatoId` nunca se copian, y que los secretos de `NEVER_SYNCED_KEYS` siguen siendo locales.
- No se ha tocado código ni se han añadido pruebas: la prueba concreta de las partes anteriores sigue en verde y no se ha corrido la suite completa.
- Si en el futuro se toca código, `tsc` se ejecuta con `bash scripts/enjambre/tsc-turno.sh`, nunca con `npx tsc` directo.

Fuentes consultadas para este contrato:

- `metagenesis.md` §§8, 11 y 💠: regla dorada del SOP antes que el código, medios de conexión y economía de agentes.
- `architecture/neuronas-y-aparatos.md:1` y `architecture/neuronas-y-aparatos.md:63`: qué es un aparato y qué cubre hoy «lo hecho en uno llega a todos».
- `architecture/sincronizacion-neuronas.md` y `architecture/datos-por-la-malla.md`: vías, formatos y límites reales.
- `src/lib/neurons/sincronia-neurona.ts` y `src/lib/neurons/__tests__/sincronia-neurona.test.ts`: implementación y evidencia de la fusión y la cola.
- `src/lib/settings-sync.ts:46` y `src/lib/sync/realtime-sync.ts:4`: claves que viajan por cuenta, marcas LWW y lista de lo que nunca sale del aparato.
- `src/lib/brains/sync.ts:4`, `src/lib/storage/gdrive-brain-sync.ts:4`, `src/lib/mensajeria/neuronas/datos-neurona.ts:32`, `src/lib/mensajeria/sesiones-vivas.ts:4` y `src/lib/storage/neurona-driver.ts:1`: estado real de cerebros, archivos, sesiones y volúmenes.

