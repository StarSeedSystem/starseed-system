-- ════════════════════════════════════════════════════════════════════════════
-- Adenda 149 · PERFILES COMPARTIDOS ENTRE CUENTAS (+ páginas, grupos y
-- comunidades) — permisos GRADUALES con acceso total opcional.
-- ----------------------------------------------------------------------------
-- Petición literal (Alex, 2026-08-09):
--   «los perfiles (EXCEPTO los perfiles principales) se deben poder COMPARTIR
--    entre varias cuentas […] con opciones de PERMISOS GRADUALES y una opción
--    de ACCESO COMPLETO ABSOLUTO que incluye los datos de los cerebros,
--    memorias, configuraciones, logs, etc.; y poder elegir […] el TIPO de
--    perfil […] con opciones de ROLES y permisos POR CADA CUENTA para el
--    perfil. Igual para las páginas, grupos y comunidades de todo tipo.»
--
-- Base del OS: Supabase `nxstilnyidvkqeosofuh` (NO el de Nexus/Café).
-- ESTA MIGRACIÓN **NO SE HA APLICADO**: es la fuente de verdad a revisar antes
-- de ejecutarla vía Management API (así se pidió).
--
-- ╔════════════════════════════════════════════════════════════════════════╗
-- ║ QUÉ EXISTÍA ANTES (revisado archivo por archivo, no se inventa nada)   ║
-- ╚════════════════════════════════════════════════════════════════════════╝
--  · `os_account_profiles(id, account, handle, name, kind, avatar_url,
--     cover_url, bio, visibility, is_default, created_at, updated_at)` — las
--     FACETAS públicas de una cuenta (src/lib/profiles/profiles.ts). RLS actual
--     (20260708000006): SELECT abierto; ALL para `account = auth.uid()`.
--     → EL PERFIL PRINCIPAL YA TIENE MARCA: `is_default = true`. NO se añade
--       ninguna columna `is_primary`: sería un segundo origen de verdad para lo
--       mismo. `is_default` es además el perfil que el repo sincroniza con la
--       identidad soberana `os_profiles` al crear la primera faceta
--       (account-profiles-switcher.tsx) — es, literalmente, «el principal».
--  · `os_profiles(user_id, username, display_name, …)` — DIRECTORIO de la red
--     (una fila por CUENTA). No es una faceta compartible: es la identidad
--     soberana. Aquí NO se toca.
--  · `os_entity_roles(account_id, entity_type, entity_id, role, permissions)`
--     (20260710000000) — RBAC de federación ya existente para
--     perfiles/páginas/grupos. SE REUTILIZA para páginas y grupos (§6) en vez
--     de duplicar una tabla paralela, y se le CIERRA un agujero real (§7).
--  · `acl_ids_allow / account_of_profile / profiles_of_account`
--     (20260712100100) — REGLA CUENTA↔PERFILES. Se REUTILIZA `account_of_profile`
--     tal cual: no se redefine.
--  · `os_memberships (user_id, group_slug, role)` + trigger anti-escalada
--     (20260801130000) — MEMBRESÍA de grupos/páginas (self-insert de la fila
--     propia: "unirse"). NO es una tabla de concesiones: nadie puede insertar
--     la fila de OTRA cuenta. Por eso el "compartir" de páginas/grupos NO va
--     por ahí (se documenta en §6) y el roster sigue siendo suyo.
--
-- ╔════════════════════════════════════════════════════════════════════════╗
-- ║ QUÉ AÑADE ESTA MIGRACIÓN                                               ║
-- ╚════════════════════════════════════════════════════════════════════════╝
--  §1 Columnas aditivas de os_account_profiles: `categories text[]` (temas
--     creativos multi-seleccionables) — y por qué `kind` NO necesita DDL.
--  §2 Funciones de rango/rol (vocabulario gradual + compatibilidad legado).
--  §3 Tabla `os_profile_access` (una fila = una cuenta con acceso a un perfil).
--  §4 Trigger guardián (el perfil PRINCIPAL nunca se comparte, ni por
--     service_role; granted_by real; normalización de rol).
--  §5 RLS honesta y comentada de `os_profile_access`.
--  §6 Adopción por páginas/grupos vía `os_entity_roles` (sin tabla nueva).
--  §7 ENDURECIMIENTO de la RLS de `os_entity_roles` (cerraba mal: cualquiera
--     podía auto-concederse 'owner' sobre CUALQUIER entidad).
--  §8 Backfill idempotente de los roles de PERFIL que ya vivían en
--     os_entity_roles → os_profile_access (un solo origen de verdad).
--  §9 GRANTs + consultas de verificación + ROLLBACK.
--
-- ╔════════════════════════════════════════════════════════════════════════╗
-- ║ ROLES GRADUALES (vocabulario en español, texto validado por CHECK)     ║
-- ╚════════════════════════════════════════════════════════════════════════╝
--   1 · observador   — ver el perfil y USARLO en modo lectura.
--   2 · colaborador  — publicar y editar el CONTENIDO del perfil.
--   3 · gestor       — configuración del perfil + invitar/quitar accesos de
--                      rango ESTRICTAMENTE MENOR al suyo.
--   4 · total        — ACCESO COMPLETO ABSOLUTO: todo lo anterior + cerebros,
--                      memorias, configuraciones y logs del perfil.
--
--   Equivalencia con el modelo universal de `src/lib/sharing/access.ts`
--   (Adenda 63 §5 · view<comment<edit<admin), que se conserva intacto:
--     observador→view · colaborador→edit · gestor→admin · total→admin.
--   `total` y `gestor` comparten `admin` en el modelo universal PORQUE ese
--   modelo describe RECURSOS (escritorios/pizarras/archivos), no identidades:
--   la diferencia total/gestor (cerebros·memorias·configs·logs) vive aquí y se
--   consulta con `public.profile_access_allows(profile_id,'total')`.
--
-- ╔════════════════════════════════════════════════════════════════════════╗
-- ║ LÍMITE HONESTO (no se oculta)                                          ║
-- ╚════════════════════════════════════════════════════════════════════════╝
--   `total` declara el alcance sobre cerebros/memorias/configuraciones/logs,
--   pero la RLS de ESAS tablas (cerebros, memorias, user_settings, logs) sigue
--   siendo la suya y HOY no consulta esta tabla. Esta migración deja lista la
--   pasarela para que lo hagan sin duplicar lógica:
--       USING ( … OR public.profile_access_allows(<profile_id>, 'total') )
--   Mientras esas políticas no la adopten, el rol `total` es efectivo en la
--   capa de aplicación (perfil, contenido, configuración del perfil) y queda
--   PENDIENTE en las tablas de cerebros/memorias/logs. Se dice claramente en
--   la UI y en src/lib/social/profile-sharing.ts.
--
-- IDEMPOTENTE: re-ejecutable entera sin efectos secundarios.
-- ════════════════════════════════════════════════════════════════════════════


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §1 · os_account_profiles — columnas ADITIVAS                             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- `kind` YA EXISTE (texto libre; hoy guarda personal|civic|artistic|
-- professional|custom) y NO tiene CHECK — verificado: ninguna migración del
-- repo crea uno sobre esta columna. Por eso los TIPOS NUEVOS pedidos
-- (personal · grupal · publico · tematico) NO requieren DDL: son valores
-- nuevos del mismo campo. Los valores legados siguen siendo válidos y se
-- muestran con su etiqueta de siempre (src/lib/profiles/profiles.ts).
-- Se documenta a propósito en vez de añadir un CHECK: un CHECK aquí rompería
-- cualquier perfil existente con un valor no previsto (regla: nunca romper
-- perfiles existentes).

