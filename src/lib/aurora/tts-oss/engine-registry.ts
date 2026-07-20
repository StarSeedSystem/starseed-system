"use client";

/**
 * StarSeed OS — REGISTRO DE MOTORES DE VOZ + SELECCIÓN AUTOMÁTICA (Adenda 67 · P2-3).
 * ============================================================================
 * "Fusionar lo mejor de todos los motores… con selección automática inteligente".
 * Aquí vive esa fusión. Este módulo es la CAPA DE CONOCIMIENTO sobre la voz:
 * sabe QUÉ motores existen, QUÉ sabe hacer cada uno, CUÁL está disponible ahora
 * mismo y, con eso, decide SOLO cuál debe hablar — sin que el usuario configure
 * nada y sin dejar a Aurora muda jamás.
 *
 * ── LA REGLA DE ORO ─────────────────────────────────────────────────────────
 * **Aurora SIEMPRE habla.** Ningún motor es obligatorio; todos son mejoras. El
 * suelo garantizado (voz del navegador, mejor voz neural rankeada) no se puede
 * romper porque no depende de nada externo. Todo lo demás se intenta ANTES y,
 * si falla, se cae al siguiente eslabón en silencio.
 *
 * ── ORDEN DE DECISIÓN (buildVoiceChain) ─────────────────────────────────────
 *   1. PIN DE PERSONALIDAD — si la personalidad activa fija motor de voz
 *      (`intelligence.motorVoz`, o `intelligence.porSentido.voz.fuente` si nombra
 *      un motor), ese va PRIMERO. Pero NO es exclusivo: si falla, la cadena sigue
 *      (un pin obsoleto nunca deja a Aurora sin voz — mismo principio que el pin
 *      de inteligencia en el router de Astraura).
 *   2. ELECCIÓN EXPLÍCITA — el motor que el usuario eligió en Ajustes → Voz
 *      (`config.engine`), si no es el navegador.
 *   3. AUTO (config.auto, ON por defecto) — el MEJOR motor disponible por
 *      realismo, entre los que están CONFIGURADOS (tienen endpoint y cumplen sus
 *      requisitos): VoxCPM → Voicebox → GPT-SoVITS → Bark → OmniVoice.
 *      Un motor sin endpoint NO se prueba: cero red, cero latencia, cero coste
 *      para quien no tiene servidores.
 *   4. KOKORO — local en el navegador, si su modelo ya está descargado (o el
 *      usuario autorizó la autodescarga). Nunca descarga por sorpresa.
 *   5. NAVEGADOR — suelo garantizado (la cadena devuelve `false` y engine.ts usa
 *      speechSynthesis con la mejor voz neural del dispositivo + modulación
 *      emocional). Este eslabón NO puede fallar.
 *
 * ── POR QUÉ VOXCPM ES EL PRINCIPAL ──────────────────────────────────────────
 * De todo lo que tenemos, VoxCPM2 (OpenBMB, Apache-2.0) es el más realista y el
 * más expresivo: tokenizer-free (difusión autoregresiva), 30 idiomas, 48 kHz,
 * DISEÑO DE VOZ por descripción en lenguaje natural y clonación controlable. Por
 * eso encabeza el orden AUTO en cuanto tiene endpoint. No requiere que el usuario
 * cambie de motor a mano: basta con que exista el servidor.
 *
 * SSR-safe, defensivo. NUNCA lanza. Importarlo es barato (los motores pesados se
 * cargan con `import()` dinámico solo cuando hay que hablar).
 */

import {
  getVoiceConfig,
  isNeuralEngine,
  isVoiceEngineId,
  VOICE_PRESETS,
  type AuroraVoiceConfig,
  type AuroraVoiceEngine,
  type AuroraVoicePreset,
  type NeuralVoiceEngine,
} from "@/lib/aurora/tts-oss/voice-config";

// ── Metadatos por motor ──────────────────────────────────────────────────────

/** Cómo corre un motor (define su coste y sus requisitos). */
export type VoiceEngineKind =
  | "browser" // Web Speech API: cero coste, siempre disponible
  | "local" // corre EN el navegador (WASM/WebGPU): descarga la 1ª vez
  | "endpoint"; // servidor propio (neurona/CasaOS/PC del usuario)

/** Ficha completa de un motor de voz (lo que el Centro de Configuración pinta). */
export interface VoiceEngineMeta {
  id: AuroraVoiceEngine;
  /** Nombre para la UI. */
  label: string;
  /** Frase corta: qué es y para qué sirve. */
  hint: string;
  kind: VoiceEngineKind;
  /**
   * REALISMO / naturalidad percibida, 1..5. Es el criterio principal del orden
   * AUTO. Honesto: es una valoración editorial (no una métrica medida), basada en
   * la arquitectura del modelo y sus benchmarks públicos.
   */
  realism: 1 | 2 | 3 | 4 | 5;
  /** Necesita un servidor con URL configurada. */
  requiresEndpoint: boolean;
  /** Descarga un modelo al dispositivo la primera vez. */
  requiresDownload: boolean;
  /** Gratis (todos lo son hoy: gratis-primero). */
  free: boolean;
  /** Idiomas soportados (texto legible) + si cubre español de verdad. */
  langs: string;
  spanish: boolean;
  /** Modula emociones/estilo de entrega. */
  emotions: boolean;
  /** Clona una voz a partir de una muestra. */
  cloning: boolean;
  /** Latencia típica (texto legible). */
  latency: string;
  /** Licencia. */
  license: string;
  /** Repo de referencia. */
  repo: string;
  /** Requisitos DUROS que el usuario debe cumplir (se muestran tal cual). */
  requirements?: string[];
}

