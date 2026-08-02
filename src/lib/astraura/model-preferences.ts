"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ASTRAURA · PREFERENCIAS UNIFICADAS DE MODELO (orden por CLASE DE ACCESO)
 * ---------------------------------------------------------------------------
 * Una sola capa, editable por el usuario, que expresa QUÉ CLASE de inteligencia
 * prefiere — tanto para el LLM (router de Astraura) como para la VOZ (cadena de
 * motores TTS). No elige un modelo concreto: ordena las CUATRO clases de acceso
 *
 *   local  →  starseed  →  api-free  →  api-external
 *
 * y ese orden se SIEMBRA por las capacidades del dispositivo (GPU, conexión,
 * motor local presente) y se CABLEA como SESGO aditivo pequeño:
 *   · router LLM  (`rankCandidates`)  → nudge por `llmSourceAccessClass`.
 *   · cadena de voz (`buildVoiceChain`) → reordena AUTO por `voiceEngineAccessClass`.
 *
 * FILOSOFÍA (CLAUDE.md §3): soberanía y privacidad primero. Por defecto lo LOCAL
 * (en el dispositivo) manda, luego el servidor StarSeed/OpenVoice automático,
 * luego las APIs gratis sin coste y, al final, las externas con clave.
 *
 * Persistencia: clave localStorage `starseed.astraura.model-order.v1`. El
 * catch-all `starseed.astraura.*` (settings-sync) ya la lleva con la cuenta
 * soberana; aquí NO añadimos ninguna clave nueva ni ningún I/O de red.
 *
 * Módulo AUTOCONTENIDO a propósito: cero imports del proyecto (evita ciclos con
 * `router.ts` y `engine-registry.ts`, que SÍ importan de aquí). Todo defensivo,
 * SSR-safe y NUNCA lanza: sin `window` devuelve el default y no persiste.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── Clases de acceso ─────────────────────────────────────────────────────────

/**
 * CLASE DE ACCESO de una fuente de inteligencia o motor de voz:
 *   · local        = en el dispositivo (Ollama/LM Studio/WebGPU/WebLLM/Chrome AI,
 *                    y los motores de voz del navegador o del propio servidor del
 *                    usuario) — máxima soberanía y privacidad.
 *   · starseed     = servidor StarSeed / OpenVoice·OmniVoice automático inteligente
 *                    (cero configuración, nube gratis + daemon local del ecosistema).
 *   · api-free     = APIs en la nube gratis y sin coste (OpenRouter :free,
 *                    Pollinations, OVH anónimo, LLM7, tiers gratuitos con clave…).
 *   · api-external = APIs/integraciones externas con clave, propias o de pago
 *                    (OpenAI, Anthropic, xAI, o el endpoint propio del usuario).
 */
export type ModelAccessClass = "local" | "starseed" | "api-free" | "api-external";

/** Entorno estimado para las preferencias por entorno (`perEnv`). */
export type EnvKind = "offline" | "low" | "mid" | "high";

/** Orden canónico de las clases (soberanía-primero). */
export const MODEL_ACCESS_CLASSES: readonly ModelAccessClass[] = [
  "local",
  "starseed",
  "api-free",
  "api-external",
];

/** Entornos válidos (para saneado de `perEnv`). No forma parte del contrato mínimo. */
export const ENV_KINDS: readonly EnvKind[] = ["offline", "low", "mid", "high"];

/**
 * Metadatos para la UI de cada clase: etiqueta, pista y nombre de icono lucide
 * (string; la UI resuelve el componente). Español, estilo del proyecto.
 */
export const MODEL_ACCESS_META: Record<
  ModelAccessClass,
  { label: string; hint: string; icon: string }
> = {
  local: {
    label: "En tu dispositivo",
    hint: "Máxima soberanía y privacidad: Ollama, LM Studio, WebGPU o la IA del navegador. Nada sale de tu equipo.",
    icon: "cpu",
  },
  starseed: {
    label: "StarSeed (automático)",
    hint: "El servidor StarSeed y OpenVoice eligen la mejor opción por ti, gratis y sin configurar nada.",
    icon: "sparkles",
  },
  "api-free": {
    label: "APIs gratis",
    hint: "Servicios en la nube sin coste (OpenRouter :free, Pollinations, OVH…). Cero gasto.",
    icon: "gift",
  },
  "api-external": {
    label: "APIs externas",
    hint: "Integraciones con clave, propias o de pago (OpenAI, Anthropic, xAI o tu endpoint). Máxima potencia.",
    icon: "key",
  },
};