alter table public.os_account_profiles
  add column if not exists categories text[] not null default '{}'::text[];

comment on column public.os_account_profiles.categories is
  'Adenda 149 · Temas creativos multi-seleccionables del perfil (arte, música, ciencia, gobernanza…). Catálogo editable en src/lib/social/profile-sharing.ts.';

comment on column public.os_account_profiles.kind is
  'Tipo de perfil. Adenda 149 amplía el vocabulario: personal | grupal | publico | tematico (+ legado: civic | artistic | professional | custom). Texto libre a propósito: un CHECK rompería perfiles existentes.';

comment on column public.os_account_profiles.is_default is
  'true = PERFIL PRINCIPAL de la cuenta. Adenda 149: el perfil principal NUNCA se comparte (trigger os_profile_access_guard).';

-- Búsqueda por tema (chips del selector de categorías).
create index if not exists os_account_profiles_categories_idx
  on public.os_account_profiles using gin (categories);


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §2 · Rango de rol + helpers de identidad                                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- Rango numérico de un rol. Entiende el vocabulario GRADUAL nuevo y el LEGADO
-- de os_entity_roles (owner/admin/editor/viewer) para poder comparar ambos sin
-- migrar datos a ciegas. Desconocido/NULL ⇒ 0 (sin acceso).
create or replace function public.access_role_rank(_role text)
returns int
language sql immutable
as $$
  select case lower(coalesce(trim(_role), ''))
    when 'total'       then 4
    when 'owner'       then 4
    when 'gestor'      then 3
    when 'admin'       then 3
    when 'colaborador' then 2
    when 'editor'      then 2
    when 'observador'  then 1
    when 'viewer'      then 1
    else 0
  end;
