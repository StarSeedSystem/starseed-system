import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { crearCanalRele } from "../canal-rele";

// Mock CloseEvent for environments that don't have it
class CloseEvent {
  constructor(public type: string) {}
}

describe("crearCanalRele", () => {
  let url: string;
  let tema: string;
  let WS: typeof WebSocket;
  let wsInstance: WS | null = null;

  beforeEach(() => {
    url = "ws://test.example";
    tema = "test-tema";
    // Mock WebSocket that allows us to get the instance and trigger events
    WS = class {
      url: string;
      binaryType: string;
      readyState: number;
      onopen: ((this: WebSocket, ev: Event) => any) | null;
      onmessage: ((this: WebSocket, ev: MessageEvent) => any) | null;
      onclose: ((this: WebSocket, ev: CloseEvent) => any) | null;
      onerror: ((this: WebSocket, ev: Event) => any) | null;
      constructor(url: string) {
        this.url = url;
        this.binaryType = "";
        this.readyState = WS.CONNECTING;
        this.onopen = null;
        this.onmessage = null;
        this.onclose = null;
        this.onerror = null;
        wsInstance = this; // Capture the instance
      }
      close() {
        this.readyState = WS.CLOSED;
        if (this.onclose) {
          this.onclose(new CloseEvent("close"));
        }
      }
      send(data: string) {
        // No-op for testing
      }
    };
    // Static values for WebSocket states
    WS.CONNECTING = 0;
    WS.OPEN = 1;
    WS.CLOSING = 2;
    WS.CLOSED = 3;
  });

  afterEach(() => {
    wsInstance = null;
    vi.useRealTimers();
  });

  it("should start in connecting state", () => {
    const canal = crearCanalRele(url, tema, WS);
    expect(canal.abierto()).toBe(false);
    expect(wsInstance).not.toBeNull();
    expect(wsInstance.readyState).toBe(WS.CONNECTING);
  });

  it("should open and trigger alAbrir", () => {
    const alAbrirMock = vi.fn();
    const canal = crearCanalRele(url, tema, WS);
    const unsubscribe = canal.alAbrir(alAbrirMock);

    // Simulate successful connection
    wsInstance.readyState = WS.OPEN;
    if (wsInstance.onopen) {
      wsInstance.onopen(new Event("open"));
    }

    expect(alAbrirMock).toHaveBeenCalledTimes(1);
    expect(canal.abierto()).toBe(true);

    // Cleanup
    unsubscribe();
  });

  it("should send message when open", () => {
    const canal = crearCanalRele(url, tema, WS);
    const sendMock = vi.fn();
    // Assign the mock send function
    wsInstance.send = sendMock;

    // Open the connection
    wsInstance.readyState = WS.OPEN;
    if (wsInstance.onopen) {
      wsInstance.onopen(new Event("open"));
    }

    canal.enviar("test message");
    expect(sendMock).toHaveBeenCalledWith("test message");
  });

  it("should not send when closed or connecting", () => {
    const canal = crearCanalRele(url, tema, WS);
    const sendMock = vi.fn();
    wsInstance.send = sendMock;

    // Test in CONNECTING state
    wsInstance.readyState = WS.CONNECTING;
    canal.enviar("test");
    expect(sendMock).not.toHaveBeenCalled();

    // Test in CLOSED state
    wsInstance.readyState = WS.CLOSED;
    canal.enviar("test");
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("should pass through messages starting with {'t':'est' to alRecibir", () => {
    const alRecibirMock = vi.fn();
    const canal = crearCanalRele(url, tema, WS);
    const unsubscribe = canal.alRecibir(alRecibirMock);

    // Open the connection
    wsInstance.readyState = WS.OPEN;
    if (wsInstance.onopen) {
      wsInstance.onopen(new Event("open"));
    }

    const mensajeEst = '{"t":"est","s":"id","e":"estado","d":"{}"}';
    wsInstance.onmessage(new MessageEvent("message", { data: mensajeEst }));

    expect(alRecibirMock).toHaveBeenCalledWith(mensajeEst);
    unsubscribe();
  });

  it("should not pass through messages that do not start with {'t':'est'", () => {
    const alRecibirMock = vi.fn();
    const canal = crearCanalRele(url, tema, WS);
    const unsubscribe = canal.alRecibir(alRecibirMock);

    // Open the connection
    wsInstance.readyState = WS.OPEN;
    if (wsInstance.onopen) {
      wsInstance.onopen(new Event("open"));
    }

    const mensajeOtros = '{"t":"otro","data":"test"}';
    wsInstance.onmessage(new MessageEvent("message", { data: mensajeOtros }));

    expect(alRecibirMock).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("should update listener count from presence messages", () => {
    const canal = crearCanalRele(url, tema, WS);

    // Open the connection
    wsInstance.readyState = WS.OPEN;
    if (wsInstance.onopen) {
      wsInstance.onopen(new Event("open"));
    }

    const mensajePresencia = '{"t":"rele","n":5}';
    wsInstance.onmessage(new MessageEvent("message", { data: mensajePresencia }));

    expect(canal.oyentes()).toBe(5);
  });

  it("should ignore malformed presence messages", () => {
    const canal = crearCanalRele(url, tema, WS);

    // Open the connection
    wsInstance.readyState = WS.OPEN;
    if (wsInstance.onopen) {
      wsInstance.onopen(new Event("open"));
    }

    const mensajeMalformado = '{"t":"rele","n":"not a number"}';
    wsInstance.onmessage(new MessageEvent("message", { data: mensajeMalformado }));

    expect(canal.oyentes()).toBe(0); // Should remain 0
  });

  it("should attempt reconnection on close", () => {
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
    const canal = crearCanalRele(url, tema, WS);

    // Initially connecting
    expect(canal.abierto()).toBe(false);

    // Simulate open
    wsInstance.readyState = WS.OPEN;
    if (wsInstance.onopen) {
      wsInstance.onopen(new Event("open"));
    }
    expect(canal.abierto()).toBe(true);

    // Simulate close
    wsInstance.readyState = WS.CLOSED;
    if (wsInstance.onclose) {
      wsInstance.onclose(new CloseEvent("close"));
    }

    // Should have scheduled a reconnection after 1 second (2^0 * 1000)
    expect(setTimeoutSpy).toHaveBeenCalled();
    // Advance timers by 1 second to trigger the reconnection attempt
    vi.advanceTimersByTime(1000);
    // After 1 second, we expect a new WebSocket instance to have been created and be in CONNECTING state
    // Note: Our mock WS class overwrites wsInstance each time a new instance is created.
    // So after advancing timers, wsInstance should hold the new instance.
    expect(wsInstance).not.toBeNull();
    expect(wsInstance.readyState).toBe(WS.CONNECTING);
    // Also, we expect that the close handler was called on the old instance (which we can't check easily)
    // But we can check that the open handler was not called on the new instance yet.
  });

  it("should stop reconnection after explicit close", () => {
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
    const canal = crearCanalRele(url, tema, WS);

    // Open then close explicitly
    wsInstance.readyState = WS.OPEN;
    if (wsInstance.onopen) {
      wsInstance.onopen(new Event("open"));
    }
    canal.cerrar();

    // Simulate close event from the WebSocket (which would normally trigger reconnection)
    wsInstance.readyState = WS.CLOSED;
    if (wsInstance.onclose) {
      wsInstance.onclose(new CloseEvent("close"));
    }

    // Should not schedule a reconnection because cerradoManual is true
    expect(setTimeoutSpy).not.toHaveBeenCalled();
  });
});