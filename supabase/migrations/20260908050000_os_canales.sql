-- ════════════════════════════════════════════════════════════════════════════
-- Adenda/Ola 285 · K4 — CANALES STARSEED: directorio público de canales.
-- ----------------------------------------------------------------------------
-- «Sección especial de Canales» (pedido de Alex, 2026-09-08): cualquiera puede
-- SUBIR EN TIEMPO REAL canales al público con CATEGORÍAS LIBRES (sin enum — un
-- array de texto libre), para que el OS agregue y difunda canales de Telegram,
-- YouTube, WhatsApp, X, Instagram, RSS, web u otros en un único directorio.
--
-- Modelo de permisos (igual que `os_mesh_relay`): LECTURA pública (todo el
-- mundo, con o sin sesión), ESCRITURA solo del dueño (`owner_id = auth.uid()`).
-- Un canal lo crea su autor; los seguidores son una tabla aparte N:M donde la
-- decisión de seguir/des-seguir es solo de la propia cuenta (`seguidor`).
--
-- IDEMPOTENTE: `create table if not exists`, `drop policy if exists`, índices
-- `if not exists`, `comment on … is` reemplaza. Re-ejecutarla no cambia nada.
-- No se genera gemelo `_rollback.sql`: es una migración aditiva trivial y las
-- tablas no se retiran en producción (se anota en el commit, no en disco).
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.os_canales (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  -- Nombre legible del canal; entre 2 y 80 caracteres (cabecera de listado).
  nombre        text not null check (char_length(nombre) between 2 and 80),
  -- Plataforma de origen. Catálogo CERRADO (seguro para filtros e iconografía).
  plataforma    text not null check (plataforma in ('telegram','youtube','whatsapp','x','instagram','rss','web','otro')),
  -- URL pública del canal (obligatoria; https://… o t.me/… según plataforma).
  enlace        text not null,
  -- Handle/@usuario u otro identificador estable opcional (p. ej. "@mi_canal").
  identificador text,
  -- Tipo de espacio: canal, grupo o lista. Afecta a iconos y a la UI.
  tipo          text not null default 'canal' check (tipo in ('canal','grupo','lista')),
  -- Descripción libre del canal (texto plano, vacío si no hay).
  descripcion   text default '',
  -- CATEGORÍAS LIBRES: array de etiquetas arbitrarias del autor (máx. 8).
  categorias    text[] not null default '{}'::text[]
                check (array_length(categorias, 1) is null or array_length(categorias, 1) <= 8),
  -- Idioma principal del contenido (código ISO corto, libre; 'es' por defecto).
  idioma        text default 'es',
  -- URL de imagen/avatar opcional del canal (sin validación dura en BD).
  imagen        text,
  -- Sello de verificación del contenido (solo el sistema lo enciende).
  verificado    boolean not null default false,
  -- Canal OFICIAL del ecosistema StarSeed (curaduría, no del autor).
  oficial       boolean not null default false,
  -- Contador de seguidores conocido (espejo de la plataforma; no es tabla N:M).
  seguidores    integer not null default 0,
  -- Último mensaje/estado del canal (vista previa libre en JSONB).
  ultimo_mensaje jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Índices de listado: por recencia y por plataforma con recencia.
create index if not exists os_canales_created_idx
  on public.os_canales (created_at desc);

create index if not exists os_canales_plataforma_created_idx
  on public.os_canales (plataforma, created_at desc);

-- Búsqueda por categoría libre (GIN sobre el array de texto).
create index if not exists os_canales_categorias_idx
  on public.os_canales using gin (categorias);

-- ── Tabla N:M de SEGUIDORES (quién sigue qué canal) ──────────────────────────
create table if not exists public.os_canales_seguidores (
  canal_id    uuid references public.os_canales(id) on delete cascade,
  seguidor    uuid references auth.users(id) on delete cascade,
  created_at  timestamptz default now(),
  primary key (canal_id, seguidor)
);

-- Índice para «canales que sigue una cuenta» (panel del seguidor).
create index if not exists os_canales_seguidores_seguidor_idx
  on public.os_canales_seguidores (seguidor, created_at desc);

alter table public.os_canales enable row level security;

-- RLS · CANALES: lectura pública (anon + autenticados), escritura del dueño.
drop policy if exists os_canales_select on public.os_canales;
create policy os_canales_select
  on public.os_canales for select
  to anon, authenticated
  using (true);

drop policy if exists os_canales_insert_own on public.os_canales;
create policy os_canales_insert_own
  on public.os_canales for insert
  to authenticated
  with check (owner_id = auth.uid());

drop policy if exists os_canales_update_own on public.os_canales;
create policy os_canales_update_own
  on public.os_canales for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists os_canales_delete_own on public.os_canales;
create policy os_canales_delete_own
  on public.os_canales for delete
  to authenticated
  using (owner_id = auth.uid());

alter table public.os_canales_seguidores enable row level security;

-- RLS · SEGUIDORES: lectura pública; seguir/dejar de seguir solo la propia cuenta.
drop policy if exists os_canales_seguidores_select on public.os_canales_seguidores;
create policy os_canales_seguidores_select
  on public.os_canales_seguidores for select
  to anon, authenticated
  using (true);

drop policy if exists os_canales_seguidores_insert_own on public.os_canales_seguidores;
create policy os_canales_seguidores_insert_own
  on public.os_canales_seguidores for insert
  to authenticated
  with check (seguidor = auth.uid());

drop policy if exists os_canales_seguidores_delete_own on public.os_canales_seguidores;
create policy os_canales_seguidores_delete_own
  on public.os_canales_seguidores for delete
  to authenticated
  using (seguidor = auth.uid());

-- ── Alta en Realtime (idempotente): ambas tablas emiten postgres_changes. ─────
DO $$
DECLARE
    t text;
    tables text[] := ARRAY['os_canales', 'os_canales_seguidores'];
BEGIN
    -- Sin publicación no hay nada que hacer (entornos locales sin realtime).
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
comment on table public.os_canales is
  'Directorio público de Canales StarSeed (Ola 285 · K4): cualquiera publica, edita y sigue canales con categorías libres. Lectura pública; escritura solo del dueño.';
comment on table public.os_canales_seguidores is
  'Seguidores de los canales públicos (N:M). Seguir/dejar de seguir es solo de la propia cuenta (seguidor = auth.uid()).';