-- ════════════════════════════════════════════════════════════════════════════
-- L1 · Señalización PRIVADA de llamadas y apps en vivo (Realtime Authorization) · 2026-09-28
--
-- Antes: el canal Realtime `llamada:<sesionId>` (y `vivo:<sesionId>`) era PÚBLICO: cualquiera que
-- supiera el id podía entrar en la señalización (ofertas SDP, candidatos ICE, presencia).
-- Ahora el cliente los abre con `private: true` y el servidor decide con RLS sobre
-- `realtime.messages` quién puede recibir (SELECT) y enviar (INSERT) broadcast y presencia:
--
--   · `llamada:<id>` / `vivo:<id>`                 → creador, invitados o miembros del chat de la
--                                                     sesión (activa y sin caducar).
--   · `llamada:<id>:<token>` / `vivo:<id>:<token>` → cualquiera (también sin cuenta, rol anon)
--                                                     mientras la sesión sea modo 'publico',
--                                                     'activa', sin caducar y el token coincida.
--
-- Mientras esta migración NO esté aplicada, el cliente no puede entrar en los canales privados:
-- la llamada lo dice con un mensaje claro y NO se cae a un canal público.
--
-- ⚠️ No desactives «Allow public access» en Realtime → Settings: otras partes del OS (sync de
-- cuenta `acct:<uid>`, etc.) siguen usando canales públicos.
--
-- Depende de: 20260928120000_contactos_presencia_mensajeria.sql (os_sesiones_vivas) y
-- 20260712090200_missing_core_tables_messages.sql (is_dm_member).
-- Idempotente: se puede aplicar dos veces.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────── 1. ¿Puede esta persona entrar en la sesión? ───────────────────
-- Solo responde por la persona que pregunta (`_uid` debe ser `auth.uid()`): así, expuesta como
-- RPC, no sirve para averiguar si OTRA persona es miembro de un chat.
CREATE OR REPLACE FUNCTION public.puede_entrar_sesion(_id uuid, _uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT _id IS NOT NULL
     AND _uid IS NOT NULL
     AND _uid = auth.uid()
     AND EXISTS (
       SELECT 1
       FROM public.os_sesiones_vivas s
       WHERE s.id = _id
         AND s.estado = 'activa'
         AND (s.caduca IS NULL OR s.caduca > now())
         AND (
           s.creador = _uid
           OR _uid = ANY (s.invitados)
           OR (s.hilo_id IS NOT NULL AND public.is_dm_member(s.hilo_id, _uid))
         )
     );
$$;

-- ─────────────────── 2. Tema de miembros: `llamada:<id>` / `vivo:<id>` ───────────────────
CREATE OR REPLACE FUNCTION public.topic_sesion_permitido(_topic text, _uid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  m text[];
  sid uuid;
BEGIN
  IF _topic IS NULL OR _uid IS NULL OR char_length(_topic) > 200 THEN
    RETURN false;
  END IF;
  m := regexp_match(_topic, '^(llamada|vivo):([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$');
  IF m IS NULL THEN
    RETURN false;
  END IF;
  sid := m[2]::uuid;
  IF NOT public.puede_entrar_sesion(sid, _uid) THEN
    RETURN false;
  END IF;
  -- El prefijo tiene que corresponder al tipo de sesión (una llamada no es una app en vivo).
  RETURN EXISTS (
    SELECT 1 FROM public.os_sesiones_vivas s
    WHERE s.id = sid
      AND ((m[1] = 'llamada') = (s.tipo LIKE 'llamada:%'))
  );
END;
$$;

-- ─────────────────── 3. Tema público: `llamada:<id>:<token>` / `vivo:<id>:<token>` ───────────
CREATE OR REPLACE FUNCTION public.topic_publico_valido(_topic text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  m text[];
BEGIN
  IF _topic IS NULL OR char_length(_topic) > 200 THEN
    RETURN false;
  END IF;
  m := regexp_match(_topic, '^(llamada|vivo):([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}):([A-Za-z0-9_-]{16,128})$');
  IF m IS NULL THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.os_sesiones_vivas s
    WHERE s.id = m[2]::uuid
      AND s.modo = 'publico'
      AND s.token_publico IS NOT NULL
      AND s.token_publico = m[3]
      AND s.estado = 'activa'
      AND (s.caduca IS NULL OR s.caduca > now())
      AND ((m[1] = 'llamada') = (s.tipo LIKE 'llamada:%'))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.puede_entrar_sesion(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.topic_sesion_permitido(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.topic_publico_valido(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.puede_entrar_sesion(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.topic_sesion_permitido(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.topic_publico_valido(text) TO anon, authenticated;

-- ─────────────────── 4. Políticas de Realtime Authorization ───────────────────
-- Solo broadcast y presencia (nada de postgres_changes por aquí). Las políticas de
-- realtime.messages son PERMISIVAS: estas solo AÑADEN acceso a estos temas; no quitan nada a
-- otros canales privados que existan o se creen.
DO $$
BEGIN
  IF to_regclass('realtime.messages') IS NULL THEN
    RAISE NOTICE 'realtime.messages no existe en este proyecto: activa Realtime Authorization y vuelve a aplicar esta migración.';
    RETURN;
  END IF;

  -- Con cuenta (incluidas las sesiones anónimas de «Explorar sin cuenta», que son authenticated).
  EXECUTE 'DROP POLICY IF EXISTS l1_sesiones_recibir_autenticado ON realtime.messages';
  EXECUTE $p$
    CREATE POLICY l1_sesiones_recibir_autenticado ON realtime.messages
    FOR SELECT TO authenticated
    USING (
      realtime.messages.extension IN ('broadcast', 'presence')
      AND (
        public.topic_sesion_permitido((SELECT realtime.topic()), (SELECT auth.uid()))
        OR public.topic_publico_valido((SELECT realtime.topic()))
      )
    )
  $p$;

  EXECUTE 'DROP POLICY IF EXISTS l1_sesiones_enviar_autenticado ON realtime.messages';
  EXECUTE $p$
    CREATE POLICY l1_sesiones_enviar_autenticado ON realtime.messages
    FOR INSERT TO authenticated
    WITH CHECK (
      realtime.messages.extension IN ('broadcast', 'presence')
      AND (
        public.topic_sesion_permitido((SELECT realtime.topic()), (SELECT auth.uid()))
        OR public.topic_publico_valido((SELECT realtime.topic()))
      )
    )
  $p$;

  -- Sin cuenta (rol anon): solo con enlace público vigente.
  EXECUTE 'DROP POLICY IF EXISTS l1_sesiones_recibir_anon ON realtime.messages';
  EXECUTE $p$
    CREATE POLICY l1_sesiones_recibir_anon ON realtime.messages
    FOR SELECT TO anon
    USING (
      realtime.messages.extension IN ('broadcast', 'presence')
      AND public.topic_publico_valido((SELECT realtime.topic()))
    )
  $p$;

  EXECUTE 'DROP POLICY IF EXISTS l1_sesiones_enviar_anon ON realtime.messages';
  EXECUTE $p$
    CREATE POLICY l1_sesiones_enviar_anon ON realtime.messages
    FOR INSERT TO anon
    WITH CHECK (
      realtime.messages.extension IN ('broadcast', 'presence')
      AND public.topic_publico_valido((SELECT realtime.topic()))
    )
  $p$;
END $$;

-- ─────────────────── Comprobación rápida (manual, tras aplicar) ───────────────────
-- SELECT policyname, cmd, roles FROM pg_policies WHERE schemaname = 'realtime' AND tablename = 'messages' AND policyname LIKE 'l1_%';
-- SELECT public.topic_publico_valido('llamada:00000000-0000-0000-0000-000000000000:xxxxxxxxxxxxxxxx'); -- false