/**
 * EL REGISTRO. Ordenar por `realism` da directamente la preferencia AUTO.
 * (El navegador está el último en realismo pero es el ÚNICO que nunca falla:
 * por eso no participa del orden AUTO, es el suelo.)
 */
export const VOICE_ENGINE_REGISTRY: Record<AuroraVoiceEngine, VoiceEngineMeta> = {
  voxcpm: {
    id: "voxcpm",
    label: "VoxCPM",
    hint: "El más realista: diseña la voz con palabras, clona y entona sola. Recomendado.",
    kind: "endpoint",
    realism: 5,
    requiresEndpoint: true,
    requiresDownload: false,
    free: true,
    langs: "30 idiomas (es · en · zh · ja…)",
    spanish: true,
    emotions: true,
    cloning: true,
    latency: "~1-3 s (GPU)",
    license: "Apache-2.0",
    repo: "https://github.com/OpenBMB/VoxCPM",
    requirements: [
      "Un servidor VoxCPM con GPU (vLLM-Omni, Nano-vLLM o la demo Gradio) en una neurona o en tu PC.",
      "Su URL pegada en Ajustes → Voz (p. ej. http://192.168.1.40:8000).",
    ],
  },
  voicebox: {
    id: "voicebox",
    label: "Voicebox",
    hint: "Estudio de voz local: perfiles clonados por ti, 7 motores dentro (Qwen3-TTS, Kokoro…).",
    kind: "endpoint",
    realism: 4,
    requiresEndpoint: true,
    requiresDownload: false, // el modelo lo descarga la APP, no el navegador
    free: true,
    langs: "23 idiomas (es incluido)",
    spanish: true,
    emotions: true, // vía `instruct` en lenguaje natural (motores Qwen)
    cloning: true,
    latency: "~1-4 s (según motor)",
    license: "MIT",
    repo: "https://github.com/jamiepine/voicebox",
    requirements: [
      "La app Voicebox instalada y abierta (su API vive en http://127.0.0.1:17493).",
      "Un PERFIL DE VOZ creado en la app: su `profile_id` es obligatorio.",
      "Arrancarla con VOICEBOX_CORS_ORIGINS=https://starseed-os.vercel.app (su CORS por defecto solo permite localhost y Tauri).",
    ],
  },
  "gpt-sovits": {
    id: "gpt-sovits",
    label: "GPT-SoVITS",
    hint: "Clonación few-shot: copia una voz con ~5 s de muestra.",
    kind: "endpoint",
    realism: 4,
    requiresEndpoint: true,
    requiresDownload: false,
    free: true,
    langs: "es · en · zh · ja · ko",
    spanish: true,
    emotions: false, // pasa velocidad, pero no modela emoción explícita
    cloning: true,
    latency: "~1-3 s",
    license: "MIT",
    repo: "https://github.com/RVC-Boss/GPT-SoVITS",
    requirements: ["Servidor GPT-SoVITS con su URL configurada.", "Un audio de referencia (refAudio) para clonar."],
  },
  bark: {
    id: "bark",
    label: "Bark",
    hint: "Generativa y expresiva: entona, ríe [laughs] y suspira [sighs].",
    kind: "endpoint",
    realism: 3,
    requiresEndpoint: true,
    requiresDownload: false,
    free: true,
    langs: "multilingüe (presets es_speaker_*)",
    spanish: true,
    emotions: true, // etiquetas de estilo en el texto
    cloning: false, // usa presets de voz, no clona
    latency: "~3-10 s (lento)",
    license: "MIT",
    repo: "https://github.com/suno-ai/bark",
    requirements: ["Servidor Bark con su URL configurada."],
  },
  omnivoice: {
    id: "omnivoice",
    label: "OmniVoice",
    hint: "Voz neural multilingüe del ecosistema k2-fsa (Next-gen Kaldi).",
    kind: "endpoint",
    realism: 3,
    requiresEndpoint: true,
    requiresDownload: false,
    free: true,
    langs: "multilingüe",
    spanish: true,
    emotions: false,
    cloning: false,
    latency: "~1-2 s",
    license: "Apache-2.0",
    repo: "https://github.com/k2-fsa/OmniVoice",
    requirements: ["Servidor OmniVoice con su URL configurada."],
  },
  openvoice2: {
    id: "openvoice2",
    label: "OpenVoice V2 (web)",
    hint: "Voz de nube gratis, sin instalar nada: clona el timbre desde una semilla de identidad o tu propio audio.",
    // Integrado como la nube de OmniVoice (Space público): no es un endpoint del
    // usuario, así que no requiere ni URL ni descargas — funciona en la web.
    kind: "endpoint",
    realism: 4,
    requiresEndpoint: false,
    requiresDownload: false,
    free: true,
    langs: "en · es · fr · ja · zh · ko (estilos base)",
    spanish: true,
    emotions: false, // el color emocional lo aporta la semilla/entonación, no un parámetro
    cloning: true, // clona timbre desde una referencia (semilla sintética o audio propio)
    latency: "~3-8 s (nube, cola)",
    license: "MIT (código) · CC-BY-NC (checkpoints)",
    repo: "https://github.com/myshell-ai/OpenVoice",
    requirements: ["Ninguno: funciona en la web. Usa una semilla de identidad sintética o tu propio audio."],
  },
  kokoro: {
    id: "kokoro",
    label: "Kokoro",
    hint: "Voz local de calidad: corre 100% en tu navegador, sin servidor y offline.",
    kind: "local",
    realism: 3,
    requiresEndpoint: false,
    requiresDownload: true, // ~80 MB la primera vez
    free: true,
    langs: "es · en (voces ef_dora, em_alex…)",
    spanish: true,
    emotions: true, // velocidad/energía (sin emoción nativa)
    cloning: false,
    latency: "~1-2 s (tras cargar)",
    license: "Apache-2.0",
    repo: "https://github.com/hexgrad/kokoro",
    requirements: ["Descarga ~80 MB la primera vez (con tu permiso). Después funciona sin conexión."],
  },
  browser: {
    id: "browser",
    label: "Voz del navegador",
    hint: "Siempre disponible, cero descargas. Aurora elige sola la mejor voz neural del dispositivo.",
    kind: "browser",
    realism: 2, // sube a 3-4 en dispositivos con voces neurales de sistema
    requiresEndpoint: false,
    requiresDownload: false,
    free: true,
    langs: "las del sistema (es-* preferente)",
    spanish: true,
    emotions: true, // rate/pitch/volumen desde la emoción
    cloning: false,
    latency: "instantánea",
    license: "Web Speech API (del sistema)",
    repo: "https://developer.mozilla.org/docs/Web/API/SpeechSynthesis",
  },
  kitten: {
    id: "kitten",
    label: "Kitten TTS",
    hint: "Modelo minúsculo (25 MB), inglés. BETA: aún no activo.",
    kind: "local",
    realism: 2,
    requiresEndpoint: false,
    requiresDownload: true,
    free: true,
    langs: "en",
    spanish: false,
    emotions: false,
    cloning: false,
    latency: "~1 s",
    license: "Apache-2.0",
    repo: "https://github.com/KittenML/KittenTTS",
    requirements: ["Beta: hoy no sintetiza (stub honesto). No se ofrece como opción real."],
  },
};

