-- 1. Añadir columna visibility si no existe en ambas tablas de perfiles
ALTER TABLE public.os_profiles ADD COLUMN IF NOT EXISTS visibility text default 'public';
ALTER TABLE public.os_account_profiles ADD COLUMN IF NOT EXISTS visibility text default 'public';

-- 2. Asegurarse de que el RLS esté habilitado
ALTER TABLE public.os_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.os_account_profiles ENABLE ROW LEVEL SECURITY;

-- 3. Políticas para os_profiles
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

-- 4. Políticas para os_account_profiles
DROP POLICY IF EXISTS "os_account_profiles_select" ON public.os_account_profiles;
CREATE POLICY "os_account_profiles_select" ON public.os_account_profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "os_account_profiles_all" ON public.os_account_profiles;
CREATE POLICY "os_account_profiles_all" ON public.os_account_profiles FOR ALL USING (account = auth.uid());
