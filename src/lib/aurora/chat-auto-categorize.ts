"use client";

/**
 * StarSeed OS — Aurora · Categorización automática (local, determinista, barata)
 * ----------------------------------------------------------------------------
 * Asigna a cada chat/contexto de Aurora una CATEGORÍA temática y un TÍTULO corto
 * derivados SÓLO del texto de los mensajes — SIN llamar a ninguna IA externa.
 * Es una heurística por palabras clave, 100% offline, pura y determinista: el
 * mismo texto produce siempre la misma categoría y el mismo título. Pensada para
 * correr sobre TODOS los chats existentes y sobre cada chat nuevo al cerrarse o
 * actualizarse, agrupando los contextos por tema (una rama del catálogo por
 * categoría).
 *
 *  · SIN estado, SIN React, SIN localStorage aquí (eso vive en chat-catalog.ts).
 *  · Barato: puntuación por conteo de coincidencias de raíces de palabra; O(n).
 *  · Defensivo: acepta strings vacíos / entradas malformadas sin lanzar.
 *
 * Taxonomía (fija y versionada): cada categoría tiene id, etiqueta legible,
 * icono (nombre de lucide, resuelto por la UI), color del orbe Trinity y un
 * conjunto de raíces de palabra clave (español · minúsculas · sin tildes).
 */

// ── Tipos ────────────────────────────────────────────────────────────────────
/** Id estable de categoría (no cambiar los existentes: rompería el agrupado). */
export type ChatCategoryId =
  | "sistema"
  | "creacion"
  | "gobernanza"
  | "cafe"
  | "audio"
  | "educacion"
  | "personal"
  | "general";

/** Definición de una categoría temática. */
export interface ChatCategoryDef {
  id: ChatCategoryId;
  /** Etiqueta legible (ES). */
  label: string;
  /** Nombre de icono de lucide-react (la UI lo resuelve). */
  icon: string;
  /** Color del orbe Trinity asociado (hex). */
  color: string;
  /** Descripción corta (para tooltips / cabeceras del explorador). */
  hint: string;
}

/** Una entrada mínima de conversación para categorizar (compatible con el log). */
export interface CategorizableEntry {
  role?: string;
  text?: string;
  ts?: number;
}

/** Resultado de categorizar una sesión/contexto. */
export interface ChatCategoryResult {
  /** Categoría ganadora. */
  category: ChatCategoryId;
  /** Título corto derivado del contenido (o un fallback estable). */
  title: string;
  /** Puntuación de la categoría ganadora (0 = sin señal → "general"). */
  score: number;
  /** Palabras clave detectadas que decidieron la categoría (para depurar/UI). */
  matched: string[];
}

// ── Taxonomía (orden = prioridad de desempate) ───────────────────────────────
/**
 * Categorías en ORDEN de prioridad para desempates: las más específicas primero,
 * "general" siempre al final como red de seguridad. Los colores siguen la paleta
 * del orbe: azul #007FFF, verde #39FF14, amarillo #FFBF00, rojo #DC143C + apoyos.
 */
export const CHAT_CATEGORIES: ChatCategoryDef[] = [
  {
    id: "sistema",
    label: "Sistema / OS",
    icon: "Cpu",
    color: "#007FFF",
    hint: "Escritorios, ventanas, ajustes, widgets y control del OS",
  },
  {
    id: "creacion",
    label: "Creación",
    icon: "Wand2",
    color: "#39FF14",
    hint: "Diseño, escritura, arte, código y proyectos creativos",
  },
  {
    id: "gobernanza",
    label: "Gobernanza",
    icon: "Landmark",
    color: "#FFBF00",
    hint: "Votaciones, propuestas, comunidades y política de la red",
  },
  {
    id: "cafe",
    label: "Café",
    icon: "Coffee",
    color: "#D4AF37",
    hint: "Cafetería StarSeed, elixires, recetas y barra",
  },
  {
    id: "audio",
    label: "Audio / Frecuencias",
    icon: "AudioLines",
    color: "#DC143C",
    hint: "Sonido, música, frecuencias y visualizador audiomórfico",
  },
  {
    id: "educacion",
    label: "Educación",
    icon: "GraduationCap",
    color: "#10B981",
    hint: "Biblioteca, aprendizaje, conocimiento y mentoría",
  },
  {
    id: "personal",
    label: "Personal",
    icon: "Heart",
    color: "#F472B6",
    hint: "Notas propias, agenda, recordatorios y vida personal",
  },
  {
    id: "general",
    label: "General",
    icon: "MessageSquare",
    color: "#94A3B8",
    hint: "Conversaciones sin un tema dominante",
  },
];

