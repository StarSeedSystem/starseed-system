-- ═════════════════════════════════════════════════════════════════════════════
-- Génesis abierto: conectores por ámbito (MCP, API, ganchos)
-- (2026-10-19). Escrita, sin aplicar: necesita la palabra de Alex.
-- ───────────────────────────────────────────────────────────────────────────
-- QUÉ: almacena la configuración de los conectores por ámbito para integrar
-- servicios externos como servidores MCP remotos, APIs y ganchos firmados.
-- Nunca se almacenan secretos o tokens en claro, solo sus huellas (hash).
-- ───────────────────────────────────────────────────────────────────────────

-- ── 1 · Tabla de conectores ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.genesis_conectores (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ambito_id       uuid NOT NULL, -- references ambitos table (to be defined elsewhere)
  tipo            text NOT NULL CHECK (tipo IN ('mcp', 'hook')),
  identificador   text NOT NULL CHECK (char_length(identificador) <= 100),
  configuracion   jsonb NOT NULL CHECK (pg_column_size(configuracion) <= 16384),
  huella          text NOT NULL CHECK (huella ~ '^[0-9a-f]{64}$'),
  activa          boolean NOT NULL DEFAULT true,
  creada_por      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_en  timestamptz NOT NULL DEFAULT now()
);

-- ── 2 · Índices ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS genesis_conectores_ambito_idx ON public.genesis_conectores (ambito_id);
CREATE INDEX IF NOT EXISTS genesis_conectores_tipo_idx ON public.genesis_conectores (tipo);
CREATE INDEX IF NOT EXISTS genesis_conectores_identificador_idx ON public.genesis_conectores (identificador);

-- ── 3 · Seguridad a nivel de fila (RLS) ─────────────────────────────────────
ALTER TABLE public.genesis_conectores ENABLE ROW LEVEL SECURITY;

-- Solo los miembros del ámbito pueden ver y modificar los conectores de su ámbito.
-- Se asume la existencia de una función `es_miembro_de_ambito(ambito_id, account_id)`
-- que devuelve true si la cuenta es miembro del ámbito.
-- Esta función debe ser definida en otra migración (por ejemplo, en mando_* tables).
-- Por ahora, usamos una condición básica: la cuenta que lo creó puede verlo y modificarlo.
-- Se actualizará cuando exista la función de pertenencia al ámbito.

DROP POLICY IF EXISTS genesis_conectores_ver ON public.genesis_conectores;
CREATE POLICY genesis_conectores_ver ON public.genesis_conectores
  FOR SELECT TO authenticated
  USING (creada_por = auth.uid()); -- Temporal: solo el creador puede ver

DROP POLICY IF EXISTS genesis_conectores_insertar ON public.genesis_conectores;
CREATE POLICY genesis_conectores_insertar ON public.genesis_conectores
  FOR INSERT TO authenticated
  WITH CHECK (creada_por = auth.uid());

DROP POLICY IF EXISTS genesis_conectores_actualizar ON public.genesis_conectores;
CREATE POLICY genesis_conectores_actualizar ON public.genesis_conectores
  FOR UPDATE TO authenticated
  USING (creada_por = auth.uid())
  WITH CHECK (creada_por = auth.uid());

DROP POLICY IF EXISTS genesis_conectores_borrar ON public.genesis_conectores;
CREATE POLICY genesis_conectores_borrar ON public.genesis_conectores
  FOR DELETE TO authenticated
  USING (creada_por = auth.uid());

-- ── 4 · Trigger de actualización de timestamp ───────────────────────────────
CREATE OR REPLACE FUNCTION public.genesis_conectores_actualizar_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.actualizado_en = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS genesis_conectores_actualizar ON public.genesis_conectores;
CREATE TRIGGER genesis_conectores_actualizar
BEFORE UPDATE ON public.genesis_conectores
FOR EACH ROW EXECUTE FUNCTION public.genesis_conectores_actualizar_timestamp();

-- ═════════════════════════════════════════════════════════════════════════════
-- NOTA: Esta migración es escrita pero no aplicada. Requiere la palabra de Alex.
-- ═════════════════════════════════════════════════════════════════════════════