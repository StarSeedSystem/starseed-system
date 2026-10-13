-- Bots de Astraura (BOT1011B · contrato architecture/astraura-bots.md §3 y §16).
-- Aprobada por Alex el 2026-10-13 («si apruebo»). Idempotente: se puede volver a correr.
--
-- (2026-10-13, Claude) La versión que escribió el enjambre no se podía aplicar: `references auth.uid()`
-- no es una tabla (error de sintaxis), el dueño de un bot de grupo/comunidad/página no es una
-- cuenta, las funciones `security definer` dejaban preguntar por cualquier cuenta y las políticas
-- no se podían volver a crear. Ahora: `cuenta_id` = la cuenta responsable (§3.1), `dueno_id` = el
-- perfil o la entidad; RLS por la cuenta responsable; las funciones solo responden sobre quien
-- pregunta; y todo es idempotente.

-- ── Tablas ──────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.astraura_bots
(
    id uuid primary key default gen_random_uuid(),
    cuenta_id uuid not null default auth.uid(),
    dueno_tipo text not null check (dueno_tipo in ('perfil', 'grupo', 'comunidad', 'pagina')),
    dueno_id uuid not null,
    nombre text not null check (char_length(nombre) between 1 and 120),
    descripcion text check (descripcion is null or char_length(descripcion) <= 2000),
    activo boolean not null default true,
    creado_en timestamptz not null default now(),
    actualizado_en timestamptz not null default now()
);
create index if not exists astraura_bots_cuenta_idx on public.astraura_bots (cuenta_id);
create index if not exists astraura_bots_dueno_idx on public.astraura_bots (dueno_tipo, dueno_id);

create table if not exists public.astraura_bots_consentimientos
(
    bot_id uuid not null references public.astraura_bots(id) on delete cascade,
    cuenta_id uuid not null default auth.uid(),
    sentido text not null check (sentido in ('pantalla', 'captura-pantalla', 'archivos', 'red', 'correo', 'terminal', 'camara', 'microfono', 'sensores', 'ubicacion', 'portapapeles', 'aparatos')),
    vence timestamptz null,
    expreso boolean not null default false,
    primary key (bot_id, cuenta_id, sentido)
);

-- El registro solo crece: sin políticas de update ni de borrado (§5: cada acción con su rastro).
create table if not exists public.astraura_bots_registro
(
    id uuid primary key default gen_random_uuid(),
    bot_id uuid not null references public.astraura_bots(id) on delete cascade,
    cuenta_id uuid not null default auth.uid(),
    accion text not null check (char_length(accion) between 1 and 200),
    resultado boolean not null,
    creado_en timestamptz not null default now()
);
create index if not exists astraura_bots_registro_bot_idx on public.astraura_bots_registro (bot_id, creado_en desc);

-- ── RLS ─────────────────────────────────────────────────────────────────────────────────────────
alter table public.astraura_bots enable row level security;
alter table public.astraura_bots_consentimientos enable row level security;
alter table public.astraura_bots_registro enable row level security;

-- Bots: los ve y los gestiona su cuenta responsable. (Los bots de entidad para sus miembros
-- llegan con BOT1011Y, por el gobierno de la entidad; hasta entonces no se abre nada más.)
drop policy if exists "bots_leer_propios" on public.astraura_bots;
create policy "bots_leer_propios" on public.astraura_bots
    for select to authenticated using (cuenta_id = auth.uid());
drop policy if exists "bots_crear_propios" on public.astraura_bots;
create policy "bots_crear_propios" on public.astraura_bots
    for insert to authenticated with check (cuenta_id = auth.uid());
drop policy if exists "bots_cambiar_propios" on public.astraura_bots;
create policy "bots_cambiar_propios" on public.astraura_bots
    for update to authenticated using (cuenta_id = auth.uid()) with check (cuenta_id = auth.uid());
drop policy if exists "bots_quitar_propios" on public.astraura_bots;
create policy "bots_quitar_propios" on public.astraura_bots
    for delete to authenticated using (cuenta_id = auth.uid());

-- Consentimientos: cada persona los suyos (dar, cambiar y retirar su permiso).
drop policy if exists "consentimientos_leer_propios" on public.astraura_bots_consentimientos;
create policy "consentimientos_leer_propios" on public.astraura_bots_consentimientos
    for select to authenticated using (cuenta_id = auth.uid());
drop policy if exists "consentimientos_dar_propios" on public.astraura_bots_consentimientos;
create policy "consentimientos_dar_propios" on public.astraura_bots_consentimientos
    for insert to authenticated with check (cuenta_id = auth.uid());
drop policy if exists "consentimientos_cambiar_propios" on public.astraura_bots_consentimientos;
create policy "consentimientos_cambiar_propios" on public.astraura_bots_consentimientos
    for update to authenticated using (cuenta_id = auth.uid()) with check (cuenta_id = auth.uid());
drop policy if exists "consentimientos_retirar_propios" on public.astraura_bots_consentimientos;
create policy "consentimientos_retirar_propios" on public.astraura_bots_consentimientos
    for delete to authenticated using (cuenta_id = auth.uid());

-- Registro: lo lee y lo anota la cuenta responsable del bot; nadie lo cambia ni lo quita.
drop policy if exists "registro_leer_de_mis_bots" on public.astraura_bots_registro;
create policy "registro_leer_de_mis_bots" on public.astraura_bots_registro
    for select to authenticated using (exists (
        select 1 from public.astraura_bots b where b.id = bot_id and b.cuenta_id = auth.uid()
    ));
drop policy if exists "registro_anotar_en_mis_bots" on public.astraura_bots_registro;
create policy "registro_anotar_en_mis_bots" on public.astraura_bots_registro
    for insert to authenticated with check (
        cuenta_id = auth.uid()
        and exists (select 1 from public.astraura_bots b where b.id = bot_id and b.cuenta_id = auth.uid())
    );

-- ── Funciones (solo responden sobre quien pregunta) ─────────────────────────────────────────────
create or replace function public.astraura_bot_es_miembro(p_bot_id uuid, p_cuenta_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select p_cuenta_id = auth.uid() and exists (
        select 1 from public.astraura_bots_consentimientos
        where bot_id = p_bot_id and cuenta_id = p_cuenta_id
    );
$$;

create or replace function public.astraura_bot_puede_administrar(p_bot_id uuid, p_cuenta_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select p_cuenta_id = auth.uid() and exists (
        select 1 from public.astraura_bots
        where id = p_bot_id and cuenta_id = p_cuenta_id
    );
$$;

revoke all on function public.astraura_bot_es_miembro(uuid, uuid) from public, anon;
revoke all on function public.astraura_bot_puede_administrar(uuid, uuid) from public, anon;
grant execute on function public.astraura_bot_es_miembro(uuid, uuid) to authenticated;
grant execute on function public.astraura_bot_puede_administrar(uuid, uuid) to authenticated;

-- ── Tiempo real (solo si aún no están en la publicación) ───────────────────────────────────────
do $$
declare t text;
begin
    foreach t in array array['astraura_bots', 'astraura_bots_consentimientos', 'astraura_bots_registro'] loop
        if not exists (
            select 1 from pg_publication_tables
            where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
        ) then
            execute format('alter publication supabase_realtime add table public.%I', t);
        end if;
    end loop;
end
$$;