/** Acceso O(1) a una definición por id (con fallback a "general"). */
const CATEGORY_BY_ID: Record<ChatCategoryId, ChatCategoryDef> = CHAT_CATEGORIES.reduce(
  (acc, c) => {
    acc[c.id] = c;
    return acc;
  },
  {} as Record<ChatCategoryId, ChatCategoryDef>,
);

/** Devuelve la definición de una categoría (o la de "general" si no existe). */
export function categoryDef(id: ChatCategoryId | string | undefined): ChatCategoryDef {
  if (id && (id as ChatCategoryId) in CATEGORY_BY_ID) {
    return CATEGORY_BY_ID[id as ChatCategoryId];
  }
  return CATEGORY_BY_ID.general;
}

// ── Diccionario de raíces por categoría ──────────────────────────────────────
/**
 * Raíces de palabra clave (minúsculas, SIN tildes) por categoría. Se comparan
 * contra el texto normalizado por límites de palabra flexibles (subcadena tras
 * normalizar), así "escritorios" activa "escritorio". Mantener genérico y barato.
 * Cada acierto suma 1; algunas raíces "fuertes" pesan 2 (marcadas con "!").
 */
const KEYWORDS: Record<Exclude<ChatCategoryId, "general">, string[]> = {
  sistema: [
    "escritorio!", "ventana", "widget!", "dashboard", "ajuste", "config",
    "tema oscuro", "tema claro", "pizarra", "sistema operativo", "os ",
    "launcher", "instala", "actualiz", "reinicia", "orbe", "trinity",
    "exocortex", "notificacion", "atajo", "pantalla", "modo ", "interfaz",
    "dock", "cortina", "abre mis", "ordena las ventanas", "reorganiza",
  ],
  creacion: [
    "disena!", "diseno", "crea!", "genera imagen", "arte", "ilustra",
    "escribe!", "redacta", "articulo", "proyecto", "logo", "boceto",
    "componente", "codigo!", "programa", "funcion", "css", "react",
    "landing", "mockup", "prototipo", "poster", "video", "guion",
    "publica", "contenido", "borrador", "creativ", "pinta", "canvas",
  ],
  gobernanza: [
    "vota!", "votacion", "propuesta!", "gobernanza", "politica", "asamblea",
    "comunidad!", "partido", "consenso", "decision colectiva", "ley",
    "legisla", "entidad federativa", "delegad", "referend", "mocion",
    "circulo de paz", "sangha", "ontocracia", "hub", "elige", "candidat",
  ],
  cafe: [
    "cafe!", "cafeteria", "elixir!", "barista", "receta", "bebida",
    "menu", "carta", "ingrediente", "vaso", "fermento", "ginger beer",
    "matcha", "chai", "infusion", "te ", "smoothie", "kombucha",
    "starseed cafe", "local", "barra", "pedido",
  ],
  audio: [
    "audio!", "sonido", "musica!", "frecuencia!", "hz", "cancion", "pista",
    "audiomorphic", "audiomorfic", "visualizador", "reproduc", "playlist",
    "beat", "ritmo", "melodia", "instrumento", "grabacion", "mezcla",
    "ecualiz", "binaural", "432", "528", "omnifrecuencia", "voz de aurora",
    "espectro", "onda", "resonancia",
  ],
  educacion: [
    "biblioteca!", "aprend!", "estudia", "curso", "leccion", "conocimiento",
    "explica", "ensena", "mentor", "documento", "libro", "investiga",
    "resume esto", "tutorial", "clase", "pedagog", "universidad", "materia",
    "apunte", "recomiendame que leer", "que leer",
  ],
  personal: [
    "recuerda!", "recuerdame", "recordatorio", "agenda", "tarea personal",
    "mi cumple", "mi dia", "diario", "nota personal", "personal!", "mi vida",
    "mis memorias", "guarda esto en mis memorias", "mi rutina", "mi salud",
    "mi animo", "sentimiento", "reflexion", "gratitud", "meditacion",
  ],
};

// ── Normalización ────────────────────────────────────────────────────────────
/** Minúsculas + sin tildes + espacios colapsados (barato y determinista). */
export function normalizeForMatch(text: string): string {
  const t = (text ?? "").toString();
  try {
    return t
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // quita diacríticos (marcas combinantes)
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    // Entornos sin normalize (muy raro): degradamos a lower simple.
    return t.toLowerCase().replace(/\s+/g, " ").trim();
  }
}

// ── Puntuación ───────────────────────────────────────────────────────────────
/**
 * Categoriza un TEXTO ya unido (todos los mensajes concatenados). Devuelve la
 * categoría con mayor puntuación; empate → orden de `CHAT_CATEGORIES`; sin señal
 * → "general". Determinista y O(nº de raíces).
 */
