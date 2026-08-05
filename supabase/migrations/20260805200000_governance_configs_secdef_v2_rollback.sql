-- ROLLBACK de 20260805200000_governance_configs_secdef_v2.sql.
-- Restaura el estado PREVIO exacto (el que sigue vivo hoy en producción, dado
-- que 20260801170000 nunca se aplicó): `gc_write` PERMISIVA abierta a cualquier
-- `authenticated` (FOR ALL) + `gc_read` estrecha (sólo `authenticated`), sin las
-- funciones ni el índice único de esta migración. Sólo para emergencia: revierte
-- a un estado conocido INSEGURO (gobernanza reescribible por cualquiera y sin
-- ruta democrática RPC). Aplicar vía Management API.

-- Ruta democrática (v2): quitar función + helper de legitimidad.
drop function if exists public.gov_apply_approved_config(uuid);
drop function if exists public.gov_author_is_entity_member(text, text, uuid);

-- Ruta directa (propiedad): quitar las políticas de dueño ANTES de tocar
-- gov_scope_owner — `governance_configs_insert_own` referencia esa función en
-- su WITH CHECK, así que dropear la función primero falla en caliente
-- ("cannot drop function … because other objects depend on it"; verificado en
-- sandbox). Las políticas deben caer primero.
drop policy if exists governance_configs_insert_own on public.governance_configs;
drop policy if exists governance_configs_update_own on public.governance_configs;

-- Ahora sí, sin dependientes.
drop function if exists public.gov_scope_owner(text, text);

-- Lectura: quitar la pública de esta migración y restaurar la estrecha original
-- (sólo `authenticated`, según documenta la cabecera del 170000 original).
drop policy if exists gc_read on public.governance_configs;
create policy gc_read
  on public.governance_configs for select
  to authenticated
  using (true);

-- Restaurar la política permisiva original (el agujero vivo previo a esta ola).
drop policy if exists gc_write on public.governance_configs;
create policy gc_write
  on public.governance_configs for all
  to public
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Índice único: quitarlo (no existía antes de esta migración).
drop index if exists public.governance_configs_scope_ref_key;
