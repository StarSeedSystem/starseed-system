/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ASTRAURA 1.58-BIT — transporte WebSocket persistente (Adenda 164)
 * ---------------------------------------------------------------------------
 * Cliente WS para `/ws/chat` del backend soberano: una alternativa de MENOR
 * LATENCIA al POST+SSE por turno que usa `astraura-158.ts` (sin handshake
 * HTTP en cada mensaje). Es una MEJORA opcional con reserva honesta — la
 * decide y orquesta `attemptAstraura158WsTurn` en `astraura-158.ts` — nunca
 * un requisito para que el chat funcione: si este módulo no logra conectar,
 * el proveedor sigue funcionando exactamente como antes de esta adenda.
 *
 * Protocolo verificado (`app/main.py:3125` del backend `astraura`, citado en
 * la adenda anterior, Adenda 163):
 *   Cliente → servidor (JSON por el socket):
 *     {"type":"user_message","prompt":"…","system_prompt":"…","preferences":{…}}
 *     {"type":"ping"}
 *   Servidor → cliente: al conectar, un `init_state`; por cada `user_message`,
 *     el MISMO flujo que ya emite el SSE clásico (`agent_traces`,
 *     `branching_plan`, `multi_personality_start`, `token{token}`,
 *     `done{full_text}`), más `learning_event` / `dream_cycle_event` /
 *     `imagination_insight_event`; `pong` en respuesta a cada `ping`.
 *   El backend atiende UN TURNO EN VUELO a la vez (igual que el
 *   `ChatWebSocketClient` del programa original: no hay id de turno en los
 *   eventos). Este módulo asume esa misma disciplina del lado del cliente —
 *   exactamente como ya se comporta el resto del OS (se espera la respuesta
 *   completa, o el error, antes de enviar el siguiente `user_message`).
 *   No existe mensaje de cancelación en el protocolo — ver el comentario
 *   junto al `AbortSignal` en `attemptAstraura158WsTurn` (`astraura-158.ts`).
 *
 * ESTE MÓDULO ES SOLO TRANSPORTE: abre/mantiene/reconecta el socket y
 * reenvía los eventos JSON crudos vía `onEvent`. No interpreta `token` /
 * `done` / `error` como casos especiales — de eso ya sabe `astraura-158.ts`
 * (mismo tipo `Astraura158Event` que usa el lector SSE). La única excepción
 * es `pong`, que es un detalle interno del latido y nunca llega a `onEvent`.
 *
 * SSR-safe (requisito de la adenda): el identificador `WebSocket` —el
 * CONSTRUCTOR/valor global, no el TIPO: los tipos de `lib.dom.d.ts` se borran
 * al compilar y son seguros de nombrar en cualquier sitio, incluida la firma
 * de `ManagedConnection` más abajo— solo se lee dentro de funciones, y
 * siempre tras comprobar `typeof window`. Nada se conecta al importar este
 * fichero ni hay estado de red a nivel de módulo (solo un `Map` en memoria).
 *
 * CONEXIÓN COMPARTIDA (requisito 1): un registro `Map<baseUrl, conexión>` a
 * nivel de módulo. `getAstraura158Ws` para un `baseUrl` ya registrado NO abre
 * un socket nuevo: reutiliza el existente y solo REBINDEA los callbacks
 * (`onEvent`/`onOpen`/`onClose`) al llamante más reciente. Eso es correcto
 * — y barato — precisamente porque, por el punto anterior, solo hay un turno
 * en vuelo a la vez: "el último que llama" es siempre el turno activo ahora.
 *
 * RECONEXIÓN (requisito 2): backoff exponencial con jitter
 * (`astraura158WsBackoffDelay`, función pura y testeable — ver el porqué del
 * jitter "equal" junto a su definición) y un máximo de intentos
 * (`ASTRAURA_158_WS_RECONNECT_MAX_ATTEMPTS`). Al agotarse, se avisa por
 * `onClose` con el motivo y se deja de reintentar — la entrada se borra del
 * registro, así que la SIGUIENTE llamada a `getAstraura158Ws` (el siguiente
 * turno) empieza de cero, con su propio ciclo de intentos. El original
 * reintentaba cada 3 s fijos y sin límite: eso martillea un backend caído a
 * ritmo constante para siempre; aquí se le da margen a recuperarse y, si no
 * lo hace, se deja de insistir.
 *
 * LATIDO (requisito 3): un `ping` cada `ASTRAURA_158_WS_HEARTBEAT_INTERVAL_MS`
 * una vez abierto el socket. Si no llega `pong` en
 * `ASTRAURA_158_WS_HEARTBEAT_TIMEOUT_MS`, se fuerza `socket.close()` — eso
 * dispara el MISMO `onclose` que una caída real, así que la reconexión con
 * backoff se encarga sin lógica duplicada.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { Astraura158Event } from "./astraura-158";

