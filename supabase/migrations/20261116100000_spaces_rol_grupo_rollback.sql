-- ════════════════════════════════════════════════════════════════════════════
-- SVF1A1 (SES1116) — Reversa de 20261116100000_spaces_rol_grupo.sql.
-- NO APLICAR sin la palabra de Alex · reversa: aplica esta solo si se aplicó la
-- ida · devuelve `space_can_edit` y `sp_update` al texto original copiado de
-- 20260712090100_missing_core_tables_spaces.sql y quita `os_group_rank`.
-- No toca datos.
-- ════════════════════════════════════════════════════════════════════════════

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
        OR  public.os_is_group_member(s.group_slug)
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
      OR public.os_is_group_member(group_slug)
      OR public.os_owns_profile(allowed_profiles)
      OR (public.space_editor_status(id, auth.uid()) = 'member'
          AND public.space_editor_role(id, auth.uid()) = 'editor')
    )
  ) WITH CHECK (
    auth.uid() IS NOT NULL AND (
         owner_account = auth.uid()
      OR public.os_is_group_member(group_slug)
      OR public.os_owns_profile(allowed_profiles)
      OR (public.space_editor_status(id, auth.uid()) = 'member'
          AND public.space_editor_role(id, auth.uid()) = 'editor')
    )
  );

DROP FUNCTION IF EXISTS public.os_group_rank(text);
