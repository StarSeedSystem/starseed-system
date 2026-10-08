-- ════════════════════════════════════════════════════════════════════════════
-- Ola 1010E · ES1010Dm — ESTACIONES STARSEED: transmisiones en directo libres.
-- ----------------------------------------------------------------------------
-- Petición de Alex (2026-10-07): un directorio de transmisiones en directo
-- públicas de contenido libre (audio, vídeo, realidad virtual, eventos, juegos
-- con servidores públicos, pizarras, dashboards, programas, apps, enlaces de
-- malla mesh o estudios de producción con IA), con licencia libre declarada.
-- Contrato: architecture/estaciones.md §6.1.
--
-- Modelo de permisos: LECTURA pública (anon incluido) si visibilidad='publica';
-- si es 'grupo', solo miembros activos de la entidad (misma consulta de
-- pertenencia que `mando_rol` de 20261008090100_mando_politicas.sql, con las
-- tablas os_memberships y os_entity_roles y filas `pending` excluidas).
-- ESCRITURA del dueño (`owner_id = auth.uid()`) o de owner/admin/editor de la
-- entidad. Denuncias: insertar la propia; leer las propias y las de estaciones
-- de las que eres dueño. NO SE APLICA a ninguna base de datos en esta ola.
--
-- IDEMPOTENTE: `create table if not exists`, `drop policy if exists`, índices
-- `if not exists`, `create or replace function`, bloque `DO` para realtime.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Trigger de updated_at: función nueva, propia del módulo (sin tocar otras). ──
create or replace function public.os_estaciones_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table if not exists public.os_estaciones (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  -- Ámbito de Genesis: la publica una persona o una entidad (grupo/página/…).
  ambito_tipo   text not null default 'persona' check (ambito_tipo in ('persona','entidad')),
  -- Slug o uuid de la entidad (os_memberships.group_slug / entity_id::text).
  entidad_ref   text,
  titulo        text not null check (char_length(titulo) between 2 and 100),
  descripcion   text not null default '' check (char_length(descripcion) <= 1000),
  -- Qué se emite (catálogo cerrado, = TIPOS_ESTACION de src/lib/estaciones/tipos.ts).
  tipo          text not null check (tipo in ('audio','video','xr','evento','anuncio','juego','pizarra','dashboard','programa','app','mixto')),
  -- De dónde sale (= FUENTES_ESTACION): enlace externo, ruta interna o estudio.
  fuente        text not null check (fuente in ('enlace','starseed','estudio')),
  -- URL https externa o ruta interna /estaciones/… (validado en la capa de datos).
  enlace        text not null,
  -- Formato deducido en la publicación (detectarFormato, §4 del contrato).
  formato       text not null default 'web',
  imagen        text,
  idioma        text not null default 'es',
  categorias    text[] not null default '{}'::text[]
                check (array_length(categorias, 1) is null or array_length(categorias, 1) <= 8),
  -- Licencia libre obligatoria (= LICENCIAS_LIBRES); se enseña en la tarjeta.
  licencia      text not null check (licencia in ('cc0','cc-by','cc-by-sa','dominio-publico','libre-otra','propia-abierta')),
  visibilidad   text not null default 'publica' check (visibilidad in ('publica','grupo')),
  empieza_en    timestamptz,
  termina_en    timestamptz,
  ultimo_latido timestamptz,
  pausada       boolean not null default false,
  en_malla      boolean not null default false,
  espectadores  integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Si el ámbito es una entidad, entidad_ref es obligatoria; si es persona, null.
  check ((ambito_tipo = 'persona' and entidad_ref is null)
      or (ambito_tipo = 'entidad' and entidad_ref is not null))
);

-- Índices de listado: recencia, por tipo con recencia, latidos y ámbito.
create index if not exists os_estaciones_created_idx
  on public.os_estaciones (created_at desc);
create index if not exists os_estaciones_tipo_updated_idx
  on public.os_estaciones (tipo, updated_at desc);
create index if not exists os_estaciones_latido_idx
  on public.os_estaciones (ultimo_latido desc);
create index if not exists os_estaciones_entidad_idx
  on public.os_estaciones (entidad_ref);

-- Trigger de updated_at: refresca la marca en cada UPDATE.
drop trigger if exists os_estaciones_updated_at on public.os_estaciones;
create trigger os_estaciones_updated_at
  before update on public.os_estaciones
  for each row execute function public.os_estaciones_set_updated_at();

-- ── Funciones de pertenencia (misma consulta que `mando_rol`, §6.1) ──────────
-- Miembro ACTIVO de la entidad: os_memberships (group_slug, user_id) o
-- os_entity_roles (entity_id::text, account_id); las filas `pending` no cuentan.
create or replace function public.os_estacion_es_miembro(_entidad_ref text)
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