// ── Modelo de preferencia persistido ─────────────────────────────────────────

export interface ModelOrderPreference {
  /** Orden base de las clases (las clases OMITIDAS quedan EXCLUIDAS). */
  order: ModelAccessClass[];
  /** auto = Aurora sesga con la recomendación · fixed = se respeta `order` tal cual. */
  mode: "auto" | "fixed";
  /** Overrides por tarea (taskKind → orden de clases). */
  perTask?: Partial<Record<string, ModelAccessClass[]>>;
  /** Overrides por entorno (offline/low/mid/high → orden de clases). */
  perEnv?: Partial<Record<EnvKind, ModelAccessClass[]>>;
  /** Marca de tiempo de la última edición (para sync/orden). */
  updatedAt: number;
}

/** Clave localStorage (dentro del namespace `starseed.astraura.*` que ya sincroniza). */
export const MODEL_PREFS_KEY = "starseed.astraura.model-order.v1";
/** Evento que se emite al guardar (la UI y consumidores refrescan). */
export const MODEL_PREFS_EVENT = "starseed:model-prefs";

/** Preferencia por defecto: soberanía-primero, modo auto. */
export const DEFAULT_MODEL_PREFERENCE: ModelOrderPreference = {
  order: ["local", "starseed", "api-free", "api-external"],
  mode: "auto",
  updatedAt: 0,
};

/** Copia fresca del default (nunca compartimos la referencia mutable). */
function cloneDefault(): ModelOrderPreference {
  return {
    order: [...DEFAULT_MODEL_PREFERENCE.order],
    mode: DEFAULT_MODEL_PREFERENCE.mode,
    updatedAt: DEFAULT_MODEL_PREFERENCE.updatedAt,
  };
}

// ── Saneado ──────────────────────────────────────────────────────────────────

/** Filtra a clases válidas, sin duplicados, preservando el orden dado. */
function sanitizeOrder(arr: unknown): ModelAccessClass[] {
  if (!Array.isArray(arr)) return [];
  const seen = new Set<string>();
  const out: ModelAccessClass[] = [];
  for (const x of arr) {
    if (
      typeof x === "string" &&
      (MODEL_ACCESS_CLASSES as readonly string[]).includes(x) &&
      !seen.has(x)
    ) {
      seen.add(x);
      out.push(x as ModelAccessClass);
    }
  }
  return out;
}

// ── Lectura / escritura (SSR-safe, defensivas) ───────────────────────────────

/**
 * Lee la preferencia. SSR-safe: sin `window` devuelve el default. Sanea todo lo
 * leído (clases inválidas fuera, sin duplicados) y completa con el default si el
 * `order` guardado quedara vacío. Nunca lanza.
 */
export function getModelPreferences(): ModelOrderPreference {
  if (typeof window === "undefined") return cloneDefault();
  try {
    const raw = window.localStorage.getItem(MODEL_PREFS_KEY);
    if (!raw) return cloneDefault();
    const p = JSON.parse(raw);
    if (!p || typeof p !== "object") return cloneDefault();
    const order = sanitizeOrder((p as { order?: unknown }).order);
    const modeRaw = (p as { mode?: unknown }).mode;
    const out: ModelOrderPreference = {
      order: order.length ? order : [...DEFAULT_MODEL_PREFERENCE.order],
      mode: modeRaw === "fixed" ? "fixed" : "auto",
      updatedAt:
        typeof (p as { updatedAt?: unknown }).updatedAt === "number"
          ? (p as { updatedAt: number }).updatedAt
          : 0,
    };
    const rawPt = (p as { perTask?: unknown }).perTask;
    if (rawPt && typeof rawPt === "object") {
      const pt: Record<string, ModelAccessClass[]> = {};
      for (const k of Object.keys(rawPt as Record<string, unknown>)) {
        const v = sanitizeOrder((rawPt as Record<string, unknown>)[k]);
        if (v.length) pt[k] = v;
      }
      if (Object.keys(pt).length) out.perTask = pt;
    }
    const rawPe = (p as { perEnv?: unknown }).perEnv;
    if (rawPe && typeof rawPe === "object") {
      const pe: Partial<Record<EnvKind, ModelAccessClass[]>> = {};
      for (const k of Object.keys(rawPe as Record<string, unknown>)) {
        if (!(ENV_KINDS as readonly string[]).includes(k)) continue;
        const v = sanitizeOrder((rawPe as Record<string, unknown>)[k]);
        if (v.length) pe[k as EnvKind] = v;
      }
      if (Object.keys(pe).length) out.perEnv = pe;
    }
    return out;
  } catch {
    return cloneDefault();
  }
}

