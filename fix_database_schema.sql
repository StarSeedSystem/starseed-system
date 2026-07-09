-- Reparación de la base de datos de StarSeed OS
-- Ejecuta esto en el SQL Editor de Supabase (https://supabase.com/dashboard/project/nxstilnyidvkqeosofuh/sql/new)

-- 1. Crear os_profiles (Identidad Soberana)
CREATE TABLE IF NOT EXISTS public.os_profiles (
  user_id uuid primary key references auth.users(id),
  username text unique, 
  handle text unique,   
  display_name text,
  avatar_url text,
  cover_url text,
  bio text,
  tags jsonb default '[]',
  searchable boolean default true,
  visibility text default 'public',
  kind text default 'personal',
  is_default boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

ALTER TABLE public.os_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "os_profiles_select_public" ON public.os_profiles;
CREATE POLICY "os_profiles_select_public" 
  ON public.os_profiles FOR SELECT 
  USING (visibility = 'public' OR user_id = auth.uid());

DROP POLICY IF EXISTS "os_profiles_insert" ON public.os_profiles;
CREATE POLICY "os_profiles_insert" 
  ON public.os_profiles FOR INSERT 
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "os_profiles_update" ON public.os_profiles;
CREATE POLICY "os_profiles_update" 
  ON public.os_profiles FOR UPDATE 
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 2. Asegurar que os_account_profiles existe
CREATE TABLE IF NOT EXISTS public.os_account_profiles (
  id uuid primary key default gen_random_uuid(),
  account uuid not null references auth.users(id),
  handle text unique,
  name text not null,
  kind text default 'personal',
  avatar_url text,
  cover_url text,
  bio text,
  is_default boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Aseguramos que la columna visibility exista en os_account_profiles
ALTER TABLE public.os_account_profiles ADD COLUMN IF NOT EXISTS visibility text default 'public';

ALTER TABLE public.os_account_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "os_account_profiles_select" ON public.os_account_profiles;
CREATE POLICY "os_account_profiles_select" ON public.os_account_profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "os_account_profiles_all" ON public.os_account_profiles;
CREATE POLICY "os_account_profiles_all" ON public.os_account_profiles FOR ALL USING (account = auth.uid());

-- 3. HABILITAR SINCRONIZACIÓN EN TIEMPO REAL PARA TODAS LAS ENTIDADES OS
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public' AND tablename LIKE 'os_%'
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime'
              AND schemaname = 'public'
              AND tablename = r.tablename
        ) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I.%I', 'public', r.tablename);
        END IF;
    END LOOP;
END $$;

-- 4. Recargar el caché de esquema para la API de Supabase
NOTIFY pgrst, 'reload schema';
