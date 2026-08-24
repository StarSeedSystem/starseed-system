/**
 * Tests del transporte WebSocket de Astraura 1.58 (Adenda 164): conexión
 * compartida, backoff creciente, entrega de eventos, cancelación y la
 * reserva honesta hacia SSE. Con un DOBLE de `WebSocket` en memoria — nada
 * de red real. Sigue el estilo de `astraura-158.test.ts` (describe/it,
 * imports directos con `@/…`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ASTRAURA_158_WS_READY_TIMEOUT_MS,
  ASTRAURA_158_WS_RECONNECT_MAX_ATTEMPTS,
  ASTRAURA_158_WS_RECONNECT_MAX_MS,
  astraura158WsBackoffDelay,
  getAstraura158Ws,
} from "@/ai/providers/astraura-158-ws";
import { attemptAstraura158WsTurn, type ChatPreferences } from "@/ai/providers/astraura-158";
import type { ChatOptions } from "@/ai/providers/types";

/* ───────────────────── Doble de WebSocket en memoria ───────────────────── */

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  url: string;
  sent: string[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((ev: { code: number; reason: string }) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    if (this.closed) throw new Error("send sobre un socket ya cerrado");
    this.sent.push(data);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.onclose?.({ code: 1000, reason: "" });
  }

  /** El servidor "acepta" la conexión. */
  serverOpen(): void {
    this.onopen?.();
  }

  /** El servidor manda un evento JSON por el socket. */
  serverMessage(obj: unknown): void {
    this.onmessage?.({ data: JSON.stringify(obj) });
  }

  /** La conexión cae (red, servidor caído…) sin que el cliente la cerrara. */
  serverFail(code = 1006, reason = "conexión perdida"): void {
    if (this.closed) return;
    this.closed = true;
    this.onclose?.({ code, reason });
  }
}

// Cada test usa una base ÚNICA: `getAstraura158Ws` guarda la conexión en un
// registro module-scope keyed por `baseUrl` que persiste ENTRE tests del
// mismo fichero (no hay `close()` automático) — con una base compartida, el
// segundo test heredaría la conexión (y el FakeWebSocket) del primero.
let baseUrlSeq = 0;
let BASE_URL = "";
const BASE_PREFS: ChatPreferences = {
  personaId: "aurora",
  selected_personalities: ["aurora"],
  multi_personality_mode: "single",
  response_style: "analytical",
  web_data_enabled: true,
  client: "starseed-os",
};

const realWindow = (globalThis as unknown as { window?: unknown }).window;
const realWebSocket = (globalThis as unknown as { WebSocket?: unknown }).WebSocket;

beforeEach(() => {
  FakeWebSocket.instances = [];
  baseUrlSeq += 1;
  BASE_URL = `http://127.0.0.1:8000/t${baseUrlSeq}`;
  // Simula "estamos en el navegador" para la guardia SSR (`typeof window`) y
  // sustituye el `WebSocket` global por el doble — ambos solo para este test.
  (globalThis as unknown as { window: unknown }).window = globalThis;
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = FakeWebSocket;
  vi.useFakeTimers();
});

