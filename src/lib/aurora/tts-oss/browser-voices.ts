"use client";

/**
 * StarSeed OS — RANKING de voces del navegador (Web Speech API).
 * ============================================================================
 * La Web Speech API expone voces MUY dispares: desde las robóticas "eSpeak"
 * hasta voces NEURALES de sistema ("Microsoft … Natural", "Google español",
 * "Siri", "Premium/Enhanced" en Apple). Este módulo puntúa TODAS las voces
 * disponibles y elige la más natural SIN que el usuario configure nada — es la
 * pieza que hace que la "voz por defecto" de Aurora suene bonita en cada
 * dispositivo (regla del proyecto: Aurora SIEMPRE habla, y lo hace lo mejor
 * posible con lo que haya).
 *
 * Criterios del ranking (suman puntos):
 *   · NEURAL/PREMIUM primero: nombres con "Natural", "Neural", "Premium",
 *     "Enhanced", "Google", "Siri" (las neurales de SO valen más que las clásicas).
 *   · Idioma: es-* preferente (Aurora habla español por defecto); es-ES y
 *     es-MX/es-US ligeramente por delante de otras variantes.
 *   · Género: femenina agradable por defecto (heurística por NOMBRE conocida:
 *     Mónica, Paulina, Helena, Elvira, Dalia, Lucía, Sabina… y sufijos "Female").
 *     Es una preferencia suave, no un filtro: una neural masculina gana a una
 *     robótica femenina.
 *   · Local (localService) suma un poco (latencia y privacidad).
 *   · Penaliza voces claramente sintéticas viejas (eSpeak, "compact").
 *
 * Puro y defensivo: funciona sobre la lista que le pases o sobre
 * speechSynthesis.getVoices(). SSR-safe. NUNCA lanza.
 */

/** Voz rankeada con su puntuación y los motivos (para la vista del ranking). */
export interface RankedVoice {
  voice: SpeechSynthesisVoice;
  score: number;
  /** Motivos legibles en español ("Neural", "Español", "Femenina"…). */
  reasons: string[];
}

/** Nombres (minúsculas) que delatan una voz NEURAL/premium de sistema. */
const NEURAL_HINTS = ["natural", "neural", "premium", "enhanced", "siri"];
/** Proveedores de voz de buena calidad reconocibles por nombre. */
const GOOD_VENDOR_HINTS = ["google", "microsoft", "apple"];
/** Pistas de voz femenina por nombre (heurística curada, es + en). */
const FEMALE_NAME_HINTS = [
  "female", "mujer", "femenina",
  // Español (Apple/Microsoft/Google/Android)
  "monica", "mónica", "paulina", "helena", "elvira", "dalia", "lucia", "lucía",
  "sabina", "laura", "carmen", "conchita", "penélope", "penelope", "lupe",
  "esperanza", "camila", "salome", "salomé", "ximena", "marisol", "angelica",
  // Inglés frecuentes (por si no hay es-*)
  "samantha", "victoria", "karen", "moira", "tessa", "ava", "allison", "susan",
  "zira", "aria", "jenny", "sonia", "libby", "emma", "olivia", "amy", "joanna",
];
/** (Adenda 194) Pistas de voz MASCULINA por nombre (es + en). Sin esta lista,
 *  «masculina» no se podía elegir: solo existía la preferencia femenina. */
const MALE_NAME_HINTS = [
  "male", "hombre", "masculina", "masculino",
  // Español (Apple/Microsoft/Google/Android)
  "jorge", "diego", "carlos", "juan", "pablo", "enrique", "miguel", "raul", "raúl",
  "alvaro", "álvaro", "dario", "darío", "andres", "andrés", "javier", "gonzalo",
  // Inglés frecuentes
  "daniel", "alex", "fred", "tom", "james", "george", "guy", "ryan", "brian", "matthew",
];

/** Pistas de baja calidad / voz antigua. */
const LOW_QUALITY_HINTS = ["espeak", "eloquence", "compact", "novelty", "whisper", "bad news", "albert", "zarvox", "trinoids"];

function lower(s: string | undefined | null): string {
  return (s || "").toLowerCase();
}

/**
 * Puntúa UNA voz. `preferLang` es el idioma deseado (por defecto español).
 * Exportada para poder explicar el ranking en la UI. Nunca lanza.
 */
