-- ════════════════════════════════════════════════════════════════════════════
-- Folders de chat para Astraura (Adenda 71-bis · 2026-07-17).
-- Los chats de Aurora/Astraura se adjuntan a carpetas (folders) y se ven en
-- todas las secciones (Exocórtex, orbe, Astraura AI) porque comparten el
-- almacén unificado aurora_conversations. RLS por owner.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS aurora_chat_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE aurora_chat_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_aurora_chat_folders" ON aurora_chat_folders;
CREATE POLICY "owner_aurora_chat_folders" ON aurora_chat_folders
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Columna folder en la tabla unificada de conversaciones.
ALTER TABLE aurora_conversations ADD COLUMN IF NOT EXISTS folder text;

-- Realtime: los folders también se sincronizan entre dispositivos.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='aurora_chat_folders') THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', 'aurora_chat_folders');
    END IF;
  END IF;
END $$;
