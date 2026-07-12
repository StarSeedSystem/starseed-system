-- ════════════════════════════════════════════════════════════════════════════
-- TABLAS NÚCLEO AUSENTES · Espacios compartidos, Neuronas y Servidores de apps
-- (Adenda 63 §5 · SOP §11 · architecture/centro-creacion-sync-permisos.md)
--
-- CAUSA RAÍZ QUE ARREGLA: el código del OS (src/lib/spaces/spaces.ts,
-- src/lib/sharing/access.ts, src/lib/neurons/neurons.ts, src/lib/servers/
-- app-servers.ts) escribía contra tablas que NUNCA existieron en el Supabase
-- del OS (nxstilnyidvkqeosofuh) — los módulos tragan los errores en silencio
-- ("nunca lanza, degrada a []/null"), así que el sistema de permisos, la
-- compartición y las neuronas NO PERSISTÍAN NADA.
--
--   · os_spaces             — espacios compartidos (escritorio/dashboard/pizarra)
--   · os_space_editors      — invitados/editores por cuenta
--   · neuron_devices        — registro vivo de dispositivos (heartbeat)
--   · os_app_servers        — servidores de apps/juegos/entornos
--   · os_app_server_members — membresías de esos servidores
--
-- El esquema se DERIVA DEL CÓDIGO (columnas, onConflict, filtros .eq() y
-- valores que el cliente escribe de verdad), no de suposiciones.
--
-- RLS SIN RECURSIÓN: os_spaces necesita consultar os_space_editors y viceversa.
-- Se rompe el ciclo con funciones SECURITY DEFINER (mismo patrón que
-- 20260711000001_fix_entity_roles_rls.sql / check_entity_role): al ejecutarse
-- como el dueño de las tablas, saltan RLS y no re-disparan las políticas.
--
-- Idempotente: create table/index if not exists + drop policy if exists.
-- ════════════════════════════════════════════════════════════════════════════

