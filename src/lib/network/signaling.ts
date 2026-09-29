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
import { uidActual } from "@/lib/consumo/usuario";
import { crearBucle, falloDe, MINUTO_MS, type BucleFondo, type FalloConsulta, type ResultadoVuelta } from "@/lib/network/bucle-fondo";
import { mergeUserPrefs } from "@/lib/sync/user-prefs";

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
/**
 * Cadencia de polling del fallback MIENTRAS SE NEGOCIA (ms).
 * (2026-09-29 · contrato «consumo») Antes: cada 2,5 s toda la vida de la suscripción. Ahora
 * rápido solo 2 min desde que se abre, se envía o llega una señal; fuera de eso cada 5 min;
 * nada con el dispositivo oculto; freno, espera ante fallos y parada ante 400/404.
 */
const POLL_INTERVAL_MS = 2_500;
const VENTANA_NEGOCIACION_MS = 2 * MINUTO_MS;
const POLL_EN_REPOSO_MS = 5 * MINUTO_MS;
/** Última actividad de señalización de este dispositivo (abre la ventana rápida). */
let negociandoHasta = 0;
const buclesRespaldo = new Set<BucleFondo>();
function marcarNegociacion(): void {
  negociandoHasta = Date.now() + VENTANA_NEGOCIACION_MS;
  for (const b of buclesRespaldo) b.adelantar();
}
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
  // Sin red (antes `getUser()` = /auth/v1/user en cada señal enviada).
  try {
    return await uidActual();
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

/**
 * Promesas de creación EN VUELO por userId (fix Ola 366 · malla de neuronas).
 * ---------------------------------------------------------------------------
 * ANTES: `ensureRealtimeHub` comprobaba `realtimeHubs.get(userId)` de forma
 * SÍNCRONA al principio, pero no volvía a escribir en `realtimeHubs` hasta
 * DESPUÉS de un `await channel.subscribe(...)`. Dos llamadas concurrentes para
 * el MISMO userId (p. ej. la malla global montándose a la vez que un panel de
 * `/servidores`, o dos pestañas del mismo `initMesh`) pasaban ambas la
 * comprobación con `existing === undefined`, así que las DOS creaban un canal
 * Supabase con el MISMO nombre (`starseed-signal-<uid>`). El segundo
 * `channel.subscribe()` sobre un topic ya en uso solía no llegar nunca a
 * `SUBSCRIBED` → expiraba a los 4 s (`done(false)`) y esa segunda llamada
 * ejecutaba `client.removeChannel(channel)` — pero el cliente Supabase indexa
 * los canales por NOMBRE, así que ese `removeChannel` podía tirar abajo el
 * canal (y su listener) que la PRIMERA llamada sí había dejado `SUBSCRIBED`,
 * dejando la señalización sorda hasta el siguiente ciclo de reintento.
 *
 * Con este mapa, la segunda llamada (y cualquier otra mientras la primera
 * sigue en vuelo) espera la MISMA promesa en vez de abrir un segundo canal.
 */
const hubPromises = new Map<string, Promise<RealtimeHub | null>>();

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

  // Memoización de la creación EN VUELO (ver el comentario de `hubPromises`):
  // una segunda llamada concurrente espera la MISMA promesa en vez de abrir
  // un segundo canal Realtime con el mismo nombre.
  const inFlight = hubPromises.get(userId);
  if (inFlight) return inFlight;

  const attempt = createRealtimeHub(userId).finally(() => {
    // Solo limpiamos SI seguimos siendo el intento vigente (una limpieza tardía
    // de un intento ya reemplazado no debe borrar el nuevo en vuelo).
    if (hubPromises.get(userId) === attempt) hubPromises.delete(userId);
  });
  hubPromises.set(userId, attempt);
  return attempt;
}

