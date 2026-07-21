"use client";

/**
 * StarSeed OS — Catálogo de LOCALES (idiomas + variantes regionales/culturales)
 * para la voz de Aurora.
 * ============================================================================
 * Este módulo NO sintetiza ni decide nada por su cuenta: es un catálogo PURO
 * (datos + helpers sin efectos) que responde a dos preguntas:
 *
 *   1) "¿Qué locales existen y cómo se agrupan por idioma?"  → LOCALES,
 *      localesByBase(), baseOf(), findLocale(), searchLocales().
 *   2) "¿Qué locale(s) sugiere el ENTORNO de este dispositivo (sin pedir
 *      permisos)?" → suggestLocalesFromEnvironment(), combinando
 *      `navigator.languages`, `Intl.DateTimeFormat().resolvedOptions().locale`
 *      y la zona horaria (`…resolvedOptions().timeZone`).
 *
 * La PREFERENCIA explícita del usuario (qué locale elige de verdad) vive y se
 * persiste en `voice-config.ts` (`primaryLocale` / `preferredLocales` /
 * `personalityLocales`), que importa este catálogo para sanear/validar.
 *
 * NOTA HONESTA sobre el acento: el idioma BASE (`baseOf(code)`, p.ej. "es")
 * es lo que los motores de síntesis realmente distinguen hoy con fiabilidad.
 * El matiz REGIONAL/cultural (p.ej. "es-MX" frente a "es-ES") depende del
 * soporte de cada motor — hoy limitado en la mayoría —, pero la preferencia
 * del usuario queda siempre guardada aquí para cuando ese soporte mejore, y
 * el idioma base derivado se respeta siempre.
 *
 * SSR-safe y defensivo: todo acceso a `window`/`navigator`/`Intl` está
 * guardado con try/catch; ninguna función de este módulo lanza.
 */

// ── Tipos ────────────────────────────────────────────────────────────────────

/** Una variante regional/cultural de un idioma. */
export interface AuroraLocale {
  /** Código BCP-47 (p.ej. "es-MX", "zh-HK", "es-419"). */
  code: string;
  /** Idioma base para agrupar en la UI (normalmente ISO-639-1, p.ej. "es"). */
  base: string;
  /** Nombre en español para la UI (p.ej. "Español (México)"). */
  label: string;
  /** Endónimo / nombre nativo (p.ej. "Español de México", "Deutsch (Österreich)"). */
  native: string;
  /**
   * País/región descriptivo EN TEXTO (nunca emoji: el proyecto usa Lucide para
   * iconografía y reserva los emoji-bandera fuera de este catálogo).
   */
  region: string;
}

/** Grupo de locales que comparten el mismo idioma base (para la UI). */
export interface LocaleGroup {
  base: string;
  /** Nombre del idioma base en español (p.ej. "Español"), derivado del catálogo. */
  label: string;
  locales: AuroraLocale[];
}

// ── Catálogo EXHAUSTIVO ──────────────────────────────────────────────────────
// Orden intencional: primero las familias más habladas en la comunidad
// StarSeed (español, inglés, portugués…), luego el resto por relevancia
// global. El PRIMER locale listado bajo cada idioma base es su "representante
// por defecto" (lo usan BASE_DEFAULT_LOCALE y, por tanto, las sugerencias
// cuando solo se conoce el idioma pero no la región).

