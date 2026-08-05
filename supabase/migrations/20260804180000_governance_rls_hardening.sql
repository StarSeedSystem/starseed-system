-- ════════════════════════════════════════════════════════════════════════════
-- Adenda 140 — Endurecimiento RLS de GOBERNANZA (propuestas, votos, membresías).
-- ----------------------------------------------------------------------------
-- Auditoría EN VIVO (Management API · proyecto del OS nxstilnyidvkqeosofuh)
-- reveló estos agujeros (confirmados contra pg_policies, no sólo contra el código):
--   · proposals.pr_write : FOR ALL permisiva a cualquier `authenticated` ⇒
--       cualquiera podía REESCRIBIR/BORRAR cualquier propuesta, saltar el estado
--       directo a 'executed', reescribir `command`/`author`/`params` (quórum) —
--       incluso de propuestas ajenas EN VOTACIÓN.
--   · proposal_votes.pv_self : FOR ALL ⇒ el votante podía fijar un `weight`
--       ARBITRARIO (relleno de urna). El cliente SIEMPRE escribe weight=1
--       (engine.castVote); el peso delegado/mérito se RECALCULA en el recuento
--       (engine.tally), nunca se persiste ⇒ clavar weight=1 es seguro y correcto.
--   · group_members / page_members : self-insert con `role` LIBRE ⇒ auto-ascenso
--       a admin/owner de CUALQUIER grupo/página. `os_memberships` YA está
--       protegida por el trigger os_memberships_guard_role — aquí se REPLICA el
--       MISMO patrón (degradar rol privilegiado si no eres el dueño de la entidad).
--   · proposal_notifications.pn_insert : cualquier `authenticated` insertaba
--       notificaciones arbitrarias a cualquiera (spam/phishing).
--   · vote_delegations : permitía AUTO-delegación (delegator = delegate).
--
-- Verificado contra los flujos cliente reales (src/lib/governance/engine.ts y
-- commands.ts): createProposal (author=self, status='open'), castVote (weight=1,
-- upsert onConflict proposal_id,voter), tryResolve (open→passed/rejected/expired,
-- luego passed→executed/failed en DOS updates que sólo tocan status/result/
-- resolved_at/executed_at), resolveOpenProposals (CUALQUIER miembro que ve el
-- panel resuelve las propuestas vencidas). NINGÚN cambio de abajo rompe esos flujos.
--
-- RESIDUAL CONOCIDO (deferido — requiere recuento server-side = tarea A128
-- CRÍTICO): la resolución sigue corriendo en el CLIENTE, así que un `authenticated`
-- aún puede AFIRMAR una transición legal (open→passed) sin recuento honesto. Este
-- endurecimiento CIERRA: reescritura de command/author/ámbito, MANIPULACIÓN de
-- los parámetros de QUÓRUM tras recibir votos (minParticipants/threshold/
-- minPercent/votingMinutes/votingEndsAt inmutables — el resto de params.* sigue
-- mutable para la edición colaborativa política), saltos ILEGALES de estado
-- (open→executed), reapertura/tamper de estados terminales, cierre INSTANTÁNEO
-- (votingEndsAt se recalcula server-side al crear), borrado ajeno y relleno de
-- peso de voto — reduciendo el hueco a "afirmar un estado legal", que el
-- recuento server-side (futuro) cerrará por completo.
--
-- IDEMPOTENTE (drop if exists → create) + REVERSIBLE (ver *_rollback.sql).
-- No borra datos ni altera columnas. APLICAR en nxstilnyidvkqeosofuh vía la
-- Management API (este .sql es la fuente de verdad).
-- ════════════════════════════════════════════════════════════════════════════

