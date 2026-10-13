-- Cerebros: lectura compartida, identidad de réplica y un solo cerebro por defecto por cuenta.
-- Contrato: architecture/cerebros-fusion-telepatia.md §9 (a, b y c).
-- Aprobada por Alex el 2026-10-13 («apruebo todo»). Idempotente: se puede volver a correr.

-- ── a) Lectura compartida de cerebros ─────────────────────────────────────────────────────────
-- Hasta hoy, RLS solo dejaba leer un cerebro a su dueño (`br_owner`, `brain_memory_files_owner_all`).
-- Con esto, también lo leen:
--   1. quien tenga acceso al espacio de «permisos universales» con que el DUEÑO compartió ese cerebro
--      (`os_spaces` con doc.sharing.resource = {type: 'brain', id}); las mismas reglas que `sp_select`.
--   2. los miembros de su grupo, comunidad o página, si es un cerebro público (`scope` group,
--      community o page) y su dueño es dueño o gestor (rango ≥ 2) de esa entidad. Sin esa condición,
--      cualquiera podría colgar un cerebro en un grupo ajeno.
-- Solo LECTURA: escribir sigue siendo cosa del dueño.
create or replace function public.cerebro_compartido_conmigo(p_brain_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
    v_owner uuid;
    v_scope text;
    v_ref text;
    v_ent uuid;
    v_slug text;
    v_rango_dueno int;
begin
    if v_uid is null or p_brain_id is null then
        return false;
    end if;
    select b.owner, lower(coalesce(b.scope, '')), b.scope_ref into v_owner, v_scope, v_ref
      from public.brains b where b.id = p_brain_id;
    if v_owner is null then
        return false;
    end if;
    if v_owner = v_uid then
        return true;
    end if;

    -- 1) Compartido por su dueño con permisos universales.
    if exists (
        select 1 from public.os_spaces s
         where s.owner_account = v_owner
           and s.doc -> 'sharing' -> 'resource' ->> 'type' = 'brain'
           and s.doc -> 'sharing' -> 'resource' ->> 'id' = p_brain_id::text
           and (s.access = 'public'
                or public.os_is_group_member(s.group_slug)
                or public.os_owns_profile(s.allowed_profiles)
                or public.space_editor_status(s.id, v_uid) = any (array['member', 'invited']))
    ) then
        return true;
    end if;

    -- 2) Cerebro público de una entidad: sus miembros, si el dueño la gestiona.
    if v_scope in ('group', 'community', 'page')
       and v_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        v_ent := v_ref::uuid;
        select coalesce(max(public.access_role_rank(r.role)), 0) into v_rango_dueno
          from public.os_entity_roles r where r.entity_id = v_ent and r.account_id = v_owner;
        if not (public.entity_owner_account(v_ent) = v_owner or v_rango_dueno >= 2) then
            return false;
        end if;
        if public.entity_owner_account(v_ent) = v_uid or public.my_entity_role_rank(v_ent) >= 1 then
            return true;
        end if;
        if v_scope <> 'page' then
            select g.slug into v_slug from public.os_groups g where g.id = v_ent;
            if public.os_is_group_member(v_slug) then
                return true;
            end if;
        end if;
    end if;

    return false;
end
$$;

revoke all on function public.cerebro_compartido_conmigo(uuid) from public, anon;
grant execute on function public.cerebro_compartido_conmigo(uuid) to authenticated;

drop policy if exists "br_compartido_leer" on public.brains;
create policy "br_compartido_leer" on public.brains
    for select to authenticated
    using (owner <> auth.uid() and public.cerebro_compartido_conmigo(id));

drop policy if exists "bmf_compartido_leer" on public.brain_memory_files;
create policy "bmf_compartido_leer" on public.brain_memory_files
    for select to authenticated
    using (brain_id is not null and owner <> auth.uid() and public.cerebro_compartido_conmigo(brain_id));

-- ── b) Identidad de réplica ───────────────────────────────────────────────────────────────────
-- `brain_server_links` está en la publicación de tiempo real y no tiene clave primaria: Postgres
-- rechazaba CUALQUIER borrado o cambio en ella («cannot delete from table … because it does not have
-- a replica identity and publishes deletes»). `brain_selections` tampoco tiene clave: se le pone lo
-- mismo para que pueda entrar en la publicación sin romperse.
alter table public.brain_server_links replica identity full;
alter table public.brain_selections replica identity full;

-- ── c) Un solo cerebro por defecto por cuenta ─────────────────────────────────────────────────
-- Red de seguridad del arreglo de cf787fa0: aunque un cliente viejo vuelva a creerse que la cuenta
-- está vacía, la base no admite un segundo «Cerebro StarSeed» de plantilla por defecto.
-- (El 2026-10-13, antes de crearlo: 8 cuentas, 1 cerebro por defecto cada una.)
create unique index if not exists brains_un_cerebro_por_defecto
    on public.brains (owner)
    where (config ->> 'template') = 'starseed-default';
