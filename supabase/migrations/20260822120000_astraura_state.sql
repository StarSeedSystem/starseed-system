-- ════════════════════════════════════════════════════════════════════════════
-- Adenda 153 — `astraura_state`: estado sincronizado del backend Astraura 1.58-bit
-- ----------------------------------------------------------------------------
-- Base del OS (`nxstilnyidvkqeosofuh`) — NO el de Nexus/Café.
--
-- Causa raíz: el backend soberano `StarSeedSystem/astraura` (`backend/app/core/
-- supabase_sync.py`) ya usa esta tabla como «nervio central» (cerebros, mem0,
-- grafo, vectores, notificaciones, enjambre, reglas de almacenamiento), creada a
-- mano y sin migración en este repo. Aquí se FORMALIZA con RLS:
--   · el backend escribe con la clave `service_role` (bypasea RLS) → sigue igual;
--   · `anon`/`authenticated` NO tienen política alguna → nadie más la lee ni la
--     escribe desde el navegador (contiene memoria personal del dueño).
-- Idempotente: `if not exists` + `drop policy if exists`. Sin cambios de datos.
-- Aplicar por Management API (el MCP de Supabase no tiene acceso a este proyecto)
-- y registrar en `supabase_migrations.schema_migrations` como las anteriores.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.astraura_state (
  key text primary key,
  data jsonb not null default '{}'::jsonb,
  -- Dueño opcional: hoy el backend es de un solo usuario (service role). Cuando
  -- el backend sepa de cuentas, rellenará esta columna y podrá abrirse RLS por dueño.
  owner_id uuid references auth.users(id) on delete cascade,
  updated_at timestamptz not null default now()
);

alter table public.astraura_state add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table public.astraura_state add column if not exists updated_at timestamptz not null default now();

create index if not exists astraura_state_owner_idx on public.astraura_state (owner_id);
create index if not exists astraura_state_updated_idx on public.astraura_state (updated_at desc);

alter table public.astraura_state enable row level security;

-- Sin políticas para anon/authenticated (deny-by-default). Solo service_role.
drop policy if exists astraura_state_select_own on public.astraura_state;
drop policy if exists astraura_state_insert_own on public.astraura_state;
drop policy if exists astraura_state_update_own on public.astraura_state;
drop policy if exists astraura_state_delete_own on public.astraura_state;

-- Futuro (cuando el backend escriba owner_id): políticas por dueño, listas pero
-- acotadas a filas con dueño explícito. Las filas legacy (owner_id null) siguen
-- siendo invisibles para el navegador.
create policy astraura_state_select_own on public.astraura_state
  for select using (owner_id is not null and owner_id = auth.uid());

revoke all on public.astraura_state from anon;
grant select on public.astraura_state to authenticated;

comment on table public.astraura_state is
  'Estado sincronizado del backend Astraura 1.58-bit (clave → JSON). Escribe el backend con service_role; RLS deny-by-default. Adenda 153.';

-- Verificación sugerida:
--   select relname, relrowsecurity from pg_class where relname = 'astraura_state';
--   select policyname from pg_policies where tablename = 'astraura_state';