$$;

-- Correo de la sesión (para invitaciones a cuentas que aún no han entrado).
-- Defensivo: si la claim no es JSON válido o no hay sesión ⇒ '' (nunca lanza,
-- nunca deja pasar una comparación vacía porque invite_email vacío se descarta).
create or replace function public.session_email()
returns text
language plpgsql stable
set search_path = public
as $$
declare
  v text;
begin
  begin
    v := lower(coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email', ''));
  exception when others then
    v := '';
  end;
  return coalesce(v, '');
end;
$$;

-- ¿Es este perfil el PRINCIPAL de su cuenta? SECURITY DEFINER: lee
-- os_account_profiles sin evaluar su RLS desde dentro de otra política.
create or replace function public.is_primary_account_profile(_profile_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select ap.is_default from public.os_account_profiles ap where ap.id = _profile_id),
    false
  );
$$;

-- Rol EFECTIVO de la sesión sobre un perfil:
--   · la cuenta dueña ⇒ 'total' (control absoluto sobre lo suyo);
--   · si no, el rol de su fila en os_profile_access (por cuenta o por correo
--     invitado);
--   · NULL si no tiene ninguno.
-- SECURITY DEFINER ⇒ lee os_profile_access SIN pasar por su propia RLS: sin
-- esto, usarla dentro de las políticas de esa misma tabla sería recursivo.
create or replace function public.my_profile_access_role(_profile_id uuid)
returns text
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_role  text;
  v_email text := public.session_email();
begin
  if auth.uid() is null or _profile_id is null then
    return null;
  end if;

  v_owner := public.account_of_profile(_profile_id);   -- reutilizada (20260712100100)
  if v_owner is not null and v_owner = auth.uid() then
    return 'total';
  end if;

  select a.role into v_role
    from public.os_profile_access a
   where a.profile_id = _profile_id
     and (
       a.grantee_user_id = auth.uid()
       or (a.grantee_user_id is null and v_email <> '' and lower(coalesce(a.invite_email, '')) = v_email)
     )
   order by public.access_role_rank(a.role) desc
   limit 1;

  return v_role;
end;
$$;

-- PASARELA PÚBLICA (la que deben usar cerebros/memorias/configs/logs cuando
-- adopten este modelo): ¿la sesión alcanza al menos `_min_role` sobre el perfil?
create or replace function public.profile_access_allows(_profile_id uuid, _min_role text default 'observador')
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.access_role_rank(public.my_profile_access_role(_profile_id))
         >= public.access_role_rank(coalesce(_min_role, 'observador'));
$$;

comment on function public.profile_access_allows(uuid, text) is
  'Adenda 149 · Pasarela de permisos de PERFIL COMPARTIDO. Úsala en la RLS de cerebros/memorias/configuraciones/logs: USING ( … OR public.profile_access_allows(<profile_id>, ''total'') ).';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §3 · Tabla os_profile_access                                             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Una fila = UNA CUENTA de la red con acceso a UN perfil (faceta) ajeno.
-- `grantee_user_id` es la CUENTA (auth.users.id): el acceso se concede a la
-- cuenta entera, coherente con la REGLA CUENTA↔PERFILES ya vigente en el OS
-- (20260712100100) y con la Dualidad Cuenta/Perfil de CLAUDE.md §6 — la
-- responsabilidad recae siempre sobre la Cuenta raíz. La UI deja ELEGIR por
-- faceta/handle (que es lo legible) y guarda aquí su cuenta.

