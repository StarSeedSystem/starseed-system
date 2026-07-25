/**
 * voice-catalog.ts — CATÁLOGO AMPLIO DE VOCES PREDETERMINADAS (Adenda 96 · voz).
 * ============================================================================
 * Un repertorio grande y gratuito de voces para que cada neurona y cada
 * personalidad elija la suya, con género, descripción y nivel de naturalidad.
 *
 * Incluye:
 *  - Voces OPEN-SOURCE gratuitas y libres de uso (Kokoro · Piper · Coqui TTS),
 *    muchas femeninas y masculinas, aptas para producción sin coste.
 *  - Voces integradas de xAI (grok-voice) y de OpenVoice, ya presentes en el OS.
 *  - Estilos/variantes modulables (cálida, grave, juvenil, pausada…) para que el
 *    usuario no solo elija voz, sino CARÁCTER de entrega.
 *
 * Cada entrada es un metadato: el motor real decide cómo sintetizarla. Los ids
 * son estables (no cambian entre versiones) para que la elección de una neurona
 * siga válida tras actualizar el catálogo. Nunca lanza al importar.
 *
 * TODO de ampliación futura (sin romper esto): añadir más ids de Piper/Coqui a
 * medida que se integren sus motores — el selector solo itera esta lista.
 */

import type { XaiVoiceId } from "./xai-persona-voices";

/** Motor que sabe producir la voz. */
export type CatalogVoiceEngine =
  | "kokoro"
  | "piper"
  | "coqui"
  | "openvoice2"
  | "omnivoice"
  | "xai";

/** Género predominante (para filtrar en la UI). */
export type CatalogVoiceGender = "f" | "m" | "nb";

/** Una voz del catálogo: metadato estable + selector. */
export interface CatalogVoice {
  /** Id estable y único (no cambia entre versiones). */
  id: string;
  /** Motor que la produce. */
  engine: CatalogVoiceEngine;
  /** Género predominante. */
  gender: CatalogVoiceGender;
  /** Nombre legible para la UI. */
  label: string;
  /** Descripción corta del carácter / timbre. */
  hint: string;
  /** Naturalidad percibida 1–5 (editorial, honesta). */
  realism: 1 | 2 | 3 | 4 | 5;
  /** Para xAI: el id de voz built-in (eve/ara…). Para otros: el id del motor. */
  voiceId?: string;
  /** Idiomas que cubre de verdad (texto legible). */
  langs: string;
  /** Licencia / origen. */
  license: string;
}

// ── Kokoro (Apache-2.0, ~81M, multilingüe, corre 100% en el navegador) ────────
// Prefijos: a=american, b=british, e=español, f=french, h=hindi…; f= female, m= male.
const KOKORO: CatalogVoice[] = [
  { id: "kokoro-af-sarah", engine: "kokoro", gender: "f", label: "Sarah · americana cálida", hint: "Voz femenina americana suave y cercana.", realism: 3, voiceId: "af_sarah", langs: "en", license: "Apache-2.0" },
  { id: "kokoro-af-nicole", engine: "kokoro", gender: "f", label: "Nicole · americana clara", hint: "Femenina americana, dicción limpia y profesional.", realism: 3, voiceId: "af_nicole", langs: "en", license: "Apache-2.0" },
  { id: "kokoro-af-bella", engine: "kokoro", gender: "f", label: "Bella · americana expresiva", hint: "Femenina con brillo y expresividad natural.", realism: 3, voiceId: "af_bella", langs: "en", license: "Apache-2.0" },
  { id: "kokoro-am-michael", engine: "kokoro", gender: "m", label: "Michael · americano grave", hint: "Masculina americana, timbre grave y firme.", realism: 3, voiceId: "am_michael", langs: "en", license: "Apache-2.0" },
  { id: "kokoro-am-puck", engine: "kokoro", gender: "m", label: "Puck · americano joven", hint: "Masculina juvenil, ágil y luminosa.", realism: 3, voiceId: "am_puck", langs: "en", license: "Apache-2.0" },
  { id: "kokoro-am-adam", engine: "kokoro", gender: "m", label: "Adam · americano neutro", hint: "Masculina neutra, versátil y natural.", realism: 3, voiceId: "am_adam", langs: "en", license: "Apache-2.0" },
  { id: "kokoro-bf-alice", engine: "kokoro", gender: "f", label: "Alice · británica suave", hint: "Femenina británica elegante y pausada.", realism: 3, voiceId: "bf_alice", langs: "en", license: "Apache-2.0" },
  { id: "kokoro-bf-emma", engine: "kokoro", gender: "f", label: "Emma · británica cálida", hint: "Femenina británica cálida y articulada.", realism: 3, voiceId: "bf_emma", langs: "en", license: "Apache-2.0" },
  { id: "kokoro-bm-george", engine: "kokoro", gender: "m", label: "George · británico grave", hint: "Masculina británica, autoridad tranquila.", realism: 3, voiceId: "bm_george", langs: "en", license: "Apache-2.0" },
  { id: "kokoro-bm-lewis", engine: "kokoro", gender: "m", label: "Lewis · británico juvenil", hint: "Masculina británica joven y energética.", realism: 3, voiceId: "bm_lewis", langs: "en", license: "Apache-2.0" },
  { id: "kokoro-ef-dora", engine: "kokoro", gender: "f", label: "Dora · española clara", hint: "Femenina española, dicción muy clara.", realism: 3, voiceId: "ef_dora", langs: "es", license: "Apache-2.0" },
  { id: "kokoro-em-alex", engine: "kokoro", gender: "m", label: "Alex · español neutro", hint: "Masculina española neutra y natural.", realism: 3, voiceId: "em_alex", langs: "es", license: "Apache-2.0" },
  { id: "kokoro-em-santa", engine: "kokoro", gender: "m", label: "Santiago · español grave", hint: "Masculina española de timbre grave.", realism: 3, voiceId: "em_santa", langs: "es", license: "Apache-2.0" },
  { id: "kokoro-ff-siwis", engine: "kokoro", gender: "f", label: "Siwis · francesa", hint: "Femenina francesa suave y fluida.", realism: 3, voiceId: "ff_siwis", langs: "fr", license: "Apache-2.0" },
];

