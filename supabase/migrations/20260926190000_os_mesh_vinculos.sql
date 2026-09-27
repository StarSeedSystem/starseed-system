-- ════════════════════════════════════════════════════════════════════════════
-- Ola 370 — VÍNCULO ENTRE CUENTAS CON CONSENTIMIENTO.
-- ----------------------------------------------------------------------------
-- El radar de «neuronas cercanas» (Ola 366, `architecture/malla-neuronas-
-- autovinculo.md`) solo mostraba faros anónimos de OTRAS cuentas — el botón
-- «Solicitar vínculo» estaba deshabilitado a propósito porque vincular dos
-- CUENTAS distintas exige consentimiento explícito de ambos lados (a
-- diferencia del auto-vínculo silencioso entre neuronas de la MISMA cuenta,
-- que ya se apoya en la sesión soberana compartida). Esta migración añade esa
-- tabla y sus transiciones.
--
-- MODELO: una fila = una relación (de_owner,de_device) → (a_owner,a_device),
-- con máquina de estados 'pendiente' → 'aceptado'|'rechazado', y desde
-- cualquiera de esos dos → 'revocado'. Además guarda:
--   · `permisos_solicitados`/`permisos` — lo que el solicitante pidió y lo que
--     el receptor CONCEDIÓ al aceptar (pueden diferir; el receptor manda).
--   · `sal` — HKDF salt aleatoria por vínculo (no secreta: ver
--     `architecture/vinculos-entre-cuentas.md` §2), generada AQUÍ (servidor)
--     para que ninguno de los dos lados tenga que inventarla ni transmitirla.
--   · `de_pub`/`a_pub` — clave pública ECDH P-256 (JWK) del dispositivo de
--     cada lado, publicada al solicitar/aceptar. Con ambas + `sal`, cada lado
--     deriva el MISMO secreto de par (ECDH → HKDF) sin que viaje en claro.
--   · `buzon_de`/`buzon_a` — buzón de RESPALDO para la señalización WebRTC
--     (oferta/respuesta/ICE, ya firmados con HMAC de la clave de par en el
--     cliente — ver `par-signaling.ts`): el transporte PREFERIDO es Realtime
--     broadcast por un topic no adivinable; este buzón es el fallback cuando
--     Realtime no está disponible, igual que `user_settings.prefs.signals[]`
--     lo es para la señalización intra-cuenta (`signaling.ts`).
--
-- CÓMO SABE EL SOLICITANTE quién es `a_owner`: el radar de faros
-- (`os_mesh_relay`, kind='beacon') YA es de lectura pública para cualquier
-- autenticado (`channel='public'`, RLS de 20260728090000) — su columna
-- `owner_id` es, por tanto, técnicamente legible por cualquier cliente
-- autenticado que decida seleccionarla (la app cliente hoy NO la pide en
-- `pullBeacons()`, pero eso es una convención de la app, no un límite de
-- RLS: ver `architecture/vinculos-entre-cuentas.md` §4 "fuga de metadatos").
-- Por eso NO se añade una vía nueva de exposición aquí: `solicitar_vinculo`
-- (abajo) resuelve `a_owner` DEL LADO DEL SERVIDOR a partir del faro fresco
-- (`payload->>'sid'`), así el cliente nunca necesita leer `owner_id` para
-- pedir un vínculo — mantiene la convención de la app intacta aunque no
-- endurece la RLS ya existente de `os_mesh_relay` (fuera de alcance de esta
-- ola; ver nota en el mismo §4 del SOP).
--
-- ESCRITURA: SOLO por las 4 funciones SECURITY DEFINER de abajo (mismo patrón
-- que `approve_group_membership`/`reject_group_membership`,
-- 20260805220000_group_join_approval.sql) — la tabla NO tiene política de
-- INSERT/UPDATE/DELETE para `authenticated`, así que un intento directo desde
-- el cliente queda bloqueado por RLS (0 filas, sin excepción ruidosa). Cada
-- función comprueba `auth.uid()` internamente y solo transiciona la fila
-- exacta que le corresponde — RLS no necesita saber nada de la máquina de
-- estados. La LECTURA sí es una política RLS normal (participante = de_owner
-- o a_owner).
--
-- ANTI-FLOOD: `solicitar_vinculo` cuenta las solicitudes del MISMO
-- `de_device` en la última hora (tope 10) — ver
-- `architecture/vinculos-entre-cuentas.md` §5 (modelo de amenazas: solicitudes
-- de spam). Es el punto de aplicación NATURAL porque toda escritura pasa por
-- aquí (no hace falta una comprobación adicional en una política RLS que, de
-- todos modos, no puede existir sin permitir el insert directo).
--
-- ADITIVA, IDEMPOTENTE. NO APLICADA POR ESTE AGENTE (a la espera de revisión,
-- según se pidió) — aplicar en `nxstilnyidvkqeosofuh` vía la Management API.
-- Este .sql es la fuente de verdad.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.os_mesh_vinculos (
  id                    uuid primary key default gen_random_uuid(),
  de_owner              uuid not null references auth.users(id) on delete cascade,
  de_device             text not null,
  a_owner               uuid not null references auth.users(id) on delete cascade,
  a_device              text not null,
  estado                text not null default 'pendiente'
                        check (estado in ('pendiente', 'aceptado', 'rechazado', 'revocado')),
  mensaje               text check (mensaje is null or char_length(mensaje) <= 280),
  -- Lo que el SOLICITANTE pidió (informativo) vs. lo que el RECEPTOR concedió
  -- al aceptar (autoritativo para el vínculo ya activo). Forma:
  -- {"ia": boolean, "archivos": boolean, "capacidades": boolean}.
  permisos_solicitados  jsonb not null default '{}'::jsonb,
  permisos              jsonb not null default '{}'::jsonb,
  -- HKDF salt aleatoria por vínculo (hex), generada por el servidor al
  -- solicitar (ver `solicitar_vinculo`). No es secreta: ver SOP §2.
  sal                   text not null,
  -- Claves públicas ECDH P-256 (JWK) por dispositivo — no PII, se publican
  -- para que el otro lado derive el secreto de par (ver SOP §2).
  de_pub                jsonb,
  a_pub                 jsonb,
  -- Buzón de RESPALDO de señalización WebRTC (HMAC-firmada en el cliente,
  -- ver `par-signaling.ts`). Arrays acotados a 40 entradas (recorte en
  -- `enviar_senal_vinculo`, ver abajo).
  buzon_de              jsonb not null default '[]'::jsonb,
  buzon_a               jsonb not null default '[]'::jsonb,
  created_at            timestamptz not null default now(),
  resuelto_at           timestamptz,
  revocado_at           timestamptz,
  revocado_por          uuid references auth.users(id),
  check (de_owner <> a_owner)
);

