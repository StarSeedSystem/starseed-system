-- ════════════════════════════════════════════════════════════════════════════
-- Adenda 123 — CORRECCIÓN CRÍTICA: `kind` permitidos en os_mesh_relay.
-- ----------------------------------------------------------------------------
-- La migración 20260728090000_mesh_relay_synaptic.sql restringía:
--     kind ... check (kind in ('data','beacon'))
-- Eso RECHAZA en la base de datos todo insert de `kind` = 'identity' / 'revocation'
-- / 'revocation-cert', que el cliente (mesh/server-relay.ts) publica para la
-- identidad firmada, la revocación y el certificado de revocación (Adendas 106-122).
-- Como el cliente hace `if (error) return` (degradación silenciosa), la escritura
-- fallaba SIN AVISO → `refreshIdentities` leía 0 filas → `boundAccountFor()` devolvía
-- siempre null y la revocación no se publicaba: TODA la capa de identidad quedaba
-- INERTE en producción. Esta migración la reactiva.
--
-- APLICAR con las migraciones del proyecto del OS (nxstilnyidvkqeosofuh). Es
-- idempotente y aditiva (solo AMPLÍA los valores permitidos; no borra datos).
-- ════════════════════════════════════════════════════════════════════════════

alter table public.os_mesh_relay drop constraint if exists os_mesh_relay_kind_check;

alter table public.os_mesh_relay
  add constraint os_mesh_relay_kind_check
  check (kind in ('data', 'beacon', 'identity', 'revocation', 'revocation-cert'));

-- Lecturas de identidad/revocación (refreshIdentities/refreshRevocations + certs):
-- índice parcial por esos `kind`, del más reciente al más viejo.
create index if not exists os_mesh_relay_identity_idx
  on public.os_mesh_relay (kind, created_at desc)
  where kind in ('identity', 'revocation', 'revocation-cert');
