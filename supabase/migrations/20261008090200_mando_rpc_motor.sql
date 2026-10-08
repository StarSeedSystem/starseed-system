-- PT1008C · RPC seguras de los motores de Genesis y presupuesto común.
create extension if not exists pgcrypto;

create or replace function public.mando_motor_reportar(p_token text, p_lote jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  _motor public.mando_motores%rowtype;
  _freno boolean;
  _peticiones bigint;
  _tope integer := coalesce(nullif(current_setting('app.mando_tope_diario', true), '')::integer, 20000);
  _cadencia integer := 60;
begin
  if p_token is null or jsonb_typeof(p_lote) is distinct from 'object' then
    return jsonb_build_object('ok', false, 'motivo', 'token_o_lote_invalido');
  end if;
  select m.* into _motor from public.mando_motores m
  where m.token_hash = encode(digest(p_token, 'sha256'), 'hex') for update;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'token_invalido'); end if;
  select freno into _freno from public.mando_ambitos where id=_motor.ambito_id;
  if _motor.estado = 'revocado' then return jsonb_build_object('ok', false, 'motivo', 'revocado'); end if;
  if not ('reportar' = any(_motor.capacidades)) then
    return jsonb_build_object('ok', false, 'motivo', 'sin_capacidad');
  end if;
  if p_lote ? 'medidores' and not ('medidores'=any(_motor.capacidades)) then
    return jsonb_build_object('ok', false, 'motivo', 'sin_capacidad_medidores');
  end if;
  if _freno then return jsonb_build_object('ok', false, 'motivo', 'freno', 'freno', true); end if;
  if octet_length(p_lote::text) > 65536
     or jsonb_typeof(coalesce(p_lote->'eventos', '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_lote->'eventos', '[]'::jsonb)) > 200 then
    return jsonb_build_object('ok', false, 'motivo', 'lote_demasiado_grande');
  end if;
  -- (revisión de la dirección 2026-10-08) mando_medidores.doc admite 32 KB: más que eso
  -- rompía la llamada entera con un error de Postgres en vez de un motivo limpio.
  if p_lote ? 'medidores' and pg_column_size(p_lote->'medidores') > 32768 then
    return jsonb_build_object('ok', false, 'motivo', 'medidores_demasiado_grandes');
  end if;
  if _motor.ultimo_reporte is not null and now() - _motor.ultimo_reporte < interval '30 seconds' then
    return jsonb_build_object('ok', false, 'motivo', 'cadencia', 'cadencia_s', 30);
  end if;

  insert into public.mando_eventos (ambito_id, motor_id, t, tipo, tarea, texto)
  select _motor.ambito_id, _motor.id,
    -- (revisión de la dirección 2026-10-08) una «t» que no es número rompía el lote entero.
    case when e->>'t' ~ '^[0-9]+([.][0-9]+)?$'
      then to_timestamp((e->>'t')::double precision / 1000) else now() end,
    left(e->>'tipo', 80), left(e->>'tarea', 120), left(coalesce(e->>'texto', ''), 4000)
  from jsonb_array_elements(coalesce(p_lote->'eventos', '[]'::jsonb)) e;

  insert into public.mando_tareas
    (ambito_id, tarea_id, ola, titulo, depende, archivos, prompt, estado, avance, updated_at)
  select _motor.ambito_id, t->>'id', t->>'ola', coalesce(nullif(t->>'titulo', ''), t->>'id'),
    array(select jsonb_array_elements_text(case when jsonb_typeof(t->'depende')='array' then t->'depende' else '[]'::jsonb end)),
    array(select jsonb_array_elements_text(case when jsonb_typeof(t->'archivos')='array' then t->'archivos' else '[]'::jsonb end)),
    left(t->>'prompt', 20000), t->>'estado',
    case when t->>'avance' ~ '^-?[0-9]+([.][0-9]+)?$' then (t->>'avance')::numeric end, now()
  from jsonb_array_elements(case when jsonb_typeof(p_lote->'tareas')='array' then p_lote->'tareas' else '[]'::jsonb end) t
  where nullif(t->>'id', '') is not null
  on conflict (ambito_id, tarea_id) do update set ola=excluded.ola, titulo=excluded.titulo,
    depende=excluded.depende, archivos=excluded.archivos, prompt=excluded.prompt,
    estado=coalesce(excluded.estado, mando_tareas.estado), avance=coalesce(excluded.avance, mando_tareas.avance), updated_at=now();

  insert into public.mando_tareas (ambito_id, tarea_id, titulo, estado, avance, updated_at)
  select _motor.ambito_id, p.key, p.key, p.value->>'estado',
    case when p.value->>'avance' ~ '^-?[0-9]+([.][0-9]+)?$' then (p.value->>'avance')::numeric end, now()
  from jsonb_each(case when jsonb_typeof(p_lote->'progreso')='object' then p_lote->'progreso' else '{}'::jsonb end) p
  on conflict (ambito_id, tarea_id) do update set estado=excluded.estado,
    avance=coalesce(excluded.avance, mando_tareas.avance), updated_at=now();

  if p_lote ? 'medidores' then
    insert into public.mando_medidores (ambito_id, motor_id, doc, updated_at)
    values (_motor.ambito_id, _motor.id, p_lote->'medidores', now())
    on conflict (ambito_id, motor_id) do update set doc=excluded.doc, updated_at=now();
  end if;
  update public.mando_motores set ultimo_reporte=now(),
    estado=case when p_lote#>>'{latido,estado}' in ('vivo','dormido','frenado')
      then p_lote#>>'{latido,estado}' else 'vivo' end where id=_motor.id;
  insert into public.mando_presupuesto (dia, ambito_id, peticiones)
  values (current_date, _motor.ambito_id, 1)
  on conflict (dia, ambito_id) do update set peticiones=mando_presupuesto.peticiones + 1;
  select coalesce(sum(peticiones), 0) into _peticiones from public.mando_presupuesto where dia=current_date;
  if _peticiones > _tope * 0.90 then _cadencia := 1800;
  elsif _peticiones > _tope * 0.70 then _cadencia := 600; end if;
  return jsonb_build_object('ok', true, 'cadencia_s', _cadencia, 'freno', false);
end;
$$;

create or replace function public.mando_motor_pendiente(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  _motor public.mando_motores%rowtype;
  _freno boolean;
begin
  if p_token is null then return jsonb_build_object('ok', false, 'motivo', 'token_invalido'); end if;
  select m.* into _motor from public.mando_motores m
  where m.token_hash=encode(digest(p_token, 'sha256'), 'hex');
  if not found then return jsonb_build_object('ok', false, 'motivo', 'token_invalido'); end if;
  select freno into _freno from public.mando_ambitos where id=_motor.ambito_id;
  if _motor.estado='revocado' then return jsonb_build_object('ok', false, 'motivo', 'revocado'); end if;
  if not ('recoger-tareas'=any(_motor.capacidades)) then
    return jsonb_build_object('ok', false, 'motivo', 'sin_capacidad');
  end if;
  if _freno then return jsonb_build_object('ok', false, 'motivo', 'freno', 'freno', true, 'tareas', '[]'::jsonb); end if;
  insert into public.mando_presupuesto (dia, ambito_id, peticiones) values (current_date, _motor.ambito_id, 1)
  on conflict (dia, ambito_id) do update set peticiones=mando_presupuesto.peticiones + 1;
  return jsonb_build_object('ok', true, 'freno', false, 'tareas', coalesce((select jsonb_agg(to_jsonb(t)-'ambito_id')
    from (select * from public.mando_tareas where ambito_id=_motor.ambito_id and estado='pendiente'
      order by updated_at, tarea_id limit 50) t), '[]'::jsonb));
end;
$$;

revoke all on function public.mando_motor_reportar(text, jsonb) from public, anon;
revoke all on function public.mando_motor_pendiente(text) from public, anon;
grant execute on function public.mando_motor_reportar(text, jsonb) to authenticated, anon;
grant execute on function public.mando_motor_pendiente(text) to authenticated, anon;
