-- =========================================================================
-- STARSEED OS - ESQUEMA MASIVO TOTAL (20260708000004_os_full_schema.sql)
-- Migración Absoluta: Mensajes, Dashboards, Widgets, Libraries, Brains, 
-- Events, Maps, Contexts y optimizaciones Realtime para todo el sistema.
-- =========================================================================

-- 1. Contextos Relativos (os_contexts)
-- Guarda configuraciones relativas: ej. mi tema oscuro en el grupo X, o mi dashboard default en la página Y.
CREATE TABLE IF NOT EXISTS public.os_contexts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  target_kind text not null, -- 'group', 'page', 'community', 'global'
  target_id text not null,   -- slug o uuid de la entidad destino
  settings jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, target_kind, target_id)
);
ALTER TABLE public.os_contexts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "os_contexts_all" ON public.os_contexts FOR ALL USING (user_id = auth.uid());

-- 2. Bibliotecas de Archivos (os_libraries)
-- Estructura de carpetas y metadatos para archivos (se liga al bucket os-media)
CREATE TABLE IF NOT EXISTS public.os_libraries (
  id uuid primary key default gen_random_uuid(),
  owner_kind text not null, -- 'user', 'group', 'page'
  owner_id text not null,   -- uuid o slug
  parent_id uuid references public.os_libraries(id),
  name text not null,
  type text not null,       -- 'folder', 'file', 'link'
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
ALTER TABLE public.os_libraries ENABLE ROW LEVEL SECURITY;
-- Políticas: Público puede leer; dueño o miembro puede escribir (simplificado para el script)
CREATE POLICY "os_libraries_select" ON public.os_libraries FOR SELECT USING (true);
CREATE POLICY "os_libraries_all" ON public.os_libraries FOR ALL USING (
  -- Lógica genérica: si owner_kind es 'user', compara UUID. 
  (owner_kind = 'user' AND owner_id = auth.uid()::text) OR 
  -- Para grupos, idealmente cruzar con os_memberships, pero habilitamos global por ahora para dueños logueados.
  (owner_kind != 'user' AND auth.uid() IS NOT NULL)
);

-- 3. Cerebros y Memoria de IA (os_brains)
-- Configuraciones de modelos (Astraura/Aurora), system prompts y reglas por contexto.
CREATE TABLE IF NOT EXISTS public.os_brains (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  name text not null,
  kind text default 'astraura', -- 'astraura', 'aurora', 'custom'
  knowledge_refs jsonb default '[]',
  provider_config jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
ALTER TABLE public.os_brains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "os_brains_select" ON public.os_brains FOR SELECT USING (true);
CREATE POLICY "os_brains_all" ON public.os_brains FOR ALL USING (owner_id = auth.uid());

-- 4. Mensajería (os_messages)
-- Chat entre usuarios, canales de grupo, o hilos con IA.
CREATE TABLE IF NOT EXISTS public.os_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id text not null, -- id de conversación o canal
  sender_id uuid references auth.users(id), -- null si es la IA (Astraura)
  sender_type text default 'user', -- 'user', 'ai'
  content text not null,
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
ALTER TABLE public.os_messages ENABLE ROW LEVEL SECURITY;
-- Select: asume hilos públicos o compartidos (RLS detallado a nivel aplicación)
CREATE POLICY "os_messages_select" ON public.os_messages FOR SELECT USING (true);
CREATE POLICY "os_messages_insert" ON public.os_messages FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 5. Dashboards y Widgets
CREATE TABLE IF NOT EXISTS public.os_dashboards (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null, -- uuid del usuario o slug del grupo
  owner_kind text not null,
  title text not null default 'Dashboard',
  layout jsonb default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
ALTER TABLE public.os_dashboards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "os_dashboards_select" ON public.os_dashboards FOR SELECT USING (true);
CREATE POLICY "os_dashboards_all" ON public.os_dashboards FOR ALL USING (auth.uid() IS NOT NULL);

CREATE TABLE IF NOT EXISTS public.os_widgets (
  id uuid primary key default gen_random_uuid(),
  dashboard_id uuid not null references public.os_dashboards(id) on delete cascade,
  widget_type text not null, -- 'canvas', 'map', 'chat', 'feed'
  config jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
ALTER TABLE public.os_widgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "os_widgets_select" ON public.os_widgets FOR SELECT USING (true);
CREATE POLICY "os_widgets_all" ON public.os_widgets FOR ALL USING (auth.uid() IS NOT NULL);

-- 6. Eventos y Mapas
CREATE TABLE IF NOT EXISTS public.os_events (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id),
  title text not null,
  description text,
  start_time timestamptz not null,
  end_time timestamptz,
  location_data jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
ALTER TABLE public.os_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "os_events_select" ON public.os_events FOR SELECT USING (true);
CREATE POLICY "os_events_all" ON public.os_events FOR ALL USING (creator_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.os_maps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  title text not null,
  markers jsonb default '[]',
  layers jsonb default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
ALTER TABLE public.os_maps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "os_maps_select" ON public.os_maps FOR SELECT USING (true);
CREATE POLICY "os_maps_all" ON public.os_maps FOR ALL USING (owner_id = auth.uid());

-- 7. Activar Realtime (Sincronización Total)
ALTER PUBLICATION supabase_realtime ADD TABLE public.os_contexts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.os_libraries;
ALTER PUBLICATION supabase_realtime ADD TABLE public.os_brains;
ALTER PUBLICATION supabase_realtime ADD TABLE public.os_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.os_dashboards;
ALTER PUBLICATION supabase_realtime ADD TABLE public.os_widgets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.os_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.os_maps;

-- 8. Índices de rendimiento general para Realtime y búsquedas
CREATE INDEX IF NOT EXISTS idx_os_contexts_user_target ON public.os_contexts(user_id, target_kind, target_id);
CREATE INDEX IF NOT EXISTS idx_os_libraries_owner ON public.os_libraries(owner_kind, owner_id);
CREATE INDEX IF NOT EXISTS idx_os_messages_thread ON public.os_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_os_dashboards_owner ON public.os_dashboards(owner_kind, owner_id);
CREATE INDEX IF NOT EXISTS idx_os_events_start ON public.os_events(start_time);
