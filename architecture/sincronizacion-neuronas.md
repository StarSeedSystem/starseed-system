# Contrato · Sincronización entre neuronas (2026-11-07 · MSH1107A)

Petición de Alex (07-11): «Sincronizar ahora» debe abrir AL INSTANTE en la otra neurona una ventana con
la solicitud; aceptada en las dos, las dos dicen «Vinculadas» y el vínculo se puede recordar para que en
futuros encuentros se vinculen solas. También sin internet.

Causa medida del fallo anterior: «Sincronizar ahora» solo mandaba un `presence` al relé de la cuenta
(sin internet no llega) y no existía protocolo de solicitud; la app nativa oía faros pero no tenía canal
de datos entre neuronas.

## 1 · Piezas

| Pieza | Archivo | Qué hace |
|---|---|---|
| Trama (puro, std) | `native/src-tauri/src/malla_local_trama.rs` | `"SSM1"·v1·tipo·largo(BE u32)·JSON`, tope 64 KiB, acuse, solo IPs privadas/enlace local, limitador por IP, buzón con nº de orden. `rustc --edition 2021 --test` |
| Canal local (Tauri) | `native/src-tauri/src/malla_local.rs` | Oyente TCP `0.0.0.0:47071` (faro + 1, comprobado al compilar), solo StarSeed OS; comandos y evento (§2) |
| Faro | `antenas.rs` | `puerto_servicio` = 47071 si el canal escucha (0 si no); `Guardian::otras_cercanas()` da las IPs de faros no reconocidos |
| Protocolo (puro) | `src/lib/malla/sincronizacion-neuronas.ts` | Mensajes, máquina de estados, vínculos, candidatos LAN, plan de vías, señales `lan:<ip>`, reconexión, vías/latencias |
| Motor | `src/lib/malla/sincronizacion-neuronas-motor.ts` | Envía/recibe/firma/guarda; arranca en `MallaNeuronasMount`; API del panel (§5) |
| Ventana global | `src/components/network/solicitud-sincronizacion.tsx` | Solicitud entrante, en curso, «Vinculadas», avisos. Una sola instancia |
| Ficha de señal | `src/components/mesh/signal-detail.tsx` | «Sincronizar ahora» → protocolo, estado en vivo, «Vincular sin internet (QR)» si no hay camino |
| Radar | `use-detected-signals.ts` + `signals.ts` | Señales `lan:<ip>` (faros que oye la app); «Sincronizar ahora» siempre activo en neuronas de la cuenta |

## 2 · Canal local nativo (solo transporta)

- `malla_local_enviar { ip, puerto?, json }` → `{ ip, puerto, ms }`: conecta (2 s), escribe la trama y
  espera el ACUSE (3 s). Sin acuse es error. `ip` debe ser privada o de enlace local (nunca internet);
  `puerto ≥ 1024` (por defecto 47071); `json` = objeto JSON ≤ 64 KiB.
- Evento `malla-local://mensaje` → `{ seq, ip, cuerpo, recibido_ms }`.
- `malla_local_recibidos { desde }` → los recibidos con `seq > desde` de los últimos 10 min (anillo de 64):
  la web los pide al arrancar.
- `malla_local_estado` → `{ escuchando, puerto, motivo, ultimo_seq, vecinos: [{ ip, propia, neurona,
  tipo, puerto, canal, visto_hace_s }] }`. `canal`: `true` su faro anuncia el canal, `false` su app es
  anterior, `null` no se sabe (faros anónimos o de otra cuenta).
- Oyente: corta conexiones que no vengan de la red local, ≤ 8 a la vez, 300 mensajes/10 s por IP
  (30 hasta la app 0.5.0; MLT1107A lo subió para los archivos), 3 s por conexión, un mensaje por
  conexión. Hilo propio: sigue con la ventana cerrada mientras la app viva. `malla_local_estado`
  también dice `max_cuerpo`, `limite_mensajes` y `limite_ventana_ms` (una app anterior no los dice).
