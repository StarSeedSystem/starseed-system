-- 20260708000003_optimizations.sql
-- Optimización de índices para reducir coste de CPU en Supabase

-- Índices para optimizar las uniones y reglas RLS
CREATE INDEX IF NOT EXISTS idx_os_account_profiles_account ON public.os_account_profiles(account);
CREATE INDEX IF NOT EXISTS idx_os_account_profiles_handle ON public.os_account_profiles(handle);

-- Índices para posts (búsquedas por autor y orden cronológico en el feed)
CREATE INDEX IF NOT EXISTS idx_os_posts_author_id ON public.os_posts(author_id);
CREATE INDEX IF NOT EXISTS idx_os_posts_created_at ON public.os_posts(created_at DESC);

-- Índices para páginas, grupos y lienzos
CREATE INDEX IF NOT EXISTS idx_os_pages_owner_id ON public.os_pages(owner_id);
CREATE INDEX IF NOT EXISTS idx_os_groups_owner_id ON public.os_groups(owner_id);
CREATE INDEX IF NOT EXISTS idx_canvases_owner ON public.canvases(owner);
