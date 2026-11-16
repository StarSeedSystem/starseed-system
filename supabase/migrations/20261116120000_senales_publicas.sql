-- ════════════════════════════════════════════════════════════════════════════
-- MRA1f — Señales publicadas por sus dueños (os_senales_publicas).
-- NO APLICAR sin que la dirección lo ordene · reversa: 20261116120000_senales_publicas_rollback.sql · no toca datos existentes
-- ----------------------------------------------------------------------------
-- Nadie publicaba nada para las capas de toda la red: aquí cada dueño publica
-- lo SUYO, por su elección y en la capa que elija (publica / comunidad / privada).
-- PRIVACIDAD: la tabla NO tiene coordenadas. `zona` es una celda gruesa (≤ 5
-- caracteres, ~5 km) y `ficha` no admite claves de posición. La posición exacta
-- viaja solo entre neuronas de la misma cuenta (canal `pos:<uid>`).
-- Rol anon: nada. La capa privada solo la ve su dueño. Se lee solo lo medido
-- hace menos de 15 minutos (salvo lo propio).
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.os_senales_publicas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id       uuid NOT NULL REFERENCES auth.users(id),
  device_id      text NOT NULL,
  capa           text NOT NULL CHECK (capa IN ('publica', 'comunidad', 'privada')),
  comunidad      text NULL CHECK (comunidad IS NULL OR char_length(comunidad) BETWEEN 1 AND 120),
  medio          text NOT NULL CHECK (medio IN ('wifi','bluetooth','lora','celular','malla','internet','estacion','sdr')),
  banda          text NOT NULL,
  frecuencia_khz bigint NULL,
  ancho_khz      bigint NULL CHECK (ancho_khz IS NULL OR ancho_khz > 0),
  fuerza_dbm     int NULL,
  calidad        real NULL CHECK (calidad BETWEEN 0 AND 1),
  origen         text NOT NULL CHECK (origen IN ('medida', 'declarada', 'estimada')),
  zona           text NULL CHECK (zona IS NULL OR char_length(zona) <= 5),
  ficha          jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (pg_column_size(ficha) <= 2048),
  medido_en      timestamptz NOT NULL,
  publicada_en   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT os_senales_publicas_comunidad_chk
    CHECK (capa <> 'comunidad' OR comunidad IS NOT NULL),
  -- Ninguna posición escondida en la ficha (solo claves de primer nivel).
  CONSTRAINT os_senales_publicas_ficha_sin_posicion_chk
    CHECK (jsonb_typeof(ficha) = 'object'
           AND NOT (ficha ?| ARRAY['lat','lon','lng','latitude','longitude','position','pos','coords']::text[]))
);

CREATE UNIQUE INDEX IF NOT EXISTS os_senales_publicas_unica_idx
  ON public.os_senales_publicas (owner_id, device_id, medio, banda, COALESCE(frecuencia_khz, 0));

CREATE INDEX IF NOT EXISTS os_senales_publicas_medido_idx
  ON public.os_senales_publicas (capa, medido_en DESC);

ALTER TABLE public.os_senales_publicas ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.os_senales_publicas FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.os_senales_publicas TO authenticated;

-- Leer: lo propio; lo público y fresco; lo de una comunidad mía y fresco. La
-- membresía se mira con `os_is_group_member` (definer, excluye «pending»).
DROP POLICY IF EXISTS os_senales_publicas_select ON public.os_senales_publicas;
CREATE POLICY os_senales_publicas_select ON public.os_senales_publicas
  FOR SELECT TO authenticated USING (
    owner_id = auth.uid()
    OR (capa = 'publica' AND medido_en > now() - interval '15 minutes')
    OR (capa = 'comunidad' AND medido_en > now() - interval '15 minutes'
        AND public.os_is_group_member(comunidad))
  );

-- Escribir: solo el dueño; publicar en una comunidad exige ser miembro de ella.
DROP POLICY IF EXISTS os_senales_publicas_insert ON public.os_senales_publicas;
CREATE POLICY os_senales_publicas_insert ON public.os_senales_publicas
  FOR INSERT TO authenticated WITH CHECK (
    owner_id = auth.uid()
    AND (capa <> 'comunidad' OR public.os_is_group_member(comunidad))
  );

DROP POLICY IF EXISTS os_senales_publicas_update ON public.os_senales_publicas;
CREATE POLICY os_senales_publicas_update ON public.os_senales_publicas
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (
    owner_id = auth.uid()
    AND (capa <> 'comunidad' OR public.os_is_group_member(comunidad))
  );

DROP POLICY IF EXISTS os_senales_publicas_delete ON public.os_senales_publicas;
CREATE POLICY os_senales_publicas_delete ON public.os_senales_publicas
  FOR DELETE TO authenticated USING (owner_id = auth.uid());
