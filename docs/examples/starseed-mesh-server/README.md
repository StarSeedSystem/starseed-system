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

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/mesh/public` | Publicar contenido público (texto plano). |
| POST | `/mesh/relay` | Relé dirigido (`envelope.recipient`); body cifrado E2E por el cliente. |
| GET | `/mesh/public?since=` | Feed público posterior a `since`. |
| GET | `/mesh/relay?recipient=&since=` | Buzón dirigido de una identidad (auth por token). |
| GET | `/mesh/stream?recipients=&token=` | **SSE**: empuje instantáneo del feed público + buzón dirigido a esas identidades. |

Notas: el contenido público va **firmado** por el cliente (ECDSA) — el servidor solo lo transporta
y los receptores verifican. La **federación** deduplica por `oid` (id de origen estable) con marca
de agua por par (anti-bucle). Adenda 107 añade **control de saltos** (`STARSEED_MAX_HOPS`) y
**verificación de firma de origen** opcional (`STARSEED_VERIFY=1`) también en el peer-pull; el
buzón dirigido y el SSE aceptan token por `Authorization: Bearer` o `?token=`. Adenda 108 añade
**expiración de token** (`{ids,exp}`) y **cuarentena de pares** por firmas inválidas. La
**revocación de identidad** (`kind:"revocation"`) se hace cumplir en el **receptor** (cliente del
OS), no en este servidor de transporte.

Verificado con `scripts/smoke-mesh-server.mjs` (endpoints, auth, expiración, verify, SSE) y
`scripts/smoke-mesh-federate.mjs` (peer-pull, `hops++`, control de saltos, cuarentena) en la raíz del repo.

Producción: pon el servidor tras HTTPS + un dominio, define `STARSEED_TOKENS`, usa
Postgres y (opcional) `STARSEED_PEERS` + `STARSEED_MAX_HOPS`/`STARSEED_VERIFY` para federar
con otros nodos de tu comunidad de forma segura.
