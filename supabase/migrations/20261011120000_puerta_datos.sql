-- ═══════════════════════════════════════════════════════════════════════════
-- Puerta de datos del A1 · réplica por lotes, llave propia y dirección de la puerta
-- (PDA1010, 2026-10-10 · ESCRITA Y PROBADA, NO APLICADA: la aplica Alex)
-- ───────────────────────────────────────────────────────────────────────────
-- QUÉ: la puerta de datos del A1 de Oracle (servicios/puerta-datos) sirve el tráfico de máquina a
-- máquina (bus, latidos, arriendo de MetaGenesis, presencia, malla de Astraura) y a Supabase solo
-- le manda, POR LOTES y con tope, lo que hay que conservar. Contrato:
-- architecture/puerta-datos-a1.md §6.
--
-- SEGURIDAD
--   · En el A1 NO hay clave de servicio. La puerta llama con la clave pública + su LLAVE propia;
--     aquí solo se guarda su sha256 (puerta_datos_llaves). Revocar = un UPDATE.
--   · puerta_datos_replicar() solo puede: insertar eventos del bus (lo que ya puede `anon` en
--     relevo_eventos), ADELANTAR `last_seen_at` de neuronas que existen y son de esa cuenta,
--     ADELANTAR `visto` en os_presencia (sin tocar `visible`) y dejar la foto del arriendo en
--     puerta_datos_espejo. Nunca crea neuronas, nunca cambia dueños, nunca borra.
--   · os_puerta_datos (dirección y salud de la puerta): la leen solo cuentas con sesión; la
--     escribe la clave de servicio de la Mac. puerta_datos_espejo: solo miembros de MetaGenesis.
--
-- Requiere: relevo_eventos (20260903200000), neuron_devices (20260712090100), os_presencia
-- (20260928120000). Usa es_metagenesis / es_metagenesis_dueno (20261010091000) SI existen; si no,
-- el espejo queda cerrado (USING false) hasta volver a aplicar esta migración.
-- Idempotente. Probada en Postgres 16 con los roles de Supabase:
--   scripts/puente/test_puerta_datos_migracion.py
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ─── tablas ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.puerta_datos_llaves (
  nombre      text PRIMARY KEY CHECK (nombre ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  huella      text NOT NULL CHECK (huella ~ '^[0-9a-f]{64}$'),
  revocada    boolean NOT NULL DEFAULT false,
  creada_en   timestamptz NOT NULL DEFAULT now(),
  ultimo_uso  timestamptz,
  dia         date,
  lotes_dia   integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.os_puerta_datos (
  id          smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  url         text CHECK (url IS NULL OR (url ~ '^https://[a-z0-9.-]+(:[0-9]{2,5})?/?$' AND char_length(url) <= 200)),
  activa      boolean NOT NULL DEFAULT false,
  version     text CHECK (version IS NULL OR char_length(version) <= 40),
  salud       jsonb CHECK (salud IS NULL OR pg_column_size(salud) <= 4096),
  actualizado timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.os_puerta_datos (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.puerta_datos_espejo (
  clave       text PRIMARY KEY CHECK (clave IN ('arriendo_mg')),
  datos       jsonb NOT NULL CHECK (pg_column_size(datos) <= 131072),
  actualizado timestamptz NOT NULL DEFAULT now()
);

-- ─── RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE public.puerta_datos_llaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.os_puerta_datos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.puerta_datos_espejo ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.puerta_datos_llaves, public.os_puerta_datos, public.puerta_datos_espejo
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.puerta_datos_llaves, public.os_puerta_datos, public.puerta_datos_espejo TO service_role;

DROP POLICY IF EXISTS os_puerta_datos_ver ON public.os_puerta_datos;
CREATE POLICY os_puerta_datos_ver ON public.os_puerta_datos FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.os_puerta_datos TO authenticated;

DO $$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS puerta_datos_espejo_ver ON public.puerta_datos_espejo';
  IF to_regprocedure('public.es_metagenesis(uuid)') IS NOT NULL THEN
    EXECUTE 'CREATE POLICY puerta_datos_espejo_ver ON public.puerta_datos_espejo FOR SELECT TO authenticated '
            'USING (public.es_metagenesis((SELECT auth.uid())))';
  ELSE
    EXECUTE 'CREATE POLICY puerta_datos_espejo_ver ON public.puerta_datos_espejo FOR SELECT TO authenticated USING (false)';
  END IF;
END $$;
GRANT SELECT ON public.puerta_datos_espejo TO authenticated;

-- ─── alta de la llave (clave de servicio de la Mac, o un dueño de MetaGenesis) ─

CREATE OR REPLACE FUNCTION public.puerta_datos_registrar_llave(_nombre text, _huella text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  es_dueno boolean := false;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF to_regprocedure('public.es_metagenesis_dueno(uuid)') IS NOT NULL THEN
      EXECUTE 'SELECT public.es_metagenesis_dueno($1)' INTO es_dueno USING auth.uid();
    END IF;
    IF NOT coalesce(es_dueno, false) THEN
      RAISE EXCEPTION 'solo un dueño de MetaGenesis registra la llave de la puerta' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF coalesce(_nombre, '') !~ '^[a-z0-9][a-z0-9-]{1,40}$' OR lower(coalesce(_huella, '')) !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'nombre o huella no válidos' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.puerta_datos_llaves (nombre, huella, revocada)
  VALUES (_nombre, lower(_huella), false)
  ON CONFLICT (nombre) DO UPDATE SET huella = EXCLUDED.huella, revocada = false;
  RETURN true;
END;
$$;

-- Fecha ISO segura: un texto raro no tumba el lote; nunca en el futuro.
CREATE OR REPLACE FUNCTION public._puerta_datos_fecha(_t text)
RETURNS timestamptz LANGUAGE plpgsql STABLE AS $$
BEGIN
  IF _t IS NULL OR _t !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}' THEN
    RETURN NULL;
  END IF;
  RETURN _t::timestamptz;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

-- ─── la réplica: UNA llamada por lote ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.puerta_datos_replicar(_llave text, _lote jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  llave_nombre text;
  lotes integer;
  n_ev integer := 0;
  n_ne integer := 0;
  n_pr integer := 0;
  n_ar integer := 0;
BEGIN
  IF _llave IS NULL OR char_length(_llave) NOT BETWEEN 32 AND 128 THEN
    RAISE EXCEPTION 'llave no válida' USING ERRCODE = '42501';
  END IF;
  SELECT nombre INTO llave_nombre FROM public.puerta_datos_llaves
   WHERE huella = encode(extensions.digest(_llave, 'sha256'), 'hex') AND NOT revocada;
  IF llave_nombre IS NULL THEN
    RAISE EXCEPTION 'llave no válida' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(_lote) IS DISTINCT FROM 'object' OR pg_column_size(_lote) > 1048576 THEN
    RAISE EXCEPTION 'lote no válido' USING ERRCODE = '22023';
  END IF;
  -- Tope de lotes por día y llave: una puerta desbocada no puede llenar Supabase.
  UPDATE public.puerta_datos_llaves
     SET lotes_dia = CASE WHEN dia = current_date THEN lotes_dia + 1 ELSE 1 END,
         dia = current_date, ultimo_uso = now()
   WHERE nombre = llave_nombre
  RETURNING lotes_dia INTO lotes;
  IF lotes > 2000 THEN
    RAISE EXCEPTION 'tope de lotes del día' USING ERRCODE = '54000';
  END IF;

  -- 1. Eventos del bus (los mismos límites que ya pone relevo_eventos).
  IF jsonb_typeof(_lote->'eventos') = 'array' AND to_regclass('public.relevo_eventos') IS NOT NULL THEN
    INSERT INTO public.relevo_eventos (t, quien, tipo, tarea, texto, datos)
    SELECT least(coalesce(public._puerta_datos_fecha(e->>'t'), now()), now()),
           left(e->>'quien', 40), left(e->>'tipo', 40),
           nullif(left(coalesce(e->>'tarea', ''), 160), ''),
           left(coalesce(e->>'texto', ''), 4000),
           CASE WHEN jsonb_typeof(e->'datos') IN ('object', 'array') AND pg_column_size(e->'datos') <= 16384
                THEN e->'datos' END
      FROM (SELECT value AS e FROM jsonb_array_elements(_lote->'eventos') LIMIT 200) s
     WHERE coalesce(e->>'quien', '') <> '' AND coalesce(e->>'tipo', '') <> '';
    GET DIAGNOSTICS n_ev = ROW_COUNT;
  END IF;

  -- 2. Neuronas: solo ADELANTA el último latido de filas que existen y son de esa cuenta.
  IF jsonb_typeof(_lote->'neuronas') = 'array' AND to_regclass('public.neuron_devices') IS NOT NULL THEN
    WITH l AS (
      SELECT x->>'cuenta' AS cuenta, x->>'neurona' AS neurona,
             least(public._puerta_datos_fecha(x->>'visto'), now()) AS visto
        FROM (SELECT value AS x FROM jsonb_array_elements(_lote->'neuronas') LIMIT 500) s
    )
    UPDATE public.neuron_devices d SET last_seen_at = l.visto
      FROM l
     WHERE l.visto IS NOT NULL AND d.id = l.neurona AND d.owner::text = l.cuenta AND d.last_seen_at < l.visto;
    GET DIAGNOSTICS n_ne = ROW_COUNT;
  END IF;

  -- 3. Presencia: adelanta `visto`; `visible` es de la persona y no se toca.
  IF jsonb_typeof(_lote->'presencia') = 'array' AND to_regclass('public.os_presencia') IS NOT NULL THEN
    INSERT INTO public.os_presencia AS p (user_id, visto)
    SELECT u.id, l.visto
      FROM (SELECT x->>'cuenta' AS cuenta, least(public._puerta_datos_fecha(x->>'visto'), now()) AS visto
              FROM (SELECT value AS x FROM jsonb_array_elements(_lote->'presencia') LIMIT 500) s) l
      JOIN auth.users u ON u.id::text = l.cuenta
     WHERE l.visto IS NOT NULL
    ON CONFLICT (user_id) DO UPDATE SET visto = greatest(p.visto, EXCLUDED.visto);
    GET DIAGNOSTICS n_pr = ROW_COUNT;
  END IF;

  -- 4. Foto del arriendo de MetaGenesis (espejo de solo lectura para cuando la puerta no responda).
  IF jsonb_typeof(_lote->'arriendo') = 'object' AND pg_column_size(_lote->'arriendo') <= 131072 THEN
    INSERT INTO public.puerta_datos_espejo (clave, datos, actualizado)
    VALUES ('arriendo_mg', _lote->'arriendo', now())
    ON CONFLICT (clave) DO UPDATE SET datos = EXCLUDED.datos, actualizado = now();
    n_ar := 1;
  END IF;

  RETURN jsonb_build_object('eventos', n_ev, 'neuronas', n_ne, 'presencia', n_pr, 'arriendo', n_ar,
                            'lotes_hoy', lotes);
END;
$$;

REVOKE ALL ON FUNCTION public.puerta_datos_registrar_llave(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.puerta_datos_registrar_llave(text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public._puerta_datos_fecha(text) FROM PUBLIC, anon, authenticated;
-- La puerta habla con la clave pública + su llave (la comprobación va dentro de la función).
REVOKE ALL ON FUNCTION public.puerta_datos_replicar(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.puerta_datos_replicar(text, jsonb) TO anon, authenticated, service_role;

COMMENT ON TABLE public.os_puerta_datos IS
  'Dirección y salud de la puerta de datos del A1 (fila única). La leen cuentas con sesión; la escribe la clave de servicio de la Mac. PDA1010.';
COMMENT ON FUNCTION public.puerta_datos_replicar(text, jsonb) IS
  'Réplica por lotes de la puerta de datos del A1 (eventos, neuronas, presencia, foto del arriendo). Llave propia comprobada por sha256; tope 2000 lotes/día. PDA1010.';