- Lo que viaja dentro es un sobre del transporte universal `{"t":"tu.msg","v":1,"id","c","b","de"}`; el
  canal `sync` va al motor de sincronización (de cualquiera: va firmado y es lo que crea el vínculo).
  `{"t":"tu.ping"}` solo mide la ida y vuelta. Desde MLT1107A la entrada abre los `nl.lote` y lo
  demás (`tu.*` de otros canales, `archivo.*`, `nl.hola`, `nl.sen`) va al enlace `nativo:<ip>`
  (`red-local-nativa-motor.ts`), que solo lo atiende de una neurona VINCULADA ligada por un saludo
  firmado con la huella del vínculo. Contrato: `architecture/datos-por-la-malla.md` §6.

Permisos del sistema: macOS pide «Red local» (ya declarado en `Info.plist`) y puede preguntar por
conexiones entrantes si el cortafuegos está activo; Windows enseña el aviso del Firewall para el TCP
47071 (permitir «Redes privadas»). Redes de invitados con aislamiento de clientes no dejan pasar nada.

## 3 · Protocolo (canal `sync`, versión 1)

Cada mensaje va FIRMADO con la identidad de malla (`wrapSigned` v2: firma + instante + nonce) y al llegar
se comprueba firma y frescura (`unwrapSigned` + `acceptFreshness`). Sin firma válida no se enseña nada.

```
sync.solicitud  { id, de, ts, para:{neurona?,sync?}, caduca (10 s–10 min, por defecto 2 min), auto, recordar }
sync.respuesta  { id, de, ts, acepta, recordar }
sync.vinculada  { id, de, ts, recordar }      ← lo manda quien CIERRA (quien inició)
sync.cancelada  { id, de, ts }
de = { neurona, sync?, cuenta?, nombre, plataforma?, medio?, capacidades[] }   (solo datos públicos)
```

Estados (`transicion`, puro): saliente `enviada → recibida` (la app del otro acusó) `→ vinculada`
(respondió que sí); entrante `recibida → aceptada-por-mi → vinculada` (llega `sync.vinculada`);
`aceptada-por-el-otro` cuando la lanzó un agente (`porAgente`) y falta el sí de la persona; terminales
`rechazada`, `caducada`, `cancelada` (con motivo). Si las dos piden a la vez, cada solicitud es el «sí» de
la otra. Una solicitud sin destinatario solo vale si llegó directa (IP o enlace QR); con destinatario, solo
la neurona nombrada la enseña. Límite: 3 solicitudes/min por identidad.

Confianza: el vínculo guarda la HUELLA del otro (primer uso). Una neurona recordada con la misma huella se
acepta sola (`autoAceptable`); con otra huella se pregunta y la ventana avisa de posible suplantación.

## 4 · Vías y orden (`planDeEnvio`)

1. Canal local nativo si la app oye neuronas en esta red: exacta (IP, id del faro o última IP del vínculo)
   o, si no se sabe cuál es, difundida a las anónimas con canal (≤ 8; solo la nombrada contesta).
2. Transporte universal: enlace QR, malla P2P de la cuenta, vínculo entre cuentas, relé con identidad.
3. Relé cifrado de la cuenta sin destinatario (internet + sesión): llega cuando la otra lo consulte.
El resultado dice SIEMPRE la vía, cada intento y, si nada llega, por qué. Navegador sin internet ni app
nativa: «un navegador no puede descubrir otra neurona por sí solo» + `ofrecerQr`.

Recordar: `starseed.malla.vinculos-neuronas.v1` (este aparato, con la última IP local) y
`starseed.malla.vinculos.<neurona>.v1` (sin IPs; prefijo en `SYNCED_PREFIXES`, viaja con la cuenta).
Reconexión: cada 15 s la app mira los faros; un vínculo recordado que REAPARECE (por id de faro o por su
última IP) recibe una `sync.solicitud` con `auto:true` (≤ 1/min); también al abrirse un enlace QR con él.
Aviso discreto «Reconectada con X».

## 5 · API para el panel del vínculo (siguiente agente)

`src/lib/malla/sincronizacion-neuronas-motor.ts`:

