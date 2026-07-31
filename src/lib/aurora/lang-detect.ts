/**
 * StarSeed OS — DETECCIÓN DE IDIOMA por chat (Adenda 112).
 * ============================================================================
 * Detector ligero y SIN DEPENDENCIAS para elegir el idioma de un chat de Astraura
 * automáticamente (o dejar que se seleccione a mano). Heurística por palabras
 * función distintivas + diacríticos, pensada para frases cortas de chat. Cubre
 * es/en/pt/fr/de/it/ca. La interfaz (`detectLang`/`resolveLang`) es estable, así
 * que se puede sustituir por `franc` (registro de integraciones) sin cambiar los
 * consumidores. Lógica pura. Nunca lanza.
 */

export interface LangOption {
  code: string; // "" = automático
  label: string;
}

export const LANG_OPTIONS: LangOption[] = [
  { code: "", label: "Automático" },
  { code: "es", label: "Español" },
  { code: "en", label: "English" },
  { code: "pt", label: "Português" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
  { code: "ca", label: "Català" },
];

/** Palabras función distintivas por idioma (peso alto = muy característica). */
const STOP: Record<string, Record<string, number>> = {
  es: { de: 1, la: 1, que: 1, el: 1, en: 1, y: 1, los: 1, con: 1, para: 1, una: 1, por: 1, es: 1, no: 1, más: 2, cómo: 2, qué: 2, está: 2, hola: 2, gracias: 2, pero: 1, muy: 1, esto: 1, también: 2, porque: 2 },
  en: { the: 2, and: 1, of: 1, to: 1, in: 1, is: 1, you: 2, that: 1, it: 1, for: 1, are: 1, with: 1, this: 1, how: 2, what: 2, hello: 2, thanks: 2, please: 2, because: 1, very: 1 },
  pt: { de: 1, que: 1, não: 2, uma: 1, com: 1, para: 1, você: 2, obrigado: 2, olá: 2, está: 1, muito: 1, também: 2, então: 2, isso: 2, mas: 1, porque: 1, cê: 2 },
  fr: { le: 1, la: 1, les: 2, un: 1, une: 1, et: 1, est: 1, vous: 2, que: 1, pour: 1, pas: 2, bonjour: 2, merci: 2, comment: 2, ça: 2, être: 2, avec: 1, mais: 1, parce: 2, très: 1 },
  de: { der: 2, die: 1, das: 2, und: 1, ist: 1, nicht: 2, ein: 1, eine: 1, mit: 1, für: 2, hallo: 2, danke: 2, wie: 1, was: 1, ich: 2, sie: 1, aber: 1, weil: 2, sehr: 1 },
  it: { il: 2, la: 1, che: 1, di: 1, un: 1, una: 1, per: 1, con: 1, sono: 2, ciao: 2, grazie: 2, come: 1, cosa: 2, non: 1, molto: 2, perché: 2, ma: 1, anche: 1 },
  ca: { el: 1, la: 1, que: 1, de: 1, i: 1, un: 1, una: 1, amb: 2, per: 1, hola: 1, gràcies: 2, com: 1, què: 2, molt: 1, això: 2, però: 2, perquè: 2, també: 1 },
};

/** Bonos por diacríticos/caracteres muy indicativos de un idioma. */
function diacriticBonus(text: string): Record<string, number> {
  const b: Record<string, number> = {};
  const add = (k: string, n: number) => { b[k] = (b[k] ?? 0) + n; };
  if (/[ñ]/i.test(text)) add("es", 2);
  if (/[¿¡]/.test(text)) add("es", 2);
  if (/[ãõ]/i.test(text)) add("pt", 3);
  if (/ç/i.test(text)) { add("pt", 1); add("fr", 1); add("ca", 1); }
  if (/[äöüß]/i.test(text)) add("de", 3);
  if (/l·l/i.test(text)) add("ca", 3);
  if (/[àèìòù]/i.test(text)) add("it", 1);
  if (/[œâêîôû]/i.test(text)) add("fr", 2);
  return b;
}

/**
 * Detecta el idioma de un texto. Devuelve el código (es/en/…) o "" si no hay
 * señal suficiente (texto muy corto o ambiguo).
 */
export function detectLang(text: string): string {
  const t = (text || "").toLowerCase();
  if (!t.trim()) return "";
  const words = t.split(/[^a-záéíóúàèìòùâêîôûäöüßñçãõ·]+/i).filter(Boolean);
  if (!words.length) return "";
  const score: Record<string, number> = {};
  for (const lang of Object.keys(STOP)) score[lang] = 0;
  for (const w of words) {
    for (const lang of Object.keys(STOP)) {
      const wt = STOP[lang][w];
      if (wt) score[lang] += wt;
    }
  }
  const bonus = diacriticBonus(t);
  for (const lang of Object.keys(bonus)) score[lang] = (score[lang] ?? 0) + bonus[lang];

  let best = "";
  let bestScore = 0;
  let second = 0;
  for (const lang of Object.keys(score)) {
    if (score[lang] > bestScore) { second = bestScore; bestScore = score[lang]; best = lang; }
    else if (score[lang] > second) { second = score[lang]; }
  }
  // Umbral: necesita señal mínima y algo de margen sobre el segundo.
  if (bestScore < 2) return "";
  if (bestScore === second) return "";
  return best;
}

/**
 * Resuelve el idioma efectivo de un chat: modo "auto"/"" → detecta del texto (o
 * `fallback` si no hay señal); un código fijo se devuelve tal cual.
 */
export function resolveLang(mode: string, text: string, fallback = "es"): string {
  if (mode && mode !== "auto") return mode;
  return detectLang(text) || fallback;
}

export function langLabel(code: string): string {
  return LANG_OPTIONS.find((o) => o.code === code)?.label ?? (code || "Automático");
}
