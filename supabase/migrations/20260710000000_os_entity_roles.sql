-- Migración para el sistema de Federación de Entidades (RBAC)
-- Permite que múltiples cuentas gestionen Perfiles, Páginas o Grupos.

-- 1. Crear os_pages
CREATE TABLE IF NOT EXISTS public.os_pages (
  id uuid primary key default gen_random_uuid(),
  handle text unique not null,
  name text not null,
  description text,
  avatar_url text,
  cover_url text,
  tags jsonb default '[]',
  visibility text default 'public',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. Crear os_groups
CREATE TABLE IF NOT EXISTS public.os_groups (
  id uuid primary key default gen_random_uuid(),
  handle text unique not null,
  name text not null,
  description text,
  avatar_url text,
  cover_url text,
  tags jsonb default '[]',
  visibility text default 'public',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 3. Crear os_entity_roles
-- entity_type puede ser: 'profile' (apunta a os_account_profiles), 'page' (os_pages), 'group' (os_groups)
CREATE TABLE IF NOT EXISTS public.os_entity_roles (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id) ON DELETE CASCADE,
  entity_type text not null,
  entity_id uuid not null,
  role text not null default 'viewer', -- 'owner', 'admin', 'editor', 'viewer'
  permissions jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  UNIQUE(account_id, entity_type, entity_id)
);

-- RLS para os_entity_roles
ALTER TABLE public.os_entity_roles ENABLE ROW LEVEL SECURITY;

-- Select: Todos pueden ver los roles públicos, o al menos los que pertenezcan a las entidades que pueden ver.
-- Simplificado: usuarios ven todos los roles (transparencia) o al menos los suyos.
CREATE POLICY "os_entity_roles_select" ON public.os_entity_roles 
FOR SELECT USING (true);

-- Insert/Update/Delete: Solo los owners o admins de la entidad correspondiente pueden modificar los roles.
-- Para simplificar la validación en SQL, primero chequeamos que la cuenta actual tenga rol 'owner' o 'admin' en esa misma entidad.
CREATE POLICY "os_entity_roles_modify" ON public.os_entity_roles 
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.os_entity_roles AS er
    WHERE er.entity_id = os_entity_roles.entity_id 
      AND er.entity_type = os_entity_roles.entity_type
      AND er.account_id = auth.uid()
      AND er.role IN ('owner', 'admin')
  )
  OR account_id = auth.uid() -- El propio usuario puede auto-asignarse/quitarse (sujeto a validación extra en DB, pero lo dejamos abierto a sí mismo si se trata de crear la entidad inicialmente)
);

-- Nota: Para la inserción inicial (cuando un usuario crea la página), no hay roles todavía. 
-- Así que la app debe usar service_role o dejar que un trigger inserte el rol 'owner' al crear la entidad.
-- O bien la policy de Insert permite a auth.uid() insertarse si no existe 'owner' aún.