- `vinculosDeNeuronas(): VinculoVivo[]` · `suscribirVinculos(cb): () => void` · `useVinculosNeuronas()`
- `medirVias(neurona): Promise<LatenciaVia[]>` — ping por la red local y por cada enlace abierto.
- `solicitarSincronizacion(destino, { recordar?, auto?, porAgente? })`, `responderSolicitud`,
  `cancelarSolicitud`, `recordarVinculo(neurona, bool)`, `olvidarVinculo(neurona)`, `alAvisoSync(cb)`.
- `fijarCapacidadesAnunciadas(() => string[])` — añade etiquetas PÚBLICAS a lo que anuncia esta neurona
  (p. ej. las capas de conciencia compartidas); devuelve la baja.

```ts
interface VinculoVivo {
  neurona; sync?; cuenta?; nombre; plataforma?; medio?: "app-nativa" | "navegador";
  huella?; recordado; recordadoPorElOtro; capacidades: string[];
  creado; ultimoEncuentro; ultimaVia: ViaSync | null; ultimaIp?;
  enRedLocal: boolean;
  vias: { via: ViaSync; disponible; latenciaMs: number | null; medidoEn: number | null; detalle }[];
  sincronizaciones: { id; direccion; estado; via; auto; desde; actualizada; texto }[];
}
type ViaSync = "red-local-nativa" | "enlace-local" | "malla-cuenta" | "vinculo-par" | "rele" | "lora";
```

## 6 · Pruebas y lo que necesita dos aparatos

- Rust: `rustc --edition 2021 --test native/src-tauri/src/malla_local_trama.rs` (9 pruebas, incluida una
  conversación TCP real por loopback y el caso «sin acuse no hay envío»).
- TS: `npx vitest run src/lib/malla/__tests__/sincronizacion-neuronas.test.ts
  src/lib/malla/__tests__/sincronizacion-neuronas-motor.test.ts
  src/components/network/__tests__/solicitud-sincronizacion.test.tsx` (el motor se prueba con dos y tres
  neuronas en memoria: solicitud, rechazo, cruce, cancelación, caducidad, reconexión sola, suplantación).
- A mano (dos aparatos con la app nativa en el mismo Wi-Fi, con y sin salida a internet): radar → señal
  `lan:<ip>` o neurona de la cuenta → «Sincronizar ahora» → ventana en el otro → Aceptar → «Vinculadas» en
  los dos; cerrar y abrir la app → «Reconectada». Probar también un móvil con el punto de acceso sin datos.

## 7 · Pendiente (con motivo)

- La clave de faro de la cuenta YA se reparte a la app nativa (VIN1107A, §8.3). Pendiente de comprobar a mano en
  dos aparatos: que `antenas_configurar` haga que el faro en marcha pase a emitir con la clave nueva sin
  reiniciar la app (el Rust no se tocó en esta ola y no hay Rust en la Mac).
- Identidad entre cuentas sin servidor: la cuenta que dice el otro no se puede comprobar offline (se dice
  así en la ventana); la huella sí.
- `/genesis` y `/voces` no montan `MallaNeuronasMount`: allí no sale la ventana.

## 8 · Panel del vínculo (VIN1107A · 2026-11-07)

Pedido de Alex: desde las secciones del Radar, las Señales y las Neuronas, ver los tipos de conexión
disponibles, la latencia de cada uno, las sincronizaciones y su estado, las capacidades y capas de
conciencia compartidas y los ajustes.

### 8.1 Dónde se ve
| Dónde | Qué |
|---|---|
| Ficha de una señal (Radar, Mapa de señales, panel de Señales: `signal-detail.tsx`) | `PanelVinculo` de la neurona de esa señal; si no está vinculada lo dice |
| Panel de Señales (`detected-signals-panel.tsx`) | `ListaVinculos`: todas las vinculadas con su mejor vía y latencia |
| Cerebro → Neuronas (`neuronas-panel.tsx`) | `ListaVinculos` arriba y, en cada tarjeta de otra neurona, «Vínculo, vías y latencia» |
| Cerebros → Servidores (`servers-panel.tsx`) | `ListaVinculos`; cada tarjeta de servidor muestra su neurona vinculada (`ServidorNeurona`); la asociación servidor→neurona vive en `starseed.malla.servidor-neurona.v1` (`registro-servidor-neurona.ts`, VIN1107T1) y se hace a mano; el registro no cambia |

