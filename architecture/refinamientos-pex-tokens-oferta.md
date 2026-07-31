# SOP — Adenda 117: PEX de confianza · tokens firmados/rotables · directorio de oferta pública

> **Regla dorada del proyecto:** este SOP es la fuente de verdad de la ola. Si la
> lógica cambia, actualiza primero este documento y luego el código.

Pulido de los tres refinamientos abiertos al cierre de la Adenda 116, más el punto
de partida del análisis de mejoras (ver el doc de proyecto `adenda-117-*`).

## 1. PEX de confianza (federación acotada a pares avalados)

**Problema.** El descubrimiento automático de pares (PEX, Adenda 116) es abierto:
un servidor fusiona a CUALQUIER par que aparezca en la lista `/peers` de sus pares.
En una federación pública eso permite que un nodo hostil se propague por la malla
de servidores.

**Solución.** Variable de entorno `STARSEED_PEX_ALLOW` (lista separada por comas de
prefijos/subcadenas de URL de confianza) en `docs/examples/starseed-mesh-server/index.mjs`:

- Si está **vacía** → PEX abierto (comportamiento 116, retrocompatible).
- Si está **definida** → `discoverPeers()` solo añade un par descubierto cuando su
  URL casa con algún patrón de la lista (`u === a || u.startsWith(a) || u.includes(a)`).
  Los pares fuera de la lista se registran como `IGNORADO` y no se añaden.

Los `STARSEED_PEERS` iniciales (semilla estática) NO se filtran: son la confianza raíz
que el operador define a mano. La allowlist gobierna solo el crecimiento por PEX.

## 2. Tokens firmados con clave rotable (revocación masiva)

**Problema.** Los tokens dinámicos (Adenda 116) vivían en un `Map` en memoria: se
perdían al reiniciar el servidor y no había forma de invalidarlos en bloque ante el
compromiso de la infraestructura.

**Solución.** Tokens **auto-verificables por firma HMAC** y una **clave de firma rotable**:

- Formato: `tk_<payloadB64u>.<firmaB64u>`, donde `payload = {ids, exp, kid, jti}` y
  `firma = HMAC-SHA256(secreto[kid], "tk_<payload>")`.
- Verificación (`verifySignedToken`): recomputa el HMAC con el secreto de la `kid`
  declarada (actual o previa) y compara en tiempo ~constante. Sin secreto para esa
  `kid` (clave rotada fuera de gracia) → inválido.
- **Sobreviven a un reinicio** si `STARSEED_TOKEN_SIGN_KEY` es fija; si no se define,
  se genera una clave aleatoria al arrancar (los tokens caducan con el proceso).
- `POST /tokens/rotate-key` (admin):
  - por defecto → la clave actual pasa a **previa con gracia** (los tokens ya emitidos
    siguen verificando hasta caducar) y se genera una nueva.
  - con `{"dropPrev":true}` → descarta la previa al instante: **invalida de golpe todos
    los tokens firmados con ella** (palanca de revocación masiva).
- `revokedTokens` (Set) sigue permitiendo revocar tokens uno a uno (`/tokens/revoke`).
- `tokensActive()` = `!!TOKENS || !!ADMIN_TOKEN` (el `Map` dinámico desaparece; con
  `ADMIN_TOKEN` puesto el servidor está siempre en modo gestionado).

La clave de firma **nunca** sale del servidor: `/tokens/rotate-key` devuelve solo la
`kid` y si hay gracia, nunca el secreto.

## 3. Cliente de administración de tokens desde el OS

`src/ai/astraura/mesh/server-admin.ts` — helpers que hablan con `/tokens/*` de un
servidor propio: `issueServerToken`, `refreshServerToken`, `revokeServerToken`,
`rotateServerTokenKey`. El **token de admin** se pasa de forma **transitoria** (nunca
se persiste en el OS). Best-effort: nunca lanza; devuelve `{ok, data?, detail}`.

UI: `src/components/connectivity/server-token-admin.tsx` — panel colapsable montado en
`ConnectivityConfigPanel` bajo cada servidor propio **con endpoint**. Emite tokens (con
TTL), los guarda como acceso del servidor (`updateMeshServer`), revoca y rota la clave
(con confirmación para el drop duro).

## 4. Directorio de oferta pública (hacer accionable `offerPublicInternet`)

**Problema.** El ajuste `offerPublicInternet`/`publicPort` de una neurona solo se
**anunciaba** en el faro (Adenda 115); nadie podía actuar sobre esa oferta.

**Solución.** `src/components/connectivity/public-offers-directory.tsx` lee la caché del
radar (`getNearbyBeacons()`, la misma fuente que Señales), filtra `offersPublic` y lista
las neuronas que ofrecen internet público con su puerto, región y frescura. De cada una
se puede **crear un servidor propio** (`addMeshServer`) para usarla.

**Honestidad radical:** el navegador no puede abrir un puerto por sí mismo. El directorio
lo dice y pide el `host` alcanzable para armar el endpoint `http://host:puerto`; para
**levantar de verdad** el servicio, la neurona que ofrece ejecuta el servidor de
referencia en ese puerto. Montado en `ConnectivityConfigPanel` (cuenta, con público ON).

## Verificación

- `scripts/smoke-mesh-server.mjs` — 35/35 (incl. rotación con gracia y dura, invalidación
  masiva, token firmado).
- `scripts/smoke-mesh-federate.mjs` — 10/10 (incl. PEX de confianza: B no añade a C fuera
  de la lista blanca).
- `scripts/test-mesh-core.ts` — 54/54.
- `tsc --noEmit` limpio · `next build` 104/104 páginas.
