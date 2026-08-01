-- ════════════════════════════════════════════════════════════════════════════
-- Adenda 125 — FACETA por GRUPO (dualidad Cuenta/Perfil, CLAUDE.md §6).
-- ----------------------------------------------------------------------------
-- Cada ciudadano elige QUÉ faceta pública (os_account_profiles) le representa
-- dentro de un grupo concreto. Es PURAMENTE DE PRESENTACIÓN:
--
--   · La MEMBRESÍA y el censo "una persona, un voto" siguen viviendo, sin cambio
--     alguno, en `os_memberships (user_id, group_slug)` — keyed POR CUENTA. Esta
--     tabla NUNCA alimenta el censo ni la votación: solo dice con qué CARA se
--     muestra el usuario. Borrar/crear una cara no afecta la pertenencia.
--   · El mapeo es (cuenta = auth.uid(), group_slug) → os_account_profiles.id.
--   · Es PÚBLICO por diseño (la cara elegida es visible para todos, igual que
--     las facetas públicas de os_account_profiles): SELECT abierto a `public`.
--
-- SIN clave foránea a os_account_profiles: se mantiene suelta a propósito para
-- evitar acoplamiento entre tablas (y no romper si un perfil se borra); el
-- `profile_id` se valida en el cliente (group-faces.ts resuelve vía getProfile()
-- y degrada al perfil por defecto si la cara ya no existe).
--
-- APLICAR con las migraciones del proyecto del OS (nxstilnyidvkqeosofuh). Es
-- idempotente y ADITIVA: crea su propia tabla, no toca censo/voto/gobernanza.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.os_membership_faces (
  user_id    uuid not null,
  group_slug text not null,
  profile_id uuid not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, group_slug)
);

-- Lectura por grupo del batch getGroupFaces() (.eq(group_slug).in(user_id,...)):
-- índice con group_slug a la cabeza (la PK, con user_id primero, no la sirve).
create index if not exists os_membership_faces_group_idx
  on public.os_membership_faces (group_slug, user_id);

alter table public.os_membership_faces enable row level security;

-- RLS · LECTURA: la cara elegida es PÚBLICA (presentación visible para todos).
drop policy if exists os_membership_faces_select on public.os_membership_faces;
create policy os_membership_faces_select
  on public.os_membership_faces for select
  to public
  using (true);

-- RLS · ESCRITURA: cada usuario solo inserta/edita/borra SU propia cara.
drop policy if exists os_membership_faces_insert_own on public.os_membership_faces;
create policy os_membership_faces_insert_own
  on public.os_membership_faces for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists os_membership_faces_update_own on public.os_membership_faces;
create policy os_membership_faces_update_own
  on public.os_membership_faces for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists os_membership_faces_delete_own on public.os_membership_faces;
create policy os_membership_faces_delete_own
  on public.os_membership_faces for delete
  to authenticated
  using (user_id = auth.uid());
