-- ════════════════════════════════════════════════════════════════════════════
-- 20261008090000 · Tablas Mando para todos (PT1008A)
-- ----------------------------------------------------------------------------
-- 
-- TABLAS del Puente de Mando (migración aditiva, §6.1 del contrato)
--   · mando_ambitos       (propietario del Mando)
--   · mando_motores       (ejecutor del enjambre)
--   · mando_enjambres      (configuración por ámbito)
--   · mando_tareas        (cola de tareas + estado compacto)
--   · mando_eventos       (eventos con límite de 2 000 filas)
--   · mando_chat          (chat público por ámbito)
--   · mando_medidores     (medidores de crédito y estado)
--   · mando_presupuesto   (peticiones diarias por ámbito)
--
-- TODAS las tablas habilitan RLS (§6.1 §6.2) ANTES de abrir nada.
-- 
-- En PT1008B se añaden políticas; PT1008C las gestiona.
-- ----------------------------------------------------------------------------

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0 · Función de capacidades del Mando (SECURITY DEFINER, search_path)       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.mando_capacidad(_ambito uuid, _capacidad text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Verificación de capacidad por dueño de ámbito §3 del contrato
    CASE
      -- Persona dueña de su perfil → todas
      WHEN EXISTS (
        SELECT 1 FROM public.mando_ambitos a
        WHERE a.id = _ambito
          AND a.tipo = 'persona'
          AND a.perfil_id IS NOT NULL
          AND a.creado_por = auth.uid()
      ) THEN true

      -- Entidad dueña → todas
      WHEN EXISTS (
        SELECT 1 FROM public.mando_ambitos a
        WHERE a.id = _ambito
          AND a.tipo = 'entidad'
          AND a.creado_por = auth.uid()
      ) THEN true

      -- Entidad admin (no owner) → todas excepto administrar
      WHEN EXISTS (
        SELECT 1 FROM public.mando_ambitos a
          JOIN public.os_memberships m ON m.group_slug = (
            SELECT slug FROM public.os_pages p WHERE p.id = a.entidad_ref
            UNION
            SELECT slug FROM public.os_groups g WHERE g.id = a.entidad_ref
          )
        WHERE a.id = _ambito
          AND a.tipo = 'entidad'
          AND m.user_id = auth.uid()
          AND m.role = 'admin'
      ) THEN (_capacidad <> 'administrar')

      -- Entidad moderator/editor → §3
      WHEN EXISTS (
        SELECT 1 FROM public.mando_ambitos a
          JOIN public.os_memberships m ON m.group_slug = (
            SELECT slug FROM public.os_pages p WHERE p.id = a.entidad_ref
            UNION
            SELECT slug FROM public.os_groups g WHERE g.id = a.entidad_ref
          )
        WHERE a.id = _ambito
          AND a.tipo = 'entidad'
          AND m.user_id = auth.uid()
          AND m.role IN ('moderator', 'editor')
      ) THEN (_capacidad IN (
        'ver-resumen', 'ver-detalle', 'chatear', 'encolar', 'aprobar', 'frenar'
      ))

      -- Entidad member/viewer → §3
      WHEN EXISTS (
        SELECT 1 FROM public.mando_ambitos a
          JOIN public.os_memberships m ON m.group_slug = (
            SELECT slug FROM public.os_pages p WHERE p.id = a.entidad_ref
            UNION
            SELECT slug FROM public.os_groups g WHERE g.id = a.entidad_ref
          )
        WHERE a.id = _ambito
          AND a.tipo = 'entidad'
          AND m.user_id = auth.uid()
          AND m.role IN ('member', 'viewer')
      ) THEN (_capacidad IN (
        'ver-resumen', 'ver-detalle', 'chatear'
      ))

      -- Entidad pending → ninguna
      WHEN EXISTS (
        SELECT 1 FROM public.mando_ambitos a
          JOIN public.os_memberships m ON m.group_slug = (
            SELECT slug FROM public.os_pages p WHERE p.id = a.entidad_ref
            UNION
            SELECT slug FROM public.os_groups g WHERE g.id = a.entidad_ref
          )
        WHERE a.id = _ambito
          AND a.tipo = 'entidad'
          AND m.user_id = auth.uid()
          AND m.role = 'pending'
      ) THEN false

      -- Visitante sin rol → solo vista pública si visibilidad = 'publico'
      WHEN EXISTS (
        SELECT 1 FROM public.mando_ambitos a
        WHERE a.id = _ambito
          AND a.visibilidad = 'publico'
      ) THEN (_capacidad = 'ver-resumen')

      -- Owner de motor (dueño de área) → capacidades del owner
      WHEN EXISTS (
        SELECT 1 FROM public.mando_ambitos a
          JOIN public.mando_motores m ON m.ambito_id = a.id
        WHERE a.id = _ambito
          AND m.creado_por = auth.uid()
      ) THEN true

      -- Owner de área (entidad dueño) por guardianMando (tienes permiso)
      WHEN EXISTS (
        SELECT 1 FROM public.mando_ambitos a
        WHERE a.id = _ambito
          AND a.creado_por = auth.uid()
      ) THEN (_capacidad <> 'administrar')

      ELSE false
    END;
$$;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1 · public.mando_ambitos                                                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.mando_ambitos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo          text NOT NULL CHECK (tipo IN ('persona', 'entidad')),
  entidad_tipo  text CHECK (entidad_tipo IN ('page','group','community','event','ef','party')),
  entidad_ref   text CHECK (entidad_ref ~ '^[a-z0-9-]+$'),
  perfil_id     uuid CHECK (tipo = 'persona' AND perfil_id IS NOT NULL AND perfil_id <> ''),
  visibilidad   text NOT NULL DEFAULT 'privado' CHECK (visibilidad IN ('privado', 'miembros', 'publico')),
  modo_gobierno text NOT NULL DEFAULT 'jerarquico' CHECK (modo_gobierno IN ('jerarquico', 'democratico')),
  nombre        text NOT NULL,
  creado_por    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  freno         boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mando_ambitos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mando_ambitos REPLICA IDENTITY FULL;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2 · public.mando_motores                                                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.mando_motores (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ambito_id         uuid NOT NULL REFERENCES public.mando_ambitos(id) ON DELETE CASCADE,
  nombre            text NOT NULL,
  tipo              text NOT NULL CHECK (tipo IN ('local', 'nube-propia', 'servidor-propio')),
  token_hash        text UNIQUE NOT NULL,
  huella           text NOT NULL,
  capacidades       text[] NOT NULL DEFAULT '{}',
  estado            text NOT NULL DEFAULT 'vivo' CHECK (estado IN ('vivo', 'dormido', 'frenado', 'revocado')),
  ultimo_reporte    timestamptz NOT NULL DEFAULT now(),
  creado_por        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mando_motores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mando_motores REPLICA IDENTITY FULL;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 3 · public.mando_enjambres                                               ║
-- ╚══════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.mando_enjambres (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ambito_id       uuid NOT NULL REFERENCES public.mando_ambitos(id) ON DELETE CASCADE,
  motor_id        uuid NOT NULL REFERENCES public.mando_motores(id) ON DELETE CASCADE,
  nombre          text NOT NULL,
  config          jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (length(CAST(config AS text)) <= 16384)
);

ALTER TABLE public.mando_enjambres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mando_enjambres REPLICA IDENTITY FULL;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 4 · public.mando_tareas                                                 ║
-- ╚══════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.mando_tareas (
  ambito_id    uuid NOT NULL REFERENCES public.mando_ambitos(id) ON DELETE CASCADE,
  tarea_id     text NOT NULL,
  ola          text NOT NULL,
  titulo       text NOT NULL,
  depende     text[] NOT NULL DEFAULT '{}',
  archivos    text[] NOT NULL DEFAULT '{}',
  prompt       text NOT NULL CHECK (length(prompt) <= 20000),
  estado       text NOT NULL CHECK (estado IN ('pendiente', 'en_curso', 'bloqueada', 'completada')),
  avance       integer NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mando_tareas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mando_tareas REPLICA IDENTITY FULL;

ALTER TABLE public.mando_tareas
  ADD CONSTRAINT mando_tareas_pk PRIMARY KEY (ambito_id, tarea_id);

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 5 · public.mando_eventos                                                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.mando_eventos (
  id         bigserial PRIMARY KEY,
  ambito_id  uuid NOT NULL REFERENCES public.mando_ambitos(id) ON DELETE CASCADE,
  motor_id   uuid NOT NULL REFERENCES public.mando_motores(id) ON DELETE CASCADE,
  t          timestamptz NOT NULL DEFAULT now(),
  tipo       text NOT NULL CHECK (tipo IN ('latido', 'progreso', 'orden', 'evento')),
  tarea      text,
  texto      text NOT NULL CHECK (length(texto) <= 4000)
);

ALTER TABLE public.mando_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mando_eventos REPLICA IDENTITY FULL;

-- Índice por ámbito + tiempo (más nuevas primero)
CREATE INDEX IF NOT EXISTS mando_eventos_ambito_t_idx
  ON public.mando_eventos (ambito_id, t DESC);

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 6 · public.mando_chat                                                   ║
-- ╚══════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.mando_chat (
  id          bigserial PRIMARY KEY,
  ambito_id   uuid NOT NULL REFERENCES public.mando_ambitos(id) ON DELETE CASCADE,
  canal      text NOT NULL CHECK (char_length(canal) <= 40),
  autor      text NOT NULL CHECK (char_length(autor) <= 40),
  rol        text NOT NULL CHECK (rol IN ('usuario', 'sistema')),
  texto      text NOT NULL CHECK (length(texto) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mando_chat ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mando_chat REPLICA IDENTITY FULL;

-- Índice por ámbito + tiempo (más nuevos primero)
CREATE INDEX IF NOT EXISTS mando_chat_ambito_created_at_idx
  ON public.mando_chat (ambito_id, created_at DESC);

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 7 · public.mando_medidores                                              ║
-- ╚══════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.mando_medidores (
  ambito_id    uuid NOT NULL REFERENCES public.mando_ambitos(id) ON DELETE CASCADE,
  motor_id     uuid NOT NULL REFERENCES public.mando_motores(id) ON DELETE CASCADE,
  doc         jsonb NOT NULL CHECK (pg_column_size(doc) <= 32768),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mando_medidores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mando_medidores REPLICA IDENTITY FULL;

ALTER TABLE public.mando_medidores
  ADD CONSTRAINT mando_medidores_pk PRIMARY KEY (ambito_id, motor_id);

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 8 · public.mando_presupuesto                                             ║
-- ╚══════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.mando_presupuesto (
  dia         date NOT NULL,
  ambito_id   uuid NOT NULL REFERENCES public.mando_ambitos(id) ON DELETE CASCADE,
  peticiones   integer NOT NULL DEFAULT 0
);

ALTER TABLE public.mando_presupuesto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mando_presupuesto REPLICA IDENTITY FULL;

ALTER TABLE public.mando_presupuesto
  ADD CONSTRAINT mando_presupuesto_pk PRIMARY KEY (dia, ambito_id);

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 9 · Disparador: mando_eventos_tope (limite 2 000 por ámbito)              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.mando_eventos_tope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM public.mando_eventos
  WHERE ambito_id = NEW.ambito_id
    AND id NOT IN (
      SELECT id FROM public.mando_eventos
      WHERE ambito_id = NEW.ambito_id
      ORDER BY t DESC
      LIMIT 2000
    );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS mando_eventos_tope_trg ON public.mando_eventos;
CREATE TRIGGER mando_eventos_tope_trg
  AFTER INSERT ON public.mando_eventos
  FOR EACH ROW EXECUTE FUNCTION public.mando_eventos_tope();