/**
 * ORDEN AUTO de los motores por ENDPOINT: por realismo, VoxCPM primero.
 * Es la lista que recorre la selección automática cuando el usuario no ha
 * elegido motor (o ha dejado `auto` encendido).
 */
export const AUTO_ENDPOINT_ORDER: readonly NeuralVoiceEngine[] = [
  "voxcpm",
  "voicebox",
  "gpt-sovits",
  "bark",
  "omnivoice",
  // OpenVoice V2 va SIEMPRE justo detrás del híbrido OmniVoice (Adenda V2-VOZ):
  // en instalación CERO la cadena queda [omnivoice → openvoice2 → kokoro].
  "openvoice2",
];

/** El motor PRINCIPAL recomendado del sistema (cuando tiene endpoint). */
export const PRIMARY_VOICE_ENGINE: AuroraVoiceEngine = "voxcpm";

// ── Estado de un motor (¿puedo usarlo AHORA?) ────────────────────────────────

/** Disponibilidad de un motor, sin tocar la red salvo que se pida. */
export type VoiceEngineAvailability =
  | "ready" // puede hablar ya
  | "configured" // tiene lo suyo puesto, pero no se ha comprobado la red
  | "needs-endpoint" // le falta la URL del servidor
  | "needs-profile" // Voicebox sin profile_id
  | "needs-download" // Kokoro sin modelo bajado (y sin permiso de autodescarga)
  | "unreachable" // hay URL pero el servidor no responde
  | "unsupported"; // el dispositivo no puede (o es un stub, como Kitten)

/** Ficha + estado, que es lo que la UI necesita para pintar una fila. */
export interface VoiceEngineStatus {
  meta: VoiceEngineMeta;
  availability: VoiceEngineAvailability;
  /** ¿Está seleccionado ahora mismo (elección explícita del usuario)? */
  selected: boolean;
  /** ¿Es el que Aurora usaría ahora mismo (tras aplicar pin/auto)? */
  active: boolean;
  /** ¿Lo recomendamos como principal? */
  recommended: boolean;
}

/** Lee, sin red, si un motor está configurado (endpoint + requisitos duros). */
/**
 * Estado de OpenVoice SIN red ni imports asíncronos (buildVoiceChain es
 * síncrono): lee la memoria de salud del descubrimiento (localStorage).
 * 'listo' ⇔ algún endpoint con éxito real en <24 h y no apartado. Nunca lanza.
 */
