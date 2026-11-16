-- ════════════════════════════════════════════════════════════════════════════
-- SAJ01 — Ajustes de os_senales_publicas tras el ensayo de la dirección (16-11).
-- NO APLICAR sin que la dirección lo ordene · reversa: 20261116140000_senales_publicas_ajustes_rollback.sql
-- ----------------------------------------------------------------------------
-- 1) Borrar una cuenta borra sus señales publicadas (convención de la base:
--    ON DELETE CASCADE). Antes la clave ajena impedía borrar la cuenta.
-- 2) Se quitan a `authenticated` los permisos de sobra que deja el valor por
--    defecto de la base (TRUNCATE no pasa por las políticas de fila).
-- 3) Tope de 400 filas por cuenta: al llegar al tope se borran las filas PROPIAS
--    medidas hace más de 24 horas (ya nadie más las veía: se leen 15 minutos) y,
--    si aun así no cabe, se rechaza. Refrescar una fila que ya existe siempre cabe.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.os_senales_publicas
  DROP CONSTRAINT IF EXISTS os_senales_publicas_owner_id_fkey;
ALTER TABLE public.os_senales_publicas
  ADD CONSTRAINT os_senales_publicas_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.os_senales_publicas FROM authenticated;

CREATE OR REPLACE FUNCTION public.os_senales_publicas_tope()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.os_senales_publicas s
    WHERE s.owner_id = NEW.owner_id AND s.device_id = NEW.device_id
      AND s.medio = NEW.medio AND s.banda = NEW.banda
      AND COALESCE(s.frecuencia_khz, 0) = COALESCE(NEW.frecuencia_khz, 0)
  ) THEN
    RETURN NEW;
  END IF;
  IF (SELECT count(*) FROM public.os_senales_publicas WHERE owner_id = NEW.owner_id) >= 400 THEN
    DELETE FROM public.os_senales_publicas
     WHERE owner_id = NEW.owner_id AND medido_en < now() - interval '24 hours';
    IF (SELECT count(*) FROM public.os_senales_publicas WHERE owner_id = NEW.owner_id) >= 400 THEN
      RAISE EXCEPTION 'os_senales_publicas: tope de 400 señales por cuenta'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.os_senales_publicas_tope() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS os_senales_publicas_tope_trg ON public.os_senales_publicas;
CREATE TRIGGER os_senales_publicas_tope_trg
  BEFORE INSERT ON public.os_senales_publicas
  FOR EACH ROW EXECUTE FUNCTION public.os_senales_publicas_tope();