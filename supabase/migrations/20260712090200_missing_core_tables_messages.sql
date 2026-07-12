-- ════════════════════════════════════════════════════════════════════════════
-- StarSeed OS · Tablas núcleo AUSENTES: Mensajería y Voto Delegado
-- (Supabase del OS `nxstilnyidvkqeosofuh` — NO el de Nexus/Café)
--
-- El código las usaba desde hace olas, pero NUNCA existieron en la base: por eso
-- /messages y el voto líquido no podían funcionar (todo el acceso es defensivo y
-- degradaba a [] silenciosamente).
--
--   · os_dm_threads / os_dm_members / os_dm_messages
--       → `src/lib/messages/dm.ts` (Mensajes: DMs, grupos, adjuntos, Aurora por
--         hilo) y `src/lib/mail/os-mail.ts` (Correos: mismo backend, hilos
--         marcados con `meta.mail = true`).
--   · os_messages
--       → `src/ai/astraura/astraura-realtime.ts#injectAstrauraMemory` +
--         `src/lib/sync/sync-manager.ts` (memorias de Astraura, hilo por texto).
--         NO es la tabla de Mensajes: es un buzón de memorias del agente.
--   · vote_delegations
--       → `src/lib/governance/delegations.ts` (Ontocracia: voto líquido delegado,
--         revocable, por tema, con caducidad OBLIGATORIA).
--
-- RLS SIN RECURSIÓN (lección de `20260711000001_fix_entity_roles_rls.sql`): las
-- políticas de mensajería NO consultan las tablas entre sí desde SQL inline —
-- pasan por funciones SECURITY DEFINER (`is_dm_member`, `is_dm_thread_owner`)
-- que leen saltándose RLS. Sin ellas, `os_dm_messages → os_dm_members →
-- os_dm_threads → os_dm_members…` daría 42P17 (infinite recursion).
--
-- IDEMPOTENTE: create ... if not exists + drop policy if exists.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────── 1. Tablas de mensajería ────────────────────────