create table if not exists public.os_profile_access (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.os_account_profiles(id) on delete cascade,
  -- Cuenta destinataria. NULL ⇒ invitación pendiente por handle/correo.
  grantee_user_id uuid references auth.users(id) on delete cascade,
  -- Invitación a alguien que todavía no se ha resuelto a una cuenta.
  invite_handle   text,
  invite_email    text,
  role            text not null default 'observador',
  granted_by      uuid references auth.users(id) on delete set null,
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint os_profile_access_role_chk
    check (role in ('observador', 'colaborador', 'gestor', 'total')),
  constraint os_profile_access_target_chk
    check (grantee_user_id is not null or nullif(trim(coalesce(invite_handle, '')), '') is not null
                                       or nullif(trim(coalesce(invite_email, '')), '') is not null)
);

-- Aditivo para re-ejecuciones sobre una tabla creada por una versión anterior.
alter table public.os_profile_access add column if not exists invite_handle text;
alter table public.os_profile_access add column if not exists invite_email  text;
alter table public.os_profile_access add column if not exists note          text;
alter table public.os_profile_access add column if not exists granted_by    uuid;
alter table public.os_profile_access add column if not exists updated_at    timestamptz not null default now();

-- UNIQUE(profile_id, grantee_user_id) — pedido explícitamente. Como índice
-- único parcial (no constraint) porque en Postgres los NULL son DISTINTOS entre
-- sí: sin el `where`, dos invitaciones pendientes distintas (ambas con
-- grantee_user_id NULL) convivirían igualmente, pero el índice parcial deja
-- clarísima la intención y evita un índice inútil sobre filas NULL.
create unique index if not exists os_profile_access_profile_grantee_uq
  on public.os_profile_access (profile_id, grantee_user_id)
  where grantee_user_id is not null;

-- Una sola invitación pendiente por correo y perfil.
create unique index if not exists os_profile_access_profile_invite_email_uq
  on public.os_profile_access (profile_id, lower(invite_email))
  where grantee_user_id is null and invite_email is not null;

create index if not exists os_profile_access_grantee_idx
  on public.os_profile_access (grantee_user_id);
create index if not exists os_profile_access_profile_idx
  on public.os_profile_access (profile_id);

comment on table public.os_profile_access is
  'Adenda 149 · Perfiles (facetas os_account_profiles) COMPARTIDOS entre cuentas con permisos graduales: observador < colaborador < gestor < total. El perfil PRINCIPAL (is_default) nunca puede aparecer aquí.';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §4 · Trigger guardián — la regla que no depende de la RLS                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- La RLS protege de clientes autenticados; el TRIGGER protege ADEMÁS de
-- service_role, de scripts y de cualquier futuro camino de escritura. La regla
-- «el perfil principal NUNCA se comparte» es de negocio, no de sesión: va aquí.

create or replace function public.os_profile_access_guard()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  new.role := lower(trim(coalesce(new.role, 'observador')));
  if new.role not in ('observador', 'colaborador', 'gestor', 'total') then
    raise exception 'os_profile_access: rol no válido «%». Usa observador, colaborador, gestor o total.', new.role;
  end if;

  if public.is_primary_account_profile(new.profile_id) then
    raise exception 'os_profile_access: el PERFIL PRINCIPAL de la cuenta no se puede compartir (Adenda 149).';
  end if;

  v_owner := public.account_of_profile(new.profile_id);
  if v_owner is null then
    raise exception 'os_profile_access: el perfil % no existe.', new.profile_id;
  end if;
  if new.grantee_user_id is not null and new.grantee_user_id = v_owner then
    raise exception 'os_profile_access: la cuenta dueña ya tiene acceso total a su propio perfil.';
  end if;

  -- Normaliza invitaciones (evita duplicados por mayúsculas/espacios).
  new.invite_handle := nullif(lower(trim(coalesce(new.invite_handle, ''))), '');
  new.invite_email  := nullif(lower(trim(coalesce(new.invite_email, ''))), '');

  -- `granted_by` SIEMPRE es quien concede de verdad (no lo elige el cliente).
  if auth.role() is distinct from 'service_role' and auth.uid() is not null then
    new.granted_by := auth.uid();
  else
    new.granted_by := coalesce(new.granted_by, auth.uid());
  end if;

  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
  else
    new.created_at := old.created_at;
    -- El destinatario y el perfil de una fila no se "mueven": eso sería otra
    -- concesión distinta (se revoca y se concede de nuevo — trazable).
    new.profile_id      := old.profile_id;
    new.grantee_user_id := coalesce(new.grantee_user_id, old.grantee_user_id);
  end if;
  new.updated_at := now();

  return new;
