-- ═══════════════════════════════════════════════════════════════════════════
-- Geo · Ubicaciones geográficas para grupos, páginas y eventos
-- ---------------------------------------------------------------------------
-- ADITIVO y DEFENSIVO: añade coordenadas opcionales (lat/lng) + una etiqueta de
-- lugar legible (place_label) a las entidades sociales de StarSeed OS y a la
-- tabla de eventos del Sincrómetro. Todo es NULLABLE — las entidades existentes
-- siguen siendo válidas sin geo, y el frontend degrada con elegancia si estas
-- columnas aún no existen (lecturas/escrituras van envueltas en try/catch).
--
-- Se cubren AMBOS sistemas de eventos presentes en el código:
--   · os_events  → capa social (os-social.ts / editor de entidades / mapa)
--   · events     → capa del calendario/Sincrómetro (events-store.ts)
-- y las entidades geolocalizables:
--   · os_groups  → grupos (asambleas, círculos, colectivos)
--   · os_pages   → páginas / comunidades (Sanghas territoriales, etc.)
--
-- Idempotente: usa ADD COLUMN IF NOT EXISTS y guardas DO $$ para no fallar si
-- alguna tabla todavía no está creada en este entorno.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── os_events ──────────────────────────────────────────────────────────────
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'os_events'
  ) then
    alter table public.os_events add column if not exists lat double precision;
    alter table public.os_events add column if not exists lng double precision;
    alter table public.os_events add column if not exists place_label text;
  end if;
end $$;

-- ── os_groups ──────────────────────────────────────────────────────────────
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'os_groups'
  ) then
    alter table public.os_groups add column if not exists lat double precision;
    alter table public.os_groups add column if not exists lng double precision;
    alter table public.os_groups add column if not exists place_label text;
  end if;
end $$;

-- ── os_pages ───────────────────────────────────────────────────────────────
-- (Las páginas de tipo "comunidad" representan Sanghas territoriales: geo útil.)
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'os_pages'
  ) then
    alter table public.os_pages add column if not exists lat double precision;
    alter table public.os_pages add column if not exists lng double precision;
    alter table public.os_pages add column if not exists place_label text;
  end if;
end $$;

-- ── events (tabla del calendario / Sincrómetro) ────────────────────────────
-- Esta tabla ya guarda `location` (texto). Añadimos coordenadas para poder
-- ubicar en el mapa también los eventos creados desde el Sincrómetro.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'events'
  ) then
    alter table public.events add column if not exists lat double precision;
    alter table public.events add column if not exists lng double precision;
    alter table public.events add column if not exists place_label text;
  end if;
end $$;

-- Índices ligeros para consultas "con geo" (parciales: solo filas geolocalizadas).
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='os_events' and column_name='lat') then
    create index if not exists os_events_geo_idx on public.os_events (lat, lng) where lat is not null;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='os_groups' and column_name='lat') then
    create index if not exists os_groups_geo_idx on public.os_groups (lat, lng) where lat is not null;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='os_pages' and column_name='lat') then
    create index if not exists os_pages_geo_idx on public.os_pages (lat, lng) where lat is not null;
  end if;
end $$;