/* ═══════════════════════════ 1 · os_spaces ═══════════════════════════════ */
-- Derivado de spaces.ts (createSpace/updateSpaceMeta/updateSpaceDoc/mapSpaceRow):
--   kind    ∈ desktop|dashboard|board   (SpaceKind; access.ts::spaceKindFor mapea
--            brain/file/folder/library → 'dashboard', el tipo real va en doc.sharing)
--   access  ∈ private|profiles|invite|public  (SpaceAccess)
CREATE TABLE IF NOT EXISTS public.os_spaces (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind             text NOT NULL DEFAULT 'board'
                     CHECK (kind IN ('desktop', 'dashboard', 'board')),
  title            text NOT NULL DEFAULT 'Sin título',
  owner_account    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  anchor_profile   uuid,
  access           text NOT NULL DEFAULT 'private'
                     CHECK (access IN ('private', 'profiles', 'invite', 'public')),
  allowed_profiles uuid[] NOT NULL DEFAULT '{}',
  group_slug       text,
  doc              jsonb NOT NULL DEFAULT '{}'::jsonb,
  device_id        text,
  rev              bigint NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Índices para los filtros REALES del cliente.
CREATE INDEX IF NOT EXISTS os_spaces_owner_idx      ON public.os_spaces (owner_account);          -- listOwnedSpaces
CREATE INDEX IF NOT EXISTS os_spaces_kind_idx       ON public.os_spaces (kind);                   -- listMySpaces(kind)
CREATE INDEX IF NOT EXISTS os_spaces_updated_idx    ON public.os_spaces (updated_at DESC);        -- .order(updated_at)
CREATE INDEX IF NOT EXISTS os_spaces_group_idx      ON public.os_spaces (group_slug);             -- pizarras de grupo
CREATE INDEX IF NOT EXISTS os_spaces_doc_gin        ON public.os_spaces USING gin (doc jsonb_path_ops); -- access.ts .contains("doc", …)
CREATE INDEX IF NOT EXISTS os_spaces_profiles_gin   ON public.os_spaces USING gin (allowed_profiles);

/* ═══════════════════════ 2 · os_space_editors ════════════════════════════ */
-- Derivado de spaces.ts: upsert onConflict "space_id,account" ⇒ PK compuesta.
--   role   ∈ editor|viewer          (SpaceEditorRole)
--   status ∈ member|invited|pending (SpaceEditorStatus)
CREATE TABLE IF NOT EXISTS public.os_space_editors (
  space_id   uuid NOT NULL REFERENCES public.os_spaces(id) ON DELETE CASCADE,
  account    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       text NOT NULL DEFAULT 'editor' CHECK (role IN ('editor', 'viewer')),
  status     text NOT NULL DEFAULT 'member' CHECK (status IN ('member', 'invited', 'pending')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (space_id, account)
);

CREATE INDEX IF NOT EXISTS os_space_editors_account_idx ON public.os_space_editors (account, status); -- listMyInvites
CREATE INDEX IF NOT EXISTS os_space_editors_space_idx   ON public.os_space_editors (space_id);        -- listSpaceEditors

/* ═════════════════ 3 · Trigger de rev/updated_at (LWW) ═══════════════════ */
-- spaces.ts documenta `rev(trigger)` y LWW por rev + device_id anti-eco.
-- Además BLINDA las columnas inmutables: un editor NO puede robar el espacio
-- cambiando owner_account (el enforcement vive en columnas, no en el doc).
CREATE OR REPLACE FUNCTION public.os_spaces_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.rev           := COALESCE(OLD.rev, 0) + 1;
  NEW.updated_at    := now();
  NEW.id            := OLD.id;
  NEW.owner_account := OLD.owner_account;
  NEW.created_at    := OLD.created_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS os_spaces_touch_trg ON public.os_spaces;
CREATE TRIGGER os_spaces_touch_trg
  BEFORE UPDATE ON public.os_spaces
  FOR EACH ROW EXECUTE FUNCTION public.os_spaces_touch();

/* ═══════════ 4 · Funciones SECURITY DEFINER (rompen la recursión) ════════ */
-- Al ser SECURITY DEFINER (dueño = dueño de las tablas) saltan RLS: os_spaces
-- puede mirar os_space_editors y viceversa sin re-entrar en las políticas.
--
-- ⚠️ REGLA CRÍTICA (aprendida a base de fallo real): las políticas de una tabla
-- NUNCA deben llamar a una función que RELEA ESA MISMA TABLA. Postgres aplica
-- las políticas de SELECT también a `INSERT … RETURNING` (que es exactamente lo
-- que genera PostgREST con `.insert({…}).select("*")` en createSpace/
-- createServer), y la fila recién insertada AÚN NO es visible para el snapshot
-- de la función ⇒ la política daría false y el insert fallaría SIEMPRE.
-- Por eso sp_select/sp_update y as_select se evalúan INLINE sobre las columnas
-- de la propia fila, y solo delegan en funciones definer para consultar OTRAS
-- tablas (os_space_editors, os_memberships, os_account_profiles).

-- ¿Pertenezco al grupo? (os_memberships)
CREATE OR REPLACE FUNCTION public.os_is_group_member(_slug text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _slug IS NOT NULL AND auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.os_memberships m
    WHERE m.group_slug = _slug AND m.user_id = auth.uid()
  );
$$;

-- ¿Alguno de esos perfiles es de MI cuenta? (os_account_profiles)
CREATE OR REPLACE FUNCTION public.os_owns_profile(_profile_ids uuid[])
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_length(_profile_ids, 1), 0) > 0
     AND auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.os_account_profiles p
       WHERE p.id = ANY (_profile_ids) AND p.account = auth.uid()
     );
$$;

