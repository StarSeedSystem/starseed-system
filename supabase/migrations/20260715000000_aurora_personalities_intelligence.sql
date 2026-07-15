-- Adenda 70 · Hermione: inteligencia por personalidad en aurora_personalities
-- Añade la columna `intelligence` (jsonb) a la tabla legacy `aurora_personalities`
-- para que las personalidades respaldadas en BD (p.ej. "Hermione") puedan fijar
-- su fuente/modelo de inteligencia (Adenda 67 · P3), igual que los
-- PersonalityProfile nuevos. Por defecto ausente ⇒ el router manda (gratis-primero).
--
-- Seguridad: la tabla ya tiene RLS por owner; la nueva columna hereda la misma
-- política (no se toca el USING/CHECK de las filas existentes).

ALTER TABLE public.aurora_personalities
  ADD COLUMN IF NOT EXISTS intelligence jsonb;

COMMENT ON COLUMN public.aurora_personalities.intelligence IS
  'Bloque de inteligencia de la personalidad (Adenda 67 · P3). '
  'Estructura: { modo: "auto"|"fija", global?: {fuente,modelo}, '
  'porSentido?: Record<sentido,{fuente,modelo}>, motorVoz?, permitirPago: boolean }. '
  'Ausente o modo "auto" ⇒ Aurora elige la mejor opción GRATUITA (comportamiento normal).';

-- Índice parcial para consultas de personalidades fijadas (ligero, opcional).
-- No se crea índice pesado: la tabla es pequeña (personalidades por cuenta).
