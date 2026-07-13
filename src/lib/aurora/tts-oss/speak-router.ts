"use client";

/**
 * StarSeed OS — Enrutador de VOZ de Aurora (elige el motor activo, con fallback).
 * ============================================================================
 * Punto ÚNICO al que el engine de Aurora (`engine.ts`) delega el habla. Lee la
 * config unificada (`voice-config.ts`, clave `starseed.aurora.voice.v1`), pide la
 * CADENA al registro de motores (`engine-registry.ts`) y la recorre hasta que
 * alguien habla. Regla de oro: **Aurora SIEMPRE habla**.
 *
 * La cadena la construye `buildVoiceChain()` (ver engine-registry.ts para el
 * orden completo y su porqué). En resumen:
 *
 *   pin de la personalidad activa (si fija motor de voz)
 *     → motor elegido por el usuario (si no es el navegador)
 *     → SELECCIÓN AUTOMÁTICA: el mejor motor CONFIGURADO por realismo
 *       (VoxCPM → Voicebox → GPT-SoVITS → Bark → OmniVoice)
 *     → Kokoro (local, si su modelo está listo o el usuario autorizó la descarga)
 *     → `false` ⇒ el engine usa la voz del NAVEGADOR (que a su vez elige la
 *       MEJOR RANKEADA vía browser-voices.ts). Este último eslabón NUNCA falla.
 *
 * La novedad de la Adenda 67 (P2-3) es que la selección automática ya no exige
 * que el usuario "cambie de motor": basta con que exista un endpoint. Si hay un
 * VoxCPM vivo, Aurora habla con VoxCPM aunque su config diga "navegador". Y si
 * ese VoxCPM se cae, la MISMA frase sale por el siguiente eslabón sin que el
 * usuario note nada. Quien no tiene ningún servidor no paga NADA: los motores
 * sin endpoint ni siquiera entran en la cadena (cero red, cero latencia).
 *
 * MODO SIMBIÓTICO (bark + gpt-sovits con endpoint): la voz se enruta primero a
 * GPT-SoVITS usando la referencia elegida (`engines["gpt-sovits"].refAudio`,
 * que puede ser una muestra generada por Bark — SoVITS la clona/refina), con
 * Bark como siguiente eslabón. Se activa con `symbiotic: true` en la config.
 *
 * Cada eslabón va envuelto en `Promise.resolve().then(...).catch(...)`: un
 * fallo en un motor NUNCA revienta la cadena (nunca lanzar sin capturar).
 *
 * Contrato de retorno pensado para un enganche NO invasivo:
 *   speakWithConfiguredEngine(...) → Promise<boolean>
 *     true  = un motor OSS/neural habló (o al menos se hizo cargo del turno).
 *     false = no aplica / nada disponible → el llamador usa el navegador.
 *
 * El engine llama a onStart/onEnd para mantener latiendo el orbe de Aurora
 * alrededor del audio (bus de glow), igual que hace con speechSynthesis. Solo
 * el eslabón que REALMENTE empieza a sonar dispara onStart/onEnd del llamador.
 *
 * SSR-safe, defensivo. NUNCA lanza.
 */

import {
  buildVoiceChain,
  refreshPersonalityVoicePin,
  resolveActiveVoiceEngine,
  type VoiceChainLink,
} from "@/lib/aurora/tts-oss/engine-registry";
import {
  getVoiceConfig,
  isNeuralEngine,
  type AuroraVoiceConfig,
} from "@/lib/aurora/tts-oss/voice-config";

export interface ConfiguredSpeakOptions {
  /** Antes de reproducir (el engine enciende el glow y el anti-eco aquí). */
  onStart?: () => void;
  /** Al terminar/cortar (el engine apaga el glow y reanuda escucha aquí). */
  onEnd?: () => void;
  /** Impulso de latido del orbe mientras suena (best-effort, opcional). */
  onBoundary?: () => void;
  /** Errores no fatales (informativo). */
  onError?: (message: string) => void;
}

