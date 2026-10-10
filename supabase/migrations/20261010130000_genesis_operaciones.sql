-- ════════════════════════════════════════════════════════════════════════════
-- Genesis (personas) y PoliGenesis (grupos y páginas) · registro de operaciones
-- (2026-10-10). SOP: architecture/genesis-personas-poligenesis.md
--
-- 1. `genesis_operaciones`: cada operación aplicada, deshecha, propuesta o fallida, con su
--    INVERSO (lo que permite deshacerla). Es un registro: la operación y su inverso no se
--    reescriben después (trigger); solo cambian estado, resultado y fecha de deshacer.
--    Lo ve quien la hizo y, si es de una entidad, quien colabora o gestiona esa entidad.
-- 2. Roles de gestión en páginas y grupos: hoy solo la cuenta dueña (`owner_id`) puede
--    cambiar los datos de una página o grupo. PoliGenesis deja que quien tenga rol de
--    gestión (rango ≥ 3 en os_entity_roles: gestor/admin/total/owner) también pueda, y un
--    trigger impide que nadie salvo la dueña cambie `owner_id` (sin él, un gestor podría
--    quedarse con la página).
--
-- Revisada 2026-10-10 (integrador): el trigger de inmutabilidad olvidaba `titulo`.
--
-- Depende de 20260806120000_profile_sharing.sql (public.entity_owner_account,
-- public.my_entity_role_rank, public.access_role_rank). Idempotente. NO se aplica desde la
-- nube: la aplica el director.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1 · Registro ───────────────────────────────────────────────────────────
create table if not exists public.genesis_operaciones (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ambito        text not null check (ambito in ('persona', 'entidad')),
  entidad_tipo  text check (entidad_tipo in ('pagina', 'grupo')),
  entidad_id    uuid,
  tipo          text not null check (char_length(tipo) between 3 and 60),
  titulo        text not null check (char_length(titulo) <= 200),
  operacion     jsonb not null check (pg_column_size(operacion) <= 32768),
  inverso       jsonb check (inverso is null or pg_column_size(inverso) <= 65536),
  estado        text not null check (estado in ('aplicada', 'deshecha', 'propuesta', 'fallida')),
  resultado     text check (resultado is null or char_length(resultado) <= 600),
  propuesta_id  uuid,
  creado_en     timestamptz not null default now(),
  deshecho_en   timestamptz,
  constraint genesis_operaciones_entidad_coherente check (
    (ambito = 'persona' and entidad_id is null and entidad_tipo is null)
    or (ambito = 'entidad' and entidad_id is not null and entidad_tipo is not null)
  )
);

create index if not exists genesis_operaciones_cuenta_idx on public.genesis_operaciones (account_id, creado_en desc);
create index if not exists genesis_operaciones_entidad_idx on public.genesis_operaciones (entidad_id, creado_en desc) where entidad_id is not null;
create index if not exists genesis_operaciones_propuesta_idx on public.genesis_operaciones (propuesta_id) where propuesta_id is not null;

alter table public.genesis_operaciones enable row level security;

drop policy if exists genesis_operaciones_select on public.genesis_operaciones;
create policy genesis_operaciones_select on public.genesis_operaciones
  for select to authenticated
  using (
    account_id = auth.uid()
    or (
      entidad_id is not null
      and (public.entity_owner_account(entidad_id) = auth.uid() or public.my_entity_role_rank(entidad_id) >= 2)
    )
  );

drop policy if exists genesis_operaciones_insert on public.genesis_operaciones;
create policy genesis_operaciones_insert on public.genesis_operaciones
  for insert to authenticated
  with check (
    account_id = auth.uid()
    and (
      ambito = 'persona'
      or public.entity_owner_account(entidad_id) = auth.uid()
      or public.my_entity_role_rank(entidad_id) >= 2
    )
  );

-- Marcar como deshecha: quien la hizo, o quien gestiona la entidad (rango ≥ 3).
drop policy if exists genesis_operaciones_update on public.genesis_operaciones;
create policy genesis_operaciones_update on public.genesis_operaciones
  for update to authenticated
  using (
    account_id = auth.uid()
    or (
      entidad_id is not null
      and (public.entity_owner_account(entidad_id) = auth.uid() or public.my_entity_role_rank(entidad_id) >= 3)
    )
  );

