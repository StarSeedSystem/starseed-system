-- Fix infinite recursion in os_entity_roles RLS

-- Drop the old policy
DROP POLICY IF EXISTS "os_entity_roles_modify" ON public.os_entity_roles;

-- Create a SECURITY DEFINER function to check role without triggering RLS recursively
CREATE OR REPLACE FUNCTION public.check_entity_role(
  _entity_id uuid,
  _entity_type text,
  _account_id uuid,
  _roles text[]
) RETURNS boolean
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.os_entity_roles
    WHERE entity_id = _entity_id
      AND entity_type = _entity_type
      AND account_id = _account_id
      AND role = ANY(_roles)
  );
$$;

-- Create individual policies for clarity and safety
CREATE POLICY "os_entity_roles_insert" ON public.os_entity_roles
FOR INSERT WITH CHECK (
  account_id = auth.uid() OR
  public.check_entity_role(entity_id, entity_type, auth.uid(), ARRAY['owner', 'admin'])
);

CREATE POLICY "os_entity_roles_update" ON public.os_entity_roles
FOR UPDATE USING (
  account_id = auth.uid() OR
  public.check_entity_role(entity_id, entity_type, auth.uid(), ARRAY['owner', 'admin'])
);

CREATE POLICY "os_entity_roles_delete" ON public.os_entity_roles
FOR DELETE USING (
  account_id = auth.uid() OR
  public.check_entity_role(entity_id, entity_type, auth.uid(), ARRAY['owner', 'admin'])
);
