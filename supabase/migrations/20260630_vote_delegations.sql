-- StarSeed · Ontocracia — Voto líquido delegado (delegación revocable, por tema,
-- con caducidad obligatoria). ADITIVO: no altera proposals / proposal_votes.
--
-- Cláusulas pétreas respetadas:
--   • "Una persona, una voz": una delegación NO crea votos nuevos; sólo transfiere
--     el peso de UNA persona a otra para UN tema. El voto directo del delegante
--     SIEMPRE reclama/anula la delegación en el recuento (sin doble conteo, sin
--     alienación permanente).
--   • Revocable: `revoked_at` desactiva la delegación al instante.
--   • Por tema: `topic` acota el alcance de la delegación (nunca es global-total
--     salvo que el tema lo sea explícitamente).
--   • Caducidad OBLIGATORIA: `expires_at` es NOT NULL — ninguna delegación es
--     perpetua.

create table if not exists public.vote_delegations (
  id             uuid primary key default gen_random_uuid(),
  delegator_user uuid not null references auth.users (id) on delete cascade,
  delegate_user  uuid not null references auth.users (id) on delete cascade,
  -- Tema de la delegación. Convención flexible: puede ser un ámbito
  -- ("group:<id>", "community:<id>", "global") o una etiqueta temática
  -- ("presupuesto", "cultura", …). Nunca nulo.
  topic          text not null,
  -- Contexto opcional (para delegaciones acotadas a un ámbito concreto).
  scope          text,
  scope_ref      text,
  created_at     timestamptz not null default now(),
  -- Caducidad OBLIGATORIA: ninguna delegación vive para siempre.
  expires_at     timestamptz not null,
  -- Revocación: si no es nula, la delegación está desactivada.
  revoked_at     timestamptz,
  -- Un delegante no puede delegarse a sí mismo (evita ciclos triviales).
  constraint vote_delegations_no_self check (delegator_user <> delegate_user),
  -- La caducidad debe ser posterior a la creación.
  constraint vote_delegations_expiry_future check (expires_at > created_at)
);

-- Índices para el recuento eficiente por tema y por delegante/delegado.
create index if not exists vote_delegations_topic_idx
  on public.vote_delegations (topic);
create index if not exists vote_delegations_delegate_idx
  on public.vote_delegations (delegate_user, topic);
create index if not exists vote_delegations_delegator_idx
  on public.vote_delegations (delegator_user, topic);
create index if not exists vote_delegations_active_idx
  on public.vote_delegations (topic, expires_at)
  where revoked_at is null;

-- Una sola delegación ACTIVA por (delegante, tema): re-delegar reemplaza.
-- (Las delegaciones revocadas conservan histórico y no colisionan.)
create unique index if not exists vote_delegations_one_active_per_topic
  on public.vote_delegations (delegator_user, topic)
  where revoked_at is null;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.vote_delegations enable row level security;

-- Transparencia del ejercicio del poder: las delegaciones activas son legibles
-- (el recuento delegado es público y auditable, como los votos).
drop policy if exists vote_delegations_select on public.vote_delegations;
create policy vote_delegations_select
  on public.vote_delegations for select
  using (true);

-- Sólo el propio delegante puede crear su delegación (una persona, su voz).
drop policy if exists vote_delegations_insert on public.vote_delegations;
create policy vote_delegations_insert
  on public.vote_delegations for insert
  with check (auth.uid() = delegator_user);

-- Sólo el delegante puede revocar/actualizar su propia delegación.
drop policy if exists vote_delegations_update on public.vote_delegations;
create policy vote_delegations_update
  on public.vote_delegations for update
  using (auth.uid() = delegator_user)
  with check (auth.uid() = delegator_user);

-- Sólo el delegante puede eliminar su propia delegación.
drop policy if exists vote_delegations_delete on public.vote_delegations;
create policy vote_delegations_delete
  on public.vote_delegations for delete
  using (auth.uid() = delegator_user);
