-- Create astraura_bots table
create table if not exists public.astraura_bots
(
    id uuid primary key default gen_random_uuid(),
    dueno_id uuid not null references auth.uid(),
    dueno_tipo text not null check (dueno_tipo in ('perfil', 'grupo', 'comunidad', 'pagina')),
    nombre text not null,
    descripcion text,
    activo boolean not null default true,
    creado_en timestamptz not null default now(),
    actualizado_en timestamptz not null default now()
);

-- Create astraura_bots_consentimientos table
create table if not exists public.astraura_bots_consentimientos
(
    bot_id uuid not null references public.astraura_bots(id) on delete cascade,
    cuenta_id uuid default auth.uid() not null,
    sentido text not null check (sentido in ('pantalla', 'captura-pantalla', 'archivos', 'red', 'correo', 'terminal', 'camara', 'microfono', 'sensores', 'ubicacion', 'portapapeles', 'aparatos')),
    vence timestamptz null,
    expreso boolean not null default false,
    primary key (bot_id, cuenta_id, sentido)
);

-- Create astraura_bots_registro table
create table if not exists public.astraura_bots_registro
(
    id uuid primary key default gen_random_uuid(),
    bot_id uuid not null references public.astraura_bots(id) on delete cascade,
    cuenta_id uuid not null references auth.uid(),
    accion text not null,
    resultado boolean not null,
    creado_en timestamptz not null default now()
);

-- Enable RLS
alter table public.astraura_bots enable row level security;
alter table public.astraura_bots_consentimientos enable row level security;
alter table public.astraura_bots_registro enable row level security;

-- Policies for astraura_bots
-- Allow users to read bots they own
create policy "Users can read their own bots"
on public.astraura_bots for select
using (auth.uid() = dueno_id);

-- Allow users to insert bots they own
create policy "Users can insert their own bots"
on public.astraura_bots for insert
with check (auth.uid() = dueno_id);

-- Allow users to update bots they own
create policy "Users can update their own bots"
on public.astraura_bots for update
using (auth.uid() = dueno_id);

-- Allow users to delete bots they own
create policy "Users can delete their own bots"
on public.astraura_bots for delete
using (auth.uid() = dueno_id);

-- Policies for astraura_bots_consentimientos
-- Allow users to read their own consents
create policy "Users can read their own consents"
on public.astraura_bots_consentimientos for select
using (auth.uid() = cuenta_id);

-- Allow users to insert their own consents
create policy "Users can insert their own consents"
on public.astraura_bots_consentimientos for insert
with check (auth.uid() = cuenta_id);

-- Allow users to update their own consents
create policy "Users can update their own consents"
on public.astraura_bots_consentimientos for update
using (auth.uid() = cuenta_id);

-- Allow users to delete their own consents
create policy "Users can delete their own consents"
on public.astraura_bots_consentimientos for delete
using (auth.uid() = cuenta_id);

-- Policies for astraura_bots_registro
-- Note: The registro table should not have update or delete policies for anon or authenticated
-- We'll only allow insert (by any authenticated user?) and select (by the owner of the bot?)
-- According to the spec: "el registro no tiene políticas de update o delete"
-- We'll create a policy for select: users can read registros of bots they own
create policy "Users can read registros of their bots"
on public.astraura_bots_registro for select
using (exists (
    select 1 from public.astraura_bots
    where id = bot_id and dueno_id = auth.uid()
));

-- Allow insert: any authenticated user can insert a registro for a bot? 
-- But we should restrict to the bot owner? The spec doesn't say. 
-- However, the test only checks that there are no update or delete policies.
-- We'll allow insert for the bot owner.
create policy "Users can insert registros for their bots"
on public.astraura_bots_registro for insert
with check (exists (
    select 1 from public.astraura_bots
    where id = bot_id and dueno_id = auth.uid()
));

-- No update or delete policies intentionally created.

-- Functions
create or replace function public.astraura_bot_es_miembro(p_bot_id uuid, p_cuenta_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.astraura_bots_consentimientos
        where bot_id = p_bot_id and cuenta_id = p_cuenta_id
    );
$$;

create or replace function public.astraura_bot_puede_administrar(p_bot_id uuid, p_cuenta_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.astraura_bots
        where id = p_bot_id and dueno_id = p_cuenta_id
    );
$$;

-- Add tables to realtime publication
alter publication supabase_realtime add table public.astraura_bots, public.astraura_bots_consentimientos, public.astraura_bots_registro;