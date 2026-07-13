-- ════════════════════════════════════════════════════════════════════════════
-- 20260712100000 · Historial de versiones, ramas y registro (Adenda 66 §2)
-- ----------------------------------------------------------------------------
-- SOP: architecture/folders-permisos-publicaciones.md §2.
-- Base del OS: Supabase `nxstilnyidvkqeosofuh` (NO el de Nexus/Café).
--
-- QUÉ RESUELVE
--   Cada guardado real de una biblioteca / folder / archivo / cerebro /
--   publicación crea una REVISIÓN inmutable: quién, cuándo, desde qué
--   dispositivo, con qué mensaje, cuánto pesa, su checksum y —si es binario—
--   el puntero al objeto de Storage (`<uid>/<fileId>/<rev>/<name>`, NUNCA se
--   sobrescribe). Sobre eso se construyen: ver historial, restaurar,
--   **ramificar** (una variación con su propia línea `branch`), comparar y el
--   **registro** (`os_access_log`) de accesos y cambios.
--
-- MODELO
--   · os_versions   — revisiones (append-only por contrato: sin UPDATE/DELETE).
--       `owner` es la referencia de entidad SERIALIZADA: `<owner_kind>:<owner_id>`
--       (p.ej. `user:<uuid>`, `group:mi-grupo`, `page:mi-pagina`). Así el
--       permiso del historial se DERIVA del permiso del recurso, reusando las
--       funciones `es_can_read`/`es_can_write` ya creadas en 20260712090000:
--         · solo quien puede VER el recurso ve su historial (SELECT).
--         · solo quien puede EDITARLO crea revisiones (INSERT).
--   · os_access_log — registro de accesos y cambios (mismas reglas de permiso).
--
-- IDEMPOTENTE: re-ejecutable sin efectos secundarios.
-- ════════════════════════════════════════════════════════════════════════════

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0 · Permisos: el historial hereda el permiso del RECURSO                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- Parte de `<owner_kind>:<owner_id>` en sus dos mitades (split por el PRIMER ':').
-- Un `owner` sin ':' (uuid suelto, tolerancia) se interpreta como ámbito `user`.
CREATE OR REPLACE FUNCTION public.osv_owner_kind(_owner text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN _owner IS NULL OR position(':' in _owner) = 0 THEN 'user'
    ELSE split_part(_owner, ':', 1)
  END;
$$;

CREATE OR REPLACE FUNCTION public.osv_owner_id(_owner text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN _owner IS NULL THEN ''
    WHEN position(':' in _owner) = 0 THEN _owner
    -- substring desde el carácter siguiente al primer ':' → conserva los ':'
    -- internos del id (p.ej. ámbito 'other' con 'srv:<uuid>').
    ELSE substring(_owner from position(':' in _owner) + 1)
  END;
$$;

-- ¿Puede auth.uid() LEER el historial de este recurso? = ¿puede leer el recurso?
CREATE OR REPLACE FUNCTION public.osv_can_read(_owner text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.es_can_read(public.osv_owner_kind(_owner), public.osv_owner_id(_owner));
$$;

-- ¿Puede auth.uid() CREAR revisiones? = ¿puede editar el recurso?
CREATE OR REPLACE FUNCTION public.osv_can_write(_owner text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.es_can_write(public.osv_owner_kind(_owner), public.osv_owner_id(_owner));
$$;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1 · public.os_versions — revisiones + ramas                               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.os_versions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Qué tipo de recurso versiona esta fila.
  resource_kind text NOT NULL
                CHECK (resource_kind IN ('library','folder','file','brain','post')),
  -- Id del recurso DENTRO de su ámbito (`owner`): id de folder/ítem, id de
  -- os_files, id de publicación… Para `library` se usa la propia clave 'library'.
  resource_id   text NOT NULL,
  -- Ámbito serializado `<owner_kind>:<owner_id>` (ver §0). De aquí sale el permiso.
  owner         text NOT NULL,
  rev           integer NOT NULL,
  parent_rev    integer,
  branch        text NOT NULL DEFAULT 'main',
  author        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  device_id     text,
  message       text,
  size          bigint,
  checksum      text,
  -- Binarios: puntero INMUTABLE al objeto de Storage `<uid>/<fileId>/<rev>/<name>`.
  storage_path  text,
  -- Documentos/estructura: instantánea del contenido (jsonb).
  snapshot      jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Una revisión por (recurso, rama, rev): impide duplicar rev al reintentar.
CREATE UNIQUE INDEX IF NOT EXISTS os_versions_rev_uidx
  ON public.os_versions (resource_kind, resource_id, branch, rev);
-- Índice principal de listVersions()/listBranches() (más reciente primero).
CREATE INDEX IF NOT EXISTS os_versions_resource_idx
  ON public.os_versions (resource_kind, resource_id, branch, rev DESC);
CREATE INDEX IF NOT EXISTS os_versions_owner_idx   ON public.os_versions (owner, created_at DESC);
CREATE INDEX IF NOT EXISTS os_versions_author_idx  ON public.os_versions (author);
CREATE INDEX IF NOT EXISTS os_versions_created_idx ON public.os_versions (created_at DESC);

ALTER TABLE public.os_versions ENABLE ROW LEVEL SECURITY;
-- Realtime: FULL para que los DELETE (limpieza) también lleguen filtrables.
ALTER TABLE public.os_versions REPLICA IDENTITY FULL;

-- SELECT: solo quien puede VER el recurso (o el propio autor de la revisión).
DROP POLICY IF EXISTS os_versions_select ON public.os_versions;
CREATE POLICY os_versions_select ON public.os_versions
  FOR SELECT TO public
  USING (public.osv_can_read(owner) OR author = auth.uid());

-- INSERT: solo quien puede EDITAR el recurso, y firmando como sí mismo.
DROP POLICY IF EXISTS os_versions_insert ON public.os_versions;
CREATE POLICY os_versions_insert ON public.os_versions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.osv_can_write(owner)
    AND (author IS NULL OR author = auth.uid())
  );

-- Append-only: NO hay política de UPDATE (una revisión jamás se reescribe).
-- DELETE: solo el autor puede purgar sus propias revisiones (limpieza/pruebas).
DROP POLICY IF EXISTS os_versions_delete ON public.os_versions;
CREATE POLICY os_versions_delete ON public.os_versions
  FOR DELETE TO authenticated
  USING (author = auth.uid() AND public.osv_can_write(owner));

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2 · public.os_access_log — registro de accesos y cambios                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.os_access_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_kind text NOT NULL
                CHECK (resource_kind IN ('library','folder','file','brain','post')),
  resource_id   text NOT NULL,
  owner         text NOT NULL,
  -- open|view|download|edit|create|delete|move|rename|restore|branch|share|permiso…
  action        text NOT NULL,
  actor         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  device_id     text,
  detail        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS os_access_log_resource_idx
  ON public.os_access_log (resource_kind, resource_id, created_at DESC);
CREATE INDEX IF NOT EXISTS os_access_log_owner_idx ON public.os_access_log (owner, created_at DESC);
CREATE INDEX IF NOT EXISTS os_access_log_actor_idx ON public.os_access_log (actor);

ALTER TABLE public.os_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.os_access_log REPLICA IDENTITY FULL;

-- Transparencia en el ejercicio del poder (CLAUDE.md §6): quien puede VER el
-- recurso ve quién lo ha tocado. El actor siempre ve sus propias entradas.
DROP POLICY IF EXISTS os_access_log_select ON public.os_access_log;
CREATE POLICY os_access_log_select ON public.os_access_log
  FOR SELECT TO public
  USING (public.osv_can_read(owner) OR actor = auth.uid());

-- Cualquiera que pueda LEER el recurso puede registrar su propio acceso
-- (un `view`/`download` de un lector legítimo debe quedar registrado), pero
-- siempre firmando como sí mismo — nadie puede escribir el registro de otro.
DROP POLICY IF EXISTS os_access_log_insert ON public.os_access_log;
CREATE POLICY os_access_log_insert ON public.os_access_log
  FOR INSERT TO authenticated
  WITH CHECK (
    public.osv_can_read(owner)
    AND (actor IS NULL OR actor = auth.uid())
  );

-- Append-only (sin UPDATE). DELETE solo para el propio actor.
DROP POLICY IF EXISTS os_access_log_delete ON public.os_access_log;
CREATE POLICY os_access_log_delete ON public.os_access_log
  FOR DELETE TO authenticated
  USING (actor = auth.uid());

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 3 · Realtime — publicación supabase_realtime (patrón 20260712090000)      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

DO $$
DECLARE
    t text;
    tables text[] := ARRAY['os_versions', 'os_access_log'];
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
END
$$;
