-- ════════════════════════════════════════════════════════════════════════════
-- Contrato «consumo» (2026-09-29) · la ventana del faro FRESCO pasa de 4 a 30 min.
-- ----------------------------------------------------------------------------
-- El faro de cada neurona (`os_mesh_relay`, kind='beacon') se renovaba cada 40 s; ahora se
-- renueva cada 20 min, solo en la pestaña líder y con el dispositivo a la vista
-- (src/ai/astraura/mesh/synaptic.ts, `FAROS_CADA_MS`). El radar del cliente considera fresco un
-- faro de menos de 30 min (`BEACON_FRESH_MS` en server-relay.ts) y el faro caduca a los 35.
--
-- `solicitar_vinculo` resolvía el dueño del destino con un faro de menos de 4 min: con la nueva
-- cadencia casi nunca lo habría y «Solicitar vínculo» fallaría con «sin faro reciente». Aquí se
-- redefine con la MISMA ventana de 30 min que el cliente. Todo lo demás de la función es
-- idéntico a `20260926190000_os_mesh_vinculos.sql` (anti-flood, un vínculo vivo por par,
-- sal aleatoria, SECURITY DEFINER con search_path fijo).
--
-- IDEMPOTENTE (create or replace + los mismos permisos). Aplicar DESPUÉS de
-- 20260926190000_os_mesh_vinculos.sql. Mientras no se aplique, el cliente sigue funcionando y
-- la solicitud a una neurona cuyo faro tenga más de 4 min devuelve el aviso en español de siempre.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.solicitar_vinculo(
  p_a_device text,
  p_de_device text,
  p_mensaje text default null,
  p_permisos jsonb default '{}'::jsonb,
  p_de_pub jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_de_owner uuid := auth.uid();
  v_a_owner  uuid;
  v_id       uuid;
  v_recent   int;
  v_sal      text;
begin
  if v_de_owner is null then
    raise exception 'solicitar_vinculo: se requiere sesión';
  end if;
  if p_a_device is null or p_a_device = '' or p_de_device is null or p_de_device = '' then
    raise exception 'solicitar_vinculo: faltan identificadores de dispositivo';
  end if;
  if p_mensaje is not null and char_length(p_mensaje) > 280 then
    raise exception 'solicitar_vinculo: mensaje demasiado largo (máx. 280)';
  end if;

  -- Anti-flood por DISPOSITIVO emisor (no por cuenta: una cuenta con varias
  -- neuronas no debe compartir el mismo tope). Generoso a propósito, como el
  -- resto de topes de este repo: no estorba el uso normal, solo corta bucles.
  select count(*) into v_recent
    from public.os_mesh_vinculos
   where de_owner = v_de_owner and de_device = p_de_device
     and created_at > now() - interval '1 hour';
  if v_recent >= 10 then
    raise exception 'solicitar_vinculo: demasiadas solicitudes desde este dispositivo en la última hora';
  end if;

  -- Resuelve el faro FRESCO (misma ventana que BEACON_FRESH_MS de
  -- server-relay.ts, 30 min desde el 2026-09-29) cuyo `sid` (syncDeviceId)
  -- coincide con el destino. El cliente nunca lee `owner_id`: lo resuelve el servidor.
  select owner_id into v_a_owner
    from public.os_mesh_relay
   where kind = 'beacon'
     and payload ->> 'sid' = p_a_device
     and created_at > now() - interval '30 minutes'
   order by created_at desc
   limit 1;

  if v_a_owner is null then
    raise exception 'solicitar_vinculo: neurona no encontrada o desconectada (sin faro reciente)';
  end if;
  if v_a_owner = v_de_owner then
    raise exception 'solicitar_vinculo: no puedes vincularte contigo mismo (misma cuenta)';
  end if;

  if exists (
    select 1 from public.os_mesh_vinculos
     where de_owner = v_de_owner and a_owner = v_a_owner
       and de_device = p_de_device and a_device = p_a_device
       and estado in ('pendiente', 'aceptado')
  ) then
    raise exception 'solicitar_vinculo: ya existe un vínculo pendiente o activo con esa neurona';
  end if;

  -- gen_random_uuid() es del núcleo de Postgres (no depende de pgcrypto en el esquema
  -- extensions, que el search_path fijado de esta función no incluye).
  v_sal := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into public.os_mesh_vinculos (
    de_owner, de_device, a_owner, a_device, mensaje, permisos_solicitados, sal, de_pub
  ) values (
    v_de_owner, p_de_device, v_a_owner, p_a_device, p_mensaje,
    coalesce(p_permisos, '{}'::jsonb), v_sal, p_de_pub
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke execute on function public.solicitar_vinculo(text, text, text, jsonb, jsonb) from public;
revoke execute on function public.solicitar_vinculo(text, text, text, jsonb, jsonb) from anon;
grant execute on function public.solicitar_vinculo(text, text, text, jsonb, jsonb) to authenticated;
