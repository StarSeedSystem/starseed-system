-- =========================================================================
-- STARSEED OS - REPARACIÓN IDENTIDADES Y VISIBILIDAD (20260708000006_os_profiles_visibility.sql)
-- Crea la tabla os_profiles faltante (Identidad Soberana) y añade el control
-- de visibilidad a los perfiles de cuenta (Facetas).
-- =========================================================================

-- 1. Crear os_profiles (Directorio Global Público / Identidad Soberana)
CREATE TABLE IF NOT EXISTS public.os_profiles (
  user_id uuid primary key references auth.users(id),
  username text unique, -- Identificador único para URLs y búsquedas
  handle text unique,   -- Compatibilidad con Identidad Soberana (@)
  display_name text,
  avatar_url text,
  cover_url text,
  bio text,
  tags jsonb default '[]',
  searchable boolean default true,
  visibility text default 'public', -- 'public', 'private', 'contacts'
  kind text default 'personal',
  is_default boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Aseguramos RLS en os_profiles
ALTER TABLE public.os_profiles ENABLE ROW LEVEL SECURITY;

-- Políticas de lectura basadas en visibilidad o propiedad
CREATE POLICY "os_profiles_select_public" 
  ON public.os_profiles 
  FOR SELECT 
  USING (
    visibility = 'public' 
    OR user_id = auth.uid()
    -- Lógica de contactos en el futuro: OR auth.uid() IN (SELECT contact_id FROM os_contacts WHERE owner_id = os_profiles.user_id)
  );

-- Políticas de escritura (solo el dueño puede editarse a sí mismo)
CREATE POLICY "os_profiles_insert" 
  ON public.os_profiles 
  FOR INSERT 
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "os_profiles_update" 
  ON public.os_profiles 
  FOR UPDATE 
  USING (user_id = auth.uid()) 
  WITH CHECK (user_id = auth.uid());

-- 2. Modificar os_account_profiles (Facetas de la Cuenta)
-- Añadimos la columna visibility
ALTER TABLE public.os_account_profiles 
  ADD COLUMN IF NOT EXISTS visibility text default 'public';

-- 3. Inclusión en Realtime
-- Para asegurar que los clientes reciban actualizaciones en vivo
DO $$
BEGIN
    BEGIN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.os_profiles;';
    EXCEPTION WHEN duplicate_object THEN
        -- Ignorar
    END;
END;
$$;
