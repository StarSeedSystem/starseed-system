-- ROLLBACK de 20260805190000_gov_resolve_server_side.sql (Adenda 142).
-- ----------------------------------------------------------------------------
-- Restaura el estado PREVIO EXACTO a esa migración:
--   1) proposals_guard() vuelve a la versión de la Adenda 140 (Migración
--      20260804180000_governance_rls_hardening.sql) — SIN la marca transaccional
--      `app.gov_resolving`. Una transición open→passed/rejected/expired vuelve a
--      permitirse desde CUALQUIER `UPDATE proposals SET status=...` de un
--      `authenticated` (el residual conocido que la Adenda 142 cerraba: "afirmar
--      un estado legal sin recuento honesto" — ver cabecera de la migración
--      140). El cuerpo de la función de abajo es una copia VERBATIM (carácter a
--      carácter) de las líneas 120-219 de esa migración; NO editar sin
--      sincronizar ambos ficheros.
--   2) Se retiran las TRES funciones nuevas de la 142 (`gov_resolve_proposal`,
--      `gov_scope_member_ids`, `gov_resolve_slug`) — en ese orden porque
--      `gov_resolve_proposal` las invoca por nombre en su cuerpo plpgsql
--      (aunque Postgres no crea una dependencia dura pg_depend por esto, se
--      dropea primero por prudencia/legibilidad, igual que sugiere la nota de
--      rollback al pie de la propia migración 190000).
--
-- NO toca policies/RLS (pr_insert/pr_update/pr_delete/pv_*/pn_insert/
-- vote_delegations_insert quedan exactamente como las dejó la Adenda 140 — la
-- 142 nunca las tocó, sólo reemplazó proposals_guard() y añadió 3 funciones).
--
-- ⚠️ Tras aplicar este rollback, REVERTIR TAMBIÉN el rewire de
--    src/lib/governance/engine.ts (tryResolve) a su versión pre-142 (evaluate()
--    client-side + `proposals.update({status})` directo), o el cliente llamaría
--    a una RPC `gov_resolve_proposal` que ya no existe y NINGUNA propuesta
--    volvería a resolverse. Mantener migración SQL y cliente SINCRONIZADOS
--    (idéntica advertencia que deja la propia 190000 en su bloque de rollback).
--
-- Aplicar vía Management API. Idempotente (create or replace / drop if exists).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) Restaurar proposals_guard() — VERBATIM Adenda 140 (SIN app.gov_resolving) ──
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

-- ── 2) Retirar las funciones nuevas de la Adenda 142 ────────────────────────
-- Orden: primero la que las invoca (gov_resolve_proposal), luego sus helpers.
drop function if exists public.gov_resolve_proposal(uuid);
drop function if exists public.gov_scope_member_ids(text, text);
drop function if exists public.gov_resolve_slug(text);
