-- Astraura bots migration
-- Tables: astraura_bots, astraura_bots_consentimientos, astraura_bots_registro
-- RLS policies and functions for entity bots
-- Add to supabase_realtime publication

-- Table: astraura_bots
create table if not exists public.astraura_bots (
    id text primary key,
    dueno_tipo text not null check (dueno_tipo in ('perfil', 'grupo', 'comunidad', 'pagina')),
    dueno_id text not null,
    cuenta_id uuid not null references auth.users(id) on delete cascade,
    gobierno text not null default 'jerarquico' check (gobierno in ('jerarquico', 'democratico')),
    activo boolean not null default true,
    datos jsonb not null default '{}',
    creado timestamptz not null default now(),
    actualizado timestamptz not null default now()
);

-- Table: astraura_bots_consentimientos
create table if not exists public.astraura_bots_consentimientos (
    bot_id text not null references public.astraura_bots(id) on delete cascade,
    cuenta_id uuid not null default auth.uid(),
    sentido text not null check (sentido in ('pantalla', 'captura-pantalla', 'archivos', 'red', 'correo', 'terminal', 'camara', 'microfono', 'sensores', 'ubicacion', 'portapapeles', 'aparatos')),
    vence timestamptz null,
    expreso boolean not null default false,
    primary key (bot_id, cuenta_id, sentido)
);

-- Table: astraura_bots_registro
create table if not exists public.astraura_bots_registro (
    id bigserial primary key,
    bot_id text not null references public.astraura_bots(id) on delete cascade,
    at timestamptz not null default now(),
    quien text not null,
    tipo text not null,
    accion text null,
    motivo text not null,
    deshacer jsonb null
);

-- Enable Row Level Security
alter table public.astraura_bots enable row level security;
alter table public.astraura_bots_consentimientos enable row level security;
alter table public.astraura_bots_registro enable row level security;

-- Function: astraura_bot_es_miembro
-- Similar to os_estacion_es_mipero but for astraura bots
create or replace function public.astraura_bot_es_miembro(_entidad_ref text)
returns boolean
language sql
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.os_memberships m
        join public.os_entity_roles r on m.id = r.membership_id
        where m.account_id = auth.uid()
          and (m.entity_id = _entidad_ref or m.entity_alias = _entidad_ref)
          and r.role in ('owner', 'admin', 'member')
          and m.status = 'active'
    );
$$;

-- Function: astraura_bot_puede_administrar
-- Similar to os_estacion_puede_escribir
create or replace function public.astraura_bot_puede_administrar(_entidad_ref text)
returns boolean
language sql
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.os_memberships m
        join public.os_entity_roles r on m.id = r.membership_id
        where m.account_id = auth.uid()
          and (m.entity_id = _entidad_ref or m.entity_alias = _entidad_ref)
          and r.role in ('owner', 'admin')
          and m.status = 'active'
    );
$$;

-- RLS Policies for astraura_bots
-- Profile bots: only the owner can see and edit their own bots
create policy "astraura_bots_profile_select"
on public.astraura_bots for select
using (
    dueno_tipo = 'perfil' and cuenta_id = auth.uid()
);

create policy "astraura_bots_profile_insert"
on public.astraura_bots for insert
with check (
    dueno_tipo = 'perfil' and cuenta_id = auth.uid()
);

create policy "astraura_bots_profile_update"
on public.astraura_bots for update
using (
    dueno_tipo = 'perfil' and cuenta_id = auth.uid()
);

create policy "astraura_bots_profile_delete"
on public.astraura_bots for delete
using (
    dueno_tipo = 'perfil' and cuenta_id = auth.uid()
);

-- Entity bots: visible to active members, editable by owners/admins
create policy "astraura_bots_entity_select"
on public.astraura_bots for select
using (
    dueno_tipo in ('grupo', 'comunidad', 'pagina') and
    astraura_bot_es_miembro(dueno_id)
);

create policy "astraura_bots_entity_insert"
on public.astraura_bots for insert
with check (
    dueno_tipo in ('grupo', 'comunidad', 'pagina') and
    astraura_bot_puede_administrar(dueno_id)
);

create policy "astraura_bots_entity_update"
on public.astraura_bots for update
using (
    dueno_tipo in ('grupo', 'comunidad', 'pagina') and
    astraura_bot_puede_administrar(dueno_id)
);

create policy "astraura_bots_entity_delete"
on public.astraura_bots for delete
using (
    dueno_tipo in ('grupo', 'comunidad', 'pagina') and
    astraura_bot_puede_administrar(dueno_id)
);

-- RLS Policies for astraura_bots_consentimientos
-- Users can only see and edit their own consents
create policy "astraura_bots_consentimientos_select"
on public.astraura_bots_consentimientos for select
using (cuenta_id = auth.uid());

create policy "astraura_bots_consentimientos_insert"
on public.astraura_bots_consentimientos for insert
with check (cuenta_id = auth.uid());

create policy "astraura_bots_consentimientos_update"
on public.astraura_bots_consentimientos for update
using (cuenta_id = auth.uid());

create policy "astraura_bots_consentimientos_delete"
on public.astraura_bots_consentimientos for delete
using (cuenta_id = auth.uid());

-- RLS Policies for astraura_bots_registro
-- Only insert allowed (no update/delete)
-- Entity bots: readable by active members, insertable by owners/admins
-- Profile bots: readable and insertable only by the owner

-- Select policy for registro
create policy "astraura_bots_registro_select"
on public.astraura_bots_registro for select
using (
    (
        dueno_tipo = 'perfil' and
        exists (
            select 1 from public.astraura_bots b
            where b.id = bot_id and b.cuenta_id = auth.uid()
        )
    ) or (
        dueno_tipo in ('grupo', 'comunidad', 'pagina') and
        astraura_bot_es_miembro(dueno_id)
    )
);

-- Insert policy for registro
create policy "astraura_bots_registro_insert"
on public.astraura_bots_registro for insert
with check (
    (
        dueno_tipo = 'perfil' and
        exists (
            select 1 from public.astraura_bots b
            where b.id = bot_id and b.cuenta_id = auth.uid()
        )
    ) or (
        dueno_tipo in ('grupo', 'comunidad', 'pagina') and
        astraura_bot_puede_administrar(dueno_id)
    )
);

-- No update or delete policies (only insert allowed)

-- Add tables to supabase_realtime publication (idempotent)
do $$
begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and tablename = 'astraura_bots'
    ) then
        alter publication supabase_realtime add table astraura_bots;
    end if;
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and tablename = 'astraura_bots_consentimientos'
    ) then
        alter publication supabase_realtime add table astraura_bots_consentimientos;
    end if;
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and tablename = 'astraura_bots_registro'
    ) then
        alter publication supabase_realtime add table astraura_bots_registro;
    end if;
end $$;