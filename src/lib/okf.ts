/**
 * StarSeed OS — OKF (Open Knowledge Format / "LLM Wiki")
 *
 * Implementación del patrón de Andrej Karpathy adaptado al sistema de memoria de
 * StarSeed:
 *
 *   • Cada **baúl (vault)** es una wiki OKF.
 *   • Cada **memoria** del baúl es una página de la wiki (markdown en
 *     `memories.content`).
 *   • Los `[[Nombre]]` dentro del contenido de una memoria son los enlaces
 *     (cross-references) hacia otras memorias por su `name` — las CONEXIONES
 *     NEURONALES DINÁMICAS entre archivos.
 *   • Páginas especiales auto-mantenidas por baúl: `index` (catálogo),
 *     `log` (registro append-only) y `schema` (convenciones).
 *
 * Este módulo es puramente de utilidades + plantillas + constructores de prompts.
 * No hace I/O: la UI (okf-panel.tsx) se encarga de leer/escribir en Supabase.
 */

// ────────────────────────────────────────────────────────────────────────────
// Tipos ligeros (la UI usa los suyos; aquí pedimos sólo lo imprescindible)
// ────────────────────────────────────────────────────────────────────────────

export interface OKFMemoryLike {
  id: string;
  name: string;
  content?: string | null;
}

export interface OKFPage {
  name: string;
  content: string;
}

export interface LinkGraph {
  edges: { source: string; target: string }[];
}

/** Nombres de las páginas especiales de cada wiki. */
export const OKF_SPECIAL_PAGES = ["index", "log", "schema"] as const;
export type OKFSpecialPage = (typeof OKF_SPECIAL_PAGES)[number];

// ────────────────────────────────────────────────────────────────────────────
// Parsing de wikilinks
// ────────────────────────────────────────────────────────────────────────────

// Captura [[Nombre]] y [[Nombre|alias]] → devuelve siempre "Nombre".
const WIKILINK_RE = /\[\[([^\[\]|]+)(?:\|[^\[\]]*)?\]\]/g;

/**
 * Devuelve la lista ÚNICA de destinos `[[Nombre]]` que aparecen en `content`,
 * soportando la sintaxis con alias `[[Nombre|alias]]` (se devuelve el Nombre).
 * Conserva el orden de aparición y recorta espacios.
 */
