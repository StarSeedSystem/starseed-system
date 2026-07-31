# starseed-mesh-server (referencia)

Servidor propio del **Protocolo de Red Sináptica StarSeed**. Un usuario o grupo lo
despliega, lo añade en **Señales → Servidor** con su endpoint (+ token si usa auth)
y lo selecciona como servidor activo. La neurona envía y recibe por él, en paralelo
al servidor público StarSeed.

Contrato: [`architecture/servidor-propio-protocolo.md`](../../../architecture/servidor-propio-protocolo.md).

## Ejecutar

```bash
node index.mjs                                   # :8787, memoria (o SQLite si hay STARSEED_DB)
STARSEED_DB=./mesh.db node index.mjs             # persistencia SQLite (node:sqlite, Node ≥22.5)
DATABASE_URL=postgres://user:pass@host/db \
  npm i pg && node index.mjs                     # persistencia Postgres
```

## Persistencia

Se elige automáticamente: **Postgres** (`DATABASE_URL` + paquete `pg`) →
**SQLite** (`node:sqlite`, `STARSEED_DB`) → **memoria** (respaldo).

## Autenticación de grupo

- `STARSEED_SERVER_TOKEN=secreto` — un único token abierto (todo el que lo tenga escribe/lee).
- `STARSEED_TOKENS='{"tokenA":["<uuid-cuenta>","group:barrio"],"tokenB":["group:barrio"]}'`
  — cada token concede unas **identidades**. Escribir (`POST`) exige token válido; leer el
  **buzón dirigido** (`GET /mesh/relay?recipient=…`) exige que el token incluya ese `recipient`.
  Así una cuenta solo lee su buzón y un grupo solo el suyo.
- **Expiración (Adenda 108)**: un token puede declararse `{"ids":[...],"exp":<epoch_ms>}` en vez de
  un array; pasado `exp` (UTC ms) se trata como inexistente (401/403). Ej.:
  `STARSEED_TOKENS='{"tokenA":{"ids":["group:barrio"],"exp":1830000000000}}'`.

## Federación

`STARSEED_PEERS='https://otro:8787,https://tercero:8787'` — el servidor sondea el
`/mesh/public` de sus pares cada `STARSEED_FEDERATE_MS` (por defecto 20 s) y fusiona
el contenido (dedup por `oid`, marca de agua por par), tejiendo una malla de servidores
propios sin un servidor central.

- `STARSEED_MAX_HOPS=4` — **control de saltos**: cada ítem lleva `hops`; al re-federar se
  incrementa y se descarta si supera el límite. Corta bucles y propagación infinita.
- `STARSEED_VERIFY=1` — **solo firma válida**: rechaza (400) el `POST /mesh/public` sin firma
  ECDSA válida y descarta en federación el ítem público sin firma. El relé va cifrado E2E aparte.
- `STARSEED_PEER_MAX_BAD=20` / `STARSEED_PEER_QUARANTINE_MS=300000` — **reputación de pares**
  (Adenda 108): en modo `VERIFY`, un par cuyas firmas inválidas superan a las válidas por este
  margen se **aísla** el tiempo de cuarentena (no se le sondea hasta que expira).
- `STARSEED_PEX=1` / `STARSEED_MAX_PEERS=16` / `STARSEED_SELF_URL=` — **descubrimiento de pares**
  (Adenda 116): el servidor fusiona los pares nuevos de las listas `GET /peers` de sus pares, hasta el
  tope, sin añadirse a sí mismo.

## Ciclo de vida de tokens (Adenda 116)

Con `STARSEED_ADMIN_TOKEN=<clave>` el servidor emite tokens en caliente (además de los estáticos de
`STARSEED_TOKENS`) y aplica una **lista de revocación**:

- `POST /tokens/issue` (admin) · body `{"ids":["group:barrio"],"ttlMs":3600000}` → `{token,ids,exp}`.
- `POST /tokens/refresh` (con el token en `Authorization: Bearer`) → renueva `exp`.
- `POST /tokens/revoke` (admin) · body `{"token":"tk_…"}` → lo añade a la lista de revocación (401 a partir de ahí).

`STARSEED_TOKEN_TTL_MS` (def. 3600000) es la caducidad por defecto. Con `STARSEED_ADMIN_TOKEN` puesto,
el servidor exige token válido en toda escritura (modo gestionado).

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/mesh/public` | Publicar contenido público (texto plano). |
| POST | `/mesh/relay` | Relé dirigido (`envelope.recipient`); body cifrado E2E por el cliente. |
| GET | `/mesh/public?since=` | Feed público posterior a `since` (ordenado por reloj lógico `lc`). |
| GET | `/mesh/relay?recipient=&since=` | Buzón dirigido de una identidad (auth por token). |
| GET | `/mesh/stream?recipients=&token=` | **SSE**: empuje instantáneo del feed público + buzón dirigido. |
| GET | `/peers` | Lista de pares conocidos (PEX). |
| POST | `/tokens/issue · refresh · revoke` | Ciclo de vida de tokens (admin/token). |

Notas: el contenido público va **firmado** por el cliente (ECDSA) — el servidor solo lo transporta
y los receptores verifican. La **federación** deduplica por `oid` (id de origen estable) con marca
de agua por par (anti-bucle). Adenda 107 añade **control de saltos** (`STARSEED_MAX_HOPS`) y
**verificación de firma de origen** opcional (`STARSEED_VERIFY=1`) también en el peer-pull; el
buzón dirigido y el SSE aceptan token por `Authorization: Bearer` o `?token=`. Adenda 108 añade
**expiración de token** (`{ids,exp}`) y **cuarentena de pares** por firmas inválidas. La
**revocación de identidad** (`kind:"revocation"`) se hace cumplir en el **receptor** (cliente del
OS), no en este servidor de transporte.

El **reloj lógico** `lc` (Adenda 115/116) viaja en el envelope y el servidor lo transporta y ordena el
feed por él; el **certificado de revocación** y su cumplimiento por autoridad de cuenta viven en el
cliente del OS (este servidor solo transporta la `kind:"revocation"`).

Verificado con `scripts/smoke-mesh-server.mjs` (endpoints, auth, expiración, tokens dinámicos, verify,
SSE, orden por lc) y `scripts/smoke-mesh-federate.mjs` (peer-pull, `hops++`, saltos, cuarentena, PEX)
en la raíz del repo.

Producción: pon el servidor tras HTTPS + un dominio, define `STARSEED_TOKENS`, usa
Postgres y (opcional) `STARSEED_PEERS` + `STARSEED_MAX_HOPS`/`STARSEED_VERIFY` para federar
con otros nodos de tu comunidad de forma segura.
