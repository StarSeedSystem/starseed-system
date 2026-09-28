-- ════════════════════════════════════════════════════════════════════════════
-- L2 · Documento y Presentación en vivo (2026-09-28) — historial de versiones
--
-- Los documentos y presentaciones colaborativos viven en `os_spaces` (kind 'dashboard' +
-- doc.app = 'documento' | 'presentacion'; ver src/lib/vivo/doc-colaborativo/espacios.ts), así
-- que NO necesitan tabla ni `kind` nuevos. Esta migración solo añade su HISTORIAL DE VERSIONES
-- (las 20 últimas fotos, restaurables), fuera del `doc`: si las fotos vivieran dentro del doc,
-- cada guardado (cada ~1 s mientras alguien escribe) reenviaría 20 copias del documento.
--
-- Permisos = los del espacio (funciones SECURITY DEFINER ya existentes de
-- 20260712090100_missing_core_tables_spaces.sql): leer si puedes leer el espacio, crear/borrar
-- si puedes editarlo. Una versión no se reescribe nunca (sin UPDATE). Poda automática a 20.
--
-- Mientras esto no esté aplicado, el cliente guarda el historial en el propio dispositivo y lo
-- dice en la interfaz (src/lib/vivo/doc-colaborativo/versiones.ts).
--
-- Idempotente: IF NOT EXISTS / CREATE OR REPLACE / DROP … IF EXISTS.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.os_doc_versiones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id      uuid NOT NULL REFERENCES public.os_spaces(id) ON DELETE CASCADE,
  autor         uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  autor_nombre  text CHECK (autor_nombre IS NULL OR char_length(autor_nombre) <= 80),
  motivo        text NOT NULL DEFAULT 'auto' CHECK (motivo IN ('auto', 'manual', 'restaurar')),
  resumen       text CHECK (resumen IS NULL OR char_length(resumen) <= 160),
  contenido     jsonb NOT NULL,
  creada        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT os_doc_versiones_tamano CHECK (octet_length(contenido::text) <= 2000000)
);

-- El único filtro real del cliente: las de un espacio, de la más nueva a la más vieja.
CREATE INDEX IF NOT EXISTS os_doc_versiones_space_idx ON public.os_doc_versiones (space_id, creada DESC);

ALTER TABLE public.os_doc_versiones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dv_select ON public.os_doc_versiones;
CREATE POLICY dv_select ON public.os_doc_versiones
  FOR SELECT USING (public.space_can_read(space_id));

DROP POLICY IF EXISTS dv_insert ON public.os_doc_versiones;
CREATE POLICY dv_insert ON public.os_doc_versiones
  FOR INSERT WITH CHECK (autor = auth.uid() AND public.space_can_edit(space_id));

DROP POLICY IF EXISTS dv_delete ON public.os_doc_versiones;
CREATE POLICY dv_delete ON public.os_doc_versiones
  FOR DELETE USING (public.space_can_edit(space_id));

GRANT SELECT, INSERT, DELETE ON public.os_doc_versiones TO authenticated;
-- Un espacio público se puede leer sin cuenta (space_can_read lo decide); su historial también.
GRANT SELECT ON public.os_doc_versiones TO anon;

-- Poda: tras cada inserción, solo quedan las 20 más recientes de ese espacio.
CREATE OR REPLACE FUNCTION public.os_doc_versiones_podar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.os_doc_versiones v
   WHERE v.space_id = NEW.space_id
     AND v.id NOT IN (
       SELECT x.id FROM public.os_doc_versiones x
        WHERE x.space_id = NEW.space_id
        ORDER BY x.creada DESC, x.id DESC
        LIMIT 20
     );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS os_doc_versiones_podar_trg ON public.os_doc_versiones;
CREATE TRIGGER os_doc_versiones_podar_trg
  AFTER INSERT ON public.os_doc_versiones
  FOR EACH ROW EXECUTE FUNCTION public.os_doc_versiones_podar();

-- El cliente pregunta «¿puedo editar este espacio?» por RPC (con respaldo si no está expuesta).
GRANT EXECUTE ON FUNCTION public.space_can_edit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.space_can_read(uuid) TO authenticated, anon;

-- Sin realtime a propósito: el historial se pide solo al abrir su panel (tráfico mínimo).