/* ───────────────────── Contrato público ───────────────────── */

export interface Astraura158WsOptions {
  /** Endpoint http(s) del backend (se convierte a ws(s) + `/ws/chat`). */
  baseUrl: string;
  /** Cada evento JSON recibido del socket (salvo `pong`, interno del latido). */
  onEvent: (ev: Astraura158Event) => void;
  /** El socket quedó abierto y listo para `send`. */
  onOpen?: () => void;
  /**
   * El socket se cerró — por caída real, por agotar los reintentos, o porque
   * se llamó a `close()`. `reason` es un motivo LEGIBLE (no un código de
   * protocolo) pensado para logging/diagnóstico, no para bifurcar lógica.
   */
  onClose?: (reason: string) => void;
}

export interface Astraura158Ws {
  /** Intenta enviar `user_message`. `false` si el socket no está abierto AHORA. */
  send(msg: { prompt: string; system_prompt?: string; preferences?: Record<string, unknown> }): boolean;
  /**
   * Cierra la conexión COMPARTIDA y detiene la reconexión automática. No lo
   * llames al terminar un turno normal — la conexión debe persistir entre
   * turnos (requisito 1); esto es para un cierre deliberado (p.ej. limpieza
   * de la app o cambio de backend).
   */
  close(): void;
  /** `true` solo si el socket está abierto AHORA MISMO (listo para `send`). */
  readonly ready: boolean;
}

/* ───────────────────── Ajustes (exportados: reutilizables en tests) ───────────────────── */

export const ASTRAURA_158_WS_PATH = "/ws/chat";
/** Retardo base del backoff (intento 1). */
export const ASTRAURA_158_WS_RECONNECT_BASE_MS = 1000;
/** Tope del backoff — no esperes más de esto entre reintentos. */
export const ASTRAURA_158_WS_RECONNECT_MAX_MS = 20000;
/** Intentos antes de rendirse (ver cabecera del fichero: "reconexión abandonada"). */
export const ASTRAURA_158_WS_RECONNECT_MAX_ATTEMPTS = 6;
/** Cada cuánto se envía `{"type":"ping"}` con el socket abierto. */
export const ASTRAURA_158_WS_HEARTBEAT_INTERVAL_MS = 20000;
/** Si no llega `pong` en este plazo tras un `ping`, el socket se da por zombi. */
export const ASTRAURA_158_WS_HEARTBEAT_TIMEOUT_MS = 8000;
/** Plazo por defecto que `astraura-158.ts` espera antes de caer a la reserva SSE. */
export const ASTRAURA_158_WS_READY_TIMEOUT_MS = 1500;

/**
 * Retardo (ms) antes del intento de reconexión número `attempt` (1-indexado).
 * Exponencial con TOPE en `ASTRAURA_158_WS_RECONNECT_MAX_MS`, con jitter
 * "equal" (mitad fija de la cota + mitad aleatoria) en vez de "full jitter"
 * (aleatorio entre 0 y la cota): con equal-jitter, el retardo MÍNIMO posible
 * del intento N (`cota(N)/2`) es siempre ≥ el MÁXIMO posible del intento N-1
 * (`cota(N-1)`, porque la cota se dobla cada intento) — así el backoff CRECE
 * de forma comprobable pase lo que pase con el azar, y se puede testear sin
 * mockear `Math.random` globalmente (basta pasar `rand`). Sigue habiendo
 * aleatoriedad real (evita que muchas pestañas reconecten en el mismo
 * instante tras una caída del backend — "efecto manada").
 *
 * PORQUÉ no es fijo: el original reintentaba cada 3 s, siempre, sin límite.
 * Un backoff fijo martillea un backend caído al mismo ritmo para siempre —
 * justo lo contrario de lo que conviene cuando ya se sabe que está caído.
 * Crecer (y, más abajo, tener un máximo de intentos) le da margen al backend
 * para recuperarse sin que el cliente lo bombardee mientras tanto.
 *
 * `rand` es inyectable (por defecto `Math.random()`) para tests deterministas.
 */
export function astraura158WsBackoffDelay(attempt: number, rand: number = Math.random()): number {
  const n = Math.max(1, Math.floor(attempt) || 1);
  const cap = Math.min(ASTRAURA_158_WS_RECONNECT_BASE_MS * 2 ** (n - 1), ASTRAURA_158_WS_RECONNECT_MAX_MS);
  const half = cap / 2;
  const r = Math.min(Math.max(rand, 0), 1);
  return half + r * half;
}

