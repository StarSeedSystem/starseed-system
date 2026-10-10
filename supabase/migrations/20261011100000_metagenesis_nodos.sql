-- ═══════════════════════════════════════════════════════════════════════════
-- MetaGenesis autónoma · nodos, arriendo de líder, colas, órdenes y bitácora
-- (OPA1011, 2026-10-10 · ESCRITA Y PROBADA, NO APLICADA: la aplica Alex)
-- ───────────────────────────────────────────────────────────────────────────
-- QUÉ: el estado compartido de MetaGenesis deja de vivir en el disco de la Mac.
-- Cada NODO (scripts/puente/nodo_metagenesis.py: Mac, A1 de Oracle, nube, otra
-- neurona) late aquí, toma o renueva el ARRIENDO de líder de forma atómica (un
-- solo líder a la vez; si deja de latir, el arriendo caduca y lo toma otro) y
-- recoge las ÓRDENES que las personas con acceso a MetaGenesis dejan desde
-- cualquier neurona (la web, la app nativa, otra máquina).
--
-- SEGURIDAD
--   · Las personas: RLS. Solo los miembros de MetaGenesis (es_metagenesis(),
--     migración 20261010091000) LEEN nodos, arriendo, colas, órdenes y bitácora,
--     y solo ellos CREAN órdenes, siempre a su nombre (por = auth.uid()), con
--     acciones de una lista cerrada y como mucho 30 por hora.
--   · Los nodos: no usan la clave de servicio (no debe vivir en una máquina
--     expuesta). Cada nodo tiene su LLAVE propia; aquí solo se guarda su huella
--     sha256 y la dan de alta un dueño o la clave de servicio de la Mac
--     (metagenesis_registrar_nodo). Las funciones metagenesis_nodo_* comprueban
--     nodo + llave y escriben solo lo de ese nodo. Revocar = un UPDATE.
--   · Nada de claves, IPs ni nombres de máquina: el nodo ya los tacha antes.
--
-- Contrato: architecture/metagenesis-autonoma.md
-- Requiere: 20261010091000_metagenesis_accesos.sql (es_metagenesis, es_metagenesis_dueno)
-- Idempotente. Probada con Postgres 16 y RLS impersonando roles:
--   scripts/puente/test_nodo_metagenesis_migracion.py
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ─── tablas ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.metagenesis_nodos (
  nodo           text PRIMARY KEY CHECK (nodo ~ '^[a-z0-9][a-z0-9-]{1,38}$'),
  medio          text NOT NULL CHECK (medio IN ('mac', 'oracle-a1', 'neurona', 'nube-cowork', 'gh-actions')),
  huella_llave   text NOT NULL CHECK (huella_llave ~ '^[0-9a-f]{64}$'),
  revocado       boolean NOT NULL DEFAULT false,
  modo           text CHECK (modo IS NULL OR modo IN ('real', 'seco')),
  puntos         integer,
  datos          jsonb CHECK (datos IS NULL OR pg_column_size(datos) <= 16384),
  ultimo_latido  timestamptz,
  -- Inicio de la racha ACTUAL de latidos (sin huecos mayores que el TTL): «estable».
  desde          timestamptz,
  registrado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  creado_en      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.metagenesis_arriendo (
  id             smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  lider          text REFERENCES public.metagenesis_nodos(nodo) ON DELETE SET NULL,
  termino        bigint NOT NULL DEFAULT 0,
  puntos         integer NOT NULL DEFAULT 0,
  expira         timestamptz NOT NULL DEFAULT 'epoch',
  -- La FOTO que publica el líder (nodos, trabajo, decisiones): lo que ve cualquier neurona.
  foto           jsonb CHECK (foto IS NULL OR pg_column_size(foto) <= 65536),
  foto_en        timestamptz,
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.metagenesis_arriendo (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Colas compartidas: hoy, «portables» (las tareas listas que otro medio puede seguir si el
-- medio con las colas en su disco se apaga) con su resumen de progreso.
CREATE TABLE IF NOT EXISTS public.metagenesis_colas (
  nombre         text PRIMARY KEY CHECK (nombre ~ '^[a-z0-9][a-z0-9._-]{0,80}$'),
  nodo           text,
  tareas         jsonb NOT NULL DEFAULT '[]'::jsonb
                 CHECK (jsonb_typeof(tareas) = 'array' AND pg_column_size(tareas) <= 262144),
  resumen        jsonb CHECK (resumen IS NULL OR pg_column_size(resumen) <= 8192),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.metagenesis_ordenes (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  creada_en      timestamptz NOT NULL DEFAULT now(),
  por            uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  accion         text NOT NULL CHECK (accion IN ('continuar', 'revisar_bloqueadas', 'buscar_capacidad',
                   'reactivar', 'buscar_trabajo', 'lanzar_cola', 'detener_cola', 'pausar', 'reanudar', 'ceder')),
  args           jsonb NOT NULL DEFAULT '{}'::jsonb
                 CHECK (jsonb_typeof(args) = 'object' AND pg_column_size(args) <= 2048),
  para           text NOT NULL DEFAULT 'lider'
                 CHECK (para IN ('lider', 'mac', 'oracle-a1', 'neurona', 'nube-cowork', 'gh-actions')
                        OR para ~ '^[a-z0-9][a-z0-9-]{1,38}$'),
  estado         text NOT NULL DEFAULT 'pendiente'
                 CHECK (estado IN ('pendiente', 'tomada', 'hecha', 'en_marcha', 'seca', 'nada',
                                   'rechazada', 'fallo', 'caducada')),
  tomada_por     text,
  resultado      text CHECK (resultado IS NULL OR char_length(resultado) <= 400),
  actualizada_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS metagenesis_ordenes_pendientes_idx
  ON public.metagenesis_ordenes (estado, creada_en) WHERE estado = 'pendiente';
CREATE INDEX IF NOT EXISTS metagenesis_ordenes_por_idx ON public.metagenesis_ordenes (por, creada_en DESC);

CREATE TABLE IF NOT EXISTS public.metagenesis_bitacora (
  id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  t     timestamptz NOT NULL DEFAULT now(),
  nodo  text NOT NULL,
  tipo  text NOT NULL CHECK (tipo IN ('decision', 'asignacion', 'lider', 'baja', 'aviso')),
  texto text NOT NULL CHECK (char_length(texto) <= 600),
  datos jsonb CHECK (datos IS NULL OR pg_column_size(datos) <= 16384)
);
CREATE INDEX IF NOT EXISTS metagenesis_bitacora_t_idx ON public.metagenesis_bitacora (t DESC);

-- ─── RLS: las personas (miembros de MetaGenesis) ─────────────────────────────

ALTER TABLE public.metagenesis_nodos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metagenesis_arriendo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metagenesis_colas    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metagenesis_ordenes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metagenesis_bitacora ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS metagenesis_nodos_ver ON public.metagenesis_nodos;
CREATE POLICY metagenesis_nodos_ver ON public.metagenesis_nodos
  FOR SELECT TO authenticated USING (public.es_metagenesis((SELECT auth.uid())));
DROP POLICY IF EXISTS metagenesis_arriendo_ver ON public.metagenesis_arriendo;
CREATE POLICY metagenesis_arriendo_ver ON public.metagenesis_arriendo
  FOR SELECT TO authenticated USING (public.es_metagenesis((SELECT auth.uid())));
DROP POLICY IF EXISTS metagenesis_colas_ver ON public.metagenesis_colas;
CREATE POLICY metagenesis_colas_ver ON public.metagenesis_colas
  FOR SELECT TO authenticated USING (public.es_metagenesis((SELECT auth.uid())));
DROP POLICY IF EXISTS metagenesis_bitacora_ver ON public.metagenesis_bitacora;
CREATE POLICY metagenesis_bitacora_ver ON public.metagenesis_bitacora
  FOR SELECT TO authenticated USING (public.es_metagenesis((SELECT auth.uid())));
DROP POLICY IF EXISTS metagenesis_ordenes_ver ON public.metagenesis_ordenes;
CREATE POLICY metagenesis_ordenes_ver ON public.metagenesis_ordenes
  FOR SELECT TO authenticated USING (public.es_metagenesis((SELECT auth.uid())));
DROP POLICY IF EXISTS metagenesis_ordenes_crear ON public.metagenesis_ordenes;
CREATE POLICY metagenesis_ordenes_crear ON public.metagenesis_ordenes
  FOR INSERT TO authenticated
  WITH CHECK (public.es_metagenesis((SELECT auth.uid())) AND por = (SELECT auth.uid())
              AND estado = 'pendiente' AND tomada_por IS NULL AND resultado IS NULL);
-- Sin UPDATE/DELETE para las personas: el resultado lo escribe el nodo que la tomó.

REVOKE ALL ON public.metagenesis_nodos, public.metagenesis_arriendo, public.metagenesis_colas,
              public.metagenesis_ordenes, public.metagenesis_bitacora FROM PUBLIC, anon, authenticated;
-- La huella de la llave no se enseña ni a los miembros.
GRANT SELECT (nodo, medio, revocado, modo, puntos, datos, ultimo_latido, desde, creado_en)
  ON public.metagenesis_nodos TO authenticated;
GRANT SELECT ON public.metagenesis_arriendo, public.metagenesis_colas, public.metagenesis_bitacora,
                public.metagenesis_ordenes TO authenticated;
GRANT INSERT (accion, args, para) ON public.metagenesis_ordenes TO authenticated;
GRANT ALL ON public.metagenesis_nodos, public.metagenesis_arriendo, public.metagenesis_colas,
             public.metagenesis_ordenes, public.metagenesis_bitacora TO service_role;

-- Como mucho 30 órdenes por hora y cuenta, y sus argumentos solo con valores simples.
CREATE OR REPLACE FUNCTION public.metagenesis_ordenes_guardia()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  clave text;
  valor jsonb;
BEGIN
  IF (SELECT count(*) FROM public.metagenesis_ordenes
      WHERE por = NEW.por AND creada_en > now() - interval '1 hour') >= 30 THEN
    RAISE EXCEPTION 'demasiadas órdenes en una hora' USING ERRCODE = '54000';
  END IF;
  FOR clave, valor IN SELECT * FROM jsonb_each(NEW.args) LOOP
    IF clave NOT IN ('cola', 'trabajadores', 'tareas_sha') OR jsonb_typeof(valor) NOT IN ('string', 'number', 'boolean') THEN
      RAISE EXCEPTION 'argumento no admitido: %', clave USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF NEW.accion IN ('lanzar_cola', 'detener_cola')
     AND coalesce(NEW.args->>'cola', '') !~ '^cola-[A-Za-z0-9._-]{1,80}$' THEN
    RAISE EXCEPTION 'nombre de cola no válido' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS metagenesis_ordenes_guardia ON public.metagenesis_ordenes;
CREATE TRIGGER metagenesis_ordenes_guardia BEFORE INSERT ON public.metagenesis_ordenes
  FOR EACH ROW EXECUTE FUNCTION public.metagenesis_ordenes_guardia();

-- ─── los nodos: llave propia, una llamada por vuelta ─────────────────────────

CREATE OR REPLACE FUNCTION public._metagenesis_nodo_autentico(_nodo text, _llave text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, extensions AS $$
  SELECT _nodo IS NOT NULL AND _llave IS NOT NULL AND char_length(_llave) BETWEEN 32 AND 128
     AND EXISTS (SELECT 1 FROM public.metagenesis_nodos n
                 WHERE n.nodo = _nodo AND NOT n.revocado
                   AND n.huella_llave = encode(extensions.digest(_llave, 'sha256'), 'hex'));
$$;
REVOKE ALL ON FUNCTION public._metagenesis_nodo_autentico(text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._metagenesis_exigir_nodo(_nodo text, _llave text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._metagenesis_nodo_autentico(_nodo, _llave) THEN
    RAISE EXCEPTION 'nodo o llave no válidos' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public._metagenesis_exigir_nodo(text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.metagenesis_nodo_hola(_nodo text, _llave text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._metagenesis_exigir_nodo(_nodo, _llave);
  RETURN true;
END;
$$;

-- Late, toma o renueva el arriendo (atómico) y recoge sus órdenes. Devuelve
-- {arriendo:{lider,termino,puntos,expira}, nodos:[{nodo,medio,modo,puntos,datos,ts}], ordenes:[…]}.
-- Reglas del arriendo (las mismas que el modo bus, nodo_metagenesis_logica.elegir_lider):
--   · lo toma quien llega con el arriendo libre o caducado, o lo renueva su líder;
--   · relevo ordenado: un nodo estable (racha ≥ 600 s) con ≥ 100 puntos más se lo queda;
--   · un nodo con puntos negativos (ha cedido el mando) ni lo toma ni lo renueva.
CREATE OR REPLACE FUNCTION public.metagenesis_nodo_latir(
  _nodo text, _llave text, _medio text, _datos jsonb, _puntos integer, _ttl_s integer DEFAULT 900,
  _estable boolean DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ttl interval := make_interval(secs => greatest(120, least(coalesce(_ttl_s, 900), 3600)));
  estable boolean;
  arr record;
  tomadas jsonb;
  vivos jsonb;
BEGIN
  PERFORM public._metagenesis_exigir_nodo(_nodo, _llave);
  IF _datos IS NOT NULL AND pg_column_size(_datos) > 16384 THEN
    _datos := jsonb_build_object('nodo', _nodo, 'recortado', true);
  END IF;
  UPDATE public.metagenesis_nodos SET
    datos = _datos,
    modo = CASE WHEN _datos->>'modo' IN ('real', 'seco') THEN _datos->>'modo' ELSE modo END,
    puntos = _puntos,
    desde = CASE WHEN ultimo_latido IS NULL OR ultimo_latido < now() - ttl THEN now() ELSE desde END,
    ultimo_latido = now()
  WHERE nodo = _nodo;
  SELECT desde <= now() - interval '600 seconds' INTO estable FROM public.metagenesis_nodos WHERE nodo = _nodo;

  IF coalesce(_puntos, 0) >= 0 THEN
    UPDATE public.metagenesis_arriendo SET
      termino = termino + CASE WHEN lider IS DISTINCT FROM _nodo THEN 1 ELSE 0 END,
      lider = _nodo, puntos = _puntos, expira = now() + ttl, actualizado_en = now()
    WHERE id = 1
      AND (lider = _nodo OR lider IS NULL OR expira < now()
           OR (estable AND _puntos >= puntos + 100));
  END IF;
  SELECT lider, termino, puntos, expira INTO arr FROM public.metagenesis_arriendo WHERE id = 1;

  -- Limpieza barata: órdenes sin tomar a los 15 min caducan.
  UPDATE public.metagenesis_ordenes SET estado = 'caducada', actualizada_en = now()
  WHERE estado = 'pendiente' AND creada_en < now() - interval '15 minutes';

  WITH elegidas AS (
    SELECT o.id FROM public.metagenesis_ordenes o
    WHERE o.estado = 'pendiente'
      AND (o.para = _nodo OR o.para = _medio OR (o.para = 'lider' AND arr.lider = _nodo))
    ORDER BY o.id LIMIT 10 FOR UPDATE SKIP LOCKED
  ), marcadas AS (
    UPDATE public.metagenesis_ordenes o SET estado = 'tomada', tomada_por = _nodo, actualizada_en = now()
    FROM elegidas e WHERE o.id = e.id
    RETURNING o.id, o.accion, o.args, o.para, o.por, o.creada_en
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'accion', accion, 'args', args, 'para', para, 'por', left(por::text, 8),
           't', to_char(creada_en AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')) ORDER BY id), '[]'::jsonb)
    INTO tomadas FROM marcadas;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'nodo', n.nodo, 'medio', n.medio, 'modo', n.modo, 'puntos', n.puntos, 'datos', n.datos,
           'ts', extract(epoch FROM n.ultimo_latido))), '[]'::jsonb)
    INTO vivos FROM public.metagenesis_nodos n
   WHERE NOT n.revocado AND n.ultimo_latido > now() - ttl;

  IF random() < 0.01 THEN
    PERFORM public.metagenesis_podar();
  END IF;

  RETURN jsonb_build_object(
    'arriendo', jsonb_build_object('lider', arr.lider, 'termino', arr.termino, 'puntos', arr.puntos, 'expira', arr.expira),
    'nodos', vivos, 'ordenes', tomadas);
END;
$$;

CREATE OR REPLACE FUNCTION public.metagenesis_nodo_ceder(_nodo text, _llave text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._metagenesis_exigir_nodo(_nodo, _llave);
  UPDATE public.metagenesis_arriendo SET expira = now(), actualizado_en = now() WHERE id = 1 AND lider = _nodo;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.metagenesis_nodo_baja(_nodo text, _llave text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._metagenesis_exigir_nodo(_nodo, _llave);
  UPDATE public.metagenesis_nodos SET ultimo_latido = now() - interval '1 day' WHERE nodo = _nodo;
  UPDATE public.metagenesis_arriendo SET expira = now(), actualizado_en = now() WHERE id = 1 AND lider = _nodo;
  INSERT INTO public.metagenesis_bitacora (nodo, tipo, texto) VALUES (_nodo, 'baja', _nodo || ' se despide');
  RETURN true;
END;
$$;

-- Solo el líder vigente publica la foto.
CREATE OR REPLACE FUNCTION public.metagenesis_nodo_foto(_nodo text, _llave text, _foto jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._metagenesis_exigir_nodo(_nodo, _llave);
  IF _foto IS NULL OR pg_column_size(_foto) > 65536 THEN
    RAISE EXCEPTION 'foto vacía o demasiado grande' USING ERRCODE = '22023';
  END IF;
  UPDATE public.metagenesis_arriendo SET foto = _foto, foto_en = now()
  WHERE id = 1 AND lider = _nodo AND expira > now();
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.metagenesis_nodo_colas(_nodo text, _llave text, _tareas jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._metagenesis_exigir_nodo(_nodo, _llave);
  IF jsonb_typeof(_tareas) IS DISTINCT FROM 'array' OR pg_column_size(_tareas) > 262144 THEN
    RAISE EXCEPTION 'tareas no válidas' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.metagenesis_colas (nombre, nodo, tareas, resumen, actualizado_en)
  VALUES ('portables', _nodo, _tareas, jsonb_build_object('listas', jsonb_array_length(_tareas)), now())
  ON CONFLICT (nombre) DO UPDATE SET nodo = EXCLUDED.nodo, tareas = EXCLUDED.tareas,
    resumen = EXCLUDED.resumen, actualizado_en = now();
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.metagenesis_nodo_leer_colas(_nodo text, _llave text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
BEGIN
  PERFORM public._metagenesis_exigir_nodo(_nodo, _llave);
  RETURN coalesce((SELECT tareas FROM public.metagenesis_colas WHERE nombre = 'portables'), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.metagenesis_nodo_bitacora(_nodo text, _llave text, _tipo text, _texto text, _datos jsonb DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._metagenesis_exigir_nodo(_nodo, _llave);
  IF (SELECT count(*) FROM public.metagenesis_bitacora WHERE nodo = _nodo AND t > now() - interval '1 hour') >= 200 THEN
    RETURN false;  -- un nodo desbocado no llena la tabla
  END IF;
  INSERT INTO public.metagenesis_bitacora (nodo, tipo, texto, datos)
  VALUES (_nodo, _tipo, left(coalesce(_texto, ''), 600),
          CASE WHEN _datos IS NULL OR pg_column_size(_datos) > 16384 THEN NULL ELSE _datos END);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.metagenesis_nodo_orden_resultado(_nodo text, _llave text, _id bigint, _estado text, _resultado text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._metagenesis_exigir_nodo(_nodo, _llave);
  IF _estado NOT IN ('hecha', 'en_marcha', 'seca', 'nada', 'rechazada', 'fallo') THEN
    RAISE EXCEPTION 'estado no válido' USING ERRCODE = '22023';
  END IF;
  UPDATE public.metagenesis_ordenes SET estado = _estado, resultado = left(coalesce(_resultado, ''), 400),
    actualizada_en = now()
  WHERE id = _id AND tomada_por = _nodo;
  RETURN FOUND;
END;
$$;

-- ─── alta y baja de nodos (dueños, o la clave de servicio de la Mac) ─────────

CREATE OR REPLACE FUNCTION public.metagenesis_registrar_nodo(_nodo text, _huella text, _medio text DEFAULT 'neurona')
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Sin cuenta solo llega la clave de servicio (anon no tiene EXECUTE); con cuenta, solo un dueño.
  IF auth.uid() IS NOT NULL AND NOT public.es_metagenesis_dueno(auth.uid()) THEN
    RAISE EXCEPTION 'solo un dueño de MetaGenesis da de alta nodos' USING ERRCODE = '42501';
  END IF;
  IF _nodo !~ '^[a-z0-9][a-z0-9-]{1,38}$' OR lower(coalesce(_huella, '')) !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'nodo o huella no válidos' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.metagenesis_nodos (nodo, medio, huella_llave, revocado, registrado_por)
  VALUES (_nodo, _medio, lower(_huella), false, auth.uid())
  ON CONFLICT (nodo) DO UPDATE SET huella_llave = EXCLUDED.huella_llave, medio = EXCLUDED.medio,
    revocado = false, registrado_por = EXCLUDED.registrado_por;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.metagenesis_revocar_nodo(_nodo text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  existia boolean;
BEGIN
  IF NOT public.es_metagenesis_dueno(auth.uid()) THEN
    RAISE EXCEPTION 'solo un dueño de MetaGenesis revoca nodos' USING ERRCODE = '42501';
  END IF;
  UPDATE public.metagenesis_nodos SET revocado = true WHERE nodo = _nodo;
  existia := FOUND;
  UPDATE public.metagenesis_arriendo SET expira = now() WHERE id = 1 AND lider = _nodo;
  RETURN existia;
END;
$$;

CREATE OR REPLACE FUNCTION public.metagenesis_podar()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.metagenesis_bitacora WHERE t < now() - interval '14 days';
  DELETE FROM public.metagenesis_ordenes WHERE creada_en < now() - interval '30 days';
$$;

REVOKE ALL ON FUNCTION public.metagenesis_ordenes_guardia() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.metagenesis_podar() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.metagenesis_nodo_hola(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.metagenesis_nodo_latir(text, text, text, jsonb, integer, integer, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.metagenesis_nodo_ceder(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.metagenesis_nodo_baja(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.metagenesis_nodo_foto(text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.metagenesis_nodo_colas(text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.metagenesis_nodo_leer_colas(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.metagenesis_nodo_bitacora(text, text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.metagenesis_nodo_orden_resultado(text, text, bigint, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.metagenesis_registrar_nodo(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.metagenesis_revocar_nodo(text) FROM PUBLIC, anon;
-- Los nodos hablan con la clave anónima + su llave (la comprobación va dentro de cada función).
GRANT EXECUTE ON FUNCTION public.metagenesis_nodo_hola(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.metagenesis_nodo_latir(text, text, text, jsonb, integer, integer, boolean) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.metagenesis_nodo_ceder(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.metagenesis_nodo_baja(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.metagenesis_nodo_foto(text, text, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.metagenesis_nodo_colas(text, text, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.metagenesis_nodo_leer_colas(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.metagenesis_nodo_bitacora(text, text, text, text, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.metagenesis_nodo_orden_resultado(text, text, bigint, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.metagenesis_registrar_nodo(text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.metagenesis_revocar_nodo(text) TO authenticated, service_role;

-- ─── en vivo: la vista remota se entera sin sondear (RLS también filtra Realtime) ─
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'metagenesis_arriendo') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.metagenesis_arriendo;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'metagenesis_ordenes') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.metagenesis_ordenes;
    END IF;
  END IF;
END;
$$;

-- Comprobación a mano (como miembro):
--   SELECT lider, termino, expira, foto_en FROM public.metagenesis_arriendo;
--   SELECT nodo, medio, modo, ultimo_latido FROM public.metagenesis_nodos ORDER BY ultimo_latido DESC;
-- Alta de un nodo (en la Mac, con la clave de servicio):
--   python3 scripts/puente/nodo_metagenesis.py llave        # en el nodo: enseña su huella
--   python3 scripts/puente/nodo_metagenesis.py registrar --nodo <id> --huella <h> --medio <medio>
