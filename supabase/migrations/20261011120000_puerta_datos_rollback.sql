-- Vuelta atrás de 20261011120000_puerta_datos.sql (PDA1010). No toca relevo_eventos,
-- neuron_devices ni os_presencia: lo que la puerta ya replicó allí se queda (son datos normales).
DROP FUNCTION IF EXISTS public.puerta_datos_replicar(text, jsonb);
DROP FUNCTION IF EXISTS public.puerta_datos_registrar_llave(text, text);
DROP FUNCTION IF EXISTS public._puerta_datos_fecha(text);
DROP TABLE IF EXISTS public.puerta_datos_espejo;
DROP TABLE IF EXISTS public.os_puerta_datos;
DROP TABLE IF EXISTS public.puerta_datos_llaves;
