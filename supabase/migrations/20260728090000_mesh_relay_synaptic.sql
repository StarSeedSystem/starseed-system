-- ════════════════════════════════════════════════════════════════════════════
-- Adenda 99 — RED SINÁPTICA: relé por servidor + feed público + faros (beacons).
-- ----------------------------------------------------------------------------
-- El enrutador sináptico (mesh/synaptic-router.ts) decide, por transmisión, la
-- mejor vía. Cuando la vía es un SERVIDOR (no la malla LoRa directa), la carga
-- aterriza aquí:
--
--   · channel='public'  → CONTENIDO PÚBLICO: el servidor almacena y retransmite;
--     CUALQUIER neurona autenticada lo alcanza (lo público vive en la nube).
--   · channel='relay'   → PRIVADO + LEJANO: la malla no llega, así que la nube
--     hace de PUENTE CIFRADO (el `payload` va cifrado en cliente, `enc=true`);
--     RLS lo restringe a la propia cuenta soberana (owner_id = auth.uid()).
--   · kind='beacon'     → FARO de descubrimiento: una neurona anuncia que está
--     en línea (id opaco + región/preset + nº de vecinos), para que otras
--     neuronas dibujen el RADAR de conexiones cercanas. Sin PII; posición solo
--     con opt-in explícito de privacidad (igual que la federación de topología).
--
-- Honestidad radical: el servidor de relé SOLO TRANSPORTA — para 'relay' guarda
-- texto cifrado que no puede leer. Degradación silenciosa: si esta migración no
-- se aplicó aún, el cliente (mesh/server-relay.ts) captura el error y la malla
-- local sigue igual — el relé es una MEJORA, no un requisito.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.os_mesh_relay (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  -- 'public' = feed alcanzable por cualquier neurona autenticada.
  -- 'relay'  = puente cifrado privado, solo de la propia cuenta.
  channel       text not null default 'relay' check (channel in ('public', 'relay')),
  -- 'data' = una transmisión; 'beacon' = faro de presencia/descubrimiento.
  kind          text not null default 'data' check (kind in ('data', 'beacon')),
  -- Destinatario lógico de un relay (id de neurona/handle); null = a la cuenta.
  recipient     text,
  -- Clase de tráfico y tipo de payload StarSeed (para la UI y el enrutado).
  cls           text not null default 'P2',
  ptype         text not null default 'message',
  -- ¿El payload va cifrado en cliente? (siempre true para channel='relay').
  enc           boolean not null default false,
  -- Sobre: texto plano {..} para público, o {iv,ct} cifrado para relay/beacon.
  payload       jsonb not null default '{}'::jsonb,
  -- Id de ORIGEN estable (dedupe de reenvíos, igual que las alertas de la malla).
  oid           text,
  -- Neurona autora (id opaco de dispositivo; no PII) y etiqueta opt-in.
  device_id     text,
  label         text,
  -- Datos de antena del autor (para el radar): región LoRa y preset del módem.
  region        text,
  preset        text,
  -- Nº de vecinos online que veía el autor al emitir (radar).
  online_count  int not null default 0,
  created_at    timestamptz not null default now(),
  -- Caducidad para limpieza (faros y relays viejos dejan de mostrarse/entregarse).
  expires_at    timestamptz
);

-- Feed público + faros recientes: barrido por canal y recencia.
create index if not exists os_mesh_relay_channel_created_idx
  on public.os_mesh_relay (channel, created_at desc);

-- Sondas de relay de la propia cuenta (el receptor extrae lo dirigido a él).
create index if not exists os_mesh_relay_owner_channel_idx
  on public.os_mesh_relay (owner_id, channel, created_at desc);

-- Descubrimiento de faros: quién está en línea, del más reciente al más viejo.
create index if not exists os_mesh_relay_beacon_idx
  on public.os_mesh_relay (kind, created_at desc)
  where kind = 'beacon';

-- Limpieza por caducidad.
create index if not exists os_mesh_relay_expires_idx
  on public.os_mesh_relay (expires_at)
  where expires_at is not null;

alter table public.os_mesh_relay enable row level security;

-- RLS · LECTURA: lo PÚBLICO (feed + faros) lo lee cualquier neurona autenticada;
-- lo PRIVADO de relay, solo su propia cuenta soberana.
drop policy if exists os_mesh_relay_select on public.os_mesh_relay;
create policy os_mesh_relay_select
  on public.os_mesh_relay for select
  to authenticated
  using (channel = 'public' or owner_id = auth.uid());

-- RLS · ESCRITURA: cada neurona solo inserta/edita/borra filas de SU cuenta.
drop policy if exists os_mesh_relay_insert_own on public.os_mesh_relay;
create policy os_mesh_relay_insert_own
  on public.os_mesh_relay for insert
  to authenticated
  with check (owner_id = auth.uid());

drop policy if exists os_mesh_relay_update_own on public.os_mesh_relay;
create policy os_mesh_relay_update_own
  on public.os_mesh_relay for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists os_mesh_relay_delete_own on public.os_mesh_relay;
create policy os_mesh_relay_delete_own
  on public.os_mesh_relay for delete
  to authenticated
  using (owner_id = auth.uid());
