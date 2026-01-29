# SOP: Authentication (Supabase Auth)

**Goal**: Securely manage user identities and link them to the `profiles` table in our database.

## 1. Principles
- **Supabase Auth as Source**: The `auth.users` table is the source of truth for credentials (email/password, OAuth).
- **Profile Sync**: Every `auth.user` MUST have a corresponding `public.profile` record.
- **Triggers**: Use Database Triggers to automatically create a profile upon user signup.
- **Middleware**: Protect private routes using Next.js Middleware.

## 2. Authentication Flow
1.  **Sign Up**: User provides Email/Password.
2.  **Trigger**: `on_auth_user_created` trigger fires.
    - Creates a record in `public.profiles`.
    - Generates a default `handle` (e.g., `user_[random_string]`).
    - Sets default `avatar_url`.
3.  **Sign In**: User signs in.
4.  **Session**: Supabase manages the session (JWT).
5.  **Context**: The application fetches the `profile` using the `user_id` from the session.

## 3. Database Triggers (Implementation Plan)
We need to create a function and trigger in Postgres:

```sql
-- Function to handle new user
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (user_id, handle, display_name, type)
  values (
    new.id,
    'user_' || substr(md5(random()::text), 1, 8), -- Temporary unique handle
    split_part(new.email, '@', 1), -- Default display name from email
    'OFFICIAL' -- Default type
  );
  return new;
end;
$$;

-- Trigger
create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

## 4. Middleware Protection
- Public Routes: `/`, `/login`, `/signup`, `/auth/*`
- Protected Routes: `/dashboard`, `/profile/*`, `/settings`