-- ── Helper: ¿auth.uid() es DUEÑO de la ENTIDAD (grupo/página/evento) por ref? ──
-- `p_ref` puede ser un slug o un id::text (group_members.group_id es text;
-- page_members.page_id es uuid → ::text). SECURITY DEFINER + STABLE: lee os_* sin
-- disparar recursión de RLS. `id::text = p_ref` nunca castea p_ref (no falla si no
-- es uuid). Devuelve false para refs que no mapean a entidad con dueño.
create or replace function public.gov_is_entity_owner(p_ref text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select p_ref is not null and auth.uid() is not null and exists (
    select 1 from public.os_groups g where g.owner_id = auth.uid() and (g.slug = p_ref or g.id::text = p_ref)
    union all
    select 1 from public.os_pages  p where p.owner_id = auth.uid() and (p.slug = p_ref or p.id::text = p_ref)
    union all
    select 1 from public.os_events e where e.owner_id = auth.uid() and (e.slug = p_ref or e.id::text = p_ref)
  );
$$;
grant execute on function public.gov_is_entity_owner(text) to authenticated, anon;

-- ── group_members: trigger anti-escalada de rol (réplica de os_memberships) ────
-- Un self-join legítimo usa role='member' (default de add_member y de los botones
-- de unirse) ⇒ jamás se toca. Sólo se DEGRADA a 'member' un rol PRIVILEGIADO
-- pedido por quien NO es dueño de la entidad. service_role no se ve afectado.
create or replace function public.group_members_guard_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  privileged constant text[] := array['admin','owner','moderator','mod','administrator','propietario','moderador','dueno','dueño'];
begin
  if auth.role() = 'service_role' then return new; end if;
  if new.role is null or not (lower(new.role) = any (privileged)) then return new; end if;
  if public.gov_is_entity_owner(new.group_id) then return new; end if;
  new.role := 'member';
  return new;
end;
$$;
drop trigger if exists group_members_guard_role_trg on public.group_members;
create trigger group_members_guard_role_trg
  before insert or update on public.group_members
  for each row execute function public.group_members_guard_role();

-- ── page_members: idem (page_id es uuid → ::text) ─────────────────────────────
create or replace function public.page_members_guard_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  privileged constant text[] := array['admin','owner','moderator','mod','administrator','propietario','moderador','dueno','dueño'];
begin
  if auth.role() = 'service_role' then return new; end if;
  if new.role is null or not (lower(new.role) = any (privileged)) then return new; end if;
  if public.gov_is_entity_owner(new.page_id::text) then return new; end if;
  new.role := 'member';
  return new;
end;
$$;
drop trigger if exists page_members_guard_role_trg on public.page_members;
create trigger page_members_guard_role_trg
  before insert or update on public.page_members
  for each row execute function public.page_members_guard_role();

-- ── proposals: máquina de estados + columnas inmutables + clamp de quórum ──────
-- SECURITY DEFINER para poder leer/normalizar con search_path fijo. service_role
-- (barridos administrativos server-side) BYPASSEA. El motor NUNCA cambia las
-- columnas inmutables ni salta estados, así que los RAISE de abajo jamás disparan
-- en el flujo legítimo — sólo ante manipulación.
create or replace function public.proposals_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p jsonb;
  mp numeric; th numeric; pct numeric; vm numeric;
  vm_int int;
begin
  if auth.role() = 'service_role' then return new; end if;

  if tg_op = 'INSERT' then
    -- Autoría y estado SELLADOS por el servidor (no confiar en el cliente).
    new.author := auth.uid();
    new.status := 'open';
    -- Clamp de parámetros de quórum: evita quórum 0/negativo, umbral fuera de
    -- rango y minutos absurdos (topes anti-overflow del cast ::int).
    p := coalesce(new.params, '{}'::jsonb);
    mp  := coalesce(nullif(p->>'minParticipants','')::numeric, 1);
    th  := coalesce(nullif(p->>'threshold','')::numeric, 50);
    pct := coalesce(nullif(p->>'minPercent','')::numeric, 0);
    vm  := coalesce(nullif(p->>'votingMinutes','')::numeric, 2880);
    vm_int := least(5256000, greatest(1, floor(vm)))::int;
    p := jsonb_set(p, '{minParticipants}', to_jsonb(least(100000000, greatest(1, floor(mp)))::int));
    p := jsonb_set(p, '{threshold}',       to_jsonb(least(100, greatest(1, floor(th)))::int));
    p := jsonb_set(p, '{minPercent}',      to_jsonb(least(100, greatest(0, floor(pct)))::int));
    p := jsonb_set(p, '{votingMinutes}',   to_jsonb(vm_int));
    -- Recalcular votingEndsAt SERVER-SIDE: cierra el "cierre instantáneo" (un
    -- cliente no puede fijar un votingEndsAt en el pasado/ahora para forzar el
    -- timeUp de evaluate() y resolver al primer voto). Se ancla en created_at
    -- (default now()) + los minutos ya clampados. to_jsonb(timestamptz) emite
    -- ISO-8601 con 'T' ⇒ parseable por `new Date(...)` en engine.evaluate.
    p := jsonb_set(p, '{votingEndsAt}',
                   to_jsonb(coalesce(new.created_at, now()) + make_interval(mins => vm_int)));
    new.params := p;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- Columnas INMUTABLES tras la creación (el motor sólo cambia status/result/
    -- resolved_at/executed_at). Mutarlas ⇒ error (cierra reescritura de comando,
    -- de autoría y de retargeting de ámbito).
    if new.id is distinct from old.id
       or new.author is distinct from old.author
       or new.command is distinct from old.command
       or new.scope is distinct from old.scope
       or new.scope_ref is distinct from old.scope_ref
       or new.created_at is distinct from old.created_at then
      raise exception 'proposals_guard: campos inmutables (author/command/scope/scope_ref/created_at/id)';
    end if;
    -- SÓLO los parámetros de QUÓRUM son inmutables (no bajar el listón tras
    -- recibir votos). El RESTO de `params` SÍ es mutable — clave para el
    -- subsistema político (political.ts escribe params.political.* vía
    -- patchParamsPolitical preservando estos subcampos): opciones dinámicas,
    -- enmiendas, recordatorios. Comparación por VALOR de cada subclave.
    if (old.params->>'minParticipants') is distinct from (new.params->>'minParticipants')
       or (old.params->>'threshold')     is distinct from (new.params->>'threshold')
       or (old.params->>'minPercent')    is distinct from (new.params->>'minPercent')
       or (old.params->>'votingMinutes') is distinct from (new.params->>'votingMinutes')
       or (old.params->>'votingEndsAt')  is distinct from (new.params->>'votingEndsAt') then
      raise exception 'proposals_guard: parámetros de quórum inmutables (minParticipants/threshold/minPercent/votingMinutes/votingEndsAt)';
    end if;
    -- Contenido CONGELADO una vez CERRADA la propuesta: nadie reescribe el
    -- registro de una decisión ya tomada (tamper-evidencia del "registro público
    -- verificable" de political.ts). Ningún flujo legítimo edita contenido fuera
    -- de 'open' (verificado en la UI: dynamic-options/amendments/reminders sólo
    -- operan con status='open').
    if old.status <> 'open' and (
         new.title is distinct from old.title
      or new.description is distinct from old.description
      or new.kind is distinct from old.kind
      or new.options is distinct from old.options
      or new.attachments is distinct from old.attachments
    ) then
      raise exception 'proposals_guard: propuesta cerrada no editable';
    end if;
    -- Mientras 'open': title/description/options SÍ se abren a NO-autores (edición
    -- colaborativa: promoteOption / voteAmendment aplicada). Pero kind/attachments
    -- no tienen flujo legítimo que los toque (ni el autor) ⇒ author-only.
    if old.status = 'open' and auth.uid() is distinct from old.author
       and (new.kind is distinct from old.kind or new.attachments is distinct from old.attachments) then
      raise exception 'proposals_guard: sólo el autor edita kind/attachments';
    end if;
    -- Máquina de estados: sólo transiciones LEGALES (el título/descripción/
    -- opciones/params.political siguen siendo editables — edición colaborativa).
    if old.status = new.status then return new; end if;
    if old.status = 'open'   and new.status in ('passed','rejected','expired') then return new; end if;
    if old.status = 'passed' and new.status in ('executed','failed')          then return new; end if;
    raise exception 'proposals_guard: transición de estado ilegal % → %', old.status, new.status;
  end if;

  return new;
end;
$$;
drop trigger if exists proposals_guard_trg on public.proposals;
create trigger proposals_guard_trg
  before insert or update on public.proposals
  for each row execute function public.proposals_guard();

-- RLS de proposals: sustituir la permisiva `pr_write` (FOR ALL) por INSERT/UPDATE/
-- DELETE granular. Las policies se OR-combinan ⇒ HAY que ELIMINAR pr_write.
drop policy if exists pr_write on public.proposals;

drop policy if exists pr_insert on public.proposals;
create policy pr_insert on public.proposals for insert
  to authenticated
  with check (author = auth.uid() and status = 'open');

-- UPDATE abierto a `authenticated` PERO gobernado por el trigger (DAG + inmutables
-- + no-edición-ajena). Se mantiene abierto para que CUALQUIER miembro pueda
-- disparar la resolución de propuestas vencidas (resolveOpenProposals). anon no
-- entra (ni antes: pr_write exigía auth.role()='authenticated').
drop policy if exists pr_update on public.proposals;
create policy pr_update on public.proposals for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists pr_delete on public.proposals;
create policy pr_delete on public.proposals for delete
  to authenticated
  using (author = auth.uid());
-- (pr_read SELECT se conserva sin cambios.)

-- ── proposal_votes: voto propio + peso SIEMPRE 1 (anti-relleno de urna) ────────
drop policy if exists pv_self on public.proposal_votes;

drop policy if exists pv_insert on public.proposal_votes;
create policy pv_insert on public.proposal_votes for insert
  to authenticated
  with check (voter = auth.uid() and (weight is null or weight = 1));

drop policy if exists pv_update on public.proposal_votes;
create policy pv_update on public.proposal_votes for update
  to authenticated
  using (voter = auth.uid())
  with check (voter = auth.uid() and (weight is null or weight = 1));

drop policy if exists pv_delete on public.proposal_votes;
create policy pv_delete on public.proposal_votes for delete
  to authenticated
  using (voter = auth.uid());
-- (pv_read SELECT se conserva.)

-- ── proposal_notifications: sólo tipos válidos, no-vistas y propuesta existente ─
-- No se puede exigir inserter=autor: tryResolve inserta 'result' corriendo como
-- CUALQUIER resolutor. Se acota por allowlist de `kind` + seen=false + FK viva.
drop policy if exists pn_insert on public.proposal_notifications;
create policy pn_insert on public.proposal_notifications for insert
  to authenticated
  with check (
    kind in ('vote_request','result','affected','reminder','mention','info')
    and seen = false
    and exists (select 1 from public.proposals pr where pr.id = proposal_id)
  );
-- (pn_self_read, pn_self_upd se conservan — 3 call-sites dependen del UPDATE propio.)

-- ── vote_delegations: prohibir AUTO-delegación (bucle de peso) ─────────────────
-- SELECT se mantiene público a propósito (transparencia del ejercicio del poder:
-- quién delega en quién es un acto de gobernanza público). Sólo se endurece INSERT.
drop policy if exists vote_delegations_insert on public.vote_delegations;
create policy vote_delegations_insert on public.vote_delegations for insert
  to authenticated
  with check (delegator_user = auth.uid() and delegate_user is distinct from delegator_user);
-- (vote_delegations_select/update/delete se conservan.)
