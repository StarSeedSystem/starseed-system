-- ════════════════════════════════════════════════════════════════════════════
-- governance_configs SECURITY DEFINER v2 — seguimiento de la Adenda 140
-- (residual #2). Sustituye/reemplaza a 20260801170000_governance_configs_secdef_
-- rls.sql, que NUNCA se aplicó a producción (confirmado por auditoría en vivo,
-- claude/adenda-140-rls-gobernanza-auditoria-viva-2026-08-05.md): `gc_write`
-- sigue abierta (FOR ALL a `authenticated`) y no existen `gov_apply_approved_
-- config`, `gov_scope_owner`, `governance_configs_insert_own` ni el índice único
-- en la BD real. Esta migración incluye TODO lo que hacía 170000 y ADEMÁS cierra
-- el CRÍTICO que encontró la revisión adversarial de la Adenda 128 sobre ese
-- mismo diseño (ver claude/adenda-128-…: "gov_apply_approved_config no valida
-- membresía/quórum reales → un forastero puede crear una propuesta con quórum
-- trivial sobre un grupo ajeno, votarla solo, y la RPC aplicaría el cambio").
--
-- ── EL AGUJERO EXACTO (170000 original) ───────────────────────────────────────
-- `gov_apply_approved_config(p_proposal_id)` sólo comprobaba
-- `proposals.status in ('passed','executed')` y derivaba (scope, scope_ref) del
-- COMANDO ALMACENADO de la propuesta — pero NUNCA comprobaba que el AUTOR (ni
-- ningún votante) de esa propuesta perteneciera de verdad a la entidad destino.
-- Exploit: un forastero crea una propuesta scope='group', scope_ref=<slug ajeno>,
-- params={minParticipants:1, minPercent:0} (autodeclarados, sin verja server-side
-- de "eres miembro" en la creación), vota UNA vez → `evaluate()` la marca
-- 'passed' (recuento en cliente, residual conocido y aparte, Adenda 140 §1) →
-- llama a la RPC → la RPC aplica el cambio de gobernanza sobre el GRUPO AJENO.
-- Secuestro de gobernanza entre inquilinos ("cross-tenant").
--
-- ── SEGUNDO AGUJERO ENCONTRADO AL REUSAR `gov_scope_owner` (no documentado
--    explícitamente en la Adenda 128, pero SÍ en su hallazgo secundario) ───────
-- El propio `gov_scope_owner` de 170000 casaba SÓLO por
-- `g.id::text = p_scope_ref` (uuid). Pero la gobernanza se direcciona por SLUG:
-- `src/lib/governance/membership.ts` documenta explícitamente que
-- "la superficie de decisiones (decisiones-section.tsx) pasa el SLUG como
-- scopeRef" y que el censo real vive en `os_memberships.group_slug`. Con el
-- casado sólo-por-id, `gov_scope_owner('group', <slug>)` da SIEMPRE NULL (un
-- slug nunca es igual al texto de un uuid) — es decir, TODO grupo se trataría
-- como "sin dueño / ámbito personal" y la verja de propiedad quedaría NEUTRALI-
-- ZADA para grupos (exactamente lo que ya señaló la Adenda 128: "el gate anti-
-- squatting gov_scope_owner casaba por UUID… el squatting seguía abierto"). Si
-- no se corrige esto, la NUEVA verja de legitimidad de abajo (que depende de
-- `gov_scope_owner`) quedaría IGUAL de neutralizada para grupos → se reabriría
-- el mismo hueco por otra puerta. Por eso esta v2 corrige `gov_scope_owner` para
-- casar por `slug` (patrón ya usado y VERIFICADO en producción por
-- `gov_is_entity_owner`, de 20260804180000/Adenda 140 — aplicada y verificada).
--
-- ── LA VERJA NUEVA ─────────────────────────────────────────────────────────
-- Antes de aplicar el cambio, `gov_apply_approved_config` exige:
--   gov_scope_owner(scope, scope_ref) IS NULL   -- ámbito personal/global, sin
--                                                -- entidad con dueño: nada que
--                                                -- secuestrar entre inquilinos
--   OR
--   gov_author_is_entity_member(scope, scope_ref, <author de la propuesta>)
--                                                -- el AUTOR (columna real de la
--                                                -- propuesta, NO auth.uid() del
--                                                -- que dispara la resolución —
--                                                -- Adenda 140 dejó pr_update
--                                                -- abierto a "cualquier miembro
--                                                -- dispara la resolución", así
--                                                -- que el invocador puede ser
--                                                -- alguien distinto del autor)
--                                                -- es miembro real u dueño de
--                                                -- la entidad destino.
-- `gov_author_is_entity_member` (NUEVA, esta migración) es la función parametri-
-- zada que hacía falta: los helpers existentes de este patrón en el repo
-- (`gov_is_entity_owner`, Adenda 140; y — por nombre, aunque su definición no
-- vive en supabase/migrations/ de esta copia porque se aplicó ad-hoc antes del
-- primer commit registrado — `os_is_group_member`/`check_entity_role`/
-- `es_is_entity_member`) siguen TODOS el mismo patrón de "función SECURITY
-- DEFINER pensada para políticas RLS": comprueban auth.uid() IMPLÍCITO (el
-- llamador de la sesión actual), no un uuid arbitrario recibido por parámetro.
-- Aquí necesitamos comprobar la membresía del AUTOR ALMACENADO en la propuesta,
-- que puede diferir del invocador — por eso se escribe una función nueva y
-- explícitamente parametrizada por `p_author`, reutilizando las MISMAS tablas y
-- el MISMO patrón de casado slug-o-id que ya está verificado en producción
-- (`os_memberships` como censo principal + `os_groups`/`os_pages` + fallback
-- legado `group_members`/`page_members`, igual que
-- `src/lib/governance/engine.ts::resolveVoterIds`).
--
-- ── OTROS CAMBIOS RESPECTO A 170000 (pedidos + hallazgos propios) ────────────
--   · GRANT de `gov_apply_approved_config` → SÓLO `authenticated` (se retira
--     `anon`). Verificado seguro: `proposals` UPDATE (paso previo obligatorio de
--     `tryResolve` antes de poder llamar a esta RPC) YA es `to authenticated`
--     únicamente desde la Adenda 140 (`pr_update`, comentario explícito "anon no
--     entra"), así que un `anon` nunca podía llegar a invocar esta función de
--     forma útil; el grant a anon del 170000 original era vestigial (respondía a
--     un supuesto de "barridos anónimos" ya cerrado por otra migración).
--   · DEDUP antes del índice único: 170000 asumía "la tabla está vacía". Ya NO
--     se puede asumir eso — `gc_write` ha seguido abierta en producción desde
--     que se escribió 170000 (ver Adenda 140), así que pudieron escribirse filas
--     con (scope, scope_ref) duplicados entre tanto. Sin deduplicar, `CREATE
--     UNIQUE INDEX` fallaría (23505) y abortaría la migración.
--   · `revoke execute … from public` explícito antes de conceder a
--     `gov_apply_approved_config` y `gov_author_is_entity_member` (hallazgo de
--     la verificación funcional de esta v2, ver informe): Postgres concede
--     EXECUTE a PUBLIC por defecto en todo `create function` nuevo — omitir
--     `anon` del GRANT NO basta por sí solo para excluirlo si el proyecto no
--     tiene ya revocado ese default. `gov_scope_owner` no lo necesita: se
--     concede a `authenticated, anon` a propósito (igual que 170000).
--
-- IDEMPOTENTE (drop-if-exists → create / create-or-replace) + REVERSIBLE (ver
-- *_rollback.sql). No borra datos salvo el dedup exacto descrito arriba (colapsa
-- duplicados exactos de (scope, scope_ref) a la fila más reciente). APLICAR en
-- nxstilnyidvkqeosofuh vía la Management API — este .sql es la fuente de verdad.
-- NO APLICADA POR ESTE AGENTE: sólo se redacta aquí para revisión adversarial
-- previa (residual conocido: el recuento de la propuesta sigue en el CLIENTE —
-- Adenda 140 §1/Residuo #1 — esta migración NO lo resuelve, sólo cierra el
-- secuestro CROSS-TENANT sobre `governance_configs`).
-- ════════════════════════════════════════════════════════════════════════════

alter table public.governance_configs enable row level security;

-- ── 0a) DEDUP defensivo antes del índice único ────────────────────────────────
-- Colapsa duplicados exactos de (scope, scope_ref) — tratando NULL como un valor
-- más, igual que hará el índice `nulls not distinct` — conservando la fila más
-- recientemente actualizada de cada grupo (empate: id mayor). No-op si no hay
-- duplicados (caso esperado hoy).
delete from public.governance_configs gc
using (
  select id,
         row_number() over (
           partition by scope, scope_ref
           order by updated_at desc nulls last, id desc
         ) as rn
  from public.governance_configs
) dupes
where gc.id = dupes.id
  and dupes.rn > 1;

-- ── 0b) Índice único (scope, scope_ref) — destino del UPSERT ─────────────────
create unique index if not exists governance_configs_scope_ref_key
  on public.governance_configs (scope, scope_ref) nulls not distinct;

-- ── 1) Cerrar el bypass permisivo ───────────────────────────────────────────
drop policy if exists gc_write on public.governance_configs;