-- Estado / rol de una fila de os_space_editors (SOLO lee os_space_editors).
CREATE OR REPLACE FUNCTION public.space_editor_status(_space_id uuid, _account uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.status FROM public.os_space_editors e
  WHERE e.space_id = _space_id AND e.account = _account;
$$;

CREATE OR REPLACE FUNCTION public.space_editor_role(_space_id uuid, _account uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.role FROM public.os_space_editors e
  WHERE e.space_id = _space_id AND e.account = _account;
$$;

-- ¿Soy el dueño del espacio? (barato, sin tocar os_space_editors)
CREATE OR REPLACE FUNCTION public.space_is_owner(_space_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.os_spaces s
    WHERE s.id = _space_id AND s.owner_account = auth.uid()
  );
$$;

-- ¿Puedo EDITAR el espacio?
--   dueño · miembro del grupo (group_slug) · perfil mío en allowed_profiles ·
--   editor con status='member' y role='editor'.
-- NOTA (desviación consciente del comentario legado de spaces.ts, que decía
-- "público = edición"): 'public' concede LECTURA a todo el mundo, NO edición.
-- El diálogo de la Adenda 63 (share-access-dialog) ofrece explícitamente
-- "Público · Ver" por defecto; conceder escritura global a cualquier espacio
-- público rompería esa promesa. Para colaboración con externos: 'invite'
-- (os_space_editors) o 'profiles'/grupo.
-- Solo para las políticas de os_space_editors (NUNCA para las de os_spaces:
-- ver la regla crítica de §4).
CREATE OR REPLACE FUNCTION public.space_can_edit(_space_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.os_spaces s
    WHERE s.id = _space_id
      AND auth.uid() IS NOT NULL
      AND (
            s.owner_account = auth.uid()
        OR  public.os_is_group_member(s.group_slug)
        OR  public.os_owns_profile(s.allowed_profiles)
        OR (public.space_editor_status(s.id, auth.uid()) = 'member'
            AND public.space_editor_role(s.id, auth.uid()) = 'editor')
      )
  );
$$;

-- ¿Puedo LEER el espacio?
--   público (incluso anónimo: enlaces de solo lectura) · todo el que puede
--   editar · editor/viewer con status 'member' · invitado ('invited', para que
--   la bandeja de invitaciones muestre título/kind antes de aceptar).
-- 'pending' (auto-solicitud) NO concede NADA — si no, cualquiera se insertaría
-- una fila pending y leería espacios ajenos.
CREATE OR REPLACE FUNCTION public.space_can_read(_space_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.os_spaces s
    WHERE s.id = _space_id AND s.access = 'public'
  )
  OR public.space_can_edit(_space_id)
  OR public.space_editor_status(_space_id, auth.uid()) IN ('member', 'invited');
$$;

/* ══════ 5 · Guarda de transiciones de os_space_editors (anti-escalada) ════ */
-- RLS permisiva OR-ea los WITH CHECK de varias políticas, así que la regla
-- "invited→member sí, pending→member NO" no puede expresarse solo con
-- políticas. Se enforce en un BEFORE UPDATE trigger, que sí ve OLD y NEW.
CREATE OR REPLACE FUNCTION public.os_space_editors_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- El dueño del espacio (o un rol privilegiado sin auth.uid()) puede todo.
  IF auth.uid() IS NULL OR public.space_is_owner(OLD.space_id) THEN
    RETURN NEW;
  END IF;

  -- Auto-servicio: nunca puede cambiar de espacio/cuenta ni auto-promoverse de rol.
  NEW.space_id := OLD.space_id;
  NEW.account  := OLD.account;
  NEW.role     := OLD.role;

  -- Transiciones permitidas para uno mismo:
  --   invited → member  (aceptar invitación)
  --   invited → invited / pending → pending  (upsert idempotente)
  IF NOT (
       (OLD.status = 'invited' AND NEW.status IN ('member', 'invited'))
    OR (OLD.status = 'pending' AND NEW.status = 'pending')
    OR (OLD.status = NEW.status)
  ) THEN
    RAISE EXCEPTION 'os_space_editors: transición de estado no permitida (% → %)', OLD.status, NEW.status
      USING ERRCODE = '42501';
  END IF;

  -- Un 'member' no puede auto-degradarse/auto-promoverse a otro estado.
  IF OLD.status = 'member' AND NEW.status <> 'member' THEN
    RAISE EXCEPTION 'os_space_editors: un miembro no puede cambiar su propio estado'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS os_space_editors_guard_trg ON public.os_space_editors;
CREATE TRIGGER os_space_editors_guard_trg
  BEFORE UPDATE ON public.os_space_editors
  FOR EACH ROW EXECUTE FUNCTION public.os_space_editors_guard();

/* ═════════════════════ 6 · RLS de espacios ═══════════════════════════════ */
ALTER TABLE public.os_spaces        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.os_space_editors ENABLE ROW LEVEL SECURITY;

-- INLINE sobre las columnas de la fila (ver regla crítica §4): así
-- `INSERT … RETURNING` (createSpace) y `UPDATE … RETURNING` (updateSpaceDoc)
-- pueden devolver la fila recién escrita.
--   LECTURA: público (incl. anónimo) · dueño · miembro del grupo · perfil mío
--   en allowed_profiles · editor/viewer 'member' · 'invited' (para que la
--   bandeja de invitaciones muestre título/kind antes de aceptar).
--   'pending' (auto-solicitud) NO concede NADA.
DROP POLICY IF EXISTS sp_select ON public.os_spaces;
CREATE POLICY sp_select ON public.os_spaces
  FOR SELECT USING (
    access = 'public'
    OR (
      auth.uid() IS NOT NULL AND (
           owner_account = auth.uid()
        OR public.os_is_group_member(group_slug)
        OR public.os_owns_profile(allowed_profiles)
        OR public.space_editor_status(id, auth.uid()) IN ('member', 'invited')
      )
    )
  );

DROP POLICY IF EXISTS sp_insert ON public.os_spaces;
CREATE POLICY sp_insert ON public.os_spaces
  FOR INSERT WITH CHECK (owner_account = auth.uid());

--   EDICIÓN: dueño · miembro del grupo · perfil mío en allowed_profiles ·
--   editor 'member' con role='editor'. (Público = SOLO LECTURA, ver §4.)
DROP POLICY IF EXISTS sp_update ON public.os_spaces;
CREATE POLICY sp_update ON public.os_spaces
  FOR UPDATE USING (
    auth.uid() IS NOT NULL AND (
         owner_account = auth.uid()
      OR public.os_is_group_member(group_slug)
      OR public.os_owns_profile(allowed_profiles)
      OR (public.space_editor_status(id, auth.uid()) = 'member'
          AND public.space_editor_role(id, auth.uid()) = 'editor')
    )
  ) WITH CHECK (
    auth.uid() IS NOT NULL AND (
         owner_account = auth.uid()
      OR public.os_is_group_member(group_slug)
      OR public.os_owns_profile(allowed_profiles)
      OR (public.space_editor_status(id, auth.uid()) = 'member'
          AND public.space_editor_role(id, auth.uid()) = 'editor')
    )
  );

DROP POLICY IF EXISTS sp_delete ON public.os_spaces;
CREATE POLICY sp_delete ON public.os_spaces
  FOR DELETE USING (owner_account = auth.uid());

-- Editores: veo MI fila siempre; el resto del roster solo si puedo leer el espacio.
DROP POLICY IF EXISTS spe_select ON public.os_space_editors;
CREATE POLICY spe_select ON public.os_space_editors
  FOR SELECT USING (account = auth.uid() OR public.space_can_read(space_id));

-- El dueño del espacio gestiona invitaciones/aprobaciones/expulsiones.
DROP POLICY IF EXISTS spe_owner ON public.os_space_editors;
CREATE POLICY spe_owner ON public.os_space_editors
  FOR ALL USING (public.space_is_owner(space_id))
          WITH CHECK (public.space_is_owner(space_id));

-- Auto-solicitud de acceso: solo MI fila y solo en estado 'pending'
-- (requestSpaceAccess). 'pending' no concede ningún permiso.
DROP POLICY IF EXISTS spe_self_request ON public.os_space_editors;
CREATE POLICY spe_self_request ON public.os_space_editors
  FOR INSERT WITH CHECK (account = auth.uid() AND status = 'pending');

-- Aceptar invitación (invited→member) / upsert idempotente. La transición real
-- la valida os_space_editors_guard (arriba).
DROP POLICY IF EXISTS spe_self_update ON public.os_space_editors;
CREATE POLICY spe_self_update ON public.os_space_editors
  FOR UPDATE USING (account = auth.uid())
             WITH CHECK (account = auth.uid());

-- Rechazar invitación / retirar solicitud / abandonar (justicia no punitiva).
DROP POLICY IF EXISTS spe_self_delete ON public.os_space_editors;
CREATE POLICY spe_self_delete ON public.os_space_editors
  FOR DELETE USING (account = auth.uid());

/* ═══════════════════════ 7 · neuron_devices ══════════════════════════════ */
-- Derivado de neurons.ts: upsert onConflict "id"; el heartbeat manda SOLO
-- {id, owner, last_seen_at} ⇒ name/kind/capabilities/permissions DEBEN admitir
-- null (si no, un heartbeat sobre fila inexistente fallaría).
-- ⚠️ `id` es TEXT, no uuid: thisDeviceId() cae a `n-<base36>` si crypto.randomUUID falla.
CREATE TABLE IF NOT EXISTS public.neuron_devices (
  id           text PRIMARY KEY,
  owner        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         text,
  kind         text CHECK (kind IS NULL OR kind IN ('desktop', 'laptop', 'mobile', 'tablet', 'server', 'other')),
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  permissions  jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS neuron_devices_owner_idx ON public.neuron_devices (owner, last_seen_at DESC);

ALTER TABLE public.neuron_devices ENABLE ROW LEVEL SECURITY;

-- Identidad soberana (§6): las neuronas son de la CUENTA y de nadie más.
DROP POLICY IF EXISTS neuron_devices_select ON public.neuron_devices;
CREATE POLICY neuron_devices_select ON public.neuron_devices
  FOR SELECT USING (owner = auth.uid());

DROP POLICY IF EXISTS neuron_devices_insert ON public.neuron_devices;
CREATE POLICY neuron_devices_insert ON public.neuron_devices
  FOR INSERT WITH CHECK (owner = auth.uid());

DROP POLICY IF EXISTS neuron_devices_update ON public.neuron_devices;
CREATE POLICY neuron_devices_update ON public.neuron_devices
  FOR UPDATE USING (owner = auth.uid()) WITH CHECK (owner = auth.uid());

DROP POLICY IF EXISTS neuron_devices_delete ON public.neuron_devices;
CREATE POLICY neuron_devices_delete ON public.neuron_devices
  FOR DELETE USING (owner = auth.uid());

/* ═══════════════════════ 8 · os_app_servers ══════════════════════════════ */
-- Derivado de app-servers.ts (createServer/listServers/joinOrRequest).
-- createServer reintenta el slug ante código 23505 ⇒ slug ÚNICO.
CREATE TABLE IF NOT EXISTS public.os_app_servers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  kind        text NOT NULL DEFAULT 'app'
                CHECK (kind IN ('app', 'juego', 'entorno', 'programa', 'otro')),
  visibility  text NOT NULL DEFAULT 'public'
                CHECK (visibility IN ('public', 'private', 'group')),
  group_slug  text,
  app_route   text,
  app_url     text,
  icon        text,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  owner       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS os_app_servers_visibility_idx ON public.os_app_servers (visibility);
CREATE INDEX IF NOT EXISTS os_app_servers_group_idx      ON public.os_app_servers (group_slug);
CREATE INDEX IF NOT EXISTS os_app_servers_owner_idx      ON public.os_app_servers (owner);

/* ═══════════════════ 9 · os_app_server_members ═══════════════════════════ */
-- upsert onConflict "server_id,user_id" ⇒ PK compuesta. status ∈ member|pending|banned.
CREATE TABLE IF NOT EXISTS public.os_app_server_members (
  server_id uuid NOT NULL REFERENCES public.os_app_servers(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role      text NOT NULL DEFAULT 'member',
  status    text NOT NULL DEFAULT 'member'
              CHECK (status IN ('member', 'pending', 'banned')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (server_id, user_id)
);

CREATE INDEX IF NOT EXISTS os_app_server_members_user_idx   ON public.os_app_server_members (user_id, status);
CREATE INDEX IF NOT EXISTS os_app_server_members_server_idx ON public.os_app_server_members (server_id);

/* ═════════ 10 · SECURITY DEFINER de servidores (rompen recursión) ════════ */
-- Mismo ciclo que en espacios: os_app_servers ↔ os_app_server_members.
CREATE OR REPLACE FUNCTION public.app_server_is_owner(_server_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.os_app_servers s
    WHERE s.id = _server_id AND s.owner = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.app_server_visibility(_server_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.visibility FROM public.os_app_servers s WHERE s.id = _server_id;
$$;

-- Estado de MI membresía (SOLO lee os_app_server_members ⇒ usable inline en las
-- políticas de os_app_servers sin romper `INSERT … RETURNING` de createServer).
CREATE OR REPLACE FUNCTION public.app_server_member_status(_server_id uuid, _user_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.status FROM public.os_app_server_members m
  WHERE m.server_id = _server_id AND m.user_id = _user_id;
$$;

-- Visible si: público · soy el dueño · es de un grupo al que pertenezco ·
-- soy miembro activo (listServers("mine") lee servidores privados por id).
-- Solo para las políticas de os_app_server_members (lee os_app_servers).
CREATE OR REPLACE FUNCTION public.app_server_can_read(_server_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.os_app_servers s
    WHERE s.id = _server_id
      AND (
            s.visibility = 'public'
        OR (auth.uid() IS NOT NULL AND s.owner = auth.uid())
        OR (s.visibility = 'group' AND public.os_is_group_member(s.group_slug))
        OR  public.app_server_member_status(s.id, auth.uid()) = 'member'
      )
  );
$$;

ALTER TABLE public.os_app_servers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.os_app_server_members ENABLE ROW LEVEL SECURITY;

-- INLINE (regla crítica §4): createServer hace `.insert(…).select("*").single()`
-- ⇒ INSERT … RETURNING ⇒ la política de SELECT se evalúa sobre la fila nueva.
DROP POLICY IF EXISTS as_select ON public.os_app_servers;
CREATE POLICY as_select ON public.os_app_servers
  FOR SELECT USING (
    visibility = 'public'
    OR (
      auth.uid() IS NOT NULL AND (
           owner = auth.uid()
        OR (visibility = 'group' AND public.os_is_group_member(group_slug))
        OR public.app_server_member_status(id, auth.uid()) = 'member'
      )
    )
  );

DROP POLICY IF EXISTS as_insert ON public.os_app_servers;
CREATE POLICY as_insert ON public.os_app_servers
  FOR INSERT WITH CHECK (owner = auth.uid());

DROP POLICY IF EXISTS as_update ON public.os_app_servers;
CREATE POLICY as_update ON public.os_app_servers
  FOR UPDATE USING (owner = auth.uid()) WITH CHECK (owner = auth.uid());

DROP POLICY IF EXISTS as_delete ON public.os_app_servers;
CREATE POLICY as_delete ON public.os_app_servers
  FOR DELETE USING (owner = auth.uid());

-- Roster: mi fila siempre; el resto solo si puedo ver el servidor
-- (memberCount de los públicos debe poder calcularse).
DROP POLICY IF EXISTS asm_select ON public.os_app_server_members;
CREATE POLICY asm_select ON public.os_app_server_members
  FOR SELECT USING (user_id = auth.uid() OR public.app_server_can_read(server_id));

-- El dueño aprueba (status→member), deniega (delete) y se auto-añade al crear.
DROP POLICY IF EXISTS asm_owner ON public.os_app_server_members;
CREATE POLICY asm_owner ON public.os_app_server_members
  FOR ALL USING (public.app_server_is_owner(server_id))
          WITH CHECK (public.app_server_is_owner(server_id));

-- Auto-servicio (joinOrRequest): entrada DIRECTA solo si el servidor es
-- público; en privado/grupo solo 'pending' (el dueño aprueba). Nunca 'banned',
-- nunca en nombre de otro. NO hay política de UPDATE para uno mismo ⇒ un
-- 'pending' no puede auto-promoverse a 'member'.
DROP POLICY IF EXISTS asm_self_join ON public.os_app_server_members;
CREATE POLICY asm_self_join ON public.os_app_server_members
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND (
         (status = 'member'  AND public.app_server_visibility(server_id) = 'public')
      OR (status = 'pending' AND public.app_server_can_read(server_id))
    )
  );

-- Abandonar / retirar solicitud (no punitivo).
DROP POLICY IF EXISTS asm_self_leave ON public.os_app_server_members;
CREATE POLICY asm_self_leave ON public.os_app_server_members
  FOR DELETE USING (user_id = auth.uid());

/* ═════════════════════════ 11 · Permisos de tabla ════════════════════════ */
GRANT SELECT, INSERT, UPDATE, DELETE ON public.os_spaces              TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.os_space_editors       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.neuron_devices         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.os_app_servers         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.os_app_server_members  TO authenticated;
-- Anónimo: solo lectura (enlaces públicos de espacios y catálogo de servidores
-- públicos). RLS sigue decidiendo fila a fila.
GRANT SELECT ON public.os_spaces             TO anon;
GRANT SELECT ON public.os_app_servers        TO anon;
GRANT SELECT ON public.os_app_server_members TO anon;

/* ═════════════ 12 · Realtime (patrón de 20260711120000) ══════════════════ */
-- REPLICA IDENTITY FULL: sin ella, Supabase Realtime no puede evaluar RLS ni
-- los filtros (`id=eq.…`, `space_id=eq.…`, `server_id=eq.…`) en UPDATE/DELETE.
ALTER TABLE public.os_spaces             REPLICA IDENTITY FULL;
ALTER TABLE public.os_space_editors      REPLICA IDENTITY FULL;
ALTER TABLE public.neuron_devices        REPLICA IDENTITY FULL;
ALTER TABLE public.os_app_servers        REPLICA IDENTITY FULL;
ALTER TABLE public.os_app_server_members REPLICA IDENTITY FULL;

DO $$
DECLARE
    t text;
    tables text[] := ARRAY[
        'os_spaces',              -- espacios compartidos (permisos, Adenda 63 §5)
        'os_space_editors',       -- editores/invitados de espacios
        'neuron_devices',         -- presencia de neuronas (heartbeat)
        'os_app_servers',         -- servidores de apps
        'os_app_server_members'   -- membresías (aprobar/denegar en vivo)
    ];
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
