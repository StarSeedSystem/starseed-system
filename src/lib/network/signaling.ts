"use client";

/*
 * signaling — BUZÓN de señalización WebRTC VÍA LA CUENTA (Supabase).
 * ---------------------------------------------------------------------------
 * QUÉ ES:
 *   El canal por el que dos dispositivos de la MISMA cuenta intercambian los
 *   metadatos de negociación WebRTC (oferta/respuesta SDP + candidatos ICE) SIN
 *   servidor de señalización de terceros: la propia cuenta soberana hace de
 *   buzón. No transporta datos de usuario — sólo el "handshake" para abrir el
 *   canal P2P directo (ese transporte real vive en `webrtc-mesh.ts`).
 *
 * DOS TRANSPORTES (con degradación honesta):
 *   1) PREFERIDO — Supabase Realtime (broadcast): un canal efímero por usuario
 *      `starseed-signal-<userId>` con evento `signal`. Baja latencia, sin tocar
 *      la base de datos. RLS/entorno: si Realtime no está disponible (dummy
 *      keys, sin red, self-host sin realtime) NO rompe: caemos al fallback.
 *   2) FALLBACK — polling de `user_settings.prefs.signals[]` (jsonb). Cada
 *      dispositivo AÑADE su señal (merge no destructivo) y LEE las dirigidas a
 *      él; se limpian por TTL. Más lento pero funciona con sólo la tabla.
 *
 * Alineado con CLAUDE.md:
 *   - Identidad Soberana: la CUENTA es el canal (no un tercero).
 *   - Defensivo / SSR-safe: sin sesión → no-op; nunca lanza.
 *   - Merge no destructivo sobre `prefs` (nunca pisa devices/dashboards/…).
 *
 * API pública:
 *   sendSignal(sig)            → Promise<boolean>  (true si se pudo emitir)
 *   subscribeSignals(userId, self, cb) → Promise<SignalSubscription>
 *   type Signal, SignalSubscription
 */

import { createClient } from "@/utils/supabase/client";

/* ------------------------------------------------------------------ */
/* Tipos del contrato                                                */
/* ------------------------------------------------------------------ */

/** Tipo de señal WebRTC intercambiada por la cuenta. */
export type SignalKind = "offer" | "answer" | "ice" | "bye";

/**
 * Signal — un mensaje de señalización dirigido de un dispositivo a otro
 * (ambos de la MISMA cuenta). Sólo metadatos de negociación, nunca datos.
 */
export interface Signal {
  /** Id del dispositivo emisor. */
  from: string;
  /** Id del dispositivo destino. */
  to: string;
  /** Naturaleza de la señal. */
  kind: SignalKind;
  /** SDP serializado (para 'offer' | 'answer'). */
  sdp?: string;
  /** Candidato ICE serializado (para 'ice'). */
  candidate?: RTCIceCandidateInit | null;
  /** Marca temporal (epoch ms) para orden y TTL. */
  at: number;
  /** Nonce corto para deduplicar reenvíos. */
  nonce: string;
}

/** Handle para cortar la suscripción (idempotente). */
export interface SignalSubscription {
  /** Transporte activo: realtime (broadcast) o polling (tabla). */
  transport: "realtime" | "polling" | "none";
  /** Cierra la suscripción y libera recursos. Nunca lanza. */
  unsubscribe: () => void;
}

/* ------------------------------------------------------------------ */
/* Constantes                                                        */
/* ------------------------------------------------------------------ */

/** Clave dentro de `prefs` donde vive la cola de señales (fallback). */
const PREFS_SIGNALS_KEY = "signals";
/** Nombre del evento de broadcast en el canal Realtime. */
const BROADCAST_EVENT = "signal";
/** TTL de una señal en el fallback (ms). Más allá se descarta/limpia. */
const SIGNAL_TTL_MS = 60_000;
/** Cadencia de polling del fallback (ms). */
const POLL_INTERVAL_MS = 2_500;
/** Tope de señales retenidas en la cola (evita crecimiento ilimitado). */
const MAX_SIGNALS = 60;

/* ------------------------------------------------------------------ */
/* Helpers                                                           */
/* ------------------------------------------------------------------ */