export const LOCALES: readonly AuroraLocale[] = [
  // ── Español ────────────────────────────────────────────────────────────
  { code: "es-ES", base: "es", label: "Español (España)", native: "Español de España", region: "España" },
  { code: "es-MX", base: "es", label: "Español (México)", native: "Español de México", region: "México" },
  { code: "es-AR", base: "es", label: "Español (Argentina)", native: "Español de Argentina", region: "Argentina" },
  { code: "es-CO", base: "es", label: "Español (Colombia)", native: "Español de Colombia", region: "Colombia" },
  { code: "es-CL", base: "es", label: "Español (Chile)", native: "Español de Chile", region: "Chile" },
  { code: "es-PE", base: "es", label: "Español (Perú)", native: "Español de Perú", region: "Perú" },
  { code: "es-VE", base: "es", label: "Español (Venezuela)", native: "Español de Venezuela", region: "Venezuela" },
  { code: "es-EC", base: "es", label: "Español (Ecuador)", native: "Español de Ecuador", region: "Ecuador" },
  { code: "es-US", base: "es", label: "Español (Estados Unidos)", native: "Español estadounidense", region: "Estados Unidos" },
  { code: "es-419", base: "es", label: "Español (Latinoamérica)", native: "Español latinoamericano", region: "Latinoamérica" },

  // ── Inglés ─────────────────────────────────────────────────────────────
  { code: "en-US", base: "en", label: "Inglés (Estados Unidos)", native: "American English", region: "Estados Unidos" },
  { code: "en-GB", base: "en", label: "Inglés (Reino Unido)", native: "British English", region: "Reino Unido" },
  { code: "en-AU", base: "en", label: "Inglés (Australia)", native: "Australian English", region: "Australia" },
  { code: "en-CA", base: "en", label: "Inglés (Canadá)", native: "Canadian English", region: "Canadá" },
  { code: "en-IN", base: "en", label: "Inglés (India)", native: "Indian English", region: "India" },
  { code: "en-IE", base: "en", label: "Inglés (Irlanda)", native: "Hiberno-English", region: "Irlanda" },
  { code: "en-NZ", base: "en", label: "Inglés (Nueva Zelanda)", native: "New Zealand English", region: "Nueva Zelanda" },
  { code: "en-ZA", base: "en", label: "Inglés (Sudáfrica)", native: "South African English", region: "Sudáfrica" },

  // ── Portugués ──────────────────────────────────────────────────────────
  { code: "pt-BR", base: "pt", label: "Portugués (Brasil)", native: "Português do Brasil", region: "Brasil" },
  { code: "pt-PT", base: "pt", label: "Portugués (Portugal)", native: "Português de Portugal", region: "Portugal" },
  { code: "pt-AO", base: "pt", label: "Portugués (Angola)", native: "Português de Angola", region: "Angola" },

  // ── Francés ────────────────────────────────────────────────────────────
  { code: "fr-FR", base: "fr", label: "Francés (Francia)", native: "Français de France", region: "Francia" },
  { code: "fr-CA", base: "fr", label: "Francés (Canadá)", native: "Français canadien", region: "Canadá" },
  { code: "fr-BE", base: "fr", label: "Francés (Bélgica)", native: "Français de Belgique", region: "Bélgica" },
  { code: "fr-CH", base: "fr", label: "Francés (Suiza)", native: "Français de Suisse", region: "Suiza" },

  // ── Alemán ─────────────────────────────────────────────────────────────
  { code: "de-DE", base: "de", label: "Alemán (Alemania)", native: "Deutsch (Deutschland)", region: "Alemania" },
  { code: "de-AT", base: "de", label: "Alemán (Austria)", native: "Österreichisches Deutsch", region: "Austria" },
  { code: "de-CH", base: "de", label: "Alemán (Suiza)", native: "Schweizer Hochdeutsch", region: "Suiza" },

  // ── Italiano ───────────────────────────────────────────────────────────
  { code: "it-IT", base: "it", label: "Italiano (Italia)", native: "Italiano d'Italia", region: "Italia" },
  { code: "it-CH", base: "it", label: "Italiano (Suiza)", native: "Italiano svizzero", region: "Suiza" },

  // ── Chino ──────────────────────────────────────────────────────────────
  { code: "zh-CN", base: "zh", label: "Chino (China, simplificado)", native: "中文（简体，中国）", region: "China" },
  { code: "zh-TW", base: "zh", label: "Chino (Taiwán, tradicional)", native: "中文（繁體，台灣）", region: "Taiwán" },
  { code: "zh-HK", base: "zh", label: "Chino (Hong Kong, tradicional)", native: "中文（繁體，香港）", region: "Hong Kong" },

  // ── Japonés / Coreano / Ruso ───────────────────────────────────────────
  { code: "ja-JP", base: "ja", label: "Japonés (Japón)", native: "日本語", region: "Japón" },
  { code: "ko-KR", base: "ko", label: "Coreano (Corea del Sur)", native: "한국어", region: "Corea del Sur" },
  { code: "ru-RU", base: "ru", label: "Ruso (Rusia)", native: "Русский", region: "Rusia" },

  // ── Árabe ──────────────────────────────────────────────────────────────
  { code: "ar-SA", base: "ar", label: "Árabe (Arabia Saudita)", native: "العربية (السعودية)", region: "Arabia Saudita" },
  { code: "ar-EG", base: "ar", label: "Árabe (Egipto)", native: "العربية (مصر)", region: "Egipto" },
  { code: "ar-MA", base: "ar", label: "Árabe (Marruecos)", native: "العربية (المغرب)", region: "Marruecos" },
  { code: "ar-AE", base: "ar", label: "Árabe (Emiratos Árabes Unidos)", native: "العربية (الإمارات)", region: "Emiratos Árabes Unidos" },

  // ── Hindi ──────────────────────────────────────────────────────────────
  { code: "hi-IN", base: "hi", label: "Hindi (India)", native: "हिन्दी", region: "India" },

  // ── Neerlandés ─────────────────────────────────────────────────────────
  { code: "nl-NL", base: "nl", label: "Neerlandés (Países Bajos)", native: "Nederlands (Nederland)", region: "Países Bajos" },
  { code: "nl-BE", base: "nl", label: "Neerlandés (Bélgica)", native: "Vlaams (België)", region: "Bélgica" },

  // ── Resto de Europa / Asia (una variante principal por idioma) ─────────
  { code: "pl-PL", base: "pl", label: "Polaco (Polonia)", native: "Polski", region: "Polonia" },
  { code: "tr-TR", base: "tr", label: "Turco (Turquía)", native: "Türkçe", region: "Turquía" },
  { code: "vi-VN", base: "vi", label: "Vietnamita (Vietnam)", native: "Tiếng Việt", region: "Vietnam" },
  { code: "th-TH", base: "th", label: "Tailandés (Tailandia)", native: "ภาษาไทย", region: "Tailandia" },
  { code: "id-ID", base: "id", label: "Indonesio (Indonesia)", native: "Bahasa Indonesia", region: "Indonesia" },
  { code: "sv-SE", base: "sv", label: "Sueco (Suecia)", native: "Svenska", region: "Suecia" },
  { code: "nb-NO", base: "no", label: "Noruego (Noruega)", native: "Norsk bokmål", region: "Noruega" },
  { code: "da-DK", base: "da", label: "Danés (Dinamarca)", native: "Dansk", region: "Dinamarca" },
  { code: "fi-FI", base: "fi", label: "Finés (Finlandia)", native: "Suomi", region: "Finlandia" },
  { code: "el-GR", base: "el", label: "Griego (Grecia)", native: "Ελληνικά (Ελλάδα)", region: "Grecia" },
  { code: "el-CY", base: "el", label: "Griego (Chipre)", native: "Ελληνικά (Κύπρος)", region: "Chipre" },
  { code: "he-IL", base: "he", label: "Hebreo (Israel)", native: "עברית", region: "Israel" },
  { code: "uk-UA", base: "uk", label: "Ucraniano (Ucrania)", native: "Українська", region: "Ucrania" },
  { code: "ro-RO", base: "ro", label: "Rumano (Rumanía)", native: "Română (România)", region: "Rumanía" },
  { code: "ro-MD", base: "ro", label: "Rumano (Moldavia)", native: "Română (Moldova)", region: "Moldavia" },
  { code: "hu-HU", base: "hu", label: "Húngaro (Hungría)", native: "Magyar", region: "Hungría" },
  { code: "cs-CZ", base: "cs", label: "Checo (Chequia)", native: "Čeština", region: "Chequia" },

  // ── Lenguas cooficiales de España ────────────────────────────────────────
  { code: "ca-ES", base: "ca", label: "Catalán (España)", native: "Català", region: "España" },
  { code: "eu-ES", base: "eu", label: "Euskera (España)", native: "Euskara", region: "España" },
  { code: "gl-ES", base: "gl", label: "Gallego (España)", native: "Galego", region: "España" },
];