end;
$$;

drop trigger if exists os_profile_access_guard_trg on public.os_profile_access;
create trigger os_profile_access_guard_trg
  before insert or update on public.os_profile_access
  for each row execute function public.os_profile_access_guard();


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §5 · RLS de os_profile_access                                            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Resumen honesto de quién puede qué:
--   · DUEÑO de la cuenta creadora  → control TOTAL de las filas de sus perfiles.
--   · GRANTEE                      → LEE SU PROPIA FILA (y puede borrarla:
--                                    salir de un perfil compartido es un
--                                    derecho, nunca un castigo — CLAUDE.md §6).
--   · GESTOR (3) / TOTAL (4)       → ven la lista completa y GESTIONAN filas de
--                                    rango ESTRICTAMENTE MENOR que el suyo
--                                    (un gestor jamás crea otro gestor; un
--                                    `total` jamás crea otro `total`: solo el
--                                    dueño reparte acceso absoluto).
--   · Nadie más                    → nada (ni SELECT).
-- Sin recursión: todas las comprobaciones pasan por funciones SECURITY DEFINER.

alter table public.os_profile_access enable row level security;

drop policy if exists os_profile_access_select on public.os_profile_access;
create policy os_profile_access_select on public.os_profile_access
  for select to authenticated
  using (
    public.account_of_profile(profile_id) = auth.uid()
    or grantee_user_id = auth.uid()
    or (grantee_user_id is null and invite_email is not null
        and public.session_email() <> '' and lower(invite_email) = public.session_email())
    or public.profile_access_allows(profile_id, 'gestor')
  );

drop policy if exists os_profile_access_insert on public.os_profile_access;
create policy os_profile_access_insert on public.os_profile_access
  for insert to authenticated
  with check (
    -- Redundante con el trigger a propósito: la regla más importante se dice
    -- dos veces (defensa en profundidad, no confianza en un solo punto).
    not public.is_primary_account_profile(profile_id)
    and (
      public.account_of_profile(profile_id) = auth.uid()
      or public.access_role_rank(public.my_profile_access_role(profile_id))
         > public.access_role_rank(role)
    )
  );

drop policy if exists os_profile_access_update on public.os_profile_access;
create policy os_profile_access_update on public.os_profile_access
  for update to authenticated
  using (
    public.account_of_profile(profile_id) = auth.uid()
    or public.access_role_rank(public.my_profile_access_role(profile_id))
       > public.access_role_rank(role)          -- rol ACTUAL de la fila
  )
  with check (
    not public.is_primary_account_profile(profile_id)
    and (
      public.account_of_profile(profile_id) = auth.uid()
      or public.access_role_rank(public.my_profile_access_role(profile_id))
         > public.access_role_rank(role)        -- rol NUEVO de la fila
    )
  );

drop policy if exists os_profile_access_delete on public.os_profile_access;
create policy os_profile_access_delete on public.os_profile_access
  for delete to authenticated
  using (
    public.account_of_profile(profile_id) = auth.uid()
    or grantee_user_id = auth.uid()             -- salir por voluntad propia
    or public.access_role_rank(public.my_profile_access_role(profile_id))
       > public.access_role_rank(role)
  );