// ── Piper (MIT, es-ES y otros, voces locales de calidad) ──────────────────────
const PIPER: CatalogVoice[] = [
  { id: "piper-es-mluisa", engine: "piper", gender: "f", label: "Luisa · española (Piper)", hint: "Femenina española natural, muy legible.", realism: 4, voiceId: "es_ES-mluisa-medium", langs: "es", license: "MIT · CC0 voces" },
  { id: "piper-es-carlfm", engine: "piper", gender: "m", label: "Carlos · español (Piper)", hint: "Masculina española grave y pausada.", realism: 4, voiceId: "es_ES-carlfm-x_low", langs: "es", license: "MIT · CC0 voces" },
  { id: "piper-es-davefx", engine: "piper", gender: "m", label: "David · español (Piper)", hint: "Masculina española, tono medio y cálido.", realism: 4, voiceId: "es_ES-davefx-medium", langs: "es", license: "MIT · CC0 voces" },
  { id: "piper-es-random", engine: "piper", gender: "f", label: "Elena · español (Piper)", hint: "Femenina española equilibrada.", realism: 4, voiceId: "es_ES-random-medium", langs: "es", license: "MIT · CC0 voces" },
  { id: "piper-en-libritts", engine: "piper", gender: "f", label: "LibriTTS · inglesa (Piper)", hint: "Femenina inglesa de audiobook, muy natural.", realism: 4, voiceId: "en_US-libritts-medium", langs: "en", license: "MIT · CC0 voces" },
  { id: "piper-en-lessac", engine: "piper", gender: "m", label: "Lessac · inglés (Piper)", hint: "Masculina inglesa grave y resonante.", realism: 4, voiceId: "en_US-lessac-medium", langs: "en", license: "MIT · CC0 voces" },
];

// ── Coqui TTS (MPL-2.0, modelos es/en de código abierto) ─────────────────────
const COQUI: CatalogVoice[] = [
  { id: "coqui-es-css10", engine: "coqui", gender: "f", label: "CSS10 · española (Coqui)", hint: "Femenina española del modelo CSS10 (TTS).", realism: 3, voiceId: "tts_models/es/css10/vits", langs: "es", license: "MPL-2.0" },
  { id: "coqui-es-tn", engine: "coqui", gender: "f", label: "TN · española neural (Coqui)", hint: "Femenina española neural, clara.", realism: 3, voiceId: "tts_models/es/mai/tacotron2-DDC", langs: "es", license: "MPL-2.0" },
  { id: "coqui-en-jenny", engine: "coqui", gender: "f", label: "Jenny · inglesa (Coqui)", hint: "Femenina inglesa del modelo YourTTS.", realism: 3, voiceId: "tts_models/en/vctk/vits", langs: "en", license: "MPL-2.0" },
];

