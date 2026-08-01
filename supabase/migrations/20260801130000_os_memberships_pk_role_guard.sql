-- ════════════════════════════════════════════════════════════════════════════
-- Adenda 124 (Supabase) — os_memberships: PK compuesto + guarda anti-escalada de rol.
-- ----------------------------------------------------------------------------
-- Detectado al aplicar los pendientes de Supabase (2026-08-01):
--   (a) El PK era `(user_id)` SOLO → una cuenta solo podía pertenecer a UNA entidad;
--       `onConflict:"user_id,group_slug"` (ensureCreatorMembership / setMembership) no
--       tenía constraint que casara → los ingresos fallaban y la tabla quedaba VACÍA,
--       dejando el censo de gobernanza (Adenda 124) sin datos reales.
--   (b) La política INSERT solo exigía `user_id = auth.uid()` SIN restringir `role`
--       → una cuenta podía auto-asignarse `admin` y, en modo jerárquico, `canActDirectly`
--       se saltaba la propuesta democrática (revisión adversarial Adenda 124 · #4).
--
-- Aplicado en producción vía Management API (la tabla estaba VACÍA → cambio de PK seguro,
-- sin FKs entrantes). Idempotente/repetible. Se registra aquí como fuente de verdad.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) PK correcto (user_id, group_slug): una cuenta puede pertenecer a MUCHAS entidades.
alter table public.os_memberships drop constraint os_memberships_pkey;
alter table public.os_memberships add constraint os_memberships_pkey primary key (user_id, group_slug);

-- 2) Política UPDATE (fila propia): habilita re-join / cambio de rol propio (antes no existía
--    política UPDATE, así que la parte UPDATE de los upsert quedaba bloqueada por RLS).
drop policy if exists os_memberships_upd on public.os_memberships;
create policy os_memberships_upd on public.os_memberships
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 3) Guarda anti-escalada de rol. service_role (gobernanza/servidor) y el PROPIETARIO real
--    de la entidad (os_groups/os_pages/os_events.owner_id) conservan roles privilegiados;
--    cualquier otra auto-asignación de rol privilegiado se DEGRADA a 'miembro' (no lanza →
--    nunca rompe el join). El único punto de control real es la BD (el cliente es burlable).
create or replace function public.os_memberships_guard_role()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  privileged constant text[] := array['admin','owner','moderator','mod','administrator','propietario','moderador','dueno','dueno'];
  is_owner boolean;
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  if new.role is null or not (lower(new.role) = any (privileged)) then
    return new;
  end if;
  select exists (
    select 1 from public.os_groups g where g.slug = new.group_slug and g.owner_id = auth.uid()
    union all select 1 from public.os_pages p where p.slug = new.group_slug and p.owner_id = auth.uid()
    union all select 1 from public.os_events e where e.slug = new.group_slug and e.owner_id = auth.uid()
  ) into is_owner;
  if is_owner then
    return new;
  end if;
  new.role := 'miembro';
  return new;
end;
$fn$;

drop trigger if exists os_memberships_guard_role_trg on public.os_memberships;
create trigger os_memberships_guard_role_trg
  before insert or update on public.os_memberships
  for each row execute function public.os_memberships_guard_role();
