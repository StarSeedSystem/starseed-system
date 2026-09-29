-- Freno remoto del proyecto (contrato «consumo», 2026-09-29).
--
-- Una sola fila (id = 1) que el vigía diario de la Mac escribe con la clave de servicio cuando el
-- proyecto pasa su presupuesto del día, y apaga a las 00:00 UTC. Los navegadores solo la LEEN:
-- 1 GET al arrancar y cada 10 min, solo en la pestaña líder (src/lib/consumo/freno.ts).
--
-- Deliberadamente FUERA de la publicación supabase_realtime: cada cambio reenviado a cada suscriptor
-- también es tráfico de salida, que es justo lo que este freno protege.
--
-- Idempotente: se puede aplicar varias veces.

create table if not exists public.os_freno (
    id smallint primary key default 1,
    activo boolean not null default false,
    motivo text,
    hasta timestamptz,
    actualizado timestamptz not null default now(),
    constraint os_freno_una_fila check (id = 1),
    constraint os_freno_motivo_corto check (motivo is null or char_length(motivo) <= 280)
);

comment on table public.os_freno is
    'Freno remoto de consumo: fila única (id=1). La escribe el vigía diario con la clave de servicio; los clientes solo leen.';

-- Fila semilla, inactiva.
insert into public.os_freno (id, activo, motivo, hasta)
values (1, false, null, null)
on conflict (id) do nothing;

-- `actualizado` siempre refleja el último cambio.
create or replace function public.os_freno_tocar()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    new.actualizado := now();
    return new;
end;
$$;

drop trigger if exists os_freno_tocar on public.os_freno;
create trigger os_freno_tocar
    before update on public.os_freno
    for each row execute function public.os_freno_tocar();

-- Seguridad: lectura para todos, escritura solo para la clave de servicio (que salta RLS).
alter table public.os_freno enable row level security;

drop policy if exists os_freno_lectura on public.os_freno;
create policy os_freno_lectura on public.os_freno
    for select
    to anon, authenticated
    using (true);

revoke all on table public.os_freno from anon, authenticated;
grant select on table public.os_freno to anon, authenticated;

-- Por si alguna migración anterior la hubiera añadido a Realtime: fuera.
do $$
begin
    if exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'os_freno'
    ) then
        execute 'alter publication supabase_realtime drop table public.os_freno';
    end if;
end;
$$;
