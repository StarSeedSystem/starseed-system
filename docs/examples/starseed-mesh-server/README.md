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

## Federación

`STARSEED_PEERS='https://otro:8787,https://tercero:8787'` — el servidor sondea el
`/mesh/public` de sus pares cada `STARSEED_FEDERATE_MS` (por defecto 20 s) y fusiona
el contenido (dedup por origen/tiempo), tejiendo una malla de servidores propios sin
un servidor central.

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/mesh/public` | Publicar contenido público (texto plano). |
| POST | `/mesh/relay` | Relé dirigido (`envelope.recipient`); body cifrado E2E por el cliente. |
| GET | `/mesh/public?since=` | Feed público posterior a `since`. |
| GET | `/mesh/relay?recipient=&since=` | Buzón dirigido de una identidad (auth por token). |
| GET | `/mesh/stream?recipients=&token=` | **SSE**: empuje instantáneo del feed público + buzón dirigido a esas identidades. |

Notas (Adenda 106): el contenido público va **firmado** por el cliente (ECDSA) — el servidor
solo lo transporta y los receptores verifican. La **federación** deduplica por `oid` (id de origen
estable) con marca de agua por par, de modo que un ítem re-federado por varios pares se ignora
(anti-bucle).

Producción: pon el servidor tras HTTPS + un dominio, define `STARSEED_TOKENS`, usa
Postgres y (opcional) `STARSEED_PEERS` para federar con otros nodos de tu comunidad.
