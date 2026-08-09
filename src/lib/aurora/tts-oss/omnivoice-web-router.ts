"use client";

/**
 * omnivoice-web-router.ts — ROUTER WEB-ONLY de OpenVoice (V2-VOZ / Adenda 94).
 * ============================================================================
 * Punto único de entrada WEB para sintetizar voz con OpenVoice (SIN daemon
 * local). Es el motor por DEFECTO de las personalidades dentro del sistema
 * OmniVoice. Reutiliza la lógica de descubrimiento, contrato y síntesis YA
 * PROBADA en `openvoice2.ts` / `openvoice-discovery.ts`, y la ENRIQUECE con el
 * descubrimiento autónomo de más familias de Spaces en Hugging Face.
 *
 * QUÉ HACE (requisitos del dueño, 2026-07-21):
 *   1) DESCRUBRIMIENTO AUTÓNOMO — `refreshWebVoiceDiscovery(force?)` escanea HF
 *      (solo Spaces "Running") para 5 familias: openvoice-v2, f5tts, xtts-v2,
 *      chattts y fish-speech. Sondea cada contrato y mezcla los sanos en el
 *      pool de failover. Cachea 10 min.
 *   2) ACTIVACIÓN POR SESIÓN — `speak-router.ts` llama a
 *      `refreshWebVoiceDiscovery()` una vez al iniciar/actualizar la sesión de
 *      chat de la neurona activa, así siempre hay endpoints funcionales.
 *   3) ENRUTAMIENTO POR PERSONALIDAD — selección ESTABLE de endpoint (hash de
 *      personalityId → índice entre sanos) para continuidad de timbre; la
 *      semilla sintética de identidad viaja con cada locución (flujo de
 *      openvoice2.ts, nunca audio real de nadie).
 *   4) RESILIENCIA (FAILOVER) — si el Space elegido se cae o da latencia
 *      extrema, reconecta al siguiente "Running" sano sin interrumpir la
 *      respuesta de Astraura (bucle hasta agotar el pool).
 *
 * SSR-safe, defensivo. NUNCA lanza.
 */

import {
  discoverOpenVoiceEndpoints,
  ensureDiscoveryFresh,
  getOpenVoiceDiscoveryInfo,
  isOpenVoiceEndpointBad,
  markOpenVoiceEndpointResult,
  probeSpaceContract,
  spaceIdToHost,
} from "@/lib/aurora/tts-oss/openvoice-discovery";
import {
  synthesizeOpenVoice2,
  type OpenVoice2SeedSpec,
  type OpenVoiceEndpoint,
} from "@/lib/aurora/tts-oss/openvoice2";
import { callGradioSpace } from "@/lib/aurora/tts-oss/omnivoice-hybrid";

// ── Tipos ────────────────────────────────────────────────────────────────────

export type WebVoiceKind =
  | "openvoice-v2"
  | "f5-tts"
  | "xtts"
  | "chattts"
  | "fish-speech";

export interface WebVoiceEndpoint {
  id: string;
  base: string;
  kind: WebVoiceKind;
  gradio: number;
  fnIndex: number;
  origin: "builtin" | "discovered";
  emotions?: string[];
}

// ── Constantes de descubrimiento ─────────────────────────────────────────────

/** Familias a escanear en HF (solo Running). La primera es la insignia. */
const HF_FAMILIES: { family: WebVoiceKind; q: string }[] = [
  { family: "openvoice-v2", q: "OpenVoiceV2" },
  { family: "f5-tts", q: "f5tts" },
  { family: "xtts", q: "XTTS-v2" },
  { family: "chattts", q: "ChatTTS" },
  { family: "fish-speech", q: "fish-speech" },
];

const DISCOVERY_TTL_MS = 10 * 60_000;
const LS_WEB_VOICE = "starseed.aurora.webvoice.v1";
const BAD_ENDPOINT_MS = 15 * 60_000; // un fallo de red/timeout → 15 min fuera
const BAD_ENDPOINT_HARD_MS = 6 * 60 * 60_000; // inferencia rota → 6 h fuera

