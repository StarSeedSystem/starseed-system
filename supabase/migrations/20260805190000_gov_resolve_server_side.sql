-- ════════════════════════════════════════════════════════════════════════════
-- Adenda 142 (DRAFT · A128 CRÍTICO) — RESOLUCIÓN DE PROPUESTAS SERVER-SIDE.
-- Cierra el RESIDUAL CONOCIDO declarado por la Adenda 140: tras el endurecimiento
-- RLS, un `authenticated` YA NO puede reescribir command/author/ámbito/quórum ni
-- saltar estados ilegales, PERO todavía puede AFIRMAR una transición LEGAL
-- (open→passed) con `UPDATE proposals SET status='passed'` SIN un recuento honesto,
-- porque el recuento (engine.tryResolve) corre en el CLIENTE. Esta migración mueve
-- el recuento AUTORITATIVO al servidor y BLOQUEA que el cliente selle
-- open→passed/rejected/expired salvo a través de la función autoritativa.
--
-- ⚠️ BORRADOR PARA REVISIÓN ADVERSARIAL — NO APLICAR sin auditar. Producción
--    (nxstilnyidvkqeosofuh) tiene 0 propuestas / 0 grupos → iteración segura.
--    Este .sql es la fuente de verdad; el revisor lo aplica vía Management API.
--
-- QUÉ HACE (tres piezas):
--   (1) public.gov_resolve_proposal(p_id uuid) → jsonb  · plpgsql SECURITY DEFINER.
--       Porta a SQL castVote-tally-evaluate-tryResolve de src/lib/governance/*:
--       censo server-side (os_memberships + fallback legado, MAX anti-deflación),
--       voto líquido delegado (computeEffectiveWeights), mérito opt-in
--       (loadMeritWeights: profile_badges avaladas por terceros), recuento y
--       evaluación (quórum por conteo Y %, umbral, timeUp, anti-expiración,
--       decisión anticipada sólo 1p1v puro). Fija open→passed/rejected/expired.
--   (2) proposals_guard() MODIFICADA: una transición de estado (old.status <>
--       new.status) hacia passed/rejected/expired SÓLO se permite dentro del
--       resolver (marca transaccional `app.gov_resolving='on'`) o service_role.
--       Conserva TODAS las invariantes de la Adenda 140. passed→executed/failed
--       queda ABIERTO al cliente (la EJECUCIÓN del comando sigue client-side, fuera
--       de alcance de este port; ver nota de diseño más abajo).
--   (3) grants a authenticated Y anon (justificación en el bloque de grants).
--
-- FUERA DE ALCANCE (residual restante, deliberado): la EJECUCIÓN de comandos
--   (commands.ts executeCommand: publish/add_member/deploy/…) NO se porta a SQL.
--   El cliente sigue ejecutándola tras un 'passed' honesto y sella
--   passed→executed/failed. La ÚNICA ruta de config democrática
--   (set_governance/set_config/set_permission) YA es server-side vía
--   gov_apply_approved_config (Adenda 127), que exige status∈(passed,executed).
--
-- IDEMPOTENTE (create or replace / drop-create) + REVERSIBLE (bloque de rollback
-- al final). No borra datos ni altera columnas.
--
-- SUPUESTOS DE ESQUEMA (no verificables desde este entorno; VALIDAR en revisión):
--   · proposals(id uuid, scope text, scope_ref text, author uuid, kind text,
--       options jsonb, command jsonb, params jsonb, status text, result jsonb,
--       resolved_at timestamptz, executed_at timestamptz, created_at timestamptz).
--       scope_ref es TEXT (guarda slugs y a veces uuids) — clave para no castear.
--   · proposal_votes(proposal_id uuid, voter uuid, choice text, weight numeric,
--       created_at timestamptz)  · PK (proposal_id, voter) ⇒ 1 fila por votante.
--   · os_memberships(user_id uuid, group_slug text, role text).
--   · group_members(group_id TEXT, member, role) · page_members(page_id UUID,
--       profile_id, role) · profiles(id uuid, user_id uuid).
--   · profile_badges(profile_id, badge_id, awarded_by) · badges(id, area text).
--   · vote_delegations(delegator_user, delegate_user, topic text, revoked_at,
--       expires_at, created_at, id).
--   · governance_configs(scope, scope_ref, mode text, params jsonb).
--   · os_groups/os_pages/os_events(id uuid, slug text) · pages(id uuid,
--       governance jsonb).  (pages ≠ os_pages: getConfig lee `pages.governance`.)
-- ════════════════════════════════════════════════════════════════════════════

-- ── Helper A: resolveScopeSlug() portado ──────────────────────────────────────
-- Normaliza un scope_ref al SLUG de la entidad (mirror de membership.resolveScopeSlug):
-- si NO parece uuid → ya es slug, se devuelve tal cual; si parece uuid → mapea por
-- id en os_groups/os_pages/os_events; si no resuelve → el valor original (no casará
-- en os_memberships y el censo cae al fallback legado). `id::text = p_ref` nunca
-- castea p_ref (seguro para slugs). SECURITY DEFINER + STABLE: lee os_* sin RLS.
create or replace function public.gov_resolve_slug(p_ref text)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select case
    when p_ref is null then null
    when p_ref !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      then p_ref
    else coalesce(
      (select g.slug from public.os_groups g where g.id::text = p_ref),
      (select p.slug from public.os_pages  p where p.id::text = p_ref),
      (select e.slug from public.os_events e where e.id::text = p_ref),
      p_ref)
  end;
$$;
grant execute on function public.gov_resolve_slug(text) to authenticated, anon;

-- ── Helper B: conjunto de miembros de UN ámbito (para federación/reach) ───────
-- Mirror de reach.membersOfTarget: UNIÓN de os_memberships (por slug resuelto) +
-- censo legado (group_members.member; page_members→profiles con coalesce
-- user_id?/profile_id, IGUAL que el JS). Devuelve user_ids como TEXT deduplicados.
-- OJO: esto es SÓLO para el camino federado (params.reach). El censo de ámbito
-- ÚNICO usa MAX(primary, legacy) inline (mirror de config.eligibleCount), que NO
-- es lo mismo que |unión| (ver nota de divergencia en el análisis).
create or replace function public.gov_scope_member_ids(p_scope text, p_ref text)
returns table(uid text)
language sql
security definer
set search_path = public
stable
as $$
  select distinct u from (
    -- Principal: membresía real por slug.
    select m.user_id::text as u
      from public.os_memberships m
      where m.group_slug = public.gov_resolve_slug(p_ref)
        and m.user_id is not null
    union all
    -- Legado grupo: member ES la cuenta.
    select gm.member::text
      from public.group_members gm
      where p_scope = 'group' and gm.group_id = p_ref and gm.member is not null
    union all
    -- Legado página/comunidad: profiles.user_id ?? profile_id (mirror JS reach).
    select coalesce(pr.user_id::text, pm.profile_id::text)
      from public.page_members pm
      left join public.profiles pr on pr.id = pm.profile_id
      where p_scope in ('page','community')
        and pm.page_id::text = p_ref
        and (pr.user_id is not null or pm.profile_id is not null)
  ) s
  where u is not null;
$$;
grant execute on function public.gov_scope_member_ids(text, text) to authenticated, anon;

-- ══════════════════════════════════════════════════════════════════════════════
-- (1) RESOLVER AUTORITATIVO
-- ══════════════════════════════════════════════════════════════════════════════
-- gov_resolve_proposal(p_id): carga la propuesta (fail-closed si no está 'open'),
-- computa censo/tally/evaluación server-side y sella el estado. Devuelve jsonb con
-- {resolved, status, winningChoice, reason, commandPending, command, …}. La
-- SEGURIDAD no depende del rol del llamador: el recuento es determinista y honesto,
-- así que quien la invoque (authenticated o anon) no puede alterar el resultado,
-- sólo el momento (y sólo cuando la propuesta ya es resoluble: timeUp/earlyDecisive).
create or replace function public.gov_resolve_proposal(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Propuesta.
  v_scope        text;
  v_ref          text;
  v_status       text;
  v_kind         text;
  v_options      jsonb;
  v_params       jsonb;
  v_command      jsonb;
  v_has_options  boolean;
  -- Config (para mérito fallback + hierNote de la razón).
  v_cfg_mode     text;
  v_cfg_params   jsonb;
  v_mode         text;
  -- Censo.
  v_reach        jsonb;
  v_eligible     int;            -- NULL = censo desconocido.
  v_primary      int := 0;
  v_legacy       int := 0;
  v_slug         text;
  -- Reach (federación).
  v_t            jsonb;
  v_t_scope      text;
  v_t_ref        text;
  v_members      text[];
  v_n            int;
  v_union        text[] := '{}';
  v_inter        text[];
  v_inter_init   boolean := false;
  v_per_sum      int := 0;
  v_known        int := 0;
  v_valid        int := 0;
  v_census_mode  text;
  v_quorum_mode  text;
  -- Votos / pesos.
  rec            record;
  v_voters       text[] := '{}';
  v_choice_of    jsonb := '{}'::jsonb;   -- voter(text) -> choice(text)
  v_eff          jsonb := '{}'::jsonb;   -- voter(text) -> peso efectivo (numeric)
  v_participants int := 0;
  -- Delegaciones.
  v_topic        text;
  v_deleg        jsonb := '{}'::jsonb;   -- delegator -> delegate (uno por delegador)
  v_deleg_count  int := 0;               -- nº de delegaciones activas (mirror .length)
  v_key          text;
  v_cur          text;
  v_seen         text[];
  v_target       text;
  -- Mérito.
  v_merit_params jsonb;
  v_merit_on     boolean := false;
  v_merit_applied boolean := false;
  v_eff_area     text;
  v_area         text;
  v_max_bonus    numeric;
  v_raw_bonus    numeric;
  v_bonus        numeric;
  -- Tally.
  v_counts       jsonb := '{}'::jsonb;   -- choice -> peso acumulado (numeric)
  v_choice_order text[] := '{}';         -- orden determinista de iteración (tie-break)
  v_ch           text;
  v_w            numeric;
  v_leader       text;
  v_leader_votes numeric := 0;
  v_decisive     numeric := 0;
  v_leader_share int := 0;
  v_turnout      int := 0;
  v_runner       numeric := 0;
  -- Evaluación.
  v_min_part     numeric;
  v_threshold    numeric;
  v_min_pct      numeric;
  v_ends         timestamptz;
  v_time_up      boolean;
  v_quorum_count boolean;
  v_quorum_pct   boolean;
  v_quorum_met   boolean;
  v_threshold_met boolean;
  v_weighted     boolean := false;
  v_early        boolean := false;
  v_remaining    int;
  v_decided      boolean := false;
  v_status_new   text;
  v_winning      text;
  v_reason       text;
  v_hier_note    text := '';
  v_result       jsonb;
  v_updated      int := 0;
begin
  -- ── 1) Cargar + BLOQUEAR la propuesta (serializa resolutores concurrentes) ──
  select p.scope, p.scope_ref, p.status, p.kind, p.options, p.params, p.command
    into v_scope, v_ref, v_status, v_kind, v_options, v_params, v_command
  from public.proposals p
  where p.id = p_id
  for update;

  if not found then
    return jsonb_build_object('resolved', false, 'error', 'not_found');
  end if;
  -- Fail-closed: sólo se resuelve una propuesta ABIERTA (mirror del early-return de
  -- tryResolve para estados terminales).
  if v_status is distinct from 'open' then
    return jsonb_build_object('resolved', false, 'status', v_status);
  end if;

  v_params := coalesce(v_params, '{}'::jsonb);
  v_has_options := (jsonb_typeof(v_options) = 'array' and jsonb_array_length(v_options) > 0);

  -- ── 2) Config del contexto (governance_configs; fallback pages.governance) ──
  -- Mirror parcial de getConfig: sólo se necesitan `mode` (hierNote, display) y
  -- `params.meritWeighting` (fallback de mérito). La fusión con DEFAULT_GOV_PARAMS
  -- del cliente no altera estos dos campos.
  select gc.mode, gc.params into v_cfg_mode, v_cfg_params
  from public.governance_configs gc
  where gc.scope = v_scope and gc.scope_ref is not distinct from v_ref
  limit 1;

  if v_cfg_params is null and v_scope in ('page','community') and v_ref is not null then
    -- pages.governance (best-effort; sólo casa si scope_ref es el uuid de la página).
    select pg.governance->>'mode', pg.governance->'params'
      into v_cfg_mode, v_cfg_params
    from public.pages pg
    where pg.id::text = v_ref
    limit 1;
  end if;
  v_mode := coalesce(v_cfg_mode, 'democratic');
  if v_mode = 'hierarchical' then
    v_hier_note := ' · Contexto jerárquico: un administrador también puede decidir, pero la opción democrática siempre está disponible.';
  end if;

  -- ── 3) Censo elegible (server-side) ─────────────────────────────────────────
  v_reach := coalesce(v_params->'reach', v_params->'federation');
  -- normalizeReach: el reach SÓLO cuenta si hay ≥1 objetivo ESTRUCTURALMENTE válido
  -- (scope Y scopeRef presentes). Si falta el array `targets`, está vacío, o NINGÚN
  -- objetivo es válido ⇒ reachFromParams→normalizeReach devuelve null y el motor cae
  -- al censo de ÁMBITO ÚNICO. Se replica aquí: sin esto, un reach con targets basura
  -- divergiría (JS → ámbito único; el port habría dado censo nulo → no finalizar).
  -- OJO: un objetivo VÁLIDO pero SIN miembros NO anula el reach (censo = null, igual
  -- que supraEligibleCount con known=0); sólo la INVALIDEZ estructural lo anula.
  if v_reach is not null
     and jsonb_typeof(v_reach->'targets') = 'array'
     and jsonb_array_length(v_reach->'targets') > 0 then
    select count(*) into v_valid
    from jsonb_array_elements(v_reach->'targets') t
    where nullif(t.value->>'scope','') is not null
      and coalesce(nullif(t.value->>'scopeRef',''), nullif(t.value->>'scope_ref','')) is not null;
    if coalesce(v_valid, 0) = 0 then v_reach := null; end if;
  else
    v_reach := null;
  end if;

  if v_reach is not null then
    -- ---- Camino FEDERADO (mirror de eligibleForReach) --------------------------
    v_census_mode := coalesce(v_reach->>'census', 'union');
    v_quorum_mode := coalesce(v_reach->>'quorum', 'aggregate');
    for v_t in select value from jsonb_array_elements(v_reach->'targets') loop
      v_t_scope := nullif(v_t->>'scope', '');
      v_t_ref   := coalesce(nullif(v_t->>'scopeRef',''), nullif(v_t->>'scope_ref',''));
      if v_t_scope is null or v_t_ref is null then continue; end if;
      select coalesce(array_agg(distinct m.uid), '{}')
        into v_members
      from public.gov_scope_member_ids(v_t_scope, v_t_ref) m;
      v_n := coalesce(array_length(v_members, 1), 0);
      if v_n = 0 then continue; end if;         -- objetivo sin censo conocido → se ignora
      v_known   := v_known + 1;
      v_per_sum := v_per_sum + v_n;
      v_union   := array(select distinct u from unnest(v_union || v_members) u);
      if not v_inter_init then
        v_inter := v_members; v_inter_init := true;
      else
        v_inter := array(select u from unnest(v_inter) u where u = any(v_members));
      end if;
    end loop;
    if v_known = 0 then
      v_eligible := null;
    elsif v_quorum_mode = 'per_target' then
      v_eligible := v_per_sum;
    elsif v_census_mode = 'intersection' then
      v_eligible := coalesce(array_length(v_inter, 1), 0);
    else
      v_eligible := coalesce(array_length(v_union, 1), 0);
    end if;
    -- intersección vacía (0) ≡ censo no útil → NULL (equivalente en conducta al 0
    -- del JS: con minPct>0 la anti-expiración no finaliza; con minPct=0 no importa).
    if v_eligible is not null and v_eligible = 0 then v_eligible := null; end if;
  else
    -- ---- Camino de ÁMBITO ÚNICO (mirror EXACTO de config.eligibleCount) --------
    -- eligible = MAX(|os_memberships|, |legado|); NULL sólo si ambos = 0.
    v_slug := public.gov_resolve_slug(v_ref);
    if v_slug is not null then
      select count(distinct m.user_id) into v_primary
      from public.os_memberships m where m.group_slug = v_slug;
    end if;
    if v_scope in ('page','community') and v_ref is not null then
      -- UNA PERSONA UNA VOZ: page_members(perfil) → profiles.user_id (cuentas).
      select count(distinct pr.user_id) into v_legacy
      from public.page_members pm
      join public.profiles pr on pr.id = pm.profile_id
      where pm.page_id::text = v_ref;
    elsif v_scope = 'group' and v_ref is not null then
      select count(distinct gm.member) into v_legacy
      from public.group_members gm where gm.group_id = v_ref;
    end if;
    if coalesce(v_primary,0) = 0 and coalesce(v_legacy,0) = 0 then
      v_eligible := null;
    else
      v_eligible := greatest(coalesce(v_primary,0), coalesce(v_legacy,0));
    end if;
  end if;

  -- ── 3b) ANTI-EXPIRACIÓN POR CENSO DESCONOCIDO (mirror tryResolve) ───────────
  -- Si se exige % de censo (minPercent>0) y el censo NO se pudo determinar, NO
  -- finalizar: un parpadeo/censo vacío no debe marcar 'expired' PERMANENTE una
  -- propuesta que sí podría tener quórum. Se reintenta en la próxima llamada.
  v_min_pct := coalesce(nullif(v_params->>'minPercent','')::numeric, 0);
  if v_min_pct > 0 and (v_eligible is null or v_eligible <= 0) then
    return jsonb_build_object('resolved', false, 'status', 'open',
                              'detail', 'census_unavailable');
  end if;

  -- ── 4) Votos: conjunto de votantes + voz base (peso 1) ──────────────────────
  for rec in
    select v.voter::text as voter, v.choice as choice
    from public.proposal_votes v
    where v.proposal_id = p_id
    order by v.created_at asc, v.voter::text asc
  loop
    if not (rec.voter = any(v_voters)) then
      v_voters := v_voters || rec.voter;                 -- PK garantiza unicidad; defensivo
    end if;
    v_choice_of := jsonb_set(v_choice_of, array[rec.voter], to_jsonb(rec.choice), true);
    v_eff       := jsonb_set(v_eff, array[rec.voter], to_jsonb(1::numeric), true);
  end loop;
  v_participants := coalesce(array_length(v_voters, 1), 0);

  -- ── 5) Voto líquido delegado (mirror computeEffectiveWeights) ───────────────
  v_topic := case when v_ref is not null then v_scope || ':' || v_ref else v_scope end;
  for rec in
    select d.delegator_user::text as du, d.delegate_user::text as de
    from public.vote_delegations d
    where d.topic = v_topic
      and d.revoked_at is null
      and d.expires_at > now()
      and d.delegator_user is not null
      and d.delegate_user is not null
      and d.delegator_user is distinct from d.delegate_user
    order by d.created_at asc, d.id asc
    limit 2000
  loop
    v_deleg_count := v_deleg_count + 1;                   -- cuenta CRUDA (= delegations.length)
    if not jsonb_exists(v_deleg, rec.du) then
      v_deleg := jsonb_set(v_deleg, array[rec.du], to_jsonb(rec.de), true);  -- 1ª gana (determinista)
    end if;
  end loop;

  -- Plegado de cadenas: cada delegante que NO votó cede su voz al primer eslabón
  -- que SÍ votó; el delegante que votó reclama la suya; los ciclos se rompen.
  if v_deleg_count > 0 then
    for v_key in select k from jsonb_object_keys(v_deleg) k loop
      if jsonb_exists(v_choice_of, v_key) then continue; end if;   -- votó directo → reclama
      v_seen := array[v_key];
      v_cur := v_deleg ->> v_key;
      v_target := null;
      while v_cur is not null loop
        if jsonb_exists(v_choice_of, v_cur) then v_target := v_cur; exit; end if;  -- eslabón que votó
        if v_cur = any(v_seen) then v_cur := null; exit; end if;                   -- ciclo
        v_seen := v_seen || v_cur;
        v_cur := v_deleg ->> v_cur;
      end loop;
      if v_target is not null and v_target is distinct from v_key then
        v_eff := jsonb_set(v_eff, array[v_target],
                           to_jsonb((v_eff->>v_target)::numeric + 1), true);
      end if;
    end loop;
  end if;

  -- ── 6) Meritocracia del entendimiento (OPT-IN; mirror loadMeritWeights) ─────
  -- Fuente: proposal.params.meritWeighting ?? config.params.meritWeighting.
  if jsonb_exists(v_params, 'meritWeighting') then
    v_merit_params := v_params->'meritWeighting';
  else
    v_merit_params := v_cfg_params->'meritWeighting';
  end if;
  v_merit_on := coalesce((v_merit_params->>'enabled')::boolean, false);

  if v_merit_on then
    -- Área efectiva: params.area concreta MANDA; 'auto'/ausente → deducida del tema.
    v_area := lower(coalesce(v_scope,'') || ' ' || coalesce(v_kind,''));
    v_area := case
                when v_area like '%polit%'  then 'politica'
                when v_area like '%educ%'   then 'educacion'
                when v_area like '%cultur%' then 'cultura'
                else 'general'
              end;
    v_eff_area := case
                    when nullif(v_merit_params->>'area','') is not null
                         and (v_merit_params->>'area') <> 'auto'
                      then v_merit_params->>'area'
                    else v_area
                  end;
    -- Tope DURO ≤ 2× (HARD_MAX_BONUS = 1): la config sólo BAJA el bonus.
    v_raw_bonus := coalesce(
      case when (v_merit_params->>'maxBonus') ~ '^-?[0-9]+(\.[0-9]+)?$'
             and (v_merit_params->>'maxBonus')::numeric >= 0
           then (v_merit_params->>'maxBonus')::numeric end,
      1);
    v_max_bonus := least(1, v_raw_bonus);
    if v_max_bonus > 0 then
      -- Sólo insignias AVALADAS POR TERCEROS (awarded_by no nulo y ≠ propia cuenta)
      -- y del ÁREA RELEVANTE (efectiva nula → cualquiera; coincide; o 'general').
      -- multiplicador = 1 + min(maxBonus, 0.5 · nº insignias relevantes).
      for rec in
        select pr.uid as uid, count(*) as c
        from (
          select p.id as pid, p.user_id::text as uid
          from public.profiles p
          where p.user_id::text = any(v_voters)
        ) pr
        join public.profile_badges pb on pb.profile_id = pr.pid
        left join public.badges b on b.id = pb.badge_id
        where pb.awarded_by is not null
          and pb.awarded_by::text is distinct from pr.uid
          and (
            v_eff_area is null
            or coalesce(b.area,'general') = v_eff_area
            or coalesce(b.area,'general') = 'general'
          )
        group by pr.uid
      loop
        v_bonus := least(v_max_bonus, 0.5 * rec.c);
        if v_bonus > 0 and jsonb_exists(v_eff, rec.uid) then
          -- SUMA el bonus a la voz base del votante (nunca multiplica el caudal
          -- delegado); mirror EXACTO de tally: w = base + (multiplicador − 1).
          v_eff := jsonb_set(v_eff, array[rec.uid],
                             to_jsonb((v_eff->>rec.uid)::numeric + v_bonus), true);
          v_merit_applied := true;
        end if;
      end loop;
    end if;
  end if;

  -- ── 7) Recuento (mirror tally) ──────────────────────────────────────────────
  -- Inicializa las opciones a 0 en su ORDEN (desempate = 1º en aparecer, como el
  -- orden de inserción de claves de JS).
  if v_has_options then
    for rec in select value->>'id' as id from jsonb_array_elements(v_options) where value->>'id' is not null loop
      if not jsonb_exists(v_counts, rec.id) then
        v_counts := jsonb_set(v_counts, array[rec.id], to_jsonb(0::numeric), true);
        v_choice_order := v_choice_order || rec.id;
      end if;
    end loop;
  else
    v_counts := jsonb_build_object('yes', 0, 'no', 0, 'abstain', 0);
    v_choice_order := array['yes','no','abstain'];
  end if;

  -- Acumula pesos por opción. Una opción NO declarada que reciba votos se añade
  -- (mirror del `if (counts[choice]==null) counts[choice]=0`).
  for v_key in select k from jsonb_object_keys(v_choice_of) k loop
    v_ch := v_choice_of ->> v_key;
    v_w  := (v_eff ->> v_key)::numeric;
    if not jsonb_exists(v_counts, v_ch) then
      v_counts := jsonb_set(v_counts, array[v_ch], to_jsonb(0::numeric), true);
      v_choice_order := v_choice_order || v_ch;
    end if;
    v_counts := jsonb_set(v_counts, array[v_ch],
                          to_jsonb((v_counts->>v_ch)::numeric + v_w), true);
  end loop;

  -- Participación (%): personas / censo. Redondeo NUMERIC = half-away-from-zero =
  -- Math.round para no-negativos (ver nota de divergencia).
  if v_eligible is not null and v_eligible > 0 then
    v_turnout := round(v_participants::numeric * 100 / v_eligible)::int;
  else
    v_turnout := 0;
  end if;

  -- Líder (ignora 'abstain' en sí/no) y cuota de victoria.
  foreach v_ch in array v_choice_order loop
    if not v_has_options and v_ch = 'abstain' then continue; end if;
    v_w := coalesce((v_counts->>v_ch)::numeric, 0);
    v_decisive := v_decisive + v_w;
    if v_w > v_leader_votes then
      v_leader_votes := v_w;
      v_leader := v_ch;
    end if;
  end loop;
  if v_decisive > 0 then
    v_leader_share := round(v_leader_votes * 100 / v_decisive)::int;
  else
    v_leader_share := 0;
  end if;

  -- ── 8) Evaluación (mirror evaluate) ─────────────────────────────────────────
  v_min_part  := coalesce(nullif(v_params->>'minParticipants','')::numeric, 0);
  v_threshold := coalesce(nullif(v_params->>'threshold','')::numeric, 50);
  -- votingEndsAt server-sellado por proposals_guard (to_jsonb(timestamptz) ⇒ ISO).
  -- Ausente/ inválido ⇒ endsAt = now ⇒ timeUp (mirror del `? : now` de JS).
  begin
    v_ends := coalesce(nullif(v_params->>'votingEndsAt','')::timestamptz, now());
  exception when others then
    v_ends := now();
  end;
  v_time_up := now() >= v_ends;

  v_quorum_count := v_participants >= v_min_part;
  v_quorum_pct := case
                    when v_min_pct <= 0 then true
                    when v_eligible is not null and v_eligible > 0 then v_turnout >= v_min_pct
                    else false
                  end;
  v_quorum_met := v_quorum_count and v_quorum_pct;
  v_threshold_met := v_leader_share >= v_threshold;

  -- Con pesos activos (delegación o mérito no vacío) la decisión anticipada NO
  -- aplica (un pendiente puede sumar >1 al segundo). Mirror EXACTO del flag `weighted`.
  v_weighted := (v_deleg_count > 0) or v_merit_applied;

  if not v_time_up and not v_weighted and v_quorum_met
     and v_eligible is not null and v_eligible > 0 and v_leader is not null then
    v_remaining := greatest(0, v_eligible - v_participants);
    v_runner := 0;
    foreach v_ch in array v_choice_order loop
      if v_ch = v_leader then continue; end if;
      if not v_has_options and v_ch = 'abstain' then continue; end if;
      v_w := coalesce((v_counts->>v_ch)::numeric, 0);
      if v_w > v_runner then v_runner := v_w; end if;
    end loop;
    if v_leader_votes > v_runner + v_remaining then v_early := true; end if;
  end if;

  v_decided := v_time_up or v_early;

  if not v_decided then
    -- Aún abierta: NO se sella nada.
    return jsonb_build_object('resolved', false, 'status', 'open',
                              'participants', v_participants, 'eligible', v_eligible);
  end if;

  -- Decidida: quórum → si no, expira; si sí, umbral + aprobación de líder.
  if not v_quorum_met then
    v_status_new := 'expired';
    v_winning := null;
    v_reason := 'Sin quórum: ' || v_participants || ' participante(s)'
      || (case when v_min_pct > 0 then ', ' || v_turnout || '% de participación' else '' end)
      || '. Se requería mín. ' || v_min_part::int
      || (case when v_min_pct > 0 then ' y ' || v_min_pct::int || '%' else '' end)
      || '.' || v_hier_note;
  else
    -- En sí/no sólo aprueba si gana 'yes'; con opciones, cualquier líder aprueba.
    if (case when v_has_options then v_leader is not null else v_leader = 'yes' end)
       and v_threshold_met then
      v_status_new := 'passed';
      v_winning := v_leader;
      v_reason := 'Aprobada con ' || v_leader_share || '% para la opción líder'
        || (case when v_early then ' (decisión anticipada irreversible)' else '' end)
        || '.' || v_hier_note;
    else
      v_status_new := 'rejected';
      v_winning := v_leader;
      v_reason := 'Rechazada: la opción líder alcanzó ' || v_leader_share
        || '% (umbral ' || v_threshold::int || '%).' || v_hier_note;
    end if;
  end if;

  -- ── 9) Sellado bajo la MARCA DE RESOLUCIÓN (transaccional) ──────────────────
  -- set_config(...,true) = LOCAL a esta transacción (la de la RPC): el trigger
  -- proposals_guard verá 'on' SÓLO en el UPDATE de abajo; muere al terminar la tx
  -- (sin fuga entre peticiones del pool). Un cliente NO puede activar esta marca
  -- en la misma tx que un UPDATE crudo (no puede inyectar sentencias en la RPC ni
  -- llamar set_config: no está expuesta como RPC en el esquema public).
  perform set_config('app.gov_resolving', 'on', true);

  v_result := jsonb_build_object(
    'reason', v_reason,
    'winningChoice', v_winning,
    'evaluatedAt', to_jsonb(now()),
    'server', true,
    'tally', jsonb_build_object(
      'counts', v_counts,
      'participants', v_participants,
      'turnoutPct', v_turnout,
      'leader', v_leader,
      'leaderShare', v_leader_share,
      'eligible', v_eligible,
      'weighted', v_weighted,
      'earlyDecisive', v_early
    )
  );

  update public.proposals
     set status = v_status_new,
         result = v_result,
         resolved_at = now()
   where id = p_id and status = 'open';
  get diagnostics v_updated = row_count;

  -- Cierra la ventana de la marca cuanto antes (redundante con el is_local, defensivo).
  perform set_config('app.gov_resolving', 'off', true);

  if v_updated = 0 then
    -- Otro resolutor ganó la carrera (imposible bajo el FOR UPDATE, pero defensivo).
    return jsonb_build_object('resolved', false, 'status', 'open', 'detail', 'race_lost');
  end if;

  return jsonb_build_object(
    'resolved', true,
    'status', v_status_new,
    'winningChoice', v_winning,
    'reason', v_reason,
    'earlyDecisive', v_early,
    'eligible', v_eligible,
    'participants', v_participants,
    -- El CLIENTE ejecuta el comando tras un 'passed' y luego sella passed→executed/
    -- failed (permitido por el guard sin la marca; ver pieza 2).
    'commandPending', (v_status_new = 'passed'
                       and v_command is not null
                       and nullif(v_command->>'type','') is not null
                       and (v_command->>'type') <> 'none'),
    'command', case when v_status_new = 'passed' then v_command else null end
  );
end;
$$;

-- GRANTS (pieza 3): authenticated Y anon.
-- · authenticated: castVote/tryResolve/resolveOpenProposals corren como el usuario.
-- · anon: resolveOpenProposals se dispara al MONTAR el panel de decisiones, que
--   pueden ver visitantes NO autenticados; hoy anon NO puede resolver (la RLS
--   pr_update es `to authenticated`), así que las propuestas vencidas se quedaban
--   sin resolver si sólo las miraba un anónimo. Como el resolver es AUTORITATIVO y
--   fail-closed (sólo finaliza lo ya resoluble y el llamador no altera el
--   resultado), conceder anon MEJORA la vivacidad SIN abrir un vector: es seguro
--   por construcción (idéntico criterio que gov_apply_approved_config, ya anon).
--   La EJECUCIÓN de comandos sigue exigiendo un actor authenticated (RLS de
--   proposals/tablas destino intactas), así que anon puede sellar un recuento pero
--   NO ejecutar efectos secundarios. RESIDUAL: superficie DoS anon (mitigable con
--   rate-limit en el edge; la RPC hace early-return si no está 'open').
grant execute on function public.gov_resolve_proposal(uuid) to authenticated, anon;

-- ══════════════════════════════════════════════════════════════════════════════
-- (2) proposals_guard MODIFICADA — bloquea el sellado de estado al resolver
-- ══════════════════════════════════════════════════════════════════════════════
-- IDÉNTICA a la Adenda 140 en TODO salvo el bloque de máquina de estados: una
-- transición hacia passed/rejected/expired exige la marca `app.gov_resolving='on'`
-- (⇒ estamos dentro de gov_resolve_proposal) o service_role. passed→executed/failed
-- queda abierto al cliente. Conserva: columnas inmutables, congelado de subclaves de
-- quórum, congelado de contenido tras cierre, kind/attachments author-only, y el
-- sellado server-side de author/status/params en INSERT.
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
    -- Clamp de parámetros de quórum (topes anti-overflow del cast ::int).
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
    -- votingEndsAt recalculado server-side (cierra el "cierre instantáneo").
    p := jsonb_set(p, '{votingEndsAt}',
                   to_jsonb(coalesce(new.created_at, now()) + make_interval(mins => vm_int)));
    new.params := p;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- Columnas INMUTABLES tras la creación.
    if new.id is distinct from old.id
       or new.author is distinct from old.author
       or new.command is distinct from old.command
       or new.scope is distinct from old.scope
       or new.scope_ref is distinct from old.scope_ref
       or new.created_at is distinct from old.created_at then
      raise exception 'proposals_guard: campos inmutables (author/command/scope/scope_ref/created_at/id)';
    end if;
    -- Sólo los parámetros de QUÓRUM son inmutables (el resto de params sí muta).
    if (old.params->>'minParticipants') is distinct from (new.params->>'minParticipants')
       or (old.params->>'threshold')     is distinct from (new.params->>'threshold')
       or (old.params->>'minPercent')    is distinct from (new.params->>'minPercent')
       or (old.params->>'votingMinutes') is distinct from (new.params->>'votingMinutes')
       or (old.params->>'votingEndsAt')  is distinct from (new.params->>'votingEndsAt') then
      raise exception 'proposals_guard: parámetros de quórum inmutables (minParticipants/threshold/minPercent/votingMinutes/votingEndsAt)';
    end if;
    -- Contenido CONGELADO una vez CERRADA la propuesta.
    if old.status <> 'open' and (
         new.title is distinct from old.title
      or new.description is distinct from old.description
      or new.kind is distinct from old.kind
      or new.options is distinct from old.options
      or new.attachments is distinct from old.attachments
    ) then
      raise exception 'proposals_guard: propuesta cerrada no editable';
    end if;
    -- Mientras 'open': kind/attachments author-only (title/description/options se
    -- abren a la edición colaborativa).
    if old.status = 'open' and auth.uid() is distinct from old.author
       and (new.kind is distinct from old.kind or new.attachments is distinct from old.attachments) then
      raise exception 'proposals_guard: sólo el autor edita kind/attachments';
    end if;

    -- ── MÁQUINA DE ESTADOS (ENDURECIDA Adenda 142) ────────────────────────────
    -- Sin cambio de estado → OK (edición colaborativa de contenido/params.political).
    if old.status = new.status then return new; end if;
    -- Transiciones de RESOLUCIÓN (recuento honesto): SÓLO dentro del resolver
    -- server-side (marca transaccional) o service_role. Un `UPDATE proposals SET
    -- status='passed'` de un cliente cae aquí SIN la marca ⇒ RECHAZADO. Esto CIERRA
    -- el residual de la Adenda 140 (afirmar un estado legal sin recuento honesto).
    if old.status = 'open' and new.status in ('passed','rejected','expired') then
      if coalesce(current_setting('app.gov_resolving', true), '') = 'on' then
        return new;
      end if;
      raise exception 'proposals_guard: la resolución (open→%) debe pasar por gov_resolve_proposal()', new.status;
    end if;
    -- passed→executed/failed: ABIERTO al cliente. La EJECUCIÓN del comando corre en
    -- el cliente (fuera de alcance del port SQL) y sólo puede ocurrir DESPUÉS de un
    -- 'passed' ya sellado honestamente por el resolver, así que no reabre el hueco
    -- de recuento; sólo anota el desenlace de un comando cuya ejecución ya es
    -- client-side. (Alternativa más estricta en el análisis: 2ª RPC gov_mark_executed.)
    if old.status = 'passed' and new.status in ('executed','failed') then return new; end if;
    raise exception 'proposals_guard: transición de estado ilegal % → %', old.status, new.status;
  end if;

  return new;
end;
$$;
-- Re-crear el trigger (idempotente; mismo binding que la Adenda 140).
drop trigger if exists proposals_guard_trg on public.proposals;
create trigger proposals_guard_trg
  before insert or update on public.proposals
  for each row execute function public.proposals_guard();

-- ══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (para un *_rollback.sql companion, o ejecutar a mano):
--   -- 1) Restaurar el guard de la Adenda 140 re-aplicando su migración:
--   --    20260804180000_governance_rls_hardening.sql  (define proposals_guard SIN
--   --    la marca app.gov_resolving), o pegar aquí su cuerpo de proposals_guard.
--   -- 2) Retirar las funciones nuevas:
--   drop function if exists public.gov_resolve_proposal(uuid);
--   drop function if exists public.gov_scope_member_ids(text, text);
--   drop function if exists public.gov_resolve_slug(text);
--   -- (El cliente vuelve al camino tryResolve JS + UPDATE directo, que la RLS
--   --  pr_update `to authenticated` y el guard 140 vuelven a permitir.)
-- Nota: tras el rollback, REVERTIR también el rewire de engine.ts (que vuelve a
-- hacer el evaluate JS + proposals.update({status})), o el cliente llamaría a una
-- RPC inexistente. Mantener el rewire y el guard endurecido SINCRONIZADOS.
-- ══════════════════════════════════════════════════════════════════════════════
