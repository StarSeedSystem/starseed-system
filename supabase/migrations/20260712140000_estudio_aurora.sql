-- ════════════════════════════════════════════════════════════════════════════
-- ESTUDIO CON AURORA/ASTRAURA · Adenda 66 §9 (Educación)
-- Base del OS: Supabase nxstilnyidvkqeosofuh (NO el de Nexus/Café).
--
-- Añade la capa de ESTUDIO de la sección Educación (aditivo, no rompe nada):
--   · study_groups           — grupos de estudio (miembros reales + chat)
--   · study_group_members    — membresías (unirse / salir)
--   · study_group_posts      — publicaciones/chat del grupo (realtime)
--   · study_guides           — guías inteligentes personalizadas + itinerarios
--                              (Astraura); plantillas de ejemplo REALES
--   · exams                  — exámenes opcionales (generados por Astraura)
--   · exam_attempts          — intentos + corrección + aprobado
--   · study_tasks            — tareas de estudio (usuario / recomendadas)
--   · study_projects         — proyectos personalizables
--
-- Al aprobar un examen se otorga una INSIGNIA real vía src/lib/badges/badges.ts
-- (profile_badges); aquí se siembran las insignias de educación que referencian
-- los exámenes de ejemplo.
--
-- RLS SIN RECURSIÓN (misma regla que 20260712090100_missing_core_tables_spaces):
--   una política NUNCA llama a una función que RELEA SU PROPIA tabla; las
--   comprobaciones sobre la propia fila van INLINE (para que INSERT … RETURNING
--   de PostgREST funcione); solo se delega en funciones SECURITY DEFINER para
--   consultar OTRAS tablas. Idempotente: create if not exists + drop policy if
--   exists + seeds con "where not exists".
-- ════════════════════════════════════════════════════════════════════════════

/* ═══════════════════════════ 1 · study_groups ════════════════════════════ */
CREATE TABLE IF NOT EXISTS public.study_groups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  -- id de nodo del catálogo builtin (src/lib/education/curriculum.ts) o texto
  -- libre del tema; opcional (un grupo puede no atarse a un tema concreto).
  topic_id    text,
  topic_name  text,
  is_public   boolean NOT NULL DEFAULT true,
  owner       uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS study_groups_owner_idx   ON public.study_groups (owner);
CREATE INDEX IF NOT EXISTS study_groups_public_idx  ON public.study_groups (is_public);
CREATE INDEX IF NOT EXISTS study_groups_created_idx ON public.study_groups (created_at DESC);

/* ══════════════════════ 2 · study_group_members ══════════════════════════ */
CREATE TABLE IF NOT EXISTS public.study_group_members (
  group_id  uuid NOT NULL REFERENCES public.study_groups(id) ON DELETE CASCADE,
  account   uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  role      text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, account)
);
CREATE INDEX IF NOT EXISTS study_group_members_account_idx ON public.study_group_members (account);
CREATE INDEX IF NOT EXISTS study_group_members_group_idx   ON public.study_group_members (group_id);

/* ═══════════════════════ 3 · study_group_posts ═══════════════════════════ */
CREATE TABLE IF NOT EXISTS public.study_group_posts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   uuid NOT NULL REFERENCES public.study_groups(id) ON DELETE CASCADE,
  author     uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS study_group_posts_group_idx ON public.study_group_posts (group_id, created_at);

/* ══════ 4 · Funciones SECURITY DEFINER (leen OTRAS tablas, sin recursión) ══ */
-- ¿Soy el dueño del grupo? (lee study_groups)
CREATE OR REPLACE FUNCTION public.study_group_is_owner(_gid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.study_groups g WHERE g.id = _gid AND g.owner = auth.uid()
  );
$$;
-- ¿El grupo es público? (lee study_groups)
CREATE OR REPLACE FUNCTION public.study_group_is_public(_gid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.study_groups g WHERE g.id = _gid AND g.is_public);
$$;
-- ¿Soy miembro del grupo? (lee study_group_members; SECURITY DEFINER ⇒ salta RLS)
CREATE OR REPLACE FUNCTION public.study_group_is_member(_gid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.study_group_members m
    WHERE m.group_id = _gid AND m.account = auth.uid()
  );
