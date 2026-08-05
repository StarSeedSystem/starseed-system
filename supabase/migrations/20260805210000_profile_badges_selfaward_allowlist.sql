-- ════════════════════════════════════════════════════════════════════════════
-- Adenda 143 — `profile_badges`: BLOQUEA el auto-otorgamiento de insignias de
-- AUTORIDAD/MÉRITO mientras PERMITE el auto-otorgamiento de insignias de LOGRO
-- curadas (allowlist), y PRESERVA el aval entre pares intacto. Sustituye/
-- reemplaza a `20260805191500_profile_badges_anti_selfaward.sql` (bloqueo
-- CIEGO de TODO auto-otorgamiento) con un diseño PRINCIPIADO: esa migración
-- previa cerraba el vector pero, como efecto secundario aceptado en su propio
-- comentario, ROMPÍA el otorgamiento real de la insignia de examen legítima
-- (study.ts / group-education.ts) — "el INSERT en profile_badges fallará y el
-- badge NO se otorgará". Esta migración la sustituye por una que distingue
-- ambos casos en vez de bloquear en bloque.
--
-- ── HALLAZGO ORIGINAL (Adenda 125, 2026-08-01, ver claude/adenda-125-…) ──────
-- "[ALTA · PREREQUISITO documentado] Insignias auto-otorgables. awardBadge/
-- createExam/submitExamAttempt permiten al usuario auto-otorgarse insignias
-- (corrección de examen en cliente); la RLS de profile_badges no está en el
-- repo. No activar la meritocracia en ningún contexto hasta que la escritura
-- de profile_badges esté gobernada (admin/service-role o función SECURITY
-- DEFINER; corrección de exámenes server-side)."
--
-- ── EXPLOTABILIDAD (análisis de código, confirmado; no verificable en vivo
--    desde este entorno — sin acceso de lectura a nxstilnyidvkqeosofuh) ──────
-- Único call-site de escritura real: `awardBadge()` en src/lib/badges/badges.ts
-- (upsert sobre profile_badges; `awarded_by = getUid()` = la sesión actual).
-- `awardBadge` tiene EXACTAMENTE 3 llamadores en todo `src/`:
--   1) `endorseBadge()` (badges.ts) — PEER, exige `code` ∈ ENDORSABLE_BADGE_
--      CODES y rechaza `mine === targetProfileId` ANTES de llamar ⇒ ya
--      garantiza `awarded_by ≠ titular` en la app (esta migración lo blinda
--      también en BD).
--   2) `study.ts::submitExamAttempt` — SELF. `exam.badge_code` es un campo
--      LIBRE por fila de la tabla `exams`, fijado por el CREADOR del examen en
--      `createExam()` sin validar contra ningún catálogo, y la corrección es
--      100% EN CLIENTE (`submitExamAttempt` compara `answers[i] === q.answer`
--      contra `exam.questions`, que pone el propio creador). Antes de esta
--      adenda, un creador podía `createExam({..., badgeCode: "legislator"})`,
--      escribir sus propias preguntas/respuestas, "aprobarse" su propio examen
--      y auto-otorgarse CUALQUIER code del catálogo — un primitivo de
--      auto-otorgamiento arbitrario disfrazado de examen. ESTE ES EL HALLAZGO
--      CRÍTICO que cierra esta migración (y el fix en study.ts::createExam).
--   3) `group-education.ts::submitExamAttempt` — SELF, pero con
--      `EXAM_PASS_BADGE_CODE` HARDCODEADO en el bundle (no lo elige el creador
--      del examen de grupo) — antes de esta adenda valía "scholar" fijo. NO es
--      "arbitrario" (un atacante no puede hacer que otorgue "legislator"), pero
--      SÍ auto-otorgaba una insignia de MÉRITO/AUTORIDAD real: "scholar" ∈
--      ENDORSABLE_BADGE_CODES (avalable entre pares), la cuenta merit.ts para
--      el peso de voto ponderado en el área "educacion", y se muestra como
--      credencial junto al autor en el feed de gobernanza
--      (political-proposal-card.tsx). Aprobar CUALQUIER examen de grupo
--      (corrección en cliente) auto-adjudicaba esa credencial sin aval real —
--      cerrado en código (group-education.ts ahora usa "exam_passed", de
--      LOGRO) Y en BD (esta migración bloquea "scholar" auto-otorgado pase lo
--      que pase en el cliente).
--
-- ── ¿AUTO-OTORGARSE HOY COMPRA PESO DE VOTO? NO (confirmado, capa de LECTURA) ─
-- `src/lib/governance/merit.ts::loadMeritWeights` Y su espejo server-side
-- `public.gov_resolve_proposal` (migración 20260805190000) EXCLUYEN toda
-- insignia cuyo `awarded_by` sea nulo O IGUAL a la propia cuenta del titular —
-- da CERO mérito, sin importar qué badge_id sea (incluidos legislator/
-- mediator/scholar/verified). Ese filtro NO cambia con esta migración (sigue
-- siendo la defensa primaria del PESO DE VOTO) — lo que esta migración cierra
-- es un problema DISTINTO e independiente: INTEGRIDAD DE REPUTACIÓN/DISPLAY.
-- Sin ella, cualquiera puede auto-adjudicarse "verified", "legislator",
-- "mediator" o "scholar" visibles en su perfil público (badges-panel.tsx,
-- featured-badges-widget.tsx, badges-widget.tsx) y — el punto más sensible —
-- junto a sus PROPIAS propuestas en el feed de gobernanza
-- (political-proposal-card.tsx muestra hasta 3 insignias del autor junto a
-- cada propuesta), sin aval real de nadie. Es una señal de autoridad/confianza
-- que puede sesgar a otros votantes aunque no mueva el recuento — cerrar esto
-- en BD es defensa en profundidad real, no cosmética.
--
-- ── DISEÑO (PRINCIPIADO, no en bloque) ────────────────────────────────────────
-- Se separan dos guardias independientes sobre profile_badges:
--   (A) RLS (igual que 20260801160000, SIN el bloqueo ciego de 20260805191500):
--       INSERT/UPDATE sólo si `awarded_by = auth.uid()` — nadie puede forjar la
--       identidad de OTRO avalador. Esto por sí solo YA garantiza que
--       endorseBadge (avalador ≠ titular) sigue funcionando exactamente igual.
--   (B) Trigger `profile_badges_selfaward_guard` (BEFORE INSERT OR UPDATE,
--       SECURITY DEFINER, mismo patrón que `proposals_guard` /
--       `group_members_guard_role` de 20260804180000): resuelve el DUEÑO real
--       del `profile_id` (profiles.user_id) y el CODE real del `badge_id`
--       (badges.code). Si `awarded_by` ≠ dueño ⇒ es un AVAL DE TERCERO, se
--       permite siempre (mérito legítimo, sea cual sea el code). Si
--       `awarded_by` = dueño ⇒ es un AUTO-OTORGAMIENTO: sólo se permite si el
--       code está en la lista CURADA de insignias de LOGRO
--       (`badge_code_is_self_awardable`, espejo EXACTO de
--       SELF_AWARDABLE_BADGE_CODES en src/lib/badges/badges.ts). Si no se
--       puede resolver el dueño o el code (referencia huérfana) ⇒ falla
--       CERRADO (RAISE EXCEPTION), igual que el diseño NULL-seguro de la
--       migración previa.
--
-- CLASIFICACIÓN DE INSIGNIAS (catálogo sembrado documentado en badges.ts:
-- "verified, creator, legislator, mediator, scholar, builder"; "exam_passed"
-- es el code genérico de logro que ya usaba study.ts como default — NO
-- verificado contra la tabla `badges` en vivo desde este entorno, sin acceso
-- de lectura a nxstilnyidvkqeosofuh; VALIDAR en revisión si el catálogo real
-- difiere):
--   AUTORIDAD/MÉRITO (NUNCA auto-otorgable; = ENDORSABLE_BADGE_CODES):
--     · verified   — "Humano verificado" / identidad soberana verificada.
--     · legislator — impulsar legislación reconocida por la comunidad.
--     · mediator   — mediación de conflictos reconocida por la comunidad.
--     · scholar    — "Erudito/a", pericia reconocida (pondera voto en el
--                    área "educacion" si la meritocracia está activa).
--   LOGRO/PARTICIPACIÓN (auto-otorgable; = SELF_AWARDABLE_BADGE_CODES):
--     · creator     — publicar un recurso/creación en la Tienda.
--     · builder     — desplegar una app o un cerebro en la red.
--     · exam_passed — aprobar un examen propio o de grupo (study.ts /
--                     group-education.ts).
--   (creator/builder hoy no tienen ningún call-site que los otorgue — sólo
--    están documentados en BADGE_TRIGGERS, sin gancho activo — clasificarlos
--    como logro es forward-compatible y no abre superficie nueva: hoy nadie
--    los otorga, ni a sí mismo ni a terceros.)
--
-- Cualquier code DESCONOCIDO (no listado arriba) es tratado como NO
-- auto-otorgable por defecto (allowlist, no blocklist) — si el catálogo real
-- en producción tiene codes adicionales no documentados aquí, esta migración
-- los BLOQUEA para auto-otorgamiento hasta que se añadan explícitamente a
-- `badge_code_is_self_awardable` (fallo seguro, no silencioso: el intento de
-- auto-otorgamiento lanza una excepción clara).
--
-- ── RESIDUAL DECLARADO: NO ES RETROACTIVA ─────────────────────────────────────
-- Esta migración sólo gobierna INSERT/UPDATE FUTUROS. Si algún usuario real ya
-- explotó el vector de study.ts antes de este fix (producción tiene 0
-- propuestas/grupos, pero SÍ puede haber cuentas reales con insignias ya
-- otorgadas vía exámenes personales), la fila ya existente en `profile_badges`
-- NO se toca ni se borra aquí (borrar datos de usuario no es una decisión que
-- deba ir agazapada en una migración de endurecimiento). Recomendado como
-- seguimiento MANUAL antes o después de aplicar (sólo LECTURA, para decidir si
-- hace falta limpieza):
--
--   select pb.profile_id, pb.badge_id, b.code, pb.awarded_by, pb.awarded_at
--     from public.profile_badges pb
--     join public.profiles p on p.id = pb.profile_id
--     join public.badges b   on b.id = pb.badge_id
--    where pb.awarded_by = p.user_id                 -- auto-otorgada
--      and not public.badge_code_is_self_awardable(b.code); -- y de autoridad
--
-- (group-education.ts nunca pudo otorgar nada salvo "scholar" fijo — y la
-- producción declarada tiene 0 grupos — así que ese flujo probablemente nunca
-- se ejecutó; study.ts no depende de grupos y si se usó, es la vía a auditar.)
--
-- IDEMPOTENTE (create or replace / drop-create) + REVERSIBLE (ver
-- *_rollback.sql). No borra datos ni cambia SELECT (sigue público). APLICAR en
-- nxstilnyidvkqeosofuh vía la Management API — este .sql es la fuente de
-- verdad. NO APLICADA POR ESTE AGENTE: sólo se redacta aquí para revisión
-- adversarial previa.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Helper: ¿es `p_code` una insignia de LOGRO auto-otorgable? ───────────────
-- Lista CURADA, cerrada (allowlist) — ESPEJO EXACTO de SELF_AWARDABLE_BADGE_
-- CODES en src/lib/badges/badges.ts. No toca ninguna tabla (comparación pura
-- contra un array literal); se expone también a authenticated/anon por si una
-- herramienta admin o un test quiere consultarla directamente.
create or replace function public.badge_code_is_self_awardable(p_code text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select p_code is not null and p_code = any (array[
    'creator',
    'builder',
    'exam_passed'
  ]);
$$;
grant execute on function public.badge_code_is_self_awardable(text) to authenticated, anon;

-- ── Trigger: bloquea auto-otorgamiento salvo insignias de LOGRO ──────────────
-- Mismo patrón que proposals_guard/group_members_guard_role (Adenda 140,
-- migración 20260804180000): BEFORE INSERT OR UPDATE, SECURITY DEFINER (lee
-- profiles/badges sin depender de la RLS del llamador), search_path fijo,
-- service_role bypassea (concesiones del sistema con awarded_by nulo/propio —
-- vía admin, sin pasar por el cliente, siguen posibles).
create or replace function public.profile_badges_selfaward_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;  -- profiles.user_id del TITULAR del perfil que recibe la insignia.
  v_code  text;  -- badges.code de la insignia referenciada por badge_id.
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  select p.user_id into v_owner from public.profiles p where p.id = new.profile_id;
  select b.code    into v_code  from public.badges   b where b.id = new.badge_id;

  -- Fail-closed: si `profile_id`/`badge_id` no resuelven (referencia huérfana),
  -- no podemos demostrar que es un aval legítimo de tercero NI que es un
  -- auto-otorgamiento de una insignia de logro permitida ⇒ bloquea.
  if v_owner is null or v_code is null then
    raise exception 'profile_badges_selfaward_guard: perfil o insignia no resoluble (profile_id=%, badge_id=%)', new.profile_id, new.badge_id;
  end if;

  -- AVAL DE TERCERO (awarded_by ≠ dueño del perfil): mérito legítimo, siempre
  -- permitido sea cual sea el code — endorseBadge ya restringe además el code a
  -- ENDORSABLE_BADGE_CODES en la app; aquí no hace falta repetir esa lista.
  if new.awarded_by is distinct from v_owner then
    return new;
  end if;

  -- AUTO-OTORGAMIENTO (awarded_by = dueño del perfil): sólo insignias de LOGRO
  -- curadas (nunca autoridad/mérito: legislator/mediator/scholar/verified).
  if public.badge_code_is_self_awardable(v_code) then
    return new;
  end if;

  raise exception 'profile_badges_selfaward_guard: la insignia "%" requiere aval de un tercero o concesión del sistema (no es auto-otorgable)', v_code;
end;
$$;

drop trigger if exists profile_badges_selfaward_guard_trg on public.profile_badges;
create trigger profile_badges_selfaward_guard_trg
  before insert or update on public.profile_badges
  for each row execute function public.profile_badges_selfaward_guard();

-- ── RLS: restaura la forma de 20260801160000 (SIN el bloqueo ciego de la
-- migración previa) — sólo "no puedes forjar la identidad de OTRO avalador".
-- El bloqueo de auto-otorgamiento de autoridad ahora vive en el trigger de
-- arriba, que SÍ distingue autoridad de logro. SELECT sigue pública sin cambios
-- (profile_badges_select de 20260801160000; no se toca aquí).
alter table public.profile_badges enable row level security;

drop policy if exists profile_badges_insert_self_awarder on public.profile_badges;
create policy profile_badges_insert_self_awarder
  on public.profile_badges for insert
  to authenticated
  with check (awarded_by = auth.uid());

drop policy if exists profile_badges_update_self_awarder on public.profile_badges;
create policy profile_badges_update_self_awarder
  on public.profile_badges for update
  to authenticated
  using (awarded_by = auth.uid())
  with check (awarded_by = auth.uid());
