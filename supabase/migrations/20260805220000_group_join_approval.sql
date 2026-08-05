-- ════════════════════════════════════════════════════════════════════════════
-- Solicitud de ingreso a grupo + aprobación del propietario (RPC SECURITY
-- DEFINER) — cierra el hueco #3 del roadmap de grupos/comunidades:
-- "Onboarding con aprobación real (el 'Solicitar unirse' es cosmético;
-- setMembership inserta al instante; falta estado pending/approved)"
-- (claude/roadmap-mejoras-ui-diseno-ajustes-grupos-2026-08-01.md).
-- ----------------------------------------------------------------------------
-- MODELO ELEGIDO: una solicitud de ingreso es una fila `os_memberships`
-- NORMAL con `role = 'pending'`, auto-insertada por quien solicita (self-
-- insert de SU PROPIA fila). No se añade columna/tabla de estado nueva:
-- `os_memberships` ya tiene PK compuesto (user_id, group_slug) y ninguna
-- columna de estado (verificado por inspección de todas las lecturas/
-- escrituras del repo — src/lib/os-social.ts, src/lib/governance/
-- membership.ts — ninguna referencia una columna de estado o timestamp;
-- 'role' es el único campo mutable relevante). 'pending' no es un valor
-- privilegiado, así que encaja en el mismo campo sin tocar su forma.
--
-- ¿POR QUÉ EL SELF-INSERT DE 'pending' YA FUNCIONA SIN TOCAR RLS/TRIGGER?
-- El trigger `os_memberships_guard_role` (SECURITY DEFINER; aplicado ad-hoc
-- en producción el 2026-08-01 — Adenda 124 — y NO versionado como archivo
-- propio en este repo, según documenta claude/adenda-140-rls-gobernanza-
-- auditoria-viva-2026-08-05.md: "os_memberships YA estaba protegida por el
-- trigger os_memberships_guard_role") sólo DEGRADA un rol PRIVILEGIADO
-- (admin/owner/moderator/mod/administrator/propietario/moderador/dueño…) a
-- 'miembro' cuando quien escribe NO es el owner_id real de la entidad —
-- réplica exacta documentada en group_members_guard_role/page_members_guard_
-- role (20260804180000). 'pending' NO está en esa lista de roles
-- privilegiados, así que el trigger la deja pasar intacta. La política
-- INSERT/UPDATE de fila propia (`user_id = auth.uid()`, añadida junto al
-- trigger en la misma ola) ya cubre el self-insert. → NINGÚN cambio de RLS/
-- trigger hace falta para la parte "solicitar".
--
-- EL HUECO QUE SÍ CIERRA ESTA MIGRACIÓN: la RESOLUCIÓN por el DUEÑO.
-- La política UPDATE de `os_memberships` (misma ola del 2026-08-01) es de
-- FILA PROPIA — `user_id = auth.uid()` — igual que Adenda 140 replicó
-- explícitamente para group_members/page_members. Eso significa que el
-- DUEÑO del grupo NO puede, hoy, hacer UPDATE (aprobar) ni DELETE (rechazar)
-- la fila de OTRA persona: RLS lo bloquea (0 filas afectadas, sin excepción
-- ruidosa — el UPDATE/DELETE "no hace nada"). No se ha podido confirmar el
-- texto EXACTO de esa política contra la BD viva desde este entorno (el
-- conector Supabase MCP de esta sesión no tiene acceso al proyecto del OS,
-- nxstilnyidvkqeosofuh — sólo a otros 4 proyectos, todos INACTIVE); la
-- deducción se apoya en 3 fuentes independientes: (a) el enunciado de esta
-- tarea, (b) claude/adenda-124-gobernanza-a11y-resiliencia-2026-08-01.md
-- ("Política UPDATE de fila propia añadida"), (c) el propio patrón "self-
-- manage-own-row" que se repite en TODAS las tablas de membresía de este
-- repo (join/leave siempre son self; nunca hay un UPDATE/DELETE ajeno
-- directo documentado en ningún sitio). El diseño de abajo NO depende de
-- que esa deducción sea exacta para ser seguro: aunque la política UPDATE/
-- DELETE de fila propia no existiera tal cual, estas RPC siguen siendo
-- ESTRICTAMENTE MÁS ESTRECHAS que un UPDATE/DELETE libre (sólo tocan la fila
-- (p_user_id, p_group_slug) del grupo que el invocador realmente posee, y
-- sólo si su role ACTUAL es 'pending').
--
-- SOLUCIÓN: dos funciones SECURITY DEFINER, simétricas, AUTO-CONTENIDAS (no
-- dependen de `gov_is_entity_owner`, de 20260804180000/Adenda 140, para
-- poder revisarse y aplicarse de forma aislada — comprueban `os_groups.
-- owner_id` directamente):
--   1. Comprueban que auth.uid() = os_groups.owner_id del grupo (por slug).
--   2. Sólo tocan la fila (p_user_id, p_group_slug) si su role ACTUAL es
--      'pending' (nunca reescriben una fila ya aprobada ni expulsan a un
--      miembro pleno — "expulsar miembro" es otra funcionalidad, fuera de
--      alcance aquí).
--   3. approve_group_membership: UPDATE role → 'miembro' — mismo valor
--      literal que ya usa el join DIRECTO hoy (src/lib/os-social.ts
--      setMembership default role="miembro" / useMembership default), así
--      que un miembro aprobado es indistinguible de quien se unió directo a
--      un grupo abierto (mismo censo, mismo rol, misma UI).
--   4. reject_group_membership: DELETE de la fila — ética restaurativa, no
--      punitiva (CLAUDE.md §6): no queda marca ni bloqueo; la persona puede
--      volver a solicitar cuando quiera (nuevo self-insert 'pending').
--   5. auth.role() = 'service_role' bypasea la comprobación de propiedad
--      (barridos administrativos), igual que el resto de triggers/RPC de
--      gobernanza de este repo.
--   6. GRANT sólo a `authenticated`, con REVOKE explícito de `public` Y
--      `anon` (patrón verificado en 20260805200000_governance_configs_
--      secdef_v2.sql: Postgres concede EXECUTE a PUBLIC por defecto en todo
--      `create function` nuevo, y Supabase concede a `anon` explícitamente
--      además — omitir `anon` del GRANT no basta por sí solo para excluirlo).
--
-- CENSO/GOBERNANZA (voto, quórum, roster, permisos de gobernanza): el lado
-- cliente de esta ola (src/lib/governance/membership.ts) EXCLUYE
-- `role = 'pending'` de `membersFromMemberships`/`countMembersFromMemberships`/
-- `roleFromMemberships` — una solicitud sin resolver NUNCA cuenta como
-- miembro ni vota. Esto es código de aplicación, no esta migración; se
-- documenta aquí para que quede claro que "una persona, una voz" queda
-- intacto: 'pending' vive en la MISMA tabla pero está excluido de las
-- lecturas de censo por rol, no por RLS (la RLS de SELECT sobre
-- os_memberships es amplia/pública, igual que el resto del censo — un
-- visitante ya puede leer QUIÉN es miembro de un grupo hoy; leer quién tiene
-- una solicitud pendiente tiene la misma exposición que leer el roster
-- completo, no una nueva).
--
-- IDEMPOTENTE (drop function if exists → create) + REVERSIBLE (ver
-- *_rollback.sql). No toca RLS/triggers existentes de os_memberships (no
-- hace falta: el self-insert de 'pending' ya funciona con la RLS actual).
-- No borra datos. APLICAR en `nxstilnyidvkqeosofuh` vía la Management API
-- — este .sql es la fuente de verdad. NO APLICADA POR ESTE AGENTE (a la
-- espera de revisión, según se pidió).
--
-- VERIFICACIÓN PREVIA RECOMENDADA (ejecutar antes de aplicar, y repetir
-- después para confirmar que las RPC quedaron como se espera):
--   -- ¿Hay algún CHECK constraint sobre os_memberships.role que pudiera
--   -- rechazar 'pending'? El código YA usa literales muy dispares —
--   -- 'miembro','admin','owner','moderator','propietario','dueño',
--   -- 'fundador'…— repartidos entre os_memberships/group_members/
--   -- page_members, lo que sugiere fuertemente texto libre SIN CHECK, pero
--   -- no se ha podido confirmar en vivo desde este entorno (sin acceso al
--   -- proyecto nxstilnyidvkqeosofuh por MCP). Si el resultado NO es vacío,
--   -- avisar antes de que nadie pulse "Solicitar unirse":
--   select conname, pg_get_constraintdef(oid)
--     from pg_constraint
--    where conrelid = 'public.os_memberships'::regclass and contype = 'c';
--
--   -- Confirmar el texto EXACTO de las políticas RLS reales de
--   -- os_memberships (para contrastar con lo deducido arriba):
--   select polname, cmd, qual, with_check
--     from pg_policies where tablename = 'os_memberships';
--
--   -- Confirmar que las dos RPC quedaron SOLO para `authenticated` (ni
--   -- `anon` ni `public` deberían poder ejecutarlas):
--   select p.proname,
--          has_function_privilege('anon', p.oid, 'execute') as anon_exec,
--          has_function_privilege('authenticated', p.oid, 'execute') as auth_exec
--     from pg_proc p
--    where p.proname in ('approve_group_membership', 'reject_group_membership');
-- ════════════════════════════════════════════════════════════════════════════

-- ── approve_group_membership: pending → miembro (solo el dueño real) ─────────
drop function if exists public.approve_group_membership(text, uuid);

create function public.approve_group_membership(p_group_slug text, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_rows  int;
begin
  if p_group_slug is null or p_group_slug = '' or p_user_id is null then
    raise exception 'approve_group_membership: parámetros requeridos (p_group_slug, p_user_id)';
  end if;

  if auth.role() <> 'service_role' then
    select g.owner_id into v_owner from public.os_groups g where g.slug = p_group_slug;
    if v_owner is null then
      raise exception 'approve_group_membership: grupo % no encontrado', p_group_slug;
    end if;
    if v_owner <> auth.uid() then
      raise exception 'approve_group_membership: solo el propietario del grupo puede aprobar solicitudes';
    end if;
  end if;

  -- Sólo transiciona una solicitud REAL ('pending' → 'miembro'). Nunca
  -- reescribe una fila que ya tenga otro rol (miembro pleno, admin…): eso
  -- sería "cambiar el rol de alguien", una operación distinta y fuera de
  -- alcance de "aprobar una solicitud de ingreso".
  update public.os_memberships
     set role = 'miembro'
   where group_slug = p_group_slug
     and user_id = p_user_id
     and role = 'pending';
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    raise exception 'approve_group_membership: no hay solicitud pendiente de % en %', p_user_id, p_group_slug;
  end if;

  return jsonb_build_object('ok', true, 'group_slug', p_group_slug, 'user_id', p_user_id, 'role', 'miembro');
end;
$$;

-- REVOKE explícito de PUBLIC y de anon (ver cabecera): Postgres concede
-- EXECUTE a PUBLIC por defecto en toda función nueva, y Supabase concede a
-- `anon` explícitamente además — omitir `anon` del GRANT no basta por sí
-- solo para excluirlo (patrón verificado en 20260805200000).
revoke execute on function public.approve_group_membership(text, uuid) from public;
revoke execute on function public.approve_group_membership(text, uuid) from anon;
grant execute on function public.approve_group_membership(text, uuid) to authenticated;

-- ── reject_group_membership: borra la solicitud pendiente (solo el dueño) ────
drop function if exists public.reject_group_membership(text, uuid);

create function public.reject_group_membership(p_group_slug text, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_rows  int;
begin
  if p_group_slug is null or p_group_slug = '' or p_user_id is null then
    raise exception 'reject_group_membership: parámetros requeridos (p_group_slug, p_user_id)';
  end if;

  if auth.role() <> 'service_role' then
    select g.owner_id into v_owner from public.os_groups g where g.slug = p_group_slug;
    if v_owner is null then
      raise exception 'reject_group_membership: grupo % no encontrado', p_group_slug;
    end if;
    if v_owner <> auth.uid() then
      raise exception 'reject_group_membership: solo el propietario del grupo puede rechazar solicitudes';
    end if;
  end if;

  -- Sólo borra una solicitud REAL ('pending'). Nunca expulsa a un miembro
  -- pleno: eso es otra funcionalidad (fuera de alcance aquí).
  delete from public.os_memberships
   where group_slug = p_group_slug
     and user_id = p_user_id
     and role = 'pending';
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    raise exception 'reject_group_membership: no hay solicitud pendiente de % en %', p_user_id, p_group_slug;
  end if;

  return jsonb_build_object('ok', true, 'group_slug', p_group_slug, 'user_id', p_user_id);
end;
$$;

revoke execute on function public.reject_group_membership(text, uuid) from public;
revoke execute on function public.reject_group_membership(text, uuid) from anon;
grant execute on function public.reject_group_membership(text, uuid) to authenticated;
