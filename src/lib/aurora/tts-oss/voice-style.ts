"use client";

/**
 * StarSeed OS — ESTILO EMOCIONAL de la voz de Aurora (modulación multi-motor).
 * ============================================================================
 * Un mismo estado emocional ("dulce", "entusiasta"…) se traduce a parámetros
 * DISTINTOS según el motor que esté hablando:
 *
 *   · navegador / Kokoro → rate/pitch/volume (multiplicadores suaves).
 *   · Bark               → además de la velocidad, ETIQUETAS DE ESTILO dentro
 *                          del texto ([laughs], [sighs], [clears throat]…),
 *                          usadas CON MODERACIÓN e inteligencia (máx. 1 por
 *                          frase, nunca si el texto ya trae corchetes, solo en
 *                          textos con cuerpo). Bark ignora pitch clásico.
 *   · GPT-SoVITS / OmniVoice → passthrough: los números (speed/emotion/energy)
 *                          viajan en el JSON del endpoint; los servidores que
 *                          no los entiendan simplemente los ignoran.
 *
 * El ESTILO ACTUAL se persiste en la MISMA clave `starseed.aurora.voice.v1`
 * (campo `style`, ver voice-config.ts) — nada de claves nuevas — y por tanto
 * viaja con la cuenta. Se actualiza por tres vías:
 *   1) El evento GLOBAL `starseed:aurora-voice-style` (lo emite el sistema de
 *      Personalidades u otra pieza; detail {tone?, emotion?, rate?, pitch?,
 *      energy?, persona?}). AQUÍ solo se CONSUME (contrato unidireccional).
 *   2) La herramienta de Aurora `ajustar_voz` ("habla más dulce").
 *   3) Los sliders del panel de Voz.
 *
 * `installVoiceStyleListener()` instala el consumidor del evento UNA sola vez
 * (singleton de módulo) y aplica la modulación EN VIVO: al persistir el estilo
 * emite el evento de config, y la SIGUIENTE frase de Aurora ya sale modulada
 * (speechSynthesis no permite re-modular una locución a mitad).
 *
 * SSR-safe y defensivo. NUNCA lanza.
 */

import {
  AURORA_VOICE_STYLE_EVENT,
  getActiveVoicePreset,
  getVoiceConfig,
  getVoiceStyle,
  sanitizeStyle,
  setVoiceStyle,
  isNeuralEngine,
  type AuroraVoiceEmotion,
  type AuroraVoiceStyle,
  type NeuralVoiceEngine,
} from "@/lib/aurora/tts-oss/voice-config";

// ── Catálogo de emociones ────────────────────────────────────────────────────

export interface EmotionSpec {
  id: AuroraVoiceEmotion;
  /** Etiqueta para la UI (con tildes bonitas). */
  label: string;
  /** Descripción corta para selector/tooltip. */
  hint: string;
  /** Delta de velocidad (se SUMA al multiplicador 1.0; ±0.2 aprox). */
  rateDelta: number;
  /** Delta de tono/pitch (se SUMA al multiplicador 1.0). */
  pitchDelta: number;
  /** Energía base 0..100 que sugiere la emoción (volumen/entrega). */
  energy: number;
  /** Etiqueta de estilo Bark asociada ("" = ninguna). Se usa con moderación. */
  barkTag: string;
}

/** Mapa canónico de las 8 emociones de la voz de Aurora. */
export const VOICE_EMOTIONS: readonly EmotionSpec[] = [
  { id: "alegre", label: "Alegre", hint: "Luminosa y positiva", rateDelta: +0.08, pitchDelta: +0.12, energy: 70, barkTag: "[laughs]" },
  { id: "serena", label: "Serena", hint: "Calmada, respirada", rateDelta: -0.12, pitchDelta: -0.04, energy: 40, barkTag: "" },
  { id: "dulce", label: "Dulce", hint: "Suave y cercana", rateDelta: -0.06, pitchDelta: +0.16, energy: 45, barkTag: "" },
  { id: "seria", label: "Seria", hint: "Formal y precisa", rateDelta: -0.04, pitchDelta: -0.14, energy: 50, barkTag: "[clears throat]" },
  { id: "entusiasta", label: "Entusiasta", hint: "Vibrante, con chispa", rateDelta: +0.16, pitchDelta: +0.2, energy: 85, barkTag: "[laughs]" },
  { id: "empatica", label: "Empática", hint: "Comprensiva, acompaña", rateDelta: -0.1, pitchDelta: +0.04, energy: 45, barkTag: "[sighs]" },
  { id: "misteriosa", label: "Misteriosa", hint: "Grave, intrigante", rateDelta: -0.14, pitchDelta: -0.12, energy: 38, barkTag: "[sighs]" },
  { id: "juguetona", label: "Juguetona", hint: "Traviesa y ligera", rateDelta: +0.12, pitchDelta: +0.24, energy: 75, barkTag: "[laughs]" },
];

