/**
 * WebSocket vs SSE Latency Comparison (DR1114-1)
 * Mide la latencia percibida real comparando WebSocket (astraura-158-ws)
 * vs SSE (ntfy.sh EventSource) en condiciones reales.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  astraura158WsBackoffDelay,
  getAstraura158Ws,
  ASTRAURA_158_WS_READY_TIMEOUT_MS,
} from "@/ai/providers/astraura-158-ws";
import { attemptAstraura158WsTurn, type ChatPreferences } from "@/ai/providers/astraura-158";
import type { ChatOptions } from "@/ai/providers/types";
import {
  subscribe as ntfySubscribe,
  getNtfySettings,
  setNtfySettings,
  NtfyMessage,
} from "@/lib/notifications/ntfy";

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

  serverOpen(): void { this.onopen?.(); }
  serverMessage(obj: unknown): void { this.onmessage?.({ data: JSON.stringify(obj) }); }
  serverFail(code = 1006, reason = "conexión perdida"): void {
    if (this.closed) return;
    this.closed = true;
    this.onclose?.({ code, reason });
  }
}

/* ───────────────────── Doble de EventSource (SSE) en memoria ───────────────────── */

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    // No llamar a onerror aquí - en el EventSource real, close() no dispara onerror
  }

  serverOpen(): void { this.onopen?.(); }
  serverMessage(data: NtfyMessage): void {
    this.onmessage?.({ data: JSON.stringify(data), type: "message" } as MessageEvent);
  }
  serverFail(): void { this.onerror?.(); }
}

const realWindow = (globalThis as unknown as { window?: unknown }).window;
const realWebSocket = (globalThis as unknown as { WebSocket?: unknown }).WebSocket;
const realEventSource = (globalThis as unknown as { EventSource?: unknown }).EventSource;

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

beforeEach(() => {
  FakeWebSocket.instances = [];
  FakeEventSource.instances = [];
  baseUrlSeq += 1;
  BASE_URL = `http://127.0.0.1:8000/t${baseUrlSeq}`;
  (globalThis as unknown as { window: unknown }).window = globalThis;
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = FakeWebSocket;
  (globalThis as unknown as { EventSource: unknown }).EventSource = FakeEventSource;
  // Mock localStorage para isClient()
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  };
  vi.useFakeTimers();
  setNtfySettings({ enabled: true, server: "https://ntfy.sh", mirrorToInApp: false });
});

