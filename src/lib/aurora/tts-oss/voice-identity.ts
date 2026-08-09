"use client";

/**
 * StarSeed OS — IDENTIDAD DE VOZ CONGELADA POR MENSAJE (OmniVoice).
 * ============================================================================
 * QUÉ RESUELVE (queja directa del dueño, 2026-08-09): «la voz predeterminada
 * tarda mucho, no es de corrido, se separa entre pausas y no habla con la misma
 * voz ni dentro de un mismo mensaje».
 *
 * La causa REAL no era el troceo (trocear está bien: da primer sonido pronto y
 * los Spaces gratis no pueden con parrafones), sino que CADA TROZO volvía a
 * resolver TODO lo que define el timbre:
 *
 *   · el endpoint/Space (el "endpoint congelado" existía pero se perdía por el
 *     camino: `neuralSynthesize` no lo pasaba al router web),
 *   · la personalidad activa, su semilla (`seedAttrs`) y su referencia de audio,
 *   · el estilo/emoción persistidos y el ánimo VIVO del usuario,
 *   · la modulación de reproducción (playbackRate con `preservesPitch=false`
 *     ⇒ un trozo "alegre" sonaba literalmente más agudo que el anterior),
 *   · la config OmniVoice efectiva (cuenta × personalidad).
 *
 * Cualquiera de esas piezas cambiando a mitad de mensaje = OTRA VOZ. Este
 * módulo las resuelve UNA VEZ al empezar el mensaje, las congela y las sirve a
 * todos los trozos. Es el contrato de la INVARIANTE #1: **misma voz dentro del
 * mismo mensaje**.
 *
 * Además guarda la CACHÉ DE SÍNTESIS por (texto × identidad congelada): el
 * primer trozo se sintetiza una sola vez aunque el pipeline lo pida varias
 * veces (antes se sintetizaba 2-3 veces — ver `neural-tts.ts::neuralSpeakChunked`),
 * y volver a escuchar un mensaje reciente es instantáneo.
 *
 * MÓDULO HOJA: solo importa TIPOS (se borran al compilar), así que cualquier
 * módulo de la cadena de voz puede leer la identidad sin crear ciclos.
 * SSR-safe (estado de módulo, nada toca `window` al importar). NUNCA lanza.
 */

import type {
  AstrauraVoiceConfig,
  NeuralEngineSettings,
  NeuralVoiceEngine,
} from "@/lib/aurora/tts-oss/voice-config";
import type { ResolvedVoiceParams } from "@/lib/aurora/tts-oss/voice-style";
import type { OmniRouteDecision } from "@/lib/aurora/tts-oss/omnivoice-hybrid";
import type { OpenVoice2SeedSpec, OpenVoiceEndpoint } from "@/lib/aurora/tts-oss/openvoice2";

/** Modulación de REPRODUCCIÓN (velocidad/volumen) congelada para el mensaje. */
export interface FrozenPlaybackMod {
  rate: number;
  volume: number;
}

/**
 * Identidad de voz de UN mensaje. Todo lo que puede cambiar el timbre vive
 * aquí y se resuelve una sola vez (`neural-tts.ts::beginMessageVoiceIdentity`).
 */
export interface FrozenVoiceIdentity {
  /** Token único del mensaje (invalida identidades viejas al cortar). */
  token: number;
  /** Motor elegido para TODO el mensaje. */
  engine: NeuralVoiceEngine;
  /** Ajustes del motor (incluye el `lang` ya detectado del texto real). */
  settings: NeuralEngineSettings;
  /** Estilo/emoción resueltos (rate/pitch/energy) — congelados. */
  params: ResolvedVoiceParams;
  /** Modulación de reproducción congelada (null = sin modulación). */
  playbackMod: FrozenPlaybackMod | null;
  /** Ánimo del usuario congelado (los motores con emociones lo usan). */
  mood?: string;
  /** Personalidad que habla (semilla, estilo y vía de voz penden de ella). */
  personalityId?: string;
  /** Arquetipo de semilla para el daemon local ("aurora"/"hermione"/""). */
  personaKind?: string;
  /** Semilla ad-hoc (personalidades sin semilla curada). */
  seedAttrs?: OpenVoice2SeedSpec;
  /** Muestra REAL grabada/importada de la personalidad (clonación). */
  refBlob?: Blob | null;
  /** Identidad de `refBlob` para la caché de subidas por sesión. */
  refKey?: string;
  /** Estilo OpenVoice pedido por la config efectiva (sub-esquema `openvoice`). */
  styleHint?: string;
  /** ¿Usar semilla sintética? (config efectiva). */
  useSeed?: boolean;
  /** Versión de semilla (config efectiva). */
  seedVersion?: number;
  /** Config OmniVoice EFECTIVA ya resuelta (cuenta × personalidad). */
  omni?: AstrauraVoiceConfig;
  /** Ruta OmniVoice congelada (local/nube) para todo el mensaje. */
  omniRoute?: OmniRouteDecision;
  /** Space OpenVoice congelado tras el primer trozo (mismo timbre). */
  openVoiceEndpoint?: OpenVoiceEndpoint;
  /** Huella estable de la identidad (clave de la caché de síntesis). */
  fingerprint: string;
  /** ¿Ya sonó algún trozo? (a partir de ahí NO se cambia de familia de motor). */
  spoke: boolean;
}

/** Identidad del mensaje que se está hablando AHORA (o null). */
let current: FrozenVoiceIdentity | null = null;
let tokenSeq = 0;

/** Siguiente token de mensaje (monotónico). */
export function nextVoiceIdentityToken(): number {
  tokenSeq += 1;
  return tokenSeq;
}