function openVoiceStateSync(): "listo" | "nuevo" | "dormido" {
  try {
    if (typeof window === "undefined") return "dormido";
    const raw = window.localStorage.getItem("starseed.aurora.openvoice.health.v1");
    // Sin historial: NUNCA se ha probado en este navegador → merece ir primera
    // UNA vez (si falla, la memoria de salud la aparta sola 6 h y este chequeo
    // pasa a 'dormido' — autocorrección sin configurar nada).
    if (!raw) return "nuevo";
    const h = JSON.parse(raw) as Record<string, { lastOkAt?: number; badUntil?: number }>;
    const now = Date.now();
    let sawAny = false;
    for (const k of Object.keys(h || {})) {
      sawAny = true;
      const e = h[k];
      if (e?.badUntil && e.badUntil > now) continue;
      if (e?.lastOkAt && now - e.lastOkAt < 24 * 60 * 60_000) return "listo";
    }
    return sawAny ? "dormido" : "nuevo";
  } catch {
    return "dormido";
  }
}

function endpointEngineConfigured(id: NeuralVoiceEngine, cfg: AuroraVoiceConfig): boolean {
  // OmniVoice HÍBRIDO (Adenda 77-voz): motor integrado con CERO configuración —
  // habla por el daemon local (127.0.0.1:4444) o por la nube gratis (HF Space).
  // Está SIEMPRE "configurado", así que entra en la cadena AUTO aunque el usuario
  // no haya puesto ningún endpoint: instalación cero → Aurora ya habla con OmniVoice.
  if (id === "omnivoice") return true;
  // OpenVoice V2 (web): Space integrado, CERO config → SIEMPRE en la cadena AUTO,
  // justo detrás de OmniVoice. Ver openvoice2.ts.
  if (id === "openvoice2") return true;
  const s = cfg.engines?.[id];
  if (!s?.endpoint || !s.endpoint.trim()) return false;
  // Voicebox exige perfil de voz: sin él su API responde 404 (no es "configurado").
  if (id === "voicebox" && !(s.profileId || s.voice)) return false;
  return true;
}

/**
 * Disponibilidad SIN RED (barata: solo localStorage + capacidades del navegador).
 * Para los motores por endpoint distingue "configurado" de "listo": saber si el
 * servidor responde requiere un ping — eso lo hace `listVoiceEnginesWithStatus`.
 * Nunca lanza.
 */
function availabilityOffline(
  id: AuroraVoiceEngine,
  cfg: AuroraVoiceConfig,
): VoiceEngineAvailability {
  try {
    if (id === "browser") {
      const ok =
        typeof window !== "undefined" && typeof window.speechSynthesis !== "undefined";
      return ok ? "ready" : "unsupported";
    }
    if (id === "kitten") return "unsupported"; // stub honesto: hoy no habla
    if (id === "kokoro") {
      // No importamos kokoro.ts aquí (cargaría su cadena): el router decide con
      // `kokoroModelReady()` en el momento de hablar. Offline damos el estado
      // conservador: si el usuario autorizó autodescarga, cuenta como usable.
      return cfg.autoDownload ? "configured" : "needs-download";
    }
    if (isNeuralEngine(id)) {
      // OmniVoice híbrido: integrado (nube gratis + daemon local) → SIEMPRE usable
      // aunque no haya endpoint manual. El estado "listo/local" se afina online.
      if (id === "omnivoice") return "configured";
      // OpenVoice V2 (web): Space integrado → SIEMPRE usable, sin endpoint manual.
      if (id === "openvoice2") return "configured";
      const s = cfg.engines?.[id];
      if (!s?.endpoint || !s.endpoint.trim()) return "needs-endpoint";
      if (id === "voicebox" && !(s.profileId || s.voice)) return "needs-profile";
      return "configured";
    }
    return "unsupported";
  } catch {
    return "unsupported";
  }
}

// ── Pin de personalidad ──────────────────────────────────────────────────────

/**
 * MOTOR DE VOZ FIJADO POR LA PERSONALIDAD ACTIVA (o null = manda la automática).
 *
 * Dos formas de fijarlo, ambas dentro de `PersonalityProfile.intelligence`:
 *   · `motorVoz: "voxcpm"` — para TODA Aurora bajo esa personalidad.
 *   · `porSentido.voz.fuente: "voxcpm"` — el pin del SENTIDO voz, si su valor
 *     nombra un motor de voz (en vez de una fuente de inteligencia del catálogo
 *     de Astraura). Así el mismo campo sirve para las dos cosas sin ambigüedad:
 *     si es un id de motor de voz, es un motor de voz.
 *
 * Solo aplica en `modo: "fija"` — en "auto" (el defecto) la personalidad no toca
 * la voz y manda la selección automática.
 *
 * El módulo de personalidades se carga con `import()` DINÁMICO a propósito:
 * arrastra el cliente de Supabase, y este registro tiene que poder importarse
 * barato desde cualquier sitio. El resultado se CACHEA para que los lectores
 * síncronos (la UI, buildVoiceChain) puedan consultarlo sin esperar.
 * NUNCA lanza; ante cualquier problema devuelve null (la cadena sigue intacta).
 */