-- owner/admin/editor de la entidad (pueden escribir estaciones de su ámbito).
create or replace function public.os_estacion_puede_escribir(_owner uuid, _ambito_tipo text, _entidad_ref text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    _owner = auth.uid()
    or (_ambito_tipo = 'entidad' and _entidad_ref is not null and exists (
      select 1 from public.os_memberships m
      where m.group_slug = _entidad_ref
        and m.user_id = auth.uid()
        and lower(m.role) in ('owner','admin','editor')
      union all
      select 1 from public.os_entity_roles r
      where r.entity_id::text = _entidad_ref
        and r.account_id = auth.uid()
        and lower(r.role) in ('owner','admin','editor')
    ))
  );
$$;

alter table public.os_estaciones enable row level security;

-- RLS · ESTACIONES: lectura pública de las 'publica' (anon incluido); las de
-- 'grupo' solo para miembros activos de la entidad. Escritura del dueño o de
-- owner/admin/editor de la entidad.
drop policy if exists os_estaciones_select on public.os_estaciones;
create policy os_estaciones_select
  on public.os_estaciones for select
  to anon, authenticated
  using (
    visibilidad = 'publica'
    or (visibilidad = 'grupo' and public.os_estacion_es_miembro(entidad_ref))
  );

drop policy if exists os_estaciones_insert_own on public.os_estaciones;
create policy os_estaciones_insert_own
  on public.os_estaciones for insert
  to authenticated
  with check (public.os_estacion_puede_escribir(owner_id, ambito_tipo, entidad_ref));

drop policy if exists os_estaciones_update_own on public.os_estaciones;
create policy os_estaciones_update_own
  on public.os_estaciones for update
  to authenticated
  using (public.os_estacion_puede_escribir(owner_id, ambito_tipo, entidad_ref))
  with check (public.os_estacion_puede_escribir(owner_id, ambito_tipo, entidad_ref));

drop policy if exists os_estaciones_delete_own on public.os_estaciones;
create policy os_estaciones_delete_own
  on public.os_estaciones for delete
  to authenticated
  using (public.os_estacion_puede_escribir(owner_id, ambito_tipo, entidad_ref));

-- ── Tabla de DENUNCIAS (moderación restaurativa, §6.4): una por cuenta y ─────
-- estación; denunciar oculta solo para quien denuncia, nada se borra solo.
create table if not exists public.os_estaciones_denuncias (
  estacion_id uuid not null references public.os_estaciones(id) on delete cascade,
  autor_id    uuid not null references auth.users(id) on delete cascade,
  motivo      text not null default '' check (char_length(motivo) <= 300),
  created_at  timestamptz not null default now(),
  primary key (estacion_id, autor_id)
);

alter table public.os_estaciones_denuncias enable row level security;

-- RLS · DENUNCIAS: insertar la propia; leer las propias y las de estaciones
-- de las que eres dueño (o owner/admin/editor de su entidad).
drop policy if exists os_estaciones_denuncias_select on public.os_estaciones_denuncias;
create policy os_estaciones_denuncias_select
  on public.os_estaciones_denuncias for select
  to authenticated
  using (
    autor_id = auth.uid()
    or exists (
      select 1 from public.os_estaciones e
      where e.id = estacion_id
        and public.os_estacion_puede_escribir(e.owner_id, e.ambito_tipo, e.entidad_ref)
    )
  );

drop policy if exists os_estaciones_denuncias_insert_own on public.os_estaciones_denuncias;
create policy os_estaciones_denuncias_insert_own
  on public.os_estaciones_denuncias for insert
  to authenticated
  with check (autor_id = auth.uid());

drop policy if exists os_estaciones_denuncias_delete_own on public.os_estaciones_denuncias;
create policy os_estaciones_denuncias_delete_own
  on public.os_estaciones_denuncias for delete
  to authenticated
  using (autor_id = auth.uid());

-- ── Alta en Realtime (idempotente): ambas tablas emiten postgres_changes. ────
DO $$
DECLARE
    t text;
    tables text[] := ARRAY['os_estaciones', 'os_estaciones_denuncias'];
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        RAISE NOTICE 'Publicación supabase_realtime no existe: no se añade ninguna tabla.';
        RETURN;
    END IF;

    FOREACH t IN ARRAY tables LOOP
        IF to_regclass('public.' || t) IS NULL THEN
            RAISE NOTICE 'Tabla public.% no existe: omitida.', t;
        ELSIF EXISTS (
            SELECT 1
            FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime'
              AND schemaname = 'public'
              AND tablename = t
        ) THEN
            RAISE NOTICE 'Tabla public.% ya está en supabase_realtime: omitida.', t;
        ELSE
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
            RAISE NOTICE 'Tabla public.% añadida a supabase_realtime.', t;
        END IF;
    END LOOP;
END
$$;

-- Documentación de esquema (idempotente: reemplaza el comentario anterior).
comment on table public.os_estaciones is
  'Estaciones StarSeed (Ola 1010E): transmisiones en directo públicas de contenido libre (audio, vídeo, XR, juegos, dashboards, malla, estudio IA). Lectura pública de las públicas; escritura del dueño o owner/admin/editor de la entidad.';
comment on table public.os_estaciones_denuncias is
  'Denuncias de estaciones (moderación restaurativa): una por cuenta y estación; oculta solo para quien denuncia y avisa al ámbito, sin borrado automático.';
