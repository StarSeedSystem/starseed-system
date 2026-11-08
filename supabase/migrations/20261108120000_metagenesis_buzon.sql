-- ═══════════════════════════════════════════════════════════════════════════
-- Síntesis diaria sin la Mac · buzón Claude nube → Telegram y parte diario
-- (BZN1108A · 2026-11-08 · ESCRITA, NO APLICADA: la aplica la publicación de siempre)
-- ───────────────────────────────────────────────────────────────────────────
-- QUÉ: la «Síntesis diaria · Producción StarSeed» (07:54 CDMX) la escribe una
-- tarea programada de Claude que corre EN LA NUBE. Esa sesión solo llega a
-- Supabase (por su conector MCP con SQL), a Drive y a la web: sin llaves de
-- nodo, ni de la puerta del A1, ni de Telegram — y NO debe tenerlas. El buzón
-- es el sello del camino:
--   1. Claude nube INSERTA en esta tabla por SQL:
--        aviso  → lo entrega al Telegram vinculado (BZN1108B, líder de dirección
--                 IND1029B con `hermes send`, IND1029G);
--        parte  → texto del parte diario que la propia Claude nube releerá
--                 (BZN1108C) para su panorámica sin la Mac encendida.
--   2. La entrega marca el estado ('entregado' | 'fallo' + detalle).
--
-- SEGURIDAD
--   · RLS ACTIVADA y SIN políticas para anon ni authenticated: solo service_role
--     y postgres tocan la tabla (el conector de Claude y los nodos, con la clave
--     de servicio). La web publicada y las personas no ven ni escriben nada.
--   · Lista blanca cerrada: un aviso solo puede ir a telegram:Maggasukha.
--   · Sin claves ni valores secretos: aquí solo van textos, clases y estados.
--
-- Contrato: architecture/buzon-claude-nube-telegram.md
-- (IND1029: líder y Hermes en el líder · cartero de referencia:
--  scripts/puente/cartero_director.py `_entregar_telegram`)
-- Idempotente. Sintaxis verificada con pglast (Parser de Postgres 17).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── tabla ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.metagenesis_buzon (
  id           bigserial PRIMARY KEY,
  t            timestamptz NOT NULL DEFAULT now(),
  clase        text NOT NULL DEFAULT 'aviso' CHECK (clase IN ('aviso', 'parte')),
  de           text NOT NULL,
  destino      text,
  asunto       text CHECK (asunto IS NULL OR char_length(asunto) <= 120),
  texto        text NOT NULL,
  estado       text NOT NULL DEFAULT 'pendiente'
               CHECK (estado IN ('pendiente', 'entregado', 'fallo', 'archivado')),
  entregado_en timestamptz,
  detalle      text,
  -- Un aviso solo sale por la lista blanca; un parte no viaja: se archiva.
  CHECK (
    (clase = 'aviso'
     AND destino = 'telegram:Maggasukha'
     AND char_length(texto) <= 12000)
    OR
    (clase = 'parte'
     AND destino IS NULL
     AND estado = 'archivado'
     AND char_length(texto) <= 40000)
  ),
  -- La marca de entrega va con el estado de entrega, nunca suelta.
  CHECK (entregado_en IS NULL OR estado = 'entregado')
);

-- Índices de las dos lecturas que existen: avisos pendientes (el líder las recoge)
-- y la última entrada de cada clase (Claude nube relee el parte).
CREATE INDEX IF NOT EXISTS metagenesis_buzon_pendiente_idx
  ON public.metagenesis_buzon (clase, estado) WHERE estado = 'pendiente';
CREATE INDEX IF NOT EXISTS metagenesis_buzon_clase_t_idx
  ON public.metagenesis_buzon (clase, t DESC);

-- ─── aterrizaje: un parte entra archivado, un aviso entra pendiente ────────

CREATE OR REPLACE FUNCTION public.metagenesis_buzon_aterrizar()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.clase = 'parte' AND NEW.estado = 'pendiente' THEN
    NEW.estado := 'archivado';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.metagenesis_buzon_aterrizar()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS metagenesis_buzon_aterrizar ON public.metagenesis_buzon;
CREATE TRIGGER metagenesis_buzon_aterrizar BEFORE INSERT ON public.metagenesis_buzon
  FOR EACH ROW EXECUTE FUNCTION public.metagenesis_buzon_aterrizar();

-- ─── RLS: cerrada del todo, salvo service_role / postgres ──────────────────

ALTER TABLE public.metagenesis_buzon ENABLE ROW LEVEL SECURITY;
-- Sin políticas para anon ni authenticated: con RLS activado y sin políticas,
-- nadie con sesión ni anónimo ve ni escribe una fila. Solo service_role
-- (bypassrls) y el dueño (postgres, las migraciones y el conector SQL de Claude).
REVOKE ALL ON public.metagenesis_buzon FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.metagenesis_buzon TO service_role;

-- ─── comprobación a mano (con la clave de servicio) ────────────────────────
-- Aviso de la síntesis diaria (Claude nube, por su conector MCP con SQL):
--   insert into public.metagenesis_buzon (clase, de, destino, asunto, texto)
--   values ('aviso', 'claude-sintesis-diaria', 'telegram:Maggasukha',
--           'Síntesis diaria · <fecha>', '<texto…>');
-- Lo que BZN1108B recoge y entrega (el líder de dirección):
--   select id, de, asunto, texto from public.metagenesis_buzon
--    where clase = 'aviso' and estado = 'pendiente' order by id;
--   update public.metagenesis_buzon
--      set estado = 'entregado', entregado_en = now() where id = <id>;
-- El parte diario (Claude nube lo escribe y lo relee):
--   insert into public.metagenesis_buzon (clase, de, asunto, texto)
--   values ('parte', 'creametagenesis-sintesis-diaria',
--           'Parte diario · <fecha>', '<texto…>');
--   select texto from public.metagenesis_buzon
--    where clase = 'parte' order by t desc limit 1;
