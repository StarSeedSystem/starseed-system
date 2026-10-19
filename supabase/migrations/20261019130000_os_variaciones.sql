-- Autorizada por Alex el 2026-10-19; la aplica Claude tras revisarla.
-- Tablas para variaciones públicas en el clic derecho de absolutamente todo el OS.
-- RLS: lectura pública de lo publicado; escribir, editar y borrar solo el autor; valorar solo con sesión.

create table if not exists public.os_variaciones (
  id uuid primary key default gen_random_uuid(),
  clave text not null,
  familia text not null,
  tipo text not null check (tipo in ('variacion', 'nota', 'repo', 'fuente', 'adaptacion')),
  titulo text not null check (char_length(titulo) between 1 and 200),
  descripcion text,
  payload jsonb not null default '{}'::jsonb check (pg_column_size(payload) <= 262144), -- 256 KB
  version text,
  de_variacion uuid references public.os_variaciones(id),
  licencia text not null,
  enlace_externo text,
  etiquetas text[] not null default '{}',
  tema text,
  autor uuid not null references auth.users(id) on delete cascade,
  publicado_en timestamptz not null default now(),
  usos integer not null default 0,
  valoracion_media numeric(3,2) not null default 0.00,
  valoraciones integer not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists idx_os_variaciones_clave on public.os_variaciones (clave);
create index if not exists idx_os_variaciones_clave_publicado_en on public.os_variaciones (clave, publicado_en desc);

create table if not exists public.os_variaciones_valoraciones (
  variacion uuid not null references public.os_variaciones(id) on delete cascade,
  persona uuid not null references auth.users(id) on delete cascade,
  valor integer not null check (valor >= 1 and valor <= 5),
  primary key (variacion, persona)
);

create or replace function public.os_variaciones_tocar()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists os_variaciones_tocar on public.os_variaciones;
create trigger os_variaciones_tocar before update on public.os_variaciones
  for each row execute function public.os_variaciones_tocar();

alter table public.os_variaciones enable row level security;

-- Políticas de RLS para os_variaciones
drop policy if exists os_variaciones_leer on public.os_variaciones;
create policy os_variaciones_leer on public.os_variaciones for select using (publicado_en is not null);

drop policy if exists os_variaciones_crear on public.os_variaciones;
create policy os_variaciones_crear on public.os_variaciones
  for insert to authenticated with check (autor = auth.uid());

drop policy if exists os_variaciones_editar on public.os_variaciones;
create policy os_variaciones_editar on public.os_variaciones
  for update to authenticated using (autor = auth.uid()) with check (autor = auth.uid());

drop policy if exists os_variaciones_borrar on public.os_variaciones;
create policy os_variaciones_borrar on public.os_variaciones
  for delete to authenticated using (autor = auth.uid());

-- Políticas de RLS para os_variaciones_valoraciones
drop policy if exists os_variaciones_valoraciones_leer on public.os_variaciones_valoraciones;
create policy os_variaciones_valoraciones_leer on public.os_variaciones_valoraciones for select using (true);

drop policy if exists os_variaciones_valoraciones_crear on public.os_variaciones_valoraciones;
create policy os_variaciones_valoraciones_crear on public.os_variaciones_valoraciones
  for insert to authenticated with check (persona = auth.uid());

drop policy if exists os_variaciones_valoraciones_editar on public.os_variaciones_valoraciones;
create policy os_variaciones_valoraciones_editar on public.os_variaciones_valoraciones
  for update to authenticated using (persona = auth.uid()) with check (persona = auth.uid());

drop policy if exists os_variaciones_valoraciones_borrar on public.os_variaciones_valoraciones;
create policy os_variaciones_valoraciones_borrar on public.os_variaciones_valoraciones
  for delete to authenticated using (persona = auth.uid());

grant select on public.os_variaciones to anon, authenticated;
grant insert, update, delete on public.os_variaciones to authenticated;
grant select on public.os_variaciones_valoraciones to anon, authenticated;
grant insert, update, delete on public.os_variaciones_valoraciones to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.os_variaciones;
exception when duplicate_object then null; when undefined_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.os_variaciones_valoraciones;
exception when duplicate_object then null; when undefined_object then null;
end $$;