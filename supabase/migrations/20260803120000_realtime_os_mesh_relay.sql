-- ════════════════════════════════════════════════════════════════════════════
-- Adenda 134 — REALTIME para `os_mesh_relay`: publicarla en `supabase_realtime`
-- + REPLICA IDENTITY FULL.
-- ----------------------------------------------------------------------------
-- SÍNTOMA: el relé/feed sináptico (src/ai/astraura/mesh/server-relay.ts ·
-- subscribeRelayRealtime, Adenda 105) abre un canal `postgres_changes` sobre
-- `public.os_mesh_relay` (evento INSERT) para entrega INSTANTÁNEA de contenido
-- público/relé cifrado y faros de descubrimiento, sin esperar el sondeo. Pero
-- Postgres solo emite `postgres_changes` para tablas que son MIEMBRO de la
-- publicación `supabase_realtime` — y `os_mesh_relay` nunca se añadió (no hay
-- ninguna migración previa en este repo que la incluya; ver también el chequeo
-- de diagnóstico `checkRealtimeTables()` en src/lib/sync/live-signal.ts, que
-- consulta el mismo catálogo `pg_publication_tables`). El canal se suscribe
-- igual (best-effort, nunca lanza) pero JAMÁS recibe eventos: la entrega
-- instantánea está SILENCIOSAMENTE inerte y TODO el tráfico del relé cae al
-- sondeo HTTP (RELAY_POLL_MS, cada 30–40s, en synaptic.ts). Funcional, pero
-- con decenas de segundos de latencia donde debería ser sub-segundo.
--
-- ARREGLO (dos pasos, ambos idempotentes):
--   1) `alter publication supabase_realtime add table public.os_mesh_relay`
--      — SOLO si todavía no es miembro (comprobado contra
--      `pg_publication_tables`, dentro de un `do $$ ... $$`). Sin esto,
--      Postgres no replica los cambios de la tabla al stream lógico que
--      alimenta `postgres_changes`, y repetir el ALTER a pelo en una
--      reejecución fallaría con "relation is already member of publication".
--   2) `replica identity full` — por defecto una tabla solo lleva la PK en el
--      payload de UPDATE/DELETE; con FULL, el evento lleva la fila COMPLETA
--      (antes/después), que es lo que necesitan los consumidores de
--      `postgres_changes` que leen `payload.new` (server-relay.ts). Sin
--      impacto en INSERT (siempre va completo). Coste: WAL algo mayor por fila
--      tocada en UPDATE/DELETE — aceptable en una tabla acotada por TTL
--      (RELAY_TTL_MS ≈ 24h, purgada en cada publish). Reemitir este ALTER en
--      una reejecución es inofensivo (fijar el mismo valor no tiene efecto).
--
-- ADITIVA, IDEMPOTENTE y sin downtime: no toca RLS, políticas, columnas,
-- índices ni datos de `os_mesh_relay`. APLICAR en el proyecto del OS
-- (nxstilnyidvkqeosofuh) vía la Management API. El .sql es la fuente de
-- verdad.
--
-- NOTA (fuera de alcance de esta migración): `os_mesh_topology` (federación de
-- topologías, 20260727120000_mesh_topology_federation.sql) TAMPOCO está en
-- `supabase_realtime`. Hoy no es un bug funcional del mismo tipo —
-- federation.ts no abre ningún canal `postgres_changes` sobre ella; se
-- sincroniza a propósito por push/pull en intervalo (45s push / 60s pull) —
-- pero sí sería una candidata razonable a entrega instantánea si en el futuro
-- se quiere reducir esa latencia. No se añade aquí sin confirmación explícita
-- (requeriría su propia migración, evaluando antes el coste de replicar esa
-- tabla en particular).
-- ════════════════════════════════════════════════════════════════════════════

-- Añade `os_mesh_relay` a la publicación de Realtime solo si todavía no es
-- miembro (evita el error "relation ... is already member of publication" en
-- reejecuciones de esta migración).
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'os_mesh_relay'
  ) then
    alter publication supabase_realtime add table public.os_mesh_relay;
  end if;
end
$$;

-- Los eventos UPDATE/DELETE llevan la fila COMPLETA (no solo la PK), para que
-- los suscriptores de `postgres_changes` (server-relay.ts) puedan leer
-- payload.new/old sin un round-trip adicional a la tabla.
alter table public.os_mesh_relay replica identity full;
