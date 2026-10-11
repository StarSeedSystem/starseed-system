import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { crearCanalRele } from "../canal-rele";

// Mock WebSocket class
class MockWebSocket {
  url: string;
  readyState: number;
  static OPEN = 1;
  static CLOSED = 3;
  onopen: ((this: WebSocket, ev: Event) => any) | null;
  onclose: ((this: WebSocket, ev: Event) => any) | null;
  onmessage: ((this: WebSocket, ev: MessageEvent) => any) | null;
  onerror: ((this: WebSocket, ev: Event) => any) | null;

  constructor(url: string) {
    this.url = url;
    this.readyState = MockWebSocket.CLOSED;
    this.onopen = null;
    this.onclose = null;
    this.onmessage = null;
    this.onerror = null;
    // Store instance for test access
    MockWebSocket.instance = this;
  }

  send(data: string) {
    // Mock send does nothing
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new Event("close"));
    }
  }

  // Simulate opening the connection
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) {
      this.onopen(new Event("open"));
    }
  }

  // Simulate receiving a message
  simulateMessage(data: string) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent("message", { data }));
    }
  }

  // Simulate an error
  simulateError() {
    if (this.onerror) {
      this.onerror(new Event("error"));
    }
  }
}

describe("crearCanalRele", () => {
  let url: string;
  let tema: string;
  let mockSetTimeout: ReturnType<typeof vi.fn>;
  let mockClearTimeout: ReturnType<typeof vi.fn>;
  let scheduledCallbacks: Array<{ id: string; cb: () => void; ms: number }> = [];

  beforeEach(() => {
    url = "wss://example.com/rele";
    tema = "test-topic";
    scheduledCallbacks = [];
    mockSetTimeout = vi.fn((cb, ms) => {
      const id = Math.random().toString();
      scheduledCallbacks.push({ id, cb, ms });
      return id;
    });
    mockClearTimeout = vi.fn((id) => {
      scheduledCallbacks = scheduledCallbacks.filter((t) => t.id !== id);
    });
    // Clear the instance before each test
    MockWebSocket.instance = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Helper to flush all scheduled timers
  const flushTimers = () => {
    const callbacks = [...scheduledCallbacks];
    scheduledCallbacks = [];
    callbacks.forEach(({ cb }) => cb());
  };

  it("should initialize with closed state", () => {
    const canal = crearCanalRele(url, tema, MockWebSocket, {
      poner: mockSetTimeout,
      quitar: mockClearTimeout,
    });
    expect(canal.abierto()).toBe(false);
    // The WebSocket instance should have been created
    expect(MockWebSocket.instance).not.toBeNull();
    expect(MockWebSocket.instance?.url).toBe(`${url}?tema=${encodeURIComponent(tema)}`);
  });

  it("should open connection and notify alAbrir listeners", () => {
    const canal = crearCanalRele(url, tema, MockWebSocket, {
      poner: mockSetTimeout,
      quitar: mockClearTimeout,
    });
    const openCallback = vi.fn();
    const unsubscribe = canal.alAbrir(openCallback);

    // Simulate the WebSocket opening
    MockWebSocket.instance?.simulateOpen();

    expect(openCallback).toHaveBeenCalledTimes(1);
    expect(canal.abierto()).toBe(true);

    unsubscribe();
    // Simulate another open (should not call the unsubscribed callback)
    MockWebSocket.instance?.simulateOpen();
    expect(openCallback).toHaveBeenCalledTimes(1);
  });

  it("should pass only 'est' messages to alRecibir and update oyentes with 'rele' messages", () => {
    const canal = crearCanalRele(url, tema, MockWebSocket, {
      poner: mockSetTimeout,
      quitar: mockClearTimeout,
    });
    const messageCallback = vi.fn();
    const unsubscribe = canal.alRecibir(messageCallback);

    // Simulate open so that we can send/receive
    MockWebSocket.instance?.simulateOpen();

    // Send a presence message (should not be passed to alRecibir)
    MockWebSocket.instance?.simulateMessage('{"t":"rele","n":5}');
    expect(messageCallback).not.toHaveBeenCalled();
    expect(canal.oyentes()).toBe(5);

    // Send an est message (should be passed)
    MockWebSocket.instance?.simulateMessage('{"t":"est","s":"id","e":"estado","d":"{}"}');
    expect(messageCallback).toHaveBeenCalledWith('{"t":"est","s":"id","e":"estado","d":"{}"}');

    // Send a malformed JSON (should be ignored)
    MockWebSocket.instance?.simulateMessage('not json');
    expect(messageCallback).toHaveBeenCalledTimes(1);

    // Send an est message with different content
    MockWebSocket.instance?.simulateMessage('{"t":"est","s":"id2","e":"accion","d":"[1,2,3]"}');
    expect(messageCallback).toHaveBeenCalledWith('{"t":"est","s":"id2","e":"accion","d":"[1,2,3]"}');

    unsubscribe();
    // After unsubscribing, no more callbacks
    MockWebSocket.instance?.simulateMessage('{"t":"est","s":"id3","e":"estado","d":"{}"}');
    expect(messageCallback).toHaveBeenCalledTimes(2);
  });

  it("should allow enviar only when open", () => {
    const canal = crearCanalRele(url, tema, MockWebSocket, {
      poner: mockSetTimeout,
      quitar: mockClearTimeout,
    });
    // Initially closed, enviar should do nothing (not throw)
    expect(() => canal.enviar("test")).not.toThrow();

    // Open the socket
    MockWebSocket.instance?.simulateOpen();
    // Now we can spy on the send method
    const sendSpy = vi.spyOn(MockWebSocket.instance, "send");
    canal.enviar("hello");
    expect(sendSpy).toHaveBeenCalledWith("hello");

    // Close the socket
    MockWebSocket.instance?.close();
    expect(canal.abierto()).toBe(false);
    // Sending when closed should not call send
    canal.enviar("world");
    expect(sendSpy).toHaveBeenCalledTimes(1); // still only one call
  });

  it("should reconnect with exponential backoff up to max delay", () => {
    const canal = crearCanalRele(url, tema, MockWebSocket, {
      poner: mockSetTimeout,
      quitar: mockClearTimeout,
    });
    // Start with closed socket (constructor creates it but doesn't open)
    // We'll simulate an immediate open then a close to trigger reconnect
    MockWebSocket.instance?.simulateOpen();
    expect(canal.abierto()).toBe(true);

    // Now close the socket to trigger reconnection
    MockWebSocket.instance?.close();
    expect(canal.abierto()).toBe(false);

    // The first reconnect should have been scheduled with delay 1000ms
    expect(mockSetTimeout).toHaveBeenCalled();
    // Flush the timer to trigger the reconnect
    flushTimers();
    // After flushing, a new WebSocket instance should have been created and connected
    // We need to open it to simulate the connection succeeding
    MockWebSocket.instance?.simulateOpen();
    expect(canal.abierto()).toBe(true);

    // Now close again to test the second reconnect (delay should be 2000ms)
    MockWebSocket.instance?.close();
    expect(canal.abierto()).toBe(false);
    // Flush again
    flushTimers();
    MockWebSocket.instance?.simulateOpen();
    expect(canal.abierto()).toBe(true);

    // We can also check that the delays were increasing
    // The first call to mockSetTimeout should have been with ms=1000
    // The second call (after first close) should have been with ms=2000
    // But note: we flushed after the first close, which triggered the reconnect and opened.
    // Then we closed again, which should schedule another reconnect with delay 2000.
    // Let's check the calls
    // We expect at least two calls to mockSetTimeout: one for the initial connection (which we didn't schedule because we opened immediately? Actually, the initial connection does not schedule a reconnect because it opens successfully. The reconnect is scheduled on close.
    // So we expect two calls: one from the first close and one from the second close.
    // We'll check the ms of the calls.
    // We'll get all the calls to mockSetTimeout
    const setTimeoutCalls = mockSetTimeout.mock.calls;
    // We expect at least two calls
    expect(setTimeoutCalls.length).toBeGreaterThanOrEqual(2);
    // The first call should be for the first reconnect (delay 1000)
    expect(setTimeoutCalls[0][1]).toBe(1000);
    // The second call should be for the second reconnect (delay 2000)
    expect(setTimeoutCalls[1][1]).toBe(2000);
  });

  it("should stop reconnecting and clean up on cerrar", () => {
    const canal = crearCanalRele(url, tema, MockWebSocket, {
      poner: mockSetTimeout,
      quitar: mockClearTimeout,
    });
    MockWebSocket.instance?.simulateOpen();
    expect(canal.abierto()).toBe(true);

    // Close the canal
    canal.cerrar();
    expect(canal.abierto()).toBe(false);
    // After cerrar, if we close the websocket, it should not reschedule a reconnect
    MockWebSocket.instance?.close();
    // We expect that no further setTimeout was called after the cerrar
    // We can check that the number of setTimeout calls did not increase after the cerrar
    // But we already had a setTimeout call from the initial close? Actually, we haven't closed the socket yet.
    // Let's close the socket first to see if it schedules a reconnect, then cerrar, then close again and see if no more scheduling.
    // We'll do:
    // 1. Open socket
    // 2. Close socket -> should schedule reconnect (call setTimeout)
    // 3. Flush the timer and open the new socket -> now we have an open socket
    // 4. Close the socket again -> should schedule another reconnect (call setTimeout)
    // 5. Now cerrar the canal
    // 6. Close the socket again -> should NOT schedule a reconnect
    // We'll count the setTimeout calls before and after step 6.

    // Step 1: already open from before? We'll start fresh.
    canal.cerrar(); // ensure closed
    const canal2 = crearCanalRele(url, tema, MockWebSocket, {
      poner: mockSetTimeout,
      quitar: mockClearTimeout,
    });
    MockWebSocket.instance?.simulateOpen();
    expect(canal2.abierto()).toBe(true);

    // Step 2: close socket -> schedule reconnect
    MockWebSocket.instance?.close();
    expect(canal2.abierto()).toBe(false);
    const firstCallCount = mockSetTimeout.mock.calls.length;

    // Step 3: flush and open
    flushTimers();
    MockWebSocket.instance?.simulateOpen();
    expect(canal2.abierto()).toBe(true);

    // Step 4: close socket -> schedule another reconnect
    MockWebSocket.instance?.close();
    expect(canal2.abierto()).toBe(false);
    const secondCallCount = mockSetTimeout.mock.calls.length;
    expect(secondCallCount).toBe(firstCallCount + 1);

    // Step 5: cerrar the canal
    canal2.cerrar();
    expect(canal2.abierto()).toBe(false);

    // Step 6: close socket again -> should not schedule reconnect
    MockWebSocket.instance?.close();
    // The call count should not have increased
    expect(mockSetTimeout.mock.calls.length).toBe(secondCallCount);
  });
});