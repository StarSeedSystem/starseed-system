-- =========================================================================
-- STARSEED OS - SINCRONIZACIÓN EN TIEMPO REAL TOTAL (20260708000005_realtime_sync_all.sql)
-- Habilita la publicación de supabase_realtime para absolutamente todas las tablas
-- del OS para garantizar sincronización fluida entre dispositivos, páginas, 
-- comunidades, memorias, lienzos, cerebros y configuraciones.
-- =========================================================================

-- Usamos un bloque DO para iterar inteligentemente por todas las tablas os_ 
-- y agregarlas a realtime si no están aún.
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN 
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public' 
          AND (tablename LIKE 'os_%' OR tablename = 'canvases' OR tablename = 'entity_state')
    LOOP
        BEGIN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I;', t);
        EXCEPTION WHEN duplicate_object THEN
            -- Ignorar si ya está en la publicación (seguridad idempotente)
        END;
    END LOOP;
END;
$$;