/* ───────────────────── Estado interno (module-scope; nada de red aquí) ───────────────────── */

type Astraura158WsState = "connecting" | "open" | "closed";

interface ManagedConnection {
  key: string;
  wsUrl: string;
  /**
   * `WebSocket` aparece aquí como TIPO (se borra al compilar) — no es el
   * valor/constructor prohibido a nivel de módulo por el requisito SSR. El
   * campo empieza en `null` y solo se asigna dentro de `connectSocket`,
   * que a su vez solo se invoca tras comprobar `window`/`WebSocket` reales.
   */
  socket: WebSocket | null;
  state: Astraura158WsState;
  /** Intentos de reconexión fallidos en el ciclo ACTUAL (se resetea al abrir). */
  attempts: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  heartbeatTimer: ReturnType<typeof setInterval> | null;
  pongDeadline: ReturnType<typeof setTimeout> | null;
  /** `true` solo tras un `close()` explícito del llamante: no reconectar. */
  explicitlyClosed: boolean;
  onEvent: (ev: Astraura158Event) => void;
  onOpen?: () => void;
  onClose?: (reason: string) => void;
}

/** Una conexión por `baseUrl`, reutilizada entre turnos (requisito 1). */
const registry = new Map<string, ManagedConnection>();

function trimBase(baseUrl: string): string {
  return String(baseUrl ?? "").trim().replace(/\/+$/, "");
}

/** http(s) → ws(s), + `/ws/chat`. Admite bases relativas (proxy same-origin). */
function toWsUrl(base: string): string {
  // Solo se llama ya dentro de la guardia `typeof window` de `getAstraura158Ws`.
  const abs = /^https?:\/\//i.test(base) ? base : new URL(base, window.location.origin).toString();
  return `${abs.replace(/^http/i, "ws").replace(/\/+$/, "")}${ASTRAURA_158_WS_PATH}`;
}

/** JSON con `type` string válido; cualquier otra cosa (roto, sin `type`…) → null. */
function safeParseEvent(data: unknown): Astraura158Event | null {
  if (typeof data !== "string") return null;
  try {
    const obj = JSON.parse(data) as unknown;
    if (!obj || typeof obj !== "object") return null;
    const ev = obj as Astraura158Event;
    return typeof ev.type === "string" ? ev : null;
  } catch {
    return null;
  }
}

function stopHeartbeat(conn: ManagedConnection): void {
  if (conn.heartbeatTimer) clearInterval(conn.heartbeatTimer);
  if (conn.pongDeadline) clearTimeout(conn.pongDeadline);
  conn.heartbeatTimer = null;
  conn.pongDeadline = null;
}

function startHeartbeat(conn: ManagedConnection): void {
  stopHeartbeat(conn);
  conn.heartbeatTimer = setInterval(() => {
    if (!conn.socket || conn.state !== "open") return;
    try {
      conn.socket.send(JSON.stringify({ type: "ping" }));
    } catch {
      return; // el próximo `close` (si lo hay) reconectará por su cuenta.
    }
    if (conn.pongDeadline) clearTimeout(conn.pongDeadline);
    conn.pongDeadline = setTimeout(() => {
      // Sin `pong` a tiempo ⇒ socket zombi. Forzar el cierre reutiliza el
      // MISMO camino de reconexión que una caída real (su `onclose`).
      conn.socket?.close();
    }, ASTRAURA_158_WS_HEARTBEAT_TIMEOUT_MS);
  }, ASTRAURA_158_WS_HEARTBEAT_INTERVAL_MS);
}

function scheduleReconnectOrGiveUp(conn: ManagedConnection, detail: string): void {
  conn.attempts += 1;
  if (conn.attempts > ASTRAURA_158_WS_RECONNECT_MAX_ATTEMPTS) {
    conn.state = "closed";
    registry.delete(conn.key);
    conn.onClose?.(`reconexión abandonada tras ${ASTRAURA_158_WS_RECONNECT_MAX_ATTEMPTS} intentos (${detail})`);
    return;
  }
  conn.state = "connecting";
  const delay = astraura158WsBackoffDelay(conn.attempts);
  conn.reconnectTimer = setTimeout(() => {
    conn.reconnectTimer = null;
    connectSocket(conn);
  }, delay);
  conn.onClose?.(
    `conexión perdida (${detail}) — reintentando en ${Math.round(delay)} ms ` +
      `(intento ${conn.attempts}/${ASTRAURA_158_WS_RECONNECT_MAX_ATTEMPTS})`,
  );
}