// ── Alias de subtags heredados/macrolenguas ─────────────────────────────────
// Algunos navegadores/SO reportan tags "bare" que no coinciden literalmente
// con el `base` que usamos para agrupar (p.ej. Bokmål "nb" vs. nuestro grupo
// "no" = "Noruego"). Este alias es SOLO para resolver la búsqueda por base;
// nunca se usa como `code` de una entrada del catálogo.
const LANG_ALIASES: Readonly<Record<string, string>> = {
  nb: "no",
  nn: "no",
  iw: "he", // código ISO-639-1 legado de hebreo
  in: "id", // código ISO-639-1 legado de indonesio
};

// ── Helpers de catálogo ──────────────────────────────────────────────────────

/** Representante por defecto de CADA idioma base (el primero listado en LOCALES). */
function computeBaseDefaults(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const l of LOCALES) {
    if (!(l.base in out)) out[l.base] = l.code;
  }
  return out;
}
const BASE_DEFAULT_LOCALE: Readonly<Record<string, string>> = computeBaseDefaults();

/**
 * Agrupa LOCALES por idioma base, preservando el orden de aparición del
 * catálogo. La etiqueta del grupo se deriva del `label` de su primer locale
 * quitando el paréntesis regional (p.ej. "Español (España)" → "Español").
 * Pensado para pintar secciones en un selector desplegable. Nunca lanza.
 */
