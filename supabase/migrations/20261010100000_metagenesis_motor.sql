-- ═══════════════════════════════════════════════════════════════════════════
-- MetaGenesis · dónde está el motor (2026-10-10)
-- ───────────────────────────────────────────────────────────────────────────
-- El motor de MetaGenesis (enjambre, olas, publicación) vive en la Mac de Alex y
-- se sirve en localhost:9002. Para usarlo desde otra neurona (móvil, otro
-- ordenador), la Mac abre un túnel cifrado de Cloudflare y publica AQUÍ su URL y
-- un latido cada 60 s (scripts/puente/tunel_metagenesis.py, servicio launchd
-- com.starseed.tunel-metagenesis). La consola de /metagenesis la lee y manda sus
-- lecturas al motor con el token de la sesión (guardia-fetch, modo remoto).
--
--   · UNA sola fila (id = 1).
--   · La LEEN solo los miembros de MetaGenesis (es_metagenesis()). Nadie más
--     sabe ni que existe una URL: la URL del túnel nunca se imprime ni se
--     guarda en otro sitio.
--   · La ESCRIBE solo la clave de servicio (la Mac). Sin políticas de escritura.
--   · La URL tiene que ser https y sin ruta; el navegador además exige que sea
--     de *.trycloudflare.com antes de mandarle un token.
--
-- Contrato: architecture/genesis-niveles-malla-universal-estaciones.md §A.1
-- SOP:      architecture/metagenesis-remoto-tunel.md
-- Idempotente. Requiere 20261010090000_metagenesis_accesos.sql (es_metagenesis).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.metagenesis_motor (
  id             smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- URL pública del túnel (https://<algo>.trycloudflare.com), o NULL si está apagado.
  url            text CHECK (url IS NULL OR (char_length(url) <= 200 AND url ~ '^https://[a-z0-9-]+(\.[a-z0-9-]+)+$')),
  -- La Mac dice que el túnel está levantado y contesta.
  encendido      boolean NOT NULL DEFAULT false,
  -- Último momento en que la Mac comprobó, POR EL TÚNEL, que el motor contesta.
  ultimo_latido  timestamptz,
  -- Cuándo se levantó el túnel actual.
  arrancado_en   timestamptz,
  -- Nombre corto de la máquina (p. ej. «MacBook-de-Alex»), para el aviso.
  maquina        text CHECK (maquina IS NULL OR char_length(maquina) <= 64),
  -- Por qué está apagado o sin latido, en palabras («túnel caído, relanzando»…).
  motivo         text CHECK (motivo IS NULL OR char_length(motivo) <= 200),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.metagenesis_motor ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS metagenesis_motor_ver ON public.metagenesis_motor;
CREATE POLICY metagenesis_motor_ver ON public.metagenesis_motor
  FOR SELECT TO authenticated
  USING (public.es_metagenesis((SELECT auth.uid())));
-- Sin políticas de INSERT/UPDATE/DELETE: solo la clave de servicio (que salta la RLS) escribe.

REVOKE ALL ON public.metagenesis_motor FROM PUBLIC;
REVOKE ALL ON public.metagenesis_motor FROM anon;
REVOKE ALL ON public.metagenesis_motor FROM authenticated;
GRANT SELECT ON public.metagenesis_motor TO authenticated;
GRANT ALL ON public.metagenesis_motor TO service_role;

-- La fila única, apagada hasta que la Mac publique.
INSERT INTO public.metagenesis_motor (id, encendido, motivo)
VALUES (1, false, 'la Mac aún no ha publicado su túnel')
ON CONFLICT (id) DO NOTHING;

-- Comprobación a mano (como miembro ve 1 fila; como cualquier otra cuenta, 0):
-- SELECT encendido, ultimo_latido, maquina, motivo FROM public.metagenesis_motor;
