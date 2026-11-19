-- ════════════════════════════════════════════════════════════════════════════
-- SVF1A1 (SES1116) — Editar un espacio de grupo exige rango ≥ 2.
-- NO APLICAR sin la palabra de Alex · reversa: 20261116100000_spaces_rol_grupo_rollback.sql · no toca datos
-- ----------------------------------------------------------------------------
-- Hoy la mera pertenencia al grupo deja EDITAR un espacio a cualquier miembro,
-- también a un «observador» (contrato SES1116 §3.3). Aquí la rama de grupo de
-- `space_can_edit` y de `sp_update` pasa a exigir `os_group_rank >= 2`.
-- Leer NO cambia: `sp_select` y el resto de políticas quedan como están.
-- Rango = el mayor de `access_role_rank(role)` en `os_memberships`
-- (group_slug = _slug, user_id = auth.uid()) y en `os_entity_roles`
-- (entity_id::text = _slug, account_id = auth.uid()); 0 sin sesión o sin fila.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.os_group_rank(_slug text)
RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(MAX(r), 0)::int
  FROM (
    SELECT public.access_role_rank(m.role) AS r
    FROM public.os_memberships m
    WHERE m.group_slug = _slug
      AND m.user_id = auth.uid()
    UNION ALL
    SELECT public.access_role_rank(e.role) AS r
    FROM public.os_entity_roles e
    WHERE e.entity_id::text = _slug
      AND e.account_id = auth.uid()
  ) t
  WHERE _slug IS NOT NULL AND auth.uid() IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.os_group_rank(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.os_group_rank(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.space_can_edit(_space_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.os_spaces s
    WHERE s.id = _space_id
      AND auth.uid() IS NOT NULL
      AND (
            s.owner_account = auth.uid()
        OR  public.os_group_rank(s.group_slug) >= 2
        OR  public.os_owns_profile(s.allowed_profiles)
        OR (public.space_editor_status(s.id, auth.uid()) = 'member'
            AND public.space_editor_role(s.id, auth.uid()) = 'editor')
      )
  );
$$;

DROP POLICY IF EXISTS sp_update ON public.os_spaces;
CREATE POLICY sp_update ON public.os_spaces
  FOR UPDATE USING (
    auth.uid() IS NOT NULL AND (
         owner_account = auth.uid()
      OR public.os_group_rank(group_slug) >= 2
      OR public.os_owns_profile(allowed_profiles)
      OR (public.space_editor_status(id, auth.uid()) = 'member'
          AND public.space_editor_role(id, auth.uid()) = 'editor')
    )
  ) WITH CHECK (
    auth.uid() IS NOT NULL AND (
         owner_account = auth.uid()
      OR public.os_group_rank(group_slug) >= 2
      OR public.os_owns_profile(allowed_profiles)
      OR (public.space_editor_status(id, auth.uid()) = 'member'
          AND public.space_editor_role(id, auth.uid()) = 'editor')
    )
  );
