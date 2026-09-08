-- Ola 281 · E1 (2026-09-07): vínculos externos (tokens de acceso) por ámbito.
-- Solo se guarda el HASH sha256 del token (nunca el token en claro) y un
-- prefijo visible de 8 caracteres para que el usuario lo reconozca en la UI.
create table if not exists public.os_vinculos_externos (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users on delete cascade,
  ambito_tipo text not null check (ambito_tipo in (
    'cuenta','chat','personalidad','agente','cerebro','carpeta','memoria','perfil'
  )),
  ambito_id text not null default '',
  nombre text not null,
  prefijo text not null,
  token_hash text not null unique,
  permisos jsonb not null default '{"leer":true,"escribir":false,"hablar":false,"memoria":false,"herramientas":false}',
  expira_en timestamptz null,
  ultimo_uso timestamptz null,
  usos int not null default 0,
  creado_en timestamptz not null default now(),
  revocado_en timestamptz null,
  origen text not null default 'os'
);
create index if not exists os_vinculos_externos_owner_ambito_idx
  on public.os_vinculos_externos (owner, ambito_tipo, ambito_id);
alter table public.os_vinculos_externos enable row level security;
-- Cada usuario solo ve y toca sus propios vínculos.
drop policy if exists os_vinculos_externos_select on public.os_vinculos_externos;
create policy os_vinculos_externos_select on public.os_vinculos_externos
  for select to authenticated using (owner = auth.uid());
drop policy if exists os_vinculos_externos_insert on public.os_vinculos_externos;
create policy os_vinculos_externos_insert on public.os_vinculos_externos
  for insert to authenticated with check (owner = auth.uid());
drop policy if exists os_vinculos_externos_update on public.os_vinculos_externos;
create policy os_vinculos_externos_update on public.os_vinculos_externos
  for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists os_vinculos_externos_delete on public.os_vinculos_externos;
create policy os_vinculos_externos_delete on public.os_vinculos_externos
  for delete to authenticated using (owner = auth.uid());
