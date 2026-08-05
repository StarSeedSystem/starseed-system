-- ROLLBACK de 20260805220000_group_join_approval.sql.
-- Quita las dos RPC de aprobación/rechazo de solicitudes de ingreso a grupo.
-- No borra datos: las filas `os_memberships` con role='pending' que ya
-- existan se quedan tal cual (sin las RPC, el propietario simplemente pierde
-- la vía server-side para resolverlas — vuelve al estado previo a esta
-- migración; el self-insert de 'pending' seguía funcionando ANTES de esta
-- migración y sigue funcionando después, porque no depende de ella). No toca
-- RLS ni triggers de os_memberships (esta migración tampoco los tocó).
-- Aplicar vía Management API.

drop function if exists public.approve_group_membership(text, uuid);
drop function if exists public.reject_group_membership(text, uuid);
