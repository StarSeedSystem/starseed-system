-- Mando motores usuario 2026-10-08 (aditiva, ola 1008P · PT1008G)
-- RPC para registrar y revocar motores desde la sesión del usuario:
-- nadie toca la tabla mando_motores directamente (sigue cerrada a anon y authenticated).

-- (a) Registrar un motor propio en un ámbito donde tienes 'gestionar-motores'.
-- Devuelve el id del motor nuevo; nace en estado 'dormido'.
create or replace function public.mando_registrar_motor(
  _ambito uuid,
  _nombre text,
  _tipo text,
  _token_hash text,
  _huella text,
  _capacidades text[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _id uuid;
begin
  if auth.uid() is null then
    raise exception 'sesion requerida';
  end if;
  if not public.mando_capacidad(_ambito, 'gestionar-motores') then
    raise exception 'sin capacidad gestionar-motores en este ambito';
  end if;
  if _tipo not in ('local', 'nube-propia', 'servidor-propio') then
    raise exception 'tipo de motor no valido';
  end if;
  if _token_hash is null or _token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'token_hash no valido';
  end if;
  if _huella is null or _huella <> substring(_token_hash from 1 for 8) then
    raise exception 'huella no valida';
  end if;
  if _nombre is null or char_length(btrim(_nombre)) not between 1 and 60 then
    raise exception 'nombre no valido';
  end if;
  if _capacidades is null then
    _capacidades := '{}';
  end if;
  if exists (
    select 1
    from unnest(_capacidades) as cap
    where cap not in ('reportar', 'recoger-tareas', 'medidores', 'chat-motor')
  ) then
    raise exception 'capacidad no valida';
  end if;

  insert into public.mando_motores
    (ambito_id, nombre, tipo, token_hash, huella, capacidades, estado, creado_por)
  values
    (_ambito, btrim(_nombre), _tipo, _token_hash, _huella, _capacidades, 'dormido', auth.uid())
  returning id into _id;
  return _id;
end;
$$;

-- (b) Revocar un motor: exige 'gestionar-motores' en su ámbito o ser quien lo registró.
-- Nunca borra la fila: solo pone estado = 'revocado'. Devuelve si se revocó algo.
create or replace function public.mando_revocar_motor(_motor uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  _ambito uuid;
  _autor uuid;
begin
  if auth.uid() is null then
    raise exception 'sesion requerida';
  end if;
  select ambito_id, creado_por into _ambito, _autor
  from public.mando_motores
  where id = _motor;
  if not found then
    raise exception 'motor no encontrado';
  end if;
  if auth.uid() is distinct from _autor
     and not public.mando_capacidad(_ambito, 'gestionar-motores') then
    raise exception 'sin permiso para revocar este motor';
  end if;
  update public.mando_motores
  set estado = 'revocado'
  where id = _motor and estado <> 'revocado';
  return found;
end;
$$;

-- (c) Solo cuentas con sesión; jamás anon ni public.
revoke all on function public.mando_registrar_motor(uuid, text, text, text, text, text[]) from public, anon;
revoke all on function public.mando_revocar_motor(uuid) from public, anon;
grant execute on function public.mando_registrar_motor(uuid, text, text, text, text, text[]) to authenticated;
grant execute on function public.mando_revocar_motor(uuid) to authenticated;