export function localesByBase(): LocaleGroup[] {
  const order: string[] = [];
  const map = new Map<string, AuroraLocale[]>();
  for (const l of LOCALES) {
    if (!map.has(l.base)) {
      map.set(l.base, []);
      order.push(l.base);
    }
    map.get(l.base)!.push(l);
  }
  return order.map((base) => {
    const locales = map.get(base) ?? [];
    const rawLabel = locales[0]?.label ?? base;
    const label = rawLabel.replace(/\s*\([^)]*\)\s*$/, "").trim() || rawLabel;
    return { base, label, locales };
  });
}

/** Busca un locale EXACTO por código BCP-47 (case-insensitive). Nunca lanza. */
export function findLocale(code: string | null | undefined): AuroraLocale | undefined {
  if (!code || typeof code !== "string") return undefined;
  const norm = code.trim().toLowerCase();
  if (!norm) return undefined;
  try {
    return LOCALES.find((l) => l.code.toLowerCase() === norm);
  } catch {
    return undefined;
  }
}

/**
 * Idioma BASE de un código BCP-47 (p.ej. "es-MX" → "es"). Si el código exacto
 * está en el catálogo, usa su `base` declarado (cubre casos como "nb-NO" →
 * base "no"); si no, toma el primer segmento del tag. Cae a "es" ante
 * cualquier entrada vacía/irreconocible (Aurora es hispanohablante por
 * defecto). Nunca lanza.
 */
export function baseOf(code: string | null | undefined): string {
  if (!code || typeof code !== "string") return "es";
  try {
    const known = findLocale(code);
    if (known) return known.base;
    const seg = code.trim().replace(/_/g, "-").split("-")[0];
    return seg ? seg.toLowerCase() : "es";
  } catch {
    return "es";
  }
}

/** Quita diacríticos y pasa a minúsculas (para búsqueda tolerante). */
function normalizeSearch(s: string): string {
  try {
    return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  } catch {
    return s.toLowerCase();
  }
}

/**
 * Filtra LOCALES por texto libre (código, nombre en español, endónimo o
 * región/país), sin distinguir mayúsculas ni acentos. Con texto vacío,
 * devuelve el catálogo completo. Pensado para el selector buscable. Nunca lanza.
 */
export function searchLocales(query: string): AuroraLocale[] {
  try {
    const q = normalizeSearch((query || "").trim());
    if (!q) return [...LOCALES];
    return LOCALES.filter((l) => normalizeSearch(`${l.code} ${l.label} ${l.native} ${l.region}`).includes(q));
  } catch {
    return [...LOCALES];
  }
}

/**
 * Normaliza un código de idioma/locale "crudo" (de `navigator.languages`,
 * `Intl`…) a un código CONOCIDO del catálogo:
 *   1) coincidencia exacta de código (p.ej. "es-MX" → "es-MX"),
 *   2) si trae un subtag de región/script de 2 letras que casa con alguna
 *      variante de la MISMA base (p.ej. "zh-Hant-TW" → "zh-TW"),
 *   3) representante por defecto del idioma base (p.ej. "es" → "es-ES").
 * undefined si el idioma no está soportado por el catálogo. Nunca lanza.
 */