// ── Estado de sesión ─────────────────────────────────────────────────────────

/** ¿Ya descubrimos esta sesión? Para no reescaneanar en cada frase. */
let discoveredThisSession = false;

export function resetWebVoiceDiscoverySession(): void {
  discoveredThisSession = false;
  try {
    if (typeof window !== "undefined") ensureDiscoveryFresh();
  } catch {
    /* */
  }
}

export function hasWebVoiceDiscoveredThisSession(): boolean {
  return discoveredThisSession;
}

export function getWebVoiceDiscoveryInfo() {
  try {
    return getOpenVoiceDiscoveryInfo();
  } catch {
    return { endpoints: [], healthy: 0 };
  }
}

// ── Jerarquía de la cadena de voz (preferencias de orden) ────────────────────
// Orden de PRIORIDAD de los MOTORES que el usuario puede reordenar en la ventana
// de voz. OmniVoice lo respeta en tiempo de habla reordenando la cadena.
const VOICE_CHAIN_PRIORITY_KEY = "starseed.aurora.voice.priority.v1";
const DEFAULT_CHAIN_PRIORITY = [
  "voicebox",
  "omnivoice",
  "openvoice2",
  "kokoro",
  "voxcpm",
  "bark",
  "gpt-sovits",
  "kitten",
  "browser",
];

/** Lee el orden de prioridad de motores (o el recomendado si no hay/inválido). */
export function getVoiceChainPriority(): string[] {
  const ls = safeLS();
  if (!ls) return [...DEFAULT_CHAIN_PRIORITY];
  try {
    const raw = ls.getItem(VOICE_CHAIN_PRIORITY_KEY);
    if (!raw) return [...DEFAULT_CHAIN_PRIORITY];
    const arr = JSON.parse(raw) as string[];
    const valid = arr.filter((m) => DEFAULT_CHAIN_PRIORITY.includes(m));
    if (valid.length === DEFAULT_CHAIN_PRIORITY.length) return valid;
    return [...DEFAULT_CHAIN_PRIORITY];
  } catch {
    return [...DEFAULT_CHAIN_PRIORITY];
  }
}

/** Guarda el orden de prioridad de motores. Nunca lanza. */
export function setVoiceChainPriority(order: string[]): void {
  const ls = safeLS();
  if (!ls) return;
  try {
    const valid = order.filter((m) => DEFAULT_CHAIN_PRIORITY.includes(m));
    if (valid.length === DEFAULT_CHAIN_PRIORITY.length) {
      ls.setItem(VOICE_CHAIN_PRIORITY_KEY, JSON.stringify(valid));
    }
  } catch {
    /* */
  }
}

/**
 * Reordena una cadena de voz según la preferencia del usuario: los motores que
 * el usuario puso "arriba" se intentan primero. Los no listados van al final
 * respetando su orden original. Nunca lanza.
 */
export function applyVoiceChainPriority<T extends string>(chain: T[]): T[] {
  try {
    const pri = getVoiceChainPriority();
    const rank = new Map(pri.map((m, i) => [m, i] as const));
    return [...chain].sort((a, b) => {
      const ra = rank.has(a) ? rank.get(a)! : Number.MAX_SAFE_INTEGER;
      const rb = rank.has(b) ? rank.get(b)! : Number.MAX_SAFE_INTEGER;
      return ra - rb;
    });
  } catch {
    return chain;
  }
}

// ── Utilidades SSR-safe ──────────────────────────────────────────────────────

function safeLS(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

async function fetchJson(url: string, timeoutMs = 10_000, signal?: AbortSignal): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => {
    try {
      ctrl.abort();
    } catch {
      /* */
    }
  }, timeoutMs);
  if (signal) signal.addEventListener("abort", () => ctrl.abort(), { once: true });
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// ── Descubrimiento autónomo de Spaces HF (solo Running) ──────────────────────

