-- ════════════════════════════════════════════════════════════════════════════
-- Ola BOT1011B · Migración de bots de Astraura (NO APLICADA — solo escrita)
-- Contrato: architecture/astraura-bots.md (§0-§15)
-- Fuente de verdad del área; el núcleo puro (`tipos`, `permisos`, `personalidad-adaptable`,
-- `acciones`, `reparto-de-modelo`, `bucle`) NO se modifica.
-- ════════════════════════════════════════════════════════════════════════════

-- Tabla principal: un bot por perfil / grupo / comunidad / página.
create table if not exists public.astraura_bots (
  id text primary key,
  dueno_tipo text not null check (dueno_tipo in ('perfil','grupo','comunidad','pagina')),
  dueno_id text not null,
  cuenta_id uuid references auth.users(id) on delete cascade,
  gobierno text not null check (gobierno in ('jerarquico','democratico')) default 'jerarquico',
  activo boolean not null default true,
  datos jsonb not null default '{}'::jsonb,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);

-- Índices por (dueño) y (bot + tiempo) para consultas de lista y registro.
create index if not exists astraura_bots_dueno_idx on public.astraura_bots (dueno_tipo, dueno_id);
create index if not exists astraura_bots_activo_creado_idx on public.astraura_bots (activo, creado desc);

-- ── Consentimientos por persona: cada cuenta solo ve/escribe los suyos. ────
create table if not exists public.astraura_bots_consentimientos (
  bot_id text not null references public.astraura_bots(id) on delete cascade,
  cuenta_id uuid default auth.uid() references auth.users(id) on delete cascade,
  sentido text not null check (sentido in (
    'pantalla','captura-pantalla','archivos','red','correo','terminal',
    'camara','microfono','sensores','ubicacion','portapapeles','aparatos'
  )),
  vence timestamptz null,
  expreso boolean not null default false,
  primary key (bot_id, cuenta_id, sentido)
);

create index if not exists astraura_bots_consent_bot_at on public.astraura_bots_consentimientos (bot_id, cuenta_id);

-- ── Registro (solo inserción): quién, cuándo, qué, motivo, deshacer. ───────
create table if not exists public.astraura_bots_registro (
  id bigserial primary key,
  bot_id text not null references public.astraura_bots(id) on delete cascade,
  at timestamptz not null default now(),
  quien text not null,
  tipo text not null,
  accion text null,
  motivo text null,
  deshacer jsonb null
);

create index if not exists astraura_bots_registro_bot_at on public.astraura_bots_registro (bot_id, at desc);

-- ── Funciones de pertenencia a entidad (security definer, search_path = public) ─
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

create or replace function public.astraura_bot_puede_administrar(
  _entidad_ref text, _cuenta_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and _cuenta_id = auth.uid() and (
    exists (
      select 1 from public.os_memberships m
      where m.group_slug = _entidad_ref
        and m.user_id = auth.uid()
        and lower(m.role) in ('owner','admin')
      union all
      select 1 from public.os_entity_roles r
      where r.entity_id::text = _entidad_ref
        and r.account_id = auth.uid()
        and lower(r.role) in ('owner','admin')
    )
  );
$$;

-- ── RLS: bot de perfil → su cuenta; bot de entidad → miembros activos / owner-admin. ─
alter table public.astraura_bots enable row level security;

drop policy if exists astraura_bots_select on public.astraura_bots;
create policy astraura_bots_select on public.astraura_bots for select
  to authenticated using (
    cuenta_id = auth.uid()
    or (dueno_tipo in ('grupo','comunidad','pagina') and public.astraura_bot_es_miembro(dueno_id))
  );

drop policy if exists astraura_bots_insert on public.astraura_bots;
create policy astraura_bots_insert on public.astraura_bots for insert
  to authenticated with check (
    cuenta_id = auth.uid()
    and (
      dueno_tipo = 'perfil'
      or (dueno_tipo in ('grupo','comunidad','pagina') and public.astraura_bot_puede_administrar(dueno_id, auth.uid()))
    )
  );

drop policy if exists astraura_bots_update on public.astraura_bots;
create policy astraura_bots_update on public.astraura_bots for update
  to authenticated using (
    cuenta_id = auth.uid()
    or (dueno_tipo in ('grupo','comunidad','pagina') and public.astraura_bot_puede_administrar(dueno_id, auth.uid()))
  )
  with check (
    cuenta_id = auth.uid()
    or (dueno_tipo in ('grupo','comunidad','pagina') and public.astraura_bot_puede_administrar(dueno_id, auth.uid()))
  );

drop policy if exists astraura_bots_delete on public.astraura_bots;
create policy astraura_bots_delete on public.astraura_bots for delete
  to authenticated using (
    cuenta_id = auth.uid()
    or (dueno_tipo in ('grupo','comunidad','pagina') and public.astraura_bot_puede_administrar(dueno_id, auth.uid()))
  );

-- ── RLS consentimientos: cada cuenta solo sus propios. ────────────────────────
alter table public.astraura_bots_consentimientos enable row level security;

drop policy if exists astraura_bots_consent_select on public.astraura_bots_consentimientos;
create policy astraura_bots_consent_select on public.astraura_bots_consentimientos for select
  to authenticated using (cuenta_id = auth.uid());

drop policy if exists astraura_bots_consent_insert on public.astraura_bots_consentimientos;
create policy astraura_bots_consent_insert on public.astraura_bots_consentimientos for insert
  to authenticated with check (cuenta_id = auth.uid());

drop policy if exists astraura_bots_consent_update on public.astraura_bots_consentimientos;
create policy astraura_bots_consent_update on public.astraura_bots_consentimientos for update
  to authenticated using (cuenta_id = auth.uid()) with check (cuenta_id = auth.uid());

drop policy if exists astraura_bots_consent_delete on public.astraura_bots_consentimientos;
create policy astraura_bots_consent_delete on public.astraura_bots_consentimientos for delete
  to authenticated using (cuenta_id = auth.uid());

-- ── RLS registro: lee el dueño del bot o los admins de la entidad. SOLO inserción (sin update ni delete). ─
alter table public.astraura_bots_registro enable row level security;

drop policy if exists astraura_bots_registro_select on public.astraura_bots_registro;
create policy astraura_bots_registro_select on public.astraura_bots_registro for select
  to authenticated using (
    exists (
      select 1 from public.astraura_bots b
      where b.id = bot_id
        and (
          b.cuenta_id = auth.uid()
          or (b.dueno_tipo in ('grupo','comunidad','pagina') and public.astraura_bot_puede_administrar(b.dueno_id, auth.uid()))
        )
    )
  );

-- El registro NO tiene políticas de update ni delete por RLS (solo inserción).
create policy astraura_bots_registro_insert on public.astraura_bots_registro for insert
  to authenticated with check (true);

-- ── Añade la tabla de bots a la publicación supabase_realtime (idempotente). ─────
DO $$
DECLARE
    t text;
    tables text[] := ARRAY['astraura_bots','astraura_bots_consentimientos','astraura_bots_registro'];
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        RAISE NOTICE 'Publicación supabase_realtime no existe: no se añade ninguna tabla.';
        RETURN;
    END IF;
    FOREACH t IN ARRAY tables LOOP
        IF to_regclass('public.' || t) IS NULL THEN
            RAISE NOTICE 'Tabla public.% no existe: omitida.', t;
        ELSIF EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
        ) THEN
            RAISE NOTICE 'Tabla public.% ya está en supabase_realtime: omitida.', t;
        ELSE
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
            RAISE NOTICE 'Tabla public.% añadida a supabase_realtime.', t;
        END IF;
    END LOOP;
END $$;