function isClient(): boolean {
  return typeof window !== "undefined";
}

/** Nombre del canal Realtime de señalización para un usuario. */
function channelName(userId: string): string {
  return `starseed-signal-${userId}`;
}

/** Nonce corto y razonable (con fallback si crypto no está). */
function makeNonce(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID().slice(0, 8);
    }
  } catch {
    /* noop */
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Normaliza un objeto arbitrario a Signal (o null si no es válido). */
function normalizeSignal(x: unknown): Signal | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.from !== "string" || !o.from) return null;
  if (typeof o.to !== "string" || !o.to) return null;
  const kind = o.kind;
  if (kind !== "offer" && kind !== "answer" && kind !== "ice" && kind !== "bye") return null;
  return {
    from: o.from,
    to: o.to,
    kind,
    sdp: typeof o.sdp === "string" ? o.sdp : undefined,
    candidate:
      o.candidate && typeof o.candidate === "object"
        ? (o.candidate as RTCIceCandidateInit)
        : o.candidate === null
          ? null
          : undefined,
    at: typeof o.at === "number" ? o.at : Date.now(),
    nonce: typeof o.nonce === "string" && o.nonce ? o.nonce : makeNonce(),
  };
}

async function getUserId(): Promise<string | null> {
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Estado interno del transporte Realtime (compartido por usuario)   */
/* ------------------------------------------------------------------ */

type BroadcastChannel = ReturnType<ReturnType<typeof createClient>["channel"]>;

interface RealtimeHub {
  userId: string;
  client: ReturnType<typeof createClient>;
  channel: BroadcastChannel;
  /** Suscriptores locales (mismo dispositivo, varias capas). */
  listeners: Set<(sig: Signal) => void>;
  /** true cuando el canal está SUBSCRIBED (se puede emitir). */
  ready: boolean;
  /** Nonces ya vistos (dedup). */
  seen: Set<string>;
}

/**
 * Reutilizamos un único canal Realtime por userId para no abrir N canales si
 * varias capas se suscriben. Se cierra cuando no quedan listeners.
 */
const realtimeHubs = new Map<string, RealtimeHub>();

/** Recorta el set de nonces vistos para que no crezca sin límite. */
function trimSeen(seen: Set<string>): void {
  if (seen.size <= 256) return;
  // Elimina ~la mitad más antigua (orden de inserción de Set).
  let toDrop = seen.size - 128;
  for (const n of seen) {
    seen.delete(n);
    if (--toDrop <= 0) break;
  }
}

/**
 * Obtiene (o crea) el hub Realtime del usuario. Devuelve null si Realtime no se
 * puede establecer (se usará el fallback de polling). Nunca lanza.
 */
async function ensureRealtimeHub(userId: string): Promise<RealtimeHub | null> {
  const existing = realtimeHubs.get(userId);
  if (existing) return existing;

  try {
    const client = createClient();
    const channel = client.channel(channelName(userId), {
      config: { broadcast: { self: false } },
    });

    const hub: RealtimeHub = {
      userId,
      client,
      channel,
      listeners: new Set(),
      ready: false,
      seen: new Set(),
    };

    channel.on("broadcast", { event: BROADCAST_EVENT }, (msg: { payload?: unknown }) => {
      const sig = normalizeSignal(msg?.payload);
      if (!sig) return;
      if (hub.seen.has(sig.nonce)) return;
      hub.seen.add(sig.nonce);
      trimSeen(hub.seen);
      for (const l of hub.listeners) {
        try {
          l(sig);
        } catch {
          /* un listener que lanza no debe tumbar a los demás */
        }
      }
    });

    // Suscripción con resultado; si nunca llega SUBSCRIBED, el emisor detecta
    // `ready=false` y usa el fallback. Es defensivo por diseño.
    const subscribed = await new Promise<boolean>((resolve) => {
      let settled = false;
      const done = (v: boolean) => {
        if (settled) return;
        settled = true;
        resolve(v);
      };
      // Salvaguarda temporal: no bloquear más de ~4s esperando el canal.
      const timer = setTimeout(() => done(false), 4000);
      try {
        channel.subscribe((status) => {
          const s = String(status);
          if (s === "SUBSCRIBED") {
            hub.ready = true;
            clearTimeout(timer);
            done(true);
          } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") {
            clearTimeout(timer);
            done(false);
          }
        });
      } catch {
        clearTimeout(timer);
        done(false);
      }
    });

    if (!subscribed) {
      // No pudimos abrir Realtime: limpiamos y devolvemos null (→ fallback).
      try {
        client.removeChannel(channel);
      } catch {
        /* noop */
      }
      return null;
    }

    realtimeHubs.set(userId, hub);
    return hub;
  } catch {
    return null;
  }
}

