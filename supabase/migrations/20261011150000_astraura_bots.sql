-- Ola 1011B · BOT1011B — Bots/dots de Astraura: bots por entidad, consentimientos
-- por persona y registro de acciones. Contrato: architecture/astraura-bots.md.
-- ESCRITA Y PROBADA, NO APLICADA. Idempotente (create … if not exists, drop policy
-- if exists, bloque DO para realtime). Reparada 2026-10-14: sin format('%I') en el
-- DO (quote_ident literal), inserción del registro verifica pertenencia, y trigger
-- que valida dueno_id contra la entidad/perfil real.
-- ── Tablas ─────────────────────────────────────────────────────────────────
create table if not exists public.astraura_bots (
  id           text primary key,
  dueno_tipo   text not null check (dueno_tipo in ('perfil','grupo','comunidad','pagina')),
  dueno_id     text not null check (char_length(dueno_id) between 1 and 120),
  cuenta_id    uuid not null references auth.users(id) on delete cascade,
  gobierno     text not null default 'jerarquico' check (gobierno in ('jerarquico','democratico')),
  activo       boolean not null default true,
  datos        jsonb not null default '{}'::jsonb, -- personalidad, cuerpo, sentidosHabilitados, nivel, delegado
  creado       timestamptz not null default now(),
  actualizado  timestamptz not null default now()
);
create table if not exists public.astraura_bots_consentimientos (
  bot_id    text not null references public.astraura_bots(id) on delete cascade,
  cuenta_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  sentido   text not null check (sentido in ('pantalla','captura-pantalla','archivos','red','correo','terminal','camara','microfono','sensores','ubicacion','portapapeles','aparatos')),
  vence     timestamptz,
  expreso   boolean not null default false,
  primary key (bot_id, cuenta_id, sentido)
);
create table if not exists public.astraura_bots_registro (
  id      bigserial primary key,
  bot_id  text not null references public.astraura_bots(id) on delete cascade,
  at      timestamptz not null default now(),
  quien   text not null,
  tipo    text not null,
  accion  text,
  motivo  text not null default '',
  deshacer jsonb
);
create index if not exists astraura_bots_dueno_idx on public.astraura_bots (dueno_tipo, dueno_id);
create index if not exists astraura_bots_registro_bot_at_idx on public.astraura_bots_registro (bot_id, at desc);
-- ── Funciones de pertenencia (misma consulta que os_estacion_es_miembro) ─────
create or replace function public.astraura_bot_es_miembro(_entidad_ref text)
returns boolean language sql stable security definer set search_path = public as $$
  select _entidad_ref is not null and auth.uid() is not null and exists (
    select 1 from public.os_memberships m
    where m.group_slug = _entidad_ref and m.user_id = auth.uid() and lower(m.role) not in ('pending')
    union all
    select 1 from public.os_entity_roles r
    where r.entity_id::text = _entidad_ref and r.account_id = auth.uid() and lower(r.role) not in ('pending')
  );
$$;
-- Administra: dueña de la cuenta (bot de perfil) u owner/admin ACTIVO de la entidad.
create or replace function public.astraura_bot_puede_administrar(_dueno_tipo text, _dueno_id text, _cuenta_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    (_dueno_tipo = 'perfil' and _cuenta_id = auth.uid())
    or (_dueno_tipo <> 'perfil' and _dueno_id is not null and exists (
      select 1 from public.os_memberships m
      where m.group_slug = _dueno_id and m.user_id = auth.uid() and lower(m.role) in ('owner','admin')
      union all
      select 1 from public.os_entity_roles r
      where r.entity_id::text = _dueno_id and r.account_id = auth.uid() and lower(r.role) in ('owner','admin')
    ))
  );
$$;
-- Valida que dueno_id EXISTE de verdad (reparación 3): perfil → perfil propio en
-- public.profiles; entidad → alguien con rol en os_memberships/os_entity_roles.
create or replace function public.astraura_bots_validar_dueno()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.dueno_tipo = 'perfil' then
    if not exists (select 1 from public.profiles p where p.id::text = new.dueno_id and p.user_id = new.cuenta_id) then
      raise exception 'astraura_bots: dueno_id % no es un perfil de la cuenta', new.dueno_id;
    end if;
  elsif not exists (
    select 1 from public.os_memberships m where m.group_slug = new.dueno_id
    union all
    select 1 from public.os_entity_roles r where r.entity_id::text = new.dueno_id
  ) then
    raise exception 'astraura_bots: dueno_id % no corresponde a ninguna entidad', new.dueno_id;
  end if;
  return new;
end;
$$;
drop trigger if exists astraura_bots_validar_dueno on public.astraura_bots;
create trigger astraura_bots_validar_dueno
  before insert on public.astraura_bots
  for each row execute function public.astraura_bots_validar_dueno();
