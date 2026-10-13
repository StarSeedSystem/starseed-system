-- Reversión de 20261013010000_os_mesh_relay_entre_cuentas.sql: vuelve a «solo el emisor lee su relevo».
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'os_mesh_relay_caducadas';
  end if;
end;
$$;

drop trigger if exists os_mesh_relay_tope_entre_cuentas on public.os_mesh_relay;
drop function if exists public.os_mesh_relay_tope_entre_cuentas();

drop policy if exists os_mesh_relay_select on public.os_mesh_relay;
create policy os_mesh_relay_select on public.os_mesh_relay for select to authenticated
  using (channel = 'public' or owner_id = auth.uid());
drop policy if exists os_mesh_relay_insert_own on public.os_mesh_relay;
create policy os_mesh_relay_insert_own on public.os_mesh_relay for insert to authenticated
  with check (owner_id = auth.uid());
drop policy if exists os_mesh_relay_update_own on public.os_mesh_relay;
create policy os_mesh_relay_update_own on public.os_mesh_relay for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists os_mesh_relay_delete_own on public.os_mesh_relay;
create policy os_mesh_relay_delete_own on public.os_mesh_relay for delete to authenticated
  using (owner_id = auth.uid());

drop function if exists public.relevo_dirigido_valido(uuid, uuid, text, text, boolean, jsonb);
drop function if exists public.puede_relevar_a(uuid);
drop index if exists public.os_mesh_relay_owner_recipient_owner_idx;
drop index if exists public.os_mesh_relay_recipient_owner_idx;
alter table public.os_mesh_relay drop column if exists recipient_owner;
