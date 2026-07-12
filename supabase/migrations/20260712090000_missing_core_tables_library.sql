-- ════════════════════════════════════════════════════════════════════════════
-- 20260712090000 · Tablas núcleo AUSENTES del OS (Supabase nxstilnyidvkqeosofuh)
-- ----------------------------------------------------------------------------
-- CAUSA RAÍZ (2026-07-12): el CÓDIGO usa cuatro tablas que NUNCA se crearon en
-- la base del OS. Como todos los módulos degradan en silencio (`if (error)
-- return null/[]/0`), el guardado en la nube fallaba SIN error visible: la
-- biblioteca/escritorios/layouts vivían solo en localStorage y los archivos
-- "solo aparecían en el dispositivo donde se subían" (el objeto sí llegaba a
-- Storage, pero su fila `os_files` no se insertaba, así que ningún otro
-- dispositivo podía listarlo).
--
--   · public.entity_state    — src/lib/sync/entity-state.ts (biblioteca por
--     entidad, escritorios por perfil, layout de páginas/grupos, educación,
--     gobernanza, estado de servidores…). Contrato: upsert onConflict
--     (owner_kind, owner_id, key); select value, rev, updated_at, device_id.
--   · public.os_files        — src/lib/files/os-files.ts (metadatos de los
--     objetos del bucket `os-files` de Storage: owner/profile_id/name/mime/
--     size/path/url/device_id/is_public/acl_read/acl_write/group_slug/meta).
--   · public.entity_mentions — src/lib/mentions/mentions.ts (persistencia de
--     menciones @/# de una publicación: source_type/source_id/target_type/
--     target_id/kind).
--   · public.os_contexts     — src/ai/astraura/astraura-realtime.ts (contexto
--     de Aurora por usuario y destino: user_id/target_kind/target_id/settings).
--
-- PRINCIPIOS (CLAUDE.md §3/§6): privado en lo personal (ámbitos `user` y
-- `profile` solo del dueño), transparente en lo público (los ámbitos de entidad
-- pública — page/group/community/event/ef/party — son de LECTURA pública, tal
-- y como el código ya asume: /pagina/[slug] y /grupo/[slug] construyen su
-- EntityRef para cualquier visitante, no solo para el dueño).
--
-- IDEMPOTENTE: re-ejecutable sin efectos secundarios.
-- ════════════════════════════════════════════════════════════════════════════

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0 · Funciones auxiliares de permisos (SECURITY DEFINER, sin recursión)    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ¿auth.uid() es dueño (os_pages/os_groups.owner_id) o miembro (os_memberships)
-- de la entidad identificada por su SLUG? (page/group/community/event/ef/party
-- viven todas en os_pages/os_groups, identificadas por slug).
CREATE OR REPLACE FUNCTION public.es_is_entity_member(_owner_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
      EXISTS (SELECT 1 FROM public.os_pages  p WHERE p.slug = _owner_id AND p.owner_id = auth.uid())
   OR EXISTS (SELECT 1 FROM public.os_groups g WHERE g.slug = _owner_id AND g.owner_id = auth.uid())
   OR EXISTS (SELECT 1 FROM public.os_memberships m WHERE m.group_slug = _owner_id AND m.user_id = auth.uid())
  );
$$;

-- Ámbito 'other': hoy dos usos reales en el código —
--   · 'network-politics'  → recursos comunes + casos de mediación (gobernanza
--     colectiva: cualquiera autenticado puede leer y aportar; lectura pública
--     por transparencia del poder público).
--   · 'srv:<uuid>'        → estado compartido de un servidor de apps
--     (src/lib/servers/server-channel.ts). Se restringe a MIEMBROS del
--     servidor. `os_app_server_members` la crea otra migración en paralelo:
--     si aún no existe, degradamos a "cualquier autenticado" en vez de romper.
CREATE OR REPLACE FUNCTION public.es_can_access_other(_owner_id text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ok boolean;
  sid uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  IF _owner_id LIKE 'srv:%' THEN
    IF to_regclass('public.os_app_server_members') IS NULL THEN
      RETURN true; -- tabla de miembros aún no creada: no bloqueamos el módulo
    END IF;
    BEGIN
      sid := substring(_owner_id from 5)::uuid;
    EXCEPTION WHEN others THEN
      RETURN false; -- id de servidor malformado
    END;
    EXECUTE
      'SELECT EXISTS (SELECT 1 FROM public.os_app_server_members m
                       WHERE m.server_id = $1 AND m.user_id = $2)'
      INTO ok USING sid, auth.uid();
    RETURN coalesce(ok, false);
  END IF;

  -- Ámbitos colectivos globales (gobernanza): cualquiera autenticado.
  RETURN true;
