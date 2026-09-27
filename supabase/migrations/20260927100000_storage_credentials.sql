-- ════════════════════════════════════════════════════════════════════════════
-- Ola 374 — `storage_credentials`: custodia en servidor de la conexión con
-- Google Drive (y futuros proveedores de almacenamiento externo) por cuenta.
-- ----------------------------------------------------------------------------
-- Antes (Adendas 194-198) el `refresh_token` de Google Drive vivía en
-- localStorage del NAVEGADOR (`starseed.almacenamiento.tokens.v1`): por
-- dispositivo/origen, nunca compartido entre neuronas de la misma cuenta, y
-- expuesto a cualquier XSS de esa pestaña. Esta tabla mueve la custodia al
-- SERVIDOR: una fila por (usuario, proveedor) con el refresh token SIEMPRE
-- cifrado (AES-256-GCM, clave derivada de `SUPABASE_SERVICE_ROLE_KEY` — ver
-- `src/lib/storage/credenciales-servidor.ts`), nunca en claro en la base.
--
-- RLS: ENABLED y SIN POLÍTICAS — deny-by-default total. Ni `anon` ni
-- `authenticated` pueden leer/escribir esta tabla desde el navegador (a
-- diferencia de `astraura_state`, aquí ni siquiera hay SELECT propio): solo
-- las rutas de servidor con la clave `service_role` (que bypasea RLS) tocan
-- estas filas, y esas rutas ya exigen sesión Supabase válida antes de leer o
-- escribir la fila del usuario que hace la petición.
--
-- Idempotente: `if not exists` + `drop policy if exists`. Sin cambios de datos.
-- Aplicar por Management API (como `astraura_state`, Adenda 153) y registrar en
-- `supabase_migrations.schema_migrations`.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.storage_credentials (
  user_id uuid not null references auth.users(id) on delete cascade,
  proveedor text not null check (proveedor in ('google-drive')),
  cuenta_email text,
  -- Refresh token SIEMPRE cifrado (AES-256-GCM · ver credenciales-servidor.ts).
  -- NUNCA se guarda en claro; el nombre de la columna lo dice a propósito.
  refresh_cifrado text not null,
  alcance text,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now(),
  primary key (user_id, proveedor)
);

alter table public.storage_credentials add column if not exists cuenta_email text;
alter table public.storage_credentials add column if not exists alcance text;
alter table public.storage_credentials add column if not exists creado timestamptz not null default now();
alter table public.storage_credentials add column if not exists actualizado timestamptz not null default now();

create index if not exists storage_credentials_user_idx on public.storage_credentials (user_id);

alter table public.storage_credentials enable row level security;

-- Deny-by-default TOTAL: ninguna política para anon/authenticated. Solo
-- `service_role` (que bypasea RLS) puede leer o escribir, y solo desde rutas
-- de servidor que ya exigieron sesión Supabase antes de tocar esta tabla.
drop policy if exists storage_credentials_select_own on public.storage_credentials;
drop policy if exists storage_credentials_insert_own on public.storage_credentials;
drop policy if exists storage_credentials_update_own on public.storage_credentials;
drop policy if exists storage_credentials_delete_own on public.storage_credentials;

revoke all on public.storage_credentials from anon;
revoke all on public.storage_credentials from authenticated;

comment on table public.storage_credentials is
  'Custodia en servidor de la conexión con almacenamientos externos por cuenta (hoy: Google Drive). refresh_cifrado SIEMPRE cifrado (AES-256-GCM); RLS deny-by-default, solo service_role desde rutas de servidor con sesión verificada. Ola 374.';
comment on column public.storage_credentials.refresh_cifrado is
  'Refresh token cifrado con AES-256-GCM (clave derivada por HKDF-SHA256 de SUPABASE_SERVICE_ROLE_KEY). Nunca en claro. Ver src/lib/storage/credenciales-servidor.ts.';

-- Verificación sugerida:
--   select relname, relrowsecurity from pg_class where relname = 'storage_credentials';
--   select policyname from pg_policies where tablename = 'storage_credentials'; -- debe venir VACÍO
