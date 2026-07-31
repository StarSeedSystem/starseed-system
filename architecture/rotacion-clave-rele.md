# SOP — Adenda 120: rotación de la clave del relé (llavero por kid)

> **Regla dorada:** este SOP es la fuente de verdad. Si la lógica cambia, actualiza
> primero este documento y luego el código.

Primera sub-ola de **identidad soberana** (roadmap #mesh6). Pasó una **revisión
adversarial** (subagente) que encontró un bug bloqueante corregido antes de desplegar.

## Qué cambia

`src/ai/astraura/mesh/relay-crypto.ts`: la clave AES-GCM 256 de cuenta pasa de ser
**única** a un **LLAVERO** `{keys:[{kid,raw}], cur}` (localStorage `starseed.mesh.relay-keyring.v1`):

- Se cifra con la clave **ACTUAL** (`cur`); las **previas** se conservan solo para
  descifrar (gracia). El sobre es **v:2** con `kid`.
- `rotateRelayKey()` genera una clave nueva, la fija como actual y conserva las previas
  (poda a `MAX_RING=32`). Tras rotar hay que **re-vincular** las otras neuronas para que
  lean lo NUEVO; la clave previa sigue leyendo lo viejo.
- `decryptEnvelope`: prueba la clave del `kid` como PISTA y **siempre cae al resto del
  llavero** (ver §bug). Acepta v:1 legado (sin kid) por el mismo fallback.
- Migración automática de la clave legada única (`starseed.mesh.relay-key.v1`) → `k1`.
- `importRelayKeyB64` añade la clave y la fija como actual (dedup por raw);
  `exportRelayKeyB64` exporta la actual; `getOrCreateRelayKey`/`hasRelayKey` compat;
  `relayKeyInfo()` para la UI. Exportadas por el barrel `mesh/index.ts`.

## Bug corregido en la revisión (bloqueante)

Los `kid` son un **contador LOCAL por neurona**: la misma clave importada en otra
neurona recibe un kid distinto. El sobre estampa el kid del emisor, que en el receptor
puede señalar un **slot distinto** (clave equivocada). El diseño inicial hacía que, si el
kid coincidía localmente con otra clave, el fast-path la usara y **saltara el fallback** →
el tag GCM fallaba y el contenido quedaba "cifrado (sin clave)" pese a tener la clave
correcta en otro slot. Rompía el relé entre neuronas vinculadas (flujo central).

**Fix:** el `kid` es solo una PISTA (se prueba primero por rendimiento); `decryptEnvelope`
**siempre** prueba luego el resto del llavero (dedup). El tag GCM de 128 bits evita falsos
positivos, así que probar varias claves es seguro. Regresión cubierta por un test de
"kid desalineado entre neuronas" en `test-mesh-core.ts`.

## Residuales documentados (futuro)

- **Presupuesto del llavero (MEDIA→mitigado):** `MAX_RING=32` mezcla rotaciones propias e
  imports de pares; se sube desde 8 y, como el contenido del relé **caduca a 24 h**, rara
  vez se necesitan tantas claves a la vez. Mejora futura: presupuestos separados o LRU por
  "último descifrado con éxito", o kid derivado del hash de la clave (global entre
  dispositivos → el fast-path acierta siempre y reduce la señal de "época de clave").
- **Reconstrucción tras corrupción del ring (BAJA):** el espejo legado solo guarda la clave
  actual; si el JSON del ring se corrompe, se pierden las previas. Mitiga: respaldo del ring.
- **Reintento de filas "locked" (BAJA):** una fila indescifrable se reintenta cada sondeo;
  en el buzón de relé propio (RLS por cuenta) esto es ~0. Mejora futura: caché de ids locked.
- **Metadato de época (BAJA):** el kid en claro permite agrupar por época de clave (inherente
  a rotar). No filtra material de clave.

## Verificación

`test-mesh-core.ts` **68/68** (+7: rotación, gracia de descifrado, sobre v:2, kid desalineado)
· `tsc` limpio · `next build` **104/104**.