-- updated_at en cualquier UPDATE (el trigger guardián ya lo fija; esta línea
-- documenta que NO hace falta un segundo trigger de timestamps).


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §6 · PÁGINAS, GRUPOS Y COMUNIDADES — se reutiliza os_entity_roles        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- NO se crea ninguna tabla nueva para páginas/grupos. Razón:
--   · `os_entity_roles(account_id, entity_type, entity_id, role, permissions)`
--     YA existe exactamente para esto («Permite que múltiples cuentas gestionen
--     Perfiles, Páginas o Grupos», 20260710000000) y su columna `role` es texto
--     libre SIN check → admite el vocabulario gradual nuevo tal cual.
--   · `os_memberships` / `group_members` / `page_members` son MEMBRESÍA
--     (unirse/censo, "una persona una voz"), con self-insert de la fila propia:
--     no pueden expresar "yo te concedo acceso a ti". No se tocan, y el roster
--     sigue siendo su fuente de verdad — la UI nueva los MUESTRA, no los
--     duplica.
-- Red de seguridad: si por lo que sea la tabla no estuviera en la base viva,
-- se crea con EXACTAMENTE la forma de 20260710000000 (sin sus políticas: las
-- honestas se crean en §7). Idempotente y sin efecto si ya existe.
create table if not exists public.os_entity_roles (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references auth.users(id) on delete cascade,
  entity_type text not null,
  entity_id   uuid not null,
  role        text not null default 'viewer',
  permissions jsonb default '{}',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique (account_id, entity_type, entity_id)
);

-- Sólo hacen falta las dos columnas que el código cliente ya escribía y que la
-- migración original no declaraba (src/lib/social/entity-roles.ts escribe
-- `granted_by`; src/lib/social/roles.ts escribe `updated_at`):

alter table public.os_entity_roles add column if not exists granted_by uuid references auth.users(id) on delete set null;
alter table public.os_entity_roles add column if not exists updated_at timestamptz not null default now();

comment on column public.os_entity_roles.role is
  'Rol sobre la entidad. Adenda 149 añade el vocabulario gradual observador|colaborador|gestor|total junto al legado viewer|editor|admin|owner (public.access_role_rank compara ambos).';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §7 · ENDURECIMIENTO de la RLS de os_entity_roles (agujero real)          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- AGUJERO ENCONTRADO (20260710000000, líneas 51-66):
--     CREATE POLICY os_entity_roles_modify … FOR ALL
--       USING ( EXISTS(… er.account_id = auth.uid() AND er.role IN ('owner','admin'))
--               OR account_id = auth.uid() );
-- En una política FOR ALL sin WITH CHECK, Postgres usa la expresión USING
-- TAMBIÉN como WITH CHECK del INSERT. La segunda rama (`account_id = auth.uid()`)
-- convierte eso en: **cualquier cuenta puede insertarse a sí misma como 'owner'
-- de CUALQUIER perfil, página o grupo de la red**. Y `os_entity_roles_select`
-- era `USING (true)` (todo el mundo lee todas las concesiones de todos).
-- Montar encima de esa tabla el gestor de accesos sin cerrarlo sería negligente,
-- así que se cierra aquí. La propiedad real se resuelve contra el `owner_id`
-- de la entidad, igual que hacen los triggers de gobernanza del repo.

-- Cuenta PROPIETARIA de una entidad, sea del tipo que sea. plpgsql + dynamic
-- SQL a propósito: el esquema vivo de os_pages/os_groups/os_events difiere de
-- la migración original (allí no había `owner_id`), así que una referencia
-- estática podría impedir CREAR la función. Cualquier fallo ⇒ NULL (deniega).
-- Ignora `entity_type` deliberadamente: en producción hay filas con el TIPO
-- equivocado (entity-roles-panel.tsx pasaba el `kind` del perfil —'personal',
-- 'civic'…— como entity_type). El uuid identifica la entidad sin ambigüedad.
create or replace function public.entity_owner_account(_entity_id uuid)
returns uuid
language plpgsql stable security definer
set search_path = public
as $$
declare
  v uuid;
  t text;
begin
  if _entity_id is null then
    return null;
  end if;

  begin
    select ap.account into v from public.os_account_profiles ap where ap.id = _entity_id;
  exception when others then
    v := null;
  end;
  if v is not null then
    return v;
  end if;

  foreach t in array array['os_pages', 'os_groups', 'os_events'] loop
    begin
      execute format('select owner_id from public.%I where id = $1', t) into v using _entity_id;
    exception when others then
      v := null;
    end;
    if v is not null then
      return v;
    end if;
  end loop;

  return null;
end;
$$;

-- Rango de la sesión sobre una entidad (SECURITY DEFINER ⇒ sin recursión).
create or replace function public.my_entity_role_rank(_entity_id uuid)
returns int
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select max(public.access_role_rank(r.role))
       from public.os_entity_roles r
      where r.entity_id = _entity_id
        and r.account_id = auth.uid()),
    0);
