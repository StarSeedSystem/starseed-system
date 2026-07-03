/**
 * term-normalizer — Corrección fonética de términos propios de StarSeed.
 *
 * El reconocimiento de voz (Web Speech API) destroza los nombres propios del
 * ecosistema: "Astraura" → "astral", "astro aura", "astoria"; "Exocórtex" →
 * "exo corte", "eco cortex"; "StarSeed" → "star sid", "estar seed"…
 *
 * Este módulo, dado el texto reconocido, corrige esas variantes mal oídas a su
 * forma canónica ANTES de rutear/enviar a Astraura, preservando el resto del
 * texto. Es DETERMINISTA, barato y SIN dependencias. SSR-safe (solo strings).
 *
 * Reutilizable por el Nexus / Café: exporta `STARSEED_TERMS` (tabla canónica) y
 * `normalizeStarseedTerms(text)`.
 */

/** Un término canónico + su lista de variantes/homófonos aproximados. */
export interface StarseedTerm {
  /** Forma canónica que se escribirá en el texto corregido. */
  canonical: string;
  /**
   * Variantes/homófonos tal como el STT los suele oír (con o sin espacios,
   * acentos, etc.). Se normalizan fonéticamente para comparar, así que no hace
   * falta ser exhaustivo con acentos/mayúsculas.
   */
  variants: string[];
  /**
   * Nº máximo de palabras que puede ocupar la variante en el texto (ventana de
   * tokens). Se calcula solo si no se indica; se deja como override manual.
   */
  maxWords?: number;
}

/**
 * TABLA CANÓNICA de términos StarSeed.
 * Las variantes incluyen las formas mal oídas típicas del dictado en español.
 * (Se comparan por CLAVE FONÉTICA, no literalmente — ver `phoneticKey`.)
 */
