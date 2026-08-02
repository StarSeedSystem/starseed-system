-- ════════════════════════════════════════════════════════════════════════════
-- Adenda 128 — FEED PÚBLICO: cursor keyset COMPUESTO (created_at, id).
-- ----------------------------------------------------------------------------
-- CIERRE DEL DoS DE DESCUBRIMIENTO (revisión adversarial Adenda 128).
--
-- El feed público (mesh/server-relay.ts · pullPublicFeed) paginaba por cursor de
-- `created_at` y el llamador (mesh/synaptic.ts) mantenía un watermark numérico del
-- mismo `created_at`. Si ≥FEED_PAGE (100) filas comparten el MISMO `created_at`
-- —un insert masivo en UNA transacción da un `now()` idéntico a todas—, el
-- watermark NO puede cruzar ese instante: la página se llena de filas del mismo
-- timestamp y el cursor se queda clavado en él. Resultado: PARÁLISIS del
-- descubrimiento de TODA la red (DoS; solo se autolimitaba ~24h por el floor TTL).
--
-- ARREGLO: cursor keyset COMPUESTO (created_at, id). Dentro de un empate de
-- `created_at`, el cursor AVANZA por `id` (la PK uuid, siempre única y ordenable),
-- así que la paginación siempre progresa aunque 10.000 filas compartan instante.
-- Se expone como RPC SQL con COMPARACIÓN DE FILA-VALOR NATIVA `(created_at, id) >
-- (p_at, p_id)` — robusto y testeable, y evita el frágil `.or()` compuesto del
-- cliente con timestamps entrecomillados (parsing ambiguo de zona/precisión).
--
-- ADITIVA e IDEMPOTENTE: `create index if not exists` + `create or replace
-- function`. No toca la tabla ni la RLS. Degradación silenciosa: si no se aplicó,
-- el cliente captura el error de la RPC inexistente y devuelve el feed vacío
-- preservando el cursor (la malla local sigue igual; el feed es una MEJORA).
-- ════════════════════════════════════════════════════════════════════════════

-- Índice keyset compuesto: cubre el filtro (channel, kind) + el orden y la
-- comparación de fila-valor por (created_at, id). Permite un index range scan
-- directo desde la frontera (p_at, p_id) sin ordenar ni filtrar en memoria.
create index if not exists os_mesh_relay_public_keyset_idx
  on public.os_mesh_relay (channel, kind, created_at, id);

-- ----------------------------------------------------------------------------
-- mesh_public_feed(p_at, p_id, p_limit) — una PÁGINA del feed público a partir
-- de la frontera keyset compuesta (p_at, p_id), EXCLUSIVA (estrictamente mayor).
--
-- SECURITY INVOKER (por defecto): la función corre con los permisos del LLAMADOR,
-- así que RESPETA la RLS de os_mesh_relay (select público = channel='public' para
-- cualquier neurona autenticada). NO es un bypass; solo encapsula la comparación
-- de fila-valor nativa y el orden estable.
--
-- La comparación `(created_at, id) > (p_at, p_id)` avanza por `id` DENTRO del
-- empate de `created_at` → cierra el DoS: aunque ≥p_limit filas compartan
-- created_at, cada página consume un tramo distinto de ids y el cursor progresa.
-- El primer sondeo del cliente pasa p_id = uuid cero para incluir todas las filas.
--
-- Floor `created_at >= now() - 24h` = TTL de relé (RELAY_TTL_MS): no sirve
-- histórico caducado. Límite acotado [1, 500] (default 100) para proteger al
-- servidor compartido de un p_limit patológico.
-- ----------------------------------------------------------------------------
create or replace function public.mesh_public_feed(
  p_at    timestamptz,
  p_id    uuid,
  p_limit int
)
returns table (
  id         uuid,
  cls        text,
  ptype      text,
  payload    jsonb,
  device_id  text,
  created_at timestamptz
)
language sql
stable
as $$
  select id, cls, ptype, payload, device_id, created_at
  from public.os_mesh_relay
  where channel = 'public' and kind = 'data'
    and (created_at, id) > (p_at, p_id)
    and created_at >= (now() - interval '24 hours')   -- floor TTL (RELAY_TTL_MS)
  order by created_at asc, id asc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

-- Ejecutable por neuronas autenticadas y anónimas; la RLS (SECURITY INVOKER)
-- sigue filtrando qué filas ve cada rol (los anónimos no leen os_mesh_relay).
grant execute on function public.mesh_public_feed(timestamptz, uuid, int) to authenticated, anon;
