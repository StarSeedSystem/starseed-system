-- PT1008G · Mando para todos · RPC de usuario para registrar y revocar motores
-- Migración ADITIVA. Nadie escribe la tabla: la persona usa estas dos funciones.
-- Seguridad: SECURITY DEFINER con set search_path = public; sin claves, solo nombres.

/* ═══════════════════════════════════════════════════════════════════════════
   A · mando_registrar_motor: alta de un motor propio en un ámbito gestionado
   ═══════════════════════════════════════════════════════════════════════════ */
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
    raise exception 'mando: sesión requerida';
  end if;

  if not public.mando_capacidad(_ambito, 'gestionar-motores') then
    raise exception 'mando: sin capacidad gestionar-motores';
  end if;

  if _tipo not in ('local', 'nube-propia', 'servidor-propio') then
    raise exception 'mando: tipo de motor no válido';
  end if;

  if _token_hash is null or _token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'mando: token_hash no válido';
  end if;

  if _huella is null or _huella <> substring(_token_hash from 1 for 8) then
    raise exception 'mando: huella no válida';
  end if;

  if _nombre is null or length(trim(_nombre)) < 1 or length(_nombre) > 60 then
    raise exception 'mando: nombre no válido';
  end if;

  if _capacidades is null then
    _capacidades := '{}';
  end if;

  if exists (
    select 1 from unnest(_capacidades) as c
    where c not in ('reportar', 'recoger-tareas', 'medidores', 'chat-motor')
  ) then
    raise exception 'mando: capacidad no válida';
  end if;

  insert into public.mando_motores (
    ambito_id, nombre, tipo, token_hash, huella, capacidades, estado, creado_por
  ) values (
    _ambito, trim(_nombre), _tipo, _token_hash, _huella, _capacidades,
    'dormido', auth.uid()
  )
  returning id into _id;

  return _id;
end;
$$;

/* ═══════════════════════════════════════════════════════════════════════════
   B · mando_revocar_motor: apaga un motor sin borrar la fila
   ═══════════════════════════════════════════════════════════════════════════ */
create or replace function public.mando_revocar_motor(_motor uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  _ambito uuid;
  _creador uuid;
begin
  if auth.uid() is null then
    raise exception 'mando: sesión requerida';
  end if;

  select m.ambito_id, m.creado_por
  into _ambito, _creador
  from public.mando_motores m
  where m.id = _motor;

  if not found then
    raise exception 'mando: motor no encontrado';
  end if;

  if not (
    public.mando_capacidad(_ambito, 'gestionar-motores')
    or _creador = auth.uid()
  ) then
    raise exception 'mando: sin permiso para revocar';
  end if;

  update public.mando_motores
  set estado = 'revocado'
  where id = _motor;

  return true;
end;
$$;

/* ═══════════════════════════════════════════════════════════════════════════
   C · Privilegios: solo authenticated ejecuta; nada para anon ni public
   ═══════════════════════════════════════════════════════════════════════════ */
revoke all on function public.mando_registrar_motor(uuid, text, text, text, text, text[]) from public, anon;
grant execute on function public.mando_registrar_motor(uuid, text, text, text, text, text[]) to authenticated;

revoke all on function public.mando_revocar_motor(uuid) from public, anon;
grant execute on function public.mando_revocar_motor(uuid) to authenticated;