let cachedPin: AuroraVoiceEngine | null = null;

/** Relee el pin de la personalidad activa y lo cachea. Nunca lanza. */
export async function refreshPersonalityVoicePin(): Promise<AuroraVoiceEngine | null> {
  try {
    const mod = await import("@/lib/aurora/personalities");
    const profile = mod.getActivePersonality();
    const intel = profile?.intelligence;
    if (!intel || intel.modo !== "fija") {
      cachedPin = null;
      return null;
    }
    const direct = (intel as { motorVoz?: unknown }).motorVoz;
    if (isVoiceEngineId(direct)) {
      cachedPin = direct;
      return cachedPin;
    }
    const bySense = intel.porSentido?.voz?.fuente;
    cachedPin = isVoiceEngineId(bySense) ? bySense : null;
    return cachedPin;
  } catch {
    cachedPin = null;
    return null;
  }
}

/** Último pin conocido (sin tocar disco/red). Nunca lanza. */
export function personalityVoiceEnginePin(): AuroraVoiceEngine | null {
  return cachedPin;
}

// ── LA CADENA (fusión de motores) ────────────────────────────────────────────

/** Un eslabón de la cadena de voz (el navegador es el suelo, no un eslabón). */
export type VoiceChainLink = NeuralVoiceEngine | "kokoro" | "kitten";

/**
 * Construye la CADENA DE FALLBACK ordenada para la config dada.
 * Ver el orden de decisión en la cabecera del archivo. Nunca lanza; en el peor
 * caso devuelve [] y el llamador usa la voz del navegador (que nunca falla).
 *
 * Ojo con el coste: aquí NO se toca la red. Un motor sin endpoint ni siquiera
 * entra en la cadena, así que quien no tiene servidores paga cero latencia.
 */
export function buildVoiceChain(
  cfg: AuroraVoiceConfig,
  pinOverride?: AuroraVoiceEngine | null,
): VoiceChainLink[] {
  const chain: VoiceChainLink[] = [];
  const push = (link: VoiceChainLink | null | undefined) => {
    if (!link) return;
    if (!chain.includes(link)) chain.push(link);
  };

  try {
    const barkReady = endpointEngineConfigured("bark", cfg);
    const sovitsReady = endpointEngineConfigured("gpt-sovits", cfg);

    // 1) PIN DE PERSONALIDAD (primero, pero NO exclusivo).
    const pin = pinOverride !== undefined ? pinOverride : personalityVoiceEnginePin();
    if (pin && pin !== "browser") {
      // Un pin a un motor sin endpoint sería una trampa: lo saltamos en silencio
      // (la personalidad pidió algo que hoy no existe → seguimos con lo mejor).
      if (!isNeuralEngine(pin) || endpointEngineConfigured(pin, cfg)) {
        push(pin as VoiceChainLink);
      }
    }

    // 2) ELECCIÓN EXPLÍCITA del usuario (si eligió algo que no es el navegador).
    if (isNeuralEngine(cfg.engine)) {
      const symbiosis =
        cfg.symbiotic &&
        barkReady &&
        sovitsReady &&
        (cfg.engine === "bark" || cfg.engine === "gpt-sovits");
      if (symbiosis) {
        // SIMBIÓTICO: SoVITS primero (clona/refina la referencia elegida —
        // que puede ser una muestra generada por Bark), Bark como voz expresiva.
        push("gpt-sovits");
        push("bark");
      } else {
        push(cfg.engine);
      }
    } else if (cfg.engine === "kokoro" || cfg.engine === "kitten") {
      push(cfg.engine);
    }

    // 3) AUTO — el mejor motor CONFIGURADO por realismo (VoxCPM primero).
    //    Encendido por defecto: si aparece un endpoint VoxCPM, Aurora lo usa sola.
    //    OmniVoice va SIEMPRE aquí (híbrido integrado: nube gratis + daemon local),
    //    así que en instalación CERO la cadena ya trae [omnivoice] → Aurora habla
    //    con OmniVoice sin configurar nada. Si el daemon local está vivo, el propio
    //    híbrido usa local; si no, la nube. Ver omnivoice-hybrid.ts.
    if (cfg.auto !== false) {
      // ASCENSO DINÁMICO (Adenda 79): si OpenVoice tiene un endpoint SANO (algún
      // éxito real reciente en la memoria de salud del descubrimiento), va POR
      // DELANTE de OmniVoice — así la voz nueva realista de cada personalidad
      // SUENA de verdad en la web sin instalar nada. Si no está sano, el orden
      // clásico manda y OmniVoice sigue primero. Chequeo síncrono y barato
      // (lee localStorage); jamás lanza.
      let order: readonly NeuralVoiceEngine[] = AUTO_ENDPOINT_ORDER;
      try {
        const st = openVoiceStateSync();
        if (st === "listo" || st === "nuevo") {
          const rest = AUTO_ENDPOINT_ORDER.filter((e) => e !== "openvoice2");
          const at = rest.indexOf("omnivoice");
          order = at >= 0
            ? [...rest.slice(0, at), "openvoice2", ...rest.slice(at)]
            : ["openvoice2", ...rest];
        }
      } catch {
        /* orden clásico */
      }
      for (const id of order) {
        if (endpointEngineConfigured(id, cfg)) push(id);
      }
    }

    // 4) KOKORO — RED DE SEGURIDAD local (sin servidor) para los demás motores:
    //    si VoxCPM/Voicebox/… se cayeron, Kokoro recoge el turno antes de bajar
    //    al navegador. El router solo lo usará si su modelo ya está descargado o
    //    el usuario autorizó la descarga (nunca descarga por sorpresa).
    //
    //    Ojo con el coste: si la cadena está VACÍA (usuario con la voz del
    //    navegador y sin ningún servidor — el caso mayoritario), NO añadimos
    //    Kokoro. Así `speakWithConfiguredEngine` sale al instante sin ni siquiera
    //    cargar el módulo de Kokoro: cero trabajo para quien no lo usa. Quien
    //    eligió Kokoro a propósito ya lo tiene en la cadena por el paso 2.
    if (chain.length) push("kokoro");
  } catch {
    // Ante cualquier problema, cadena vacía → el navegador habla igual.
    return [];
  }
  // 5) NAVEGADOR — no va en la cadena: es el suelo garantizado del llamador.
  return chain;
}

