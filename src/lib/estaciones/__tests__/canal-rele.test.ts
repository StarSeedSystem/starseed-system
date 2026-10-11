import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { crearCanalRele } from "../canal-rele";

let lastWs: FakeWebSocket | null = null;

class FakeWebSocket {
  url: string;
  readyState: number;
    onopen: null | ((this: FakeWebSocket, ev: Event) => any);
    onmessage: null | ((this: FakeWebSocket, ev: MessageEvent) => any);
    onclose: null | ((this: FakeWebSocket) => any);
    onerror: null | ((this: FakeWebSocket, ev: Event) => any);
  static OPEN = 1;
  static CLOSED = 3;

  constructor(url: string) {
    this.url = url;
    this.readyState = FakeWebSocket.CLOSED;
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    lastWs = this;
  }

  send(data: string) {
    // No-op for testing
  }

   close() {
    this.readyState = FakeWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose();
    }
  }

  // Helper methods for testing
  triggerOpen() {
    if (this.onopen) {
      this.onopen(new Event("open"));
    }
  }

  triggerMessage(data: string) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent("message", { data }));
    }
  }

  triggerClose() {
    this.close();
  }

  triggerError() {
    if (this.onerror) {
      this.onerror(new Event("error"));
    }
  }
}

describe("canal-rele", () => {
  let url: string;
  let tema: string;

  beforeEach(() => {
    url = "wss://example.com/rele";
    tema = "test-topic";
    lastWs = null;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    lastWs = null;
  });

  it("should connect and report abierto() true", () => {
    const canal = crearCanalRele(url, tema, FakeWebSocket as any);
    expect(canal.abierto()).toBe(false);
    // Simulate WebSocket open
    lastWs?.triggerOpen();
    expect(canal.abierto()).toBe(true);
  });

  it("should reconnect with increasing delay up to 30 seconds", () => {
    const canal = crearCanalRele(url, tema, FakeWebSocket as any);
    // Force close to trigger reconnection
    lastWs?.triggerClose();
    expect(canal._reconectarTimeout).not.toBeNull();
    // First reconnection delay: 1 second
    vi.advanceTimersByTime(1000);
    expect(canal._reconectarIntentos).toBe(1);
    // Close again to schedule next
    lastWs?.triggerClose();
    vi.advanceTimersByTime(2000); // 2 seconds
    expect(canal._reconectarIntentos).toBe(2);
    // Continue until delay reaches 30 seconds
    // We'll test that after 5 attempts, delay is capped at 30s
    for (let i = 0; i < 5; i++) {
      lastWs?.triggerClose();
      vi.advanceTimersByTime(Math.min(1000 * 2 ** (i + 1), 30000));
    }
    expect(canal._reconectarIntentos).toBe(6); // initial 0 + 6 closes
  });

  it("should pass est messages to alRecibir", () => {
    const cb = vi.fn();
    const canal = crearCanalRele(url, tema, FakeWebSocket as any);
    const unsub = canal.alRecibir(cb);
    // Simulate open
    lastWs?.triggerOpen();
    // Send an est message
    const estMessage = '{"t":"est","s":"id","e":"estado","d":"{}"}';
    lastWs?.triggerMessage(estMessage);
    expect(cb).toHaveBeenCalledWith(estMessage);
    unsub();
    // Second message should not be called
    lastWs?.triggerMessage(estMessage);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("should update oyentes count with rele messages and not pass upwards", () => {
    const cb = vi.fn();
    const canal = crearCanalRele(url, tema, FakeWebSocket as any);
    const unsub = canal.alRecibir(cb);
    // Simulate open
    lastWs?.triggerOpen();
    // Send a rele message
    const releMessage = '{"t":"rele","n":5}';
    lastWs?.triggerMessage(releMessage);
    expect(canal.oyentes!()).toBe(5);
    expect(cb).not.toHaveBeenCalled();
    // Send an est message - should be passed because we are testing that rele messages are not passed upwards
    const estMessage = '{"t":"est","s":"id","e":"estado","d":"{}"}';
    lastWs?.triggerMessage(estMessage);
    expect(cb).toHaveBeenCalledWith(estMessage);
    unsub();
  });

  it("should call alAbrir on open and reconnection", () => {
    const cb = vi.fn();
    const canal = crearCanalRele(url, tema, FakeWebSocket as any);
    const unsub = canal.alAbrir!(cb);
    // Initial open
    lastWs?.triggerOpen();
    expect(cb).toHaveBeenCalledTimes(1);
    // Close and trigger reconnection
    lastWs?.triggerClose();
    vi.advanceTimersByTime(1000); // wait for first reconnect
    lastWs?.triggerOpen();
    expect(cb).toHaveBeenCalledTimes(2);
    unsub();
  });

  it("should close socket and stop reconnection on cerrar", () => {
    const canal = crearCanalRele(url, tema, FakeWebSocket as any);
    // Force a close to start reconnection timer
    lastWs?.triggerClose();
    expect(canal._reconectarTimeout).not.toBeNull();
    canal.cerrar();
    expect(canal._reconectarTimeout).toBeNull();
    // After cerrar, the WebSocket instance is closed and cleaned up.
    expect(canal.abierto()).toBe(false);
  });
});