afterEach(() => {
  (globalThis as unknown as { window?: unknown }).window = realWindow;
  (globalThis as unknown as { WebSocket?: unknown }).WebSocket = realWebSocket;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/* ───────────────────── astraura158WsBackoffDelay (pura) ───────────────────── */

describe("astraura158WsBackoffDelay", () => {
  it("crece de forma monótona con el intento — equal-jitter: mínimo(N) ≥ máximo(N-1)", () => {
    // rand=0 ⇒ el mínimo posible de cada intento (mitad de la cota, ver doc de la función).
    expect(astraura158WsBackoffDelay(1, 0)).toBe(500);
    expect(astraura158WsBackoffDelay(2, 0)).toBe(1000);
    expect(astraura158WsBackoffDelay(3, 0)).toBe(2000);
    expect(astraura158WsBackoffDelay(4, 0)).toBe(4000);
    // rand=1 ⇒ el máximo posible de cada intento (la cota entera).
    expect(astraura158WsBackoffDelay(1, 1)).toBe(1000);
    // Por diseño (no por suerte con el azar): el intento 2 nunca es menor que el 1.
    expect(astraura158WsBackoffDelay(2, 0)).toBeGreaterThanOrEqual(astraura158WsBackoffDelay(1, 1));
  });

  it("respeta el tope configurado (no crece sin límite)", () => {
    expect(astraura158WsBackoffDelay(10, 1)).toBe(ASTRAURA_158_WS_RECONNECT_MAX_MS);
    expect(astraura158WsBackoffDelay(10, 0)).toBe(ASTRAURA_158_WS_RECONNECT_MAX_MS / 2);
  });
});

/* ───────────────────── getAstraura158Ws (transporte) ───────────────────── */

describe("getAstraura158Ws", () => {
  it("reutiliza la conexión entre turnos (no abre un socket por mensaje) y rebindea al llamante más reciente", () => {
    const events1: string[] = [];
    const events2: string[] = [];

    const ws1 = getAstraura158Ws({ baseUrl: BASE_URL, onEvent: (ev) => events1.push(ev.type) });
    expect(FakeWebSocket.instances).toHaveLength(1);
    FakeWebSocket.instances[0].serverOpen();
    expect(ws1.ready).toBe(true);

    // "Segundo turno": misma base — debe reutilizar, no abrir otro socket.
    const ws2 = getAstraura158Ws({ baseUrl: BASE_URL, onEvent: (ev) => events2.push(ev.type) });
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(ws2.ready).toBe(true); // ya estaba abierta: lista al instante, sin esperar `onOpen`.

    FakeWebSocket.instances[0].serverMessage({ type: "token", token: "x" });
    expect(events2).toEqual(["token"]); // va al callback del turno ACTUAL (el último en llamar)...
    expect(events1).toEqual([]); // ...no al del turno anterior, ya abandonado.
  });

  it("entrega eventos crudos por onEvent y NO reenvía `pong` (es interno del latido)", () => {
    const seen: string[] = [];
    const ws = getAstraura158Ws({ baseUrl: BASE_URL, onEvent: (ev) => seen.push(ev.type) });
    const socket = FakeWebSocket.instances[0];
    socket.serverOpen();
    expect(ws.ready).toBe(true);

    socket.serverMessage({ type: "init_state" });
    socket.serverMessage({ type: "pong" });
    socket.serverMessage({ type: "token", token: "hi" });

    expect(seen).toEqual(["init_state", "token"]);
  });

  it("la reconexión usa backoff CRECIENTE, no un intervalo fijo (el original reintentaba cada 3s fijos)", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // determinista: el mínimo de cada intento.
    getAstraura158Ws({ baseUrl: BASE_URL, onEvent: () => {} });
    expect(FakeWebSocket.instances).toHaveLength(1);

    // 1ª caída ⇒ intento nº1 ⇒ retardo mínimo 500ms (ver astraura158WsBackoffDelay).
    FakeWebSocket.instances[0].serverFail();
    await vi.advanceTimersByTimeAsync(499);
    expect(FakeWebSocket.instances).toHaveLength(1); // todavía no.
    await vi.advanceTimersByTimeAsync(2);
    expect(FakeWebSocket.instances).toHaveLength(2); // reconectó.

    // 2ª caída ⇒ intento nº2 ⇒ retardo mínimo 1000ms — el DOBLE, no otra vez 500ms.
    FakeWebSocket.instances[1].serverFail();
    await vi.advanceTimersByTimeAsync(999);
    expect(FakeWebSocket.instances).toHaveLength(2); // un backoff fijo de 500ms ya habría reconectado aquí.
    await vi.advanceTimersByTimeAsync(2);
    expect(FakeWebSocket.instances).toHaveLength(3);
  });

  it("se rinde tras el máximo de intentos y avisa el motivo por onClose (no reintenta para siempre)", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const reasons: string[] = [];
    getAstraura158Ws({ baseUrl: BASE_URL, onEvent: () => {}, onClose: (r) => reasons.push(r) });

    for (let i = 1; i <= ASTRAURA_158_WS_RECONNECT_MAX_ATTEMPTS; i++) {
      FakeWebSocket.instances[FakeWebSocket.instances.length - 1].serverFail();
      await vi.advanceTimersByTimeAsync(ASTRAURA_158_WS_RECONNECT_MAX_MS); // agota cualquier backoff posible.
    }
    expect(FakeWebSocket.instances).toHaveLength(ASTRAURA_158_WS_RECONNECT_MAX_ATTEMPTS + 1);

    // La caída número (MAX+1) agota el máximo: se rinde, sin programar más reintentos.
    FakeWebSocket.instances[FakeWebSocket.instances.length - 1].serverFail();
    await vi.advanceTimersByTimeAsync(ASTRAURA_158_WS_RECONNECT_MAX_MS);
    expect(FakeWebSocket.instances).toHaveLength(ASTRAURA_158_WS_RECONNECT_MAX_ATTEMPTS + 1); // no creció más.
    expect(reasons.at(-1)).toMatch(/abandonada/);
  });
});

