-- ════════════════════════════════════════════════════════════════════════════
-- Contactos + presencia + perfiles entre miembros de un chat (2026-09-28)
--
-- 1. os_contactos_publicos — la LISTA PÚBLICA de contactos de una cuenta (lo que se ve en
--    su perfil). La libreta completa (teléfonos, correos, notas, contactos privados) vive en
--    entity_state de la cuenta y NUNCA pasa por aquí.
-- 2. os_presencia — «en línea / última vez». Tabla aparte a propósito: si fuera una columna de
--    os_profiles, cada latido dispararía el realtime de os_profiles y la recarga del perfil en
--    todas las neuronas de la cuenta (tráfico que ya nos agotó Supabase una vez). No se publica
--    en supabase_realtime.
-- 3. Quien comparte un chat contigo puede leer tu os_profiles aunque no sea público: sin esto
--    la cabecera del chat decía «Conversación» en vez del nombre de la otra persona.
-- Idempotente: se puede aplicar dos veces.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────── 1. Lista pública de contactos ───────────────────
CREATE TABLE IF NOT EXISTS public.os_contactos_publicos (
  owner_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contacto_user_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  etiqueta          text        CHECK (etiqueta IS NULL OR char_length(etiqueta) <= 60),
  orden             integer     NOT NULL DEFAULT 0,
  creado            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, contacto_user_id),
  CHECK (owner_id <> contacto_user_id)
);
CREATE INDEX IF NOT EXISTS os_contactos_publicos_contacto_idx
  ON public.os_contactos_publicos (contacto_user_id);

ALTER TABLE public.os_contactos_publicos ENABLE ROW LEVEL SECURITY;

-- Es una lista pública por definición: cualquiera puede leerla (los perfiles no públicos de
-- esa lista siguen sin resolverse por la RLS de os_profiles, así que no se filtra nadie).
DROP POLICY IF EXISTS os_contactos_publicos_select ON public.os_contactos_publicos;
CREATE POLICY os_contactos_publicos_select ON public.os_contactos_publicos
FOR SELECT USING (true);

DROP POLICY IF EXISTS os_contactos_publicos_insert ON public.os_contactos_publicos;
CREATE POLICY os_contactos_publicos_insert ON public.os_contactos_publicos
FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS os_contactos_publicos_update ON public.os_contactos_publicos;
CREATE POLICY os_contactos_publicos_update ON public.os_contactos_publicos
FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS os_contactos_publicos_delete ON public.os_contactos_publicos;
CREATE POLICY os_contactos_publicos_delete ON public.os_contactos_publicos
FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- ─────────────────────────── 2. Presencia ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.os_presencia (
  user_id  uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  visto    timestamptz NOT NULL DEFAULT now(),
  -- false = la persona eligió no mostrar «en línea» ni su última vez.
  visible  boolean     NOT NULL DEFAULT true
);

ALTER TABLE public.os_presencia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS os_presencia_select ON public.os_presencia;
CREATE POLICY os_presencia_select ON public.os_presencia
FOR SELECT TO authenticated USING (visible OR user_id = auth.uid());

DROP POLICY IF EXISTS os_presencia_insert ON public.os_presencia;
CREATE POLICY os_presencia_insert ON public.os_presencia
FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS os_presencia_update ON public.os_presencia;
CREATE POLICY os_presencia_update ON public.os_presencia
FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ─────────────────── 3. Perfiles legibles entre miembros de un chat ───────────
CREATE OR REPLACE FUNCTION public.comparte_hilo_dm(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.os_dm_members a
    JOIN public.os_dm_members b ON b.thread_id = a.thread_id
    WHERE a.user_id = _a AND b.user_id = _b
  );
$$;

DROP POLICY IF EXISTS os_profiles_select_companeros_chat ON public.os_profiles;
CREATE POLICY os_profiles_select_companeros_chat ON public.os_profiles
FOR SELECT TO authenticated
USING (public.comparte_hilo_dm(auth.uid(), user_id));