export function parseWikilinks(content: string): string[] {
  if (!content) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  WIKILINK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WIKILINK_RE.exec(content)) !== null) {
    const name = (m[1] ?? "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// Búsqueda y grafo de enlaces
// ────────────────────────────────────────────────────────────────────────────

/** Busca una memoria por nombre (case-insensitive, recortando espacios). */
export function findMemoryByName<T extends { name: string }>(
  memories: T[],
  name: string,
): T | undefined {
  if (!name) return undefined;
  const target = name.trim().toLowerCase();
  return memories.find((m) => (m.name ?? "").trim().toLowerCase() === target);
}

/**
 * Construye el grafo de enlaces entre memorias: una arista A → B cuando el
 * contenido de A contiene `[[B.name]]` (coincidencia de nombre case-insensitive).
 * Sólo se generan aristas hacia memorias que existen realmente en la lista.
 */
export function buildLinkGraph(memories: OKFMemoryLike[]): LinkGraph {
  const byName = new Map<string, OKFMemoryLike>();
  for (const m of memories) {
    const key = (m.name ?? "").trim().toLowerCase();
    if (key && !byName.has(key)) byName.set(key, m);
  }

  const edges: { source: string; target: string }[] = [];
  const seen = new Set<string>();
  for (const m of memories) {
    const targets = parseWikilinks(m.content ?? "");
    for (const t of targets) {
      const dest = byName.get(t.trim().toLowerCase());
      if (!dest || dest.id === m.id) continue;
      const key = `${m.id}->${dest.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ source: m.id, target: dest.id });
    }
  }
  return { edges };
}

// ────────────────────────────────────────────────────────────────────────────
// Plantillas (español, voz de Astraura)
// ────────────────────────────────────────────────────────────────────────────

/** Documento de convenciones de la wiki (página `schema`). */
export const OKF_SCHEMA_TEMPLATE = `# schema — convenciones de esta wiki

> Esta página describe cómo Astraura mantiene esta wiki (formato OKF / "LLM Wiki").
> Es el contrato que siguen todas las páginas. Edítala si quieres cambiar las reglas.

## Qué es esta wiki
Cada **baúl** es una wiki viva: un conjunto de páginas en markdown, interconectadas,
que Astraura **redacta y mantiene** (no se reescriben en cada consulta). El
conocimiento se acumula y se enlaza con el tiempo.

## Tipos de página
- **Entidad** — una persona, lugar, proyecto u objeto concreto.
- **Concepto** — una idea, método o tema.
- **Resumen** — síntesis de una fuente o de una consulta archivada.
- **index** — catálogo de todas las páginas (auto-mantenido).
- **log** — registro append-only de cambios (auto-mantenido).
- **schema** — este documento.

## Enlaces (conexiones neuronales)
- Para enlazar de una página a otra usa \`[[Nombre exacto de la página]]\`.
- Puedes poner un alias visible: \`[[Nombre|texto mostrado]]\`.
- Un enlace a una página que aún no existe es una invitación a crearla.
- Enlaza generosamente: los enlaces son las conexiones que dan vida a la wiki.

## Convenciones de nombres
- Un nombre de página = un concepto. Nombres cortos, claros y estables.
- Evita duplicar páginas: si algo ya existe, enlázalo en vez de repetirlo.
- \`index\`, \`log\` y \`schema\` están reservados.

## Estructura de una página
\`\`\`
# Nombre de la página

Una o dos frases que definan el tema.

## Detalle
…contenido, con [[enlaces]] a páginas relacionadas…

## Relacionado
- [[Otra página]]
- [[Página relacionada]]
\`\`\`

## Operaciones de Astraura
- **Ingesta** — leer una fuente nueva → crear/actualizar páginas → actualizar
  el \`index\` → anotar en el \`log\`.
- **Consulta** — buscar en las páginas → responder con citas → opcionalmente
  archivar la respuesta como página nueva.
- **Revisión (lint)** — diagnóstico de salud: páginas huérfanas, contradicciones,
  afirmaciones obsoletas, enlaces que faltan y páginas sugeridas.
`;

/** Plantilla del catálogo (página `index`). */
export const INDEX_TEMPLATE = `# index — catálogo de la wiki

> Astraura mantiene este índice. Cada línea apunta a una página con \`[[enlace]]\`.

## Páginas
<!-- Astraura añade aquí las páginas a medida que se crean. -->

## Páginas especiales
- [[schema]] — convenciones de la wiki.
- [[log]] — registro de cambios.
`;

/** Plantilla del registro (página `log`). */
export const LOG_TEMPLATE = `# log — registro de la wiki

> Registro append-only. Cada línea: \`## [AAAA-MM-DD] <tipo> | <título>\`.
`;

/** Devuelve la fecha de hoy como AAAA-MM-DD (UTC). */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Construye una línea de registro para la página `log`.
 * Formato: `## [AAAA-MM-DD] <tipo> | <título>`.
 */
export function logLine(kind: string, title: string, date?: string): string {
  const d = (date && date.trim()) || todayISO();
  const k = (kind || "nota").trim();
  const t = (title || "—").trim();
  return `## [${d}] ${k} | ${t}`;
}

// ────────────────────────────────────────────────────────────────────────────
// Constructores de prompts (español, voz de Astraura)
// ────────────────────────────────────────────────────────────────────────────

const ASTRAURA_VOICE =
  "Eres Astraura, la IA compañera del Exocórtex de StarSeed OS. Mantienes una wiki " +
  "viva de conocimiento (formato OKF): páginas en markdown interconectadas con " +
  "enlaces [[Nombre]]. Hablas en español, con precisión y calidez. Enlazas " +
  "generosamente entre páginas usando [[Nombre exacto de la página]].";

function renderPages(pages: OKFPage[]): string {
  if (!pages.length) return "(la wiki está vacía todavía)";
  return pages
    .map((p) => `### Página: ${p.name}\n${(p.content ?? "").trim() || "(sin contenido)"}`)
    .join("\n\n");
}

/**
 * Prompt de INGESTA. Pide al modelo que lea una fuente nueva y devuelva un
 * objeto JSON que la UI pueda aplicar. La UI parsea con try/catch, así que el
 * prompt insiste en devolver SOLO el JSON.
 *
 * Forma esperada:
 * {
 *   "summaryPage": { "name": string, "content": string },
 *   "updates": [ { "name": string, "content": string } ],
 *   "indexEntry": string,   // línea para el índice, idealmente con [[enlace]]
 *   "logTitle": string      // título corto para el registro
 * }
 */
export function ingestPrompt(source: string, pages: OKFPage[]): string {
  const names = pages.map((p) => p.name).join(", ") || "(ninguna)";
  return `${ASTRAURA_VOICE}

TAREA: INGESTA de una fuente nueva en la wiki.

Páginas que YA existen en la wiki (enlázalas con [[Nombre]] cuando proceda; NO las dupliques):
${names}

Contenido actual de las páginas (para que enlaces y evites repetir):
${renderPages(pages)}

FUENTE NUEVA A INGERIR:
"""
${(source ?? "").trim()}
"""

INSTRUCCIONES:
1. Redacta UNA página de resumen ("summaryPage") en markdown que destile lo esencial de la fuente.
   - Empieza con "# <Nombre de la página>" y una o dos frases de definición.
   - Usa [[enlaces]] hacia páginas existentes o que deberían existir.
   - Elige un "name" corto, claro y estable (no uses "index", "log" ni "schema").
2. Si la fuente exige actualizar o crear OTRAS páginas, inclúyelas en "updates"
   (cada una con su markdown COMPLETO ya fusionado, lista para guardar tal cual).
   Si no hace falta, devuelve "updates": [].
3. "indexEntry": una línea para el catálogo, idealmente "- [[Nombre]] — breve descripción".
4. "logTitle": un título corto (≤ 8 palabras) que describa esta ingesta.

DEVUELVE EXCLUSIVAMENTE un objeto JSON válido (sin texto antes ni después, sin acentos graves triples):
{"summaryPage":{"name":"...","content":"..."},"updates":[{"name":"...","content":"..."}],"indexEntry":"...","logTitle":"..."}`;
}

/**
 * Prompt de CONSULTA. El modelo sintetiza una respuesta a partir de las páginas
 * de la wiki, citando las páginas usadas con [[enlaces]].
 */
export function queryPrompt(question: string, pages: OKFPage[]): string {
  return `${ASTRAURA_VOICE}

TAREA: CONSULTA sobre la wiki. Responde usando SOLO el conocimiento de las páginas.

PÁGINAS DE LA WIKI:
${renderPages(pages)}

PREGUNTA:
"""
${(question ?? "").trim()}
"""

INSTRUCCIONES:
- Responde en español, de forma concreta y bien estructurada (markdown).
- CITA cada página que utilices con [[Nombre de la página]] en línea.
- Si la wiki no contiene la respuesta, dilo con claridad y sugiere qué página
  faltaría crear (mencionándola con [[Nombre sugerido]]).
- No inventes datos que no estén respaldados por las páginas.

Devuelve solo la respuesta en markdown (no JSON).`;
}

/**
 * Prompt de REVISIÓN (lint). El modelo devuelve un informe de salud de la wiki.
 */
export function lintPrompt(pages: OKFPage[]): string {
  return `${ASTRAURA_VOICE}

TAREA: REVISIÓN (lint) de salud de la wiki.

PÁGINAS DE LA WIKI:
${renderPages(pages)}

Analiza la wiki y produce un informe en español (markdown) con estas secciones:

## Páginas huérfanas
Páginas a las que nadie enlaza con [[…]] (excluye index, log y schema).

## Contradicciones
Afirmaciones que se contradicen entre páginas (cita las páginas con [[…]]).

## Afirmaciones obsoletas o dudosas
Datos que parezcan caducos o poco fiables.

## Enlaces que faltan
Conceptos mencionados que deberían enlazarse con [[…]] y aún no lo están,
o enlaces [[…]] que apuntan a páginas inexistentes.

## Páginas sugeridas
Páginas nuevas que convendría crear (nómbralas con [[Nombre sugerido]]).

Sé breve y accionable. Si una sección no aplica, escribe "—".`;
}
