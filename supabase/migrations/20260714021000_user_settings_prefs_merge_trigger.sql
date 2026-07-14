-- ═══════════════════════════════════════════════════════════════════════════
-- Adenda 69 · B — Blindaje de `user_settings.prefs`: NADIE puede volver a
-- borrar las claves de otro módulo, escriba por donde escriba.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- La migración hermana (…_merge_user_prefs_atomic.sql) da la puerta BUENA
-- (`merge_user_prefs()`), y el cliente ya la usa. Pero `prefs` sigue siendo una
-- columna pública que cualquier módulo (presente o futuro) puede sobrescribir
-- entera con un `upsert` normal. Confiar en que 12 módulos —y los que vengan—
-- se acuerden de usar la puerta buena es exactamente el fallo que nos ha traído
-- hasta aquí. Así que se arregla en el ÚNICO sitio por el que pasan TODOS: la
-- propia tabla.
--
-- Este trigger convierte cualquier escritura de `prefs` en una MEZCLA en vez de
-- un REEMPLAZO:
--
--     NEW.prefs := OLD.prefs || NEW.prefs      (+ mezcla profunda de __meta)
--
-- Efecto: el patrón antiguo leer-mutar-upsert deja de ser destructivo aunque el
-- módulo no se haya migrado. Un módulo que escribe {agents:…} ya NO borra
-- {starseed.aurora.personalities.v1:…}: solo actualiza SUS claves. Cada módulo
-- es dueño de las suyas y no puede tocar las ajenas ni por accidente.
--
-- Borrado explícito de una clave: valor `null` dentro del parche (misma
-- semántica que `merge_user_prefs`).
--
-- Escotilla de emergencia (reemplazo total deliberado, p. ej. "restablecer
-- ajustes de fábrica"):
--     set local starseed.prefs_replace = 'on';
--     update user_settings set prefs = '{…}' where user_id = auth.uid();
--
-- Nota: no sustituye a `merge_user_prefs()` — esa sigue siendo la vía correcta
-- (atómica, sin round-trip de lectura, y sin mandar la columna entera por la
-- red). El trigger es la RED DE SEGURIDAD que hace imposible el fallo.

create or replace function public.user_settings_merge_prefs()
returns trigger
language plpgsql
as $$
declare
  v_old  jsonb;
  v_new  jsonb;
  v_meta jsonb;
  v_key  text;
begin
  -- Escotilla: reemplazo total deliberado.
  if coalesce(current_setting('starseed.prefs_replace', true), 'off') = 'on' then
    return new;
  end if;

  if new.prefs is null or jsonb_typeof(new.prefs) <> 'object' then
    return new;  -- nada que mezclar (o valor no-objeto: se deja pasar tal cual)
  end if;

  if tg_op = 'INSERT' then
    v_old := '{}'::jsonb;
  else
    v_old := coalesce(old.prefs, '{}'::jsonb);
    if jsonb_typeof(v_old) <> 'object' then
      v_old := '{}'::jsonb;
    end if;
  end if;

  -- 1) Mezcla superficial del primer nivel (sin tocar `__meta`).
  v_new := v_old || (new.prefs - '__meta');

  -- 2) Mezcla PROFUNDA de `__meta` (marcas LWW compartidas por todas las claves:
  --    una mezcla superficial lo reemplazaría entero y perdería las de los demás).
  if (v_old ? '__meta') or (new.prefs ? '__meta') then
    v_meta := coalesce(v_old -> '__meta', '{}'::jsonb)
              || coalesce(new.prefs -> '__meta', '{}'::jsonb);
    v_new := v_new || jsonb_build_object('__meta', v_meta);
  end if;

  -- 3) Semántica de patch: un `null` explícito BORRA la clave.
  for v_key in select jsonb_object_keys(new.prefs)
  loop
    if jsonb_typeof(new.prefs -> v_key) = 'null' then
      v_new := v_new - v_key;
    end if;
  end loop;

  new.prefs := v_new;
  return new;
end;
$$;

comment on function public.user_settings_merge_prefs() is
  'Trigger de blindaje (Adenda 69): toda escritura de user_settings.prefs se MEZCLA sobre lo existente en vez de reemplazarlo. Neutraliza el lost update del patrón leer-mutar-upsert que compartían ~12 módulos y que borraba las claves de Aurora/Astraura segundos después de subirlas. `null` borra la clave; `set local starseed.prefs_replace = ''on''` permite el reemplazo total deliberado.';

drop trigger if exists trg_user_settings_merge_prefs on public.user_settings;

create trigger trg_user_settings_merge_prefs
    before insert or update of prefs on public.user_settings
    for each row
    execute function public.user_settings_merge_prefs();