/**
 * ¿Qué motor usaría Aurora AHORA MISMO? (el primer eslabón de la cadena, o el
 * navegador si no hay ninguno). Útil para pintar "Hablando con: VoxCPM" en la UI.
 * No toca la red. Nunca lanza.
 */
export function resolveActiveVoiceEngine(cfg?: AuroraVoiceConfig): AuroraVoiceEngine {
  try {
    const config = cfg ?? getVoiceConfig();
    const chain = buildVoiceChain(config);
    for (const link of chain) {
      // Kokoro solo "cuenta" como activo si puede hablar sin descargar por sorpresa.
      if (link === "kokoro" && !config.autoDownload) continue;
      if (link === "kitten") continue; // stub
      return link;
    }
    return "browser";
  } catch {
    return "browser";
  }
}

// ── API PÚBLICA para el Centro de Configuración ──────────────────────────────

/**
 * listVoiceEngines — TODOS los motores con su ficha y su estado OFFLINE (sin
 * tocar la red: instantáneo, seguro de llamar en un render). Ordenados por
 * utilidad real: primero los que pueden hablar ya, luego por realismo.
 *
 * Contrato para el Centro de Configuración (`src/components/aurora/setup/*`):
 *   const engines = listVoiceEngines();
 *   engines[0].meta.label · .availability · .active · .recommended
 *
 * Nunca lanza; en el peor caso devuelve al menos la voz del navegador.
 */
export function listVoiceEngines(cfg?: AuroraVoiceConfig): VoiceEngineStatus[] {
  try {
    const config = cfg ?? getVoiceConfig();
    const active = resolveActiveVoiceEngine(config);
    const out: VoiceEngineStatus[] = [];
    for (const meta of Object.values(VOICE_ENGINE_REGISTRY)) {
      const availability = availabilityOffline(meta.id, config);
      out.push({
        meta,
        availability,
        selected: config.engine === meta.id,
        active: active === meta.id,
        recommended: meta.id === PRIMARY_VOICE_ENGINE,
      });
    }
    const usable = (a: VoiceEngineAvailability) =>
      a === "ready" ? 2 : a === "configured" ? 1 : 0;
    out.sort((a, b) => {
      const u = usable(b.availability) - usable(a.availability);
      if (u !== 0) return u;
      return b.meta.realism - a.meta.realism;
    });
    return out;
  } catch {
    return [
      {
        meta: VOICE_ENGINE_REGISTRY.browser,
        availability: "ready",
        selected: true,
        active: true,
        recommended: false,
      },
    ];
  }
}

/**
 * listVoiceEnginesWithStatus — igual que `listVoiceEngines()` pero COMPROBANDO
 * de verdad los servidores (ping con caché de 60 s). Úsalo cuando el usuario abre
 * el panel de voz, no en cada render. Nunca lanza (un servidor caído = "unreachable").
 */