-- Borrar: solo lo personal y solo la propia persona (sus datos son suyos). Lo de una
-- entidad es memoria del grupo y no se borra desde el cliente.
drop policy if exists genesis_operaciones_delete on public.genesis_operaciones;
create policy genesis_operaciones_delete on public.genesis_operaciones
  for delete to authenticated
  using (account_id = auth.uid() and ambito = 'persona');

-- El registro no se reescribe: solo cambian estado, resultado y deshecho_en.
create or replace function public.genesis_operaciones_inmutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.account_id is distinct from old.account_id
     or new.ambito is distinct from old.ambito
     or new.entidad_tipo is distinct from old.entidad_tipo
     or new.entidad_id is distinct from old.entidad_id
     or new.tipo is distinct from old.tipo
     or new.titulo is distinct from old.titulo
     or new.operacion is distinct from old.operacion
     or new.inverso is distinct from old.inverso
     or new.propuesta_id is distinct from old.propuesta_id
     or new.creado_en is distinct from old.creado_en then
    raise exception 'El registro de Genesis no se reescribe: solo cambian estado, resultado y deshecho_en.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists genesis_operaciones_inmutable on public.genesis_operaciones;
create trigger genesis_operaciones_inmutable
  before update on public.genesis_operaciones
  for each row execute function public.genesis_operaciones_inmutable();

-- ── 2 · Gestión de páginas y grupos por rol ────────────────────────────────
-- owner_id solo lo cambia la propia dueña (o el servidor con service_role / una migración).
create or replace function public.genesis_owner_inmutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.owner_id is distinct from old.owner_id
     and coalesce(auth.role(), '') in ('authenticated', 'anon')
     and old.owner_id is distinct from auth.uid() then
    raise exception 'Solo la cuenta dueña puede traspasar esta página o grupo.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Solo si la tabla existe, tiene owner_id y ya tiene RLS activa: si la RLS estuviera
-- apagada, añadir una política no cambiaría nada y ENCENDERLA aquí podría dejar a todo el
-- mundo sin leer páginas (no sabemos qué políticas de lectura tiene la base viva). En ese
-- caso se avisa con NOTICE y lo decide el director.
do $$
declare
  t text;
  tiene_owner boolean;
  rls boolean;
begin
  foreach t in array array['os_pages', 'os_groups'] loop
    select exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = t and column_name = 'owner_id'
    ) into tiene_owner;
    if not tiene_owner then
      raise notice 'genesis: %.owner_id no existe; no se toca', t;
      continue;
    end if;

    -- Nadie salvo la dueña cambia owner_id (vale con RLS o sin ella).
    execute format('drop trigger if exists %I on public.%I', t || '_owner_inmutable', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.genesis_owner_inmutable()',
      t || '_owner_inmutable', t);

    select c.relrowsecurity into rls
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = t;
    if not coalesce(rls, false) then
      raise notice 'genesis: % no tiene RLS activa; no se añade la política de gestión (revísalo antes de activarla)', t;
      continue;
    end if;

    execute format('drop policy if exists %I on public.%I', t || '_gestion_por_rol', t);
    execute format(
      'create policy %I on public.%I for update to authenticated '
      || 'using (owner_id = auth.uid() or public.my_entity_role_rank(id) >= 3) '
      || 'with check (owner_id = auth.uid() or public.my_entity_role_rank(id) >= 3)',
      t || '_gestion_por_rol', t);
  end loop;
end;
$$ language plpgsql;

-- ═══ APLICADA Y PROBADA (2026-10-10, integrador, con el visto bueno de Alex del 2026-10-10) ═══
-- Aplicada dos veces (idempotente). Prueba de RLS con dos cuentas reales (supabase/pruebas/rls-1010c.sql), verde:
--   · lo personal solo lo ve su dueña; lo de una entidad lo ve quien la gestiona (rango ≥ 2) y solo
--     marca «deshecha» quien la hizo o gestiona (rango ≥ 3);
--   · el trigger impide reescribir título y operación (antes olvidaba `titulo`: corregido);
--   · nadie inserta a nombre de otra cuenta ni sobre una entidad ajena o inexistente;
--   · lo personal se borra, lo de una entidad no se borra desde el cliente;
--   · un admin por rol (rango 3) edita el grupo, pero solo la dueña traspasa `owner_id`.
-- os_pages y os_groups ya tenían RLS activa: la política `*_gestion_por_rol` se creó en ambas.