/**
 * Publica la identidad congelada del mensaje en curso. La sustituye siempre:
 * una voz a la vez es la regla del sistema (`stopNeural` corta la anterior).
 */
export function setVoiceIdentity(identity: FrozenVoiceIdentity | null): void {
  current = identity;
}

/** Identidad congelada del mensaje en curso (o null si nadie habla). */
export function getVoiceIdentity(): FrozenVoiceIdentity | null {
  return current;
}

/**
 * Identidad del mensaje en curso SOLO si es la de `token`. Útil para que un
 * trozo tardío de un mensaje ya cortado no pise al mensaje nuevo.
 */
export function getVoiceIdentityFor(token: number): FrozenVoiceIdentity | null {
  return current && current.token === token ? current : null;
}

/** Cierra la identidad si sigue siendo la de `token` (idempotente). */
export function clearVoiceIdentity(token: number): void {
  if (current && current.token === token) current = null;
}

/** Marca que el mensaje YA sonó (bloquea cambios de familia de motor). */
export function markVoiceIdentitySpoke(token: number): void {
  if (current && current.token === token) current.spoke = true;
}

/**
 * Congela el Space/endpoint ganador del PRIMER trozo: el resto del mensaje
 * hablará por el mismo (mismo timbre). Idempotente y acotado al token.
 */
export function lockVoiceIdentityEndpoint(token: number, ep: OpenVoiceEndpoint | undefined): void {
  if (!ep) return;
  if (current && current.token === token) current.openVoiceEndpoint = ep;
}

/* ── Huella de identidad (clave de caché) ───────────────────────────────────── */

/** djb2 corto y estable (mismo criterio que `voiceTextHash`). */
export function identityHash(s: string): string {
  let h = 5381;
  const t = s || "";
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * Huella ESTABLE de todo lo que define el timbre. Dos síntesis con la misma
 * huella y el mismo texto suenan igual ⇒ se pueden compartir (caché). El
 * endpoint NO entra: dentro de un mensaje está congelado y, entre mensajes,
 * la semilla/referencia es la misma en cualquier Space de la misma familia.
 */
export function voiceIdentityFingerprint(parts: {
  engine: string;
  lang?: string;
  personalityId?: string;
  styleHint?: string;
  refKey?: string;
  useSeed?: boolean;
  seedVersion?: number;
  mood?: string;
  params?: { rate: number; pitch: number; energy: number; emotion?: string };
  seedAttrs?: OpenVoice2SeedSpec;
  omni?: AstrauraVoiceConfig;
}): string {
  try {
    const p = parts.params;
    const design = parts.omni?.voice_design_attributes;
    const raw = [
      parts.engine,
      parts.lang || "",
      parts.personalityId || "",
      parts.styleHint || "",
      parts.refKey || "",
      parts.useSeed === false ? "noseed" : "seed",
      String(parts.seedVersion ?? ""),
      parts.mood || "",
      p ? `${p.rate}|${p.pitch}|${p.energy}|${p.emotion ?? ""}` : "",
      parts.seedAttrs ? `${parts.seedAttrs.instruct}|${parts.seedAttrs.lang}` : "",
      design ? `${design.gender}|${design.age}|${design.pitch}|${design.style}|${design.accent}` : "",
      parts.omni ? `${parts.omni.generation_mode}|${parts.omni.instruct || ""}` : "",
    ].join("");
    return identityHash(raw);
  } catch {
    return identityHash(parts.engine || "");
  }
}

/* ── Caché de síntesis por (texto × identidad) ───────────────────────────────── */

/**
 * Caché LRU pequeña de audio sintetizado. Su razón de ser NÚMERO UNO es que el
 * pipeline pide el mismo trozo más de una vez (el trozo 0 se sintetiza para
 * comprobar el motor y para reproducirlo, y la ruta del mixer y la clásica
 * comparten proveedor): sin caché eso eran 2-3 viajes de red idénticos por
 * mensaje, y el usuario los notaba TODOS en el tiempo hasta el primer sonido.
 * Como beneficio extra, volver a escuchar un mensaje reciente es instantáneo.
 *
 * Se guardan PROMESAS: dos peticiones simultáneas del mismo trozo comparten el
 * viaje. Un fallo (null) NO se cachea — el siguiente intento vuelve a probar.
 */
const MAX_ENTRIES = 16;
const cache = new Map<string, Promise<Blob | null>>();

/** Clave de caché de un trozo: identidad congelada + texto exacto. */
export function synthCacheKey(fingerprint: string, text: string): string {
  return `${fingerprint}::${identityHash((text || "").replace(/\s+/g, " ").trim())}::${text.length}`;
}

/**
 * Sintetiza `key` una sola vez: si ya hay un viaje en curso o un resultado
 * bueno, lo reutiliza. Nunca lanza (los fallos se propagan como null).
 */
export function cachedSynthesis(
  key: string,
  factory: () => Promise<Blob | null>,
): Promise<Blob | null> {
  const hit = cache.get(key);
  if (hit) {
    // LRU: refrescar posición.
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const job = Promise.resolve()
    .then(factory)
    .catch(() => null)
    .then((blob) => {
      // Un fallo no se queda pegado en la caché: el turno siguiente reintenta.
      if (!blob) cache.delete(key);
      return blob;
    });
  cache.set(key, job);
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return job;
}

/** Vacía la caché de síntesis (cambio de motor/voz o pruebas). Nunca lanza. */
export function clearSynthCache(): void {
  cache.clear();
}

/** Nº de entradas vivas en la caché (diagnóstico/tests). */
export function synthCacheSize(): number {
  return cache.size;
}
