-- ═══════════════════════════════════════════════════════════════════════════
-- Actualizaciones por capas y por nivel de Genesis (2026-10-10) — SIN APLICAR
-- ───────────────────────────────────────────────────────────────────────────
-- Contrato: architecture/actualizaciones-por-capas-y-niveles.md (§1-§6).
-- SOP:      architecture/actualizaciones-por-capas-sop.md
--   · os_versiones            — historial INMUTABLE de versiones publicadas (manifiesto único).
--                               Volver atrás = publicar otra vez la anterior; nunca se borra.
--   · os_versiones_neurona    — qué versión de cada capa tiene cada neurona y en qué estado
--                               (canaria, propagando, pospuesta, falló…). Solo su cuenta la ve.
--   · os_politicas_actualizacion — política por sistema y capa; la de una entidad la leen sus
--                               miembros y la cambian quienes la gestionan.
-- Niveles: MetaGenesis (es_metagenesis) publica cualquier capa; PoliGenesis (quien gestiona la
-- entidad) y Genesis (la propia cuenta) solo «datos» e «interfaz» (CHECK en la tabla).
-- REVISADA 2026-10-10 (integrador): versión única por dueño (no global), «retirar» solo a true y solo
-- por quien conserva el acceso, política con clave (sistema, propietario) y gestión por rol también
-- en gestiona_entidad. Prueba de RLS con dos cuentas anotada al final del archivo.
-- Idempotente. RLS en todas las tablas. Depende de 20261010091000_metagenesis_accesos.sql
-- (es_metagenesis) y de os_pages/os_groups/os_memberships (por slug).
-- ═══════════════════════════════════════════════════════════════════════════

