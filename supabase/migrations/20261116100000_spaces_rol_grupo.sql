-- ════════════════════════════════════════════════════════════════════════════
-- SVF1A1f — Editar un espacio de grupo exige rol (rango ≥ 2).
-- NO APLICAR sin la palabra de Alex · reversa: 20261116100000_spaces_rol_grupo_rollback.sql · no toca datos
-- ----------------------------------------------------------------------------
-- Hoy `os_is_group_member(group_slug)` deja EDITAR un espacio a cualquier miembro
-- del grupo, también a un «observador» (contrato SES1115Q §3.3). Aquí la rama de
-- grupo de `space_can_edit` y de `sp_update` pasa a exigir `os_group_rank >= 2`.
-- Leer NO cambia: `sp_select` y el resto de políticas quedan como están.
-- Rango = el mayor de `os_memberships` y `os_entity_roles` (access_role_rank).
-- `os_memberships.role` también guarda el vocabulario que escribe su guarda
-- (moderator/mod/moderador, administrator, propietario/dueno): se traduce igual
-- que `traduccion-roles.ts` para no dejar sin edición a quien hoy modera o dirige.
-- «miembro», «member» y «pending» valen 0: ya no editan.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.os_group_rank(_slug text)
RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(MAX(t.r), 0)::int
  FROM (
    SELECT GREATEST(
             public.access_role_rank(m.role),
             CASE lower(COALESCE(trim(m.role), ''))
               WHEN 'propietario' THEN 4
               WHEN 'dueno'       THEN 4
               WHEN 'administrator' THEN 3
               WHEN 'moderator'   THEN 2
               WHEN 'moderador'   THEN 2
               WHEN 'mod'         THEN 2
               ELSE 0
             END) AS r
    FROM public.os_memberships m
    WHERE m.group_slug = _slug AND m.user_id = auth.uid()
    UNION ALL
    SELECT public.access_role_rank(e.role)
    FROM public.os_entity_roles e
    WHERE e.entity_id::text = _slug AND e.account_id = auth.uid()
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