/** Cierra el hub Realtime del usuario si ya no tiene listeners. */
function maybeCloseRealtimeHub(userId: string): void {
  const hub = realtimeHubs.get(userId);
  if (!hub) return;
  if (hub.listeners.size > 0) return;
  try {
    hub.client.removeChannel(hub.channel);
  } catch {
    /* noop */
  }
  realtimeHubs.delete(userId);
}

/* ------------------------------------------------------------------ */
/* Fallback: cola de señales en prefs.signals[]                      */
/* ------------------------------------------------------------------ */

function parseSignalQueue(raw: unknown): Signal[] {
  if (!Array.isArray(raw)) return [];
  const now = Date.now();
  const out: Signal[] = [];
  for (const item of raw) {
    const s = normalizeSignal(item);
    if (s && now - s.at <= SIGNAL_TTL_MS) out.push(s);
  }
  return out;
}

/** Lee la cola de señales de la cuenta (o [] defensivo). */
async function fetchSignalQueue(userId: string): Promise<Signal[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("user_settings")
      .select("prefs")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data?.prefs || typeof data.prefs !== "object") return [];
    const prefs = data.prefs as Record<string, unknown>;
    return parseSignalQueue(prefs[PREFS_SIGNALS_KEY]);
  } catch {
    return [];
  }
}

/**
 * Escribe la cola de señales con MERGE NO DESTRUCTIVO del resto de `prefs`.
 * `mutate` recibe la cola actual (ya expirada-limpia) y devuelve la nueva.
 * Best-effort: nunca rompe.
 */
