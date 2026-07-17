-- ════════════════════════════════════════════════════════════════════════════
-- Realtime para chats unificados de Astraura (Adenda 71-bis · 2026-07-17).
-- Añade las tablas de conversaciones/mensajes a la publicación
-- `supabase_realtime` para que el `postgres_changes` confirme y sincronice
-- los chats NUEVOS entre dispositivos y pestañas en tiempo real.
--
-- IDEMPOTENTE y defensiva (igual patrón que 20260711120000_realtime_publication.sql):
--   · Solo actúa si la publicación `supabase_realtime` existe.
--   · Solo añade cada tabla si existe y no está ya en la publicación.
--
-- ⚠️ Aplicar vía dashboard/CLI (o pegar en el SQL editor) con rol service_role.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    t text;
    tables text[] := ARRAY[
        'aurora_conversations',  -- lista unificada de chats (orbe/Exocórtex/Astraura AI)
        'astraura_messages'      -- mensajes de esos chats
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
