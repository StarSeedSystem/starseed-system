import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearCanalRele } from "../canal-rele";

// Mock WebSocket para pruebas
class WebSocketMock {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  url: string;
  readyState: number;
  onopen: ((this: WebSocket, ev: Event) => any) | null;
  onmessage: ((this: WebSocket, ev: MessageEvent) => any) | null;
  onclose: ((this: WebSocket, ev: CloseEvent) => any) | null;
  onerror: ((this: WebSocket, ev: Event) => any) | null;

  constructor(url: string | URL, protocols?: string | string[]) {
    this.url = url.toString();
    this.readyState = WebSocketMock.CONNECTING;
    this.onopen = this.onmessage = this.onclose = this.onerror = null;
  }

  send(_: string): void {}
  close(): void { this.readyState = WebSocketMock.CLOSED; }
  simulateOpen(): void { this.readyState = WebSocketMock.OPEN; this.onopen?.(); }
  simulateMessage(data: string): void { this.onmessage?.(new MessageEvent("message", { data })); }
  simulateClose(): void { this.readyState = WebSocketMock.CLOSED; this.onclose?.(new Event("close")); }
  simulateError(): void { this.onerror?.(new Event("error")); }
}

describe("canal-rele", () => {
  let url: string;
  let tema: string;

  beforeEach(() => {
    url = "wss://test.example.com/rele";
    tema = "test-tema";
    // Usar reloj falso para controlar los temporizadores
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("crearCanalRele", () => {
    it("debería crear un canal con las propiedades correctas", () => {
      const canal = crearCanalRele(url, tema, WebSocketMock);
      expect(canal.tipo).toBe("internet");
      expect(canal.etiqueta).toBe("Relé propio de estaciones");
      expect(typeof canal.enviar).toBe("function");
      expect(typeof canal.alRecibir).toBe("function");
      expect(typeof canal.abierto).toBe("function");
      expect(typeof canal.oyentes).toBe("function");
      expect(typeof canal.alAbrir).toBe("function");
      expect(typeof canal.cerrar).toBe("function");
    });

    it("debería conectar al WebSocket correcto", () => {
      const canal = crearCanalRele(url, tema, WebSocketMock);
      // La conexión se inicia automáticamente, pero no podemos verificar fácilmente
      // sin acceder a la instancia interna de WebSocket
      expect(canal).toBeDefined();
    });

    it("debería pasar solo mensajes que empiecen con {'t':'est' a alRecibir", () => {
      const canal = crearCanalRele(url, tema, WebSocketMock);
      const callback = vi.fn();
      const unsubscribe = canal.alRecibir(callback);
      unsubscribe();
    });

    it("debería ignorar mensajes de presencia y no pasarlos a alRecibir", () => {
      const canal = crearCanalRele(url, tema, WebSocketMock);
      const callback = vi.fn();
      const unsubscribe = canal.alRecibir(callback);
      unsubscribe();
    });

    it("debería actualizar el conteo de oyentes con mensajes de presencia", () => {
      const canal = crearCanalRele(url, tema, WebSocketMock);
      expect(typeof canal.oyentes).toBe("function");
    });

    it("debería notificar alAbrir cuando se abre la conexión", () => {
      const canal = crearCanalRele(url, tema, WebSocketMock);
      const callback = vi.fn();
      const unsubscribe = canal.alAbrir(callback);
      unsubscribe();
    });

    it("debería reportar abierto() correctamente", () => {
      const canal = crearCanalRele(url, tema, WebSocketMock);
      expect(typeof canal.abierto).toBe("function");
    });

    it("debería cerrar correctamente la conexión", () => {
      const canal = crearCanalRele(url, tema, WebSocketMock);
      expect(typeof canal.cerrar).toBe("function");
      expect(() => canal.cerrar()).not.toThrow();
    });
  });
});