### 8.2 Piezas
- `src/lib/malla/panel-vinculo.ts` (puro): mejor vía (menor latencia medida; sin medidas, orden fijo más directo
  primero), textos de latencia («sin medir» nunca se estima), filas, de quién es (propia/ajena, privada/pública/
  anónima; **el modelo no distingue comunitarias: se dice «sin dato»**), capas compartidas.
- `src/lib/malla/ajustes-vinculo.ts` (puro) + motor: por neurona, SOLO en este aparato (`starseed.malla.vinculos-ajustes.v1`):
  `reconectarSola` (apagado: ni se le pide sola ni se acepta sola su solicitud) y `viasPermitidas` (vale para pedir y
  para contestar; el transporte universal cubre enlace-local/malla-cuenta/vinculo-par/lora y se salta solo si ninguna
  de las cuatro está permitida; si por esto no llega nada, el resultado lo dice). Siempre queda al menos una vía.
- `src/lib/malla/anuncio-capas.ts`: anuncia `capa:local|mesh|nube|colectiva` (solo las encendidas y con el interruptor
  general activo; **nunca** «contexto personal») con `fijarCapacidadesAnunciadas`.
- `src/components/network/panel-vinculo.tsx`: `PanelVinculo` y `ListaVinculos`.

### 8.3 Clave de faro de la cuenta → app nativa
`src/lib/nativa/faro-clave-cuenta.ts`, montado en `MallaNeuronasMount`. Solo en la app nativa y con sesión: lee (o crea una vez)
`user_settings.prefs.faro_clave_v1` (RLS por dueño), vuelve a leer lo que quedó si dos neuronas la crean a la vez y la
guarda con `antenasConfigurar` junto a `neurona` y `conocidas` (ids de las demás neuronas de la cuenta), conservando
`meshtastic_hosts`, `nas` y `faro_apagado`. Primera vuelta a los 5 s; reintento 30 s ×4 si falla; repite cada 30 min.
Nunca registra ni devuelve la clave; nunca toca tokens ni claves de sesión.

## 9 · Versión, medio y aparato de cada neurona + «Pedir actualización» (VER1107B · 2026-11-07)

Pedido de Alex: en la lista y el detalle de las neuronas, la versión, el medio y el aparato de cada una;
«Nueva versión disponible» cuando va atrasada; en esta neurona, el mismo flujo de actualización; en sus
OTRAS neuronas, «Pedir actualización».

### 9.1 Campos de presencia (retrocompatibles)

La presencia de la cuenta (`PresenciaMedio`, `src/lib/neurons/presencia.ts`, canal `neur:<token>`) ya
llevaba `v` (versión de cada capa; `v.nativa` = versión de la app nativa por `__TAURI__.app.getVersion()`)
y `plataforma` (del navegador). Se añade un campo OPCIONAL:

```
d?: { medio: "escritorio"|"android"|"pwa"|"web"|"ios", app?: "os"|"cafe"|"nexus", so?, soV?, arq?, equipo?, pa?: 1 }
```

- `medio`, `app`, `so`, `soV`, `arq`, `equipo` salen de `info_neurona` (centro-versiones-1105.md §8.3);
  en una app anterior solo `medio`; en el navegador, `medio: "web"|"pwa"`. `pa: 1` = esta web entiende
  `neurona.actualizar.solicitud`. Textos recortados (≤ 60) y validados al llegar (`sanearInfoPublica`).
- Retrocompatible: quien no lo manda (web anterior, p. ej. la empaquetada en la 0.5.0) sigue funcionando y
  el panel dice «versión desconocida» (o su `v.nativa` si la anuncia, sin medio ni aparato). Nada se rellena.
- Solo viaja por el canal de presencia de la cuenta (sus propios aparatos). No se añade al faro ni al
  `de` del protocolo `sync` (que puede llegar a otras cuentas).
- Lógica pura: `src/lib/neurons/info-publica.ts` (`formatearInfoNeurona`, `mejorMedio`: de los medios
  abiertos de una neurona, la app nativa más nueva).

### 9.2 Mensaje `neurona.actualizar.solicitud` (v1)