async function updateSignalQueue(
  userId: string,
  mutate: (current: Signal[]) => Signal[],
): Promise<boolean> {
  try {
    const supabase = createClient();
    let prefs: Record<string, unknown> = {};
    try {
      const { data } = await supabase
        .from("user_settings")
        .select("prefs")
        .eq("user_id", userId)
        .maybeSingle();
      if (data?.prefs && typeof data.prefs === "object") {
        prefs = { ...(data.prefs as Record<string, unknown>) };
      }
    } catch {
      /* mezclamos sobre objeto vacío si no se pudo leer */
    }

    const current = parseSignalQueue(prefs[PREFS_SIGNALS_KEY]);
    let next = mutate(current);
    // Poda por TTL + tope de tamaño (nos quedamos con las más recientes).
    const now = Date.now();
    next = next.filter((s) => now - s.at <= SIGNAL_TTL_MS);
    if (next.length > MAX_SIGNALS) next = next.slice(next.length - MAX_SIGNALS);
    prefs[PREFS_SIGNALS_KEY] = next;

    await supabase
      .from("user_settings")
      .upsert(
        { user_id: userId, prefs, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* API pública                                                       */
/* ------------------------------------------------------------------ */

/**
 * sendSignal — emite una señal hacia otro dispositivo de la MISMA cuenta.
 *  1) Intenta por Realtime (broadcast) si el hub del usuario está listo.
 *  2) Si no, cae al fallback (append en `prefs.signals[]`).
 * Rellena `at`/`nonce` si faltan. Devuelve true si se pudo emitir por algún
 * transporte. NUNCA lanza.
 */
export async function sendSignal(sig: Signal): Promise<boolean> {
  if (!isClient()) return false;
  try {
    if (!sig || typeof sig.from !== "string" || typeof sig.to !== "string") return false;

    const userId = await getUserId();
    if (!userId) return false; // sin sesión: no-op honesto

    const payload: Signal = {
      ...sig,
      at: typeof sig.at === "number" ? sig.at : Date.now(),
      nonce: sig.nonce || makeNonce(),
    };

    // 1) Realtime primero (si hay hub listo o se puede crear).
    const hub = realtimeHubs.get(userId) ?? (await ensureRealtimeHub(userId));
    if (hub && hub.ready) {
      try {
        const res = await hub.channel.send({
          type: "broadcast",
          event: BROADCAST_EVENT,
          payload,
        });
        // El SDK devuelve 'ok' | 'timed out' | 'error' (string).
        if (String(res) === "ok") return true;
      } catch {
        /* caemos al fallback */
      }
    }

    // 2) Fallback: encolar en la cuenta.
    return await updateSignalQueue(userId, (current) => {
      // Evita duplicar por nonce.
      if (current.some((s) => s.nonce === payload.nonce)) return current;
      return [...current, payload];
    });
  } catch {
    return false;
  }
}

/**
 * subscribeSignals — escucha las señales dirigidas a ESTE dispositivo (`self`).
 *  - Preferido: Realtime broadcast (el hub filtra por `to === self`).
 *  - Fallback: polling de `prefs.signals[]`, entregando y CONSUMIENDO (borrando)
 *    las dirigidas a `self` para no reprocesarlas.
 * Devuelve un handle con `unsubscribe()`. NUNCA lanza; si no hay sesión o
 * entorno, devuelve un handle inerte (`transport: 'none'`).
 */
export async function subscribeSignals(
  userId: string,
  self: string,
  cb: (sig: Signal) => void,
): Promise<SignalSubscription> {
  const inert: SignalSubscription = { transport: "none", unsubscribe: () => {} };
  if (!isClient() || !userId || !self) return inert;

  // Filtro: sólo señales dirigidas a mí y no emitidas por mí.
  const deliver = (sig: Signal) => {
    if (sig.to !== self || sig.from === self) return;
    try {
      cb(sig);
    } catch {
      /* noop */
    }
  };

  // --- Intento Realtime ---
  const hub = await ensureRealtimeHub(userId);
  if (hub) {
    hub.listeners.add(deliver);
    let closed = false;
    return {
      transport: "realtime",
      unsubscribe: () => {
        if (closed) return;
        closed = true;
        hub.listeners.delete(deliver);
        maybeCloseRealtimeHub(userId);
      },
    };
  }

  // --- Fallback: polling con consumo de las señales propias ---
  const consumedNonces = new Set<string>();
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    try {
      const queue = await fetchSignalQueue(userId);
      const mine = queue.filter((s) => s.to === self && s.from !== self && !consumedNonces.has(s.nonce));
      if (mine.length > 0) {
        for (const s of mine) {
          consumedNonces.add(s.nonce);
          deliver(s);
        }
        // Consumir: eliminar de la cuenta las señales ya entregadas a mí.
        const toRemove = new Set(mine.map((s) => s.nonce));
        await updateSignalQueue(userId, (current) => current.filter((s) => !toRemove.has(s.nonce)));
      }
    } catch {
      /* silencioso: reintentamos en el siguiente tick */
    }
  };

  const timer = setInterval(() => void tick(), POLL_INTERVAL_MS);
  void tick(); // primera pasada inmediata

  return {
    transport: "polling",
    unsubscribe: () => {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Diagnóstico ligero (para UI honesta)                              */
/* ------------------------------------------------------------------ */

/**
 * probeSignalingTransport — indica, sin efectos permanentes, qué transporte se
 * usaría AHORA (realtime si el hub abre; polling si sólo hay tabla; none sin
 * sesión). Útil para mostrar en la UI. Best-effort; no deja canales colgados si
 * no había ninguno abierto.
 */
export async function probeSignalingTransport(): Promise<"realtime" | "polling" | "none"> {
  if (!isClient()) return "none";
  const userId = await getUserId();
  if (!userId) return "none";
  const hadHub = realtimeHubs.has(userId);
  const hub = await ensureRealtimeHub(userId);
  if (hub) {
    // Si nosotros lo abrimos sólo para la prueba y nadie lo usa, ciérralo.
    if (!hadHub && hub.listeners.size === 0) maybeCloseRealtimeHub(userId);
    return hadHub || hub.listeners.size > 0 ? "realtime" : "realtime";
  }
  return "polling";
}
