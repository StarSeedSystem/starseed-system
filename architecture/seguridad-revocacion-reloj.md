# Seguridad de la red: revocación por cuenta + reloj lógico + refinamientos (Adenda 115)

Refina lo pendiente de la 114 y ataca el roadmap **item #5** (horizonte de seguridad de la 108),
con sus dos piezas de mayor impacto: **revocación por autoridad de cuenta** (certificado
pre-generado) y **reloj lógico** para orden entre pares.

## #5 · Revocación por autoridad de cuenta (certificado pre-generado)
Resuelve el hueco de la 108: revocar la fp de un dispositivo **perdido sin su clave viva**.
- `mesh-identity.ts` · `getRevocationCert()`: al crear la identidad, firma UNA vez su acta de
  revocación (`{fp,pub,sig}` sobre `{revoke:fp}`) y la persiste (`starseed.mesh.revocation-cert.v1`).
  Se regenera si la huella cambia (rotación). Como un certificado de revocación de PGP.
- `server-relay.ts` · `registerIdentity()` ahora **sube el certificado** a la cuenta como
  `kind:"revocation-cert"` (channel relay, `recipient=owner` → solo la cuenta lo lee por RLS).
  `listRevocationCerts()` lista los certificados verificados de las neuronas de la cuenta (excluye
  esta). `revokeDeviceByCert(fp)` **publica** el certificado guardado como `kind:"revocation"` →
  `refreshRevocations()` (108) lo honra y todos descartan el contenido de esa fp. Funciona desde
  CUALQUIER neurona de la cuenta sin la clave del dispositivo perdido.
- UI: en el panel de identidad (`connectivity-config-panel.tsx`) se añade la lista «Revocar otra
  neurona de la cuenta (autoridad de cuenta)» junto a la auto-revocación existente.

## #5 · Reloj lógico (Lamport) para orden entre pares
- `src/ai/astraura/mesh/logical-clock.ts` (NUEVO, puro): `tick()` (evento local → +1),
  `observe(remoto)` (`max(local,remoto)+1`), `current()`, `compareLamport(a,b)` (orden por `lc`, `at`
  de desempate), persistido (`starseed.mesh.lclock.v1`).
- Integración: `postToEndpoint` estampa `lc: tick()` en los envelopes a servidores propios;
  `pullFromEndpoint` hace `observe(row.lc)`. El **servidor de referencia** transporta `lc` (columna en
  Postgres/SQLite + memoria; POST lo lee, GET lo devuelve) para reconciliar orden aunque los relojes
  de pared estén desincronizados.

## Refinamientos de la 114
- **Oferta pública anunciada**: `emitBeacon` incluye en el faro `{offersPublic, port}` de esta
  neurona (leído de sus ajustes); `pullBeacons` + `RelayBeacon` los exponen → la disposición a
  ofrecer internet público es **descubrible** en el radar (no solo declarada localmente).
- **Bitácora con eventos reales**: `NeuronActivityLogger` (montado en `app-providers`) registra en la
  bitácora por neurona eventos REALES — neuronas cercanas (radar), contenido recibido por la red y
  descargas completadas — no solo los cambios de config.

## Verificación
- `scripts/test-logical-clock.ts` (12/12): tick/observe/current, `max+1`, negativos/NaN→0, orden
  causal y desempate por `at`, ítems sin `lc` primero, reset.
- `scripts/smoke-mesh-server.mjs` (19/19): + `lc` round-trip en el servidor (SQLite/memoria/Postgres).
- Regresiones: `test-mesh-core` 54/54, `smoke-mesh-federate` 6/6.

## Estado del roadmap del mega-encargo
1-4 ✅ · **5 (seguridad)**: hechas 2 de 4 piezas — ✅ revocación por autoridad de cuenta, ✅ reloj
lógico. **Restan**: emisión/renovación de tokens (endpoint de emisión + refresh + lista de
revocación de tokens), y descubrimiento automático de pares de confianza desde el registro de
identidades de la cuenta/grupo.

*Pendiente fino*: que `revokeDeviceByCert` también retire el registro de identidad del dispositivo
revocado; ordenar el feed por `lc` en el propio servidor (hoy round-trip + orden en cliente).

*Relacionado: 106-108 (identidad firmada, revocación, federación), `servidor-propio-protocolo.md`.*
