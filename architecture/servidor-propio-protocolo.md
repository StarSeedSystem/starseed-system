# Protocolo de Servidor Propio — Red Sináptica StarSeed (Adenda 103)

Un **servidor propio** (privado o público) es un endpoint HTTP que un usuario o grupo
añade en **Señales → Servidor** y selecciona como servidor activo de un contexto
(cuenta, grupo, página, cerebro, etc.). La neurona habla con él por HTTP para
enviar y recibir contenido, en paralelo al servidor público StarSeed (Supabase).

Cliente: `src/ai/astraura/mesh/server-relay.ts` — `postToEndpoint` (envío, Adenda 101)
y `pullFromEndpoint` (recepción, Adenda 103). Endpoint base = `MeshServer.endpoint`
(`servers.ts`). Implementación de referencia: `docs/examples/starseed-mesh-server.mjs`.

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
  descifrando en cliente). La implementación de referencia usa **node:sqlite** (persistencia
  real, con respaldo en memoria), **bearer token** y **buzón por `recipient`**.
- **Futuro**: SDK/paquete servidor con Postgres, auth de grupo y federación entre servidores propios.
