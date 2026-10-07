-- Mando tablas aditivas 2026-10-08
-- Tablas mando_* con RLS habilitado, sin políticas, migración aditiva

create table if not exists public.mando_ambitos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('persona','entidad')),
  entidad_tipo text,
  entidad_ref text,
  perfil_id uuid,
  visibilidad text not null check (visibilidad in ('privado','miembros','publico')),
  modo_gobierno text not null check (modo_gobierno in ('jerarquico','democratico')),
  nombre text not null,
  creado_por uuid references auth.users(id) on delete set null default auth.uid(),
  freno boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.mando_motores (
  id uuid primary key default gen_random_uuid(),
  ambito_id uuid not null references public.mando_ambitos(id) on delete cascade,
  nombre text not null,
  tipo text not null check (tipo in ('local','nube-propia','servidor-propio')),
  token_hash text not null unique,
  huella text,
  capacidades text[] not null default '{}',
  estado text not null check (estado in ('vivo','dormido','frenado','revocado')),
  ultimo_reporte timestamptz,
  creado_por uuid
);

create table if not exists public.mando_enjambres (
  id uuid primary key default gen_random_uuid(),
  ambito_id uuid not null references public.mando_ambitos(id) on delete cascade,
  motor_id uuid not null references public.mando_motores(id) on delete cascade,
  nombre text not null,
  config jsonb not null,
  check (pg_column_size(config) <= 16384)
);

create table if not exists public.mando_tareas (
  ambito_id uuid not null references public.mando_ambitos(id) on delete cascade,
  tarea_id text not null,
  ola text,
  titulo text not null,
  depende text[] not null default '{}',
  archivos text[] not null default '{}',
  prompt text check (char_length(prompt) <= 20000),
  estado text,
  avance numeric,
  updated_at timestamptz not null default now(),
  primary key (ambito_id, tarea_id)
);

create table if not exists public.mando_eventos (
  id bigserial primary key,
  ambito_id uuid not null references public.mando_ambitos(id) on delete cascade,
  motor_id uuid references public.mando_motores(id) on delete set null,
  t timestamptz not null default now(),
  tipo text,
  tarea text,
  texto text check (char_length(texto) <= 4000)
);

create table if not exists public.mando_chat (
  id bigserial primary key,
  ambito_id uuid not null references public.mando_ambitos(id) on delete cascade,
  canal text check (char_length(canal) <= 40),
  autor text check (char_length(autor) <= 40),
  rol text,
  texto text check (char_length(texto) <= 4000),
  created_at timestamptz not null default now()
);

create table if not exists public.mando_medidores (
  ambito_id uuid not null references public.mando_ambitos(id) on delete cascade,
  motor_id uuid not null references public.mando_motores(id) on delete cascade,
  doc jsonb not null check (pg_column_size(doc) <= 32768),
  updated_at timestamptz not null default now(),
  primary key (ambito_id, motor_id)
);

create table if not exists public.mando_presupuesto (
  dia date not null,
  ambito_id uuid not null references public.mando_ambitos(id) on delete cascade,
  peticiones integer not null default 0,
  primary key (dia, ambito_id)
);

-- Índices
create index if not exists idx_mando_motores_ambito on public.mando_motores(ambito_id);
create index if not exists idx_mando_enjambres_ambito on public.mando_enjambres(ambito_id);
create index if not exists idx_mando_tareas_ambito on public.mando_tareas(ambito_id);
create index if not exists idx_mando_eventos_ambito_t on public.mando_eventos(ambito_id, t);
create index if not exists idx_mando_chat_ambito on public.mando_chat(ambito_id);
create index if not exists idx_mando_medidores_ambito on public.mando_medidores(ambito_id);
create index if not exists idx_mando_presupuesto_ambito on public.mando_presupuesto(ambito_id);

-- Habilitar RLS en todas
alter table public.mando_ambitos enable row level security;
alter table public.mando_motores enable row level security;
alter table public.mando_enjambres enable row level security;
alter table public.mando_tareas enable row level security;
alter table public.mando_eventos enable row level security;
alter table public.mando_chat enable row level security;
alter table public.mando_medidores enable row level security;
alter table public.mando_presupuesto enable row level security;

-- Disparador de tope de eventos
create or replace function public.mando_eventos_tope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.mando_eventos
  where ambito_id = new.ambito_id
    and id not in (
      select id from public.mando_eventos
      where ambito_id = new.ambito_id
      order by t desc, id desc
      limit 2000
    );
  return new;
end;
$$;

create or replace trigger mando_eventos_tope_trigger
after insert on public.mando_eventos
for each row
execute function public.mando_eventos_tope();
