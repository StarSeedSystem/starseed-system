-- ═══════════════════════════════════════════════════════════════════════════
-- L4 · Juegos en vivo y Programas en vivo (2026-09-28)
-- ---------------------------------------------------------------------------
-- Una sala de juego y un programa son filas de `os_spaces` con kind = 'juego' / 'programa'
-- (doc = el registro/diario de jugadas o de acciones, ver `src/lib/vivo/juegos/registro.ts`).
-- Mismo RLS, invitaciones (`os_space_editors`), enlace público (solo lectura) y realtime que
-- pizarras y escritorios: lo ÚNICO que cambia es que la restricción CHECK de `kind` admita
-- 'juego' y 'programa'.
--
-- ⚠️ Componible con otras migraciones que también añadan kinds (p. ej. L5 añade 'escena'): en vez
-- de reescribir la lista con valores fijos (y borrar los que otra ola añadiera), se LEEN los
-- valores que admite hoy la restricción (en cualquiera de sus dos formatos: ARRAY['a'::text, …]
-- o '{a,b}'::text[]) y se les SUMA 'juego' y 'programa'. Idempotente: si ya admite los dos, no
-- toca nada; en cualquier orden con las demás olas el resultado es la unión de todos los kinds.
--
-- Mientras no esté aplicada, el código sigue funcionando: `crearEspacioVivo` cae a
-- kind = 'dashboard' con la marca `doc.vivo.tipo` (ver `src/lib/vivo/juegos/espacio-vivo.ts`) y
-- `listarEspaciosVivos` lee ambas formas. Tras aplicarla, las salas nuevas se crean ya con su kind.
-- Las que se crearon con la marca siguen siendo válidas y no hace falta migrarlas.
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

  -- 2) Si ya admite los dos, no se toca nada.
  IF 'juego' = ANY (valores) AND 'programa' = ANY (valores) THEN
    RETURN;
  END IF;

  -- 3) Sumar 'juego' y 'programa' (y los tres de siempre, por si no había restricción) y reescribirla.
  FOREACH v IN ARRAY ARRAY['desktop', 'dashboard', 'board', 'juego', 'programa'] LOOP
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