/** Busca la especificación de una emoción (o undefined). Nunca lanza. */
export function emotionSpec(id: AuroraVoiceEmotion | undefined): EmotionSpec | undefined {
  if (!id) return undefined;
  return VOICE_EMOTIONS.find((e) => e.id === id);
}

// ── Resolución del estilo → parámetros por motor ─────────────────────────────

/** Parámetros ya resueltos para motores tipo navegador/Kokoro. */
export interface ResolvedVoiceParams {
  /** Multiplicador final de velocidad (0.5..2). */
  rate: number;
  /** Multiplicador final de tono (0.5..2). Bark lo ignora. */
  pitch: number;
  /** Volumen 0..1 (desde energía). */
  volume: number;
  /** Energía 0..100 (para passthrough). */
  energy: number;
  /** Emoción efectiva (si la hay). */
  emotion?: AuroraVoiceEmotion;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Resuelve el estilo ACTUAL (persistido) + overrides del motor a parámetros
 * concretos. Orden de precedencia: números explícitos del estilo/motor >
 * deltas de la emoción > neutro (1.0 / energía 50). Nunca lanza.
 */
export function resolveVoiceParams(opts?: {
  /** Overrides del motor por endpoint (engines[id] de la config). */
  engineOverrides?: { rate?: number; pitch?: number; energy?: number; emotion?: AuroraVoiceEmotion };
  /** Estilo base (por defecto, el persistido). */
  style?: AuroraVoiceStyle;
}): ResolvedVoiceParams {
  let style: AuroraVoiceStyle = {};
  try {
    style = opts?.style ?? getVoiceStyle();
  } catch {
    style = {};
  }
  const ov = opts?.engineOverrides ?? {};
  const emotion = ov.emotion ?? style.emotion;
  const spec = emotionSpec(emotion);

  // Base neutra + delta de la emoción; los números explícitos MANDAN.
  const rate = clamp(
    ov.rate ?? style.rate ?? 1 + (spec?.rateDelta ?? 0),
    0.5,
    2,
  );
  const pitch = clamp(
    ov.pitch ?? style.pitch ?? 1 + (spec?.pitchDelta ?? 0),
    0.5,
    2,
  );
  const energy = clamp(ov.energy ?? style.energy ?? spec?.energy ?? 50, 0, 100);
  // Energía → volumen: 0..100 ⇒ 0.55..1 (nunca inaudible; Aurora siempre se oye).
  const volume = clamp(0.55 + (energy / 100) * 0.45, 0.2, 1);
  return { rate, pitch, volume, energy, emotion };
}

// ── Bark: etiquetas de estilo en el texto (con moderación) ───────────────────

/**
 * Decora el texto para BARK con la etiqueta de la emoción activa, con
 * MODERACIÓN e inteligencia:
 *   · máx. UNA etiqueta por locución;
 *   · nunca si el texto ya contiene corchetes [ ] (respeta etiquetas manuales);
 *   · solo en textos con cuerpo (> 40 caracteres) — en frases cortas la
 *     etiqueta domina y suena artificial;
 *   · [laughs] solo si el texto "se ríe" (tiene exclamación o "jaja");
 *     [sighs]/[clears throat] van al principio, [laughs] tras la 1ª frase.
 * Nunca lanza; ante cualquier duda devuelve el texto tal cual.
 */
export function decorateTextForBark(
  text: string,
  emotion?: AuroraVoiceEmotion,
): string {
  try {
    const clean = (text || "").trim();
    if (!clean || clean.length <= 40) return clean;
    if (/[\[\]]/.test(clean)) return clean; // ya trae etiquetas manuales
    const spec = emotionSpec(emotion);
    const tag = spec?.barkTag;
    if (!tag) return clean;

    if (tag === "[laughs]") {
      // Solo si el texto realmente "sonríe" (exclamación o risa escrita).
      if (!/[!¡]|jaja|jeje/i.test(clean)) return clean;
      // Tras la primera frase, para que la risa suene a reacción natural.
      // [\s\S] en vez del flag /s (dotAll): el target del proyecto es ES2017.
      const m = clean.match(/^([\s\S]{10,120}?[.!?…])\s+([\s\S]+)$/);
      if (m) return `${m[1]} ${tag} ${m[2]}`;
      return `${clean} ${tag}`;
    }
    // [sighs] / [clears throat]: al principio, como apertura tonal.
    return `${tag} ${clean}`;
  } catch {
    return text;
  }
}

// ── VoxCPM / Voicebox: el estilo como LENGUAJE NATURAL ───────────────────────

/**
 * Descripción de la EMOCIÓN en lenguaje natural (español), para los motores que
 * entienden instrucciones habladas en vez de números: VoxCPM (Voice Design y
 * clonación controlable) y Voicebox (campo `instruct` de los motores Qwen).
 */
const EMOTION_PROSE: Record<AuroraVoiceEmotion, string> = {
  alegre: "alegre y luminosa, con energía amable",
  serena: "serena y calmada, bien respirada",
  dulce: "dulce y suave, muy cercana",
  seria: "seria, formal y precisa",
  entusiasta: "entusiasta y vibrante, con chispa",
  empatica: "empática y comprensiva, que acompaña",
  misteriosa: "grave e intrigante, casi susurrada",
  juguetona: "juguetona y traviesa, ligera",
};

/** Traduce la velocidad a palabras (VoxCPM/Voicebox no reciben números). */
function paceProse(rate: number): string {
  if (rate <= 0.9) return "a ritmo pausado";
  if (rate <= 0.97) return "algo más despacio de lo normal";
  if (rate >= 1.12) return "a buen ritmo, ágil";
  if (rate >= 1.03) return "algo más rápido de lo normal";
  return "a ritmo natural";
}

/** Traduce la energía a palabras. */
function energyProse(energy: number): string {
  if (energy <= 35) return "en voz baja y contenida";
  if (energy >= 75) return "con mucha energía";
  if (energy >= 60) return "con energía";
  return "";
}

/**
 * DISEÑO DE VOZ para VoxCPM2 — descripción en lenguaje natural de CÓMO es la voz.
 * Prioridad: lo que el usuario escribió en la config del motor > la descripción
 * del PRESET activo > una descripción derivada de la emoción/estilo vivos.
 * Devuelve "" si no hay nada que decir (el motor usará su voz por defecto).
 * Nunca lanza.
 */
export function voiceDesignPrompt(explicit?: string): string {
  try {
    const clean = (explicit || "").trim();
    if (clean) return clean.slice(0, 300);
    const preset = getActiveVoicePreset();
    if (preset?.voiceDesign) return preset.voiceDesign;
    const p = resolveVoiceParams();
    const bits: string[] = [];
    if (p.emotion) bits.push(`Voz ${EMOTION_PROSE[p.emotion]}`);
    else bits.push("Voz natural y cálida");
    const pace = paceProse(p.rate);
    if (pace) bits.push(pace);
    const energy = energyProse(p.energy);
    if (energy) bits.push(energy);
    return bits.join(", ").slice(0, 300);
  } catch {
    return "";
  }
}

/**
 * INSTRUCCIÓN DE ENTREGA en lenguaje natural (Voicebox `instruct`, ≤500 chars;
 * también sirve a VoxCPM como guía de estilo en clonación controlable).
 * Prioridad: explícita del motor > `instruct` del preset activo > derivada del
 * estilo vivo. "" si no aplica. Nunca lanza.
 */
export function deliveryInstruction(explicit?: string): string {
  try {
    const clean = (explicit || "").trim();
    if (clean) return clean.slice(0, 500);
    const preset = getActiveVoicePreset();
    if (preset?.instruct) return preset.instruct;
    const p = resolveVoiceParams();
    if (!p.emotion && p.rate === 1) return "";
    const bits: string[] = ["Habla"];
    if (p.emotion) bits.push(`de forma ${EMOTION_PROSE[p.emotion]}`);
    const pace = paceProse(p.rate);
    if (pace && pace !== "a ritmo natural") bits.push(pace);
    const energy = energyProse(p.energy);
    if (energy) bits.push(energy);
    return bits.join(", ").slice(0, 500);
  } catch {
    return "";
  }
}

/**
 * Texto decorado para VoxCPM: el DISEÑO DE VOZ viaja ENTRE PARÉNTESIS al inicio
 * del propio texto — es el contrato oficial de VoxCPM2:
 *   `"(Voz femenina joven, cálida y serena)Hola, soy Aurora."`
 * Con audio de referencia (`refAudio`), esos paréntesis pasan a ser control de
 * estilo sobre la voz clonada (clonación controlable). Si el texto ya empieza
 * por un paréntesis, se respeta tal cual (el usuario mandó su propia guía).
 * Nunca lanza.
 */
export function decorateTextForVoxCPM(text: string, design?: string): string {
  try {
    const clean = (text || "").trim();
    if (!clean) return clean;
    if (clean.startsWith("(")) return clean; // ya trae su propia guía
    const d = (design || "").trim();
    if (!d) return clean;
    return `(${d.replace(/[()]/g, "")})${clean}`;
  } catch {
    return text;
  }
}

// ── Passthrough SoVITS / OmniVoice ───────────────────────────────────────────

/**
 * Campos de modulación que viajan en el JSON del endpoint (los servidores que
 * no los entienden los ignoran sin quejarse). Se incluyen alias comunes de
 * velocidad para maximizar compatibilidad (speed · speed_factor).
 */
export function passthroughParams(engine: NeuralVoiceEngine, p: ResolvedVoiceParams): Record<string, unknown> {
  const out: Record<string, unknown> = {
    speed: p.rate,
    speed_factor: p.rate,
    energy: p.energy,
  };
  if (p.emotion) out.emotion = p.emotion;
  if (engine !== "bark") out.pitch = p.pitch; // Bark no modela pitch clásico
  return out;
}

// ── Consumidor del evento GLOBAL de estilo (Personalidades → voz) ────────────

let styleListenerInstalled = false;

/**
 * Instala (UNA vez por pestaña) el consumidor del evento
 * `starseed:aurora-voice-style`. Aplica la modulación EN VIVO: sanea el
 * detail, lo fusiona con el estilo persistido en `starseed.aurora.voice.v1`
 * y emite el cambio de config — la siguiente frase de Aurora ya sale con el
 * nuevo estilo, en CUALQUIER motor. Idempotente, SSR-safe, nunca lanza.
 */
export function installVoiceStyleListener(): void {
  if (typeof window === "undefined" || styleListenerInstalled) return;
  styleListenerInstalled = true;
  try {
    window.addEventListener(AURORA_VOICE_STYLE_EVENT, (ev: Event) => {
      // Envuelto para que NADA de aquí pueda romper al emisor del evento.
      Promise.resolve()
        .then(() => {
          const detail = (ev as CustomEvent).detail;
          const patch = sanitizeStyle(detail);
          if (!patch) return;
          setVoiceStyle(patch);
        })
        .catch(() => {
          /* estilo inválido → se ignora sin ruido */
        });
    });
  } catch {
    styleListenerInstalled = false; // reintentable si algo raro pasó
  }
}

/**
 * Emite el evento de estilo (para la herramienta de voz y el panel: así TODAS
 * las piezas — incluidas las de otros sistemas que escuchen — ven el cambio).
 * Además persiste directamente (por si el listener aún no está instalado).
 * Nunca lanza.
 */
export function emitVoiceStyle(patch: Partial<AuroraVoiceStyle>): void {
  const clean = sanitizeStyle(patch);
  if (!clean) return;
  try {
    setVoiceStyle(clean); // persistencia directa (idempotente con el listener)
  } catch {
    /* */
  }
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(AURORA_VOICE_STYLE_EVENT, { detail: clean }));
  } catch {
    /* */
  }
}

/** Overrides de estilo del motor por endpoint activo (o {}). Nunca lanza. */
export function engineStyleOverrides(engine: unknown): {
  rate?: number;
  pitch?: number;
  energy?: number;
  emotion?: AuroraVoiceEmotion;
} {
  try {
    if (!isNeuralEngine(engine)) return {};
    const s = getVoiceConfig().engines?.[engine];
    if (!s) return {};
    return { rate: s.rate, pitch: s.pitch, energy: s.energy, emotion: s.emotion };
  } catch {
    return {};
  }
}