export function categorizeText(text: string): ChatCategoryResult {
  const norm = normalizeForMatch(text);
  if (!norm) {
    return { category: "general", title: "", score: 0, matched: [] };
  }

  let best: ChatCategoryId = "general";
  let bestScore = 0;
  let bestMatched: string[] = [];

  // Recorremos en orden de prioridad; ">" estricto respeta ese orden en empates.
  for (const def of CHAT_CATEGORIES) {
    if (def.id === "general") continue;
    const roots = KEYWORDS[def.id];
    let score = 0;
    const matched: string[] = [];
    for (const rawRoot of roots) {
      const strong = rawRoot.endsWith("!");
      const root = strong ? rawRoot.slice(0, -1) : rawRoot;
      if (!root) continue;
      if (norm.includes(root)) {
        score += strong ? 2 : 1;
        matched.push(root.trim());
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = def.id;
      bestMatched = matched;
    }
  }

  return {
    category: best,
    title: deriveTitle(text),
    score: bestScore,
    matched: bestMatched,
  };
}

/**
 * Categoriza una SESIÓN/contexto a partir de sus entradas. Prioriza el texto del
 * USUARIO (mejor señal de intención) pero usa todo si hace falta. Determinista.
 */
export function categorizeEntries(entries: CategorizableEntry[]): ChatCategoryResult {
  const list = Array.isArray(entries) ? entries : [];
  const userText = list
    .filter((e) => e && e.role === "user" && typeof e.text === "string")
    .map((e) => e.text as string)
    .join(" \n ");
  const allText = list
    .filter((e) => e && typeof e.text === "string")
    .map((e) => e.text as string)
    .join(" \n ");

  // 1) Intento con el texto del usuario (intención más limpia).
  const primary = categorizeText(userText);
  if (primary.score > 0) {
    // Título derivado del primer mensaje del usuario (más representativo).
    return { ...primary, title: deriveTitle(userText || allText) };
  }
  // 2) Sin señal en lo del usuario → probamos con TODO el texto.
  const secondary = categorizeText(allText);
  return { ...secondary, title: deriveTitle(userText || allText) };
}

// ── Título corto ─────────────────────────────────────────────────────────────
/** Palabras vacías (ES) que no aportan al título — se recortan de los extremos. */
const STOPWORDS = new Set([
  "el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "al",
  "a", "ante", "con", "en", "para", "por", "sin", "sobre", "y", "o", "u",
  "que", "como", "mi", "me", "te", "se", "le", "lo", "su", "es", "por favor",
  "porfa", "hola", "oye", "aurora", "puedes", "podrias", "quiero", "necesito",
]);

/**
 * Deriva un TÍTULO CORTO (≤ ~48 chars) del contenido: toma la primera frase
 * significativa del texto (idealmente del usuario), la limpia, recorta stopwords
 * de los bordes y capitaliza. Determinista. Si no hay texto útil, "".
 */
export function deriveTitle(text: string): string {
  const raw = (text ?? "").toString().replace(/\s+/g, " ").trim();
  if (!raw) return "";

  // Primera frase: hasta el primer terminador fuerte (. ! ? \n) o los primeros
  // ~64 caracteres. Quitamos directivas [[...]] y URLs para que no ensucien.
  const cleaned = raw
    .replace(/\[\[[^\]]*\]\]/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";

  const firstChunk = (cleaned.split(/[.!?\n]/)[0] || cleaned).trim();
  const source = firstChunk.length >= 3 ? firstChunk : cleaned;

  // Tokenizamos y recortamos stopwords SOLO de los extremos (mantiene el sentido).
  let words = source.split(" ").filter(Boolean);
  while (words.length > 1 && STOPWORDS.has(normalizeForMatch(words[0]))) {
    words = words.slice(1);
  }
  while (words.length > 1 && STOPWORDS.has(normalizeForMatch(words[words.length - 1]))) {
    words = words.slice(0, -1);
  }

  // Máximo ~8 palabras / 48 caracteres.
  let title = words.slice(0, 8).join(" ");
  if (title.length > 48) title = `${title.slice(0, 47).trimEnd()}…`;
  else if (words.length > 8) title = `${title}…`;

  // Capitaliza la primera letra (sin tocar el resto).
  return title.charAt(0).toUpperCase() + title.slice(1);
}

/** Título de respaldo estable cuando no hay contenido (usa día + categoría). */
export function fallbackTitle(category: ChatCategoryId, day?: string): string {
  const def = categoryDef(category);
  return day ? `${def.label} · ${day}` : def.label;
}

export default categorizeEntries;