-- ── 2) LECTURA pública ───────────────────────────────────────────────────────
drop policy if exists gc_read on public.governance_configs;
create policy gc_read
  on public.governance_configs for select
  to public
  using (true);

-- ── 2b) Dueño real del ÁMBITO (entidad) — CORREGIDO: casa por SLUG o por id ──
-- FIX respecto a 170000: la gobernanza se direcciona por SLUG (ver cabecera).
-- Casar sólo por `id::text` dejaba TODO grupo como "sin dueño" (NULL) y
-- neutralizaba tanto la verja anti-squatting original como la nueva verja de
-- legitimidad de abajo. Mismo patrón que `gov_is_entity_owner` (20260804180000,
-- Adenda 140, YA verificado en producción): `slug = ref OR id::text = ref`.
create or replace function public.gov_scope_owner(p_scope text, p_scope_ref text)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select case
    when p_scope = 'group' then (
      select g.owner_id from public.os_groups g
      where g.slug = p_scope_ref or g.id::text = p_scope_ref
      limit 1
    )
    when p_scope in ('page', 'community') then coalesce(
      (select p.owner_id from public.os_pages p
       where p.slug = p_scope_ref or p.id::text = p_scope_ref
       limit 1),
      (select g.owner_id from public.os_groups g
       where g.slug = p_scope_ref or g.id::text = p_scope_ref
       limit 1)
    )
    else null
  end;
