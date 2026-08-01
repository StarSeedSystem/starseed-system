-- ════════════════════════════════════════════════════════════════════════════
-- Adenda 127 — INTEGRIDAD del AVALADOR en `profile_badges` (mérito legítimo).
-- ----------------------------------------------------------------------------
-- El MÉRITO de gobernanza (src/lib/governance/merit.ts) SÓLO cuenta las insignias
-- conferidas por OTRA persona: `awarded_by` nulo o igual al propio titular = CERO
-- mérito. Para que ese cálculo sea confiable, la identidad de QUIÉN otorga no
-- puede FALSIFICARSE desde el cliente. Esta migración lo blinda con RLS:
--
--   · SELECT  → PÚBLICO (las insignias de un perfil son visibles para todos;
--               badgesForProfile() sigue leyendo sin cambios).
--   · INSERT  → sólo `authenticated`, y SÓLO puede insertar filas donde
--               `awarded_by = auth.uid()`: un usuario únicamente puede figurar
--               como avalador de SÍ MISMO. No puede fabricar un aval "de otro".
--   · UPDATE  → mismas condiciones (no puede reescribir `awarded_by` a un tercero).
--
-- Nota: los AUTO-OTORGAMIENTOS por examen siguen funcionando (awarded_by = uno
-- mismo = auth.uid(), pasa el WITH CHECK); el mérito ya los EXCLUYE en lectura.
-- Esto es defensa en profundidad: cierra el vector de forjar `awarded_by` de un
-- par para inflar mérito ajeno o propio de forma indetectable.
--
-- ADITIVA e IDEMPOTENTE (drop policy if exists → create). No borra datos ni toca
-- otras tablas. APLICAR en el proyecto del OS (nxstilnyidvkqeosofuh) vía la
-- Management API / migraciones del proyecto.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.profile_badges enable row level security;

-- Elimina la política permisiva ALL preexistente (`pb_write`, otorgada al crear la
-- tabla fuera de banda): las políticas RLS se COMBINAN CON OR, así que sin borrarla
-- las restrictivas de abajo NO tendrían efecto (bypass). Verificado y aplicado en el
-- proyecto del OS. (La lectura previa `pb_read` es equivalente a la de abajo.)
drop policy if exists pb_write on public.profile_badges;

-- RLS · LECTURA: las insignias de un perfil son PÚBLICAS (mérito verificable).
drop policy if exists profile_badges_select on public.profile_badges;
create policy profile_badges_select
  on public.profile_badges for select
  to public
  using (true);

-- RLS · INSERCIÓN: sólo puedes insertar filas donde TÚ eres el avalador
-- registrado (awarded_by = auth.uid()). Impide forjar la identidad del otorgante.
drop policy if exists profile_badges_insert_self_awarder on public.profile_badges;
create policy profile_badges_insert_self_awarder
  on public.profile_badges for insert
  to authenticated
  with check (awarded_by = auth.uid());

-- RLS · ACTUALIZACIÓN: idéntica salvaguarda — no se puede reescribir `awarded_by`
-- para atribuir un aval a un tercero (ni tocar filas avaladas por otro).
drop policy if exists profile_badges_update_self_awarder on public.profile_badges;
create policy profile_badges_update_self_awarder
  on public.profile_badges for update
  to authenticated
  using (awarded_by = auth.uid())
  with check (awarded_by = auth.uid());
