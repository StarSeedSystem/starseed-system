-- ════════════════════════════════════════════════════════════════════════════
-- Relevo privado ENTRE CUENTAS por os_mesh_relay (2026-10-13 · palabra de Alex)
-- Contrato: architecture/malla-cristalina-sio2.md §10 y §3.
--
-- QUÉ: hasta hoy una fila de relevo (channel 'relay') solo la leía quien la subió
-- (owner_id = auth.uid()), así que un mensaje privado para alguien de OTRA cuenta no
-- llegaba nunca por el servidor cuando no había camino directo P2P. Ahora:
--   · columna `recipient_owner`: la cuenta destinataria de esa fila;
--   · el destinatario la LEE (y la puede retirar al leerla), nadie más;
--   · solo se puede dirigir a otra cuenta si hay una relación que ambos tienen:
--     vínculo de malla ACEPTADO, conversación (DM) en común o grupo en común
--     (`puede_relevar_a`) — así nadie llena el buzón de un desconocido;
--   · la fila tiene que ir cifrada POR DESTINATARIO (sobre v:3: ECDH→HKDF→AES‑GCM):
--     el servidor solo transporta texto cifrado que únicamente abre el destinatario;
--   · tope de 600 filas por hora de una cuenta a otra (protege la cuota de Supabase);
--   · las filas caducadas se borran solas cada hora (pg_cron): son relevo de paso.
-- Idempotente. Reversión: 20261013010000_os_mesh_relay_entre_cuentas_rollback.sql
-- ════════════════════════════════════════════════════════════════════════════

alter table public.os_mesh_relay
  add column if not exists recipient_owner uuid references auth.users(id) on delete cascade;

create index if not exists os_mesh_relay_recipient_owner_idx
  on public.os_mesh_relay (recipient_owner, channel, created_at desc)
  where recipient_owner is not null;

create index if not exists os_mesh_relay_owner_recipient_owner_idx
  on public.os_mesh_relay (owner_id, recipient_owner, created_at desc)
  where recipient_owner is not null;

-- ¿Puede la sesión actual dejarle relevo a la cuenta p_destino?
create or replace function public.puede_relevar_a(p_destino uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and p_destino is not null
     and (
          p_destino = auth.uid()
       or exists (
            select 1 from public.os_mesh_vinculos v
             where v.estado = 'aceptado'
               and ((v.de_owner = auth.uid() and v.a_owner = p_destino)
                 or (v.a_owner = auth.uid() and v.de_owner = p_destino)))
       or exists (
            select 1 from public.os_dm_members a
              join public.os_dm_members b on b.thread_id = a.thread_id
             where a.user_id = auth.uid() and b.user_id = p_destino)
       or exists (
            select 1 from public.os_memberships a
              join public.os_memberships b on b.group_slug = a.group_slug
             where a.user_id = auth.uid() and b.user_id = p_destino)
     );
$$;

revoke all on function public.puede_relevar_a(uuid) from public;
grant execute on function public.puede_relevar_a(uuid) to authenticated;

-- Una fila dirigida a OTRA cuenta solo es válida si es relevo de datos, cifrado por
-- destinatario (v:3) y con una relación que lo permita.
create or replace function public.relevo_dirigido_valido(
  p_owner uuid, p_destino uuid, p_channel text, p_kind text, p_enc boolean, p_payload jsonb)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_destino is null
      or p_destino = p_owner
      or (p_channel = 'relay'
          and p_kind = 'data'
          and p_enc = true
          and coalesce(p_payload->>'v', '') = '3'
          and public.puede_relevar_a(p_destino));
$$;

revoke all on function public.relevo_dirigido_valido(uuid, uuid, text, text, boolean, jsonb) from public;
grant execute on function public.relevo_dirigido_valido(uuid, uuid, text, text, boolean, jsonb) to authenticated;

drop policy if exists os_mesh_relay_select on public.os_mesh_relay;
create policy os_mesh_relay_select
  on public.os_mesh_relay for select
  to authenticated
  using (
    channel = 'public'
    or owner_id = auth.uid()
    or (channel = 'relay' and kind = 'data' and recipient_owner = auth.uid())
  );

drop policy if exists os_mesh_relay_insert_own on public.os_mesh_relay;
create policy os_mesh_relay_insert_own
  on public.os_mesh_relay for insert
  to authenticated
  with check (
    owner_id = auth.uid()
    and public.relevo_dirigido_valido(owner_id, recipient_owner, channel, kind, enc, payload)
  );

drop policy if exists os_mesh_relay_update_own on public.os_mesh_relay;
create policy os_mesh_relay_update_own
  on public.os_mesh_relay for update
  to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and public.relevo_dirigido_valido(owner_id, recipient_owner, channel, kind, enc, payload)
  );

-- El destinatario puede retirar del buzón lo que ya leyó (el emisor, lo suyo, como siempre).
drop policy if exists os_mesh_relay_delete_own on public.os_mesh_relay;
create policy os_mesh_relay_delete_own
  on public.os_mesh_relay for delete
  to authenticated
  using (
    owner_id = auth.uid()
    or (channel = 'relay' and kind = 'data' and recipient_owner = auth.uid())
  );

-- Tope por hora de una cuenta a otra (anti-inundación en el servidor, además del cliente).
create or replace function public.os_mesh_relay_tope_entre_cuentas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  if new.recipient_owner is not null and new.recipient_owner <> new.owner_id then
    select count(*) into v_n
      from public.os_mesh_relay
     where owner_id = new.owner_id
       and recipient_owner = new.recipient_owner
       and created_at > now() - interval '1 hour';
    if v_n >= 600 then
      raise exception 'relevo entre cuentas: tope de 600 por hora hacia esa cuenta'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists os_mesh_relay_tope_entre_cuentas on public.os_mesh_relay;
create trigger os_mesh_relay_tope_entre_cuentas
  before insert on public.os_mesh_relay
  for each row execute function public.os_mesh_relay_tope_entre_cuentas();

-- Limpieza de relevo caducado (cada hora, al minuto 17). Solo filas ya vencidas.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'os_mesh_relay_caducadas';
    perform cron.schedule(
      'os_mesh_relay_caducadas',
      '17 * * * *',
      $q$delete from public.os_mesh_relay where expires_at is not null and expires_at < now() - interval '1 hour'$q$
    );
  end if;
end;
$$;