/**
 * Aplica un patch parcial, persiste y emite `MODEL_PREFS_EVENT`. Merge amable:
 *   · `order` / `mode` se reemplazan si vienen (order saneado).
 *   · `perTask` / `perEnv` se fusionan por CLAVE; una clave con `[]` la BORRA.
 * Siempre refresca `updatedAt`. SSR-safe: sin `window` devuelve el resultado sin
 * persistir. Nunca lanza.
 */
export function saveModelPreferences(
  patch: Partial<ModelOrderPreference>,
): ModelOrderPreference {
  const current = getModelPreferences();
  const next: ModelOrderPreference = {
    order: [...current.order],
    mode: current.mode,
    updatedAt: current.updatedAt,
  };
  if (current.perTask) next.perTask = { ...current.perTask };
  if (current.perEnv) next.perEnv = { ...current.perEnv };

  if (patch && typeof patch === "object") {
    if (Array.isArray(patch.order)) {
      const o = sanitizeOrder(patch.order);
      if (o.length) next.order = o;
    }
    if (patch.mode === "auto" || patch.mode === "fixed") next.mode = patch.mode;
    if (patch.perTask && typeof patch.perTask === "object") {
      const merged: Partial<Record<string, ModelAccessClass[]>> = { ...(next.perTask || {}) };
      for (const k of Object.keys(patch.perTask)) {
        const v = sanitizeOrder((patch.perTask as Record<string, unknown>)[k]);
        if (v.length) merged[k] = v;
        else delete merged[k]; // [] o inválido → borra la override
      }
      next.perTask = Object.keys(merged).length ? merged : undefined;
    }
    if (patch.perEnv && typeof patch.perEnv === "object") {
      const merged: Partial<Record<EnvKind, ModelAccessClass[]>> = { ...(next.perEnv || {}) };
      for (const k of Object.keys(patch.perEnv)) {
        if (!(ENV_KINDS as readonly string[]).includes(k)) continue;
        const v = sanitizeOrder((patch.perEnv as Record<string, unknown>)[k]);
        if (v.length) merged[k as EnvKind] = v;
        else delete merged[k as EnvKind];
      }
      next.perEnv = Object.keys(merged).length ? merged : undefined;
    }
  }

  next.updatedAt = Date.now();
  if (typeof window === "undefined") return next; // SSR: no persiste
  try {
    window.localStorage.setItem(MODEL_PREFS_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(MODEL_PREFS_EVENT, { detail: next }));
  } catch {
    /* persistencia best-effort */
  }
  return next;
}

// ── Recomendación por entorno (siembra) ──────────────────────────────────────

/**
 * Orden RECOMENDADO por las capacidades del dispositivo. Soberanía-primero por
 * defecto; se desvía solo con motivo:
 *   · con GPU/tier alto y motor local → local primero (máxima soberanía).
 *   · sin conexión → local, starseed (solo el equipo puede responder).
 *   · gama baja/mínima SIN local → api-free primero (no cargamos un equipo débil).
 * Sin señales devuelve el orden canónico (coincide con el default → fusión inocua).
 * Pura y defensiva: nunca lanza.
 */
export function recommendedOrder(input: {
  tier?: "alto" | "medio" | "bajo" | "minimo";
  online?: boolean;
  hasLocal?: boolean;
}): ModelAccessClass[] {
  const inp = input && typeof input === "object" ? input : {};
  const tier = inp.tier;
  const online = inp.online !== false; // por defecto asumimos conexión
  const hasLocal = inp.hasLocal === true;
  const weak = tier === "bajo" || tier === "minimo";
  const strong = tier === "alto" || tier === "medio";

  // 1) SIN CONEXIÓN — solo el propio equipo puede responder: soberanía primero,
  //    APIs de red al final (volverán a servir cuando regrese internet).
  if (!online) return ["local", "starseed", "api-free", "api-external"];

  // 2) EQUIPO DÉBIL Y SIN MOTOR LOCAL — no cargamos un dispositivo modesto con
  //    inferencia local que no tiene: las APIs GRATIS sin coste primero.
  if (weak && !hasLocal) return ["api-free", "starseed", "api-external", "local"];

  // 3) GPU / GAMA ALTA-MEDIA CON MOTOR LOCAL — máxima soberanía: local primero.
  if (strong && hasLocal) return ["local", "starseed", "api-free", "api-external"];

  // 4) DEFECTO SOBERANO (incl. input vacío) — orden canónico. Coincide con el
  //    default de ModelOrderPreference para que la fusión 'auto' sea inocua.
  return ["local", "starseed", "api-free", "api-external"];
}