function normalizeToKnownLocale(raw: string | null | undefined): string | undefined {
  if (!raw || typeof raw !== "string") return undefined;
  try {
    const norm = raw.trim().replace(/_/g, "-");
    if (!norm) return undefined;
    const exact = findLocale(norm);
    if (exact) return exact.code;
    const segments = norm.toLowerCase().split("-").filter(Boolean);
    if (!segments.length) return undefined;
    const base = LANG_ALIASES[segments[0]] ?? segments[0];
    const region = segments.find((s, i) => i > 0 && /^[a-z]{2}$/.test(s));
    if (region) {
      const match = LOCALES.find((l) => l.base === base && l.code.toLowerCase().endsWith(`-${region}`));
      if (match) return match.code;
    }
    return BASE_DEFAULT_LOCALE[base];
  } catch {
    return undefined;
  }
}

// ── Sugerencia por zona horaria (ubicación aproximada, SIN pedir permisos) ──
// Cobertura curada de los husos IANA más habituales. Las zonas AMBIGUAS entre
// dos idiomas oficiales (Bruselas, Zúrich, Toronto/Montreal, Kolkata…) usan
// `byBase` para desambiguar con el idioma detectado del navegador; el resto
// son de un único idioma dominante y no dependen de esa señal.
interface TzHint {
  default: string;
  byBase?: Record<string, string>;
}

