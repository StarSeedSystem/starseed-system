-- ═════════════════════════════════════════════════════════════════════════════
-- Astraura Bots · Bots de Astraura (2026-10-11) · SIN APLICAR
-- ───────────────────────────────────────────────────────────────────────────
-- Contrato: architecture/astraura-bots.md
-- Qué guarda: los bots de Astraura, sus consentimientos y su registro de acciones.
-- ───────────────────────────────────────────────────────────────────────────

-- ───────────────────────── astraura_bots ─────────────────────────

CREATE TABLE IF NOT EXISTS public.astraura_bots (
  id          text PRIMARY KEY,
  dueno_tipo  text NOT NULL CHECK (dueno_tipo IN ('perfil','grupo','comunidad','pagina')),
  dueno_id    text NOT NULL,
  cuenta_id   uuid NOT NULL REFERENCES auth.users(id),
  gobierno    text NOT NULL CHECK (gobierno IN ('jerarquico','democratico')) DEFAULT 'jerarquico',
  activo      boolean NOT NULL DEFAULT true,
  datos       jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_en   timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

-- ───────────────────────── astraura_bots_consentimientos ─────────────────────────

CREATE TABLE IF NOT EXISTS public.astraura_bots_consentimientos (
  bot_id      text NOT NULL,
  cuenta_id   uuid NOT NULL DEFAULT auth.uid(),
  sentido     text NOT NULL,
  vence       timestamptz,
  expreso     boolean NOT NULL DEFAULT false,
  PRIMARY KEY (bot_id, cuenta_id, sentido)
);

-- ───────────────────────── astraura_bots_registro ─────────────────────────

CREATE TABLE IF NOT EXISTS public.astraura_bots_registro (
  id          bigserial PRIMARY KEY,
  bot_id      text NOT NULL,
  "at"        timestamptz NOT NULL DEFAULT now(),
  quien       text NOT NULL,
  tipo        text NOT NULL,
  accion      text,
  motivo      text,
  deshacer    jsonb
);

-- ───────────────────────── índices ─────────────────────────

CREATE INDEX IF NOT EXISTS astraura_bots_dueno_idx ON public.astraura_bots (dueno_tipo, dueno_id);
CREATE INDEX IF NOT EXISTS astraura_bots_registro_idx ON public.astraura_bots_registro (bot_id, "at" DESC);

-- ───────────────────────── publicación en tiempo real ─────────────────────────

-- Añade la tabla de bots a la publicación supabase_realtime de forma idempotente
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'astraura_bots'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.astraura_bots;
  END IF;
END $$;

-- ───────────────────────── funciones de pertenencia y administración ─────────────────────────

-- Miembro ACTIVO de la entidad: misma consulta que os_memberships y os_entity_roles (filas pending excluidas)
create or replace function public.astraura_bot_es_miembro(_entidad_ref text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select _entidad_ref is not null and auth.uid() is not null and exists (
    select 1 from public.os_memberships m
    where m.group_slug = _entidad_ref
      and m.user_id = auth.uid()
      and lower(m.role) not in ('pending')
    union all
    select 1 from public.os_entity_roles r
    where r.entity_id::text = _entidad_ref
      and r.account_id = auth.uid()
      and lower(r.role) not in ('pending')
  );
$$;

-- Quién puede ADMINISTRAR una entidad (owner/admin/editor) - misma consulta que la parte de entidad de os_estacion_puede_escribir
create or replace function public.astraura_bot_puede_administrar(_entidad_ref text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and _entidad_ref is not null and exists (
    select 1 from public.os_memberships m
    where m.group_slug = _entidad_ref
      and m.user_id = auth.uid()
      and lower(m.role) in ('owner','admin','editor')
    union all
    select 1 from public.os_entity_roles r
    where r.entity_id::text = _entidad_ref
      and r.account_id = auth.uid()
      and lower(r.role) in ('owner','admin','editor')
  );
$$;

-- ───────────────────────── RLS y permisos ─────────────────────────

-- Enable RLS on the tables
alter table public.astraura_bots enable row level security;
alter table public.astraura_bots_consentimientos enable row level security;
alter table public.astraura_bots_registro enable row level security;

-- Tabla astraura_bots
drop policy if exists astraura_bots_select on public.astraura_bots;
create policy astraura_bots_select
  on public.astraura_bots for select
  to authenticated
  using (
    (dueno_tipo = 'perfil' and cuenta_id = auth.uid())
    or (dueno_tipo in ('grupo','comunidad','pagina') and public.astraura_bot_es_miembro(dueno_id))
  );

drop policy if exists astraura_bots_insert on public.astraura_bots;
create policy astraura_bots_insert
  on public.astraura_bots for insert
  to authenticated
  with check (
    (dueno_tipo = 'perfil' and cuenta_id = auth.uid())
    or (dueno_tipo in ('grupo','comunidad','pagina') and public.astraura_bot_puede_administrar(dueno_id))
  );

drop policy if exists astraura_bots_update on public.astraura_bots;
create policy astraura_bots_update
  on public.astraura_bots for update
  to authenticated
  using (
    (dueno_tipo = 'perfil' and cuenta_id = auth.uid())
    or (dueno_tipo in ('grupo','comunidad','pagina') and public.astraura_bot_puede_administrar(dueno_id))
  )
  with check (
    (dueno_tipo = 'perfil' and cuenta_id = auth.uid())
    or (dueno_tipo in ('grupo','comunidad','pagina') and public.astraura_bot_puede_administrar(dueno_id))
  );

drop policy if exists astraura_bots_delete on public.astraura_bots;
create policy astraura_bots_delete
  on public.astraura_bots for delete
  to authenticated
  using (
    (dueno_tipo = 'perfil' and cuenta_id = auth.uid())
    or (dueno_tipo in ('grupo','comunidad','pagina') and public.astraura_bot_puede_administrar(dueno_id))
  );

-- Tabla astraura_bots_consentimientos
drop policy if exists astraura_bots_consentimientos_select on public.astraura_bots_consentimientos;
create policy astraura_bots_consentimientos_select
  on public.astraura_bots_consentimientos for select
  to authenticated
  using (cuenta_id = auth.uid());

drop policy if exists astraura_bots_consentimientos_insert on public.astraura_bots_consentimientos;
create policy astraura_bots_consentimientos_insert
  on public.astraura_bots_consentimientos for insert
  to authenticated
  with check (cuenta_id = auth.uid());

drop policy if exists astraura_bots_consentimientos_update on public.astraura_bots_consentimientos;
create policy astraura_bots_consentimientos_update
  on public.astraura_bots_consentimientos for update
  to authenticated
  using (cuenta_id = auth.uid())
  with check (cuenta_id = auth.uid());

drop policy if exists astraura_bots_consentimientos_delete on public.astraura_bots_consentimientos;
create policy astraura_bots_consentimientos_delete
  on public.astraura_bots_consentimientos for delete
  to authenticated
  using (cuenta_id = auth.uid());

-- Tabla astraura_bots_registro
drop policy if exists astraura_bots_registro_select on public.astraura_bots_registro;
create policy astraura_bots_registro_select
  on public.astraura_bots_registro for select
  to authenticated
  using (
    (dueno_tipo = 'perfil' and cuenta_id = auth.uid())
    or (dueno_tipo in ('grupo','comunidad','pagina') and public.astraura_bot_puede_administrar(dueno_id))
  );

-- SOLO inserción: sin update ni delete por RLS
drop policy if exists astraura_bots_registro_insert on public.astraura_bots_registro;
create policy astraura_bots_registro_insert
  on public.astraura_bots_registro for insert
  to authenticated
  with check (
    (dueno_tipo = 'perfil' and cuenta_id = auth.uid())
    or (dueno_tipo in ('grupo','comunidad','pagina') and public.astraura_bot_puede_administrar(dueno_id))
  );

-- No se permiten update ni delete: se crean políticas que niegan todo
drop policy if exists astraura_bots_registro_update on public.astraura_bots_registro;
create policy astraura_bots_registro_update
  on public.astraura_bots_registro for update
  to authenticated
  using (false)
  with check (false);

drop policy if exists astraura_bots_registro_delete on public.astraura_bots_registro;
create policy astraura_bots_registro_delete
  on public.astraura_bots_registro for delete
  to authenticated
  using (false)
  with check (false);

