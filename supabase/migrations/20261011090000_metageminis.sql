-- ═══════════════════════════════════════════════════════════════════════════
-- MetaGeminis · agente social de MetaGenesis (2026-10-11) · SIN APLICAR
-- ───────────────────────────────────────────────────────────────────────────
-- Contrato: architecture/metageminis.md
-- Qué guarda: las ramas y los agentes, los hallazgos de la investigación, los BORRADORES con su estado
-- (para_aprobar → aprobado → enviado → respondido, o descartado), las PIEZAS de campaña del Estudio
-- (imagen, vídeo, animación 3D, anuncio, cartel, carrusel), los resultados por rama y agente, los
-- enlaces de pago que Alex confirma y las donaciones confirmadas por Stripe.
--
-- Reglas que la base hace cumplir aunque se equivoque un agente (triggers):
--   · Nada nace aprobado: un borrador o una pieza solo se INSERTA «para_aprobar» (o «descartado»).
--   · Solo un DUEÑO de MetaGenesis aprueba o descarta, con las RPC de abajo (queda quién y cuándo).
--   · Los borradores «manual_alex» los envía una persona: solo un dueño los marca enviados (metageminis_marcar_hecho).
--   · Nada pasa a «enviado» ni «publicado» sin haber estado «aprobado» con su aprobador.
--   · Lo aprobado no se puede cambiar: texto, canal, sitio, archivo y huella quedan congelados
--     (lo que Alex aprobó es exactamente lo que sale).
--   · Un enlace de pago solo se activa si Alex lo confirmó.
--   · No se guardan datos personales de quien dona: Stripe los conserva; aquí solo importe y estado.
--
-- Lectura: solo miembros de MetaGenesis (public.es_metagenesis(), migración 20261010091000).
-- Escritura: solo la clave de servicio (los agentes) y las RPC de decisión (dueños).
-- Requiere 20261010091000_metagenesis_accesos.sql. Idempotente.
-- Probada el 2026-10-10 en un Postgres 16 desechable (con roles y auth.uid() simulados): se aplica dos veces
-- sin error; la RLS impersonando, los triggers y las RPC se comportan como arriba. NO está aplicada en Supabase.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────── ramas y agentes ─────────────────────────

CREATE TABLE IF NOT EXISTS public.metageminis_ramas (
  id          text PRIMARY KEY CHECK (id IN ('investigadora','redactora','campanas','estudio','alianzas_ia','fondos','seguimiento')),
  nombre      text NOT NULL CHECK (char_length(nombre) <= 80),
  descripcion text CHECK (descripcion IS NULL OR char_length(descripcion) <= 400),
  orden       smallint NOT NULL DEFAULT 0,
  activa      boolean NOT NULL DEFAULT true
);

INSERT INTO public.metageminis_ramas (id, nombre, descripcion, orden) VALUES
  ('investigadora', 'Investigadora', 'Busca y verifica sitios, fondos, convocatorias y comunidades; mantiene el directorio al día.', 1),
  ('redactora', 'Redactora de propuestas', 'Prepara propuestas y mensajes a la medida de cada sitio.', 2),
  ('campanas', 'Campañas', 'Planifica campañas y calendarios por medio; escribe textos y guiones.', 3),
  ('estudio', 'Estudio creativo audiovisual', 'Convierte un brief en piezas por formato (imagen, vídeo, animación 3D, anuncio, cartel, carrusel).', 4),
  ('alianzas_ia', 'Alianzas con agentes de IA', 'Presenta StarSeed en redes y directorios de agentes, siempre identificándose.', 5),
  ('fondos', 'Fondos e inversión', 'Sigue convocatorias, subvenciones y finanzas éticas; prepara la ficha para quien firma.', 6),
  ('seguimiento', 'Seguimiento', 'Cierra el ciclo: respuestas, aportaciones y donaciones confirmadas.', 7)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.metageminis_agentes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rama_id       text NOT NULL REFERENCES public.metageminis_ramas(id),
  nombre        text NOT NULL CHECK (char_length(nombre) BETWEEN 1 AND 80),
  -- Dónde corre: enjambre gratuito, nube, servidor Oracle A1 o la Mac de Alex.
  medio         text NOT NULL CHECK (medio IN ('enjambre','nube','oracle_a1','mac')),
  estado        text NOT NULL DEFAULT 'parado' CHECK (estado IN ('activo','parado','error')),
  modelo        text CHECK (modelo IS NULL OR char_length(modelo) <= 120),
  ultimo_latido timestamptz,
  creado_en     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rama_id, nombre)
);

