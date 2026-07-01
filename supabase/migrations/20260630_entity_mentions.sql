-- ─────────────────────────────────────────────────────────────────────────────
-- StarSeed OS · Menciones universales #/@ (entity_mentions)
--
-- Tabla POLIMÓRFICA que registra que una ENTIDAD ORIGEN (p. ej. una publicación)
-- menciona (`@`) o etiqueta / adjunta (`#`) a una ENTIDAD DESTINO (usuario, grupo,
-- comunidad, entidad federativa, cuenta, publicación, lienzo, evento, insignia,
-- propuesta, tema, memoria, cerebro, app…). No usa claves foráneas rígidas porque
-- el destino es de tipo variable (polimórfico): la integridad se garantiza en la
-- capa de aplicación, que además guarda una copia en `posts.post_references.mentions`.
--
-- El frontend es DEFENSIVO: si esta tabla aún no existe, las menciones siguen
-- viajando dentro del propio post (post_references) y nada se rompe. Aplicar esta
-- migración habilita además consultas inversas ("¿quién me ha mencionado?").
--
-- NOTA: este archivo NO se aplica automáticamente; ejecútalo cuando corresponda.
-- ─────────────────────────────────────────────────────────────────────────────

-- TABLE: entity_mentions
CREATE TABLE IF NOT EXISTS public.entity_mentions (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  -- Entidad origen (quién menciona). P. ej. source_type='post'.
  source_type  TEXT NOT NULL,
  source_id    TEXT NOT NULL,
  -- Entidad destino (a quién/qué se menciona o adjunta). Polimórfica.
  target_type  TEXT NOT NULL,
  target_id    TEXT NOT NULL,
  -- Disparador: '@' = mención/notificar · '#' = etiqueta/tema/adjuntar.
  kind         TEXT NOT NULL DEFAULT '@' CHECK (kind IN ('@', '#')),
  -- Autor de la mención (opcional; útil para RLS de escritura por dueño).
  author_id    UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Índices ──
-- Consulta directa: menciones de una entidad origen (render del post).
CREATE INDEX IF NOT EXISTS entity_mentions_source_idx
  ON public.entity_mentions (source_type, source_id);
-- Consulta inversa: "¿dónde se me ha mencionado?" (notificaciones / perfiles).
CREATE INDEX IF NOT EXISTS entity_mentions_target_idx
  ON public.entity_mentions (target_type, target_id);
-- Filtrado por tipo de mención (@/#).
CREATE INDEX IF NOT EXISTS entity_mentions_kind_idx
  ON public.entity_mentions (kind);
-- Evita duplicados exactos de la misma mención en la misma fuente.
CREATE UNIQUE INDEX IF NOT EXISTS entity_mentions_unique_idx
  ON public.entity_mentions (source_type, source_id, target_type, target_id, kind);

-- ── RLS ──
ALTER TABLE public.entity_mentions ENABLE ROW LEVEL SECURITY;

-- Lectura: las menciones son públicas por naturaleza (parte del contenido
-- difundido). Si se desea restringir, endurecer esta política más adelante.
DROP POLICY IF EXISTS "entity_mentions readable" ON public.entity_mentions;
CREATE POLICY "entity_mentions readable"
  ON public.entity_mentions FOR SELECT
  USING (true);

-- Inserción: cualquier usuario autenticado puede registrar menciones. Si
-- `author_id` se informa, debe coincidir con el usuario actual.
DROP POLICY IF EXISTS "entity_mentions insert by authed" ON public.entity_mentions;
CREATE POLICY "entity_mentions insert by authed"
  ON public.entity_mentions FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (author_id IS NULL OR author_id = auth.uid())
  );

-- Borrado: sólo el autor de la mención puede eliminarla (cuando se informó).
DROP POLICY IF EXISTS "entity_mentions delete own" ON public.entity_mentions;
CREATE POLICY "entity_mentions delete own"
  ON public.entity_mentions FOR DELETE
  USING (author_id IS NOT NULL AND author_id = auth.uid());