-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.astraura_bots enable row level security;
alter table public.astraura_bots_consentimientos enable row level security;
alter table public.astraura_bots_registro enable row level security;
-- BOTS: un bot de perfil lo ve/escribe solo su cuenta; uno de entidad lo ven sus
-- miembros activos y lo escriben (crean/editan) los owner/admin de la entidad.
drop policy if exists astraura_bots_select on public.astraura_bots;
create policy astraura_bots_select on public.astraura_bots for select to authenticated
  using (cuenta_id = (select auth.uid()) or public.astraura_bot_es_miembro(dueno_id));
drop policy if exists astraura_bots_insert on public.astraura_bots;
create policy astraura_bots_insert on public.astraura_bots for insert to authenticated
  with check (cuenta_id = (select auth.uid()) and public.astraura_bot_puede_administrar(dueno_tipo, dueno_id, cuenta_id));
drop policy if exists astraura_bots_update on public.astraura_bots;
create policy astraura_bots_update on public.astraura_bots for update to authenticated
  using (public.astraura_bot_puede_administrar(dueno_tipo, dueno_id, cuenta_id))
  with check (public.astraura_bot_puede_administrar(dueno_tipo, dueno_id, cuenta_id));
drop policy if exists astraura_bots_delete on public.astraura_bots;
create policy astraura_bots_delete on public.astraura_bots for delete to authenticated
  using (cuenta_id = (select auth.uid()) or public.astraura_bot_puede_administrar(dueno_tipo, dueno_id, cuenta_id));
-- CONSENTIMIENTOS: cada cuenta solo ve y escribe los SUYOS (nadie consiente por otro).
drop policy if exists astraura_bots_consentimientos_select on public.astraura_bots_consentimientos;
create policy astraura_bots_consentimientos_select on public.astraura_bots_consentimientos for select to authenticated
  using (cuenta_id = (select auth.uid()));
drop policy if exists astraura_bots_consentimientos_insert on public.astraura_bots_consentimientos;
create policy astraura_bots_consentimientos_insert on public.astraura_bots_consentimientos for insert to authenticated
  with check (cuenta_id = (select auth.uid()));
drop policy if exists astraura_bots_consentimientos_update on public.astraura_bots_consentimientos;
create policy astraura_bots_consentimientos_update on public.astraura_bots_consentimientos for update to authenticated
  using (cuenta_id = (select auth.uid())) with check (cuenta_id = (select auth.uid()));
drop policy if exists astraura_bots_consentimientos_delete on public.astraura_bots_consentimientos;
create policy astraura_bots_consentimientos_delete on public.astraura_bots_consentimientos for delete to authenticated
  using (cuenta_id = (select auth.uid()));
-- REGISTRO: SOLO inserción (sin políticas de update ni delete). Lo lee la dueña del
-- bot o un admin de la entidad; y solo se inserta en un bot propio, administrado o
-- del que eres miembro (reparación 2: sin check libre, que dejaría escribir en bots ajenos).
drop policy if exists astraura_bots_registro_select on public.astraura_bots_registro;
create policy astraura_bots_registro_select on public.astraura_bots_registro for select to authenticated
  using (exists (
    select 1 from public.astraura_bots b
    where b.id = bot_id and public.astraura_bot_puede_administrar(b.dueno_tipo, b.dueno_id, b.cuenta_id)
  ));
drop policy if exists astraura_bots_registro_insert on public.astraura_bots_registro;
create policy astraura_bots_registro_insert on public.astraura_bots_registro for insert to authenticated
  with check (exists (
    select 1 from public.astraura_bots b
    where b.id = bot_id
      and (b.cuenta_id = (select auth.uid())
           or public.astraura_bot_es_miembro(b.dueno_id)
           or public.astraura_bot_puede_administrar(b.dueno_tipo, b.dueno_id, b.cuenta_id))
  ));
-- ── Realtime (idempotente; reparación 1: quote_ident literal, sin format '%I') ──
DO $$
DECLARE
    t text;
    tables text[] := ARRAY['astraura_bots', 'astraura_bots_consentimientos', 'astraura_bots_registro'];
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        RAISE NOTICE 'Publicación supabase_realtime no existe: no se añade ninguna tabla.';
        RETURN;
    END IF;
    FOREACH t IN ARRAY tables LOOP
        IF to_regclass('public.' || t) IS NULL THEN
            RAISE NOTICE 'Tabla public.% no existe: omitida.', t;
        ELSIF EXISTS (SELECT 1 FROM pg_publication_tables
                      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
            RAISE NOTICE 'Tabla public.% ya está en supabase_realtime: omitida.', t;
        ELSE
            EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.' || quote_ident(t);
            RAISE NOTICE 'Tabla public.% añadida a supabase_realtime.', t;
        END IF;
    END LOOP;
END
$$;