CREATE TABLE IF NOT EXISTS public.os_dm_threads (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL DEFAULT 'dm' CHECK (kind IN ('dm', 'group')),
  title       text,
  avatar_url  text,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  agent       jsonb,                                  -- ThreadAgentConfig | null (Aurora por hilo)
  meta        jsonb NOT NULL DEFAULT '{}'::jsonb,     -- { mail, subject, flags, readMarks, entityLink }
  last_msg_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.os_dm_members (
  thread_id uuid NOT NULL REFERENCES public.os_dm_threads(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role      text NOT NULL DEFAULT 'member',           -- 'owner' | 'member'
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, user_id)                    -- exigido por upsert onConflict "thread_id,user_id"
);

CREATE TABLE IF NOT EXISTS public.os_dm_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   uuid NOT NULL REFERENCES public.os_dm_threads(id) ON DELETE CASCADE,
  sender      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  body        text NOT NULL DEFAULT '',
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,     -- DmAttachment[] (jsonb, NO jsonb[]: se inserta un array JSON)
  reply_to    uuid REFERENCES public.os_dm_messages(id) ON DELETE SET NULL,
  kind        text NOT NULL DEFAULT 'user' CHECK (kind IN ('user', 'agent', 'system')),
  edited_at   timestamptz,
  deleted     boolean NOT NULL DEFAULT false,         -- soft-delete: `.eq("deleted", false)` en el contador de no-leídos
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS os_dm_threads_last_msg_at_idx ON public.os_dm_threads (last_msg_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS os_dm_threads_created_by_idx  ON public.os_dm_threads (created_by);
CREATE INDEX IF NOT EXISTS os_dm_members_user_id_idx     ON public.os_dm_members (user_id);
CREATE INDEX IF NOT EXISTS os_dm_messages_thread_idx     ON public.os_dm_messages (thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS os_dm_messages_sender_idx     ON public.os_dm_messages (sender);

-- ───────────── 2. Funciones SECURITY DEFINER (rompen la recursión) ──────────
-- Leen las tablas como propietario ⇒ RLS NO se re-evalúa dentro ⇒ sin 42P17.

CREATE OR REPLACE FUNCTION public.is_dm_member(_thread uuid, _uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.os_dm_members m
    WHERE m.thread_id = _thread AND m.user_id = _uid
  );
$$;

-- Necesaria para el ALTA: al crear un hilo (createDm/createGroup/sendMail) el
-- creador inserta TAMBIÉN la fila de membresía del OTRO usuario, y en ese
-- instante aún puede no ser "miembro" visible dentro del mismo statement.
CREATE OR REPLACE FUNCTION public.is_dm_thread_owner(_thread uuid, _uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.os_dm_threads t
    WHERE t.id = _thread AND t.created_by = _uid
  );
$$;

-- ────────────────────────── 3. RLS de mensajería ────────────────────────────

ALTER TABLE public.os_dm_threads  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.os_dm_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.os_dm_messages ENABLE ROW LEVEL SECURITY;

-- os_dm_threads: solo miembros (o el creador) ven/actualizan el hilo.
DROP POLICY IF EXISTS os_dm_threads_select ON public.os_dm_threads;
CREATE POLICY os_dm_threads_select ON public.os_dm_threads
FOR SELECT TO authenticated
USING (created_by = auth.uid() OR public.is_dm_member(id, auth.uid()));

DROP POLICY IF EXISTS os_dm_threads_insert ON public.os_dm_threads;
CREATE POLICY os_dm_threads_insert ON public.os_dm_threads
FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid());

-- Los miembros pueden tocar meta (readMarks/entityLink), agent y last_msg_at.
DROP POLICY IF EXISTS os_dm_threads_update ON public.os_dm_threads;
CREATE POLICY os_dm_threads_update ON public.os_dm_threads
FOR UPDATE TO authenticated
USING (created_by = auth.uid() OR public.is_dm_member(id, auth.uid()))
WITH CHECK (created_by = auth.uid() OR public.is_dm_member(id, auth.uid()));

DROP POLICY IF EXISTS os_dm_threads_delete ON public.os_dm_threads;
CREATE POLICY os_dm_threads_delete ON public.os_dm_threads
FOR DELETE TO authenticated
USING (created_by = auth.uid());

-- os_dm_members: ves tu propia membresía y la de los hilos donde estás.
DROP POLICY IF EXISTS os_dm_members_select ON public.os_dm_members;
CREATE POLICY os_dm_members_select ON public.os_dm_members
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_dm_member(thread_id, auth.uid()));

-- Alta: te añades tú, o eres el creador del hilo, o ya eres miembro (grupos).
DROP POLICY IF EXISTS os_dm_members_insert ON public.os_dm_members;
CREATE POLICY os_dm_members_insert ON public.os_dm_members
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  OR public.is_dm_thread_owner(thread_id, auth.uid())
  OR public.is_dm_member(thread_id, auth.uid())
);

-- UPDATE necesario para el upsert de `addMembers` (INSERT ... ON CONFLICT DO UPDATE).
DROP POLICY IF EXISTS os_dm_members_update ON public.os_dm_members;
CREATE POLICY os_dm_members_update ON public.os_dm_members
FOR UPDATE TO authenticated
USING (user_id = auth.uid() OR public.is_dm_thread_owner(thread_id, auth.uid()))
WITH CHECK (user_id = auth.uid() OR public.is_dm_thread_owner(thread_id, auth.uid()));

-- Baja: te sales tú, o te saca el creador del hilo.
DROP POLICY IF EXISTS os_dm_members_delete ON public.os_dm_members;
CREATE POLICY os_dm_members_delete ON public.os_dm_members
FOR DELETE TO authenticated
USING (user_id = auth.uid() OR public.is_dm_thread_owner(thread_id, auth.uid()));

-- os_dm_messages: SOLO miembros del hilo leen/escriben. Editar/borrar: solo lo propio.
DROP POLICY IF EXISTS os_dm_messages_select ON public.os_dm_messages;
CREATE POLICY os_dm_messages_select ON public.os_dm_messages
FOR SELECT TO authenticated
USING (public.is_dm_member(thread_id, auth.uid()));

-- `sender IS NULL` permitido para mensajes de agente/sistema (Aurora sin invoker).
DROP POLICY IF EXISTS os_dm_messages_insert ON public.os_dm_messages;
CREATE POLICY os_dm_messages_insert ON public.os_dm_messages
FOR INSERT TO authenticated
WITH CHECK (
  public.is_dm_member(thread_id, auth.uid())
  AND (sender = auth.uid() OR sender IS NULL)
);

DROP POLICY IF EXISTS os_dm_messages_update ON public.os_dm_messages;
CREATE POLICY os_dm_messages_update ON public.os_dm_messages
FOR UPDATE TO authenticated
USING (sender = auth.uid() AND public.is_dm_member(thread_id, auth.uid()))
WITH CHECK (sender = auth.uid());