$$;
grant execute on function public.gov_scope_owner(text, text) to authenticated, anon;

-- ── 2c) NUEVO — ¿el AUTOR (uuid explícito, no auth.uid()) pertenece a la
--       entidad (scope, scope_ref) como miembro real o dueño? ────────────────
-- SECURITY DEFINER + STABLE, mismo patrón que gov_scope_owner/gov_is_entity_owner
-- (lee os_* sin recursión de RLS). Capas comprobadas, en orden:
--   1. dueño real de la entidad (gov_scope_owner, ya corregido arriba);
--   2. censo PRINCIPAL os_memberships.group_slug (fuente real de membresía,
--      genérica por slug para cualquier tipo de entidad — ver
--      src/lib/governance/membership.ts);
--   3. si `p_scope_ref` llegó como id/uuid en vez de slug, se resuelve el slug
--      vía os_groups/os_pages y se reintenta el censo principal;
--   4. censo HISTÓRICO group_members / page_members (mismo fallback aditivo que
--      engine.ts::resolveVoterIds; nunca sustituye al principal, sólo suma).
-- Devuelve FALSE ante cualquier entrada nula/vacía (fail-closed).
create or replace function public.gov_author_is_entity_member(
  p_scope     text,
  p_scope_ref text,
  p_author    uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_owner uuid;
  v_slug  text;
begin
  if p_author is null or p_scope_ref is null or p_scope_ref = '' then
    return false;
  end if;

  v_owner := public.gov_scope_owner(p_scope, p_scope_ref);
  if v_owner is not null and v_owner = p_author then
    return true;
  end if;

  if exists (
    select 1 from public.os_memberships m
    where m.group_slug = p_scope_ref and m.user_id = p_author
  ) then
    return true;
  end if;

  select coalesce(
    (select g.slug  from public.os_groups g  where g.id::text = p_scope_ref),
    (select pg.slug from public.os_pages  pg where pg.id::text = p_scope_ref)
  ) into v_slug;
  if v_slug is not null and exists (
    select 1 from public.os_memberships m
    where m.group_slug = v_slug and m.user_id = p_author
  ) then
    return true;
  end if;

  -- group_members.group_id ya es TEXT (verificado en 20260804180000: se pasa
  -- `new.group_id` directo, sin cast, a gov_is_entity_owner(text)).
  if p_scope = 'group' and exists (
    select 1 from public.group_members gm
    where gm.group_id = p_scope_ref and gm.member = p_author
  ) then
    return true;
  end if;

  -- page_members.page_id es UUID (verificado: `new.page_id::text` en la misma
  -- migración) → cast a texto, nunca falla si p_scope_ref no es uuid (sólo no casa).
  if p_scope in ('page', 'community') and exists (
    select 1
    from public.page_members pm
    join public.profiles pr on pr.id = pm.profile_id
    where pm.page_id::text = p_scope_ref and pr.user_id = p_author
  ) then
    return true;
  end if;

  return false;
end;
$$;
-- REVOKE explícito de PUBLIC antes de conceder: Postgres concede EXECUTE a
-- PUBLIC por defecto en toda función nueva. Si el proyecto no tuviera ya
-- revocado ese default (`alter default privileges ... revoke execute on
-- functions from public`, práctica habitual de Supabase), confiar sólo en "no
-- conceder a anon" NO bastaría para excluirlo — heredaría acceso vía PUBLIC.
-- Verificado en sandbox: sin este REVOKE explícito, `anon` podía ejecutar la
-- función pese a no figurar en el GRANT. Con él, la exclusión es robusta pase
-- lo que pase con los defaults del proyecto.
revoke execute on function public.gov_author_is_entity_member(text, text, uuid) from public;
grant execute on function public.gov_author_is_entity_member(text, text, uuid) to authenticated;

-- ── 3) RUTA DIRECTA (dueño): RLS restrictiva de propiedad ────────────────────
drop policy if exists governance_configs_insert_own on public.governance_configs;
create policy governance_configs_insert_own
  on public.governance_configs for insert
  to authenticated
  with check (
    owner = auth.uid()
    and (
      public.gov_scope_owner(scope, scope_ref) is null
      or public.gov_scope_owner(scope, scope_ref) = auth.uid()
    )
  );