/* ───────────────────── attemptAstraura158WsTurn (orquestación en astraura-158.ts) ───────────────────── */

describe("attemptAstraura158WsTurn", () => {
  it("entrega el turno completo por WS: los tokens llegan al consumidor y `done` resuelve {text, raw}", async () => {
    const chunks: string[] = [];
    const options: ChatOptions = { model: "astraura-158/aurora", onChunk: (d) => chunks.push(d) };
    const promise = attemptAstraura158WsTurn(
      BASE_URL,
      { prompt: "hola", systemPrompt: "eres Aurora", preferences: BASE_PREFS },
      "aurora",
      undefined,
      options,
    );

    const socket = FakeWebSocket.instances[0];
    socket.serverOpen(); // abre a tiempo ⇒ se compromete (commit) y envía de inmediato.
    expect(JSON.parse(socket.sent[0])).toMatchObject({
      type: "user_message",
      prompt: "hola",
      system_prompt: "eres Aurora",
    });

    socket.serverMessage({ type: "token", token: "Ho" });
    socket.serverMessage({ type: "token", token: "la" });
    socket.serverMessage({ type: "done", full_text: "Hola" });

    const result = await promise;
    expect(chunks).toEqual(["Ho", "la"]);
    expect(result?.text).toBe("Hola");
    expect(result?.raw).toMatchObject({ persona: "aurora", backend: BASE_URL });
  });

  it("si el WS no abre a tiempo, se marca como no disponible — el llamante cae a la reserva SSE", async () => {
    const options: ChatOptions = { model: "astraura-158/aurora" };
    const promise = attemptAstraura158WsTurn(
      BASE_URL,
      { prompt: "hola", systemPrompt: "sys", preferences: BASE_PREFS },
      "aurora",
      undefined,
      options,
    );
    expect(FakeWebSocket.instances).toHaveLength(1);
    // A propósito: nunca llamamos a `serverOpen()` — se queda "conectando" para siempre.

    await vi.advanceTimersByTimeAsync(ASTRAURA_158_WS_READY_TIMEOUT_MS);
    await expect(promise).resolves.toBeNull();
    // Punto 5: la reserva solo se activa porque NUNCA se llegó a comprometer
    // (fase "committed") — el turno jamás se envió por WS.
    expect(FakeWebSocket.instances[0].sent).toHaveLength(0);
  });

  it("abortar deja de emitir al consumidor — los tokens que sigan llegando se descartan en el cliente", async () => {
    const chunks: string[] = [];
    const controller = new AbortController();
    const options: ChatOptions = { model: "astraura-158/aurora", onChunk: (d) => chunks.push(d), signal: controller.signal };
    const promise = attemptAstraura158WsTurn(
      BASE_URL,
      { prompt: "hola", systemPrompt: "sys", preferences: BASE_PREFS },
      "aurora",
      undefined,
      options,
    );

    const socket = FakeWebSocket.instances[0];
    socket.serverOpen();
    socket.serverMessage({ type: "token", token: "Ho" });
    expect(chunks).toEqual(["Ho"]);

    controller.abort();
    // El backend no tiene "stop": sigue "generando" y mandando tokens...
    socket.serverMessage({ type: "token", token: "la" });
    socket.serverMessage({ type: "done", full_text: "Hola" });
    // ...pero ninguno de los dos llega al consumidor.
    expect(chunks).toEqual(["Ho"]);

    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });
});