-- ───────────────────────── campañas y hallazgos ─────────────────────────

CREATE TABLE IF NOT EXISTS public.metageminis_campanas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre        text NOT NULL CHECK (char_length(nombre) BETWEEN 1 AND 120),
  objetivo      text CHECK (objetivo IS NULL OR char_length(objetivo) <= 600),
  -- Brief para el Estudio (architecture/metageminis-estudio.md): mensaje, público, medios, formatos…
  brief         jsonb NOT NULL DEFAULT '{}'::jsonb,
  estado        text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','activa','pausada','terminada')),
  rama_id       text NOT NULL DEFAULT 'campanas' REFERENCES public.metageminis_ramas(id),
  creado_en     timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.metageminis_hallazgos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rama_id     text NOT NULL DEFAULT 'investigadora' REFERENCES public.metageminis_ramas(id),
  agente_id   uuid REFERENCES public.metageminis_agentes(id) ON DELETE SET NULL,
  -- id del sitio en src/lib/metageminis/directorio.ts, si el hallazgo es de una ficha conocida.
  sitio_id    text CHECK (sitio_id IS NULL OR sitio_id ~ '^[a-z0-9][a-z0-9-]*$'),
  tipo        text NOT NULL CHECK (tipo IN ('sitio','convocatoria','organizacion','fondo','persona_publica','aviso')),
  url         text CHECK (url IS NULL OR url ~ '^https://'),
  titulo      text NOT NULL CHECK (char_length(titulo) <= 200),
  resumen     text CHECK (resumen IS NULL OR char_length(resumen) <= 2000),
  plazo       date,
  prioridad   smallint NOT NULL DEFAULT 2 CHECK (prioridad BETWEEN 1 AND 3),
  estado      text NOT NULL DEFAULT 'nuevo' CHECK (estado IN ('nuevo','revisado','descartado')),
  huella      text UNIQUE CHECK (huella IS NULL OR huella ~ '^[0-9a-f]{64}$'),
  creado_en   timestamptz NOT NULL DEFAULT now()
);

-- ───────────────────────── borradores (cola «Para aprobar») ─────────────────────────