drop policy if exists governance_configs_update_own on public.governance_configs;
create policy governance_configs_update_own
  on public.governance_configs for update
  to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid());

-- ── 4) RUTA DEMOCRÁTICA: función SECURITY DEFINER (v2: + verja de legitimidad) ─
drop function if exists public.gov_apply_approved_config(uuid);

create function public.gov_apply_approved_config(p_proposal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prop_scope      text;
  v_prop_scope_ref  text;
  v_author          uuid;
  v_command         jsonb;
  v_status          text;
  v_type            text;
  v_payload         jsonb;
  v_scope           text;
  v_scope_ref       text;
  v_existing_mode   text;
  v_existing_params jsonb;
  v_existing_owner  uuid;
  v_base_params     jsonb;
  v_next_mode       text;
  v_next_params     jsonb;
  v_key             text;
  v_perm            text;
begin
  -- (a) Cargar la propuesta (fuente de verdad), INCLUIDO el autor real (columna
  --     `author`, sellada server-side por el trigger `proposals_guard` desde la
  --     Adenda 140 — no confiar en el cliente, pero aquí ya no hace falta: se lee
  --     de la fila persistida). No existe → fail-closed.
  select p.scope, p.scope_ref, p.command, p.status, p.author
    into v_prop_scope, v_prop_scope_ref, v_command, v_status, v_author
  from public.proposals p
  where p.id = p_proposal_id;
  if not found then
    raise exception 'gov_apply_approved_config: propuesta % no encontrada', p_proposal_id;
  end if;

  -- (b) EXIGIR decisión democrática alcanzada.
  if v_status is null or v_status not in ('passed', 'executed') then
    raise exception 'gov_apply_approved_config: propuesta % no aprobada (estado=%)',
      p_proposal_id, coalesce(v_status, 'null');
  end if;

  -- (c) EXIGIR un tipo de comando que toque governance_configs.
  v_type := v_command ->> 'type';
  if v_type is null or v_type not in ('set_governance', 'set_config', 'set_permission') then
    raise exception 'gov_apply_approved_config: comando % no aplicable a governance_configs',
      coalesce(v_type, 'null');
  end if;
  v_payload := coalesce(v_command -> 'payload', '{}'::jsonb);

  -- (d) Derivar (scope, scope_ref) igual que el JS.
  v_scope := coalesce(nullif(v_payload ->> 'scope', ''), v_prop_scope);
  if v_scope is null or v_scope = '' then
    raise exception 'gov_apply_approved_config: falta ámbito (scope)';
  end if;

  if jsonb_exists(v_payload, 'scope_ref') and (jsonb_typeof(v_payload -> 'scope_ref') <> 'null') then
    v_scope_ref := v_payload ->> 'scope_ref';
  else
    v_scope_ref := v_prop_scope_ref;
  end if;

  -- (d2) NUEVO — VERJA DE LEGITIMIDAD (cierra el secuestro cross-tenant, hallazgo
  -- CRÍTICO de la revisión adversarial de la Adenda 128 sobre este mismo diseño):
  -- si el ámbito derivado mapea a una entidad con DUEÑO real (grupo/página/
  -- comunidad — gov_scope_owner devuelve algo != NULL), el AUTOR de la propuesta
  -- (no el invocador: Adenda 140 deja disparar la resolución a "cualquier
  -- miembro") debe ser miembro o dueño de ESA entidad. Ámbitos SIN entidad
  -- (personal/global) quedan exentos, igual que la verja anti-squatting de la
  -- ruta directa (§3). Fail-closed: RAISE aborta toda la función (nada se
  -- escribe) si no se cumple.
  if public.gov_scope_owner(v_scope, v_scope_ref) is not null
     and not public.gov_author_is_entity_member(v_scope, v_scope_ref, v_author)
  then
    raise exception
      'gov_apply_approved_config: el autor % de la propuesta % no es miembro del ámbito %/%',
      v_author, p_proposal_id, v_scope, coalesce(v_scope_ref, '(global)');
  end if;

  -- (e) Leer la fila actual por (scope, scope_ref) — clave del upsert.
  select gc.mode, gc.params, gc.owner
    into v_existing_mode, v_existing_params, v_existing_owner
  from public.governance_configs gc
  where gc.scope = v_scope
    and gc.scope_ref is not distinct from v_scope_ref
  limit 1
  for update;

  v_base_params := coalesce(v_existing_params, '{}'::jsonb);

  -- (f) Replicar la MUTACIÓN del closure JS correspondiente (mergeGovParams):
  if v_type = 'set_governance' then
    v_next_mode := coalesce(nullif(v_payload ->> 'mode', ''), v_existing_mode, 'democratic');
    v_next_params := v_base_params ||
      (case when jsonb_typeof(v_payload -> 'params') = 'object'
            then v_payload -> 'params'
            else '{}'::jsonb end);

  elsif v_type = 'set_config' then
    v_key := nullif(v_payload ->> 'key', '');
    if v_key is null then
      raise exception 'gov_apply_approved_config: set_config sin clave (key)';
    end if;
    v_next_mode := coalesce(v_existing_mode, 'democratic');
    v_next_params := v_base_params || jsonb_build_object(
      'config',
      (case when jsonb_typeof(v_base_params -> 'config') = 'object'
            then v_base_params -> 'config'
            else '{}'::jsonb end)
      || jsonb_build_object(v_key, coalesce(v_payload -> 'value', 'null'::jsonb))
    );

  else -- v_type = 'set_permission'
    v_perm := nullif(v_payload ->> 'permission', '');
    if v_perm is null then
      raise exception 'gov_apply_approved_config: set_permission sin permiso (permission)';
    end if;
    v_next_mode := coalesce(v_existing_mode, 'democratic');
    v_next_params := v_base_params || jsonb_build_object(
      'permissions',
      (case when jsonb_typeof(v_base_params -> 'permissions') = 'object'
            then v_base_params -> 'permissions'
            else '{}'::jsonb end)
      || jsonb_build_object(v_perm, coalesce(v_payload -> 'value', 'null'::jsonb))
    );
  end if;

  -- (g) Upsert por (scope, scope_ref). Preserva el owner existente.
  insert into public.governance_configs (scope, scope_ref, mode, params, owner, updated_at)
  values (v_scope, v_scope_ref, v_next_mode, v_next_params, v_existing_owner, now())
  on conflict (scope, scope_ref) do update
    set params = excluded.params,
        mode = excluded.mode,
        updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'scope', v_scope,
    'scope_ref', v_scope_ref,
    'mode', v_next_mode,
    'params', v_next_params
  );
end;
$$;

-- GRANT v2: SÓLO `authenticated` (se retira `anon` respecto a 170000 — ver
-- cabecera: `proposals` UPDATE ya es authenticated-only desde la Adenda 140, así
-- que anon nunca podía completar el flujo hasta aquí; el grant era vestigial).
-- REVOKE de PUBLIC primero — mismo motivo que en gov_author_is_entity_member:
-- Postgres concede EXECUTE a PUBLIC por defecto en cada `create function`, así
-- que omitir `anon` del GRANT no basta por sí solo para excluirlo si el
-- proyecto no revoca ya ese default. Verificado en sandbox (ver informe).
revoke execute on function public.gov_apply_approved_config(uuid) from public;
grant execute on function public.gov_apply_approved_config(uuid) to authenticated;

-- REVOKE EXPLÍCITO de `anon` (Supabase concede EXECUTE a anon EXPLÍCITAMENTE en cada
-- función nueva de `public` vía default privileges del proyecto, así que `revoke …
-- from public` NO lo excluye). Verificado contra la BD viva nxstilnyidvkqeosofuh
-- 2026-08-05: sin estas dos líneas, anon conservaba EXECUTE tras aplicar la migración.
revoke execute on function public.gov_apply_approved_config(uuid) from anon;
revoke execute on function public.gov_author_is_entity_member(text, text, uuid) from anon;