-- ¿auth.uid() gestiona la entidad de este slug? (dueña o rol owner/admin en os_memberships)
CREATE OR REPLACE FUNCTION public.gestiona_entidad(_slug text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _slug IS NOT NULL AND (
       EXISTS (SELECT 1 FROM public.os_pages  p WHERE p.slug = _slug AND p.owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.os_groups g WHERE g.slug = _slug AND g.owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.os_memberships m
               WHERE m.group_slug = _slug AND m.user_id = auth.uid() AND m.role IN ('owner', 'admin'))
    -- PoliGenesis (130000): quien gestiona por rol (rango ≥ 3 en os_entity_roles) también.
    OR EXISTS (SELECT 1 FROM public.os_pages  p WHERE p.slug = _slug AND public.my_entity_role_rank(p.id) >= 3)
    OR EXISTS (SELECT 1 FROM public.os_groups g WHERE g.slug = _slug AND public.my_entity_role_rank(g.id) >= 3)
  );
$$;
REVOKE ALL ON FUNCTION public.gestiona_entidad(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gestiona_entidad(text) TO authenticated;

-- ── 1 · Versiones publicadas ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.os_versiones (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sistema        text NOT NULL CHECK (char_length(sistema) BETWEEN 1 AND 160),
  nivel          text NOT NULL CHECK (nivel IN ('meta', 'poli', 'genesis')),
  dueno_cuenta   uuid REFERENCES auth.users(id) ON DELETE CASCADE,   -- nivel genesis
  entidad_slug   text,                                               -- nivel poli
  version        text NOT NULL CHECK (version ~ '^v?[0-9]+(\.[0-9]+){0,3}([-+][0-9A-Za-z.-]+)?$'),
  anterior       text,
  rama           text NOT NULL CHECK (rama IN ('estable', 'beta', 'propia')),
  capas          text[] NOT NULL CHECK (cardinality(capas) > 0
                   AND capas <@ ARRAY['datos', 'interfaz', 'sw', 'servicios', 'modelos', 'nativa']),
  requiere       jsonb NOT NULL DEFAULT '{"reinicio": [], "recarga": false, "reinstalar": false}',
  tamano_bytes   bigint NOT NULL DEFAULT 0 CHECK (tamano_bytes >= 0),
  sha256         text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  notas          text NOT NULL DEFAULT '' CHECK (char_length(notas) <= 4000),
  aprobacion     jsonb,
  retirada       boolean NOT NULL DEFAULT false,
  publicado_por  uuid REFERENCES auth.users(id) ON DELETE SET NULL,  -- se conserva la versión si se borra la cuenta
  publicado_en   timestamptz NOT NULL DEFAULT now(),
  -- PoliGenesis y Genesis nunca tocan el núcleo: solo capas declarativas.
  CONSTRAINT os_versiones_capas_por_nivel CHECK (nivel = 'meta' OR capas <@ ARRAY['datos', 'interfaz']),
  CONSTRAINT os_versiones_dueno_por_nivel CHECK (
       (nivel = 'meta')
    OR (nivel = 'genesis' AND dueno_cuenta IS NOT NULL)
    OR (nivel = 'poli' AND entidad_slug IS NOT NULL))
);
-- Una versión es única POR DUEÑO: con UNIQUE (sistema, version, rama) global, cualquier cuenta podía
-- publicar antes «os 2026.10.10 estable» a nivel genesis y bloquear la publicación real de MetaGenesis.
CREATE UNIQUE INDEX IF NOT EXISTS os_versiones_unica_meta
  ON public.os_versiones (sistema, version, rama) WHERE nivel = 'meta';
CREATE UNIQUE INDEX IF NOT EXISTS os_versiones_unica_genesis
  ON public.os_versiones (sistema, version, rama, dueno_cuenta) WHERE nivel = 'genesis';
CREATE UNIQUE INDEX IF NOT EXISTS os_versiones_unica_poli
  ON public.os_versiones (sistema, version, rama, entidad_slug) WHERE nivel = 'poli';
CREATE INDEX IF NOT EXISTS os_versiones_sistema_idx ON public.os_versiones (sistema, rama, publicado_en DESC);
ALTER TABLE public.os_versiones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS os_versiones_ver ON public.os_versiones;
CREATE POLICY os_versiones_ver ON public.os_versiones FOR SELECT TO authenticated USING (
     nivel = 'meta'
  OR (nivel = 'genesis' AND dueno_cuenta = (SELECT auth.uid()))
  OR (nivel = 'poli' AND (public.es_is_entity_member(entidad_slug)
        OR EXISTS (SELECT 1 FROM public.os_pages p WHERE p.slug = entidad_slug))));  -- páginas públicas

DROP POLICY IF EXISTS os_versiones_publicar ON public.os_versiones;
CREATE POLICY os_versiones_publicar ON public.os_versiones FOR INSERT TO authenticated WITH CHECK (
  publicado_por = (SELECT auth.uid()) AND (
       (nivel = 'meta' AND public.es_metagenesis((SELECT auth.uid())))
    OR (nivel = 'genesis' AND dueno_cuenta = (SELECT auth.uid()))
    OR (nivel = 'poli' AND public.gestiona_entidad(entidad_slug))));

-- Solo se puede RETIRAR una versión (columna `retirada`, y solo a true); el resto es historial
-- inmutable. Quién retira: la dueña (genesis), quien gestiona la entidad (poli) o, en meta, la
-- dueña de MetaGenesis o quien la publicó SI sigue teniendo el acceso (una cuenta a la que se le
-- quitó MetaGenesis ya no toca sus versiones antiguas).
DROP POLICY IF EXISTS os_versiones_retirar ON public.os_versiones;
CREATE POLICY os_versiones_retirar ON public.os_versiones FOR UPDATE TO authenticated
  USING ((nivel = 'genesis' AND dueno_cuenta = (SELECT auth.uid()))
         OR (nivel = 'poli' AND public.gestiona_entidad(entidad_slug))
         OR (nivel = 'meta' AND (public.es_metagenesis_dueno((SELECT auth.uid()))
              OR (publicado_por = (SELECT auth.uid()) AND public.es_metagenesis((SELECT auth.uid())))))
  )
  WITH CHECK (retirada);
REVOKE ALL ON public.os_versiones FROM anon;
REVOKE ALL ON public.os_versiones FROM authenticated;   -- también DELETE/TRUNCATE: el historial no se borra
GRANT SELECT, INSERT ON public.os_versiones TO authenticated;
GRANT UPDATE (retirada) ON public.os_versiones TO authenticated;

-- ── 2 · Estado de cada capa en cada neurona ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.os_versiones_neurona (
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  neurona_id     text NOT NULL CHECK (char_length(neurona_id) BETWEEN 1 AND 120),
  sistema        text NOT NULL CHECK (char_length(sistema) BETWEEN 1 AND 160),
  capa           text NOT NULL CHECK (capa IN ('datos', 'interfaz', 'sw', 'servicios', 'modelos', 'nativa')),
  version        text CHECK (version IS NULL OR char_length(version) <= 40),
  estado         text NOT NULL DEFAULT 'pendiente' CHECK (estado IN
                   ('pendiente', 'canaria', 'propagando', 'hecho', 'revirtiendo', 'revertido', 'pospuesta', 'fallo')),
  motivo         text CHECK (motivo IS NULL OR char_length(motivo) <= 300),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, neurona_id, sistema, capa)
);
CREATE INDEX IF NOT EXISTS os_versiones_neurona_sistema_idx ON public.os_versiones_neurona (sistema, capa);
ALTER TABLE public.os_versiones_neurona ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS os_versiones_neurona_propias ON public.os_versiones_neurona;
CREATE POLICY os_versiones_neurona_propias ON public.os_versiones_neurona FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
REVOKE ALL ON public.os_versiones_neurona FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.os_versiones_neurona TO authenticated;

-- ── 3 · Política por sistema ────────────────────────────────────────────────
-- La clave es (sistema, propietario): con PRIMARY KEY (sistema) global, la primera cuenta que
-- escribiera «grupo:<slug>» se quedaba con el nombre y la gestora real del grupo ya no podía
-- guardar su política. `propietario` sale de dueno_cuenta/entidad_slug (generada, no se escribe).
CREATE TABLE IF NOT EXISTS public.os_politicas_actualizacion (
  sistema        text NOT NULL CHECK (char_length(sistema) BETWEEN 1 AND 160),
  tipo           text NOT NULL CHECK (tipo IN ('perfil', 'pagina', 'grupo', 'comunidad', 'estudio', 'evento', 'os')),
  dueno_cuenta   uuid REFERENCES auth.users(id) ON DELETE CASCADE,  -- sistemas de una cuenta
  entidad_slug   text,                                              -- sistemas de una entidad
  politica       jsonb NOT NULL,
  actualizado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  propietario    text GENERATED ALWAYS AS (COALESCE(dueno_cuenta::text, entidad_slug)) STORED,
  PRIMARY KEY (sistema, propietario),
  CONSTRAINT os_politicas_un_dueno CHECK ((dueno_cuenta IS NULL) <> (entidad_slug IS NULL))
);
ALTER TABLE public.os_politicas_actualizacion ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS os_politicas_ver ON public.os_politicas_actualizacion;
CREATE POLICY os_politicas_ver ON public.os_politicas_actualizacion FOR SELECT TO authenticated USING (
  dueno_cuenta = (SELECT auth.uid()) OR public.es_is_entity_member(entidad_slug));
DROP POLICY IF EXISTS os_politicas_cambiar ON public.os_politicas_actualizacion;
CREATE POLICY os_politicas_cambiar ON public.os_politicas_actualizacion FOR ALL TO authenticated
  USING (dueno_cuenta = (SELECT auth.uid()) OR public.gestiona_entidad(entidad_slug))
  WITH CHECK (actualizado_por = (SELECT auth.uid())
              AND (dueno_cuenta = (SELECT auth.uid()) OR public.gestiona_entidad(entidad_slug)));
REVOKE ALL ON public.os_politicas_actualizacion FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.os_politicas_actualizacion TO authenticated;

-- Comprobación a mano (tras aplicarla):
-- SELECT nivel, count(*) FROM public.os_versiones GROUP BY nivel;
-- INSERT … nivel='poli', capas='{sw}' → debe fallar por os_versiones_capas_por_nivel.

-- ═══ APLICADA Y PROBADA (2026-10-10, integrador, con el visto bueno de Alex del 2026-10-10) ═══
-- Aplicada y reaplicada (idempotente; la reaplicación añadió REVOKE ALL a `authenticated`).
-- Prueba de RLS con dos cuentas reales (supabase/pruebas/rls-1010c.sql), verde:
--   · solo MetaGenesis (Alex) publica a nivel meta; una cuenta sin el acceso es rechazada;
--   · genesis/poli solo «datos» e «interfaz» (sw → violación de os_versiones_capas_por_nivel);
--   · una versión genesis de otra cuenta NO bloquea la misma versión meta (índices únicos por dueño);
--   · «retirar» solo a true y solo la columna `retirada`; nadie borra el historial (permission denied);
--   · el estado por neurona y la política personal son privados; la política de una entidad con el
--     mismo nombre no choca con la de otra cuenta (clave sistema+propietario);
--   · quien gestiona la entidad por rol (os_entity_roles ≥ 3) publica a nivel poli; quien no, no.
