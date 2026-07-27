-- ════════════════════════════════════════════════════════════════════════════
-- Adenda 98 — Federación de topologías de la Red Mesh entre neuronas (v2).
-- ----------------------------------------------------------------------------
-- Cada neurona (dispositivo) publica una INSTANTÁNEA COMPACTA de la malla LoRa
-- que ve (su nodo + vecinos online, campos mínimos). Otras neuronas de la MISMA
-- cuenta la leen para dibujar una topología federada — sin exponer la malla a
-- nadie más. Identidad soberana: RLS por `owner_id = auth.uid()` (una neurona
-- solo ve/escribe las topologías de su propia cuenta).
--
-- Degradación silenciosa: el cliente (mesh/federation.ts) captura cualquier
-- error, así que si esta migración aún no se aplicó, la malla local sigue
-- funcionando igual — la federación es una MEJORA, no un requisito.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.os_mesh_topology (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  -- Id ESTABLE del dispositivo/neurona que publica (no PII; generado en cliente).
  device_id    text not null,
  -- Nombre legible de la neurona (para la UI).
  device_label text,
  -- Instantánea compacta: { self:{num,name,snr}, nodes:[{num,name,snr,pres}], region }
  snapshot     jsonb not null default '{}'::jsonb,
  -- Nº de nodos online en el momento (para ordenar/mostrar sin parsear el jsonb).
  online_count int  not null default 0,
  updated_at   timestamptz not null default now()
);

-- Una fila por (cuenta, dispositivo): el upsert la mantiene fresca.
create unique index if not exists os_mesh_topology_owner_device_uidx
  on public.os_mesh_topology (owner_id, device_id);

create index if not exists os_mesh_topology_owner_updated_idx
  on public.os_mesh_topology (owner_id, updated_at desc);

alter table public.os_mesh_topology enable row level security;

-- RLS: cada usuario solo ve y gestiona las topologías de SU cuenta.
drop policy if exists os_mesh_topology_select_own on public.os_mesh_topology;
create policy os_mesh_topology_select_own
  on public.os_mesh_topology for select
  using (owner_id = auth.uid());

drop policy if exists os_mesh_topology_insert_own on public.os_mesh_topology;
create policy os_mesh_topology_insert_own
  on public.os_mesh_topology for insert
  with check (owner_id = auth.uid());

drop policy if exists os_mesh_topology_update_own on public.os_mesh_topology;
create policy os_mesh_topology_update_own
  on public.os_mesh_topology for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists os_mesh_topology_delete_own on public.os_mesh_topology;
create policy os_mesh_topology_delete_own
  on public.os_mesh_topology for delete
  using (owner_id = auth.uid());
