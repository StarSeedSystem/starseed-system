-- Ola 227 · aplicada el 2026-09-03 por MCP (onboarding_skipped_y_relevo_eventos)
alter table public.onboarding_state
  add column if not exists skipped boolean not null default false,
  add column if not exists skipped_at timestamptz null;
create table if not exists public.relevo_eventos (
  id bigint generated always as identity primary key,
  t timestamptz not null default now(),
  quien text not null, tipo text not null, tarea text null, texto text not null, datos jsonb null
);
create index if not exists relevo_eventos_t_idx on public.relevo_eventos (t desc);
alter table public.relevo_eventos enable row level security;
drop policy if exists relevo_eventos_insert_anon on public.relevo_eventos;
create policy relevo_eventos_insert_anon on public.relevo_eventos for insert to anon, authenticated with check (length(texto) <= 4000 and length(quien) <= 40 and length(tipo) <= 40);
drop policy if exists relevo_eventos_select_anon on public.relevo_eventos;
create policy relevo_eventos_select_anon on public.relevo_eventos for select to anon, authenticated using (true);