DROP POLICY IF EXISTS os_dm_messages_delete ON public.os_dm_messages;
CREATE POLICY os_dm_messages_delete ON public.os_dm_messages
FOR DELETE TO authenticated
USING (sender = auth.uid());

-- ────────────── 4. os_messages — memorias de Astraura (sync realtime) ───────
-- OJO: NO es la mensajería. `injectAstrauraMemory` inserta
--   { thread_id: "<kind>_<id>_astraura" (TEXTO, no uuid), sender_type, content, metadata }
-- sin `user_id` ⇒ la columna lo rellena con DEFAULT auth.uid() (sesión del
-- servidor). Privado por cuenta: cada usuario solo ve sus propias memorias.

CREATE TABLE IF NOT EXISTS public.os_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   text NOT NULL,                          -- clave lógica textual, p.ej. "group_<id>_astraura"
  user_id     uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_type text NOT NULL DEFAULT 'user' CHECK (sender_type IN ('user', 'ai', 'system')),
  content     text NOT NULL DEFAULT '',
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS os_messages_thread_idx  ON public.os_messages (thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS os_messages_user_id_idx ON public.os_messages (user_id);

ALTER TABLE public.os_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS os_messages_select ON public.os_messages;
CREATE POLICY os_messages_select ON public.os_messages
FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS os_messages_insert ON public.os_messages;
CREATE POLICY os_messages_insert ON public.os_messages
FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS os_messages_update ON public.os_messages;
CREATE POLICY os_messages_update ON public.os_messages
FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS os_messages_delete ON public.os_messages;
CREATE POLICY os_messages_delete ON public.os_messages
FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ───────────── 5. vote_delegations — Ontocracia · voto líquido ──────────────
-- Cláusulas pétreas codificadas en el esquema:
--   · `expires_at NOT NULL`      → caducidad OBLIGATORIA (nunca alienación permanente).
--   · CHECK delegator <> delegate → no puedes delegarte a ti mismo.
--   · Índice único parcial       → UNA delegación activa por (delegante, tema).
--   · SELECT público             → el ejercicio de poder delegado es transparente
--     (§6 Privacidad↔Transparencia dual). Escritura: SOLO sobre lo propio.

CREATE TABLE IF NOT EXISTS public.vote_delegations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delegator_user uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delegate_user  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic          text NOT NULL,                       -- "scope" | "scope:ref" (topicForProposal)
  scope          text,
  scope_ref      text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL,
  revoked_at     timestamptz,
  CONSTRAINT vote_delegations_no_self CHECK (delegator_user <> delegate_user)
);

CREATE UNIQUE INDEX IF NOT EXISTS vote_delegations_one_active_per_topic
  ON public.vote_delegations (delegator_user, topic) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS vote_delegations_topic_active_idx
  ON public.vote_delegations (topic) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS vote_delegations_delegate_idx
  ON public.vote_delegations (delegate_user, topic);

ALTER TABLE public.vote_delegations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vote_delegations_select ON public.vote_delegations;
CREATE POLICY vote_delegations_select ON public.vote_delegations
FOR SELECT USING (true);

DROP POLICY IF EXISTS vote_delegations_insert ON public.vote_delegations;
CREATE POLICY vote_delegations_insert ON public.vote_delegations
FOR INSERT TO authenticated WITH CHECK (delegator_user = auth.uid());

DROP POLICY IF EXISTS vote_delegations_update ON public.vote_delegations;
CREATE POLICY vote_delegations_update ON public.vote_delegations
FOR UPDATE TO authenticated
USING (delegator_user = auth.uid())
WITH CHECK (delegator_user = auth.uid());

DROP POLICY IF EXISTS vote_delegations_delete ON public.vote_delegations;
CREATE POLICY vote_delegations_delete ON public.vote_delegations
FOR DELETE TO authenticated USING (delegator_user = auth.uid());

-- ─────────────── 6. Realtime (patrón de 20260711120000_realtime_publication) ─
-- Los mensajes NECESITAN realtime (dm.ts#subscribeThread / #subscribeThreadsList,
-- sync-manager para os_messages).

DO $$
DECLARE
    t text;
    tables text[] := ARRAY[
        'os_dm_threads',
        'os_dm_members',
        'os_dm_messages',
        'os_messages',
        'vote_delegations'
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
