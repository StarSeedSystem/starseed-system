import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startOrbeParamsFeed, stopOrbeParamsFeed, getOrbeParamsFeedState, ORBE_PARAMS_EVENT } from "@/lib/aurora/orbe-params-feed";
import { quantumOrbBus, onQuantumOrbParams } from "@/lib/aurora/quantum-orb-bus";
import type { QuantumOrbParams } from "@/lib/aurora/quantum-orb-theme";

const originalFetch = global.fetch;
const originalWindow = global.window;
const originalDocument = global.document;

function mockWindow() {
  const listeners: Record<string, Set<EventListener>> = {};
  const doc = { hidden: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  Object.defineProperty(doc, "hidden", { value: false, writable: true, configurable: true });
  global.window = {
    ...originalWindow,
    setTimeout: vi.fn((fn) => { fn(); return 1; }),
    setInterval: vi.fn(() => 2),
    clearTimeout: vi.fn(),
    clearInterval: vi.fn(),
    addEventListener: vi.fn((event, handler) => { (listeners[event] ||= new Set()).add(handler); }),
    removeEventListener: vi.fn((event, handler) => { listeners[event]?.delete(handler); }),
    dispatchEvent: vi.fn((e) => { listeners[e.type]?.forEach((h) => h(e)); return true; }),
    document: doc,
  } as unknown as Window & typeof globalThis;
  global.document = global.window.document;
}

function mockFetch(responses: Map<string, Response>) {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    return responses.get(url) ?? new Response("", { status: 404 });
  });
}

function makeResponse(params: Partial<QuantumOrbParams>): Response {
  return new Response(JSON.stringify({ params }), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("orbe-params-feed — sondea el backend y publica en el bus params", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockWindow();
    mockFetch(new Map());
    quantumOrbBus.clear("params");
    stopOrbeParamsFeed();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    global.fetch = originalFetch;
    global.window = originalWindow;
    global.document = originalDocument;
  });

  it("arranca, sondea, recibe params y emite al bus quantum-orb-bus", async () => {
    const params: Partial<QuantumOrbParams> = { turbulence: 0.7, spikiness: 0.3, symmetry: 0.8, hueShift: 0.2, breath: 0.6 };
    mockFetch(new Map([["/api/ai/astraura-158/api/starseed/orb/params", makeResponse(params)]]));

    const received: QuantumOrbParams[] = [];
    const unsub = onQuantumOrbParams((p) => received.push(p as QuantumOrbParams));

    const stop = startOrbeParamsFeed();
    await vi.runAllTimersAsync();

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject(params);

    stop();
    unsub();
  });

  it("si el backend falla, no emite y guarda el error en el estado", async () => {
    mockFetch(new Map([["/api/ai/astraura-158/api/starseed/orb/params", new Response("", { status: 503 })]]));

    const received: QuantumOrbParams[] = [];
    const unsub = onQuantumOrbParams((p) => received.push(p as QuantumOrbParams));

    startOrbeParamsFeed();
    await vi.runAllTimersAsync();

    expect(received).toHaveLength(0);
    const state = getOrbeParamsFeedState();
    expect(state.lastError).toContain("HTTP 503");
    expect(state.target).toBeNull();

    stopOrbeParamsFeed();
    unsub();
  });

  it("reintenta con local y nube; usa el primero que responda", async () => {
    const localParams: Partial<QuantumOrbParams> = { turbulence: 0.1, breath: 0.2 };
    const nubeParams: Partial<QuantumOrbParams> = { turbulence: 0.9, breath: 0.8 };
    const responses = new Map<string, Response>([
      ["/api/ai/astraura-158/api/starseed/orb/params", makeResponse(localParams)],
    ]);
    mockFetch(responses);

    const received: QuantumOrbParams[] = [];
    const unsub = onQuantumOrbParams((p) => received.push(p as QuantumOrbParams));

    startOrbeParamsFeed();
    await vi.runAllTimersAsync();

    expect(received[0].turbulence).toBe(0.1);
    const state = getOrbeParamsFeedState();
    expect(state.target).toBe("local");

    stopOrbeParamsFeed();
    unsub();
  });

  it("stopOrbeParamsFeed detiene el sondeo y limpia", async () => {
    mockFetch(new Map([["/api/ai/astraura-158/api/starseed/orb/params", makeResponse({ turbulence: 0.5 })]]));

    const stop = startOrbeParamsFeed();
    await vi.runAllTimersAsync();
    expect(getOrbeParamsFeedState().params).not.toBeNull();

    stop();
    vi.advanceTimersByTime(10_000);
    await vi.runAllTimersAsync();

    const state = getOrbeParamsFeedState();
    expect(state.params).not.toBeNull();
    expect(typeof state.lastAt).toBe("number");
  });

  it("no sondea cuando document.hidden es true", async () => {
    mockFetch(new Map([["/api/ai/astraura-158/api/starseed/orb/params", makeResponse({ turbulence: 0.5 })]]));
    Object.defineProperty(global.window.document, "hidden", { value: true, writable: true, configurable: true });

    const received: QuantumOrbParams[] = [];
    const unsub = onQuantumOrbParams((p) => received.push(p as QuantumOrbParams));

    startOrbeParamsFeed();
    await vi.runAllTimersAsync();

    expect(received).toHaveLength(0);

    stopOrbeParamsFeed();
    unsub();
  });

  it("dispatcha evento personalizado starseed:orbe-params con el estado", async () => {
    const params: Partial<QuantumOrbParams> = { turbulence: 0.4, spikiness: 0.5 };
    mockFetch(new Map([["/api/ai/astraura-158/api/starseed/orb/params", makeResponse(params)]]));

    const events: CustomEvent[] = [];
    const originalDispatch = global.window.dispatchEvent;
    global.window.dispatchEvent = vi.fn((e) => { events.push(e as CustomEvent); return originalDispatch(e); });

    startOrbeParamsFeed();
    await vi.runAllTimersAsync();

    const ev = events.find((e) => e.type === ORBE_PARAMS_EVENT);
    expect(ev).toBeDefined();
    expect(ev?.detail.params).toMatchObject(params);

    stopOrbeParamsFeed();
  });
});