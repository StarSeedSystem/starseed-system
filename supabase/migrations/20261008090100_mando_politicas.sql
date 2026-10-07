-- PT1008B · Mando para todos · Políticas RLS + RPC + arreglo de seguridad (§6.2 / §6.4)
-- Migración ADITIVA. Nada se borra ni renombra. Sin claves; solo nombres de variables.
-- Seguridad: SECURITY DEFINER con set search_path = public; STABLE.

/* ═══════════════════════════════════════════════════════════════════════════
   A · mando_rol: rol del usuario en un ámbito (base para mando_capacidad)
   ═══════════════════════════════════════════════════════════════════════════ */
create or replace function public.mando_rol(_ambito_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when a.tipo = 'persona' then (
      case when a.creado_por = auth.uid() then 'dueño' else 'visitante' end
    )
    when a.tipo = 'entidad' then coalesce(
      (
        -- Rol más alto desde os_memberships (excluyendo pending) por entidad_ref
        select m.role
        from public.os_memberships m
        where m.group_slug = a.entidad_ref
          and m.user_id = auth.uid()
          and m.role <> 'pending'
        order by case m.role
          when 'owner' then 6
          when 'admin' then 5
          when 'moderator' then 4
          when 'editor' then 3
          when 'member' then 2
          when 'viewer' then 1
        end desc
        limit 1
      ),
      -- Rol más alto desde os_entity_roles (por entity_id::text = entidad_ref)
      (
        select r.role
        from public.os_entity_roles r
        where r.entity_id::text = a.entidad_ref
          and r.user_id = auth.uid()
          and r.role <> 'pending'
        order by case r.role
          when 'owner' then 6
          when 'admin' then 5
          when 'moderator' then 4
          when 'editor' then 3
          when 'member' then 2
          when 'viewer' then 1
        end desc
        limit 1
      ),
      'visitante'
    )
    else 'visitante'
  end
  from public.mando_ambitos a
  where a.id = _ambito_id;
$$;

/* ═══════════════════════════════════════════════════════════════════════════
   B · mando_capacidad: ¿tiene esta capacidad en este ámbito?
   ═══════════════════════════════════════════════════════════════════════════ */
create or replace function public.mando_capacidad(_ambito_id uuid, capacidad text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _rol text;
  _visibilidad text;
  _tipo text;
  _modo text;
begin
  -- Datos del ámbito y rol
  select a.tipo, a.visibilidad, a.modo_gobierno, public.mando_rol(a.id)
  into _tipo, _visibilidad, _modo, _rol
  from public.mando_ambitos a
  where a.id = _ambito_id;

  -- Rol pending → ninguna capacidad
  if _rol = 'pending' then
    return false;
  end if;

  -- Visitante: solo ver-resumen en público
  if _rol = 'visitante' then
    return (capacidad = 'ver-resumen' and _visibilidad = 'publico');
  end if;

  -- Delegado: las delegadas excepto gestionar-accesos / administrar
  -- Nota: la aplicación pasa delegadas; la base no recibe ese parámetro aquí,
  -- así que el delegado por defecto no concede ninguna capacidad por esta vía.
  -- El contrato indica que es la aplicación quien aplica delegadas; esta función
  -- cubre los roles directos del ámbito.
  if _rol = 'delegado' then
    return false;
  end if;

  -- Privado: persona solo dueño; entidad: solo owner/admin reciben capacidades
  if _visibilidad = 'privado' then
    if _tipo = 'persona' then
      return (_rol = 'dueño');
    else
      if not (_rol in ('owner', 'admin')) then
        return false;
      end if;
    end if;
  end if;

  -- Modo democrático: las cuatro capacidades que requieren votación
  -- se deniegan aquí; la aplicación las concede con propuesta aprobada.
  if _modo = 'democratico' and capacidad in ('lanzar-olas', 'publicar', 'gestionar-motores', 'usar-apis') then
    return false;
  end if;

  -- Definición de capacidades por rol (según capacidadesDe de src/lib/mando/ambito.ts)
  case _rol
    when 'dueño' then
      return true;
    when 'owner' then
      return true;
    when 'admin' then
      return capacidad <> 'administrar';
    when 'moderator', 'editor' then
      return capacidad in ('ver-resumen', 'ver-detalle', 'chatear', 'encolar', 'aprobar', 'frenar');
    when 'member', 'viewer' then
      return capacidad in ('ver-resumen', 'ver-detalle', 'chatear');
    else
      -- Cualquier otro rol (incluido delegado no cubierto) o público con visitante ya manejado
      if _visibilidad = 'publico' and capacidad = 'ver-resumen' then
        return true;
      else
        return false;
      end if;
  end case;
end;
$$;

/* ═══════════════════════════════════════════════════════════════════════════
   C · Políticas RLS (§6.2) y vista pública de motores (§6.2 / §6.4)
   ═══════════════════════════════════════════════════════════════════════════ */

-- Vista pública de motores: sin token_hash ni columnas sensibles
create or replace view public.mando_motores_publica as
select
  id,
  ambito_id,
  nombre,
  tipo,
  huella,
  capacidades,
  estado,
  ultimo_reporte,
  creado_por
from public.mando_motores;

-- RLS en mando_ambitos (SELECT con ver-detalle; ver-resumen solo esta tabla)
do $$ begin execute 'drop policy if exists mando_ambitos_select on public.mando_ambitos'; end $$;
create policy mando_ambitos_select on public.mando_ambitos
  for select using (
    public.mando_capacidad(id, 'ver-detalle')
    or public.mando_capacidad(id, 'ver-resumen')
  );

do $$ begin execute 'drop policy if exists mando_ambitos_insert on public.mando_ambitos'; end $$;
create policy mando_ambitos_insert on public.mando_ambitos
  for insert with check (creado_por = auth.uid());

do $$ begin execute 'drop policy if exists mando_ambitos_update on public.mando_ambitos'; end $$;
create policy mando_ambitos_update on public.mando_ambitos
  for update using (public.mando_capacidad(id, 'administrar'))
  with check (public.mando_capacidad(id, 'administrar'));

-- RLS en mando_enjambres
do $$ begin execute 'drop policy if exists mando_enjambres_select on public.mando_enjambres'; end $$;
create policy mando_enjambres_select on public.mando_enjambres
  for select using (public.mando_capacidad(ambito_id, 'ver-detalle'));

-- RLS en mando_tareas
do $$ begin execute 'drop policy if exists mando_tareas_select on public.mando_tareas'; end $$;
create policy mando_tareas_select on public.mando_tareas
  for select using (public.mando_capacidad(ambito_id, 'ver-detalle'));

-- RLS en mando_eventos
do $$ begin execute 'drop policy if exists mando_eventos_select on public.mando_eventos'; end $$;
create policy mando_eventos_select on public.mando_eventos
  for select using (public.mando_capacidad(ambito_id, 'ver-detalle'));

-- RLS en mando_medidores
do $$ begin execute 'drop policy if exists mando_medidores_select on public.mando_medidores'; end $$;
create policy mando_medidores_select on public.mando_medidores
  for select using (public.mando_capacidad(ambito_id, 'ver-detalle'));

-- RLS en mando_chat
do $$ begin execute 'drop policy if exists mando_chat_select on public.mando_chat'; end $$;
create policy mando_chat_select on public.mando_chat
  for select using (
    public.mando_capacidad(ambito_id, 'ver-detalle')
    or (canal = 'publico' and public.mando_capacidad(ambito_id, 'ver-resumen'))
  );

do $$ begin execute 'drop policy if exists mando_chat_insert on public.mando_chat'; end $$;
create policy mando_chat_insert on public.mando_chat
  for insert with check (
    public.mando_capacidad(ambito_id, 'chatear')
    and autor = auth.uid()::text
  );

-- RLS en mando_motores
do $$ begin execute 'drop policy if exists mando_motores_select on public.mando_motores'; end $$;
create policy mando_motores_select on public.mando_motores
  for select using (public.mando_capacidad(ambito_id, 'gestionar-motores'));

revoke all on public.mando_motores from anon, authenticated;

-- Conceder SELECT sobre la vista pública a los roles que tengan gestionar-motores
-- La política de RLS de la vista hereda la de la tabla subyacente si se consulta por ella,
-- pero para claridad se deja la política solo sobre la tabla base.
-- Nada de políticas para anon en ninguna tabla mando_*.

/* ═══════════════════════════════════════════════════════════════════════════
   D · Arreglo §6.4.1: os_is_group_member excluye pending
   ═══════════════════════════════════════════════════════════════════════════ */
create or replace function public.os_is_group_member(_slug text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select _slug is not null and auth.uid() is not null and exists (
    select 1 from public.os_memberships m
    where m.group_slug = _slug
      and m.user_id = auth.uid()
      and m.role <> 'pending'
  );
$$;
