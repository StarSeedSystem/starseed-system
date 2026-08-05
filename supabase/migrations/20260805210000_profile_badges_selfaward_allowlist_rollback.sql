-- ROLLBACK de 20260805210000_profile_badges_selfaward_allowlist.sql.
-- ----------------------------------------------------------------------------
-- Retira el trigger + helper de auto-otorgamiento por LISTA PERMITIDA y
-- restaura EXACTAMENTE las políticas de
-- `20260805191500_profile_badges_anti_selfaward.sql` (bloqueo CIEGO de TODO
-- auto-otorgamiento, sin excepción para insignias de logro).
--
-- Úsese sólo si el endurecimiento por lista permitida rompe algo inesperado.
-- Tras este rollback: el aval entre pares (endorseBadge) sigue intacto; PERO
-- aprobar un examen (study.ts / group-education.ts) vuelve a fallar en
-- silencio al otorgar la insignia de logro (awardBadge es tolerante a fallos
-- por diseño — no rompe la UI, pero el usuario deja de recibirla), igual que
-- documentaba el comentario de cabecera de 20260805191500. Los cambios de
-- CÓDIGO (study.ts::createExam saneando badgeCode, group-education.ts usando
-- "exam_passed" en vez de "scholar") NO se revierten con este .sql — son
-- correctos independientemente de qué política de BD esté activa y no hace
-- falta deshacerlos.
--
-- Aplicar vía Management API.

drop trigger if exists profile_badges_selfaward_guard_trg on public.profile_badges;
drop function if exists public.profile_badges_selfaward_guard();
drop function if exists public.badge_code_is_self_awardable(text);

drop policy if exists profile_badges_insert_self_awarder on public.profile_badges;
create policy profile_badges_insert_self_awarder
  on public.profile_badges for insert
  to authenticated
  with check (
    awarded_by = auth.uid()
    and awarded_by <> (select p.user_id from public.profiles p where p.id = profile_id)
  );

drop policy if exists profile_badges_update_self_awarder on public.profile_badges;
create policy profile_badges_update_self_awarder
  on public.profile_badges for update
  to authenticated
  using (awarded_by = auth.uid())
  with check (
    awarded_by = auth.uid()
    and awarded_by <> (select p.user_id from public.profiles p where p.id = profile_id)
  );
