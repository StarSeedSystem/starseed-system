-- ════════════════════════════════════════════════════════════════════════════
-- Contrato «consumo» (2026-09-29) · publicación `supabase_realtime` MÍNIMA.
-- ----------------------------------------------------------------------------
-- MEDIDO: la publicación tenía 107 tablas. Postgres manda al servicio de Realtime cada
-- INSERT/UPDATE/DELETE de cada tabla publicada, y Realtime lo reenvía a cada suscriptor que
-- pueda verlo: el latido de una neurona (`neuron_devices`), cada faro/identidad/relé de toda la
-- red (`os_mesh_relay`, legible por cualquier cuenta), cada instantánea de topología… todo eso
-- era tráfico de salida y lecturas del WAL (pg_stat_statements: 2,3 M lecturas del WAL de
-- Realtime) aunque NINGÚN cliente escuchara esas tablas. El proyecto se bloqueó por egress el
-- 2026-09-28.
--
-- REGLA: en la publicación solo están las tablas que el cliente escucha DE VERDAD con
-- `postgres_changes` (directo, `onTableChange`/`useRealtime`/`useRealtimeRows`, `useOwnerRows`
-- de os-live.ts o `syncManager.subscribe`), leídas del código el 2026-09-29 siguiendo también
-- los nombres que llegan por variable (`TABLE` de browser-settings.ts y public-catalog.ts,
-- `table` de sync-manager.ts/os-live.ts/use-os-entities.ts). Un módulo que nadie importa no
-- cuenta como suscriptor.
--
-- FUERA A PROPÓSITO (latidos / faros / sondeos: nadie las escucha y su escritura es continua):
--   · neuron_devices    — latido de cada neurona cada 5 min; la malla la LEE por sondeo.
--   · os_mesh_relay     — faros, identidades, feed público y relés de TODA la red. Su canal
--                          (`subscribeRelayRealtime`) se retira: la entrega rápida entre mis
--                          neuronas va por el broadcast de cuenta `malla:rele` (sin base).
--   · os_mesh_topology  — instantáneas de la federación LoRa; se leen por sondeo.
--   · os_mesh_vinculos  — la escribe cada señal WebRTC de respaldo (buzones); se lee por sondeo.
--   · relevo_eventos    — bus del enjambre: su hook `useEventosRelevo` no lo monta nadie.
--   · os_freno          — freno remoto: fuera por diseño (20260929090000_os_freno.sql).
--
-- LISTA FINAL (una razón por tabla; quién la escucha):
--   ability_links          — Cerebro › Habilidades (habilidades-panel)
--   account_emails         — /cuenta y /correos: correos vinculados a la cuenta
--   astraura_messages      — chats de Astraura (conversations, hermione-bridge, Espacios de Telegram)
--   aurora_chat_folders    — carpetas de chats (chat-folders-store)
--   aurora_conversations   — lista de conversaciones (conversations)
--   aurora_ego_files       — panel Ego (archivos del ego)
--   aurora_egos            — panel Ego
--   aurora_imagine         — panel de Imaginación
--   aurora_settings        — panel de control de Aurora
--   brain_memory_files     — Cerebro › Memoria, grafo de memoria, mapa 3D, hub XR
--   brain_senses           — Cerebro › Contexto
--   brain_server_links     — panel de cerebros (servidores vinculados)
--   brains                 — cerebros (panel, hub, mapa 3D, hub XR, widgets)
--   browser_settings       — ajustes del navegador del OS (browser-settings, TABLE)
--   browser_windows        — ventanas guardadas del navegador
--   cafe_locals            — widget Ágora del regalo
--   cafe_posts             — widgets de feed cultural/relevantes/pulso/resonancia (use-cafe-posts)
--   cafe_profiles          — account-context (perfil unificado)
--   canvases               — hub XR (pizarras)
--   conversations          — widget de conversaciones (useOwnerRows)
--   dashboard_state        — disposición del dashboard
--   documents              — widget de documentos (useOwnerRows)
--   entity_state           — biblioteca y secciones por entidad (camino redundante del sync)
--   events                 — calendario unificado
--   grain_types            — widgets económicos (resumen, matriz del procomún)
--   group_ai_proposals     — gobierno IA de grupo
--   group_ai_votes         — gobierno IA de grupo
--   group_members          — miembros de grupo
--   imagine_runs           — panel de Imaginación
--   library_public_items   — catálogo público de la Biblioteca (public-catalog, TABLE)
--   memories               — memorias (hub, mapa 3D, hub XR, widgets)
--   messaging_channels     — canales de mensajería
--   notifications          — centro de notificaciones y su widget
--   os_account_profiles    — perfiles de la cuenta (profiles.ts)
--   os_app_server_members  — membresías de servidores de apps (aprobar/denegar en vivo)
--   os_canales             — directorio de canales públicos
--   os_dm_messages         — mensajes directos y llamadas (dm, montaje de llamadas)
--   os_dm_threads          — hilos de mensajería y sus carpetas
--   os_events              — eventos (calendario, páginas de entidad, hub XR, widgets)
--   os_files               — archivos (Biblioteca, os-files)
--   os_groups              — grupos (páginas de entidad, hub XR, widgets)
--   os_memberships         — membresías (widgets en vivo)
--   os_pages               — páginas (páginas de entidad, hub XR, widgets)
--   os_post_comments       — comentarios de publicaciones de entidades
--   os_posts               — publicaciones de perfiles y entidades (mapa, widgets, entidades)
--   os_profiles            — perfil soberano (/cuenta, account-context, ajustes de identidad)
--   os_space_editors       — editores de espacios compartidos (permisos en vivo)
--   os_spaces              — espacios compartidos (pizarras, salas, tabla y espacio vivos)
--   posts                  — Lienzo Universal: interacciones/comentarios en vivo, búsqueda, crear
--   profile_badges         — insignias del perfil
--   profiles               — account-context (perfil legado)
--   proposal_notifications — centro de notificaciones (decisiones)
--   proposals              — gobernanza (política, mapa, calendario)
--   scheduled_tasks        — recordatorios
--   seed_market            — widgets económicos
--   senses_settings        — panel de control de Aurora (sentidos)
--   service_routes         — rutas de servicios
--   ss_mail                — correo del OS (/correos)
--   starseed_mail_config   — configuración del correo (/correos)
--   store_items            — tienda de la Biblioteca
--   study_group_posts      — grupos de estudio
--   user_settings          — sync de ajustes entre dispositivos (realtime-sync, fila propia)
--   vaults                 — bóvedas (hub XR, widgets)
--
-- Añadir una suscripción nueva = añadir su tabla AQUÍ (en una migración nueva) con su razón.
--
-- IDEMPOTENTE: solo toca el esquema `public`; quita únicamente las tablas que HOY están en la
-- publicación y no en la lista; añade solo las de la lista que existen (to_regclass) y aún no
-- están. Reaplicarla no cambia nada. Sin publicación (entorno local sin Realtime) no hace nada.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    t text;
    lista text[] := ARRAY[
        'ability_links', 'account_emails', 'astraura_messages', 'aurora_chat_folders',
        'aurora_conversations', 'aurora_ego_files', 'aurora_egos', 'aurora_imagine',
        'aurora_settings', 'brain_memory_files', 'brain_senses', 'brain_server_links',
        'brains', 'browser_settings', 'browser_windows', 'cafe_locals',
        'cafe_posts', 'cafe_profiles', 'canvases', 'conversations',
        'dashboard_state', 'documents', 'entity_state', 'events',
        'grain_types', 'group_ai_proposals', 'group_ai_votes', 'group_members',
        'imagine_runs', 'library_public_items', 'memories', 'messaging_channels',
        'notifications', 'os_account_profiles', 'os_app_server_members', 'os_canales',
        'os_dm_messages', 'os_dm_threads', 'os_events', 'os_files',
        'os_groups', 'os_memberships', 'os_pages', 'os_post_comments',
        'os_posts', 'os_profiles', 'os_space_editors', 'os_spaces',
        'posts', 'profile_badges', 'profiles', 'proposal_notifications',
        'proposals', 'scheduled_tasks', 'seed_market', 'senses_settings',
        'service_routes', 'ss_mail', 'starseed_mail_config', 'store_items',
        'study_group_posts', 'user_settings', 'vaults'
    ];
    quitadas int := 0;
    anadidas int := 0;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        RAISE NOTICE 'La publicación supabase_realtime no existe: nada que ajustar.';
        RETURN;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime' AND puballtables) THEN
        RAISE WARNING 'supabase_realtime es FOR ALL TABLES: no se puede recortar por tabla. Recréala sin FOR ALL TABLES y vuelve a aplicar esta migración.';
        RETURN;
    END IF;

    -- 1) Fuera todo lo que está publicado en `public` y no escucha nadie.
    FOR t IN
        SELECT tablename
          FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime'
           AND schemaname = 'public'
           AND NOT (tablename = ANY (lista))
         ORDER BY tablename
    LOOP
        EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t);
        quitadas := quitadas + 1;
        RAISE NOTICE 'Quitada de supabase_realtime: public.%', t;
    END LOOP;

    -- 2) Dentro lo que se escucha y aún no estaba (solo si la tabla existe).
    FOREACH t IN ARRAY lista LOOP
        IF to_regclass(format('public.%I', t)) IS NULL THEN
            RAISE NOTICE 'public.% no existe en esta base: omitida.', t;
        ELSIF NOT EXISTS (
            SELECT 1
              FROM pg_publication_tables
             WHERE pubname = 'supabase_realtime'
               AND schemaname = 'public'
               AND tablename = t
        ) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
            anadidas := anadidas + 1;
            RAISE NOTICE 'Añadida a supabase_realtime: public.%', t;
        END IF;
    END LOOP;

    RAISE NOTICE 'supabase_realtime ajustada: % quitadas, % añadidas.', quitadas, anadidas;
END
$$;

-- `os_mesh_relay` llevaba REPLICA IDENTITY FULL solo para Realtime (20260803120000). Fuera de
-- la publicación, FULL solo engorda el WAL de cada UPDATE/DELETE — y el faro ahora se RENUEVA
-- con un UPDATE. Se vuelve a DEFAULT si la tabla existe y no está en ninguna publicación.
DO $$
BEGIN
    IF to_regclass('public.os_mesh_relay') IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM pg_publication_tables WHERE schemaname = 'public' AND tablename = 'os_mesh_relay'
       ) THEN
        ALTER TABLE public.os_mesh_relay REPLICA IDENTITY DEFAULT;
    END IF;
END
$$;
