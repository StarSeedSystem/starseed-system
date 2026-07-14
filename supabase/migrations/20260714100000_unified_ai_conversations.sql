-- ============================================================================
-- StarSeed OS · Adenda 69 · I-1 — CONVERSACIONES UNIFICADAS Aurora ↔ Astraura AI
-- ----------------------------------------------------------------------------
-- PROBLEMA (mapeado contra la BD real y el código, 2026-07-13):
--   · Aurora (orbe / mini-reproductor / Exocórtex) guardaba su historial SOLO en
--     localStorage (`starseed.aurora.chatlog.v1`), agrupado por día, y viajaba
--     como una clave más dentro de `user_settings.prefs` (un blob que crece).
--   · La sección de chats de Astraura AI (`/agent`) NO persistía nada: su chat
--     era `useState<ChatTurn[]>` en memoria; al recargar, se perdía.
--   · La tabla `astraura_messages` EXISTÍA (y está en la publicación realtime),
--     pero tenía RLS con **una sola política, de SELECT** (`am_own_select`):
--     ninguna escritura desde el cliente era posible → 0 filas. `publish.ts`
--     inserta ahí desde hace meses y fallaba en silencio.
--
-- SOLUCIÓN: un ÚNICO modelo de conversación en la nube, compartido por las dos
-- superficies:
--   · `aurora_conversations` — la conversación (dueño, perfil, título,
--     personalidad, fuente/modelo, superficie de origen, fechas).
--   · `astraura_messages`    — sus mensajes (se REUTILIZA la tabla existente:
--     ya tiene user_id/profile_id/chat_id/role/content/source/created_at y ya
--     está en `supabase_realtime`). Se le añaden `meta`, `attachments`,
--     `client_id` (dedupe idempotente) y `updated_at`, y las políticas RLS de
--     escritura que le faltaban.
--
-- Idempotente: se puede aplicar varias veces sin efecto adicional.
-- ============================================================================

-- ── 1) Conversaciones ───────────────────────────────────────────────────────
create table if not exists public.aurora_conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid(),
  -- Perfil/faceta al que se asocia la conversación. `profile_key` es TEXT
  -- porque los perfiles del OS se identifican en cliente con ids libres
  -- (no siempre uuid); `profile_id` se rellena solo cuando ES un uuid.
  profile_id  uuid,
  profile_key text,
  title       text,
  -- 'aurora' (orbe/exocórtex) | 'astraura' (/agent) | 'multichat' | 'publish'…
  kind        text not null default 'aurora',
  persona     text,          -- personalidad de Aurora usada
  source      text,          -- última fuente/proveedor usado (routing Astraura)
  model       text,          -- último modelo usado
  surface     text,          -- 'orb' | 'exocortex' | 'agent' | 'mini' | 'desktop'
  meta        jsonb,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.aurora_conversations enable row level security;

do $$
begin
  if not exists (select 1 from pg_policy where polname = 'ac_own_all' and polrelid = 'public.aurora_conversations'::regclass) then
    create policy ac_own_all on public.aurora_conversations
      for all to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;
end $$;

create index if not exists aurora_conversations_user_updated_idx
  on public.aurora_conversations (user_id, updated_at desc);

-- ── 2) Mensajes (tabla existente, ampliada) ─────────────────────────────────
alter table public.astraura_messages
  add column if not exists meta        jsonb,
  add column if not exists attachments jsonb,
  add column if not exists client_id   text,
  add column if not exists updated_at  timestamptz not null default now();

-- Dedupe idempotente: el mismo mensaje (mismo `client_id` determinista) nunca
-- se inserta dos veces, aunque migren varios dispositivos a la vez.
-- NO es un índice PARCIAL a propósito: PostgREST emite `ON CONFLICT (user_id,
-- client_id) DO NOTHING` sin cláusula WHERE, y Postgres solo puede inferir un
-- índice parcial si el statement repite su predicado. Con un índice completo la
-- inferencia funciona, y los `client_id` NULL siguen sin colisionar entre sí
-- (en un índice único, NULL es distinto de NULL).
drop index if exists public.astraura_messages_user_client_uidx;
create unique index if not exists astraura_messages_user_client_uidx
  on public.astraura_messages (user_id, client_id);

create index if not exists astraura_messages_user_chat_created_idx
  on public.astraura_messages (user_id, chat_id, created_at);

-- RLS: SOLO existía `am_own_select` (lectura). Sin INSERT/UPDATE/DELETE, la
-- tabla era de solo lectura para todo el mundo → jamás se escribió nada.
do $$
begin
  if not exists (select 1 from pg_policy where polname = 'am_own_insert' and polrelid = 'public.astraura_messages'::regclass) then
    create policy am_own_insert on public.astraura_messages
      for insert to authenticated
      with check (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policy where polname = 'am_own_update' and polrelid = 'public.astraura_messages'::regclass) then
    create policy am_own_update on public.astraura_messages
      for update to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policy where polname = 'am_own_delete' and polrelid = 'public.astraura_messages'::regclass) then
    create policy am_own_delete on public.astraura_messages
      for delete to authenticated
      using (user_id = auth.uid());
  end if;
end $$;

-- ── 3) Tiempo real ──────────────────────────────────────────────────────────
-- `astraura_messages` YA estaba en la publicación. Añadimos las conversaciones.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'aurora_conversations'
  ) then
    alter publication supabase_realtime add table public.aurora_conversations;
  end if;
end $$;

-- ── 4) `updated_at` de la conversación al llegar un mensaje ─────────────────
create or replace function public.touch_aurora_conversation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.chat_id is not null then
    update public.aurora_conversations
       set updated_at = greatest(updated_at, coalesce(new.created_at, now())),
           source     = coalesce(new.source, source)
     where id::text = new.chat_id
       and user_id  = new.user_id;
  end if;
  return new;
end $$;

drop trigger if exists astraura_messages_touch_conv on public.astraura_messages;
create trigger astraura_messages_touch_conv
  after insert on public.astraura_messages
  for each row execute function public.touch_aurora_conversation();