END;
$$;

-- ¿Puede auth.uid() ESCRIBIR en este ámbito de entity_state?
CREATE OR REPLACE FUNCTION public.es_can_write(_owner_kind text, _owner_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    -- Ámbito personal: la propia cuenta.
    WHEN _owner_kind = 'user' THEN _owner_id = auth.uid()::text
    -- Faceta (perfil) de la cuenta: os_account_profiles.id · os_profiles.user_id.
    WHEN _owner_kind = 'profile' THEN (
         EXISTS (SELECT 1 FROM public.os_account_profiles ap
                  WHERE ap.id::text = _owner_id AND ap.account = auth.uid())
      OR _owner_id = auth.uid()::text
    )
    -- Entidades públicas (identificadas por slug): dueño o miembro.
    WHEN _owner_kind IN ('page','group','community','event','ef','party')
      THEN public.es_is_entity_member(_owner_id)
    WHEN _owner_kind = 'other' THEN public.es_can_access_other(_owner_id)
    ELSE false
  END;
$$;

-- ¿Puede LEERSE? Transparente en lo público, privado en lo personal.
CREATE OR REPLACE FUNCTION public.es_can_read(_owner_kind text, _owner_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    -- Lo que una entidad pública publica (layout, secciones, galería,
    -- biblioteca, temario…) lo lee cualquiera — es lo que ya asume la UI de
    -- /pagina/[slug] y /grupo/[slug] para cualquier visitante.
    WHEN _owner_kind IN ('page','group','community','event','ef','party') THEN true
    -- Gobernanza colectiva: lectura pública (transparencia del poder público).
    WHEN _owner_kind = 'other' AND _owner_id NOT LIKE 'srv:%' THEN true
    ELSE public.es_can_write(_owner_kind, _owner_id)
  END;
$$;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1 · public.entity_state                                                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.entity_state (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_kind  text NOT NULL,
  owner_id    text NOT NULL,
  key         text NOT NULL,
  value       jsonb NOT NULL DEFAULT '{}'::jsonb,
  rev         bigint NOT NULL DEFAULT 1,
  device_id   text,
  updated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- UNIQUE exigida por el upsert del cliente:
--   .upsert({...}, { onConflict: "owner_kind,owner_id,key" })
CREATE UNIQUE INDEX IF NOT EXISTS entity_state_owner_key_uidx
  ON public.entity_state (owner_kind, owner_id, key);
CREATE INDEX IF NOT EXISTS entity_state_owner_idx ON public.entity_state (owner_id);
CREATE INDEX IF NOT EXISTS entity_state_key_idx   ON public.entity_state (key);

-- rev (LWW) + updated_at + updated_by los mantiene la BD: el cliente NO los envía.
CREATE OR REPLACE FUNCTION public.entity_state_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := coalesce(auth.uid(), NEW.updated_by);
  IF TG_OP = 'UPDATE' THEN
    NEW.rev := coalesce(OLD.rev, 0) + 1;
    NEW.created_at := OLD.created_at;
  ELSE
    NEW.rev := coalesce(NEW.rev, 1);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS entity_state_touch_trg ON public.entity_state;
CREATE TRIGGER entity_state_touch_trg
  BEFORE INSERT OR UPDATE ON public.entity_state
  FOR EACH ROW EXECUTE FUNCTION public.entity_state_touch();

ALTER TABLE public.entity_state ENABLE ROW LEVEL SECURITY;
-- Realtime: los DELETE solo traen la identidad de réplica; FULL permite filtrar
-- (`filter: owner_id=eq.…`) también en borrados.
ALTER TABLE public.entity_state REPLICA IDENTITY FULL;

DROP POLICY IF EXISTS entity_state_select ON public.entity_state;
CREATE POLICY entity_state_select ON public.entity_state
  FOR SELECT TO public
  USING (public.es_can_read(owner_kind, owner_id));

DROP POLICY IF EXISTS entity_state_insert ON public.entity_state;
CREATE POLICY entity_state_insert ON public.entity_state
  FOR INSERT TO authenticated
  WITH CHECK (public.es_can_write(owner_kind, owner_id));

DROP POLICY IF EXISTS entity_state_update ON public.entity_state;
CREATE POLICY entity_state_update ON public.entity_state
  FOR UPDATE TO authenticated
  USING (public.es_can_write(owner_kind, owner_id))
  WITH CHECK (public.es_can_write(owner_kind, owner_id));

DROP POLICY IF EXISTS entity_state_delete ON public.entity_state;
CREATE POLICY entity_state_delete ON public.entity_state
  FOR DELETE TO authenticated
  USING (public.es_can_write(owner_kind, owner_id));

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2 · public.os_files (metadatos del bucket `os-files` de Storage)          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.os_files (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id uuid,
  name       text NOT NULL,
  mime       text,
  size       bigint,
  path       text NOT NULL,          -- `<uid>/<carpeta>/<archivo>` en el bucket
  url        text,                   -- URL pública (getPublicUrl)
  device_id  text,                   -- neurona que subió el archivo
  is_public  boolean NOT NULL DEFAULT false,
  acl_read   uuid[] NOT NULL DEFAULT '{}',
  acl_write  uuid[] NOT NULL DEFAULT '{}',
  group_slug text,
  meta       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS os_files_owner_created_idx ON public.os_files (owner, created_at DESC);
CREATE INDEX IF NOT EXISTS os_files_public_created_idx ON public.os_files (created_at DESC) WHERE is_public;
CREATE INDEX IF NOT EXISTS os_files_device_idx ON public.os_files (device_id);
CREATE INDEX IF NOT EXISTS os_files_group_idx  ON public.os_files (group_slug);
CREATE INDEX IF NOT EXISTS os_files_url_idx    ON public.os_files (url);   -- findFileByUrl
CREATE UNIQUE INDEX IF NOT EXISTS os_files_path_uidx ON public.os_files (path);

ALTER TABLE public.os_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.os_files REPLICA IDENTITY FULL;  -- subscribeMyFiles filtra owner=eq.<uid>

-- Dueño: todo sobre sus filas.
DROP POLICY IF EXISTS osf_own ON public.os_files;
CREATE POLICY osf_own ON public.os_files
  FOR ALL TO authenticated
  USING (owner = auth.uid())
  WITH CHECK (owner = auth.uid());

-- Lectura: públicos (también anónimos — el bucket ya es público-lectura),
-- ACL explícita, o miembros del grupo con el que se compartió.
DROP POLICY IF EXISTS osf_select ON public.os_files;
CREATE POLICY osf_select ON public.os_files
  FOR SELECT TO public
  USING (
    is_public
    OR owner = auth.uid()
    OR (auth.uid() IS NOT NULL AND auth.uid() = ANY (acl_read))
    OR (auth.uid() IS NOT NULL AND auth.uid() = ANY (acl_write))
    OR (group_slug IS NOT NULL AND public.es_is_entity_member(group_slug))
  );

-- Escritura compartida: quien está en acl_write.
DROP POLICY IF EXISTS osf_shared_write ON public.os_files;
CREATE POLICY osf_shared_write ON public.os_files
  FOR UPDATE TO authenticated
  USING (auth.uid() = ANY (acl_write))
  WITH CHECK (auth.uid() = ANY (acl_write));

-- ── Storage: las políticas de 20260711000000_storage_policies.sql permiten a
-- CUALQUIER autenticado actualizar/borrar CUALQUIER objeto del bucket os-files.
-- El contrato documentado en src/lib/files/os-files.ts (y la Identidad Soberana,
-- CLAUDE.md §6) exige el prefijo propio `<auth.uid()>/…`. Todas las escrituras
-- del código pasan por uploadFile(), que SIEMPRE escribe en `${uid}/…`, así que
-- restringir no rompe ninguna ruta existente.
DROP POLICY IF EXISTS "Auth Insert Files" ON storage.objects;
DROP POLICY IF EXISTS "Auth Update Files" ON storage.objects;
DROP POLICY IF EXISTS "Auth Delete Files" ON storage.objects;
DROP POLICY IF EXISTS "os_files_own_insert" ON storage.objects;
DROP POLICY IF EXISTS "os_files_own_update" ON storage.objects;
DROP POLICY IF EXISTS "os_files_own_delete" ON storage.objects;

CREATE POLICY "os_files_own_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'os-files' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "os_files_own_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'os-files' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'os-files' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "os_files_own_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'os-files' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 3 · public.entity_mentions (menciones @/# de una publicación)             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.entity_mentions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL,                 -- "post"
  source_id   text NOT NULL,                 -- id del post entregado
  target_type text NOT NULL,                 -- profile|group|page|post|topic|…
  target_id   text NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('@', '#')),
  created_by  uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Sin UNIQUE a propósito: mentions.ts hace `.insert(rows)` plano; una violación
-- de unicidad tumbaría el lote entero y las menciones se perderían en silencio.
CREATE INDEX IF NOT EXISTS entity_mentions_source_idx ON public.entity_mentions (source_type, source_id);
CREATE INDEX IF NOT EXISTS entity_mentions_target_idx ON public.entity_mentions (target_type, target_id);
CREATE INDEX IF NOT EXISTS entity_mentions_author_idx ON public.entity_mentions (created_by);

ALTER TABLE public.entity_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_mentions REPLICA IDENTITY FULL;

-- Las menciones enlazan contenido ya público (publicaciones ↔ entidades): se
-- leen públicamente (una entidad debe poder ver quién la menciona).
DROP POLICY IF EXISTS entity_mentions_select ON public.entity_mentions;
CREATE POLICY entity_mentions_select ON public.entity_mentions
  FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS entity_mentions_insert ON public.entity_mentions;
CREATE POLICY entity_mentions_insert ON public.entity_mentions
  FOR INSERT TO authenticated
  WITH CHECK (created_by IS NULL OR created_by = auth.uid());

DROP POLICY IF EXISTS entity_mentions_update ON public.entity_mentions;
CREATE POLICY entity_mentions_update ON public.entity_mentions
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS entity_mentions_delete ON public.entity_mentions;
CREATE POLICY entity_mentions_delete ON public.entity_mentions
  FOR DELETE TO authenticated
  USING (created_by = auth.uid());

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 4 · public.os_contexts (contexto de Aurora por usuario y destino)         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.os_contexts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_kind text NOT NULL,          -- 'user' | 'group' | 'page' | …
  target_id   text NOT NULL,
  settings    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Clave natural del lookup de getAstrauraContext (y del upsert de sync-manager).
CREATE UNIQUE INDEX IF NOT EXISTS os_contexts_user_target_uidx
  ON public.os_contexts (user_id, target_kind, target_id);

CREATE OR REPLACE FUNCTION public.os_contexts_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' THEN
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS os_contexts_touch_trg ON public.os_contexts;
CREATE TRIGGER os_contexts_touch_trg
  BEFORE INSERT OR UPDATE ON public.os_contexts
  FOR EACH ROW EXECUTE FUNCTION public.os_contexts_touch();

ALTER TABLE public.os_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.os_contexts REPLICA IDENTITY FULL;

-- Exocórtex: el contexto es del usuario y solo del usuario (privado en lo
-- personal — CLAUDE.md §3 Ciberdelia: la IA es leal al usuario, no al sistema).
DROP POLICY IF EXISTS os_contexts_own ON public.os_contexts;
CREATE POLICY os_contexts_own ON public.os_contexts
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 5 · Realtime — publicación supabase_realtime (patrón 20260711120000)      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

DO $$
DECLARE
    t text;
    tables text[] := ARRAY['entity_state', 'os_files', 'entity_mentions', 'os_contexts'];
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
