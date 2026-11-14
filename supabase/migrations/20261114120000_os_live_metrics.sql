-- Ola 1114-1 · WebSocket vs SSE · 2026-11-14
-- Tabla para medir latencia percibida en tiempo real de notificaciones
-- Comparación WebSocket (Supabase Realtime) vs SSE (ntfy.sh)

create table if not exists public.os_live_metrics (
  id bigint generated always as identity primary key,
  t timestamptz not null default now(),
  tipo text not null check (tipo in ('latency', 'event_delay', 'notification')),
  canal text not null,        -- 'websocket' | 'sse' | 'http'
  origen text not null,       -- 'sendAuroraTurn' | 'aviso-mensajes' | etc.
  destino text,               -- opcional: conversación, chat, etc.
  latenciaMs integer not null,  -- tiempo de ida y vuelta en milisegundos
  datos jsonb null            -- datos adicionales del evento
);

create index if not exists os_live_metrics_t_idx on public.os_live_metrics (t desc);
create index if not exists os_live_metrics_tipo_canal_idx on public.os_live_metrics (tipo, canal);

alter table public.os_live_metrics enable row level security;
drop policy if exists os_live_metrics_insert_anon on public.os_live_metrics;
create policy os_live_metrics_insert_anon on public.os_live_metrics for insert to anon, authenticated
  with check (
    length(tipo) <= 30
    and length(canal) <= 20
    and length(origen) <= 60
    and latenciaMs >= 0
    and latenciaMs <= 60000
  );
drop policy if exists os_live_metrics_select_anon on public.os_live_metrics;
create policy os_live_metrics_select_anon on public.os_live_metrics for select to anon, authenticated using (true);

-- También una vista agregada para estadísticas rápidas
create or replace view public.vista_latencia_metrics as
select
  tipo,
  canal,
  count(*) as total_eventos,
  avg(latenciaMs) as latencia_promedio_ms,
  percentile_cont(0.5) within group (order by latenciaMs) as latencia_mediana_ms,
  max(latenciaMs) as latencia_maxima_ms,
  min(latenciaMs) as latencia_minima_ms,
  max(t) as ultimo_evento
from public.os_live_metrics
where t >= now() - interval '1 hour'
group by tipo, canal;