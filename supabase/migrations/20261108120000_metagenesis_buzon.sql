-- ═══════════════════════════════════════════════════════════════════════════
-- MetaGenesis · buzón de avisos y parte diario (BZN1108A, 2026-11-08)
-- ───────────────────────────────────────────────────────────────────────────
-- QUÉ: tabla para que la sesión de Claude en la NUBE (sin llaves de nodo, ni
-- puerta A1, ni Telegram) deje avisos y el parte diario. El camino es:
--   Supabase → líder de dirección (IND1029B, lider_direccion.soy_lider())
--   → Hermes en el líder (IND1029G, hermes send) → Telegram.
--
-- ESCRIBE: solo el conector MCP de Claude nube (clave de servicio / postgres).
-- ENTREGA: BZN1108B (tarea aparte, corre en el líder). LEE el parte: BZN1108C.
--
-- SEGURIDAD
--   · RLS ACTIVADA, SIN políticas para anon ni authenticated.
--   · Solo service_role / postgres (la clave de servicio de la nube y los
--     nodos) pueden INSERT/UPDATE/SELECT. Nadie más ve ni toca la tabla.
--   · Lista blanca de destinos: solo 'telegram:Maggasukha' para avisos.
--   · Límites: 10 avisos/día por origen (de), 12k chars aviso, 40k chars parte.
--
-- Contrato: architecture/buzon-claude-nube-telegram.md
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.metagenesis_buzon (
  id              bigserial PRIMARY KEY,
  t               timestamptz NOT NULL DEFAULT now(),
  clase           text NOT NULL DEFAULT 'aviso'
                  CHECK (clase IN ('aviso', 'parte')),
  de              text NOT NULL,
  destino         text,
  asunto          text CHECK (char_length(asunto) <= 120),
  texto           text NOT NULL,
  estado          text NOT NULL DEFAULT 'pendiente'
                  CHECK (estado IN ('pendiente', 'entregado', 'fallo', 'archivado')),
  entregado_en    timestamptz,
  detalle         text,

  -- Reglas por clase
  CONSTRAINT buzon_aviso_destino CHECK (
    (clase = 'aviso' AND destino = 'telegram:Maggasukha' AND char_length(texto) <= 12000)
    OR (clase = 'parte' AND destino IS NULL AND estado = 'archivado' AND char_length(texto) <= 40000)
  )
);

-- Índice parcial para avisos pendientes (lo que entrega BZN1108B)
CREATE INDEX IF NOT EXISTS metagenesis_buzon_pendientes_idx
  ON public.metagenesis_buzon (clase, t) WHERE estado = 'pendiente';

-- Índice para leer el parte diario (lo que lee BZN1108C / Claude nube)
CREATE INDEX IF NOT EXISTS metagenesis_buzon_parte_idx
  ON public.metagenesis_buzon (clase, t DESC) WHERE clase = 'parte';

ALTER TABLE public.metagenesis_buzon ENABLE ROW LEVEL SECURITY;

-- SIN políticas para anon ni authenticated: solo service_role / postgres
REVOKE ALL ON public.metagenesis_buzon FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.metagenesis_buzon TO service_role;

-- Función de guardia: máximo 10 avisos/día por origen (de)
CREATE OR REPLACE FUNCTION public.metagenesis_buzon_guardia()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.clase = 'aviso' THEN
    IF (SELECT count(*) FROM public.metagenesis_buzon
        WHERE de = NEW.de AND clase = 'aviso' AND t > now() - interval '1 day') >= 10 THEN
      RAISE EXCEPTION 'demasiados avisos hoy para este origen' USING ERRCODE = '54000';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS metagenesis_buzon_guardia ON public.metagenesis_buzon;
CREATE TRIGGER metagenesis_buzon_guardia
  BEFORE INSERT ON public.metagenesis_buzon
  FOR EACH ROW EXECUTE FUNCTION public.metagenesis_buzon_guardia();

REVOKE ALL ON FUNCTION public.metagenesis_buzon_guardia() FROM PUBLIC, anon, authenticated;

-- Comprobación a mano (con clave de servicio / postgres):
-- INSERT INTO metagenesis_buzon (clase, de, destino, asunto, texto)
-- VALUES ('aviso', 'claude-sintesis-diaria', 'telegram:Maggasukha', 'Síntesis 07:54', '…');
-- SELECT * FROM metagenesis_buzon WHERE clase = 'parte' ORDER BY t DESC LIMIT 1;