export function scoreVoice(
  v: SpeechSynthesisVoice,
  preferLang: string = "es",
  /** (Adenda 194) Género pedido: la preferencia deja de ser siempre femenina. */
  preferGender: "femenina" | "masculina" | "neutra" = "femenina",
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  try {
    const name = lower(v.name);
    const uri = lower(v.voiceURI);
    const lang = lower(v.lang).replace("_", "-");
    const want = lower(preferLang).slice(0, 2);

    // Calidad del motor (lo más determinante).
    if (NEURAL_HINTS.some((h) => name.includes(h) || uri.includes(h))) {
      score += 50;
      reasons.push("Neural/Premium");
    }
    if (GOOD_VENDOR_HINTS.some((h) => name.includes(h) || uri.includes(h))) {
      score += 18;
      reasons.push("Proveedor de calidad");
    }
    if (LOW_QUALITY_HINTS.some((h) => name.includes(h) || uri.includes(h))) {
      score -= 40;
      reasons.push("Voz antigua");
    }

    // Idioma: es-* preferente (o el idioma pedido).
    if (lang.startsWith(want)) {
      score += 30;
      reasons.push(want === "es" ? "Español" : `Idioma ${want}`);
      // Variantes es-ES / es-MX / es-US ligeramente por delante.
      if (lang === "es-es" || lang === "es-mx" || lang === "es-us") score += 4;
    } else if (lang.startsWith("en")) {
      score += 6; // inglés como respaldo razonable
    }

    // Género PEDIDO (Adenda 194): suma la coincidencia y penaliza la contraria,
    // lo justo para que gane la del género elegido sin sacrificar la calidad
    // (una neural del otro género sigue ganando a una robótica del correcto).
    const esFem = FEMALE_NAME_HINTS.some((h) => name.includes(h));
    const esMasc = MALE_NAME_HINTS.some((h) => name.includes(h));
    if (preferGender === "femenina") {
      if (esFem) { score += 22; reasons.push("Femenina"); }
      if (esMasc) score -= 18;
    } else if (preferGender === "masculina") {
      if (esMasc) { score += 22; reasons.push("Masculina"); }
      if (esFem) score -= 18;
    } else {
      // Neutra: sin marca de género. Gana la de mejor calidad y, a igualdad,
      // la que no delata género por el nombre.
      if (!esFem && !esMasc) { score += 8; reasons.push("Sin marca de género"); }
    }

    // Voz local = menos latencia, más privacidad.
    if (v.localService) {
      score += 5;
      reasons.push("Local");
    }
    if (v.default) score += 2;
  } catch {
    /* puntuación parcial */
  }
  return { score, reasons };
}

/** Lista de voces del navegador (SSR-safe; [] si no hay soporte). Nunca lanza. */
export function listBrowserVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || typeof window.speechSynthesis === "undefined") return [];
  try {
    return window.speechSynthesis.getVoices() || [];
  } catch {
    return [];
  }
}

/**
 * Ranking COMPLETO de voces (mejor primero). Acepta la lista (p.ej. la del
 * engine) o la obtiene sola. Nunca lanza; [] si no hay voces.
 */
export function rankBrowserVoices(
  voices?: SpeechSynthesisVoice[],
  preferLang: string = "es",
): RankedVoice[] {
  const list = voices ?? listBrowserVoices();
  const ranked: RankedVoice[] = [];
  for (const v of list) {
    try {
      const { score, reasons } = scoreVoice(v, preferLang);
      ranked.push({ voice: v, score, reasons });
    } catch {
      /* voz problemática → fuera */
    }
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

/**
 * LA voz natural por defecto: la mejor rankeada para el idioma dado.
 * `null` si no hay ninguna (el llamador deja que el navegador elija).
 */
export function getBestBrowserVoice(
  voices?: SpeechSynthesisVoice[],
  preferLang: string = "es",
): SpeechSynthesisVoice | null {
  const ranked = rankBrowserVoices(voices, preferLang);
  return ranked.length ? ranked[0].voice : null;
}

/**
 * (Adenda 194) La MEJOR voz del sistema para un género concreto. Es lo que
 * hace que «femenina», «masculina» y «neutra» suenen bien de fábrica: se
 * reordena todo el catálogo con esa preferencia en vez de filtrar por nombre.
 */
export function elegirVozPorGenero(
  genero: "femenina" | "masculina" | "neutra",
  voices?: SpeechSynthesisVoice[],
  preferLang: string = "es",
): SpeechSynthesisVoice | null {
  try {
    const list = voices ?? listBrowserVoices();
    if (!list.length) return null;
    const ranked = list
      .map((v) => ({ v, s: scoreVoice(v, preferLang, genero).score }))
      .sort((a, b) => b.s - a.s);
    return ranked[0]?.v ?? null;
  } catch {
    return null;
  }
}

/**
 * Resuelve la voz del navegador que Aurora debe usar AHORA:
 *   1) la fijada por el usuario (`configuredURI`, si existe en el dispositivo),
 *   2) si no, la MEJOR RANKEADA (automática — recomendado).
 * Nunca lanza; null = que decida el navegador.
 */
export function resolveBrowserVoice(
  configuredURI: string | undefined,
  voices?: SpeechSynthesisVoice[],
  preferLang: string = "es",
): SpeechSynthesisVoice | null {
  const list = voices ?? listBrowserVoices();
  if (configuredURI) {
    try {
      const exact = list.find((v) => v.voiceURI === configuredURI);
      if (exact) return exact;
    } catch {
      /* */
    }
  }
  return getBestBrowserVoice(list, preferLang);
}
