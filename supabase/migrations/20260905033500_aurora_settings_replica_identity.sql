-- aurora_settings no tiene clave primaria y está en la publicación de Realtime: sin
-- identidad de réplica Postgres rechaza cualquier DELETE («cannot delete from table
-- "aurora_settings" because it does not have a replica identity and publishes deletes»).
-- Apareció el 2026-09-05 al borrar la cuenta maggasukha@star.seed para volver a probar la
-- bienvenida. Aplicada ya en el proyecto pqzdpmedcsgcedkvndzl (migración
-- aurora_settings_replica_identity_full); este archivo la deja en el repo.
alter table public.aurora_settings replica identity full;
