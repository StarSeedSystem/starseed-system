# Protocolo de Servidor Propio — Red Sináptica StarSeed (Adenda 103)

Un **servidor propio** (privado o público) es un endpoint HTTP que un usuario o grupo
añade en **Señales → Servidor** y selecciona como servidor activo de un contexto
(cuenta, grupo, página, cerebro, etc.). La neurona habla con él por HTTP para
enviar y recibir contenido, en paralelo al servidor público StarSeed (Supabase).

Cliente: `src/ai/astraura/mesh/server-relay.ts` — `postToEndpoint` (envío, Adenda 101)
y `pullFromEndpoint` (recepción, Adenda 103). Endpoint base = `MeshServer.endpoint`
(`servers.ts`). Implementación de referencia (paquete): `docs/examples/starseed-mesh-server/`.

## Envío (neurona → servidor)

- **POST `<endpoint>/mesh/public`** — contenido público (texto plano).
  Body JSON:
  ```json
  { "channel": "public", "device_id": "dev-xxxx",
    "envelope": { "cls": "P2", "ptype": "post", "body": { ... }, "recipient": null } }
  ```
- **POST `<endpoint>/mesh/relay`** — relé privado. `body` ya viene **cifrado AES-GCM
  en el cliente** (`{ iv, ct }`): el servidor NO puede leerlo, solo lo transporta.
  ```json
  { "channel": "relay", "device_id": "dev-xxxx",
    "envelope": { "cls": "P2", "ptype": "message", "body": { "iv": "…", "ct": "…" }, "recipient": "…" } }
  ```
- Respuesta `2xx` = aceptado. Cualquier otro código → la entrega hace failover a
  otra vía (malla / StarSeed) y encola.

## Recepción (servidor → neurona)

- **GET `<endpoint>/mesh/public?since=<epoch_ms>`** — contenido público posterior a `since`.
  Respuesta `{ items: [...] }` (o un array). Cada ítem:
  ```json
  { "id": "p123", "device_id": "dev-yyyy", "cls": "P2", "ptype": "post", "body": { ... }, "at": 1730000000000 }
  ```
- **GET `<endpoint>/mesh/relay?recipient=<deviceId>&since=<epoch_ms>`** — BUZÓN DIRIGIDO:
  los mensajes de relé dirigidos a esa neurona. `body` viene **cifrado E2E** (`{iv,ct}`);
  la neurona lo descifra en cliente. Requiere auth si el servidor la exige.
  Respuesta `{ items: [ { id, device_id, cls, ptype, body, hops, at } ] }`.
- **GET `<endpoint>/mesh/stream?recipients=<ids>&token=<token>`** — REALTIME (SSE): flujo
  `text/event-stream` que **empuja al instante** cada ítem público y cada relé cuyo `recipient`
  esté en `recipients`. Cada evento es `data: { channel, ...item }`. Cliente:
  `subscribeEndpointStream` (`EventSource`); el sondeo GET queda de respaldo. El `token` viaja en
  la query porque `EventSource` no admite cabeceras.

Los ítems incluyen `hops` (saltos de federación recorridos; 0 = origen local). En todos los casos
la neurona **deduplica por `id`/`oid`** y **excluye su propio `device_id`**.

## Reglas

- **CORS obligatorio**: el servidor debe responder `Access-Control-Allow-Origin` con el
  origen del OS (o `*` para uno público) y permitir `GET, POST, OPTIONS`.
- **Relé cifrado E2E**: el servidor jamás lee `body` en `/mesh/relay`.
- **Auth (opcional)**: cabecera `Authorization: Bearer <token>` en POST, en GET `/mesh/relay` y
  en `GET /mesh/stream` (SSE; el token viaja como `?token=` en la query porque `EventSource` no
  fija cabeceras). El GET público puede quedar abierto. El token se guarda **por servidor**
  (`MeshServer.token`, editable en Señales → Servidor) y el cliente lo adjunta solo al endpoint
  que lo tiene. Modelo de referencia: `STARSEED_TOKENS = { "<token>": ["<identidad>"] }` — el
  buzón dirigido solo lo lee un token que **incluya** ese `recipient` (identidad).
- **Firma de origen (opcional)**: el contenido público va **firmado** (ECDSA P-256, sobre
  `{v:1,b,s,k,f}`). Un servidor en modo `STARSEED_VERIFY=1` **rechaza** (400) el POST público sin
  firma válida y **descarta** en federación el ítem sin firma. El relé privado ya va autenticado
  por AES-GCM.