$$;

-- Se ELIMINAN TODAS las políticas vivas de os_entity_roles antes de recrearlas.
-- Es la única forma honesta de garantizar que el agujero queda cerrado: las
-- políticas RLS son PERMISIVAS y se combinan con OR, así que dejar una sola
-- política antigua (aunque tenga otro nombre del esperado) mantendría el
-- agujero abierto. El rollback al final restaura las dos originales.
do $$
declare
  p record;
begin
  for p in select policyname from pg_policies
            where schemaname = 'public' and tablename = 'os_entity_roles'
  loop
    execute format('drop policy if exists %I on public.os_entity_roles', p.policyname);
  end loop;
end;
$$;

alter table public.os_entity_roles enable row level security;

-- SELECT: la persona implicada, la dueña de la entidad y quien ya tiene algún
-- rol en ella. (Antes: TODO el mundo veía TODAS las concesiones de la red.)
create policy os_entity_roles_select on public.os_entity_roles
  for select to authenticated
  using (
    account_id = auth.uid()
    or public.entity_owner_account(entity_id) = auth.uid()
    or public.my_entity_role_rank(entity_id) >= 1
  );

-- INSERT: la dueña de la entidad, o quien tenga un rango ESTRICTAMENTE MAYOR
-- que el que reparte. Ya NO existe la auto-concesión.
create policy os_entity_roles_insert on public.os_entity_roles
  for insert to authenticated
  with check (
    public.entity_owner_account(entity_id) = auth.uid()
    or public.my_entity_role_rank(entity_id) > public.access_role_rank(role)
  );

create policy os_entity_roles_update on public.os_entity_roles
  for update to authenticated
  using (
    public.entity_owner_account(entity_id) = auth.uid()
    or public.my_entity_role_rank(entity_id) > public.access_role_rank(role)
  )
  with check (
    public.entity_owner_account(entity_id) = auth.uid()
    or public.my_entity_role_rank(entity_id) > public.access_role_rank(role)
  );

-- DELETE: la dueña, quien manda más que esa fila, o la propia persona
-- retirándose (no punitivo).
create policy os_entity_roles_delete on public.os_entity_roles
  for delete to authenticated
  using (
    public.entity_owner_account(entity_id) = auth.uid()
    or account_id = auth.uid()
    or public.my_entity_role_rank(entity_id) > public.access_role_rank(role)
  );


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §8 · Backfill idempotente: roles de PERFIL que ya vivían en              ║
-- ║      os_entity_roles → os_profile_access (un solo origen de verdad)      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Se seleccionan por `entity_id ∈ os_account_profiles` (NO por entity_type:
-- ver §7 — hay filas con el tipo equivocado). Se EXCLUYEN los perfiles
-- principales (el trigger los rechazaría) y las filas del propio dueño.
-- Mapeo: owner→total · admin→gestor · editor→colaborador · viewer/otro→observador.
-- `on conflict do nothing` ⇒ re-ejecutable. No se borra nada del origen: las
-- filas antiguas quedan como estaban (histórico); la app lee ya de la tabla
-- nueva para perfiles.
insert into public.os_profile_access (profile_id, grantee_user_id, role, granted_by, note)
select r.entity_id,
       r.account_id,
       case public.access_role_rank(r.role)
         when 4 then 'total'
         when 3 then 'gestor'
         when 2 then 'colaborador'
         else 'observador'
       end,
       ap.account,
       'Importado de os_entity_roles (Adenda 149)'
  from public.os_entity_roles r
  join public.os_account_profiles ap on ap.id = r.entity_id
 where coalesce(ap.is_default, false) = false
   and r.account_id is not null
   and r.account_id <> ap.account
on conflict do nothing;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §9 · Permisos de ejecución                                               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Patrón del repo (20260805200000 / 20260805220000): Postgres concede EXECUTE
-- a PUBLIC en toda función nueva y Supabase concede a `anon` además → REVOKE
-- explícito y GRANT sólo a quien debe.

revoke execute on function public.session_email()                       from public, anon;
revoke execute on function public.is_primary_account_profile(uuid)      from public, anon;
revoke execute on function public.my_profile_access_role(uuid)          from public, anon;
revoke execute on function public.profile_access_allows(uuid, text)     from public, anon;
revoke execute on function public.entity_owner_account(uuid)            from public, anon;
revoke execute on function public.my_entity_role_rank(uuid)             from public, anon;
revoke execute on function public.os_profile_access_guard()             from public, anon;

