-- Rollback de 20260822120000_astraura_state.sql (Adenda 153).
-- NO borra la tabla ni sus datos (el backend 1.58 la usa en producción): solo
-- retira las políticas/índices añadidos y deja RLS como estaba antes (desactivada
-- NO se revierte automáticamente por seguridad; desactívala a mano si hiciera falta).
drop policy if exists astraura_state_select_own on public.astraura_state;
drop index if exists public.astraura_state_owner_idx;
drop index if exists public.astraura_state_updated_idx;
-- alter table public.astraura_state disable row level security; -- solo si se decide explícitamente
