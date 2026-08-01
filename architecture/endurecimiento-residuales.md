# SOP — Adenda 122: endurecimiento de residuales (maestra rotable · rate-limit deslizante · anti-replay persistente)

> **Regla dorada:** este SOP es la fuente de verdad. Si la lógica cambia, actualiza
> primero este documento y luego el código.

Cierra los residuales documentados de las Adendas 119/121. Pasó una **revisión
adversarial** (subagente) que encontró seis puntos (H1–H6); los relevantes se
corrigieron antes de desplegar.

## 1. Rotación + auto-revocación de la clave maestra (residual de 121)

`master-identity.ts`: `signMasterRevocation` (acta auto-autenticable sobre
`{revokeMaster:mfp}` — solo el poseedor de la clave puede revocar su maestra),
`verifyMasterRevocation` (firma válida por la clave cuya huella ES `mfp`), y
`regenerateMasterKey` (firma la revocación de la actual, genera una nueva, devuelve
`{oldFp,newFp,revocation}`). El llamador debe publicar la revocación, re-certificar
dispositivos y re-fijar el ancla `account→mfp`.

- **[H2/H4] Atomicidad.** `regenerateMasterKey` exige precondiciones antes de tocar el
  almacenamiento: debe existir una maestra CARGABLE (`hasMasterKey` + carga) y firmarse
  su revocación; si no, aborta con `null`. Evita (a) acuñar-y-tirar una maestra espuria
  cuando no había ninguna, (b) pisar una raíz quizá recuperable, y (c) rotar "en
  silencio" dejando viva la vieja sin avisar a la red.
- Verificado por la revisión: no se puede revocar la maestra de otro; no hay colisión de
  dominios entre el cert de dispositivo (`{deviceFp,account,iat}`) y la revocación
  (`{revokeMaster:mfp}`); la privada vieja no queda recuperable tras rotar.

## 2. Rate-limit por ventana DESLIZANTE (residual de 119)

`docs/examples/starseed-mesh-server/index.mjs` `rateLimited`: la ventana fija (que
admitía hasta 2×RATE_MAX en el borde) se sustituye por un **token-bucket** (capacidad
RATE_MAX, recarga proporcional al tiempo). Ráfaga instantánea acotada a RATE_MAX.
**[H5]** `Math.max(0, now - b.last)`: un salto del reloj hacia atrás no drena tokens
(falla hacia MÁS restrictivo, nunca bypass). Poda del Map acotada (inactivos + tope duro).

## 3. Anti-replay PERSISTENTE e id-aware (residual de 119)

`replay-guard.ts`: el mapa `nonce→{ts,id}` se **persiste** en safe-storage (hidrata al
cargar, escritura throttled), así una reinyección no sobrevive a una recarga.

- **[H3] id-aware (clave del arreglo).** La guarda ahora ata el nonce al **id del ítem**.
  Un nonce repetido con el **mismo id** es una re-entrega legítima (realtime+sondeo, o una
  recarga que re-baja el feed) → se acepta y `verified` NO se degrada. Con un id
  **distinto** es reinyección → se rechaza. Sin esto, la persistencia degradaba a
  `verified:false` los posts legítimos re-bajados tras recargar (porque el dedup por id de
  `synaptic` es solo memoria y arranca vacío). El `id` se pasa desde los 4 consumidores de
  `unwrapFresh` (`server-relay.ts`).
- **[H1] Poda por EDAD.** Se desalojan primero los nonces ya fuera de ventana; el tope
  duro desaloja el de `ts` más antiguo. Nunca se desaloja un nonce aún dentro de ventana
  (antes, la poda por orden de inserción podía reabrir el replay bajo carga).
- **[H6, residual]** El throttle de escritura (3 s) deja una ventana mínima: un nonce de
  los últimos segundos antes de una recarga sin flush podría no persistirse. Mejora
  futura: flush en `pagehide`/`visibilitychange`.

## Verificación

`test-mesh-core.ts` **89/89** (anti-replay id-aware: mismo id = re-entrega, distinto id =
replay; rotación/revocación de maestra) · `smoke-mesh-server.mjs` **40/40** (token-bucket)
· `smoke-mesh-federate.mjs` **10/10** · `tsc` limpio · `next build` **104/104**.