grant execute on function public.session_email()                        to authenticated;
grant execute on function public.is_primary_account_profile(uuid)       to authenticated;
grant execute on function public.my_profile_access_role(uuid)           to authenticated;
grant execute on function public.profile_access_allows(uuid, text)      to authenticated;
grant execute on function public.entity_owner_account(uuid)             to authenticated;
grant execute on function public.my_entity_role_rank(uuid)              to authenticated;

-- access_role_rank es una tabla de equivalencias pura (sin datos): puede
-- quedarse pública, la usan políticas evaluadas para anon en otras tablas.
grant execute on function public.access_role_rank(text) to anon, authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN RECOMENDADA (antes y después de aplicar)
-- ----------------------------------------------------------------------------
--   -- 1) Fotografía de las políticas ANTES de tocar nada (guárdala):
--   select tablename, policyname, cmd, qual, with_check
--     from pg_policies
--    where tablename in ('os_entity_roles', 'os_profile_access')
--    order by tablename, policyname;
--
--   -- 2) ¿os_pages/os_groups/os_events tienen owner_id de verdad?
--   select table_name, column_name
--     from information_schema.columns
--    where table_schema = 'public'
--      and table_name in ('os_pages', 'os_groups', 'os_events')
--      and column_name = 'owner_id';
--   -- Si alguna NO lo tiene, entity_owner_account devolverá NULL para ella y
--   -- solo la vía "rango mayor" concederá gestión: seguro, pero avisad.
--
--   -- 3) ¿Hay CHECK en os_account_profiles.kind que impida los tipos nuevos?
--   select conname, pg_get_constraintdef(oid)
--     from pg_constraint
--    where conrelid = 'public.os_account_profiles'::regclass and contype = 'c';
--
--   -- 4) Tras aplicar: el perfil principal NO se puede compartir (debe fallar):
--   --    insert into os_profile_access(profile_id, grantee_user_id)
--   --    select id, '<uuid-de-otra-cuenta>' from os_account_profiles
--   --     where is_default limit 1;   → ERROR «el PERFIL PRINCIPAL … no se puede compartir»
--
--   -- 5) Tras aplicar: nadie puede auto-concederse owner de una entidad ajena
--   --    (con una sesión normal): insert into os_entity_roles(account_id,
--   --    entity_type, entity_id, role) values (auth.uid(),'page','<id ajeno>','owner')
--   --    → 0 filas / violación de RLS.
--
-- ROLLBACK (si hiciera falta revertir §7 al estado anterior — NO recomendado,
-- reabre el agujero de auto-concesión; se documenta por transparencia):
--   drop policy if exists os_entity_roles_select on public.os_entity_roles;
--   drop policy if exists os_entity_roles_insert on public.os_entity_roles;
--   drop policy if exists os_entity_roles_update on public.os_entity_roles;
--   drop policy if exists os_entity_roles_delete on public.os_entity_roles;
--   create policy "os_entity_roles_select" on public.os_entity_roles for select using (true);
--   create policy "os_entity_roles_modify" on public.os_entity_roles for all using (
--     exists (select 1 from public.os_entity_roles er
--              where er.entity_id = os_entity_roles.entity_id
--                and er.entity_type = os_entity_roles.entity_type
--                and er.account_id = auth.uid()
--                and er.role in ('owner','admin'))
--     or account_id = auth.uid());
--
-- ROLLBACK del resto (destruye las concesiones creadas — pensarlo dos veces):
--   drop table if exists public.os_profile_access;
--   drop function if exists public.os_profile_access_guard();
--   drop function if exists public.profile_access_allows(uuid, text);
--   drop function if exists public.my_profile_access_role(uuid);
--   drop function if exists public.is_primary_account_profile(uuid);
--   drop function if exists public.my_entity_role_rank(uuid);
--   drop function if exists public.entity_owner_account(uuid);
--   drop function if exists public.session_email();
--   drop function if exists public.access_role_rank(text);
--   alter table public.os_account_profiles drop column if exists categories;
-- ════════════════════════════════════════════════════════════════════════════