const TZ_LOCALE_HINTS: Readonly<Record<string, string | TzHint>> = {
  // España
  "Europe/Madrid": "es-ES",
  "Africa/Ceuta": "es-ES",
  "Atlantic/Canary": "es-ES",
  // México
  "America/Mexico_City": "es-MX",
  "America/Cancun": "es-MX",
  "America/Merida": "es-MX",
  "America/Monterrey": "es-MX",
  "America/Tijuana": "es-MX",
  "America/Chihuahua": "es-MX",
  "America/Hermosillo": "es-MX",
  "America/Mazatlan": "es-MX",
  "America/Bahia_Banderas": "es-MX",
  "America/Matamoros": "es-MX",
  "America/Ojinaga": "es-MX",
  // Argentina
  "America/Argentina/Buenos_Aires": "es-AR",
  "America/Argentina/Cordoba": "es-AR",
  "America/Argentina/Salta": "es-AR",
  "America/Argentina/Jujuy": "es-AR",
  "America/Argentina/Tucuman": "es-AR",
  "America/Argentina/Catamarca": "es-AR",
  "America/Argentina/La_Rioja": "es-AR",
  "America/Argentina/San_Juan": "es-AR",
  "America/Argentina/Mendoza": "es-AR",
  "America/Argentina/San_Luis": "es-AR",
  "America/Argentina/Rio_Gallegos": "es-AR",
  "America/Argentina/Ushuaia": "es-AR",
  "America/Buenos_Aires": "es-AR",
  "America/Cordoba": "es-AR",
  "America/Mendoza": "es-AR",
  // Colombia / Chile / Perú / Venezuela / Ecuador
  "America/Bogota": "es-CO",
  "America/Santiago": "es-CL",
  "Pacific/Easter": "es-CL",
  "America/Lima": "es-PE",
  "America/Caracas": "es-VE",
  "America/Guayaquil": "es-EC",
  "Pacific/Galapagos": "es-EC",
  // Resto de Latinoamérica hispanohablante sin variante propia → es-419
  "America/La_Paz": "es-419",
  "America/Asuncion": "es-419",
  "America/Montevideo": "es-419",
  "America/Guatemala": "es-419",
  "America/Tegucigalpa": "es-419",
  "America/El_Salvador": "es-419",
  "America/Managua": "es-419",
  "America/Costa_Rica": "es-419",
  "America/Panama": "es-419",
  "America/Santo_Domingo": "es-419",
  "America/Havana": "es-419",
  "America/Puerto_Rico": "es-419",

  // Reino Unido / Irlanda
  "Europe/London": "en-GB",
  "Europe/Dublin": "en-IE",
  // EE. UU. (ambiguo inglés/español → según idioma detectado, igual que el
  // comodín "America/*"; así un navegador en español en Denver sugiere es-US
  // en vez de imponer en-US).
  "America/New_York": { default: "en-US", byBase: { es: "es-US" } },
  "America/Chicago": { default: "en-US", byBase: { es: "es-US" } },
  "America/Denver": { default: "en-US", byBase: { es: "es-US" } },
  "America/Los_Angeles": { default: "en-US", byBase: { es: "es-US" } },
  "America/Anchorage": { default: "en-US", byBase: { es: "es-US" } },
  "Pacific/Honolulu": { default: "en-US", byBase: { es: "es-US" } },
  "America/Phoenix": { default: "en-US", byBase: { es: "es-US" } },
  "America/Detroit": { default: "en-US", byBase: { es: "es-US" } },
  "America/Indiana/Indianapolis": { default: "en-US", byBase: { es: "es-US" } },
  "America/Boise": { default: "en-US", byBase: { es: "es-US" } },
  // Canadá (ambiguo inglés/francés → según idioma detectado)
  "America/Toronto": { default: "en-CA", byBase: { fr: "fr-CA" } },
  "America/Vancouver": { default: "en-CA", byBase: { fr: "fr-CA" } },
  "America/Edmonton": { default: "en-CA", byBase: { fr: "fr-CA" } },
  "America/Winnipeg": { default: "en-CA", byBase: { fr: "fr-CA" } },
  "America/Halifax": { default: "en-CA", byBase: { fr: "fr-CA" } },
  "America/St_Johns": { default: "en-CA", byBase: { fr: "fr-CA" } },
  // Australia / Nueva Zelanda / Sudáfrica
  "Australia/Sydney": "en-AU",
  "Australia/Melbourne": "en-AU",
  "Australia/Brisbane": "en-AU",
  "Australia/Perth": "en-AU",
  "Australia/Adelaide": "en-AU",
  "Australia/Darwin": "en-AU",
  "Australia/Hobart": "en-AU",
  "Pacific/Auckland": "en-NZ",
  "Africa/Johannesburg": "en-ZA",
  // India (ambiguo inglés/hindi → según idioma detectado)
  "Asia/Kolkata": { default: "en-IN", byBase: { hi: "hi-IN" } },
  "Asia/Calcutta": { default: "en-IN", byBase: { hi: "hi-IN" } },

  // Brasil
  "America/Sao_Paulo": "pt-BR",
  "America/Manaus": "pt-BR",
  "America/Bahia": "pt-BR",
  "America/Fortaleza": "pt-BR",
  "America/Recife": "pt-BR",
  "America/Belem": "pt-BR",
  "America/Cuiaba": "pt-BR",
  "America/Campo_Grande": "pt-BR",
  "America/Porto_Velho": "pt-BR",
  "America/Boa_Vista": "pt-BR",
  "America/Rio_Branco": "pt-BR",
  "America/Araguaina": "pt-BR",
  "America/Maceio": "pt-BR",
  "America/Noronha": "pt-BR",
  // Portugal / Angola
  "Europe/Lisbon": "pt-PT",
  "Atlantic/Madeira": "pt-PT",
  "Atlantic/Azores": "pt-PT",
  "Africa/Luanda": "pt-AO",

  // Francia
  "Europe/Paris": "fr-FR",
  // Bélgica (ambiguo francés/neerlandés → según idioma detectado)
  "Europe/Brussels": { default: "fr-BE", byBase: { nl: "nl-BE" } },
  // Suiza (ambiguo alemán/francés/italiano → según idioma detectado)
  "Europe/Zurich": { default: "de-CH", byBase: { fr: "fr-CH", it: "it-CH" } },

  // Alemania / Austria
  "Europe/Berlin": "de-DE",
  "Europe/Vienna": "de-AT",

  // Italia
  "Europe/Rome": "it-IT",

  // China / Taiwán / Hong Kong / Macao
  "Asia/Shanghai": "zh-CN",
  "Asia/Urumqi": "zh-CN",
  "Asia/Taipei": "zh-TW",
  "Asia/Hong_Kong": "zh-HK",
  "Asia/Macau": "zh-HK",

  // Japón / Corea / Rusia
  "Asia/Tokyo": "ja-JP",
  "Asia/Seoul": "ko-KR",
  "Europe/Moscow": "ru-RU",

  // Mundo árabe
  "Asia/Riyadh": "ar-SA",
  "Africa/Cairo": "ar-EG",
  "Africa/Casablanca": "ar-MA",
  "Asia/Dubai": "ar-AE",

  // Países Bajos
  "Europe/Amsterdam": "nl-NL",

  // Resto de Europa/Asia (una variante por idioma)
  "Europe/Warsaw": "pl-PL",
  "Europe/Istanbul": "tr-TR",
  "Asia/Ho_Chi_Minh": "vi-VN",
  "Asia/Bangkok": "th-TH",
  "Asia/Jakarta": "id-ID",
  "Europe/Stockholm": "sv-SE",
  "Europe/Oslo": "nb-NO",
  "Europe/Copenhagen": "da-DK",
  "Europe/Helsinki": "fi-FI",
  "Europe/Athens": "el-GR",
  "Asia/Nicosia": "el-CY",
  "Asia/Jerusalem": "he-IL",
  "Europe/Kyiv": "uk-UA",
  "Europe/Kiev": "uk-UA",
  "Europe/Bucharest": "ro-RO",
  "Europe/Chisinau": "ro-MD",
  "Europe/Budapest": "hu-HU",
  "Europe/Prague": "cs-CZ",
};