interface HfSpaceListing {
  id?: string;
  likes?: number;
  sdk?: string;
  private?: boolean;
  lastModified?: number;
}

/**
 * Busca Spaces Running para una familia y sondea su contrato. Devuelve los
 * endpoints sanos (con kind/fnIndex resueltos). Nunca lanza.
 */
async function scanFamily(
  family: WebVoiceKind,
  q: string,
  signal?: AbortSignal,
): Promise<WebVoiceEndpoint[]> {
  const list = (await fetchJson(
    `https://huggingface.co/api/spaces?search=${encodeURIComponent(q)}&limit=20&sort=trending&includeNonRunning=false`,
    10_000,
    signal,
  )) as HfSpaceListing[] | null;
  if (!Array.isArray(list) || !list.length) return [];
  const out: WebVoiceEndpoint[] = [];
  for (const s of list) {
    const id = s?.id;
    if (!id || s.private || s.sdk === "docker") continue;
    try {
      const ep = await probeSpaceContract(id, signal);
      if (!ep) continue;
      out.push({
        id,
        base: `https://${spaceIdToHost(id)}.hf.space`,
        kind: family,
        gradio: ep.gradio,
        fnIndex: ep.fnIndex,
        origin: "discovered",
        emotions: ep.emotions,
      });
    } catch {
      /* sigue con el siguiente */
    }
  }
  return out;
}

function readCache(): { at: number; eps: WebVoiceEndpoint[] } | null {
  const ls = safeLS();
  if (!ls) return null;
  try {
    const raw = ls.getItem(LS_WEB_VOICE);
    if (!raw) return null;
    const j = JSON.parse(raw) as { at: number; eps: WebVoiceEndpoint[] };
    if (!j || !Array.isArray(j.eps)) return null;
    return j;
  } catch {
    return null;
  }
}

function writeCache(eps: WebVoiceEndpoint[]): void {
  const ls = safeLS();
  if (!ls) return;
  try {
    ls.setItem(LS_WEB_VOICE, JSON.stringify({ at: Date.now(), eps }));
  } catch {
    /* */
  }
}

/**
 * Descubre los Spaces RUNNING en HF para TODAS las familias (una vez por
 * sesión; `force` reescanea). Enriquece el pool de failover del cliente
 * OpenVoice (vía `discoverOpenVoiceEndpoints`) y devuelve la lista sana
 * mezclada. La cadena de voz llama a esto al iniciar/actualizar la sesión.
 */
export async function refreshWebVoiceDiscovery(
  force = false,
  signal?: AbortSignal,
): Promise<WebVoiceEndpoint[]> {
  try {
    if (typeof window === "undefined") return [];
    if (discoveredThisSession && !force) {
      const cached = readCache();
      if (cached) return cached.eps;
    }
    discoveredThisSession = true;

    // 1) Refresca el pool interno de OpenVoice (ya incluye los 3 builtin +
    //    los que descubra openvoice-discovery) — reutiliza su lógica probada.
    await discoverOpenVoiceEndpoints({ force: true, signal }).catch(() => null);

    // 2) Escanea las familias EXTRA que pidió el dueño (F5/XTTS/ChatTTS/Fish)
    //    en paralelo. Solo nos interesan las Running (includeNonRunning=false).
    const extras = (
      await Promise.all(
        HF_FAMILIES.filter((f) => f.family !== "openvoice-v2").map((f) =>
          scanFamily(f.family, f.q, signal),
        ),
      ).catch(() => [] as WebVoiceEndpoint[][])
    ).flat();

    writeCache(extras);
    return extras;
  } catch {
    return [];
  }
}

// ── Enrutamiento por personalidad (continuidad de timbre) ─────────────────────

