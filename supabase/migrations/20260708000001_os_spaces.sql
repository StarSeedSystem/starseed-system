-- Create os_spaces and os_space_editors tables
create table if not exists public.os_spaces (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('desktop', 'dashboard', 'board')),
  title text not null default 'Espacio sin título',
  owner_account uuid not null references auth.users(id),
  anchor_profile uuid,
  access text not null default 'private' check (access in ('private', 'profiles', 'invite', 'public')),
  allowed_profiles uuid[] default '{}',
  group_slug text,
  doc jsonb default '{}',
  device_id text,
  rev integer default 0,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

create table if not exists public.os_space_editors (
  space_id uuid not null references public.os_spaces(id) on delete cascade,
  account uuid not null references auth.users(id),
  role text not null default 'editor' check (role in ('editor', 'viewer')),
  status text not null default 'member' check (status in ('member', 'invited', 'pending')),
  created_at timestamptz default now(),
  primary key (space_id, account)
);

-- Trigger to increment rev on doc update
create or replace function public.inc_os_space_rev()
returns trigger as $$
begin
  if new.doc is distinct from old.doc then
    new.rev = old.rev + 1;
    new.updated_at = now();
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_os_spaces_rev on public.os_spaces;
create trigger trg_os_spaces_rev
  before update on public.os_spaces
  for each row execute function public.inc_os_space_rev();

-- RLS
alter table public.os_spaces enable row level security;
alter table public.os_space_editors enable row level security;

-- Owner has full access to os_spaces
create policy "os_spaces_owner_all" on public.os_spaces
  for all using (owner_account = auth.uid());

-- Select policy: public access or invited/member access
create policy "os_spaces_select" on public.os_spaces
  for select using (
    access = 'public' or
    owner_account = auth.uid() or
    exists (
      select 1 from public.os_space_editors e 
      where e.space_id = id and e.account = auth.uid()
    )
  );

-- Update policy: owner or member editor
create policy "os_spaces_update" on public.os_spaces
  for update using (
    owner_account = auth.uid() or
    exists (
      select 1 from public.os_space_editors e 
      where e.space_id = id and e.account = auth.uid() and e.role = 'editor' and e.status = 'member'
    )
  );

-- Owner has full access to os_space_editors
create policy "os_space_editors_owner_all" on public.os_space_editors
  for all using (
    exists (
      select 1 from public.os_spaces s 
      where s.id = space_id and s.owner_account = auth.uid()
    )
  );

-- Select policy: I can see my own editor rows, or anyone can see if they can read the space
create policy "os_space_editors_select" on public.os_space_editors
  for select using (
    account = auth.uid() or
    exists (
      select 1 from public.os_spaces s 
      where s.id = space_id and (s.access = 'public' or s.owner_account = auth.uid())
    )
  );

-- Update policy: I can update my own row (e.g. to accept invite)
create policy "os_space_editors_update_own" on public.os_space_editors
  for update using (account = auth.uid());