export async function listVoiceEnginesWithStatus(
  cfg?: AuroraVoiceConfig,
): Promise<VoiceEngineStatus[]> {
  const base = listVoiceEngines(cfg);
  try {
    const { pingNeuralEngine } = await import("@/lib/aurora/tts-oss/neural-tts");
    await Promise.all(
      base.map(async (row) => {
        if (!isNeuralEngine(row.meta.id)) return;
        // OmniVoice híbrido: su disponibilidad NO es un endpoint. Si el daemon
        // local responde "ready" → listo (local); si no, sigue usable por la nube.
        if (row.meta.id === "omnivoice") {
          try {
            const { omniHandshake } = await import("@/lib/aurora/tts-oss/omnivoice-hybrid");
            const hs = await omniHandshake();
            row.availability = hs && hs.ready ? "ready" : "configured";
          } catch {
            row.availability = "configured";
          }
          return;
        }
        // OpenVoice V2 (web): su disponibilidad la refleja el estado del cliente
        // ('listo' tras hablar · 'dormido' cold start · 'fuera' si el Space falla).
        if (row.meta.id === "openvoice2") {
          try {
            const { getOpenVoice2State } = await import("@/lib/aurora/tts-oss/openvoice2");
            const st = getOpenVoice2State();
            row.availability = st === "listo" ? "ready" : st === "fuera" ? "unreachable" : "configured";
          } catch {
            row.availability = "configured";
          }
          return;
        }
        if (row.availability !== "configured") return; // sin endpoint: nada que pingar
        const state = await pingNeuralEngine(row.meta.id as NeuralVoiceEngine);
        row.availability = state === "ok" ? "ready" : state === "no-endpoint" ? "needs-endpoint" : "unreachable";
      }),
    );
  } catch {
    /* sin red / módulo no disponible → nos quedamos con el estado offline */
  }
  try {
    // Kokoro: ¿está el modelo realmente descargado?
    const kokoroRow = base.find((r) => r.meta.id === "kokoro");
    if (kokoroRow) {
      const { kokoroAvailable, kokoroModelReady } = await import("@/lib/aurora/tts-oss/kokoro");
      if (!kokoroAvailable()) kokoroRow.availability = "unsupported";
      else if (kokoroModelReady()) kokoroRow.availability = "ready";
    }
  } catch {
    /* */
  }
  const usable = (a: VoiceEngineAvailability) => (a === "ready" ? 2 : a === "configured" ? 1 : 0);
  base.sort((a, b) => {
    const u = usable(b.availability) - usable(a.availability);
    if (u !== 0) return u;
    return b.meta.realism - a.meta.realism;
  });
  return base;
}

/**
 * listVoicePresets — el catálogo de TIPOS DE VOZ prediseñados (cálida, serena,
 * entusiasta, seria, dulce, misteriosa, juguetona, narradora, profesional…).
 * Cada preset trae su estilo (velocidad · tono · energía · emoción) y, cuando el
 * motor lo entiende, su descripción de voz en lenguaje natural. Nunca lanza.
 */
export function listVoicePresets(): readonly AuroraVoicePreset[] {
  try {
    return VOICE_PRESETS;
  } catch {
    return [];
  }
}

/** Una voz concreta ofrecida por un motor (para el selector del panel). */
export interface EngineVoiceOption {
  id: string;
  label: string;
  hint?: string;
}

/**
 * listEngineVoices — las voces REALES que ofrece un motor concreto:
 *   · kokoro   → su catálogo de voces (ef_dora, em_alex…).
 *   · bark     → los presets de speaker por idioma (v2/es_speaker_*).
 *   · voicebox → los PERFILES DE VOZ del servidor vivo (GET /profiles) — son las
 *     voces que el usuario ha clonado en su app; [] si no está corriendo.
 *   · voxcpm   → no tiene "lista de voces": la voz se DISEÑA con palabras. Se
 *     devuelven los diseños de los presets como punto de partida.
 *   · browser  → las voces del sistema, ya rankeadas (mejor primero).
 * Nunca lanza; [] si el motor no expone voces.
 */
export async function listEngineVoices(id: AuroraVoiceEngine): Promise<EngineVoiceOption[]> {
  try {
    if (id === "kokoro") {
      const { OSS_TTS_VOICES } = await import("@/lib/aurora/tts-oss/opt-in");
      return OSS_TTS_VOICES.map((v) => ({
        id: v.id,
        label: v.label,
        hint: v.lang === "es" ? "Español" : "Inglés",
      }));
    }
    if (id === "bark") {
      return [
        { id: "v2/es_speaker_0", label: "Español · voz 0" },
        { id: "v2/es_speaker_1", label: "Español · voz 1 (cálida)", hint: "Por defecto" },
        { id: "v2/es_speaker_2", label: "Español · voz 2" },
        { id: "v2/es_speaker_3", label: "Español · voz 3" },
        { id: "v2/es_speaker_8", label: "Español · voz 8" },
        { id: "v2/en_speaker_9", label: "Inglés · voz 9" },
      ];
    }
    if (id === "voicebox") {
      const { listVoiceboxProfiles } = await import("@/lib/aurora/tts-oss/neural-tts");
      const profiles = await listVoiceboxProfiles();
      return profiles.map((p) => ({
        id: p.id,
        label: p.name,
        hint: p.description || p.language,
      }));
    }
    if (id === "voxcpm") {
      // VoxCPM no lista voces: las DISEÑA. Ofrecemos los diseños de los presets.
      return VOICE_PRESETS.filter((p) => !!p.voiceDesign).map((p) => ({
        id: p.voiceDesign as string,
        label: p.label,
        hint: p.voiceDesign,
      }));
    }
    if (id === "browser") {
      const { rankBrowserVoices } = await import("@/lib/aurora/tts-oss/browser-voices");
      return rankBrowserVoices().map((r) => ({
        id: r.voice.voiceURI,
        label: r.voice.name,
        hint: r.reasons.join(" · "),
      }));
    }
    return [];
  } catch {
    return [];
  }
}

/** Resultado de una prueba de voz. */
export interface VoiceTestResult {
  ok: boolean;
  engine: AuroraVoiceEngine;
  /** Mensaje legible en español (éxito o motivo honesto del fallo). */
  message: string;
}

