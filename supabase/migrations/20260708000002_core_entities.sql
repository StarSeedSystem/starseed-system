-- Core entities for StarSeed OS (Profiles, Pages, Groups, Posts, Canvases)

-- 1. Profiles
create table if not exists public.os_account_profiles (
  id uuid primary key default gen_random_uuid(),
  account uuid not null references auth.users(id),
  handle text unique,
  name text not null,
  kind text default 'personal',
  avatar_url text,
  cover_url text,
  bio text,
  is_default boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.os_account_profiles enable row level security;
create policy "os_account_profiles_select" on public.os_account_profiles for select using (true);
create policy "os_account_profiles_all" on public.os_account_profiles for all using (account = auth.uid());

-- 2. Pages
create table if not exists public.os_pages (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  name text not null,
  kind text,
  owner_id uuid not null references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.os_pages enable row level security;
create policy "os_pages_select" on public.os_pages for select using (true);
create policy "os_pages_all" on public.os_pages for all using (owner_id = auth.uid());

-- 3. Groups
create table if not exists public.os_groups (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  name text not null,
  owner_id uuid not null references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.os_groups enable row level security;
create policy "os_groups_select" on public.os_groups for select using (true);
create policy "os_groups_all" on public.os_groups for all using (owner_id = auth.uid());

-- 4. Memberships
create table if not exists public.os_memberships (
  user_id uuid not null references auth.users(id),
  group_slug text not null,
  role text not null default 'member',
  created_at timestamptz default now(),
  primary key (user_id, group_slug)
);
alter table public.os_memberships enable row level security;
create policy "os_memberships_select" on public.os_memberships for select using (true);
create policy "os_memberships_all" on public.os_memberships for all using (user_id = auth.uid());

-- 5. Posts
create table if not exists public.os_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id),
  type text not null,
  content jsonb default '{}',
  visibility text default 'PUBLIC',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.os_posts enable row level security;
create policy "os_posts_select" on public.os_posts for select using (visibility = 'PUBLIC' or author_id = auth.uid());
create policy "os_posts_all" on public.os_posts for all using (author_id = auth.uid());

-- 6. Canvases
create table if not exists public.canvases (
  id uuid primary key default gen_random_uuid(),
  owner uuid references auth.users(id),
  scope text not null,
  scope_ref text,
  title text not null default 'Lienzo',
  blocks jsonb default '[]',
  shared boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.canvases enable row level security;
create policy "canvases_select" on public.canvases for select using (shared = true or owner = auth.uid());
create policy "canvases_all" on public.canvases for all using (owner = auth.uid());
alter publication supabase_realtime add table public.os_spaces;
alter publication supabase_realtime add table public.os_account_profiles;
alter publication supabase_realtime add table public.os_pages;
alter publication supabase_realtime add table public.os_groups;
alter publication supabase_realtime add table public.os_posts;
alter publication supabase_realtime add table public.canvases;
