-- ════════════════════════════════════════════════════════════════════════════
-- 20260712100100 · ACL por nodo (biblioteca · folder · archivo) + REGLA
--                   CUENTA ↔ PERFILES  (Adenda 66 · §3-§4)
-- ----------------------------------------------------------------------------
-- SOP: architecture/folders-permisos-publicaciones.md §3 y §4.
-- Base del OS: Supabase `nxstilnyidvkqeosofuh` (NO el de Nexus/Café).
--
-- REGLA NUEVA (obligatoria, §3):
--   Conceder acceso a UN perfil concede acceso a TODOS los perfiles de esa
--   cuenta, y a la inversa (el acceso concedido a la cuenta vale para
--   cualquiera de sus perfiles).
--
--   Por qué funciona: en el OS la sesión (`auth.uid()`) ES la CUENTA soberana
--   (CLAUDE.md §6 «Dualidad Cuenta/Perfil»: la responsabilidad recae siempre
--   sobre la Cuenta raíz). Los perfiles (`os_account_profiles.id`) son facetas
--   públicas de esa cuenta. Por tanto:
--     · grant a la CUENTA  → auth.uid() = <id>            (directo)
--     · grant a un PERFIL  → account_of_profile(<id>) = auth.uid()
--   Ambos casos autorizan a la cuenta entera y, con ella, a cualquiera de sus
--   perfiles. Una sola función (`acl_ids_allow`) cubre las DOS direcciones.
--
-- RECURSIÓN DE RLS: todas las funciones son SECURITY DEFINER + STABLE y leen
-- `os_account_profiles` (que tiene su propia RLS) SIN pasar por ella — nunca se
-- evalúa una política desde dentro de otra política.
--
-- ALCANCE:
--   1) account_of_profile / profiles_of_account  (mapa perfil ↔ cuenta)
--   2) acl_ids_allow(uuid[])                     (uuid[]: os_files.acl_read/write)
--   3) es_acl_node_allows(jsonb) / es_doc_acl_allows(jsonb)
--      (ACL embebida en el doc de entity_state: `acl` de la biblioteca, de cada
--       folder y de cada ítem — clave 'acl', modelo v3 con scope+grants y las
--       listas legadas read/write de la v2)
--   4) políticas de entity_state y os_files reescritas para usarlas.
--
-- LÍMITE HONESTO (documentado, no oculto): la biblioteca de una entidad es UNA
-- fila jsonb de `entity_state`. La RLS solo puede decidir a nivel de FILA: si
-- CUALQUIER nodo del documento te concede acceso, la fila entera es legible y
-- el filtrado por nodo lo hace el cliente (`visibleFor` en finder-types.ts, que
-- ya existía). Enforcement real por nodo solo es posible en `os_files` (una fila
-- por archivo), donde SÍ se aplica. Partir la biblioteca en filas por nodo es el
-- camino futuro; queda anotado en memory/state.md.
--
-- IDEMPOTENTE: re-ejecutable sin efectos secundarios.
-- ════════════════════════════════════════════════════════════════════════════

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1 · Mapa perfil ↔ cuenta (SECURITY DEFINER, sin recursión)                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- Cuenta dueña de un perfil (os_account_profiles.id → .account). NULL si el
-- uuid no es un perfil (p.ej. ya es una cuenta).
CREATE OR REPLACE FUNCTION public.account_of_profile(_profile_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ap.account FROM public.os_account_profiles ap WHERE ap.id = _profile_id;
$$;

-- Todos los perfiles (facetas) de una cuenta. '{}' si no tiene ninguno.
CREATE OR REPLACE FUNCTION public.profiles_of_account(_account uuid)
RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(array_agg(ap.id), '{}'::uuid[])
  FROM public.os_account_profiles ap
  WHERE ap.account = _account;
$$;

-- ¿Alguno de estos uuids (cuentas y/o perfiles) autoriza a la sesión actual?
-- LAS DOS DIRECCIONES de la regla cuenta↔perfiles, en una sola comprobación.
CREATE OR REPLACE FUNCTION public.acl_ids_allow(_ids uuid[])
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND _ids IS NOT NULL
     AND (
          -- (a) grant a la CUENTA → cualquiera de sus perfiles (la sesión ES la cuenta).
          auth.uid() = ANY (_ids)
          -- (b) grant a UN PERFIL → toda la cuenta dueña (y por tanto sus otros perfiles).
       OR EXISTS (
            SELECT 1 FROM unnest(_ids) AS x
            WHERE public.account_of_profile(x) = auth.uid()
          )
     );
$$;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2 · ACL embebida en el doc de entity_state (biblioteca · folder · ítem)   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Forma del nodo `acl` (src/lib/library/entity-library.ts · ItemACL):
--   v2 (legado, sigue soportado):
--     { "read":  [{ "kind": "user"|"group", "id": "<uuid|slug>" }, …],
--       "write": [ … ] }
--   v3 (Adenda 66, añadido AHORA — aditivo, no rompe la v2):
--     { "scope": "private|account|profiles|groups|pages|custom|public",
--       "grants": [{ "granteeKind": "account"|"profile"|"group"|"page"|"link",
--                    "granteeId": "<uuid|slug|public>",
--                    "role": "view"|"comment"|"edit"|"admin" }, …],
--       "showInProfile": true|false,
--       "read": […], "write": […] }   ← espejo v2 (lo consume el Finder)
--
-- _need = 'read' | 'write'.  write ⇒ solo roles edit/admin (y lista `write`).
CREATE OR REPLACE FUNCTION public.es_acl_node_allows(_acl jsonb, _need text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g    jsonb;
  e    jsonb;
  sc   text;
  gid  uuid;
  list text := CASE WHEN _need = 'write' THEN 'write' ELSE 'read' END;
BEGIN
  IF _acl IS NULL OR jsonb_typeof(_acl) <> 'object' THEN
    RETURN false;
  END IF;

  sc := _acl->>'scope';

  -- Público: lectura para cualquiera (también anónimos — transparente en lo
  -- público, CLAUDE.md §6). La ESCRITURA pública nunca se concede por scope.
  IF sc = 'public' AND _need = 'read' THEN
    RETURN true;
  END IF;

  -- 'private' cierra el nodo: ni los grants aplican (decisión explícita del dueño).
  IF sc = 'private' THEN
    RETURN false;
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  -- ── grants v3 ──
  IF jsonb_typeof(_acl->'grants') = 'array' THEN
    FOR g IN SELECT * FROM jsonb_array_elements(_acl->'grants') LOOP
      IF _need = 'write' AND coalesce(g->>'role', 'view') NOT IN ('edit', 'admin') THEN
        CONTINUE;
      END IF;
      IF g->>'granteeKind' IN ('group', 'page') THEN
        IF public.es_is_entity_member(g->>'granteeId') THEN
          RETURN true;
        END IF;
      ELSIF g->>'granteeKind' IN ('account', 'profile') THEN
        BEGIN
          gid := (g->>'granteeId')::uuid;
        EXCEPTION WHEN others THEN
          gid := NULL;   -- granteeId malformado: se ignora, nunca rompe la política
        END;
        IF gid IS NOT NULL AND public.acl_ids_allow(ARRAY[gid]) THEN
          RETURN true;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- ── listas legadas v2 (read/write) ──
  IF jsonb_typeof(_acl->list) = 'array' THEN
    FOR e IN SELECT * FROM jsonb_array_elements(_acl->list) LOOP
      IF e->>'kind' = 'group' THEN
        IF public.es_is_entity_member(e->>'id') THEN
          RETURN true;
        END IF;
      ELSE
        BEGIN
          gid := (e->>'id')::uuid;
        EXCEPTION WHEN others THEN
          gid := NULL;
        END;
        IF gid IS NOT NULL AND public.acl_ids_allow(ARRAY[gid]) THEN
          RETURN true;
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN false;
END;
$$;

-- ¿La ACL de ALGÚN nodo del documento (biblioteca / folder / ítem) autoriza a
-- la sesión actual? Ver "LÍMITE HONESTO" en la cabecera: la RLS decide por FILA.
CREATE OR REPLACE FUNCTION public.es_doc_acl_allows(_value jsonb, _need text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n jsonb;
BEGIN
  IF _value IS NULL OR jsonb_typeof(_value) <> 'object' THEN
    RETURN false;
  END IF;

  -- ACL de la BIBLIOTECA entera (clave `acl` del doc).
  IF public.es_acl_node_allows(_value->'acl', _need) THEN
    RETURN true;
  END IF;

  -- ACL propia de cada FOLDER.
  IF jsonb_typeof(_value->'folders') = 'array' THEN
    FOR n IN SELECT * FROM jsonb_array_elements(_value->'folders') LOOP
      IF public.es_acl_node_allows(n->'acl', _need) THEN
        RETURN true;
      END IF;
    END LOOP;
  END IF;

  -- ACL propia de cada ÍTEM (archivo/referencia).
  IF jsonb_typeof(_value->'items') = 'array' THEN
    FOR n IN SELECT * FROM jsonb_array_elements(_value->'items') LOOP
      IF public.es_acl_node_allows(n->'acl', _need) THEN
        RETURN true;
      END IF;
    END LOOP;
  END IF;

  RETURN false;
END;
$$;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 3 · entity_state — lectura/escritura también por ACL de nodo              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Se AÑADE la vía de ACL a las políticas existentes (no se quita nada):
--   dueño/miembro (es_can_read/es_can_write)  OR  ACL del doc (es_doc_acl_allows).

DROP POLICY IF EXISTS entity_state_select ON public.entity_state;
CREATE POLICY entity_state_select ON public.entity_state
  FOR SELECT TO public
  USING (
    public.es_can_read(owner_kind, owner_id)
    OR public.es_doc_acl_allows(value, 'read')
  );

DROP POLICY IF EXISTS entity_state_update ON public.entity_state;
CREATE POLICY entity_state_update ON public.entity_state
  FOR UPDATE TO authenticated
  USING (
    public.es_can_write(owner_kind, owner_id)
    OR public.es_doc_acl_allows(value, 'write')
  )
  WITH CHECK (
    public.es_can_write(owner_kind, owner_id)
    OR public.es_doc_acl_allows(value, 'write')
  );

-- INSERT y DELETE siguen siendo SOLO del dueño/miembro (no se conceden por ACL:
-- compartir un nodo nunca debe permitir crear ni destruir la biblioteca ajena —
-- justicia restaurativa, CLAUDE.md §6).

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 4 · os_files — ACL por ARCHIVO con la regla cuenta↔perfiles               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- acl_read/acl_write son uuid[] y admiten indistintamente uuids de CUENTA o de
-- PERFIL: `acl_ids_allow` resuelve las dos direcciones.

DROP POLICY IF EXISTS osf_select ON public.os_files;
CREATE POLICY osf_select ON public.os_files
  FOR SELECT TO public
  USING (
    is_public
    OR owner = auth.uid()
    OR public.acl_ids_allow(acl_read)
    OR public.acl_ids_allow(acl_write)
    OR (group_slug IS NOT NULL AND public.es_is_entity_member(group_slug))
  );

DROP POLICY IF EXISTS osf_shared_write ON public.os_files;
CREATE POLICY osf_shared_write ON public.os_files
  FOR UPDATE TO authenticated
  USING (public.acl_ids_allow(acl_write))
  WITH CHECK (public.acl_ids_allow(acl_write));

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 5 · Permisos de ejecución                                                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

GRANT EXECUTE ON FUNCTION public.account_of_profile(uuid)      TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.profiles_of_account(uuid)     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acl_ids_allow(uuid[])         TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.es_acl_node_allows(jsonb,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.es_doc_acl_allows(jsonb,text)  TO anon, authenticated;
