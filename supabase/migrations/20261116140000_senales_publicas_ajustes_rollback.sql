-- Reversa de SAJ01 (20261116140000_senales_publicas_ajustes.sql).
-- NO APLICAR sin que la dirección lo ordene. No borra datos.
-- Los permisos de sobra (TRUNCATE, REFERENCES, TRIGGER) NO se devuelven: quitarlos no rompe nada.
DROP TRIGGER IF EXISTS os_senales_publicas_tope_trg ON public.os_senales_publicas;
DROP FUNCTION IF EXISTS public.os_senales_publicas_tope();
ALTER TABLE public.os_senales_publicas
  DROP CONSTRAINT IF EXISTS os_senales_publicas_owner_id_fkey;
ALTER TABLE public.os_senales_publicas
  ADD CONSTRAINT os_senales_publicas_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES auth.users(id);