CREATE TABLE IF NOT EXISTS public.metageminis_borradores (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rama_id          text NOT NULL REFERENCES public.metageminis_ramas(id),
  agente_id        uuid REFERENCES public.metageminis_agentes(id) ON DELETE SET NULL,
  hallazgo_id      uuid REFERENCES public.metageminis_hallazgos(id) ON DELETE SET NULL,
  campana_id       uuid REFERENCES public.metageminis_campanas(id) ON DELETE SET NULL,
  sitio_id         text CHECK (sitio_id IS NULL OR sitio_id ~ '^[a-z0-9][a-z0-9-]*$'),
  -- Por dónde saldría: API oficial, formulario del sitio, correo de propuestas o a mano por una persona.
  canal            text NOT NULL CHECK (canal IN ('api_oficial','formulario','correo_propuesta','manual_alex')),
  asunto           text CHECK (asunto IS NULL OR char_length(asunto) <= 200),
  cuerpo           text NOT NULL CHECK (char_length(cuerpo) BETWEEN 1 AND 12000),
  idioma           text NOT NULL DEFAULT 'es' CHECK (idioma ~ '^[a-z]{2}(-[A-Za-z]{2,4})?$'),
  -- Puntuación de Jev (scripts/puente/decidir.py) antes de llegar a la cola.
  puntuacion_nivel text CHECK (puntuacion_nivel IS NULL OR puntuacion_nivel IN ('bajo','medio','alto')),
  puntuacion_p     numeric(5,4) CHECK (puntuacion_p IS NULL OR (puntuacion_p >= 0 AND puntuacion_p <= 1)),
  puntuacion_medio text CHECK (puntuacion_medio IS NULL OR char_length(puntuacion_medio) <= 40),
  estado           text NOT NULL DEFAULT 'para_aprobar' CHECK (estado IN ('para_aprobar','aprobado','enviado','respondido','descartado')),
  motivo_descarte  text CHECK (motivo_descarte IS NULL OR char_length(motivo_descarte) <= 300),
  aprobado_por     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  aprobado_en      timestamptz,
  enviado_en       timestamptz,
  respondido_en    timestamptz,
  -- Huella (sha256) de sitio + cuerpo normalizado: el mismo mensaje no se propone dos veces al mismo sitio.
  huella           text UNIQUE CHECK (huella IS NULL OR huella ~ '^[0-9a-f]{64}$'),
  creado_en        timestamptz NOT NULL DEFAULT now(),
  CHECK (estado NOT IN ('aprobado','enviado','respondido') OR (aprobado_por IS NOT NULL AND aprobado_en IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS metageminis_borradores_estado_idx ON public.metageminis_borradores (estado, creado_en DESC);
CREATE INDEX IF NOT EXISTS metageminis_borradores_rama_idx ON public.metageminis_borradores (rama_id, estado);

-- ───────────────────────── piezas de campaña (Estudio) ─────────────────────────

CREATE TABLE IF NOT EXISTS public.metageminis_piezas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campana_id      uuid REFERENCES public.metageminis_campanas(id) ON DELETE SET NULL,
  rama_id         text NOT NULL DEFAULT 'estudio' REFERENCES public.metageminis_ramas(id),
  agente_id       uuid REFERENCES public.metageminis_agentes(id) ON DELETE SET NULL,
  tipo            text NOT NULL CHECK (tipo IN ('imagen','video','animacion3d','anuncio','cartel','carrusel')),
  -- Medio de destino: instagram, youtube, tiktok, bluesky, mastodon, telegram, web, cartel_impreso…
  medio           text NOT NULL CHECK (medio ~ '^[a-z0-9_]{2,40}$'),
  -- «AxB» o «AxB@duración»: 1080x1920@15s, 1920x1080, 1080x1350.
  formato         text NOT NULL CHECK (formato ~ '^[0-9]{2,5}x[0-9]{2,5}(@[0-9]+(\.[0-9]+)?s)?$'),
  ruta            text CHECK (ruta IS NULL OR (char_length(ruta) <= 500 AND ruta !~ '\.\.' AND ruta !~ '^[A-Za-z][A-Za-z0-9+.-]*:')),
  url             text CHECK (url IS NULL OR (char_length(url) <= 1000 AND url ~ '^https://')),
  sha256          text CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
  estado          text NOT NULL DEFAULT 'para_aprobar' CHECK (estado IN ('para_aprobar','aprobado','publicado','descartado')),
  motivo_descarte text CHECK (motivo_descarte IS NULL OR char_length(motivo_descarte) <= 300),
  aprobado_por    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  aprobado_en     timestamptz,
  publicado_en    timestamptz,
  -- Métricas reales del medio (visualizaciones, clics, respuestas…); las rellena el seguimiento.
  metricas        jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  CHECK (ruta IS NOT NULL OR url IS NOT NULL),
  CHECK (estado NOT IN ('aprobado','publicado') OR (aprobado_por IS NOT NULL AND aprobado_en IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS metageminis_piezas_campana_idx ON public.metageminis_piezas (campana_id, medio);
CREATE INDEX IF NOT EXISTS metageminis_piezas_estado_idx ON public.metageminis_piezas (estado, creado_en DESC);

-- ───────────────────────── resultados, enlaces de pago y donaciones ─────────────────────────

CREATE TABLE IF NOT EXISTS public.metageminis_resultados (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rama_id     text NOT NULL REFERENCES public.metageminis_ramas(id),
  agente_id   uuid REFERENCES public.metageminis_agentes(id) ON DELETE SET NULL,
  borrador_id uuid REFERENCES public.metageminis_borradores(id) ON DELETE SET NULL,
  tipo        text NOT NULL CHECK (tipo IN ('respuesta','aportacion','voluntariado','donacion','alianza','financiacion')),
  -- Importe en unidades menores (céntimos) y moneda ISO en minúsculas, solo para donacion y financiacion.
  valor_minor bigint CHECK (valor_minor IS NULL OR valor_minor > 0),
  moneda      text CHECK (moneda IS NULL OR moneda ~ '^[a-z]{3}$'),
  nota        text CHECK (nota IS NULL OR char_length(nota) <= 500),
  creado_en   timestamptz NOT NULL DEFAULT now(),
  CHECK ((valor_minor IS NULL) = (moneda IS NULL))
);

CREATE INDEX IF NOT EXISTS metageminis_resultados_rama_idx ON public.metageminis_resultados (rama_id, tipo, creado_en DESC);

CREATE TABLE IF NOT EXISTS public.metageminis_enlaces_pago (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre         text NOT NULL CHECK (char_length(nombre) BETWEEN 1 AND 120),
  -- Solo enlaces de Stripe de donación o de pago alojado.
  url            text NOT NULL CHECK (url ~ '^https://(donate|buy)\.stripe\.com/[A-Za-z0-9_/-]+$'),
  moneda         text NOT NULL CHECK (moneda ~ '^[a-z]{3}$'),
  minimo_minor   bigint CHECK (minimo_minor IS NULL OR minimo_minor > 0),
  confirmado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmado_en  timestamptz,
  activo         boolean NOT NULL DEFAULT false,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  -- Un enlace solo se activa si un dueño lo confirmó.
  CHECK (activo = false OR (confirmado_por IS NOT NULL AND confirmado_en IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.metageminis_donaciones (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Identificador de Stripe (sesión de pago cs_… o intención de pago pi_…): una donación, una fila.
  stripe_id      text NOT NULL UNIQUE CHECK (stripe_id ~ '^(cs|pi|ch)_[A-Za-z0-9_]+$'),
  enlace_id      uuid REFERENCES public.metageminis_enlaces_pago(id) ON DELETE SET NULL,
  importe_minor  bigint NOT NULL CHECK (importe_minor > 0),
  moneda         text NOT NULL CHECK (moneda ~ '^[a-z]{3}$'),
  estado         text NOT NULL DEFAULT 'confirmada' CHECK (estado IN ('confirmada','reembolsada')),
  -- A qué rama y campaña se atribuye (por la etiqueta que lleva el enlace), si se sabe.
  rama_id        text REFERENCES public.metageminis_ramas(id),
  campana_id     uuid REFERENCES public.metageminis_campanas(id) ON DELETE SET NULL,
  confirmada_en  timestamptz NOT NULL DEFAULT now(),
  creado_en      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.metageminis_donaciones IS
  'Donaciones CONFIRMADAS por Stripe. Sin datos personales de quien dona: Stripe los conserva.';

-- ───────────────────────── reglas de estado (triggers) ─────────────────────────

CREATE OR REPLACE FUNCTION public.metageminis_transicion_ok(_tabla text, _de text, _a text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _tabla
    WHEN 'borrador' THEN
      (_de = 'para_aprobar' AND _a IN ('aprobado','descartado'))
      OR (_de = 'aprobado' AND _a IN ('enviado','descartado'))
      OR (_de = 'enviado' AND _a = 'respondido')
    WHEN 'pieza' THEN
      (_de = 'para_aprobar' AND _a IN ('aprobado','descartado'))
      OR (_de = 'aprobado' AND _a IN ('publicado','descartado'))
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.metageminis_guardia_borrador()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado NOT IN ('para_aprobar','descartado') THEN
      RAISE EXCEPTION 'un borrador solo nace para_aprobar o descartado' USING ERRCODE = '23514';
    END IF;
    NEW.aprobado_por := NULL; NEW.aprobado_en := NULL; NEW.enviado_en := NULL; NEW.respondido_en := NULL;
    RETURN NEW;
  END IF;

  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF NOT public.metageminis_transicion_ok('borrador', OLD.estado, NEW.estado) THEN
      RAISE EXCEPTION 'cambio de estado no válido: % → %', OLD.estado, NEW.estado USING ERRCODE = '23514';
    END IF;
    IF NEW.estado = 'enviado' AND (NEW.aprobado_por IS NULL OR NEW.aprobado_en IS NULL) THEN
      RAISE EXCEPTION 'nada se envía sin la aprobación de un dueño' USING ERRCODE = '23514';
    END IF;
    -- Los borradores «manual_alex» los envía una persona: solo ella (RPC metageminis_marcar_hecho) los marca enviados.
    IF NEW.estado = 'enviado' AND NEW.canal = 'manual_alex' AND coalesce(current_setting('metageminis.envio_manual', true), '') <> '1' THEN
      RAISE EXCEPTION 'un borrador manual lo envía una persona, no un agente' USING ERRCODE = '23514';
    END IF;
    IF NEW.estado = 'enviado' AND NEW.enviado_en IS NULL THEN NEW.enviado_en := now(); END IF;
    IF NEW.estado = 'respondido' AND NEW.respondido_en IS NULL THEN NEW.respondido_en := now(); END IF;
  END IF;

  -- Lo aprobado queda congelado: lo que se aprobó es exactamente lo que sale.
  IF OLD.estado <> 'para_aprobar' AND (
       NEW.cuerpo IS DISTINCT FROM OLD.cuerpo OR NEW.asunto IS DISTINCT FROM OLD.asunto
    OR NEW.canal IS DISTINCT FROM OLD.canal OR NEW.sitio_id IS DISTINCT FROM OLD.sitio_id
    OR NEW.idioma IS DISTINCT FROM OLD.idioma) THEN
    RAISE EXCEPTION 'un borrador decidido no se puede editar' USING ERRCODE = '23514';
  END IF;
  -- Quién aprobó y cuándo no se reescribe.
  IF OLD.aprobado_por IS NOT NULL AND (NEW.aprobado_por IS DISTINCT FROM OLD.aprobado_por OR NEW.aprobado_en IS DISTINCT FROM OLD.aprobado_en) THEN
    RAISE EXCEPTION 'la aprobación no se reescribe' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS metageminis_borradores_guardia ON public.metageminis_borradores;
CREATE TRIGGER metageminis_borradores_guardia BEFORE INSERT OR UPDATE ON public.metageminis_borradores
  FOR EACH ROW EXECUTE FUNCTION public.metageminis_guardia_borrador();

CREATE OR REPLACE FUNCTION public.metageminis_guardia_pieza()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado NOT IN ('para_aprobar','descartado') THEN
      RAISE EXCEPTION 'una pieza solo nace para_aprobar o descartado' USING ERRCODE = '23514';
    END IF;
    NEW.aprobado_por := NULL; NEW.aprobado_en := NULL; NEW.publicado_en := NULL;
    RETURN NEW;
  END IF;

  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF NOT public.metageminis_transicion_ok('pieza', OLD.estado, NEW.estado) THEN
      RAISE EXCEPTION 'cambio de estado no válido: % → %', OLD.estado, NEW.estado USING ERRCODE = '23514';
    END IF;
    IF NEW.estado = 'publicado' AND (NEW.aprobado_por IS NULL OR NEW.aprobado_en IS NULL) THEN
      RAISE EXCEPTION 'nada se publica sin la aprobación de un dueño' USING ERRCODE = '23514';
    END IF;
    IF NEW.estado = 'publicado' AND NEW.publicado_en IS NULL THEN NEW.publicado_en := now(); END IF;
  END IF;

  -- La pieza aprobada queda congelada (archivo, huella, formato y medio).
  IF OLD.estado <> 'para_aprobar' AND (
       NEW.ruta IS DISTINCT FROM OLD.ruta OR NEW.url IS DISTINCT FROM OLD.url OR NEW.sha256 IS DISTINCT FROM OLD.sha256
    OR NEW.formato IS DISTINCT FROM OLD.formato OR NEW.medio IS DISTINCT FROM OLD.medio OR NEW.tipo IS DISTINCT FROM OLD.tipo) THEN
    RAISE EXCEPTION 'una pieza decidida no se puede cambiar' USING ERRCODE = '23514';
  END IF;
  IF OLD.aprobado_por IS NOT NULL AND (NEW.aprobado_por IS DISTINCT FROM OLD.aprobado_por OR NEW.aprobado_en IS DISTINCT FROM OLD.aprobado_en) THEN
    RAISE EXCEPTION 'la aprobación no se reescribe' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS metageminis_piezas_guardia ON public.metageminis_piezas;
CREATE TRIGGER metageminis_piezas_guardia BEFORE INSERT OR UPDATE ON public.metageminis_piezas
  FOR EACH ROW EXECUTE FUNCTION public.metageminis_guardia_pieza();

-- ───────────────────────── RPC: solo los dueños deciden ─────────────────────────

CREATE OR REPLACE FUNCTION public.metageminis_decidir_borrador(_id uuid, _aprobar boolean, _motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  yo uuid := auth.uid();
  fila public.metageminis_borradores%ROWTYPE;
  nuevo text;
BEGIN
  IF yo IS NULL OR NOT public.es_metagenesis_dueno(yo) THEN
    RAISE EXCEPTION 'solo un dueño de MetaGenesis puede aprobar o descartar' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO fila FROM public.metageminis_borradores WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'borrador no encontrado' USING ERRCODE = 'P0002'; END IF;
  nuevo := CASE WHEN _aprobar THEN 'aprobado' ELSE 'descartado' END;
  IF NOT public.metageminis_transicion_ok('borrador', fila.estado, nuevo) THEN
    RAISE EXCEPTION 'cambio de estado no válido: % → %', fila.estado, nuevo USING ERRCODE = '23514';
  END IF;
  UPDATE public.metageminis_borradores SET
    estado = nuevo,
    aprobado_por = CASE WHEN _aprobar THEN yo ELSE aprobado_por END,
    aprobado_en = CASE WHEN _aprobar THEN now() ELSE aprobado_en END,
    motivo_descarte = CASE WHEN _aprobar THEN NULL ELSE left(nullif(btrim(coalesce(_motivo, '')), ''), 300) END
  WHERE id = _id;
  RETURN jsonb_build_object('id', _id, 'estado', nuevo);
END;
$$;

CREATE OR REPLACE FUNCTION public.metageminis_decidir_pieza(_id uuid, _aprobar boolean, _motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  yo uuid := auth.uid();
  fila public.metageminis_piezas%ROWTYPE;
  nuevo text;
BEGIN
  IF yo IS NULL OR NOT public.es_metagenesis_dueno(yo) THEN
    RAISE EXCEPTION 'solo un dueño de MetaGenesis puede aprobar o descartar' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO fila FROM public.metageminis_piezas WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'pieza no encontrada' USING ERRCODE = 'P0002'; END IF;
  nuevo := CASE WHEN _aprobar THEN 'aprobado' ELSE 'descartado' END;
  IF NOT public.metageminis_transicion_ok('pieza', fila.estado, nuevo) THEN
    RAISE EXCEPTION 'cambio de estado no válido: % → %', fila.estado, nuevo USING ERRCODE = '23514';
  END IF;
  UPDATE public.metageminis_piezas SET
    estado = nuevo,
    aprobado_por = CASE WHEN _aprobar THEN yo ELSE aprobado_por END,
    aprobado_en = CASE WHEN _aprobar THEN now() ELSE aprobado_en END,
    motivo_descarte = CASE WHEN _aprobar THEN NULL ELSE left(nullif(btrim(coalesce(_motivo, '')), ''), 300) END
  WHERE id = _id;
  RETURN jsonb_build_object('id', _id, 'estado', nuevo);
END;
$$;

-- Un dueño marca como hecho lo que envió o publicó él a mano: un borrador manual_alex aprobado → enviado, o una pieza aprobada → publicada.
CREATE OR REPLACE FUNCTION public.metageminis_marcar_hecho(_tabla text, _id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  yo uuid := auth.uid();
  n integer;
BEGIN
  IF yo IS NULL OR NOT public.es_metagenesis_dueno(yo) THEN
    RAISE EXCEPTION 'solo un dueño de MetaGenesis puede marcarlo como hecho' USING ERRCODE = '42501';
  END IF;
  IF _tabla = 'borrador' THEN
    PERFORM set_config('metageminis.envio_manual', '1', true);
    UPDATE public.metageminis_borradores SET estado = 'enviado'
      WHERE id = _id AND estado = 'aprobado' AND canal = 'manual_alex';
  ELSIF _tabla = 'pieza' THEN
    UPDATE public.metageminis_piezas SET estado = 'publicado' WHERE id = _id AND estado = 'aprobado';
  ELSE
    RAISE EXCEPTION 'tabla no válida' USING ERRCODE = '22023';
  END IF;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE EXCEPTION 'no hay nada aprobado con ese identificador' USING ERRCODE = 'P0002'; END IF;
  RETURN jsonb_build_object('id', _id, 'tabla', _tabla, 'hecho', true);
END;
$$;

-- Alex confirma (o retira) un enlace de pago: solo los enlaces confirmados se pueden compartir.
CREATE OR REPLACE FUNCTION public.metageminis_confirmar_enlace(_id uuid, _activo boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  yo uuid := auth.uid();
BEGIN
  IF yo IS NULL OR NOT public.es_metagenesis_dueno(yo) THEN
    RAISE EXCEPTION 'solo un dueño de MetaGenesis puede confirmar enlaces de pago' USING ERRCODE = '42501';
  END IF;
  UPDATE public.metageminis_enlaces_pago SET
    activo = _activo,
    confirmado_por = CASE WHEN _activo THEN yo ELSE confirmado_por END,
    confirmado_en = CASE WHEN _activo THEN now() ELSE confirmado_en END
  WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'enlace no encontrado' USING ERRCODE = 'P0002'; END IF;
  RETURN jsonb_build_object('id', _id, 'activo', _activo);
END;
$$;

-- ───────────────────────── RLS y permisos ─────────────────────────

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ramas','agentes','campanas','hallazgos','borradores','piezas','resultados','enlaces_pago','donaciones']
  LOOP
    EXECUTE format('ALTER TABLE public.metageminis_%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS metageminis_%I_ver ON public.metageminis_%I', t, t);
    EXECUTE format(
      'CREATE POLICY metageminis_%I_ver ON public.metageminis_%I FOR SELECT TO authenticated USING (public.es_metagenesis((SELECT auth.uid())))',
      t, t);
    EXECUTE format('REVOKE ALL ON public.metageminis_%I FROM PUBLIC', t);
    EXECUTE format('REVOKE ALL ON public.metageminis_%I FROM anon', t);
    EXECUTE format('REVOKE ALL ON public.metageminis_%I FROM authenticated', t);
    EXECUTE format('GRANT SELECT ON public.metageminis_%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.metageminis_%I TO service_role', t);
  END LOOP;
END;
$$;
-- Sin políticas de INSERT/UPDATE/DELETE: escriben los agentes con la clave de servicio (que salta la RLS
-- pero NO los triggers de arriba) y los dueños solo mediante las RPC de decisión.

REVOKE ALL ON FUNCTION public.metageminis_decidir_borrador(uuid, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.metageminis_decidir_pieza(uuid, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.metageminis_marcar_hecho(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.metageminis_confirmar_enlace(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.metageminis_decidir_borrador(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.metageminis_decidir_pieza(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.metageminis_marcar_hecho(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.metageminis_confirmar_enlace(uuid, boolean) TO authenticated;

-- ───────────────────────── comprobaciones a mano (tras aplicar) ─────────────────────────
-- Como miembro: SELECT count(*) FROM public.metageminis_ramas;               -- 7
-- Como cuenta ajena: la misma consulta devuelve 0 filas.
-- Guardia: INSERT INTO public.metageminis_borradores (rama_id, canal, cuerpo, estado)
--          VALUES ('fondos','correo_propuesta','x','aprobado');              -- debe fallar (23514)
-- Decisión: SELECT public.metageminis_decidir_borrador('<id>', true);        -- solo dueños