/** Creación real del hub (extraída para poder memoizarla mientras está en vuelo). */
async function createRealtimeHub(userId: string): Promise<RealtimeHub | null> {
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

/**
 * Lee SOLO `prefs.signals` de la cuenta (ruta JSON de PostgREST). Antes se bajaba la columna
 * `prefs` entera —todas las preferencias sincronizadas de la cuenta— cada 2,5 s.
 */
async function leerColaCruda(userId: string): Promise<{ raw: unknown; fallo: FalloConsulta | null }> {
  try {
    const supabase = createClient();
    const res = await supabase
      .from("user_settings")
      .select(`cola:prefs->${PREFS_SIGNALS_KEY}`)
      .eq("user_id", userId)
      .maybeSingle();
    const fallo = falloDe(res as { error?: unknown; status?: number });
    if (fallo) return { raw: null, fallo };
    return { raw: (res.data as { cola?: unknown } | null)?.cola ?? null, fallo: null };
  } catch (e) {
    return { raw: null, fallo: { message: e instanceof Error ? e.message : "sin red" } };
  }
}

/** Lee la cola de señales de la cuenta (o [] defensivo) y el fallo de la consulta. */
async function fetchSignalQueue(userId: string): Promise<{ cola: Signal[]; fallo: FalloConsulta | null }> {
  const { raw, fallo } = await leerColaCruda(userId);
  return { cola: fallo ? [] : parseSignalQueue(raw), fallo };
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
    // Lectura SOLO de nuestra cola (no de la columna entera para reescribirla:
    // ese patrón borraba las claves de los demás módulos — Adenda 69 · A).
    const { raw } = await leerColaCruda(userId);
    const current = parseSignalQueue(raw);
    let next = mutate(current);
    // Poda por TTL + tope de tamaño (nos quedamos con las más recientes).
    const now = Date.now();
    next = next.filter((s) => now - s.at <= SIGNAL_TTL_MS);
    if (next.length > MAX_SIGNALS) next = next.slice(next.length - MAX_SIGNALS);

    // Escritura NO destructiva: solo nuestra clave, fusionada atómicamente.
    const res = await mergeUserPrefs({ [PREFS_SIGNALS_KEY]: next }, { userId });
    return res.ok;
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
    marcarNegociacion(); // enviar = negociar: la respuesta llegará pronto

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

  const tick = async (): Promise<ResultadoVuelta> => {
    if (stopped) return {};
    try {
      const { cola: queue, fallo } = await fetchSignalQueue(userId);
      if (fallo) return { fallo };
      const mine = queue.filter((s) => s.to === self && s.from !== self && !consumedNonces.has(s.nonce));
      if (mine.length > 0) {
        marcarNegociacion();
        for (const s of mine) {
          consumedNonces.add(s.nonce);
          deliver(s);
        }
        // Consumir: eliminar de la cuenta las señales ya entregadas a mí.
        const toRemove = new Set(mine.map((s) => s.nonce));
        await updateSignalQueue(userId, (current) => current.filter((s) => !toRemove.has(s.nonce)));
      }
    } catch (e) {
      return { fallo: { message: e instanceof Error ? e.message : "sin red" } };
    }
    return { siguienteMs: Date.now() < negociandoHasta ? POLL_INTERVAL_MS : POLL_EN_REPOSO_MS };
  };

  // Suscribirse ES el inicio de una negociación: primera pasada inmediata y rápido 2 min.
  negociandoHasta = Math.max(negociandoHasta, Date.now() + VENTANA_NEGOCIACION_MS);
  const bucle = crearBucle({
    nombre: "señalización de la cuenta · buzón de respaldo",
    consulta: "select user_settings.prefs->signals",
    intervaloMs: POLL_INTERVAL_MS,
    // El mesh de la cuenta vive en cada pestaña; oculta no sondea (bucle-fondo).
    soloLider: false,
    tarea: tick,
  });
  buclesRespaldo.add(bucle);
  bucle.iniciar();

  return {
    transport: "polling",
    unsubscribe: () => {
      if (stopped) return;
      stopped = true;
      bucle.detener();
      buclesRespaldo.delete(bucle);
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