export const STARSEED_TERMS: StarseedTerm[] = [
  {
    canonical: "Astraura",
    variants: [
      "astraura", "astra ura", "astra aura", "astral aura", "astral", "astro aura",
      "astoria", "esta aura", "está aura", "astra hora", "astraora", "astrahura",
      "astrora", "astaura", "astr aura", "as traura", "astro hora", "astra ora",
    ],
  },
  {
    canonical: "StarSeed",
    variants: [
      "starseed", "star seed", "star sid", "star sit", "star seat", "estar seed",
      "star sith", "star sick", "estar sid", "star sib", "star cid", "star sed",
      "estarsid", "star zid", "starsid", "star said", "star seid", "estar sit",
    ],
  },
  {
    canonical: "Exocórtex",
    variants: [
      "exocortex", "exo cortex", "eco cortex", "exo corte", "exo cortes",
      "exocordes", "exo cordex", "exo córtex", "eco córtex", "exocorte",
      "exocortes", "hexo cortex", "exo cortech", "exocordex", "exo cortez",
      "eco cortez", "exocortez", "exo corteza",
    ],
  },
  {
    canonical: "Ontocracia",
    variants: [
      "ontocracia", "onto gracia", "onda cracia", "onto cracia", "onto gracía",
      "ontogracia", "onto gracia", "onda gracia", "onto crasia", "ontocrasia",
      "onto crácia", "hondo cracia", "onto craxia", "onto gracias",
    ],
  },
  {
    canonical: "Ciberdelia",
    variants: [
      "ciberdelia", "ciber delia", "siber delia", "cyber delia", "ciber delía",
      "ciberdelía", "ciber delilah", "siberdelia", "ciber delhi a", "ciber d lia",
      "cyberdelia", "civer delia", "ciber delya", "siber delya",
    ],
  },
  {
    canonical: "Transhumanismo Comunista",
    variants: [
      "transhumanismo comunista", "trans humanismo comunista",
      "transumanismo comunista", "trans umanismo comunista",
    ],
  },
  {
    canonical: "Transhumanismo",
    variants: [
      "transhumanismo", "trans humanismo", "transumanismo", "trans umanismo",
      "tras humanismo", "trans humanista", "transhumanista", "transhumano",
    ],
  },
  {
    canonical: "Sanghas",
    variants: [
      "sanghas", "sangas", "sankas", "san gas", "zangas", "sangha s", "sanga s",
      "sanjas", "changas", "sanchas", "sang has",
    ],
  },
  {
    canonical: "Sangha",
    variants: [
      "sangha", "sanga", "sanka", "zanga", "sanja", "changa", "sancha", "sang ha",
      "san ha", "sam ga",
    ],
  },
  {
    canonical: "Audiomorphic",
    variants: [
      "audiomorphic", "audio morphic", "audio morfic", "audiomorfic",
      "audio mórfic", "audio morfik", "audiomórfico", "audio morphico",
      "audio morfico", "audiomorfico", "odio morphic", "audio morphik",
      "audio morfing", "audiomorphik",
    ],
  },
  {
    canonical: "Omnifrecuencias",
    variants: [
      "omnifrecuencias", "omni frecuencias", "omni frecuencia", "omnifrecuencia",
      "omne frecuencias", "omni frecuensias", "omnifrecuensias", "omni frequencias",
      "hombre frecuencias", "omni frecuencia s", "omni frecuencies",
    ],
  },
  {
    canonical: "Trinity",
    variants: [
      "trinity", "trinidad", "trini ti", "trini di", "trini t", "triniti",
      "triniti", "trini day", "trinidada", "trini dad", "trinit",
    ],
  },
  {
    canonical: "Nexus",
    variants: [
      "nexus", "nexos", "next us", "nexss", "nex us", "necsus", "nexux",
      "néxus", "nexos", "nexo s", "nex xus",
    ],
  },
  {
    canonical: "Zenith",
    variants: [
      "zenith", "zenit", "senith", "senit", "cenit", "zénit", "zeniz",
      "zeneth", "seneth", "zenif", "cenith",
    ],
  },
  {
    canonical: "Horizon",
    variants: [
      "horizon", "orizon", "horizonte", "orison", "horaizon", "jorizon",
      "horison", "orizonte", "horizonn",
    ],
  },
  {
    canonical: "Anchor",
    variants: [
      "anchor", "ancor", "anclar", "ancла", "ankor", "ancora", "ánchor",
      "anchore", "ancher", "ancar", "anchol",
    ],
  },
  {
    canonical: "Logic",
    variants: [
      "logic", "loyic", "loshic", "loguic", "lóyic", "loyik", "logik",
      "loji", "loshik",
    ],
  },
  {
    canonical: "StarSeed OS",
    variants: [
      "starseed os", "star seed os", "star sid os", "estar seed os", "starseedos",
      "starseed o s", "star seed o ese", "starseed o ese",
    ],
  },
  {
    canonical: "StarSeed Nexus",
    variants: [
      "starseed nexus", "star seed nexus", "star sid nexus", "starseed nexos",
      "star seed nexos",
    ],
  },
  {
    canonical: "Multiverso",
    variants: [
      "multiverso", "multi verso", "multiberso", "multi berso", "multibersos",
    ],
  },
];

/* ────────────────────────────────────────────────────────────────────────── *
 *  Núcleo fonético                                                             *
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Clave fonética aproximada para español dictado. Colapsa las confusiones más
 * frecuentes del STT para que "siber delia" y "ciberdelia" caigan en la misma
 * clave. NO pretende ser Soundex/Metaphone; es una heurística barata y estable.
 */