$$;
-- ¿Puedo LEER el grupo? público · dueño · miembro.
CREATE OR REPLACE FUNCTION public.study_group_can_read(_gid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.study_group_is_public(_gid)
      OR public.study_group_is_owner(_gid)
      OR public.study_group_is_member(_gid);
$$;

/* ═══════════════════════════ 5 · RLS de grupos ═══════════════════════════ */
ALTER TABLE public.study_groups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_group_posts   ENABLE ROW LEVEL SECURITY;

-- study_groups. SELECT inline (is_public / owner) + delega en study_group_members
-- vía función (OTRA tabla). createGroup hace insert().select() ⇒ owner inline OK.
DROP POLICY IF EXISTS sg_select ON public.study_groups;
CREATE POLICY sg_select ON public.study_groups
  FOR SELECT USING (
    is_public
    OR (auth.uid() IS NOT NULL AND (owner = auth.uid() OR public.study_group_is_member(id)))
  );
DROP POLICY IF EXISTS sg_insert ON public.study_groups;
CREATE POLICY sg_insert ON public.study_groups
  FOR INSERT WITH CHECK (owner = auth.uid());
DROP POLICY IF EXISTS sg_update ON public.study_groups;
CREATE POLICY sg_update ON public.study_groups
  FOR UPDATE USING (owner = auth.uid()) WITH CHECK (owner = auth.uid());
DROP POLICY IF EXISTS sg_delete ON public.study_groups;
CREATE POLICY sg_delete ON public.study_groups
  FOR DELETE USING (owner = auth.uid());

-- study_group_members. Mi fila siempre (inline) ⇒ join con insert().select() OK.
DROP POLICY IF EXISTS sgm_select ON public.study_group_members;
CREATE POLICY sgm_select ON public.study_group_members
  FOR SELECT USING (account = auth.uid() OR public.study_group_can_read(group_id));
-- Unirse: solo a MI nombre y solo si el grupo es público o soy el dueño.
DROP POLICY IF EXISTS sgm_join ON public.study_group_members;
CREATE POLICY sgm_join ON public.study_group_members
  FOR INSERT WITH CHECK (
    account = auth.uid()
    AND (public.study_group_is_public(group_id) OR public.study_group_is_owner(group_id))
  );
-- El dueño gestiona el roster (expulsar).
DROP POLICY IF EXISTS sgm_owner ON public.study_group_members;
CREATE POLICY sgm_owner ON public.study_group_members
  FOR ALL USING (public.study_group_is_owner(group_id))
          WITH CHECK (public.study_group_is_owner(group_id));
-- Salir (justicia no punitiva): borro MI fila.
DROP POLICY IF EXISTS sgm_leave ON public.study_group_members;
CREATE POLICY sgm_leave ON public.study_group_members
  FOR DELETE USING (account = auth.uid());

-- study_group_posts. Leer si puedo leer el grupo; publicar si soy miembro/dueño.
DROP POLICY IF EXISTS sgp_select ON public.study_group_posts;
CREATE POLICY sgp_select ON public.study_group_posts
  FOR SELECT USING (public.study_group_can_read(group_id));
DROP POLICY IF EXISTS sgp_insert ON public.study_group_posts;
CREATE POLICY sgp_insert ON public.study_group_posts
  FOR INSERT WITH CHECK (
    author = auth.uid()
    AND (public.study_group_is_member(group_id) OR public.study_group_is_owner(group_id))
  );
DROP POLICY IF EXISTS sgp_delete ON public.study_group_posts;
CREATE POLICY sgp_delete ON public.study_group_posts
  FOR DELETE USING (author = auth.uid() OR public.study_group_is_owner(group_id));

/* ═══════════════════════════ 6 · study_guides ════════════════════════════ */
-- kind: 'guia' (guía de estudio) | 'itinerario' (secciones = pasos con fechas).
-- sections jsonb: [{ "title", "body", "type"?, "date"?, "resources": [
--   { "label", "url"?, "kind"? } ], "ref"? }]  (ref = {event_id|task_id|exam_id}).
CREATE TABLE IF NOT EXISTS public.study_guides (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner       uuid REFERENCES auth.users(id) ON DELETE CASCADE,   -- NULL = plantilla
  kind        text NOT NULL DEFAULT 'guia' CHECK (kind IN ('guia', 'itinerario')),
  title       text NOT NULL,
  topic       text,
  summary     text NOT NULL DEFAULT '',
  sections    jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_template boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS study_guides_owner_idx    ON public.study_guides (owner);
CREATE INDEX IF NOT EXISTS study_guides_template_idx ON public.study_guides (is_template);

ALTER TABLE public.study_guides ENABLE ROW LEVEL SECURITY;
-- Plantillas visibles para todos; las mías, solo mías.
DROP POLICY IF EXISTS guide_select ON public.study_guides;
CREATE POLICY guide_select ON public.study_guides
  FOR SELECT USING (is_template OR owner = auth.uid());
DROP POLICY IF EXISTS guide_insert ON public.study_guides;
CREATE POLICY guide_insert ON public.study_guides
  FOR INSERT WITH CHECK (owner = auth.uid() AND is_template = false);
DROP POLICY IF EXISTS guide_update ON public.study_guides;
CREATE POLICY guide_update ON public.study_guides
  FOR UPDATE USING (owner = auth.uid()) WITH CHECK (owner = auth.uid());
DROP POLICY IF EXISTS guide_delete ON public.study_guides;
CREATE POLICY guide_delete ON public.study_guides
  FOR DELETE USING (owner = auth.uid());

/* ═══════════════════════════════ 7 · exams ═══════════════════════════════ */
-- questions jsonb: [{ "q", "options": ["…"], "answer": <índice 0-based>,
--   "explanation"? }].  badge_code referencia badges.code (se otorga al aprobar).
CREATE TABLE IF NOT EXISTS public.exams (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner          uuid REFERENCES auth.users(id) ON DELETE CASCADE,   -- NULL = plantilla
  title          text NOT NULL,
  topic          text,
  questions      jsonb NOT NULL DEFAULT '[]'::jsonb,
  pass_threshold numeric NOT NULL DEFAULT 0.7 CHECK (pass_threshold >= 0 AND pass_threshold <= 1),
  badge_code     text,
  is_template    boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS exams_owner_idx    ON public.exams (owner);
CREATE INDEX IF NOT EXISTS exams_template_idx ON public.exams (is_template);

ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS exam_select ON public.exams;
CREATE POLICY exam_select ON public.exams
  FOR SELECT USING (is_template OR owner = auth.uid());
DROP POLICY IF EXISTS exam_insert ON public.exams;
CREATE POLICY exam_insert ON public.exams
  FOR INSERT WITH CHECK (owner = auth.uid() AND is_template = false);
DROP POLICY IF EXISTS exam_update ON public.exams;
CREATE POLICY exam_update ON public.exams
  FOR UPDATE USING (owner = auth.uid()) WITH CHECK (owner = auth.uid());
DROP POLICY IF EXISTS exam_delete ON public.exams;
CREATE POLICY exam_delete ON public.exams
  FOR DELETE USING (owner = auth.uid());

/* ═══════════════════════════ 8 · exam_attempts ═══════════════════════════ */
CREATE TABLE IF NOT EXISTS public.exam_attempts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id    uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  account    uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  answers    jsonb NOT NULL DEFAULT '[]'::jsonb,
  score      numeric NOT NULL DEFAULT 0,
  passed     boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS exam_attempts_account_idx ON public.exam_attempts (account, created_at DESC);
CREATE INDEX IF NOT EXISTS exam_attempts_exam_idx    ON public.exam_attempts (exam_id);

ALTER TABLE public.exam_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS attempt_select ON public.exam_attempts;
CREATE POLICY attempt_select ON public.exam_attempts
  FOR SELECT USING (account = auth.uid());
DROP POLICY IF EXISTS attempt_insert ON public.exam_attempts;
CREATE POLICY attempt_insert ON public.exam_attempts
  FOR INSERT WITH CHECK (account = auth.uid());
DROP POLICY IF EXISTS attempt_delete ON public.exam_attempts;
CREATE POLICY attempt_delete ON public.exam_attempts
  FOR DELETE USING (account = auth.uid());

/* ═══════════════════════════ 9 · study_tasks ═════════════════════════════ */
CREATE TABLE IF NOT EXISTS public.study_tasks (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner      uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title      text NOT NULL,
  notes      text NOT NULL DEFAULT '',
  done       boolean NOT NULL DEFAULT false,
  due_at     timestamptz,
  topic      text,
  group_id   uuid REFERENCES public.study_groups(id) ON DELETE SET NULL,
  guide_id   uuid REFERENCES public.study_guides(id) ON DELETE SET NULL,
  source     text NOT NULL DEFAULT 'user' CHECK (source IN ('user', 'astraura')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS study_tasks_owner_idx ON public.study_tasks (owner, done, created_at DESC);

ALTER TABLE public.study_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS task_all ON public.study_tasks;
CREATE POLICY task_all ON public.study_tasks
  FOR ALL USING (owner = auth.uid()) WITH CHECK (owner = auth.uid());

/* ══════════════════════════ 10 · study_projects ══════════════════════════ */
CREATE TABLE IF NOT EXISTS public.study_projects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner       uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text NOT NULL,
  description text NOT NULL DEFAULT '',
  status      text NOT NULL DEFAULT 'activo' CHECK (status IN ('idea', 'activo', 'pausado', 'hecho')),
  topic       text,
  links       jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS study_projects_owner_idx ON public.study_projects (owner, created_at DESC);

ALTER TABLE public.study_projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_all ON public.study_projects;
CREATE POLICY project_all ON public.study_projects
  FOR ALL USING (owner = auth.uid()) WITH CHECK (owner = auth.uid());

/* ═══════════════════════════ 11 · Permisos de tabla ══════════════════════ */
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_groups        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_group_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_group_posts   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_guides        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exams               TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_attempts       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_tasks         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_projects      TO authenticated;
-- Anónimo: solo lectura del catálogo compartido (grupos públicos, plantillas).
GRANT SELECT ON public.study_groups TO anon;
GRANT SELECT ON public.study_guides TO anon;
GRANT SELECT ON public.exams        TO anon;

/* ═════════════════ 12 · Insignias de educación (semilla) ═════════════════ */
-- Idempotente sin depender de un índice único en badges.code.
INSERT INTO public.badges (code, name, description, icon, area, criteria)
SELECT * FROM (VALUES
  ('exam_passed',      'Examen Superado',    'Aprobar cualquier examen de la red educativa.',        '🎓', 'educacion', '{"trigger":"pass_exam"}'::jsonb),
  ('quantum_initiate', 'Iniciado Cuántico',  'Aprobar el examen de Física Cuántica.',                '🔬', 'educacion', '{"trigger":"pass_exam","topic":"Física Cuántica"}'::jsonb),
  ('ai_literate',      'Alfabetización en IA','Aprobar el examen de Inteligencia Artificial.',        '🤖', 'educacion', '{"trigger":"pass_exam","topic":"Inteligencia Artificial"}'::jsonb),
  ('civic_scholar',    'Erudito Cívico',     'Aprobar el examen de Democracia Directa.',             '🏛️', 'educacion', '{"trigger":"pass_exam","topic":"Democracia Directa"}'::jsonb)
) AS v(code, name, description, icon, area, criteria)
WHERE NOT EXISTS (SELECT 1 FROM public.badges b WHERE b.code = v.code);

/* ═══════════════ 13 · Guías de ejemplo REALES (plantillas) ═══════════════ */
INSERT INTO public.study_guides (owner, kind, title, topic, summary, sections, is_template)
SELECT NULL, 'guia',
  'Fundamentos de la Democracia Directa',
  'Democracia Directa',
  'Recorrido introductorio por la democracia directa: qué es, cómo se delega el voto de forma revocable y qué herramientas digitales la hacen posible en una red descentralizada.',
  $json$[
    {"title":"Qué es la democracia directa","body":"La democracia directa es un sistema en el que las personas deciden sobre los asuntos públicos sin intermediarios permanentes. Frente a la democracia representativa, el poder de decisión no se delega en un cargo por años, sino que reside de forma continua en la ciudadanía. En StarSeed se combina con la meritocracia del entendimiento: la autoridad técnica se reconoce por sabiduría aplicada verificable, no por popularidad.","resources":[{"label":"Democracia directa (Wikipedia)","url":"https://es.wikipedia.org/wiki/Democracia_directa","kind":"articulo"}]},
    {"title":"Voto líquido y delegación revocable","body":"El voto líquido permite delegar tu voto en personas expertas para temas concretos, y RETIRAR esa delegación en cualquier momento. Así se combina la participación directa con la eficiencia de la experiencia, sin alienar nunca el poder. Estudia la diferencia entre delegación por tema y delegación global.","resources":[{"label":"Democracia líquida (Wikipedia)","url":"https://es.wikipedia.org/wiki/Democracia_l%C3%ADquida","kind":"articulo"}]},
    {"title":"Deliberar antes de votar","body":"Una votación sin deliberación estructurada degrada en populismo. Practica métodos de deliberación: rondas de argumentos a favor y en contra, síntesis de posturas y detección de acuerdos. La transparencia en el ejercicio del poder público es una cláusula pétrea del sistema.","resources":[{"label":"Deliberación democrática","url":"https://es.wikipedia.org/wiki/Democracia_deliberativa","kind":"articulo"}]},
    {"title":"Práctica: propón una iniciativa","body":"Redacta una iniciativa breve (título, problema, propuesta, impacto esperado) sobre un asunto de tu comunidad. Compártela en un grupo de estudio y recoge argumentos. Objetivo: entender el ciclo completo propuesta → debate → decisión.","resources":[]}
  ]$json$::jsonb,
  true
WHERE NOT EXISTS (SELECT 1 FROM public.study_guides g WHERE g.is_template AND g.title = 'Fundamentos de la Democracia Directa');

INSERT INTO public.study_guides (owner, kind, title, topic, summary, sections, is_template)
SELECT NULL, 'guia',
  'Introducción a la Inteligencia Artificial',
  'Inteligencia Artificial',
  'Primer contacto riguroso con la IA: aprendizaje automático, redes neuronales, límites y ética. Pensada para no especialistas que quieren entender de verdad, no memorizar.',
  $json$[
    {"title":"Qué es (y qué no es) la IA","body":"La inteligencia artificial es el campo que estudia cómo construir sistemas capaces de realizar tareas que asociamos a la inteligencia humana: percibir, razonar, aprender y decidir. Distingue IA estrecha (una tarea) de IA general (hipotética). La mayoría de lo que hoy llamamos IA es aprendizaje automático sobre datos.","resources":[{"label":"Inteligencia artificial (Wikipedia)","url":"https://es.wikipedia.org/wiki/Inteligencia_artificial","kind":"articulo"}]},
    {"title":"Aprendizaje automático","body":"En vez de programar reglas a mano, se entrena un modelo con ejemplos para que generalice a datos nuevos. Familias clave: aprendizaje supervisado (con etiquetas), no supervisado (sin etiquetas) y por refuerzo (recompensas). Comprende el sobreajuste: un modelo que memoriza no aprende.","resources":[{"label":"Machine learning (Wikipedia)","url":"https://es.wikipedia.org/wiki/Aprendizaje_autom%C3%A1tico","kind":"articulo"}]},
    {"title":"Redes neuronales","body":"Las redes neuronales apilan capas de operaciones simples que, combinadas, aprenden representaciones cada vez más abstractas. El aprendizaje profundo (deep learning) es lo que impulsa la visión por computador y los grandes modelos de lenguaje.","resources":[{"label":"Red neuronal artificial","url":"https://es.wikipedia.org/wiki/Red_neuronal_artificial","kind":"articulo"}]},
    {"title":"Ética y soberanía","body":"En StarSeed la IA personal es un Exocórtex: propiedad del usuario y leal al usuario, nunca instrumento de vigilancia o control. Estudia sesgos, privacidad, explicabilidad y el principio de que la tecnología debe ampliar la conciencia, no alienarla.","resources":[{"label":"Ética de la IA","url":"https://es.wikipedia.org/wiki/%C3%89tica_de_la_inteligencia_artificial","kind":"articulo"}]}
  ]$json$::jsonb,
  true
WHERE NOT EXISTS (SELECT 1 FROM public.study_guides g WHERE g.is_template AND g.title = 'Introducción a la Inteligencia Artificial');

INSERT INTO public.study_guides (owner, kind, title, topic, summary, sections, is_template)
SELECT NULL, 'itinerario',
  'Itinerario: Física Cuántica en 4 semanas',
  'Física Cuántica',
  'Un plan de cuatro semanas para pasar de cero a comprender los pilares de la mecánica cuántica, con hitos semanales, lecturas y un examen final opcional.',
  $json$[
    {"title":"Semana 1 · Del mundo clásico al cuántico","type":"hito","body":"Repasa por qué la física clásica falla a escala atómica: radiación del cuerpo negro, efecto fotoeléctrico y espectros. Objetivo de la semana: entender la idea de cuantización de la energía.","resources":[{"label":"Mecánica cuántica (Wikipedia)","url":"https://es.wikipedia.org/wiki/Mec%C3%A1nica_cu%C3%A1ntica","kind":"articulo"}]},
    {"title":"Semana 2 · Dualidad y función de onda","type":"hito","body":"Dualidad onda-partícula, experimento de la doble rendija y la función de onda como amplitud de probabilidad. Practica la interpretación probabilística de |ψ|².","resources":[{"label":"Dualidad onda-corpúsculo","url":"https://es.wikipedia.org/wiki/Dualidad_onda-corpúsculo","kind":"articulo"}]},
    {"title":"Semana 3 · Incertidumbre y superposición","type":"hito","body":"Principio de incertidumbre de Heisenberg y superposición de estados. Reflexiona sobre qué significa medir en cuántica y por qué la medida altera el sistema.","resources":[{"label":"Principio de incertidumbre","url":"https://es.wikipedia.org/wiki/Relaci%C3%B3n_de_indeterminaci%C3%B3n_de_Heisenberg","kind":"articulo"}]},
    {"title":"Semana 4 · Entrelazamiento y aplicaciones","type":"hito","body":"Entrelazamiento cuántico y su papel en la computación e información cuántica. Cierre: realiza el examen de Física Cuántica para obtener la insignia Iniciado Cuántico.","resources":[{"label":"Entrelazamiento cuántico","url":"https://es.wikipedia.org/wiki/Entrelazamiento_cu%C3%A1ntico","kind":"articulo"}]}
  ]$json$::jsonb,
  true
WHERE NOT EXISTS (SELECT 1 FROM public.study_guides g WHERE g.is_template AND g.title = 'Itinerario: Física Cuántica en 4 semanas');

/* ═══════════════ 14 · Exámenes de ejemplo REALES (plantillas) ════════════ */
INSERT INTO public.exams (owner, title, topic, questions, pass_threshold, badge_code, is_template)
SELECT NULL, 'Examen: Democracia Directa', 'Democracia Directa',
  $json$[
    {"q":"¿Qué caracteriza a la democracia directa frente a la representativa?","options":["El poder de decisión reside de forma continua en la ciudadanía, sin intermediarios permanentes","Un parlamento decide en nombre del pueblo durante años","Solo votan las personas con más riqueza"],"answer":0,"explanation":"En la democracia directa la ciudadanía decide de forma continua; no delega el poder de manera permanente."},
    {"q":"En el voto líquido, la delegación del voto es…","options":["Permanente e irrevocable","Revocable en cualquier momento y por temas concretos","Obligatoria para todos los asuntos"],"answer":1,"explanation":"El voto líquido permite delegar por tema y retirar la delegación cuando se quiera."},
    {"q":"¿Por qué es importante la deliberación antes de una votación?","options":["Para alargar el proceso","Porque sin deliberación estructurada la votación degrada en populismo","No es importante"],"answer":1,"explanation":"La deliberación estructurada mejora la calidad de la decisión colectiva."},
    {"q":"La transparencia en StarSeed se aplica sobre todo a…","options":["La vida privada de las personas","El ejercicio del poder público","Los datos biométricos en bruto"],"answer":1,"explanation":"Privacidad en lo personal; transparencia en el ejercicio del poder público."}
  ]$json$::jsonb,
  0.7, 'civic_scholar', true
WHERE NOT EXISTS (SELECT 1 FROM public.exams e WHERE e.is_template AND e.title = 'Examen: Democracia Directa');

INSERT INTO public.exams (owner, title, topic, questions, pass_threshold, badge_code, is_template)
SELECT NULL, 'Examen: Inteligencia Artificial', 'Inteligencia Artificial',
  $json$[
    {"q":"¿Qué es el aprendizaje automático?","options":["Programar todas las reglas a mano","Entrenar un modelo con ejemplos para que generalice a datos nuevos","Una base de datos de respuestas fijas"],"answer":1,"explanation":"El ML aprende patrones a partir de datos en lugar de reglas escritas a mano."},
    {"q":"¿Qué es el sobreajuste (overfitting)?","options":["Cuando el modelo memoriza los datos de entrenamiento y no generaliza","Cuando el modelo es demasiado pequeño","Cuando no hay datos"],"answer":0,"explanation":"Un modelo sobreajustado memoriza y falla con datos nuevos."},
    {"q":"En StarSeed, la IA personal (Exocórtex) es…","options":["Propiedad del sistema, para vigilar","Propiedad del usuario y leal al usuario","Un servicio de anuncios"],"answer":1,"explanation":"El Exocórtex pertenece al usuario y le es leal; nunca es instrumento de control."},
    {"q":"¿Cuál de estas es una familia del aprendizaje automático?","options":["Aprendizaje por refuerzo","Aprendizaje por decreto","Aprendizaje notarial"],"answer":0,"explanation":"Supervisado, no supervisado y por refuerzo son las tres familias clásicas."}
  ]$json$::jsonb,
  0.7, 'ai_literate', true
WHERE NOT EXISTS (SELECT 1 FROM public.exams e WHERE e.is_template AND e.title = 'Examen: Inteligencia Artificial');

INSERT INTO public.exams (owner, title, topic, questions, pass_threshold, badge_code, is_template)
SELECT NULL, 'Examen: Física Cuántica', 'Física Cuántica',
  $json$[
    {"q":"¿Qué introduce la mecánica cuántica frente a la física clásica?","options":["Que la energía se intercambia en cantidades discretas (cuantos)","Que todo es continuo y determinista","Que la energía no existe"],"answer":0,"explanation":"La cuantización de la energía es un pilar de la mecánica cuántica."},
    {"q":"La función de onda |ψ|² representa…","options":["La masa de la partícula","La probabilidad de encontrar la partícula","La temperatura del sistema"],"answer":1,"explanation":"|ψ|² es la densidad de probabilidad de la posición."},
    {"q":"El principio de incertidumbre de Heisenberg afirma que…","options":["No se pueden conocer con precisión arbitraria y a la vez posición y momento","Todo puede medirse con precisión infinita","La incertidumbre solo afecta a objetos grandes"],"answer":0,"explanation":"Hay un límite fundamental a la precisión conjunta de posición y momento."},
    {"q":"El entrelazamiento cuántico es clave para…","options":["La computación e información cuántica","Hervir agua","La mecánica clásica"],"answer":0,"explanation":"El entrelazamiento es un recurso central de la información cuántica."}
  ]$json$::jsonb,
  0.7, 'quantum_initiate', true
WHERE NOT EXISTS (SELECT 1 FROM public.exams e WHERE e.is_template AND e.title = 'Examen: Física Cuántica');

/* ═══════════════════════════ 15 · Realtime ═══════════════════════════════ */
-- Chat/roster de grupos + tareas en vivo entre dispositivos. REPLICA IDENTITY
-- FULL para que Realtime evalúe RLS y filtros en UPDATE/DELETE.
ALTER TABLE public.study_groups        REPLICA IDENTITY FULL;
ALTER TABLE public.study_group_members REPLICA IDENTITY FULL;
ALTER TABLE public.study_group_posts   REPLICA IDENTITY FULL;
ALTER TABLE public.study_tasks         REPLICA IDENTITY FULL;

DO $$
DECLARE
    t text;
    tables text[] := ARRAY['study_groups', 'study_group_members', 'study_group_posts', 'study_tasks'];
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        RAISE NOTICE 'Publicación supabase_realtime no existe: no se añade ninguna tabla.';
        RETURN;
    END IF;
    FOREACH t IN ARRAY tables LOOP
        IF to_regclass('public.' || t) IS NULL THEN
            RAISE NOTICE 'Tabla public.% no existe: omitida.', t;
        ELSIF EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
        ) THEN
            RAISE NOTICE 'Tabla public.% ya está en supabase_realtime: omitida.', t;
        ELSE
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
            RAISE NOTICE 'Tabla public.% añadida a supabase_realtime.', t;
        END IF;
    END LOOP;
END
$$;
