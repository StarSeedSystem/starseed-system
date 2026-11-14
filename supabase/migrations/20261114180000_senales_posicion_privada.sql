-- ════════════════════════════════════════════════════════════════════════════
-- MAP1114D · Canal privado de posición exacta de las neuronas de UNA cuenta
-- ════════════════════════════════════════════════════════════════════════════
-- Decisión de Alex (14-11-2026): la posición exacta solo viaja entre las neuronas de su cuenta.
-- El cliente abre el canal Realtime `pos:<uid>` con `private: true` (src/lib/senales/geo/canal-posicion.ts).
-- Estas políticas de `realtime.messages` dejan entrar (recibir y enviar broadcast y presencia) SOLO a una
-- persona con sesión y SOLO al tema de su propio uid. Nada más cambia: no toca el canal de presencia de la cuenta
-- ni los canales de llamadas (`llamada:`, `vivo:`) ni `acct:<uid>`.
--
-- Qué crea: 2 políticas permisivas en realtime.messages:
--   · senales_posicion_recibir  (SELECT, rol authenticated)
--   · senales_posicion_enviar   (INSERT, rol authenticated)
-- No crea tablas, funciones ni datos. El rol anon no recibe ninguna.
--
-- Mientras NO esté aplicada, el cliente no puede unirse: el mapa lo dice y no manda la posición por ningún otro canal.
-- Idempotente: se puede aplicar dos veces.
--
-- DESHACER (no borra datos, solo quita el acceso):
--   DROP POLICY IF EXISTS senales_posicion_recibir ON realtime.messages;
--   DROP POLICY IF EXISTS senales_posicion_enviar  ON realtime.messages;
-- ════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF to_regclass('realtime.messages') IS NULL THEN
    RAISE NOTICE 'realtime.messages no existe en este proyecto: activa Realtime Authorization y vuelve a aplicar esta migración.';
    RETURN;
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS senales_posicion_recibir ON realtime.messages';
  EXECUTE $p$
    CREATE POLICY senales_posicion_recibir ON realtime.messages
    FOR SELECT TO authenticated
    USING (
      realtime.messages.extension IN ('broadcast', 'presence')
      AND (SELECT realtime.topic()) = 'pos:' || (SELECT auth.uid())::text
    )
  $p$;

  EXECUTE 'DROP POLICY IF EXISTS senales_posicion_enviar ON realtime.messages';
  EXECUTE $p$
    CREATE POLICY senales_posicion_enviar ON realtime.messages
    FOR INSERT TO authenticated
    WITH CHECK (
      realtime.messages.extension IN ('broadcast', 'presence')
      AND (SELECT realtime.topic()) = 'pos:' || (SELECT auth.uid())::text
    )
  $p$;
END $$;
