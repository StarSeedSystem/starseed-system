/**
 * voice-catalog.ts — Catálogo amplio de voces (Adenda 96 · re-añadido).
 *
 * Mezcla voces del catálogo xAI (Grok) con motores open-source gratuitos
 * (Kokoro, Piper, Coqui XTTS, OpenVoice, Bark, GPT-SoVITS) etiquetadas por
 * género (masc/fem/otro) para que cada personalidad y neurona pueda elegir una
 * voz bonita y coherente con su identidad.
 *
 * TODAS las voces open-source son GRATIS. Las de xAI requieren la API key del
 * sistema (inyectada por Vercel/Cloud Run); si no está disponible, se marcan
 * como `premium` y la UI lo indica sin romper nada.
 *
 * Este módulo es LIVIANO (solo datos + helpers): NO importa react ni el grafo
 * de voz pesado, así que se puede cargar de forma perezosa sin riesgo de #310.
 */

export type VoiceGender = "f" | "m" | "o";

export interface CatalogVoice {
  /** Id estable (p.ej. "kokoro-af-bella"). */
  id: string;
  /** Etiqueta legible (p.ej. "Bella · Kokoro"). */
  label: string;
  /** Género para filtrar/seleccionar por personalidad. */
  gender: VoiceGender;
  /** Motor que sintetiza esta voz. */
  engine: "kokoro" | "piper" | "coqui" | "openvoice" | "bark" | "gptsovits" | "xai";
  /** Idioma principal (código BCP-47 corto). */
  lang: string;
  /** ¿Requiere API key de xAI (no gratis local)? */
  premium?: boolean;
  /** Texto de muestra para previsualizar. */
  sample?: string;
}

/** Voces femeninas bonitas (prioridad estética para personalidades). */
const FEM: CatalogVoice[] = [
  { id: "kokoro-af-bella", label: "Bella · Kokoro", gender: "f", engine: "kokoro", lang: "es", sample: "Hola, soy Bella. Encantada de conocerte." },
  { id: "kokoro-af-sarah", label: "Sarah · Kokoro", gender: "f", engine: "kokoro", lang: "es", sample: "Cuéntame, ¿en qué puedo ayudarte hoy?" },
  { id: "kokoro-af-nicole", label: "Nicole · Kokoro", gender: "f", engine: "kokoro", lang: "en", sample: "Hi, I'm Nicole — nice to meet you." },
  { id: "kokoro-af-sky", label: "Sky · Kokoro", gender: "f", engine: "kokoro", lang: "en", sample: "The sky is the limit when we dream together." },
  { id: "piper-es-mujer", label: "Mujer · Piper", gender: "f", engine: "piper", lang: "es", sample: "Voz clara y cálida para acompañarte." },
  { id: "coqui-es-mujer", label: "Mujer · Coqui XTTS", gender: "f", engine: "coqui", lang: "es", sample: "Clonable y expresiva, toda tuya." },
  { id: "openvoice-f-aurora", label: "Aurora · OpenVoice", gender: "f", engine: "openvoice", lang: "es", sample: "Soy Aurora, tu voz en esta neurona." },
  { id: "xai-f-aurora", label: "Aurora · xAI (Grok)", gender: "f", engine: "xai", lang: "es", premium: true, sample: "Aurora aquí, listo para hablar." },
  { id: "xai-f-stardust", label: "Stardust · xAI (Grok)", gender: "f", engine: "xai", lang: "en", premium: true, sample: "Stardust speaking — shall we begin?" },
  { id: "bark-f-luna", label: "Luna · Bark", gender: "f", engine: "bark", lang: "es", sample: "Luna al habla, con alma." },
  { id: "gptsovits-f-selene", label: "Selene · GPT-SoVITS", gender: "f", engine: "gptsovits", lang: "es", sample: "Selene, tu reflejo de voz." },
];

/** Voces masculinas. */
const MASC: CatalogVoice[] = [
  { id: "kokoro-am-michael", label: "Michael · Kokoro", gender: "m", engine: "kokoro", lang: "es", sample: "Hola, soy Michael. ¿Hablamos?" },
  { id: "kokoro-am-puck", label: "Puck · Kokoro", gender: "m", engine: "kokoro", lang: "en", sample: "Puck here — let's figure it out." },
  { id: "piper-es-hombre", label: "Hombre · Piper", gender: "m", engine: "piper", lang: "es", sample: "Voz firme y serena." },
  { id: "coqui-es-hombre", label: "Hombre · Coqui XTTS", gender: "m", engine: "coqui", lang: "es", sample: "Clonable y natural." },
  { id: "openvoice-m-orion", label: "Orion · OpenVoice", gender: "m", engine: "openvoice", lang: "es", sample: "Soy Orion, tu voz en esta neurona." },
  { id: "xai-m-orion", label: "Orion · xAI (Grok)", gender: "m", engine: "xai", lang: "es", premium: true, sample: "Orion al habla." },
  { id: "bark-m-atlas", label: "Atlas · Bark", gender: "m", engine: "bark", lang: "es", sample: "Atlas presente." },
  { id: "gptsovits-m-helios", label: "Helios · GPT-SoVITS", gender: "m", engine: "gptsovits", lang: "es", sample: "Helios, tu reflejo de voz." },
];

/** Voces neutras/otras. */
const OTHER: CatalogVoice[] = [
  { id: "kokoro-am-onyx", label: "Onyx · Kokoro", gender: "o", engine: "kokoro", lang: "en", sample: "Onyx, neutral and calm." },
  { id: "openvoice-o-nova", label: "Nova · OpenVoice", gender: "o", engine: "openvoice", lang: "es", sample: "Soy Nova, voz neutra." },
  { id: "bark-o-echo", label: "Echo · Bark", gender: "o", engine: "bark", lang: "es", sample: "Echo al habla." },
];

export const VOICE_CATALOG: CatalogVoice[] = [...FEM, ...MASC, ...OTHER];

export function getVoicesByGender(gender: VoiceGender): CatalogVoice[] {
  return VOICE_CATALOG.filter((v) => v.gender === gender);
}

export function getVoiceById(id: string): CatalogVoice | undefined {
  return VOICE_CATALOG.find((v) => v.id === id);
}

/** Voces femeninas bonitas por defecto (para personalidades sin género fijado). */
export const DEFAULT_FEM_VOICES = FEM;

/** Devuelve una voz bonita por defecto según género (o femenina si no hay). */
export function defaultVoiceForGender(gender: VoiceGender): CatalogVoice {
  const list = gender === "o" ? OTHER : gender === "m" ? MASC : FEM;
  return list[0] ?? FEM[0];
}