/**
 * Fusiona la base del usuario con la recomendación RESPETANDO EXCLUSIONES: solo
 * salen las clases presentes en `base` (las que el usuario no quitó). La
 * recomendación entra como SESGO — puntuamos cada clase por su posición en la
 * base (prioridad manual) + su posición en la recomendación, y ordenamos
 * ascendente, con la base como desempate estable. Así la recomendación manda sin
 * resucitar clases excluidas ni ignorar del todo la elección del usuario.
 */
function blendOrders(
  base: ModelAccessClass[],
  rec: ModelAccessClass[],
): ModelAccessClass[] {
  const recIdx = (c: ModelAccessClass) => {
    const i = rec.indexOf(c);
    return i < 0 ? rec.length : i;
  };
  return base
    .map((c, i) => ({ c, i, score: i + recIdx(c) }))
    .sort((a, b) => a.score - b.score || a.i - b.i)
    .map((x) => x.c);
}

/**
 * Orden EFECTIVO de clases: resuelve perTask > perEnv > order como base y, en
 * modo `auto`, la fusiona con `recommendedOrder` (sesgo respetando exclusiones).
 * En modo `fixed` devuelve la base tal cual. Nunca lanza.
 */
export function effectiveOrder(opts?: {
  task?: string;
  env?: EnvKind;
  tier?: "alto" | "medio" | "bajo" | "minimo";
  online?: boolean;
  hasLocal?: boolean;
}): ModelAccessClass[] {
  try {
    const o = opts || {};
    const prefs = getModelPreferences();

    // Base: perTask > perEnv > order.
    let base: ModelAccessClass[] | undefined;
    const task = typeof o.task === "string" ? o.task : undefined;
    const env = o.env;
    if (task && prefs.perTask && Array.isArray(prefs.perTask[task])) {
      base = prefs.perTask[task];
    } else if (env && prefs.perEnv && Array.isArray(prefs.perEnv[env])) {
      base = prefs.perEnv[env];
    }
    if (!base) base = prefs.order;
    base = sanitizeOrder(base);
    if (!base.length) base = [...DEFAULT_MODEL_PREFERENCE.order];

    // Modo fijo: la base manda tal cual (sin recomendación).
    if (prefs.mode !== "auto") return base;

    // Modo auto: la recomendación entra como sesgo. `env === "offline"` implica
    // sin conexión salvo que se diga lo contrario explícitamente.
    const online =
      typeof o.online === "boolean" ? o.online : env === "offline" ? false : undefined;
    const rec = recommendedOrder({ tier: o.tier, online, hasLocal: o.hasLocal });
    return blendOrders(base, rec);
  } catch {
    return [...DEFAULT_MODEL_PREFERENCE.order];
  }
}

/**
 * SESGO ADITIVO de una clase: mayor cuanto más arriba esté en `effectiveOrder`.
 * Para un orden de 4 clases: idx0 → 4, idx1 → 3, idx2 → 2, idx3 → 1; 0 si la
 * clase no está (excluida). Pensado para NUDGE (escala pequeña ~[0..4]). Nunca lanza.
 */
export function accessBias(
  cls: ModelAccessClass,
  opts?: { task?: string; env?: EnvKind },
): number {
  try {
    const order = effectiveOrder(opts);
    const idx = order.indexOf(cls);
    if (idx < 0) return 0;
    return order.length - idx;
  } catch {
    return 0;
  }
}

// ── Mapeos: fuente/motor → clase de acceso ───────────────────────────────────