/**
 * Sugiere un locale a partir de la ZONA HORARIA IANA (p.ej. "America/Mexico_City"
 * → "es-MX") y, para zonas ambiguas, del idioma base ya detectado por otras
 * señales. Con zonas "America/*" no listadas explícitamente, sigue la regla
 * "según idioma": español si el idioma detectado es "es", inglés en cualquier
 * otro caso. undefined si no hay pista razonable. Nunca lanza.
 */
function localeFromTimeZone(tz: string | null | undefined, baseHint: string): string | undefined {
  if (!tz || typeof tz !== "string") return undefined;
  try {
    const hint = TZ_LOCALE_HINTS[tz];
    if (hint) return typeof hint === "string" ? hint : (hint.byBase?.[baseHint] ?? hint.default);
    if (tz.startsWith("America/")) return baseHint === "es" ? "es-US" : "en-US";
    return undefined;
  } catch {
    return undefined;
  }
}

/** Sugerencia SSR/entorno-sin-señales: español de España (Aurora es hispanohablante por defecto). */
const FALLBACK_SUGGESTION = "es-ES";

/**
 * Sugiere locales probables del DISPOSITIVO/NAVEGADOR actual, SIN pedir
 * ningún permiso (no usa geolocalización): combina, por orden de confianza,
 *   1) `navigator.languages` (preferencia explícita del navegador/SO — la
 *      señal más fiable cuando ya trae región, p.ej. "es-MX"),
 *   2) la variante regional sugerida por la ZONA HORARIA (refuerzo por
 *      ubicación aproximada — p.ej. Europe/Madrid → "es-ES"),
 *   3) `Intl.DateTimeFormat().resolvedOptions().locale` (respaldo final).
 * Devuelve códigos BCP-47 CONOCIDOS del catálogo (LOCALES), deduplicados y sin
 * lanzar nunca. SSR-safe: si no hay `window`/`navigator`, devuelve un único
 * respaldo neutro. Pensado para pintar chips clicables (no obliga a nada).
 */
export function suggestLocalesFromEnvironment(): string[] {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return [FALLBACK_SUGGESTION];
  }

  const fromLangs: string[] = [];
  try {
    const raw = Array.isArray(navigator.languages) && navigator.languages.length
      ? navigator.languages
      : [navigator.language].filter((v): v is string => typeof v === "string" && v.length > 0);
    for (const l of raw) {
      const norm = normalizeToKnownLocale(l);
      if (norm) fromLangs.push(norm);
    }
  } catch {
    /* navigator inaccesible → seguimos con el resto de señales */
  }

  let fromIntl: string | undefined;
  try {
    fromIntl = normalizeToKnownLocale(Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {
    /* Intl no disponible/soportado → sin este respaldo */
  }

  const baseHint = baseOf(fromLangs[0] ?? fromIntl ?? "es");

  let fromTz: string | undefined;
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    fromTz = localeFromTimeZone(tz, baseHint);
  } catch {
    /* zona horaria no resoluble → sin este refuerzo */
  }

  const combined = [...fromLangs, fromTz, fromIntl].filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
  const seen = new Set<string>();
  const out = combined.filter((c) => (seen.has(c) ? false : (seen.add(c), true)));
  return out.length ? out : [FALLBACK_SUGGESTION];
}
