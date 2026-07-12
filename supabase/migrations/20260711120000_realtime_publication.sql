-- ════════════════════════════════════════════════════════════════════════════
-- Realtime — añade a la publicación `supabase_realtime` las tablas del sync en
-- vivo del OS (Adenda 63 §4/§8: biblioteca por entidad, publicaciones, perfiles,
-- pizarras, espacios compartidos, ajustes de cuenta y propuestas).
--
-- IDEMPOTENTE y defensiva:
--   · Solo actúa si la publicación `supabase_realtime` existe.
--   · Solo añade cada tabla si (a) existe (to_regclass) y (b) no está ya en la
--     publicación (pg_publication_tables). Re-ejecutarla no cambia nada.
--
-- ⚠️ NO aplicada automáticamente: revisar y aplicar vía dashboard/CLI.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    t text;
    tables text[] := ARRAY[
        'entity_state',      -- biblioteca por entidad + secciones sincronizadas
        'os_posts',          -- publicaciones de perfiles y secciones
        'os_profiles',       -- perfiles públicos de la cuenta
        'canvases',          -- pizarras
        'os_spaces',         -- espacios compartidos (permisos, Adenda 63 §5)
        'os_space_editors',  -- editores de espacios compartidos
        'user_settings',     -- ajustes sincronizados de la cuenta
        'proposals'          -- propuestas (gobernanza)
    ];
BEGIN
    -- Sin publicación no hay nada que hacer (entornos locales sin realtime).
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