function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Selección ESTABLE: mismo personalityId → mismo índice sano (continuidad). */
function selectEndpointForPersonality(
  eps: WebVoiceEndpoint[],
  personalityId?: string,
): WebVoiceEndpoint | null {
  const healthy = eps.filter((e) => !isOpenVoiceEndpointBad(e.id));
  const pool = healthy.length ? healthy : eps;
  if (!pool.length) return null;
  const key = personalityId || "cuenta";
  return pool[hashStr(key) % pool.length];
}

// ── Resolución de personalidad (semilla sintética por arquetipo) ──────────────

async function resolvePersonalityContext(): Promise<{
  personalityId?: string;
  seedAttrs?: OpenVoice2SeedSpec;
}> {
  try {
    const mod = await import("@/lib/aurora/personalities");
    const profile =
      (typeof mod.resolvePersonalityForContext === "function"
        ? mod.resolvePersonalityForContext({})
        : null) ??
      (typeof mod.getActivePersonality === "function"
        ? mod.getActivePersonality()
        : null);
    if (!profile) return {};
    const personalityId = profile.id;
    let seedAttrs: OpenVoice2SeedSpec | undefined;
    if (typeof mod.mapPersonalityToDesign === "function") {
      seedAttrs = {
        attrs: mod.mapPersonalityToDesign(profile),
        instruct:
          (profile.voiceStyle?.omni?.instruct as string | undefined) ||
          profile.voiceStyle?.tone ||
          "",
        lang: profile.idioma || "es",
        text: "",
      };
    }
    return { personalityId, seedAttrs };
  } catch {
    return {};
  }
}

// ── Síntesis web (punto de entrada estable de la cadena) ──────────────────────

export interface OmnivoiceWebSynthesizeOptions {
  personalityId?: string;
  lang?: string;
  style?: string;
  refBlob?: Blob | null;
  /** Identidad de `refBlob` (cache de subidas por sesión, A149 · Ola 3). */
  refKey?: string;
  /** Semilla ad-hoc ya resuelta para el mensaje (identidad congelada). */
  seedAttrs?: OpenVoice2SeedSpec;
  /** ¿Usar semilla sintética? (config efectiva congelada). */
  useSeed?: boolean;
  /** Versión de semilla (config efectiva congelada). */
  seedVersion?: number;
  /** Ánimo congelado del mensaje (motores con emociones). */
  mood?: string;
  budgetCapMs?: number;
  signal?: AbortSignal;
  /**
   * Space CONGELADO del mensaje (fix continuidad, 2026-08-09): el que ganó el
   * primer trozo. Se propaga a `synthesizeOpenVoice2` para que TODOS los trozos
   * hablen por el mismo → mismo timbre. Antes este dato existía en
   * `neural-tts.ts` pero NO llegaba hasta aquí, así que cada trozo volvía a
   * elegir Space por salud/orden: esa era la causa de «cambia de voz dentro del
   * mismo mensaje».
   */
  endpointOverride?: OpenVoiceEndpoint;
  /**
   * ¿Se permite saltar a OTRA FAMILIA de motor (F5-TTS/XTTS/ChatTTS/Fish) si
   * OpenVoice no da audio? Solo mientras el mensaje NO haya empezado a sonar:
   * una vez suena, cambiar de familia es cambiar de persona a media frase.
   * Por defecto `true` (turno nuevo = puede elegir lo que funcione).
   */
  allowFamilyFailover?: boolean;
}

/**
 * Sintetiza `text` por el router web de OpenVoice. Devuelve el Blob o null
 * (null ⇒ la cadena de voz sigue con el siguiente eslabón: Aurora SIEMPRE
 * habla). Mantiene el flujo de semilla por personalidad y hace FAILOVER entre
 * Spaces sanos si el elegido se cae a mitad de sesión.
 */