create index if not exists os_mesh_vinculos_de_owner_idx
  on public.os_mesh_vinculos (de_owner, created_at desc);
create index if not exists os_mesh_vinculos_a_owner_idx
  on public.os_mesh_vinculos (a_owner, estado);
create index if not exists os_mesh_vinculos_estado_idx
  on public.os_mesh_vinculos (estado);
-- Anti-flood: recuento de solicitudes recientes por dispositivo emisor.
create index if not exists os_mesh_vinculos_de_device_recent_idx
  on public.os_mesh_vinculos (de_owner, de_device, created_at desc);

alter table public.os_mesh_vinculos enable row level security;

-- RLS · LECTURA: solo los DOS participantes ven la fila (ninguna es pública).
drop policy if exists os_mesh_vinculos_select on public.os_mesh_vinculos;
create policy os_mesh_vinculos_select
  on public.os_mesh_vinculos for select
  to authenticated
  using (auth.uid() = de_owner or auth.uid() = a_owner);

-- Sin políticas de INSERT/UPDATE/DELETE para `authenticated` (ver cabecera):
-- toda escritura pasa por las 4 funciones SECURITY DEFINER de abajo.

-- ── solicitar_vinculo: crea la solicitud, resolviendo a_owner por el faro ────
drop function if exists public.solicitar_vinculo(text, text, text, jsonb, jsonb);

create function public.solicitar_vinculo(
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
  -- server-relay.ts, 4 min) cuyo `sid` (syncDeviceId) coincide con el
  -- destino. El cliente nunca lee `owner_id`: lo resuelve el servidor.
  select owner_id into v_a_owner
    from public.os_mesh_relay
   where kind = 'beacon'
     and payload ->> 'sid' = p_a_device
     and created_at > now() - interval '4 minutes'
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

-- ── resolver_vinculo: el RECEPTOR acepta o rechaza (una sola vez) ────────────
drop function if exists public.resolver_vinculo(uuid, text, jsonb, jsonb);

