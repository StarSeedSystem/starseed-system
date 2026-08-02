-- ════════════════════════════════════════════════════════════════════════════
-- Endurecimiento OTP — tabla `ss_otp` como FUENTE DE VERDAD del login por código
-- (Arreglo de seguridad · 2026-08-02)
-- ----------------------------------------------------------------------------
-- CONTEXTO / BRECHA:
--   El login sin contraseña (@star.seed) generaba el código con Math.random()
--   (no CSPRNG) y lo verificaba leyendo el TEXTO del correo en `ss_mail`, SIN
--   límite de intentos, SIN un solo uso y SIN rate-limit. Un atacante podía
--   forzar por fuerza bruta los 10^6 códigos y aceptar cualquiera de los últimos
--   N correos.
--
-- ARREGLO (lado app en /api/auth/otp/{request,verify}):
--   · Código con CSPRNG (crypto.randomInt).
--   · `ss_mail` queda como CANAL de entrega (bandeja del OS); la VERIFICACIÓN
--     usa esta tabla `ss_otp`, que guarda el HASH del código (HMAC-SHA256), su
--     expiración, un contador de intentos y un flag de un solo uso.
--   · Límite de intentos por código (5) → invalida al agotarse.
--   · Un solo uso: consumo ATÓMICO (update consumed=false→true) al acertar.
--   · Rate-limit por IP/email en memoria (defensa complementaria, no distribuida).
--
-- SEGURIDAD DE LA TABLA:
--   RLS HABILITADA y SIN políticas ⇒ ningún rol de cliente (anon/authenticated)
--   puede leer ni escribir `ss_otp`. Sólo la SERVICE_ROLE (que BYPASSEA RLS) la
--   usa desde las API routes de servidor. Así los hashes/estado nunca se exponen
--   al navegador. El código en claro sólo vive, efímero, en la bandeja del propio
--   usuario (ss_mail, con su RLS por dueño).
--
-- ADITIVA e IDEMPOTENTE (create … if not exists). No borra datos ni toca otras
-- tablas. Aplicar en el proyecto del OS (nxstilnyidvkqeosofuh). El .sql es la
-- fuente de verdad.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.ss_otp (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  user_id    uuid,                                   -- puede ser null (cuenta no hallada)
  code_hash  text not null,                          -- HMAC-SHA256(email:code), nunca el código en claro
  expires_at timestamptz not null,
  attempts   integer not null default 0,             -- intentos fallidos consumidos
  consumed   boolean not null default false,         -- true = usado o invalidado (un solo uso)
  ip         text,                                   -- IP que pidió el código (telemetría/abuso)
  created_at timestamptz not null default now()
);

-- Índice para la consulta caliente de /verify: último código NO consumido por email.
create index if not exists idx_ss_otp_email_active
  on public.ss_otp (email, created_at desc)
  where consumed = false;

-- Índice auxiliar para purga por expiración (limpieza futura por cron/tarea).
create index if not exists idx_ss_otp_expires_at
  on public.ss_otp (expires_at);

-- RLS ON, SIN políticas: bloquea a anon/authenticated por completo. Sólo la
-- service_role (bypass RLS) accede desde el servidor.
alter table public.ss_otp enable row level security;

-- (Sin políticas a propósito: RLS deniega por defecto todo lo no cubierto.)

comment on table public.ss_otp is
  'OTP sin contraseña (StarSeed). Fuente de verdad de la verificación: hash del código, expiración, intentos y un solo uso. RLS sin políticas: sólo service_role. Adenda seguridad 2026-08-02.';

-- ── Reserva ATÓMICA de intento (cierre de la fuerza bruta concurrente, rev. adversarial) ──
-- El incremento read-modify-write de `attempts` en el route PERDÍA incrementos bajo
-- concurrencia (N conjeturas simultáneas leían attempts=0 y todas escribían 1) → el tope
-- de 5 no se aplicaba → fuerza bruta viable. Esta función BLOQUEA la fila del último código
-- activo del email (`for update`, que SERIALIZA las llamadas concurrentes) y RESERVA un
-- intento ANTES de que el route compare el hash: así solo pueden ocurrir 5 comparaciones por
-- código, pase lo que pase con la concurrencia. Devuelve el hash/expiración SOLO si quedaba
-- intento; si no, `blocked=true` (y marca el código consumido). SECURITY DEFINER: la usa el
-- route con service_role, pero se blinda igual. Un solo código activo por email (el más nuevo).
drop function if exists public.otp_claim_attempt(text, integer);
create function public.otp_claim_attempt(p_email text, p_max int)
returns table (id uuid, code_hash text, expires_at timestamptz, attempts int, blocked boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid; v_hash text; v_exp timestamptz; v_att int; v_max int;
begin
  v_max := least(greatest(coalesce(p_max, 5), 1), 10);  -- clamp defensivo: no confiar en el parámetro del llamador
  select o.id, o.code_hash, o.expires_at, o.attempts
    into v_id, v_hash, v_exp, v_att
  from public.ss_otp o
  where o.email = p_email and o.consumed = false
  order by o.created_at desc, o.id desc         -- determinista ante empate de created_at
  limit 1
  for update;                                    -- serializa las llamadas concurrentes al mismo código

  if v_id is null then
    return query select null::uuid, null::text, null::timestamptz, 0, true; return;
  end if;
  if v_att >= v_max or v_exp <= now() then
    update public.ss_otp set consumed = true where public.ss_otp.id = v_id;  -- agotado/caducado → invalida
    return query select v_id, null::text, v_exp, v_att, true; return;        -- NO devuelve el hash al bloquear
  end if;
  update public.ss_otp set attempts = attempts + 1 where public.ss_otp.id = v_id;  -- reserva un intento
  return query select v_id, v_hash, v_exp, v_att + 1, false;
end;
$$;
-- ⚠️ SEGURIDAD: las funciones SECURITY DEFINER se conceden a PUBLIC por defecto. Como ésta
-- BYPASSA la RLS de ss_otp (lee hashes, invalida códigos), NO puede ser invocable por anon/
-- authenticated (con la anon key pública se podría hacer DoS de login o filtrar el hash). Se
-- REVOCA de public/anon/authenticated y se concede SOLO a service_role (que usa el route de
-- servidor). Revisión adversarial Adenda 130.
revoke all on function public.otp_claim_attempt(text, int) from public;
revoke all on function public.otp_claim_attempt(text, int) from anon;
revoke all on function public.otp_claim_attempt(text, int) from authenticated;
grant execute on function public.otp_claim_attempt(text, int) to service_role;