export async function omnivoiceWebSynthesize(
  text: string,
  opts: OmnivoiceWebSynthesizeOptions = {},
): Promise<Blob | null> {
  try {
    ensureDiscoveryFresh();

    // Personalidad: si el llamador no la pasó, la sacamos de la activa.
    // (Con identidad congelada SIEMPRE viene informada: esta rama es solo para
    // llamadas sueltas —pruebas de la UI, precalentado— y para el suelo.)
    let personalityId = opts.personalityId;
    let seedAttrs: OpenVoice2SeedSpec | undefined = opts.seedAttrs;
    if (!personalityId || !seedAttrs) {
      const ctx = await resolvePersonalityContext();
      personalityId = personalityId ?? ctx.personalityId;
      // FIX (2026-08-09): antes la semilla solo se resolvía cuando NO venía
      // personalidad — así que un trozo con `personalityId` informado y otro sin
      // él sintetizaban con semillas distintas ⇒ voces distintas. Ahora se
      // completa siempre lo que falte, sin pisar lo que ya trae el llamador.
      seedAttrs = seedAttrs ?? ctx.seedAttrs;
    }

    // Pool sano (builtin + descubiertos) para continuidad + failover.
    const info = getOpenVoiceDiscoveryInfo();
    const openVoiceEps = (info.endpoints || []).filter(
      (e) => !isOpenVoiceEndpointBad(e.id),
    );
    const chosen =
      opts.endpointOverride ??
      selectEndpointForPersonality(
        openVoiceEps as unknown as WebVoiceEndpoint[],
        personalityId,
      );

    // 1) openvoice-v2 → reusa TODA la lógica de semilla/estilo/cola de
    //    openvoice2.ts (incluida su propia cadena de failover interna, que con
    //    endpoint congelado se limita a ese Space + los de su misma familia).
    const blob = await synthesizeOpenVoice2(text, {
      lang: opts.lang,
      personalityId,
      styleHint: opts.style,
      refBlob: opts.refBlob,
      refKey: opts.refKey,
      useSeed: opts.useSeed,
      seedVersion: opts.seedVersion,
      moodOverride: opts.mood,
      seedAttrs,
      budgetCapMs: opts.budgetCapMs,
      signal: opts.signal,
      endpointOverride: opts.endpointOverride,
    }).catch(() => null);

    // SALUD: con endpoint congelado NO apuntamos nada aquí. `synthesizeOpenVoice2`
    // ya registra el resultado del Space que REALMENTE atendió el trozo (puede
    // haber sido otro de la misma familia tras un failover), y anotar el
    // congelado como bueno resucitaría de rebote a un Space que falló.
    const anotaSalud = !opts.endpointOverride;
    if (blob) {
      if (anotaSalud && chosen?.id) markOpenVoiceEndpointResult(chosen.id, true);
      return blob;
    }
    if (anotaSalud && chosen?.id) markOpenVoiceEndpointResult(chosen.id, false);

    // 2) FAILOVER a las familias EXTRA (F5/XTTS/ChatTTS/Fish) si el pool
    //    openvoice-v2 no dio audio. Usan el cliente Gradio genérico.
    //    INVARIANTE DE VOZ (2026-08-09): esto es OTRO MODELO — no reproduce el
    //    timbre de la semilla. Solo se permite cuando el mensaje aún no ha
    //    empezado a sonar; a mitad de locución preferimos cerrar con dignidad
    //    antes que cambiar de persona entre dos frases.
    if (opts.allowFamilyFailover === false) return null;
    const extras = (readCache()?.eps || []).filter(
      (e) => e.kind !== "openvoice-v2" && !isOpenVoiceEndpointBad(e.id),
    );
    for (const ep of extras) {
      const fb = await callGradioSpace(ep.base, String(ep.fnIndex), [text], {
        signal: opts.signal,
        budgetMs: opts.budgetCapMs && opts.budgetCapMs > 0 ? opts.budgetCapMs : 120_000,
      })
        .then((arr) => (Array.isArray(arr) && arr.length ? (arr[0] as Blob) : null))
        .catch(() => null);
      if (fb && fb instanceof Blob) {
        markOpenVoiceEndpointResult(ep.id, true);
        return fb;
      }
      markOpenVoiceEndpointResult(ep.id, false);
    }

    return null;
  } catch {
    return null;
  }
}
