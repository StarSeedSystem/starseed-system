-- Autorizada por Alex el 2026-10-19; la aplica Claude tras revisarla.
-- Tablas para variaciones públicas en el clic derecho de absolutamente todo el OS.
-- RLS: lectura pública de lo publicado; escribir, editar y borrar solo el autor; valorar solo con sesión.
-- Revisada por Claude el 2026-10-20 antes de aplicarla: los contadores (usos, valoración media y número de
-- valoraciones) no los escribe el cliente —los calcula la base—, cada valoración solo la ve quien la hizo,
-- el enlace externo solo admite https y borrar una variación no rompe las que salieron de ella.

create table if not exists public.os_variaciones (
  id uuid primary key default gen_random_uuid(),
  clave text not null,
  familia text not null,
  tipo text not null check (tipo in ('variacion', 'nota', 'repo', 'fuente', 'adaptacion')),
  titulo text not null check (char_length(titulo) between 1 and 200),
  descripcion text,
  payload jsonb not null default '{}'::jsonb check (pg_column_size(payload) <= 262144), -- 256 KB
  version text,
  de_variacion uuid references public.os_variaciones(id) on delete set null,
  licencia text not null,
  enlace_externo text check (enlace_externo is null or enlace_externo ~* '^https://[^[:space:]]+$'),
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

-- Los contadores solo los cambia la propia base (recálculo de valoraciones o «usada»), nunca el cliente.
create or replace function public.os_variaciones_tocar()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('os_variaciones.recalculo', true), '') <> '1' then
    if tg_op = 'INSERT' then
      new.usos := 0; new.valoracion_media := 0.00; new.valoraciones := 0;
    else
      new.usos := old.usos; new.valoracion_media := old.valoracion_media; new.valoraciones := old.valoraciones;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists os_variaciones_tocar on public.os_variaciones;
create trigger os_variaciones_tocar before insert or update on public.os_variaciones
  for each row execute function public.os_variaciones_tocar();

-- Media y número de valoraciones, recalculados por la base en cada cambio.
create or replace function public.os_variaciones_recalcular()
returns trigger language plpgsql security definer set search_path = public as $$
declare v uuid := coalesce(new.variacion, old.variacion);
begin
  perform set_config('os_variaciones.recalculo', '1', true);
  update public.os_variaciones o set
    valoraciones = s.n, valoracion_media = coalesce(round(s.media, 2), 0.00)
  from (select count(*)::int as n, avg(valor)::numeric as media
        from public.os_variaciones_valoraciones where variacion = v) s
  where o.id = v;
  perform set_config('os_variaciones.recalculo', '', true);
  return null;
end;
$$;

drop trigger if exists os_variaciones_recalcular on public.os_variaciones_valoraciones;
create trigger os_variaciones_recalcular after insert or update or delete on public.os_variaciones_valoraciones
  for each row execute function public.os_variaciones_recalcular();

-- «La usé»: suma un uso con sesión (el cliente no puede escribir el contador).
create or replace function public.os_variacion_usada(p_variacion uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if auth.uid() is null then raise exception 'hace falta sesión'; end if;
  perform set_config('os_variaciones.recalculo', '1', true);
  update public.os_variaciones set usos = usos + 1 where id = p_variacion returning usos into n;
  perform set_config('os_variaciones.recalculo', '', true);
  return n;
end;
$$;
revoke all on function public.os_variacion_usada(uuid) from public, anon;
grant execute on function public.os_variacion_usada(uuid) to authenticated;
revoke all on function public.os_variaciones_recalcular() from public, anon, authenticated;

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

alter table public.os_variaciones_valoraciones enable row level security;

-- Políticas de RLS para os_variaciones_valoraciones (cada valoración solo la ve quien la hizo)
drop policy if exists os_variaciones_valoraciones_leer on public.os_variaciones_valoraciones;
create policy os_variaciones_valoraciones_leer on public.os_variaciones_valoraciones
  for select to authenticated using (persona = auth.uid());

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
grant select on public.os_variaciones_valoraciones to authenticated;
grant insert, update, delete on public.os_variaciones_valoraciones to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.os_variaciones;
exception when duplicate_object then null; when undefined_object then null;
end $$;