// ── OpenVoice V2 (web) — ya integrada, estilos por personalidad ──────────────
const OPENVOICE: CatalogVoice[] = [
  { id: "openvoice-aurora", engine: "openvoice2", gender: "f", label: "Aurora · OpenVoice", hint: "Femenina joven, cálida, luminosa (semilla propia).", realism: 4, voiceId: "aurora", langs: "es · en", license: "MIT · CC-BY-NC checkpoints" },
  { id: "openvoice-hermione", engine: "openvoice2", gender: "f", label: "Hermione · OpenVoice", hint: "Femenina brillante, rápida, británica (semilla propia).", realism: 4, voiceId: "hermione", langs: "es · en", license: "MIT · CC-BY-NC checkpoints" },
  { id: "openvoice-neutral-f", engine: "openvoice2", gender: "f", label: "Neutra F · OpenVoice", hint: "Femenina neutra y versátil por defecto.", realism: 4, voiceId: "neutral-f", langs: "multilingüe", license: "MIT · CC-BY-NC checkpoints" },
  { id: "openvoice-neutral-m", engine: "openvoice2", gender: "m", label: "Neutro M · OpenVoice", hint: "Masculina neutra y versátil por defecto.", realism: 4, voiceId: "neutral-m", langs: "multilingüe", license: "MIT · CC-BY-NC checkpoints" },
];

// ── xAI Voice Agent (grok-voice) — conversacional en tiempo real ─────────────
const XAI: CatalogVoice[] = ([
  { id: "xai-eve", voiceId: "eve", label: "Eve", hint: "Cálida y expresiva." },
  { id: "xai-ara", voiceId: "ara", label: "Ara", hint: "Cercana y clara." },
  { id: "xai-rex", voiceId: "rex", label: "Rex", hint: "Grave y autoritaria." },
  { id: "xai-sal", voiceId: "sal", label: "Sal", hint: "Equilibrada y suave." },
  { id: "xai-leo", voiceId: "leo", label: "Leo", hint: "Joven y enérgico." },
] as Array<{ id: string; voiceId: XaiVoiceId; label: string; hint: string }>).map((v) => ({
  id: v.id,
  engine: "xai" as const,
  gender: (v.voiceId === "rex" || v.voiceId === "leo" ? "m" : "f") as CatalogVoiceGender,
  label: `${v.label} · xAI`,
  hint: v.hint,
  realism: 5 as const,
  voiceId: v.voiceId,
  langs: "20+ idiomas (es-ES · en…)",
  license: "xAI API",
}));

// ── OmniVoice (k2-fsa) — multilingüe integrado ────────────────────────────────
const OMNIVOICE: CatalogVoice[] = [
  { id: "omnivoice-es-f", engine: "omnivoice", gender: "f", label: "OmniVoice · española F", hint: "Femenina española del ecosistema k2-fsa.", realism: 3, voiceId: "es-f", langs: "es · multilingüe", license: "Apache-2.0" },
  { id: "omnivoice-es-m", engine: "omnivoice", gender: "m", label: "OmniVoice · español M", hint: "Masculina española del ecosistema k2-fsa.", realism: 3, voiceId: "es-m", langs: "es · multilingüe", license: "Apache-2.0" },
];

/** Catálogo completo, ordenado por género y naturalidad para la UI. */
export const VOICE_CATALOG: readonly CatalogVoice[] = [
  ...XAI,
  ...OPENVOICE,
  ...OMNIVOICE,
  ...KOKORO,
  ...PIPER,
  ...COQUI,
];

/** Filtra el catálogo por género (sin lanzar). */
export function filterVoicesByGender(g: CatalogVoiceGender): CatalogVoice[] {
  if (g === "nb") return VOICE_CATALOG.filter((v) => v.gender === "nb");
  return VOICE_CATALOG.filter((v) => v.gender === g || v.gender === "nb");
}

/** Busca una voz por id (estable). Nunca lanza. */
export function findCatalogVoice(id: string | null | undefined): CatalogVoice | null {
  if (!id) return null;
  return VOICE_CATALOG.find((v) => v.id === id) ?? null;
}

/** Agrupa por motor para pintar secciones en la UI. */
export function groupVoicesByEngine(): Record<string, CatalogVoice[]> {
  const out: Record<string, CatalogVoice[]> = {};
  for (const v of VOICE_CATALOG) (out[v.engine] ??= []).push(v);
  return out;
}
