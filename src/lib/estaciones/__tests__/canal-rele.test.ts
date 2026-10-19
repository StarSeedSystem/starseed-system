import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearCanalRele } from "../canales-estacion";

// Mock WebSocket
class FalsoWS {
  static instancias: FalsoWS[] = [];
  url: string;
  readonly OPEN = 1;
  readonly CLOSED = 3;
  readyState: number = 3; // start as CLOSED
  readonly listeners: { [event: string]: ((data: any) => void)[] } = {};
  enviados: string[] = [];

  constructor(url: string, protocols?: string | string[]) {
    FalsoWS.instancias.push(this);
    this.url = url;
    // Simulate protocols if needed
  }

  abrir() {
    this.readyState = this.OPEN;
    this.listeners.open?.forEach((cb) => cb());
  }

  caer() {
    this.readyState = this.CLOSED;
    this.listeners.close?.forEach((cb) => cb());
  }

  llegar(data: any) {
    if (this.readyState === this.OPEN) {
      this.listeners.message?.forEach((cb) => cb(typeof data === "string" ? data : JSON.stringify(data)));
    }
  }

  enviar(data: string) {
    if (this.readyState === this.OPEN) {
      this.enviados.push(data);
    }
    // If not open, we don't send (as per the test expectations)
  }

  addEventListener(event: string, cb: (data: any) => void) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(cb);
  }

  removeEventListener(event: string, cb: (data: any) => void) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter((listener) => listener !== cb);
    }
  }
}

describe("crearCanalRele", () => {
  beforeEach(() => {
    FalsoWS.instancias = [];
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("conecta al tema en la URL y avisa al abrir", () => {
    const c = crearCanalRele("wss://rele.x/ws", "tema uno", FalsoWS as unknown as typeof WebSocket);
    expect(FalsoWS.instancias).toHaveLength(1);
    expect(FalsoWS.instancias[0].url).toBe("wss://rele.x/ws?tema=tema%20uno");
    const aperturas: number[] = [];
    c.alAbrir?.(() => aperturas.push(1));
    expect(c.abierto()).toBe(false);
    FalsoWS.instancias[0].abrir();
    expect(c.abierto()).toBe(true);
    expect(aperturas).toHaveLength(1);
    c.cerrar();
  });

  it("solo entrega textos de estación; los de presencia actualizan oyentes", () => {
    const c = crearCanalRele("wss://r", "t", FalsoWS as unknown as typeof WebSocket);
    const s = FalsoWS.instancias[0];
    s.abrir();
    const recibidos: string[] = [];
    c.alRecibir((t) => recibidos.push(t));
    s.llegar('{"t":"rele","n":5}');
    expect(recibidos).toHaveLength(0);
    expect(c.oyentes?.()).toBe(4);
    s.llegar('{"t":"est","s":"abc","e":"ping","d":"{}"}');
    s.llegar("hola suelto");
    expect(recibidos).toEqual(['{"t":"est","s":"abc","e":"ping","d":"{}"}']);
    c.cerrar();
  });

  it("envía solo cuando está abierto", () => {
    const c = crearCanalRele("wss://r", "t", FalsoWS as unknown as typeof WebSocket);
    const s = FalsoWS.instancias[0];
    c.enviar("antes");
    s.abrir();
    c.enviar("durante");
    expect(s.enviados).toEqual(["durante"]);
    c.cerrar();
  });

  it("reconecta con espera creciente (1, 2, 4…) y cerrar frena la reconexión", () => {
    const c = crearCanalRele("wss://r", "t", FalsoWS as unknown as typeof WebSocket);
    FalsoWS.instancias[0].abrir();
    FalsoWS.instancias[0].caer();
    expect(FalsoWS.instancias).toHaveLength(1);
    vi.advanceTimersByTime(999);
    expect(FalsoWS.instancias).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FalsoWS.instancias).toHaveLength(2);
    FalsoWS.instancias[1].caer();
    vi.advanceTimersByTime(2_000);
    expect(FalsoWS.instancias).toHaveLength(3);
    FalsoWS.instancias[2].caer();
    c.cerrar();
    vi.advanceTimersByTime(60_000);
    expect(FalsoWS.instancias).toHaveLength(3);
  });
});