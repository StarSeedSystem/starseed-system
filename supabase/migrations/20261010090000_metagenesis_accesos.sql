-- ═══════════════════════════════════════════════════════════════════════════
-- MetaGenesis · quién puede entrar (2026-10-10, palabra de Alex del 2026-10-09)
-- ───────────────────────────────────────────────────────────────────────────
-- MetaGenesis es el Genesis de los desarrolladores de StarSeed OS (edita el
-- código del OS: enjambre, olas, publicación). Solo entran las cuentas de esta
-- tabla. Los DUEÑOS dan y quitan acceso desde Ajustes de MetaGenesis.
--   · Cada cuenta ve solo SU fila; los dueños ven y gestionan todas.
--   · Las altas y bajas van por RPC (nunca quedan sin dueño).
--   · Semilla: las dos cuentas de Alex como dueños.
-- Contrato: architecture/genesis-niveles-malla-universal-estaciones.md §A.1
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.metagenesis_accesos (
  account_id   uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  rol          text NOT NULL CHECK (rol IN ('dueño', 'desarrollador')),
  otorgado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  nota         text,
  creado_en    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.metagenesis_accesos ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.es_metagenesis(_uid uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  -- Cada cuenta solo puede preguntar por SÍ MISMA (no se revela quién es desarrollador);
  -- la clave de servicio (sin auth.uid) y los dueños pueden preguntar por cualquiera.
  SELECT _uid IS NOT NULL
     AND (_uid = auth.uid() OR auth.uid() IS NULL
          OR EXISTS (SELECT 1 FROM public.metagenesis_accesos WHERE account_id = auth.uid() AND rol = 'dueño'))
     AND EXISTS (SELECT 1 FROM public.metagenesis_accesos WHERE account_id = _uid);
$$;

CREATE OR REPLACE FUNCTION public.es_metagenesis_dueno(_uid uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND EXISTS (SELECT 1 FROM public.metagenesis_accesos WHERE account_id = _uid AND rol = 'dueño');
$$;

DROP POLICY IF EXISTS metagenesis_accesos_ver ON public.metagenesis_accesos;
CREATE POLICY metagenesis_accesos_ver ON public.metagenesis_accesos
  FOR SELECT TO authenticated
  USING (account_id = (SELECT auth.uid()) OR public.es_metagenesis_dueno((SELECT auth.uid())));
-- Sin políticas de INSERT/UPDATE/DELETE: solo las RPC de abajo (SECURITY DEFINER) escriben.

-- Dar acceso: por correo («persona@dominio») o por @usuario del perfil. Solo dueños.
CREATE OR REPLACE FUNCTION public.metagenesis_otorgar(_identificador text, _rol text DEFAULT 'desarrollador', _nota text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  yo uuid := auth.uid();
  ident text := btrim(coalesce(_identificador, ''));
  cuenta uuid;
BEGIN
  IF NOT public.es_metagenesis_dueno(yo) THEN
    RAISE EXCEPTION 'solo un dueño de MetaGenesis puede dar acceso' USING ERRCODE = '42501';
  END IF;
  IF _rol NOT IN ('dueño', 'desarrollador') THEN
    RAISE EXCEPTION 'rol no válido' USING ERRCODE = '22023';
  END IF;
  IF ident = '' OR char_length(ident) > 200 THEN
    RAISE EXCEPTION 'indica un correo o un @usuario' USING ERRCODE = '22023';
  END IF;
  IF position('@' IN ident) > 1 THEN
    SELECT id INTO cuenta FROM auth.users WHERE lower(email) = lower(ident) LIMIT 1;
  ELSE
    SELECT user_id INTO cuenta FROM public.profiles
      WHERE lower(handle) = lower(ltrim(ident, '@')) AND user_id IS NOT NULL LIMIT 1;
  END IF;
  IF cuenta IS NULL THEN
    RAISE EXCEPTION 'no hay ninguna cuenta con ese correo o usuario' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.metagenesis_accesos (account_id, rol, otorgado_por, nota)
  VALUES (cuenta, _rol, yo, nullif(btrim(coalesce(_nota, '')), ''))
  ON CONFLICT (account_id) DO UPDATE SET rol = EXCLUDED.rol, nota = coalesce(EXCLUDED.nota, public.metagenesis_accesos.nota);
  RETURN jsonb_build_object('account_id', cuenta, 'rol', _rol);
END;
$$;

-- Quitar acceso. Solo dueños; nunca deja MetaGenesis sin ningún dueño.
CREATE OR REPLACE FUNCTION public.metagenesis_revocar(_account uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  yo uuid := auth.uid();
  rol_actual text;
BEGIN
  IF NOT public.es_metagenesis_dueno(yo) THEN
    RAISE EXCEPTION 'solo un dueño de MetaGenesis puede quitar acceso' USING ERRCODE = '42501';
  END IF;
  SELECT rol INTO rol_actual FROM public.metagenesis_accesos WHERE account_id = _account;
  IF rol_actual IS NULL THEN
    RETURN false;
  END IF;
  IF rol_actual = 'dueño' AND (SELECT count(*) FROM public.metagenesis_accesos WHERE rol = 'dueño') <= 1 THEN
    RAISE EXCEPTION 'MetaGenesis no puede quedarse sin dueño' USING ERRCODE = '23514';
  END IF;
  DELETE FROM public.metagenesis_accesos WHERE account_id = _account;
  RETURN true;
END;
$$;

-- Lista para la pantalla de Ajustes (miembros): correo enmascarado, @usuario y nombre del perfil.
CREATE OR REPLACE FUNCTION public.metagenesis_miembros()
RETURNS TABLE (account_id uuid, rol text, correo text, handle text, nombre text, otorgado_por uuid, creado_en timestamptz, soy_yo boolean)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, auth AS $$
BEGIN
  IF NOT public.es_metagenesis(auth.uid()) THEN
    RAISE EXCEPTION 'solo para miembros de MetaGenesis' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT a.account_id, a.rol,
           regexp_replace(coalesce(u.email, ''), '^(.{2}).*(@.*)$', '\1…\2') AS correo,
           p.handle, coalesce(p.display_name, p.name) AS nombre,
           a.otorgado_por, a.creado_en, a.account_id = auth.uid() AS soy_yo
    FROM public.metagenesis_accesos a
    LEFT JOIN auth.users u ON u.id = a.account_id
    LEFT JOIN LATERAL (
      SELECT pr.handle, pr.display_name, pr.name FROM public.profiles pr
      WHERE pr.user_id = a.account_id ORDER BY pr.created_at LIMIT 1
    ) p ON true
    ORDER BY (a.rol = 'dueño') DESC, a.creado_en;
END;
$$;

REVOKE ALL ON FUNCTION public.es_metagenesis(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.es_metagenesis_dueno(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.metagenesis_otorgar(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.metagenesis_revocar(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.metagenesis_miembros() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.es_metagenesis(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.es_metagenesis_dueno(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.metagenesis_otorgar(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.metagenesis_revocar(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.metagenesis_miembros() TO authenticated;
REVOKE ALL ON public.metagenesis_accesos FROM anon;
GRANT SELECT ON public.metagenesis_accesos TO authenticated;

-- Semilla: las dos cuentas de Alex, dueños.
INSERT INTO public.metagenesis_accesos (account_id, rol, nota)
SELECT id, 'dueño', 'semilla: cuenta de Alex'
FROM auth.users WHERE lower(email) = 'maggasukha@star.seed'
ON CONFLICT (account_id) DO NOTHING;
-- Su segunda cuenta (ale…@star.seed): solo si hay exactamente una que encaje.
INSERT INTO public.metagenesis_accesos (account_id, rol, nota)
SELECT id, 'dueño', 'semilla: cuenta de Alex'
FROM auth.users
WHERE lower(email) LIKE 'ale%@star.seed'
  AND (SELECT count(*) FROM auth.users WHERE lower(email) LIKE 'ale%@star.seed') = 1
ON CONFLICT (account_id) DO NOTHING;
-- Aplicada en jhgvhkypqadfdkkqoxta el 2026-10-10 (Management API) y probada con la RLS
-- impersonando: Alex ve 2 filas y es dueño; otra cuenta ve 0, no es miembro, no puede
-- preguntar por Alex ni dar acceso (42501).

-- Comprobación a mano:
-- SELECT rol, count(*) FROM public.metagenesis_accesos GROUP BY rol;
