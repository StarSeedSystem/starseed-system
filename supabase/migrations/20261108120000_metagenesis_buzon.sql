-- ═══════════════════════════════════════════════════════════════════════════
-- Buzón de MetaGenesis · síntesis diaria sin la Mac (BZN1108A · 2026-11-08)
-- ───────────────────────────────────────────────────────────────────────────
-- QUÉ: tabla pública `metagenesis_buzon` donde la sesión de Claude de la NUBE
-- (solo llega a Supabase, Drive y web: sin llaves de nodo, ni de Telegram, ni
-- del A1) deja los avisos que deben llegar a Telegram y el parte diario que
-- alimenta a MetaGenesis con los medidores del día.
--
-- CONTRATO: architecture/buzon-claude-nube-telegram.md
--   · clase='aviso'   → destino fijo 'telegram:Maggasukha', texto ≤ 12 000;
--     lo entrega el líder de dirección con `hermes send` (BZN1108B).
--   · clase='parte'   → sin destino, estado 'archivado', texto ≤ 40 000;
--     lo lee Claude nube al día siguiente (BZN1108C).
--
-- SEGURIDAD: RLS activado y NINGUNA política: anon y authenticated no leen ni
-- escriben (RLS deniega por defecto). Solo service_role / postgres —el conector
-- MCP SQL de Claude nube y los nodos del líder— tocan la tabla. Jamás claves
-- aquí: solo nombres de variables de entorno.
--
-- Límites de uso (no de esquema): lista blanca de destinos y 10 avisos al día;
-- los aplica el entregador BZN1108B. Idempotente; no aplicada aún: la aplica
-- la publicación de siempre.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.metagenesis_buzon (
  id     bigserial primary key,
  t      timestamptz not null default now(),
  clase  text not null default 'aviso' check (clase in ('aviso','parte')),
  de     text not null,
  destino text,
  asunto text check (char_length(asunto) <= 120),
  texto  text not null,
  estado text not null default 'pendiente' check (estado in ('pendiente','entregado','fallo','archivado')),
  entregado_en timestamptz,
  detalle      text,  -- Una sola regla cruza clase, destino, destino-estado y tamaño del texto:
  CONSTRAINT metagenesis_buzon_regla_clase CHECK (
    (clase = 'aviso' AND destino = 'telegram:Maggasukha' AND char_length(texto) <= 12000)
    OR
    (clase = 'parte' AND destino IS NULL AND estado = 'archivado' AND char_length(texto) <= 40000)
  )
);

COMMENT ON TABLE public.metagenesis_buzon IS
  'Buzón que Claude nube escribe por SQL y el líder de dirección entrega (Telegram) y lee (parte diario).';

-- ─── RLS: la puerta cerrada ─────────────────────────────────────────────────
-- Sin políticas: ni anon ni authenticated pueden nada. Escriben solo el
-- service_role (conector de Claude nube) y postgres (nodos del líder).

ALTER TABLE public.metagenesis_buzon ENABLE ROW LEVEL SECURITY;

-- ─── índices ───────────────────────────────────────────────────────────────

-- Lo único que el entregador pregunta cada rato: qué hay pendiente, por clase.
CREATE INDEX IF NOT EXISTS metagenesis_buzon_pendientes_idx
  ON public.metagenesis_buzon (clase, estado)
  WHERE estado = 'pendiente';

-- El parte del día y el historial: lo más nuevo primero (lo lee Claude nube).
CREATE INDEX IF NOT EXISTS metagenesis_buzon_recientes_idx
  ON public.metagenesis_buzon (clase, t desc);
