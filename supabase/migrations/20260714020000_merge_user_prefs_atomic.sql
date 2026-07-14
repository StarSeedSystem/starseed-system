-- ═══════════════════════════════════════════════════════════════════════════
-- Adenda 69 · A — `merge_user_prefs()`: escritura ATÓMICA y NO DESTRUCTIVA
-- de `user_settings.prefs`.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- CAUSA RAÍZ que arregla (observada en vivo el 2026-07-13 contra producción):
--
--   `user_settings.prefs` es UNA sola columna jsonb compartida por ~12 módulos
--   del OS (realtime-sync, desktops, biblioteca, dashboards, agentes,
--   conectores, correo, señalización, registro de dispositivos, servicios OSS…).
--   TODOS escribían con el patrón LEER → MUTAR EN CLIENTE → UPSERT de la
--   columna ENTERA. Como `prefs` se reemplaza por completo en cada upsert, dos
--   módulos que arrancan a la vez (que es lo normal al cargar la página) hacen
--   un LOST UPDATE clásico: el que escribe el último borra TODO lo que los
--   demás hubieran escrito después de su propia lectura.
--
--   Medido en producción sobre la cuenta 8be339d0…: `prefs` pasó de 16 claves
--   a 4 (`agents`, `dashboards`, `agentsPublic`, `agentBindings`) en segundos.
--   Se perdieron `__meta` (marcas LWW), `capabilities`, `library`, `installed`,
--   los `starseed.brain.*` y TODAS las claves de Aurora/Astraura que
--   realtime-sync acababa de subir correctamente. Por eso la personalidad de
--   Aurora "solo se guardaba en el dispositivo donde se configura": SÍ subía a
--   la cuenta, pero otro módulo la ANIQUILABA segundos después, así que el
--   segundo dispositivo nunca llegaba a verla.
--
-- SOLUCIÓN: una única sentencia atómica en el servidor que MEZCLA en vez de
-- reemplazar. El cliente ya no manda nunca la columna entera: manda solo su
-- parche (`p_patch`) y Postgres lo funde sobre lo que ya hubiera, con la fila
-- bloqueada. Se acabaron los lost updates entre módulos y entre dispositivos.
--
--   · Claves de primer nivel  → mezcla superficial (`||`). Cada módulo es dueño
--     de sus claves y no puede pisar las de otro.
--   · `__meta` (marcas LWW de realtime-sync) → mezcla PROFUNDA de un nivel: es
--     un sub-objeto compartido por todos, y una mezcla superficial lo
--     reemplazaría entero, volviendo a perder marcas de otras claves.
--
-- Borrado explícito de claves: un valor `null` dentro del parche ELIMINA esa
-- clave (semántica de patch, necesaria p. ej. al desinstalar una integración).
--
-- Seguridad: `security invoker` ⇒ la RLS de `user_settings` ("own settings":
-- auth.uid() = user_id) sigue mandando. Además se fija `user_id := auth.uid()`
-- dentro de la función: un usuario NO puede tocar la fila de otro ni pasándole
-- otro id, porque el id ni siquiera se acepta como parámetro.

create or replace function public.merge_user_prefs(p_patch jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_old  jsonb;
  v_new  jsonb;
  v_meta jsonb;
  v_key  text;
begin
  if v_uid is null then
    raise exception 'merge_user_prefs: no hay sesión (auth.uid() es null)'
      using errcode = '28000';
  end if;

  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'merge_user_prefs: p_patch debe ser un objeto JSON'
      using errcode = '22023';
  end if;

  -- Asegura la fila y la BLOQUEA: a partir de aquí la mezcla es atómica.
  insert into public.user_settings (user_id, prefs, updated_at)
  values (v_uid, '{}'::jsonb, now())
  on conflict (user_id) do nothing;

  select coalesce(prefs, '{}'::jsonb)
    into v_old
    from public.user_settings
   where user_id = v_uid
     for update;

  v_old := coalesce(v_old, '{}'::jsonb);

  -- 1) Mezcla superficial de las claves de primer nivel (sin tocar `__meta`).
  v_new := v_old || (p_patch - '__meta');

  -- 2) Mezcla PROFUNDA del sub-objeto reservado `__meta` (marcas LWW por clave).
  if (v_old ? '__meta') or (p_patch ? '__meta') then
    v_meta := coalesce(v_old -> '__meta', '{}'::jsonb)
              || coalesce(p_patch -> '__meta', '{}'::jsonb);
    v_new := v_new || jsonb_build_object('__meta', v_meta);
  end if;

  -- 3) Semántica de patch: un `null` explícito BORRA la clave.
  for v_key in select jsonb_object_keys(p_patch)
  loop
    if jsonb_typeof(p_patch -> v_key) = 'null' then
      v_new := v_new - v_key;
    end if;
  end loop;

  update public.user_settings
     set prefs = v_new,
         updated_at = now()
   where user_id = v_uid;

  return v_new;
end;
$$;

comment on function public.merge_user_prefs(jsonb) is
  'Mezcla ATÓMICA de un parche en user_settings.prefs (Adenda 69). Sustituye al patrón leer-mutar-upsert del cliente, que causaba lost updates entre los ~12 módulos que comparten esta columna. Mezcla superficial en el primer nivel + mezcla profunda de __meta. Un valor null borra la clave. security invoker: la RLS sigue mandando y el user_id se toma de auth.uid().';

revoke all on function public.merge_user_prefs(jsonb) from public;
grant execute on function public.merge_user_prefs(jsonb) to authenticated;