/** Frase de prueba por defecto. */
export const VOICE_TEST_PHRASE =
  "Hola, soy Aurora. Así sueno con esta voz. Puedes cambiarla cuando quieras.";

/**
 * testVoice — prueba UN motor concreto y dice la verdad sobre el resultado.
 *
 * IMPORTANTE (diseño deliberado): esto **NO usa la cadena de fallback**. Si le
 * pides probar VoxCPM y VoxCPM no responde, te dice que VoxCPM no responde — no
 * te engaña hablando con la voz del navegador y dejándote creer que funcionó.
 * El fallback es para que Aurora nunca calle en su uso normal; una PRUEBA existe
 * justo para diagnosticar, así que aquí la honestidad manda.
 *
 * Nunca lanza.
 */
export async function testVoice(
  id: AuroraVoiceEngine,
  phrase: string = VOICE_TEST_PHRASE,
): Promise<VoiceTestResult> {
  const meta = VOICE_ENGINE_REGISTRY[id];
  const fail = (message: string): VoiceTestResult => ({ ok: false, engine: id, message });
  const win = (): VoiceTestResult => ({
    ok: true,
    engine: id,
    message: `${meta?.label ?? id} habló correctamente.`,
  });

  try {
    if (typeof window === "undefined") return fail("Sin navegador.");

    // Cortamos cualquier voz en curso (una voz a la vez).
    try {
      const { stopConfiguredEngine } = await import("@/lib/aurora/tts-oss/speak-router");
      await stopConfiguredEngine();
    } catch {
      /* */
    }
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* */
    }

    if (isNeuralEngine(id)) {
      const { neuralSpeak, neuralEngineConfigured, NEURAL_ENGINE_META } = await import(
        "@/lib/aurora/tts-oss/neural-tts"
      );
      if (!neuralEngineConfigured(id)) {
        const cfg = getVoiceConfig();
        const s = cfg.engines?.[id];
        if (id === "voicebox" && s?.endpoint && !(s.profileId || s.voice)) {
          return fail(
            "Voicebox necesita un perfil de voz. Crea uno en la app y elígelo aquí (profile_id).",
          );
        }
        return fail(`${NEURAL_ENGINE_META[id].label} no tiene endpoint configurado.`);
      }
      let errorMsg = "";
      const audio = await neuralSpeak(id, phrase, {
        onError: (m) => {
          errorMsg = m;
        },
      });
      if (audio) return win();
      return fail(errorMsg || `${NEURAL_ENGINE_META[id].label} no devolvió audio.`);
    }

    if (id === "kokoro") {
      const { kokoroAvailable, kokoroSpeak } = await import("@/lib/aurora/tts-oss/kokoro");
      if (!kokoroAvailable()) return fail("Este dispositivo no puede ejecutar Kokoro.");
      let errorMsg = "";
      const cfg = getVoiceConfig();
      // Probar Kokoro implica DESCARGAR su modelo (~80 MB) si no está: como la
      // prueba es un gesto explícito del usuario, aquí sí autorizamos la descarga.
      const audio = await kokoroSpeak(phrase, {
        voice: cfg.voice,
        autoDownload: true,
        onError: (m) => {
          errorMsg = m;
        },
      });
      if (audio) return win();
      return fail(errorMsg || "Kokoro no pudo sintetizar la voz.");
    }

    if (id === "kitten") {
      return fail("Kitten TTS aún está en beta: hoy no sintetiza voz.");
    }

    // browser — la Web Speech API con la mejor voz rankeada + modulación viva.
    const synth = window.speechSynthesis;
    if (!synth) return fail("Este navegador no tiene síntesis de voz.");
    const [{ resolveBrowserVoice }, { resolveVoiceParams }] = await Promise.all([
      import("@/lib/aurora/tts-oss/browser-voices"),
      import("@/lib/aurora/tts-oss/voice-style"),
    ]);
    const cfg = getVoiceConfig();
    const params = resolveVoiceParams();
    const utter = new SpeechSynthesisUtterance(phrase);
    const voice = resolveBrowserVoice(cfg.browserVoiceURI);
    if (voice) utter.voice = voice;
    utter.rate = params.rate;
    utter.pitch = params.pitch;
    utter.volume = params.volume;
    utter.lang = voice?.lang || "es-ES";
    return await new Promise<VoiceTestResult>((resolve) => {
      let settled = false;
      const done = (r: VoiceTestResult) => {
        if (settled) return;
        settled = true;
        resolve(r);
      };
      utter.onend = () => done(win());
      utter.onerror = () => done(fail("El navegador no pudo reproducir la voz."));
      try {
        synth.speak(utter);
      } catch {
        done(fail("El navegador bloqueó la reproducción (requiere un gesto del usuario)."));
      }
      // Red de seguridad: si el navegador no dispara onend (bug conocido en
      // algunos WebKit), damos por buena la prueba a los 12 s.
      window.setTimeout(() => done(win()), 12_000);
    });
  } catch {
    return fail("No se pudo probar la voz.");
  }
}
