-- ════════════════════════════════════════════════════════════════════════════
-- Adenda 128 — `kind='device-cert-revocation'` permitido en os_mesh_relay.
-- ----------------------------------------------------------------------------
-- La CRL de certificados de dispositivo (src/ai/astraura/mesh/device-revocation.ts)
-- publica filas `kind:"device-cert-revocation"` (revocación EXPLÍCITA de un cert de
-- dispositivo concreto, sin tocar la identidad soberana). La restricción vigente
-- (20260801120000_mesh_relay_identity_kinds.sql) NO incluía ese valor, así que el
-- INSERT lo RECHAZABA en la base de datos y —como el cliente degradaba en SILENCIO—
-- la CRL quedaba INERTE sin aviso: EXACTAMENTE el patrón del incidente de la Adenda
-- 123 (un `kind` no permitido dejaba toda una capa muerta). Lo detectó la revisión
-- adversarial de la Adenda 128. Esta migración amplía el CHECK (aditiva, idempotente;
-- solo AÑADE un valor permitido, no borra datos). Además, publishDeviceCertRevocation
-- ahora AVISA (console.warn) si el INSERT falla, para que un olvido así no vuelva a ser
-- invisible.
--
-- APLICAR en el proyecto del OS (nxstilnyidvkqeosofuh) vía la Management API. El .sql
-- es la fuente de verdad.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.os_mesh_relay drop constraint if exists os_mesh_relay_kind_check;

alter table public.os_mesh_relay
  add constraint os_mesh_relay_kind_check
  check (kind in ('data', 'beacon', 'identity', 'revocation', 'revocation-cert', 'device-cert-revocation'));

-- La CRL lee por `kind='device-cert-revocation'` ordenando por created_at desc; se
-- incluye en el índice parcial de identidad/revocación para lecturas eficientes. No se
-- puede ALTERAR el predicado de un índice parcial → se recrea (drop + create), rápido
-- en esta tabla acotada por TTL.
drop index if exists os_mesh_relay_identity_idx;
create index if not exists os_mesh_relay_identity_idx
  on public.os_mesh_relay (kind, created_at desc)
  where kind in ('identity', 'revocation', 'revocation-cert', 'device-cert-revocation');