```
cuerpo = { t:"neurona.actualizar.solicitud", v:1, id, de, deNombre?, para, cuenta, version?, ts }
sobre  = wrapSigned(cuerpo)  → { v:2, b:cuerpo, ts, nonce, s, k, f }   (ECDSA P-256 de mesh-identity)
```

- Sale por dos caminos a la vez: broadcast de la cuenta `neurona:actualizar` (con internet) y el
  transporte universal, canal `neurona-actualizar` (red local nativa, enlace sin internet, malla de la
  cuenta…). El receptor descarta el duplicado por `id`.
- Se acepta SOLO si (`validarSolicitud`, puro, en `src/lib/neurons/pedir-actualizacion.ts`): firma v2
  válida; `ts` a ±10 min; `nonce` no visto (`acceptFreshness`); `cuenta` = la de esta neurona; `para` =
  esta neurona y `de` ≠ ella; huella no revocada; y la huella es de esta cuenta según el registro
  verificado de identidades (`boundAccountFor`: la fila la insertó la propia cuenta, RLS) o, sin internet,
  la de un vínculo RECORDADO de esta cuenta. Si el registro dice otra cuenta, el vínculo no la salva.
- Aceptado: evento `starseed:buscar-actualizacion` → la ventana «Hay una versión nueva» de ESA neurona
  mira ya (ignora «ya vista») y, si su canal tiene la versión, se abre con «Te lo pide «X»: tú decides si se
  instala». Nunca instala sola; el updater de Tauri sigue verificando la firma minisign de la versión.
- Neuronas que no lo entienden (sin `pa: 1` en su presencia): no se ofrece el botón; se dice que la abran y
  la actualicen desde la Librería (o instalen la nueva encima).

### 9.3 Dónde se ve

| Dónde | Qué |
|---|---|
| Ajustes › Neuronas (`neurons-panel.tsx`) | tarjeta «Esta neurona» (`esta-neurona.tsx`) y, en cada neurona, `VersionNeurona` |
| Mensajes › Neuronas (detalle del chat, `hilo-neurona.tsx`) | `VersionNeurona` bajo la cabecera, solo para neuronas de tu cuenta |

### 9.4 Pruebas y lo que necesita dos aparatos

- `npx vitest run src/lib/neurons/__tests__/info-publica.test.ts src/lib/neurons/__tests__/pedir-actualizacion.test.ts
  src/components/neurons/__tests__/version-neurona.test.tsx` (firmas ECDSA reales: dueño equivocado, huella
  de otra cuenta, cuerpo cambiado tras firmar, firma de otro sobre, caducada, revocada, sin firma).
- A mano: dos aparatos de la misma cuenta, uno con la app atrasada → en el otro, «Pedir actualización» →
  en el atrasado sale su ventana con «Te lo pide…»; probar también sin internet en la misma red (app nativa)
  y que una cuenta distinta no consiga abrir nada.

## 10 · Fusión de los registros de un aparato tras iniciar sesión (NEU1107B · 2026-11-07)

Contrato completo: `architecture/neurona-bienvenida.md`. Lo que toca a la malla:

- La fusión de la ventana «Esta neurona» NO borra filas: las absorbidas se quedan con
  `capabilities.fusionada = { en, ts, por }` y su alias en `starseed.neuronas.fusiones.v1`. La neurona que se
  queda sigue latiendo, anunciándose en la presencia (`n` = su id) y en `conocidas`.
- `conocidas` (faro de la app nativa) = ids vigentes + ids absorbidos que apuntan a uno vigente
  (`idsConocidasConAlias`, `faro-clave-cuenta.ts`): el faro de un medio que aún no adoptó el id nuevo sigue
  siendo «de mi cuenta» y con nombre. Tras fusionar, la app nativa reparte la clave de faro al momento.
- Un medio que ve su propia fila marcada sin alias todavía lo apunta él mismo y adopta el id que se quedó
  (`listNeurons`): sin internet entre las dos, basta con que la fila llegue.
- Los vínculos de sincronización (`starseed.malla.vinculos.<neurona>.v1`) guardan la huella de malla, que no
  cambia con la fusión (los ids de malla y de sync de cada medio no se comparten).