create function public.resolver_vinculo(
  p_vinculo_id uuid,
  p_estado text,
  p_permisos jsonb default '{}'::jsonb,
  p_a_pub jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_rows int;
begin
  if v_uid is null then
    raise exception 'resolver_vinculo: se requiere sesión';
  end if;
  if p_estado not in ('aceptado', 'rechazado') then
    raise exception 'resolver_vinculo: estado inválido (%), solo aceptado/rechazado', p_estado;
  end if;
  if p_estado = 'aceptado' and p_a_pub is null then
    raise exception 'resolver_vinculo: aceptar requiere la clave pública del dispositivo (p_a_pub)';
  end if;

  if p_estado = 'aceptado' then
    update public.os_mesh_vinculos
       set estado = 'aceptado',
           permisos = coalesce(p_permisos, '{}'::jsonb),
           a_pub = p_a_pub,
           resuelto_at = now()
     where id = p_vinculo_id and a_owner = v_uid and estado = 'pendiente';
  else
    update public.os_mesh_vinculos
       set estado = 'rechazado', resuelto_at = now()
     where id = p_vinculo_id and a_owner = v_uid and estado = 'pendiente';
  end if;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    raise exception 'resolver_vinculo: no hay solicitud pendiente % dirigida a ti', p_vinculo_id;
  end if;

  return jsonb_build_object('ok', true, 'id', p_vinculo_id, 'estado', p_estado);
end;
$$;

revoke execute on function public.resolver_vinculo(uuid, text, jsonb, jsonb) from public;
revoke execute on function public.resolver_vinculo(uuid, text, jsonb, jsonb) from anon;
grant execute on function public.resolver_vinculo(uuid, text, jsonb, jsonb) to authenticated;

-- ── revocar_vinculo: CUALQUIERA de los dos lados corta el vínculo ───────────
drop function if exists public.revocar_vinculo(uuid);

create function public.revocar_vinculo(p_vinculo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_rows int;
begin
  if v_uid is null then
    raise exception 'revocar_vinculo: se requiere sesión';
  end if;

  update public.os_mesh_vinculos
     set estado = 'revocado', revocado_at = now(), revocado_por = v_uid
   where id = p_vinculo_id
     and (de_owner = v_uid or a_owner = v_uid)
     and estado in ('pendiente', 'aceptado');
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    raise exception 'revocar_vinculo: vínculo % no encontrado o ya resuelto', p_vinculo_id;
  end if;

  return jsonb_build_object('ok', true, 'id', p_vinculo_id);
end;
$$;

revoke execute on function public.revocar_vinculo(uuid) from public;
revoke execute on function public.revocar_vinculo(uuid) from anon;
grant execute on function public.revocar_vinculo(uuid) to authenticated;

-- ── enviar_senal_vinculo: apéndice al buzón de RESPALDO de señalización ─────
-- Solo con el vínculo YA 'aceptado' (antes de eso no hay secreto de par con
-- el que el receptor pueda verificar el HMAC de la señal). Recorta cada
-- buzón a las últimas 40 entradas (mismo espíritu que MAX_SIGNALS en
-- `signaling.ts`).
drop function if exists public.enviar_senal_vinculo(uuid, jsonb);

create function public.enviar_senal_vinculo(p_vinculo_id uuid, p_senal jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_row     public.os_mesh_vinculos;
  v_mailbox jsonb;
  v_is_de   boolean;
begin
  if v_uid is null then
    raise exception 'enviar_senal_vinculo: se requiere sesión';
  end if;
  if p_senal is null then
    raise exception 'enviar_senal_vinculo: falta la señal';
  end if;
  if octet_length(p_senal::text) > 8192 then
    raise exception 'enviar_senal_vinculo: señal demasiado grande';
  end if;

  select * into v_row from public.os_mesh_vinculos where id = p_vinculo_id for update;
  if v_row.id is null then
    raise exception 'enviar_senal_vinculo: vínculo % no encontrado', p_vinculo_id;
  end if;
  if v_row.estado <> 'aceptado' then
    raise exception 'enviar_senal_vinculo: el vínculo no está activo';
  end if;
  if v_uid <> v_row.de_owner and v_uid <> v_row.a_owner then
    raise exception 'enviar_senal_vinculo: no eres parte de este vínculo';
  end if;

  v_is_de := (v_uid = v_row.de_owner);
  v_mailbox := coalesce(case when v_is_de then v_row.buzon_de else v_row.buzon_a end, '[]'::jsonb)
               || jsonb_build_array(p_senal);
  if jsonb_array_length(v_mailbox) > 40 then
    select jsonb_agg(elem order by ord) into v_mailbox
      from jsonb_array_elements(v_mailbox) with ordinality as t(elem, ord)
     where ord > jsonb_array_length(v_mailbox) - 40;
  end if;

  if v_is_de then
    update public.os_mesh_vinculos set buzon_de = v_mailbox where id = p_vinculo_id;
  else
    update public.os_mesh_vinculos set buzon_a = v_mailbox where id = p_vinculo_id;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.enviar_senal_vinculo(uuid, jsonb) from public;
revoke execute on function public.enviar_senal_vinculo(uuid, jsonb) from anon;
grant execute on function public.enviar_senal_vinculo(uuid, jsonb) to authenticated;

-- ── Realtime: entrega instantánea de solicitudes/aceptación/señales ─────────
-- Mismo arreglo que 20260803120000_realtime_os_mesh_relay.sql: sin ser
-- miembro de la publicación, un canal `postgres_changes` sobre esta tabla
-- jamás recibe eventos (todo caería al sondeo). `replica identity full` para
-- que UPDATE (aceptar/rechazar/revocar/buzón) lleve la fila completa.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'os_mesh_vinculos'
  ) then
    alter publication supabase_realtime add table public.os_mesh_vinculos;
  end if;
end
$$;

alter table public.os_mesh_vinculos replica identity full;
