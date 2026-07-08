-- Create os_files table
create table if not exists public.os_files (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id),
  profile_id uuid,
  name text not null,
  mime text,
  size bigint,
  path text not null,
  url text,
  device_id text,
  is_public boolean default false,
  acl_read uuid[] default '{}',
  acl_write uuid[] default '{}',
  group_slug text,
  meta jsonb default '{}',
  created_at timestamptz default now()
);

alter table public.os_files enable row level security;

create policy "os_files_own" on public.os_files
  for all using (owner = auth.uid());

create policy "os_files_select" on public.os_files
  for select using (
    is_public = true or 
    owner = auth.uid() or 
    auth.uid() = any(acl_read) or 
    auth.uid() = any(acl_write)
  );

create policy "os_files_shared_write" on public.os_files
  for update using (auth.uid() = any(acl_write));


-- Create storage buckets
insert into storage.buckets (id, name, public) 
values ('os-files', 'os-files', true)
on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public) 
values ('os-media', 'os-media', true)
on conflict (id) do update set public = true;

-- Storage policies for os-files
create policy "os_files_bucket_select" on storage.objects
  for select using (bucket_id = 'os-files');

create policy "os_files_bucket_insert" on storage.objects
  for insert with check (
    bucket_id = 'os-files' and 
    (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "os_files_bucket_update" on storage.objects
  for update using (
    bucket_id = 'os-files' and 
    (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "os_files_bucket_delete" on storage.objects
  for delete using (
    bucket_id = 'os-files' and 
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Storage policies for os-media
create policy "os_media_bucket_select" on storage.objects
  for select using (bucket_id = 'os-media');

create policy "os_media_bucket_insert" on storage.objects
  for insert with check (bucket_id = 'os-media');

create policy "os_media_bucket_update" on storage.objects
  for update using (bucket_id = 'os-media');

create policy "os_media_bucket_delete" on storage.objects
  for delete using (bucket_id = 'os-media');