/** Abre (o reabre) el socket de `conn`. Solo se llama tras confirmar navegador+WebSocket. */
function connectSocket(conn: ManagedConnection): void {
  conn.state = "connecting";
  let socket: WebSocket;
  try {
    socket = new WebSocket(conn.wsUrl);
  } catch (e) {
    scheduleReconnectOrGiveUp(conn, `no se pudo crear el WebSocket (${String(e)})`);
    return;
  }
  conn.socket = socket;
  socket.onopen = () => {
    conn.state = "open";
    conn.attempts = 0; // éxito: el próximo ciclo de caídas vuelve a empezar en el intento 1.
    startHeartbeat(conn);
    conn.onOpen?.();
  };
  socket.onmessage = (ev) => {
    const parsed = safeParseEvent(ev.data);
    if (!parsed) return;
    if (parsed.type === "pong") {
      if (conn.pongDeadline) { clearTimeout(conn.pongDeadline); conn.pongDeadline = null; }
      return; // el `pong` es interno del latido: nunca llega a `onEvent`.
    }
    conn.onEvent(parsed);
  };
  socket.onerror = () => {
    // El `close` que sigue siempre trae el detalle útil (código/razón); no
    // duplicamos lógica de reconexión aquí también.
  };
  socket.onclose = (ev) => {
    stopHeartbeat(conn);
    conn.socket = null;
    if (conn.explicitlyClosed) {
      conn.state = "closed";
      registry.delete(conn.key);
      conn.onClose?.("cerrado por el cliente");
      return;
    }
    scheduleReconnectOrGiveUp(conn, `código ${ev.code}${ev.reason ? `: ${ev.reason}` : ""}`);
  };
}

/* ───────────────────── API pública ───────────────────── */

/**
 * Obtiene (creando si hace falta) la conexión WS compartida para `baseUrl`.
 * Nunca lanza: si no hay navegador o no hay soporte de WebSocket (SSR, o un
 * runtime sin él), devuelve un handle permanentemente `ready: false` cuyo
 * `send` siempre devuelve `false` — el llamante cae a la reserva SSE sin
 * ninguna rama especial para ese caso.
 */
export function getAstraura158Ws(opts: Astraura158WsOptions): Astraura158Ws {
  const key = trimBase(opts.baseUrl);
  const unavailable: Astraura158Ws = {
    send: () => false,
    close: () => {},
    get ready() {
      return false;
    },
  };
  // Guardia SSR (requisito 7): `WebSocket` —el valor global— se nombra por
  // primera vez AQUÍ, dentro de una función, y solo tras comprobar `window`.
  if (!key || typeof window === "undefined" || typeof WebSocket === "undefined") return unavailable;

  let conn = registry.get(key);
  if (!conn) {
    conn = {
      key,
      wsUrl: toWsUrl(key),
      socket: null,
      state: "connecting",
      attempts: 0,
      reconnectTimer: null,
      heartbeatTimer: null,
      pongDeadline: null,
      explicitlyClosed: false,
      onEvent: opts.onEvent,
      onOpen: opts.onOpen,
      onClose: opts.onClose,
    };
    registry.set(key, conn);
    connectSocket(conn);
  } else {
    // Requisito 1: NO se abre un socket nuevo — se REBINDEAN los callbacks
    // al llamante más reciente. Válido porque el backend atiende un turno a
    // la vez (ver cabecera): "el último que llama" es el turno activo ahora.
    conn.onEvent = opts.onEvent;
    conn.onOpen = opts.onOpen;
    conn.onClose = opts.onClose;
  }

  const c = conn;
  return {
    send(msg) {
      if (c.state !== "open" || !c.socket) return false;
      try {
        c.socket.send(JSON.stringify({ type: "user_message", ...msg }));
        return true;
      } catch {
        return false;
      }
    },
    close() {
      c.explicitlyClosed = true;
      if (c.reconnectTimer) {
        clearTimeout(c.reconnectTimer);
        c.reconnectTimer = null;
      }
      stopHeartbeat(c);
      if (c.socket) {
        c.socket.close(); // su `onclose` completa la limpieza (ver arriba).
      } else {
        // No hay socket vivo (p.ej. a mitad de un backoff): ningún `onclose`
        // va a llegar para limpiar por nosotros — lo hacemos aquí mismo.
        c.state = "closed";
        registry.delete(c.key);
        c.onClose?.("cerrado por el cliente");
      }
    },
    get ready() {
      return c.state === "open";
    },
  };
}