/** Resultado interno de un eslabón de la cadena. */
type LinkOutcome =
  | "spoke" // habló entero → cadena terminada con éxito
  | "started" // llegó a sonar pero se cortó → el turno YA se consumió (no re-hablar)
  | "declined"; // no pudo ni empezar → probar el siguiente eslabón

/**
 * ¿Hay un motor OSS/neural activo Y disponible para hablar YA (sin descargar
 * por sorpresa)? Úsalo para decidir rápido si merece la pena delegar.
 *
 * Mira el motor que Aurora usaría DE VERDAD ahora mismo (`resolveActiveVoiceEngine`:
 * pin de personalidad → elección explícita → selección automática), no solo el
 * que dice la config: si el usuario tiene "navegador" pero hay un VoxCPM vivo,
 * la respuesta correcta es `true`. Para motores por endpoint usa el ping
 * cacheado (60 s). NUNCA lanza.
 */
export async function isConfiguredOssEngineReady(): Promise<boolean> {
  try {
    await refreshPersonalityVoicePin();
    const cfg = getVoiceConfig();
    const engine = resolveActiveVoiceEngine(cfg);
    if (isNeuralEngine(engine)) {
      const { pingNeuralEngine } = await import("@/lib/aurora/tts-oss/neural-tts");
      return (await pingNeuralEngine(engine)) === "ok";
    }
    if (engine === "kokoro") {
      const { kokoroAvailable, kokoroModelReady } = await import(
        "@/lib/aurora/tts-oss/kokoro"
      );
      // "Listo para hablar ya" = soportado y con modelo descargado.
      return kokoroAvailable() && kokoroModelReady();
    }
    if (engine === "kitten") {
      const { kittenAvailable } = await import("@/lib/aurora/tts-oss/kitten");
      return kittenAvailable();
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Ejecuta UN eslabón de la cadena. Solo si el audio empieza de verdad se
 * disparan onStart/onEnd del llamador. Envuelto por el llamador en
 * Promise.resolve().then() — aquí además todo es defensivo. NUNCA lanza.
 */
async function runLink(
  link: VoiceChainLink,
  text: string,
  cfg: AuroraVoiceConfig,
  opts: ConfiguredSpeakOptions,
): Promise<LinkOutcome> {
  let started = false;
  const safe = {
    onStart: () => {
      started = true;
      try { opts.onStart?.(); } catch { /* */ }
    },
    onEnd: () => {
      if (!started) return; // los fallos silenciosos no cierran el turno del engine
      try { opts.onEnd?.(); } catch { /* */ }
    },
    onError: (m: string) => {
      try { opts.onError?.(m); } catch { /* */ }
    },
  };

  if (isNeuralEngine(link)) {
    const { neuralSpeak, neuralEngineConfigured } = await import(
      "@/lib/aurora/tts-oss/neural-tts"
    );
    if (!neuralEngineConfigured(link)) return "declined";
    const audio = await neuralSpeak(link, text, safe);
    if (audio) return "spoke";
    return started ? "started" : "declined";
  }

  if (link === "kokoro") {
    const { kokoroAvailable, kokoroModelReady, kokoroSpeak } = await import(
      "@/lib/aurora/tts-oss/kokoro"
    );
    if (!kokoroAvailable()) return "declined";
    // Sin autoDownload y sin modelo listo → no bloqueamos a Aurora; siguiente.
    if (!kokoroModelReady() && !cfg.autoDownload) return "declined";
    // Velocidad desde el estilo emocional vivo (Kokoro acepta speed).
    let speed: number | undefined;
    try {
      const { resolveVoiceParams } = await import("@/lib/aurora/tts-oss/voice-style");
      speed = resolveVoiceParams().rate;
    } catch { /* estilo no disponible → velocidad por defecto */ }
    const audio = await kokoroSpeak(text, {
      voice: cfg.voice,
      speed,
      autoDownload: !!cfg.autoDownload,
      ...safe,
    });
    if (audio) return "spoke";
    return started ? "started" : "declined";
  }

  if (link === "kitten") {
    const { kittenAvailable, kittenSpeak } = await import("@/lib/aurora/tts-oss/kitten");
    if (!kittenAvailable()) return "declined"; // stub honesto: hoy siempre false
    const audio = await kittenSpeak(text, { voice: cfg.voice, ...safe });
    if (audio) return "spoke";
    return started ? "started" : "declined";
  }

  return "declined";
}

/**
 * speakWithConfiguredEngine — Sintetiza y reproduce `text` recorriendo la CADENA
 * de motores (registro + selección automática), devolviendo `true` cuando alguno
 * se hizo cargo del turno. Si no hay nada disponible o todo falla, devuelve
 * `false` para que el engine caiga a `window.speechSynthesis` (con la mejor voz
 * neural rankeada del dispositivo). NUNCA lanza.
 *
 * CAMBIO DE LA ADENDA 67 (P2-3): ya NO se sale de vacío cuando el motor de la
 * config es "browser". Ahora construye la cadena SIEMPRE: si hay un motor mejor
 * CONFIGURADO (VoxCPM el primero), lo usa aunque el usuario no haya tocado nada.
 * Si no hay ninguno, la cadena queda en [kokoro] y, sin modelo listo, declina al
 * instante → voz del navegador. Coste para quien no tiene servidores: CERO
 * (ningún fetch, ninguna espera; solo lecturas de localStorage).
 *
 * IMPORTANTE (anti-descarga sorpresa): Kokoro sólo autodescarga el modelo si el
 * usuario lo pidió (`autoDownload` en la config). Si no, y el modelo no está
 * listo, ese eslabón declina de inmediato (la voz del navegador cubre el turno).
 */
export async function speakWithConfiguredEngine(
  text: string,
  opts: ConfiguredSpeakOptions = {},
): Promise<boolean> {
  const clean = (text || "").trim();
  if (!clean) return false;

  let cfg: AuroraVoiceConfig;
  try {
    cfg = getVoiceConfig();
  } catch {
    return false;
  }
  if (!cfg) return false;

  // El pin de la personalidad activa se relee aquí (import dinámico cacheado):
  // así una personalidad que fija "VoxCPM para la voz" manda desde la 1ª frase.
  const pin = await refreshPersonalityVoicePin().catch(() => null);

  const chain = buildVoiceChain(cfg, pin);
  if (!chain.length) return false; // suelo: navegador
  for (const link of chain) {
    // Cada eslabón envuelto: nunca lanzar sin capturar en cadenas de failover.
    const outcome = await Promise.resolve()
      .then(() => runLink(link, clean, cfg, opts))
      .catch((): LinkOutcome => "declined");
    if (outcome === "spoke") return true;
    if (outcome === "started") {
      // Llegó a sonar y se cortó: el turno YA se consumió; re-hablar el mismo
      // texto con otro motor duplicaría la locución. Turno cerrado con dignidad.
      return true;
    }
    // "declined" → siguiente eslabón de la cadena.
  }
  return false; // suelo garantizado: voz del navegador (mejor rankeada).
}

/** Corta cualquier reproducción OSS/neural en curso. NUNCA lanza. */
export async function stopConfiguredEngine(): Promise<void> {
  try {
    const { stopKokoro } = await import("@/lib/aurora/tts-oss/kokoro");
    stopKokoro();
  } catch {
    /* */
  }
  try {
    const { stopKitten } = await import("@/lib/aurora/tts-oss/kitten");
    stopKitten();
  } catch {
    /* */
  }
  try {
    const { stopNeural } = await import("@/lib/aurora/tts-oss/neural-tts");
    stopNeural();
  } catch {
    /* */
  }
}
