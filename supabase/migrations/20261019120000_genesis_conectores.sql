-- Autorizada por Alex el 2026-10-19; la aplica Claude tras revisarla
-- Migración para las tablas de génesis conectores: bóveda, asignaciones, motores, tokens externos y llamadas
-- Tablas con RLS: lectura y escritura solo para miembros del ámbito con el permiso de src/lib/mando/permisos.ts
-- Nadie lee cifrado desde el cliente
-- Revisada por Claude el 2026-10-20 antes de aplicarla: «nadie lee cifrado desde el cliente» ahora es verdad
-- (el cliente no puede leer las columnas cifrado ni iv; las descifra solo el servidor), la bóveda y los
-- tokens no viajan por Realtime, y borrar una cuenta no choca con «creada_por»/«actualizado_por».

-- Tabla genesis_boveda: almacena credenciales cifradas por ámbito
create table if not exists public.genesis_boveda (
  id uuid primary key default gen_random_uuid(),
  ambito_id uuid not null references mando_ambitos(id) on delete cascade,
  proveedor text not null check (char_length(proveedor) <= 100),
  cifrado bytea not null,
  iv bytea not null,
  huella text not null check (char_length(huella) <= 255),
  creada_por uuid references auth.users(id) on delete set null,
  prestada_por uuid references auth.users(id) on delete set null,
  tope integer not null default 0 check (tope >= 0),
  caduca timestamptz,
  revocada_en timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Tabla genesis_asignaciones: almacena asignaciones de claves por ámbito
create table if not exists public.genesis_asignaciones (
  id uuid primary key default gen_random_uuid(),
  ambito_id uuid not null references mando_ambitos(id) on delete cascade,
  clave text not null check (char_length(clave) <= 100),
  cadena jsonb not null,
  actualizado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Tabla genesis_motores_registro: registro de motores emparejados por ámbito
create table if not exists public.genesis_motores_registro (
  id uuid primary key default gen_random_uuid(),
  ambito_id uuid not null references mando_ambitos(id) on delete cascade,
  motor_id text not null check (char_length(motor_id) <= 100),
  tipo text not null check (char_length(tipo) <= 50),
  huella_token text not null check (char_length(huella_token) <= 255),
  emparejado_en timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Tabla genesis_tokens_externos: almacena tokens externos por ámbito con alcance y límites
create table if not exists public.genesis_tokens_externos (
  id uuid primary key default gen_random_uuid(),
  ambito_id uuid not null references mando_ambitos(id) on delete cascade,
  huella text not null check (char_length(huella) <= 255),
  alcance text[] not null default '{}',
  caduca timestamptz,
  usos integer not null default 0 check (usos >= 0),
  revocado_en timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Tabla genesis_llamadas: registro de llamadas sin datos sensibles
create table if not exists public.genesis_llamadas (
  id uuid primary key default gen_random_uuid(),
  ambito_id uuid not null references mando_ambitos(id) on delete cascade,
  tipo text not null check (char_length(tipo) <= 50),
  endpoint text not null check (char_length(endpoint) <= 500),
  metodo text not null check (char_length(metodo) <= 20),
  status_code integer,
  respuesta_tiempo_ms integer,
  creado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Índices para mejorar el rendimiento de las consultas comunes
create index if not exists idx_genesis_boveda_ambito_id on public.genesis_boveda (ambito_id);
create index if not exists idx_genesis_boveda_proveedor on public.genesis_boveda (proveedor);
create index if not exists idx_genesis_boveda_huella on public.genesis_boveda (huella);
create index if not exists idx_genesis_boveda_creada_por on public.genesis_boveda (creada_por);
create index if not exists idx_genesis_boveda_prestada_por on public.genesis_boveda (prestada_por);
create index if not exists idx_genesis_boveda_caduca on public.genesis_boveda (caduca);

create index if not exists idx_genesis_asignaciones_ambito_id on public.genesis_asignaciones (ambito_id);
create index if not exists idx_genesis_asignaciones_clave on public.genesis_asignaciones (clave);
create index if not exists idx_genesis_asignaciones_actualizado_por on public.genesis_asignaciones (actualizado_por);

create index if not exists idx_genesis_motores_registro_ambito_id on public.genesis_motores_registro (ambito_id);
create index if not exists idx_genesis_motores_registro_motor_id on public.genesis_motores_registro (motor_id);
create index if not exists idx_genesis_motores_registro_tipo on public.genesis_motores_registro (tipo);
create index if not exists idx_genesis_motores_registro_huella_token on public.genesis_motores_registro (huella_token);
create index if not exists idx_genesis_motores_registro_emparejado_en on public.genesis_motores_registro (emparejado_en);

create index if not exists idx_genesis_tokens_externos_ambito_id on public.genesis_tokens_externos (ambito_id);
create index if not exists idx_genesis_tokens_externos_huella on public.genesis_tokens_externos (huella);
create index if not exists idx_genesis_tokens_externos_caduca on public.genesis_tokens_externos (caduca);
create index if not exists idx_genesis_tokens_externos_revocado_en on public.genesis_tokens_externos (revocado_en);
create index if not exists idx_genesis_tokens_externos_alcance on public.genesis_tokens_externos using gin (alcance);

create index if not exists idx_genesis_llamadas_ambito_id on public.genesis_llamadas (ambito_id);
create index if not exists idx_genesis_llamadas_tipo on public.genesis_llamadas (tipo);
create index if not exists idx_genesis_llamadas_endpoint on public.genesis_llamadas (endpoint);
create index if not exists idx_genesis_llamadas_metodo on public.genesis_llamadas (metodo);
create index if not exists idx_genesis_llamadas_creado_por on public.genesis_llamadas (creado_por);
create index if not exists idx_genesis_llamadas_created_at on public.genesis_llamadas (created_at desc);

-- Función para actualizar el timestamp updated_at antes de actualizar
create or replace function public.genesis_conectores_tocar()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Aplicar el trigger a todas las tablas que tienen updated_at
drop trigger if exists genesis_boveda_tocar on public.genesis_boveda;
create trigger genesis_boveda_tocar before update on public.genesis_boveda
  for each row execute function public.genesis_conectores_tocar();

drop trigger if exists genesis_asignaciones_tocar on public.genesis_asignaciones;
create trigger genesis_asignaciones_tocar before update on public.genesis_asignaciones
  for each row execute function public.genesis_conectores_tocar();

drop trigger if exists genesis_motores_registro_tocar on public.genesis_motores_registro;
create trigger genesis_motores_registro_tocar before update on public.genesis_motores_registro
  for each row execute function public.genesis_conectores_tocar();

drop trigger if exists genesis_tokens_externos_tocar on public.genesis_tokens_externos;
create trigger genesis_tokens_externos_tocar before update on public.genesis_tokens_externos
  for each row execute function public.genesis_conectores_tocar();

-- Habilitar RLS en todas las tablas
alter table public.genesis_boveda enable row level security;
alter table public.genesis_asignaciones enable row level security;
alter table public.genesis_motores_registro enable row level security;
alter table public.genesis_tokens_externos enable row level security;
alter table public.genesis_llamadas enable row level security;

-- Políticas RLS para genesis_boveda
drop policy if exists genesis_boveda_seleccionar on public.genesis_boveda;
create policy genesis_boveda_seleccionar on public.genesis_boveda
  for select
  to authenticated
  using (public.mando_capacidad(ambito_id, 'gestionar-accesos'));

drop policy if exists genesis_boveda_insertar on public.genesis_boveda;
create policy genesis_boveda_insertar on public.genesis_boveda
  for insert
  to authenticated
  with check (
    public.mando_capacidad(ambito_id, 'gestionar-accesos')
    and creada_por = auth.uid()
  );

drop policy if exists genesis_boveda_actualizar on public.genesis_boveda;
create policy genesis_boveda_actualizar on public.genesis_boveda
  for update
  to authenticated
  using (public.mando_capacidad(ambito_id, 'gestionar-accesos'))
  with check (public.mando_capacidad(ambito_id, 'gestionar-accesos'));

drop policy if exists genesis_boveda_eliminar on public.genesis_boveda;
create policy genesis_boveda_eliminar on public.genesis_boveda
  for delete
  to authenticated
  using (public.mando_capacidad(ambito_id, 'gestionar-accesos'));

-- Políticas RLS para genesis_asignaciones
drop policy if exists genesis_asignaciones_seleccionar on public.genesis_asignaciones;
create policy genesis_asignaciones_seleccionar on public.genesis_asignaciones
  for select
  to authenticated
  using (public.mando_capacidad(ambito_id, 'gestionar-accesos'));

drop policy if exists genesis_asignaciones_insertar on public.genesis_asignaciones;
create policy genesis_asignaciones_insertar on public.genesis_asignaciones
  for insert
  to authenticated
  with check (
    public.mando_capacidad(ambito_id, 'gestionar-accesos')
    and actualizado_por = auth.uid()
  );

drop policy if exists genesis_asignaciones_actualizar on public.genesis_asignaciones;
create policy genesis_asignaciones_actualizar on public.genesis_asignaciones
  for update
  to authenticated
  using (public.mando_capacidad(ambito_id, 'gestionar-accesos'))
  with check (public.mando_capacidad(ambito_id, 'gestionar-accesos'));

drop policy if exists genesis_asignaciones_eliminar on public.genesis_asignaciones;
create policy genesis_asignaciones_eliminar on public.genesis_asignaciones
  for delete
  to authenticated
  using (public.mando_capacidad(ambito_id, 'gestionar-accesos'));

-- Políticas RLS para genesis_motores_registro
drop policy if exists genesis_motores_registro_seleccionar on public.genesis_motores_registro;
create policy genesis_motores_registro_seleccionar on public.genesis_motores_registro
  for select
  to authenticated
  using (public.mando_capacidad(ambito_id, 'gestionar-motores'));

drop policy if exists genesis_motores_registro_insertar on public.genesis_motores_registro;
create policy genesis_motores_registro_insertar on public.genesis_motores_registro
  for insert
  to authenticated
  with check (
    public.mando_capacidad(ambito_id, 'gestionar-motores')
  );

drop policy if exists genesis_motores_registro_actualizar on public.genesis_motores_registro;
create policy genesis_motores_registro_actualizar on public.genesis_motores_registro
  for update
  to authenticated
  using (public.mando_capacidad(ambito_id, 'gestionar-motores'))
  with check (public.mando_capacidad(ambito_id, 'gestionar-motores'));

drop policy if exists genesis_motores_registro_eliminar on public.genesis_motores_registro;
create policy genesis_motores_registro_eliminar on public.genesis_motores_registro
  for delete
  to authenticated
  using (public.mando_capacidad(ambito_id, 'gestionar-motores'));

-- Políticas RLS para genesis_tokens_externos
drop policy if exists genesis_tokens_externos_seleccionar on public.genesis_tokens_externos;
create policy genesis_tokens_externos_seleccionar on public.genesis_tokens_externos
  for select
  to authenticated
  using (public.mando_capacidad(ambito_id, 'gestionar-accesos'));

drop policy if exists genesis_tokens_externos_insertar on public.genesis_tokens_externos;
create policy genesis_tokens_externos_insertar on public.genesis_tokens_externos
  for insert
  to authenticated
  with check (public.mando_capacidad(ambito_id, 'gestionar-accesos'));

drop policy if exists genesis_tokens_externos_actualizar on public.genesis_tokens_externos;
create policy genesis_tokens_externos_actualizar on public.genesis_tokens_externos
  for update
  to authenticated
  using (public.mando_capacidad(ambito_id, 'gestionar-accesos'))
  with check (public.mando_capacidad(ambito_id, 'gestionar-accesos'));

drop policy if exists genesis_tokens_externos_eliminar on public.genesis_tokens_externos;
create policy genesis_tokens_externos_eliminar on public.genesis_tokens_externos
  for delete
  to authenticated
  using (public.mando_capacidad(ambito_id, 'gestionar-accesos'));

-- Políticas RLS para genesis_llamadas
drop policy if exists genesis_llamadas_seleccionar on public.genesis_llamadas;
create policy genesis_llamadas_seleccionar on public.genesis_llamadas
  for select
  to authenticated
  using (public.mando_capacidad(ambito_id, 'ver-detalle'));

drop policy if exists genesis_llamadas_insertar on public.genesis_llamadas;
create policy genesis_llamadas_insertar on public.genesis_llamadas
  for insert
  to authenticated
  with check (
    public.mando_capacidad(ambito_id, 'chatear')
    and creado_por = auth.uid()
  );

drop policy if exists genesis_llamadas_actualizar on public.genesis_llamadas;
create policy genesis_llamadas_actualizar on public.genesis_llamadas
  for update
  to authenticated
  using (public.mando_capacidad(ambito_id, 'chatear'))
  with check (public.mando_capacidad(ambito_id, 'chatear'));

drop policy if exists genesis_llamadas_eliminar on public.genesis_llamadas;
create policy genesis_llamadas_eliminar on public.genesis_llamadas
  for delete
  to authenticated
  using (public.mando_capacidad(ambito_id, 'chatear'));

-- Conceder permisos apropiados
-- Sin las columnas cifrado ni iv: el cliente ve la huella, el proveedor y los topes, nunca el secreto.
revoke select on public.genesis_boveda from authenticated, anon;
grant select (id, ambito_id, proveedor, huella, creada_por, prestada_por, tope, caduca, revocada_en, created_at, updated_at)
  on public.genesis_boveda to authenticated;
grant insert, update, delete on public.genesis_boveda to authenticated;

grant select on public.genesis_asignaciones to authenticated;
grant insert, update, delete on public.genesis_asignaciones to authenticated;

grant select on public.genesis_motores_registro to authenticated;
grant insert, update, delete on public.genesis_motores_registro to authenticated;

grant select on public.genesis_tokens_externos to authenticated;
grant insert, update, delete on public.genesis_tokens_externos to authenticated;

grant select on public.genesis_llamadas to authenticated;
grant insert on public.genesis_llamadas to authenticated;

-- Añadir las tablas a la publicación de Supabase Realtime
do $$ begin
  alter publication supabase_realtime add table public.genesis_asignaciones;
exception when duplicate_object then null; when undefined_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.genesis_motores_registro;
exception when duplicate_object then null; when undefined_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.genesis_llamadas;
exception when duplicate_object then null; when undefined_object then null;
end $$;
