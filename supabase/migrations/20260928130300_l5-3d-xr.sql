-- ═══════════════════════════════════════════════════════════════════════════
-- L5 · Escena 3D compartida y Sala XR (2026-09-28)
-- ---------------------------------------------------------------------------
-- Una escena 3D es una fila de `os_spaces` con kind = 'escena' (doc = objetos, ambiente…,
-- ver `src/lib/vivo/espacial/modelo.ts`). Mismo RLS, invitaciones (`os_space_editors`), enlace
-- público y realtime que pizarras y escritorios: lo ÚNICO que cambia es que la restricción
-- CHECK de `kind` admita 'escena'.
--
-- ⚠️ Componible con otras migraciones que también añadan kinds: en vez de reescribir la lista
-- con valores fijos (y borrar los que otra ola añadiera), se LEEN los valores que admite hoy la
-- restricción (en cualquiera de sus dos formatos: ARRAY['a'::text, …] o '{a,b}'::text[]) y se
-- les SUMA 'escena'. Idempotente: si ya lo admite, no toca nada. Probada en un Postgres 16
-- local: tres ejecuciones seguidas y con otra ola que ya había añadido su propio kind.
--
-- Mientras no esté aplicada, crear una escena falla con un aviso claro en la interfaz
-- («aún no están activadas») y nada más se rompe.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  r        record;
  valores  text[] := ARRAY[]::text[];
  nombres  text[] := ARRAY[]::text[];
  v        text;
  w        text;
  lista    text;
BEGIN
  -- 1) Qué admiten hoy las restricciones CHECK sobre `kind`.
  FOR r IN
    SELECT c.conname, pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    WHERE c.conrelid = 'public.os_spaces'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ~ '\mkind\M'
  LOOP
    nombres := nombres || r.conname::text;
    FOR v IN SELECT (regexp_matches(r.def, '''([^'']+)''', 'g'))[1] LOOP
      IF left(v, 1) = '{' THEN
        FOREACH w IN ARRAY string_to_array(btrim(v, '{}'), ',') LOOP
          w := btrim(w, ' "');
          IF w <> '' AND NOT (w = ANY (valores)) THEN
            valores := valores || w;
          END IF;
        END LOOP;
      ELSIF NOT (v = ANY (valores)) THEN
        valores := valores || v;
      END IF;
    END LOOP;
  END LOOP;

  -- 2) Si ya admite 'escena', no se toca nada.
  IF 'escena' = ANY (valores) THEN
    RETURN;
  END IF;

  -- 3) Sumar 'escena' (y los tres de siempre, por si no había restricción) y reescribirla.
  FOREACH v IN ARRAY ARRAY['desktop', 'dashboard', 'board', 'escena'] LOOP
    IF NOT (v = ANY (valores)) THEN
      valores := valores || v;
    END IF;
  END LOOP;
  FOREACH v IN ARRAY nombres LOOP
    EXECUTE format('ALTER TABLE public.os_spaces DROP CONSTRAINT %I', v);
  END LOOP;
  SELECT string_agg(quote_literal(x), ', ') INTO lista FROM unnest(valores) AS x;
  EXECUTE format('ALTER TABLE public.os_spaces ADD CONSTRAINT os_spaces_kind_check CHECK (kind IN (%s))', lista);
END
$$;

-- Para añadir otro kind en el futuro: SUMARLO a los existentes con este mismo patrón,
-- nunca reescribir la lista con valores fijos.
