-- Catálogo PÚBLICO de la Librería (src/lib/library/public-catalog.ts, architecture/libreria-biblioteca-sync.md §7).
-- Faltaba en el proyecto activo (comprobado el 2026-10-19 contra pg_tables): el comentario del código decía
-- «ya aplicada», pero no existía. Migración ADITIVA, autorizada por Alex el 2026-10-19.
-- RLS: lectura pública (también sin sesión); escribir, editar y borrar solo el autor (owner = auth.uid()).

create table if not exists public.library_public_items (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category text not null default 'otro' check (char_length(category) <= 40),
  folder text not null default '' check (char_length(folder) <= 300),
  name text not null check (char_length(name) between 1 and 200),
  kind text not null default 'file' check (char_length(kind) <= 40),
  payload jsonb not null default '{}'::jsonb check (pg_column_size(payload) <= 1048576),
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_library_public_items_categoria
  on public.library_public_items (category, folder, created_at desc);
create index if not exists idx_library_public_items_owner on public.library_public_items (owner);
create index if not exists idx_library_public_items_tags on public.library_public_items using gin (tags);

create or replace function public.library_public_items_tocar()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists library_public_items_tocar on public.library_public_items;
create trigger library_public_items_tocar before update on public.library_public_items
  for each row execute function public.library_public_items_tocar();

alter table public.library_public_items enable row level security;

drop policy if exists library_public_items_leer on public.library_public_items;
create policy library_public_items_leer on public.library_public_items for select using (true);

drop policy if exists library_public_items_crear on public.library_public_items;
create policy library_public_items_crear on public.library_public_items
  for insert to authenticated with check (owner = auth.uid());

drop policy if exists library_public_items_editar on public.library_public_items;
create policy library_public_items_editar on public.library_public_items
  for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());

drop policy if exists library_public_items_borrar on public.library_public_items;
create policy library_public_items_borrar on public.library_public_items
  for delete to authenticated using (owner = auth.uid());

grant select on public.library_public_items to anon, authenticated;
grant insert, update, delete on public.library_public_items to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.library_public_items;
exception when duplicate_object then null; when undefined_object then null;
end $$;