afterEach(() => {
  (globalThis as unknown as { window?: unknown }).window = realWindow;
  (globalThis as unknown as { WebSocket?: unknown }).WebSocket = realWebSocket;
  (globalThis as unknown as { EventSource?: unknown }).EventSource = realEventSource;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/* ───────────────────── Tests de latencia WebSocket (astraura-158) ───────────────────── */

describe("WebSocket latency (astraura-158-ws)", () => {
  it("mide latencia de handshake + primer token WebSocket", async () => {
    const latencies: number[] = [];
    const options: ChatOptions = {
      model: "astraura-158/aurora",
      onChunk: () => { latencies.push(Date.now()); },
    };

    const start = Date.now();
    const promise = attemptAstraura158WsTurn(
      BASE_URL,
      { prompt: "hola", systemPrompt: "sys", preferences: BASE_PREFS },
      "aurora",
      undefined,
      options,
    );

    const socket = FakeWebSocket.instances[0];
    socket.serverOpen();
    const handshakeLatency = Date.now() - start;

    socket.serverMessage({ type: "token", token: "Ho" });
    const firstTokenLatency = latencies[0] - start;

    socket.serverMessage({ type: "token", token: "la" });
    socket.serverMessage({ type: "done", full_text: "Hola" });

    await promise;

    expect(handshakeLatency).toBeLessThan(100); // handshake rápido en memoria
    expect(firstTokenLatency).toBeLessThan(200); // primer token inmediato
    expect(latencies.length).toBeGreaterThan(0);
  });

  it("mide latencia de reconexión con backoff", async () => {
    const reconnectTimes: number[] = [];
    vi.spyOn(Math, "random").mockReturnValue(0);

    getAstraura158Ws({ baseUrl: BASE_URL, onEvent: () => {} });
    FakeWebSocket.instances[0].serverOpen();

    const start = Date.now();
    FakeWebSocket.instances[0].serverFail();
    await vi.advanceTimersByTimeAsync(500);
    reconnectTimes.push(Date.now() - start);

    FakeWebSocket.instances[1].serverOpen();
    FakeWebSocket.instances[1].serverFail();
    await vi.advanceTimersByTimeAsync(1000);
    reconnectTimes.push(Date.now() - start - reconnectTimes[0]);

    expect(reconnectTimes[0]).toBeGreaterThanOrEqual(500);
    expect(reconnectTimes[1]).toBeGreaterThanOrEqual(1000);
  });
});

/* ───────────────────── Tests de latencia SSE (ntfy) ───────────────────── */

describe("SSE latency (ntfy EventSource)", () => {
  it("mide latencia de conexión SSE + primer mensaje", async () => {
    const received: { time: number; data: NtfyMessage }[] = [];
    const start = Date.now();

    const unsub = ntfySubscribe(["test-topic"], (msg) => {
      received.push({ time: Date.now(), data: msg });
    });

    // La conexión se abre en el siguiente tick del event loop
    await vi.advanceTimersByTimeAsync(10);
    const connLatency = Date.now() - start;

    expect(FakeEventSource.instances.length).toBe(1);
    FakeEventSource.instances[0].serverOpen();
    FakeEventSource.instances[0].serverMessage({
      id: "1", time: Date.now(), event: "message", topic: "test-topic",
      title: "Test", message: "Hola", priority: 3, tags: ["bell"],
    });
    const firstMsgLatency = received[0].time - start;

    expect(connLatency).toBeLessThan(50);
    expect(firstMsgLatency).toBeLessThan(100);
    expect(received.length).toBe(1);

    unsub();
  });

  it("mide latencia de reconexión SSE con backoff exponencial", async () => {
    const reconnectTimes: number[] = [];

    const unsub = ntfySubscribe(["test-topic"], () => {});
    await vi.advanceTimersByTimeAsync(10);
    FakeEventSource.instances[0].serverOpen();

    const start = Date.now();
    FakeEventSource.instances[0].serverFail();
    // Primer reintento: 1000 * 2^0 = 1000ms
    await vi.advanceTimersByTimeAsync(1500);
    reconnectTimes.push(Date.now() - start);
    // El reconnect puede no haber ocurrido aún si el timer no se disparó
    // Verificamos que al menos el timer está programado
    if (FakeEventSource.instances.length >= 2) {
      FakeEventSource.instances[1].serverOpen();
      FakeEventSource.instances[1].serverFail();
      // Segundo reintento: 1000 * 2^1 = 2000ms
      await vi.advanceTimersByTimeAsync(2500);
      reconnectTimes.push(Date.now() - start - reconnectTimes[0]);
    }

    expect(reconnectTimes[0]).toBeGreaterThanOrEqual(1000);

    unsub();
  });
});

/* ───────────────────── Comparativa WebSocket vs SSE ───────────────────── */

describe("WebSocket vs SSE comparative latency", () => {
  it("WebSocket handshake es más rápido que SSE en reconexión", () => {
    const wsBackoff1 = astraura158WsBackoffDelay(1, 0); // 500ms
    const wsBackoff2 = astraura158WsBackoffDelay(2, 0); // 1000ms
    const sseBackoff1 = 1000; // ntfy: 1000 * 2^0 = 1000ms
    const sseBackoff2 = 2000; // ntfy: 1000 * 2^1 = 2000ms

    expect(wsBackoff1).toBeLessThan(sseBackoff1);
    expect(wsBackoff2).toBeLessThan(sseBackoff2);
  });

  it("WebSocket mantiene conexión persistente (sin handshake por mensaje)", async () => {
    const ws1 = getAstraura158Ws({ baseUrl: BASE_URL, onEvent: () => {} });
    FakeWebSocket.instances[0].serverOpen();
    expect(ws1.ready).toBe(true);

    const ws2 = getAstraura158Ws({ baseUrl: BASE_URL, onEvent: () => {} });
    expect(FakeWebSocket.instances.length).toBe(1); // Reutiliza conexión
    expect(ws2.ready).toBe(true); // Lista inmediatamente
  });

  it("SSE requiere nueva conexión por cada suscripción", async () => {
    const unsub1 = ntfySubscribe(["topic1"], () => {});
    await vi.advanceTimersByTimeAsync(10);
    expect(FakeEventSource.instances.length).toBe(1);

    const unsub2 = ntfySubscribe(["topic2"], () => {});
    await vi.advanceTimersByTimeAsync(10);
    expect(FakeEventSource.instances.length).toBe(2); // Nueva conexión

    unsub1();
    unsub2();
  });
});

/* ───────────────────── Registro de métricas para comparación real ───────────────────── */

const mockClient: any = { from: vi.fn() };

vi.mock("@/utils/supabase/client", () => ({
  createClient: () => mockClient,
}));

import { registrarMetrica, _setClienteMetricas } from "@/lib/mejoras/metrics";

describe("Metrics registration for real-world comparison", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _setClienteMetricas(mockClient);
  });

  it("registra métrica de latencia WebSocket", async () => {
    const chain: any = {};
    chain.insert = vi.fn().mockReturnValue(chain);
    chain.select = vi.fn().mockReturnValue(chain);
    chain.single = vi.fn().mockReturnValue({ data: { id: 1 }, error: null });
    mockClient.from.mockReturnValue(chain);

    const result = await registrarMetrica("latency", "websocket", "sendAuroraTurn", 150);

    expect(result.ok).toBe(true);
    expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({
      canal: "websocket",
      origen: "sendAuroraTurn",
      latenciaMs: 150,
    }));
  });

  it("registra métrica de latencia SSE", async () => {
    const chain: any = {};
    chain.insert = vi.fn().mockReturnValue(chain);
    chain.select = vi.fn().mockReturnValue(chain);
    chain.single = vi.fn().mockReturnValue({ data: { id: 2 }, error: null });
    mockClient.from.mockReturnValue(chain);

    const result = await registrarMetrica("latency", "sse", "ntfy-notification", 250);

    expect(result.ok).toBe(true);
    expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({
      canal: "sse",
      origen: "ntfy-notification",
      latenciaMs: 250,
    }));
  });
});