- **Identidad ↔ cuenta**: la neurona publica un **registro de identidad firmado**
  (`kind:"identity"`, `payload:{owner,fp,pub,sig}`) que liga su huella pública (`fp`) a un `owner`
  (uuid de cuenta). El receptor verifica la firma y resuelve `signerFp → cuenta`, mostrando el
  contenido con su cuenta de origen (no solo la huella del dispositivo).
- **Idempotencia**: los reintentos pueden reenviar; deduplica por `envelope.oid` / `id`.
- **Control de saltos (federación)**: cada ítem lleva `hops`; al re-federar se incrementa y se
  descarta si supera `STARSEED_MAX_HOPS` (def. 4). Evita bucles y propagación infinita entre pares.
- **Retención**: el servidor decide TTL; la neurona solo pide `since` reciente.

## Estado

- **Envío** (`postToEndpoint`) — Adenda 101.
- **Recepción público** (`pullFromEndpoint` + `pullPublicExtra`) — Adenda 103: el sondeo del
  feed público consume además el servidor propio activo de la cuenta.
- **Buzón dirigido + persistencia real + auth** — Adenda 104: `pullRelayFromEndpoint` +
  `pullRelayExtra` (el sondeo de bandeja consume el buzón dirigido del servidor propio,
  descifrando en cliente). Referencia con **node:sqlite** + bearer token + buzón por `recipient`.
- **Realtime + identidades + paquete servidor** — Adenda 105:
  · `subscribeRelayRealtime` (Supabase Realtime sobre `os_mesh_relay`): entrega INSTANTÁNEA
    del contenido/relé/faros sin esperar el sondeo (que sigue de respaldo).
  · `neuronIdentities()`: el buzón dirigido se recoge para TODAS las identidades de la neurona
    — dispositivo, **cuenta** (uuid) y **grupos** (`group:<slug>` vía `os_memberships`). El
    `recipient` de una transmisión puede ser un uuid de cuenta o `group:<slug>`.
  · Paquete de referencia `docs/examples/starseed-mesh-server/` con **Postgres** (además de
    SQLite/memoria), **auth de grupo** (tokens → identidades; el buzón solo lo lee su dueño) y
    **federación** (peer-pull entre servidores propios).
- **Firma + SSE + federación robusta** — Adenda 106:
  · **Contenido público FIRMADO** (ECDSA P-256, `mesh-identity.ts`): `wrapSigned` al enviar,
    `unwrapSigned` al recibir → los ítems llevan `verified` (insignia en /red-feed). El relé
    privado ya iba autenticado por AES-GCM.
  · **Realtime del servidor propio (SSE)**: `GET /mesh/stream?recipients=<ids>` empuja feed
    público + buzón dirigido al instante; cliente `subscribeEndpointStream` (EventSource).
  · **Federación robusta**: `oid` (id de origen estable) con dedup único, marca de agua POR PAR
    y anti-bucle (re-federar un ítem ya visto se ignora). Ver el paquete de referencia.
- **Identidad↔cuenta + token e2e + federación endurecida** — Adenda 107:
  · **Registro de identidad firmado** (`server-relay.ts`): `registerIdentity()` publica
    `kind:"identity"` firmando el `owner`; `refreshIdentities()` verifica y construye `idMap`
    (`fp → cuenta`). El contenido recibido resuelve `signerFp → boundAccountFor(fp)` y muestra la
    **cuenta de origen** (chip «cuenta …» en /red-feed), no solo el dispositivo.
  · **Token end-to-end**: `MeshServer.token` (editable en Señales → Servidor); el cliente lo
    adjunta a `postToEndpoint`, `pullFromEndpoint`, `pullRelayFromEndpoint` y a `subscribeEndpointStream`
    (SSE, como `?token=` en la query). Referencia con `STARSEED_TOKENS`/`STARSEED_SERVER_TOKEN`.
  · **Federación con control de saltos y firma**: `hops` por ítem (columna en Postgres/SQLite/memoria),
    incremento por salto, descarte si `hops > STARSEED_MAX_HOPS`, y descarte del ítem público sin
    firma válida en modo `STARSEED_VERIFY=1`. Verificado con `scripts/smoke-mesh-server.mjs` (14/14)
    y `scripts/smoke-mesh-federate.mjs` (3/3).
- **Futuro**: rotación/expiración de tokens y revocación de identidades comprometidas; reputación de
  pares en la federación (cuarentena de un peer que reenvía firmas inválidas); reconciliación con
  reloj lógico entre pares (más allá de la marca de agua por `at`); descubrimiento automático de
  pares de confianza a partir del registro de identidades de la cuenta/grupo.