/**
 * Mapea el `sourceId` de una fuente del router de Astraura a su clase de acceso.
 * Heurística por SUBSTRING robusta (soporta fuentes registradas en runtime desde
 * la Biblioteca) con default `api-free` (la red de seguridad universal gratis).
 *
 * Fuentes reales del catálogo (`free-catalog.ts`):
 *   · local        → ollama-local, lmstudio-local, local-openllm, omniroute-local,
 *                    smollm3-webgpu, smolvlm2-webgpu, sipp-local, chrome-ai, webllm.
 *   · api-external → anthropic-paid, openai-paid (y xAI / endpoints propios).
 *   · api-free     → groq/cerebras/gemini/mistral/nvidia/github/cloudflare/scaleway/
 *                    cohere/sambanova/huggingface/ollama-CLOUD/nscale/modelscope/
 *                    siliconflow/zai (free-key), ovh-anonymous, llm7-free,
 *                    pollinations-text, openrouter-free.
 * (`ollama-cloud` NO es local: lleva "cloud" y se excluye explícitamente.)
 */
export function llmSourceAccessClass(sourceId: string): ModelAccessClass {
  const id = String(sourceId ?? "").toLowerCase().trim();
  if (!id) return "api-free";

  // 1) EXTERNA CON CLAVE (propia o de pago) — lo más específico primero para que
  //    "-paid", OpenAI/Anthropic/Claude/xAI/Grok o un endpoint propio nunca
  //    caigan en gratis. ("openrouter"/"openllm" NO contienen "openai".)
  if (
    /(^|[-_])paid([-_]|$)/.test(id) ||
    id.includes("openai") ||
    id.includes("anthropic") ||
    id.includes("claude") ||
    id.includes("xai") ||
    id.includes("grok") ||
    id.includes("custom") ||
    id.includes("byok")
  ) {
    return "api-external";
  }

  // 2) SERVIDOR STARSEED / OPENVOICE — auto inteligente del propio ecosistema.
  if (id.includes("starseed") || id.includes("hermione") || id.includes("openvoice")) {
    return "starseed";
  }

  // 3) LOCAL / EN EL DISPOSITIVO — Ollama (no cloud), LM Studio, WebGPU, WebLLM,
  //    Chrome AI, transformers.js, Sipp, el proxy local OmniRoute, llama.cpp… y
  //    cualquier id con el segmento `local`.
  if (
    (id.includes("ollama") && !id.includes("cloud")) ||
    id.includes("lmstudio") ||
    id.includes("lm-studio") ||
    id.includes("webgpu") ||
    id.includes("webllm") ||
    id.includes("chrome") ||
    id.includes("transformers") ||
    id.includes("sipp") ||
    id.includes("omniroute") ||
    id.includes("llama.cpp") ||
    id.includes("llamacpp") ||
    id.includes("gpt4all") ||
    /(^|[-_])local([-_]|$)/.test(id)
  ) {
    return "local";
  }

  // 4) DEFAULT — API gratis sin coste (gratis-primero).
  return "api-free";
}

/**
 * Mapea un motor de voz (`VOICE_ENGINE_REGISTRY`) a su clase de acceso, por id.
 * Refleja el campo `kind` + el ecosistema del motor (sin importar el registro,
 * para no crear un ciclo con `engine-registry.ts`, que importa de este módulo):
 *   · api-external → xai (Grok Voice: API externa server-side / clave propia).
 *   · starseed     → omnivoice, openvoice2 (integrados de StarSeed: nube gratis
 *                    + daemon local, cero configuración).
 *   · local        → browser/kokoro/kitten (kind browser|local, en el dispositivo)
 *                    y voxcpm/voicebox/bark/gpt-sovits (kind endpoint, pero en el
 *                    PROPIO servidor del usuario: neurona/PC → soberanía). Es el
 *                    default para cualquier motor nuevo (soberanía-primero).
 */
export function voiceEngineAccessClass(engine: string): ModelAccessClass {
  const id = String(engine ?? "").toLowerCase().trim();
  if (!id) return "local"; // desconocido → soberanía-primero para la voz
  if (id.includes("xai") || id.includes("grok")) return "api-external";
  if (id.includes("omnivoice") || id.includes("openvoice")) return "starseed";
  return "local";
}

// ── Pruebas ──────────────────────────────────────────────────────────────────

/** Restablece la preferencia (solo pruebas). Nunca lanza. */
export function _resetModelPreferences(): void {
  try {
    if (typeof window !== "undefined") window.localStorage.removeItem(MODEL_PREFS_KEY);
  } catch {
    /* */
  }
}
