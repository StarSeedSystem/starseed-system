# SOP: Database Management (Supabase)

**Goal**: Maintain a deterministic, secure, and self-documenting database schema using Supabase.

## 1. Principles
- **Schema First**: All changes must be defined in `gemini.md` before applying.
- **Migrations Only**: Never execute raw DDL via `execute_sql`. Always use `apply_migration`.
- **Security**: Row Level Security (RLS) MUST be enabled on every table.
- **Idempotency**: Migrations should be safe to run multiple times if possible (use `IF NOT EXISTS`).

## 2. Workflow
1.  **Define**: Update JSON schema in `gemini.md`.
2.  **Draft**: Write SQL migration in a temporary file or scratchpad.
3.  **Apply**: Use `apply_migration` tool.
4.  **Verify**: Check `list_tables` or `generate_typescript_types`.

## 3. Naming Conventions
- **Tables**: `snake_case`, plural (e.g., `profiles`, `posts`).
- **Columns**: `snake_case` (e.g., `avatar_url`, `created_at`).
- **Foreign Keys**: `target_id` (e.g., `user_id`, `page_id`).
- **Types**: `PascalCase` (in TypeScript).

## 4. Standard Schema Patterns
### IDs
Use `uuid` as the primary key type, defaulting to `gen_random_uuid()`.

### Timestamps
Include `created_at` (default `now()`) and `updated_at` (managed by trigger) on all entities.

### RLS Policies
- `Enable Read Access for All` (if public).
- `Enable Insert/Update for Owners` (check `auth.uid()`).
