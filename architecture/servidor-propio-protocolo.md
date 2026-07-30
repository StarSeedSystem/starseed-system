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
  Respuesta `{ items: [ { id, device_id, cls, ptype, body, at } ] }`.

En ambos casos la neurona **deduplica por `id`** y **excluye su propio `device_id`**.

## Reglas

- **CORS obligatorio**: el servidor debe responder `Access-Control-Allow-Origin` con el
  origen del OS (o `*` para uno público) y permitir `GET, POST, OPTIONS`.
- **Relé cifrado E2E**: el servidor jamás lee `body` en `/mesh/relay`.
- **Auth (opcional)**: cabecera `Authorization: Bearer <token>` en POST y en GET `/mesh/relay`.
  El GET público puede quedar abierto. El token se guarda con el servidor (endpoint + credencial).
- **Idempotencia**: los reintentos pueden reenviar; deduplica por `envelope.oid` / `id`.
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
- **Futuro**: identidades ligadas a cuenta por registro firmado; SSE con auth por token en query
  end-to-end; reconciliación de federación entre muchos pares con control de saltos.
