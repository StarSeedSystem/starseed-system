-- Rollback de 20260927100000_storage_credentials.sql — Ola 374.
-- Elimina la tabla de custodia de credenciales de almacenamiento externo.
-- ⚠️ Esto BORRA cualquier conexión Google Drive guardada en servidor: tras
-- aplicar este rollback, todas las cuentas deberán reconectar Google Drive.

drop index if exists public.storage_credentials_user_idx;
drop table if exists public.storage_credentials;
