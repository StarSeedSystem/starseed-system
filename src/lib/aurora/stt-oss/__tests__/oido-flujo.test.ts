/// <reference types="vitest" />
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { abrirFlujoOido, type FlujoOido } from "../oido-flujo";

describe("abrirFlujoOido", () => {
  let wsMock: {
    send: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    binaryType: string;
    onopen: null | ((this: WebSocket, ev: Event) => any);
    onmessage: null | ((this: WebSocket, ev: MessageEvent) => any);
    onerror: null | ((this: WebSocket, ev: Event) => any);
    onclose: null | ((this: WebSocket, ev: Event) => any);
    readyState: number;
  };
  let WebSocketImpl: typeof WebSocket;
  let flujo: FlujoOido;
  let mockAlParcial: ReturnType<typeof vi.fn>;
  let mockAlFinal: ReturnType<typeof vi.fn>;
  let mockAlCerrar: ReturnType<typeof vi.fn>;

  const URL_DE_PRUEBA = "wss://example.com/v1/audio/stream";

  beforeEach(() => {
    // Mock de WebSocket
    wsMock = {
      send: vi.fn(),
      close: vi.fn(),
      binaryType: "",
      onopen: null,
      onmessage: null,
      onerror: null,
      onclose: null,
      readyState: 1, // WebSocket.OPEN
    };
    WebSocketImpl = vi.fn(() => wsMock);
    WebSocketImpl.mockImplementation(() => wsMock);

    mockAlParcial = vi.fn();
    mockAlFinal = vi.fn();
    mockAlCerrar = vi.fn();

    flujo = abrirFlujoOido({
      url: URL_DE_PRUEBA,
      WebSocketImpl,
      alParcial: mockAlParcial,
      alFinal: mockAlFinal,
      alCerrar: mockAlCerrar,
    });

    // Simular que la conexión se abre
    if (wsMock.onopen) {
      wsMock.onopen.call(wsMock, new Event("open"));
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("crea una instancia de WebSocket con la URL correcta", () => {
    expect(WebSocketImpl).toHaveBeenCalledWith(URL_DE_PRUEBA);
  });

  it("establece binaryType a 'arraybuffer'", () => {
    expect(wsMock.binaryType).toBe("arraybuffer");
  });

  it("envía datos binarios cuando se llama a enviar", () => {
    const pcm = new Int16Array([0, 1, -1, 32767, -32768]);
    flujo.enviar(pcm);
    expect(wsMock.send).toHaveBeenCalledWith(pcm.buffer);
  });

  it("no envía datos si el WebSocket no está abierto", () => {
    // Simular que el WebSocket se cierra
    wsMock.readyState = 3; // WebSocket.CLOSED
    const pcm = new Int16Array([0]);
    flujo.enviar(pcm);
    expect(wsMock.send).not.toHaveBeenCalled();
  });

  it("llama alParcial cuando recibe un mensaje parcial", () => {
    const mensaje = { partial: "hola" };
    const event = new MessageEvent("message", {
      data: JSON.stringify(mensaje),
    });
    if (wsMock.onmessage) {
      wsMock.onmessage.call(wsMock, event);
    }
    expect(mockAlParcial).toHaveBeenCalledWith("hola");
  });

  it("llama alFinal cuando recibe un mensaje final", () => {
    const mensaje = { final: "mundo" };
    const event = new MessageEvent("message", {
      data: JSON.stringify(mensaje),
    });
    if (wsMock.onmessage) {
      wsMock.onmessage.call(wsMock, event);
    }
    expect(mockAlFinal).toHaveBeenCalledWith("mundo");
  });

  it("llama alCerrar cuando el WebSocket se cierra", () => {
    const event = typeof CloseEvent !== 'undefined'
      ? new CloseEvent('close')
      : new Event('close');
    if (wsMock.onclose) {
      wsMock.onclose.call(wsMock, event);
    }
    expect(mockAlCerrar).toHaveBeenCalled();
  });

  it("terminar cierra el WebSocket", () => {
    flujo.terminar();
    expect(wsMock.close).toHaveBeenCalled();
  });

  it("cancelar cierra el WebSocket con código 1000", () => {
    flujo.cancelar();
    expect(wsMock.close).toHaveBeenCalledWith(1000, "Cancelado por el usuario");
  });

  it("no llama a los callbacks después de cerrar", () => {
    // Cerrar el WebSocket
    const closeEvent = typeof CloseEvent !== 'undefined'
      ? new CloseEvent('close')
      : new Event('close');
    if (wsMock.onclose) {
      wsMock.onclose.call(wsMock, closeEvent);
    }

    // Intentar enviar datos después de cerrar
    const pcm = new Int16Array([0]);
    flujo.enviar(pcm);
    expect(wsMock.send).not.toHaveBeenCalled();

    // Simular un mensaje después de cerrar
    const mensaje = { partial: "debería ser ignorado" };
    const event = new MessageEvent("message", {
      data: JSON.stringify(mensaje),
    });
    if (wsMock.onmessage) {
      wsMock.onmessage.call(wsMock, event);
    }
    expect(mockAlParcial).not.toHaveBeenCalledWith("debería ser ignorado");
  });
});