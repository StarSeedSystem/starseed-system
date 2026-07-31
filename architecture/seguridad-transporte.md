# SOP — Adenda 119: seguridad del transporte (anti-replay · rate-limiting · feed sin huecos)

> **Regla dorada:** este SOP es la fuente de verdad de la ola. Si la lógica cambia,
> actualiza primero este documento y luego el código.

Primera ola de seguridad del roadmap (`claude/roadmap-mejoras-os-red-mesh-2026-07-31.md`,
ítems #mesh2, #mesh1, #mesh8). Cada cambio pasó una **revisión adversarial** (subagente) antes
de desplegar; los defectos que encontró se corrigieron en la misma ola (ver §Correcciones).

## 1. Anti-replay del feed firmado (sobre v:2)

**Problema.** `wrapSigned` firmaba solo `body`: un ítem público firmado era válido para siempre y
podía re-inyectarse con un `id`/`oid` nuevo pasando la verificación → suplantación por reinyección
(aparecía como post «verificado» y fresco de la víctima).

**Solución.** `mesh-identity.ts`:
- `wrapSigned` produce un sobre **v:2** que firma `{b, ts, nonce}` (instante + uso único). `randNonce`
  usa 96 bits de CSPRNG.
- `unwrapSigned` verifica v:2 (firma sobre `{b,ts,nonce}`), sigue aceptando v:1 (solo `b`) y v:0/plano,
  y devuelve `ts`/`nonce`.
- `replay-guard.ts` `acceptFreshness(fp, ts, nonce)`: rechaza `ts` fuera de ventana (±15 min, tolerante
  a desfase de reloj) y `nonce` ya visto (LRU de 4000 por `fp`). Sin `ts`/`nonce` (v0/v1) devuelve true.
- `server-relay.ts` `unwrapFresh` envuelve `unwrapSigned` + la guarda y **degrada `verified` a false**
  en replay/caducado (nunca borra; el duplicado exacto ya se deduplica por id). Se aplica en los 4
  consumidores del feed público (pull/realtime/endpoint/stream). El servidor de referencia
  (`verifyWrapped`) verifica la firma v:2/v:1 en modo `STARSEED_VERIFY`; la frescura se hace cumplir
  en el **receptor**.

**Residual (futuro):** dentro de la ventana y tras un reload (la guarda es en memoria por sesión), un
payload v:2 capturado puede re-inyectarse una vez. Mitiga: ventana acotada + guarda solo sobre firmas
válidas. Cierre pleno = persistir nonces por `fp` y dejar de aceptar v:1 tras la migración.

## 2. Rate-limiting / anti-DoS del relé

**Servidor** (`docs/examples/starseed-mesh-server/index.mjs`): ventana fija por **clave** en las
escrituras (`POST /mesh/public` y `/mesh/relay`) → `429` al exceder.
- Clave = **token** (con auth) o **IP de red** (`X-Forwarded-For` tras proxy). **Nunca** el `device_id`
  del cuerpo (lo controla el cliente y podría rotarlo para evadir — corregido tras la revisión).
- `STARSEED_RATE_MAX=120` / `STARSEED_RATE_WINDOW_MS=60000` (`RATE_MAX=0` lo desactiva). `rateBuckets`
  se poda por expiración y por **tope duro** de tamaño (LRU aprox) → sin crecimiento ilimitado.
- `STARSEED_MAX_SSE=1000`: tope de conexiones SSE simultáneas (`503` al superarlo).

**Cliente** (`server-relay.ts`): token-bucket local anti-flood (`clientRateAllow`, ~30/5s, generoso) en
`uploadPublic`/`uploadRelay` — corta bucles patológicos, no es frontera de seguridad.

**Residual:** ventana fija admite 2×RATE_MAX en el borde; GET no se limita (idempotente, no crece
almacén). Futuro: ventana deslizante.

## 3. Consumo sin huecos del feed público

**Problema.** `pullPublicFeed` usaba `limit(50)` + marca de agua por `created_at`: en ráfagas > 50 se
perdían EN SILENCIO los ítems entre la marca vieja y el 50.º más nuevo.

**Solución.** Drenado **keyset** por `(created_at, id)` ascendente hasta agotar (`FEED_PAGE=100`,
`FEED_MAX_PAGES=12` con aviso al topar). Usa `gte` + dedup por id **dentro** del drenado para no
saltarse filas que compartan `created_at` en el borde de página (empate), y corta si una página no
aporta filas nuevas (anti-bucle ante empate masivo). El consumidor (`synaptic.ts`) sigue deduplicando
por id al entregar.

## Correcciones tras la revisión adversarial

- **Rate-limit por IP/token, no por `device_id`** (evita bypass y DoS de memoria del Map).
- **Guarda solo sobre firmas VÁLIDAS** (un atacante no envenena el LRU de nonces con firmas inválidas).
- **`MAX_DELIVERED_IDS` (synaptic) = 5000 ≥ `MAX_NONCES` (4000)**: el dedup por id dura más que la
  memoria de nonces, para que una re-entrega legítima (realtime + sondeo) del mismo item se descarte
  por id ANTES de que su nonce repetido la marque no-verificada.
- **Drenado con `gte` + dedup por id** (no `gt`): no se pierden filas en empates de `created_at`.
- **Tope de conexiones SSE** y poda dura del Map de tasa.

## Verificación

- `scripts/test-mesh-core.ts` → **61/61** (+7 anti-replay: v:2, guarda, replay, ventana, manipulación).
- `scripts/smoke-mesh-server.mjs` → **40/40** (+ v:2 en VERIFY, 429 por token, bypass por device_id cerrado).
- `scripts/smoke-mesh-federate.mjs` → **10/10**. · `tsc` limpio · `next build` **104/104**.