export function phoneticKey(input: string): string {
  let s = (input || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita acentos/diacríticos
    .replace(/[^a-z0-9\s]/g, " ")    // fuera puntuación
    .replace(/\s+/g, " ")
    .trim();

  // Colapsos fonéticos (orden importa). Trabajamos sobre la cadena completa,
  // preservando espacios entre palabras (los normalizamos al final).
  s = s
    .replace(/\bh/g, "")             // 'h' muda al inicio de sílaba
    .replace(/qu/g, "k")             // que/qui → ke/ki
    .replace(/gu([ei])/g, "g$1")     // gue/gui → ge/gi (sonido /g/)
    .replace(/[cq]([^ei])/g, "k$1")  // ca/co/cu/q → ka/ko/ku
    .replace(/c([ei])/g, "s$1")      // ce/ci → se/si
    .replace(/ch/g, "x")             // 'ch' → símbolo único 'x'
    .replace(/z/g, "s")              // seseo: z → s
    .replace(/v/g, "b")              // betacismo: v → b
    .replace(/y/g, "i")              // y → i (final/vocálica)
    .replace(/ll/g, "i")             // ll ≈ y ≈ i
    .replace(/w/g, "u")
    .replace(/j/g, "x")              // j → sonido velar 'x'
    .replace(/ge/g, "xe").replace(/gi/g, "xi") // g suave → x
    .replace(/x/g, "s")              // finalmente 'x'(varias) → s aprox.
    .replace(/(.)\1+/g, "$1")        // colapsa dobles (rr, ss, etc.)
    .replace(/\s+/g, "")             // junta todo: la ventana ya define límites
    .trim();
  return s;
}

/** Distancia de Levenshtein clásica (iterativa, O(n·m), sin dependencias). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const al = a.length, bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  let prev = new Array(bl + 1);
  let curr = new Array(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;
  for (let i = 1; i <= al; i++) {
    curr[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= bl; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    const tmp = prev; prev = curr; curr = tmp;
  }
  return prev[bl];
}

/** Similitud normalizada 0..1 sobre dos claves fonéticas (1 = idénticas). */
export function phoneticSimilarity(a: string, b: string): number {
  if (!a && !b) return 1;
  const max = Math.max(a.length, b.length) || 1;
  return 1 - levenshtein(a, b) / max;
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Índice precompilado (variantes → término canónico, por clave fonética)      *
 * ────────────────────────────────────────────────────────────────────────── */

interface CompiledVariant {
  canonical: string;
  words: number;   // nº de palabras de la variante original
  key: string;     // clave fonética
}

/** Precompila el índice una sola vez a nivel de módulo. */
const COMPILED: CompiledVariant[] = (() => {
  const out: CompiledVariant[] = [];
  const seen = new Set<string>();
  for (const term of STARSEED_TERMS) {
    for (const v of term.variants) {
      const words = v.trim().split(/\s+/).filter(Boolean).length || 1;
      const key = phoneticKey(v);
      if (!key) continue;
      const dedupe = `${term.canonical}::${key}::${words}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      out.push({ canonical: term.canonical, words, key });
    }
  }
  // Ordena por más palabras primero: preferimos casar "star seed os" antes que
  // "star seed" sobre el mismo tramo de texto.
  out.sort((a, b) => b.words - a.words);
  return out;
})();

/** Nº máximo de palabras que puede ocupar cualquier variante (tamaño de ventana). */
const MAX_WINDOW = COMPILED.reduce((m, c) => Math.max(m, c.words), 1);

/** Umbral de similitud fonética para aceptar una corrección difusa. */
const SIM_THRESHOLD = 0.86;

/** Palabras funcionales que NUNCA deben corregirse solas (evita falsos positivos). */
const STOPWORDS = new Set([
  "a", "e", "o", "u", "de", "la", "el", "en", "y", "que", "es", "se", "un", "una",
  "lo", "los", "las", "por", "con", "su", "al", "del", "mi", "me", "te", "si",
]);

/* ────────────────────────────────────────────────────────────────────────── *
 *  Corrector principal                                                         *
 * ────────────────────────────────────────────────────────────────────────── */

/** Un token del texto con sus offsets originales (para reensamblar exacto). */
interface Tok { text: string; start: number; end: number; }

function tokenize(text: string): Tok[] {
  const toks: Tok[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    toks.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }
  return toks;
}

/**
 * Busca la MEJOR variante que casa una ventana de tokens (fonéticamente).
 * Devuelve { canonical, score } o null. Exacta (score=1) tiene prioridad.
 */
function bestMatchForKey(windowKey: string, words: number): { canonical: string; score: number } | null {
  if (!windowKey) return null;
  let best: { canonical: string; score: number } | null = null;
  for (const c of COMPILED) {
    // Solo comparamos variantes con el MISMO nº de palabras que la ventana.
    if (c.words !== words) continue;
    if (c.key === windowKey) return { canonical: c.canonical, score: 1 };
    // Coincidencia difusa: exige longitudes comparables para evitar disparates.
    const lenRatio = Math.min(c.key.length, windowKey.length) / Math.max(c.key.length, windowKey.length || 1);
    if (lenRatio < 0.6) continue;
    const score = phoneticSimilarity(c.key, windowKey);
    if (score >= SIM_THRESHOLD && (!best || score > best.score)) {
      best = { canonical: c.canonical, score };
    }
  }
  return best;
}

/**
 * Corrige los términos StarSeed mal reconocidos dentro de `text`, preservando
 * el resto (espaciado, puntuación adyacente y mayúsculas no propias).
 *
 * Estrategia: recorre los tokens de izquierda a derecha probando ventanas de
 * MAX_WINDOW..1 palabras; en cuanto una ventana casa (exacta o difusa) con una
 * variante, la sustituye por la forma canónica y salta al final de la ventana.
 * Preferimos ventanas más largas (multi-palabra) para no partir términos.
 *
 * Determinista, sin efectos, SSR-safe.
 */
export function normalizeStarseedTerms(text: string): string {
  if (!text || typeof text !== "string") return text || "";
  const toks = tokenize(text);
  if (toks.length === 0) return text;

  const outParts: string[] = [];
  let i = 0;
  let cursor = 0; // posición en el string original ya volcada a outParts

  while (i < toks.length) {
    let matched = false;
    const maxW = Math.min(MAX_WINDOW, toks.length - i);
    for (let w = maxW; w >= 1; w--) {
      // Ventana de w palabras: separa la parte alfanumérica de la puntuación
      // final para poder conservarla (p. ej. "cortex," → "Exocórtex,").
      const first = toks[i];
      const last = toks[i + w - 1];
      const windowRaw = text.slice(first.start, last.end);
      // Puntuación de borde a preservar.
      const leadMatch = windowRaw.match(/^[^\p{L}\p{N}]+/u);
      const trailMatch = windowRaw.match(/[^\p{L}\p{N}]+$/u);
      const lead = leadMatch ? leadMatch[0] : "";
      const trail = trailMatch ? trailMatch[0] : "";
      const coreStr = windowRaw.slice(lead.length, windowRaw.length - trail.length);
      if (!coreStr) continue;

      // Una sola palabra funcional/stopword: no la toques (evita "de"→algo).
      if (w === 1) {
        const bare = coreStr.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
        if (STOPWORDS.has(bare) || bare.length < 3) continue;
      }

      const key = phoneticKey(coreStr);
      const hit = bestMatchForKey(key, w);
      if (hit) {
        // Vuelca lo que había antes de esta ventana tal cual (whitespace incl.).
        outParts.push(text.slice(cursor, first.start));
        outParts.push(lead + hit.canonical + trail);
        cursor = last.end;
        i += w;
        matched = true;
        break;
      }
    }
    if (!matched) i += 1;
  }
  // Cola final sin tocar.
  outParts.push(text.slice(cursor));
  return outParts.join("");
}

/**
 * Variante que además informa qué correcciones se hicieron (para depurar / UI).
 * No se usa en el hot-path del engine, pero es útil para el Nexus/Café.
 */
export function normalizeStarseedTermsVerbose(
  text: string,
): { text: string; corrections: { from: string; to: string }[] } {
  const corrections: { from: string; to: string }[] = [];
  if (!text || typeof text !== "string") return { text: text || "", corrections };
  const toks = tokenize(text);
  if (toks.length === 0) return { text, corrections };

  const outParts: string[] = [];
  let i = 0;
  let cursor = 0;
  while (i < toks.length) {
    let matched = false;
    const maxW = Math.min(MAX_WINDOW, toks.length - i);
    for (let w = maxW; w >= 1; w--) {
      const first = toks[i];
      const last = toks[i + w - 1];
      const windowRaw = text.slice(first.start, last.end);
      const leadMatch = windowRaw.match(/^[^\p{L}\p{N}]+/u);
      const trailMatch = windowRaw.match(/[^\p{L}\p{N}]+$/u);
      const lead = leadMatch ? leadMatch[0] : "";
      const trail = trailMatch ? trailMatch[0] : "";
      const coreStr = windowRaw.slice(lead.length, windowRaw.length - trail.length);
      if (!coreStr) continue;
      if (w === 1) {
        const bare = coreStr.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
        if (STOPWORDS.has(bare) || bare.length < 3) continue;
      }
      const key = phoneticKey(coreStr);
      const hit = bestMatchForKey(key, w);
      if (hit) {
        if (coreStr.normalize("NFC") !== hit.canonical.normalize("NFC")) {
          corrections.push({ from: coreStr, to: hit.canonical });
        }
        outParts.push(text.slice(cursor, first.start));
        outParts.push(lead + hit.canonical + trail);
        cursor = last.end;
        i += w;
        matched = true;
        break;
      }
    }
    if (!matched) i += 1;
  }
  outParts.push(text.slice(cursor));
  return { text: outParts.join(""), corrections };
}
