-- ROLLBACK de 20260804180000_governance_rls_hardening.sql (Adenda 140).
-- Restaura el estado PREVIO exacto capturado en la auditoría en vivo. Sólo para
-- emergencia: revierte a políticas PERMISIVAS inseguras. Aplicar vía Management API.

-- proposals: quitar trigger + policies granulares, restaurar pr_write FOR ALL.
drop trigger if exists proposals_guard_trg on public.proposals;
drop function if exists public.proposals_guard();
drop policy if exists pr_insert on public.proposals;
drop policy if exists pr_update on public.proposals;
drop policy if exists pr_delete on public.proposals;
create policy pr_write on public.proposals for all
  to public
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- proposal_votes: restaurar pv_self FOR ALL.
drop policy if exists pv_insert on public.proposal_votes;
drop policy if exists pv_update on public.proposal_votes;
drop policy if exists pv_delete on public.proposal_votes;
create policy pv_self on public.proposal_votes for all
  to public
  using (auth.uid() = voter)
  with check (auth.uid() = voter);

-- proposal_notifications: restaurar pn_insert (auth.role authenticated).
drop policy if exists pn_insert on public.proposal_notifications;
create policy pn_insert on public.proposal_notifications for insert
  to public
  with check (auth.role() = 'authenticated');

-- vote_delegations: restaurar INSERT sin la guarda de auto-delegación.
drop policy if exists vote_delegations_insert on public.vote_delegations;
create policy vote_delegations_insert on public.vote_delegations for insert
  to authenticated
  with check (delegator_user = auth.uid());

-- group_members / page_members: quitar los triggers anti-escalada.
drop trigger if exists group_members_guard_role_trg on public.group_members;
drop function if exists public.group_members_guard_role();
drop trigger if exists page_members_guard_role_trg on public.page_members;
drop function if exists public.page_members_guard_role();

-- Helper compartido.
drop function if exists public.gov_is_entity_owner(text);
