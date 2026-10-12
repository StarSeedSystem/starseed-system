import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { crearCanalRele } from "../canal-rele";

// Mock WebSocket class matching the one used in the test cases
class FalsoWS {
  static instancias: FalsoWS[] = [];
  url: string;
  enviados: string[] = [];
  readyState: number;
  
  // WebSocket constants
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  
  onopen: ((this: WebSocket, ev: Event) => any) | null = null;
  onclose: ((this: WebSocket, ev: Event) => any) | null = null;
  onmessage: ((this: WebSocket, ev: MessageEvent) => any) | null = null;
  onerror: ((this: WebSocket, ev: Event) => any) | null = null;
  
  constructor(url: string) {
    this.url = url;
    this.enviados = [];
    this.readyState = FalsoWS.CLOSED; // Start as closed
    FalsoWS.instancias.push(this);
  }
  
  abrir() {
    // Simulate opening - this should trigger the onopen callback in the implementation
    this.readyState = FalsoWS.OPEN;
    if (this.onopen) {
      this.onopen();
    }
  }
  
  caer() {
    // Simulate closing/failing - this should trigger the onclose callback in the implementation
    // But don't remove from instancias - the test expects instances to accumulate
    this.readyState = FalsoWS.CLOSED;
    if (this.onclose) {
      this.onclose();
    }
  }
  
  llegar(data: string) {
    // Simulate receiving data - this would trigger the onmessage callback
    if (this.onmessage) {
      this.onmessage({ data } as MessageEvent);
    }
  }
  
  send(data: string) {
    // Simulate sending data
    this.enviados.push(data);
  }
  
  close() {
    // Standard WebSocket close method
    this.readyState = FalsoWS.CLOSED;
    if (this.onclose) {
      this.onclose();
    }
  }
}

describe("crearCanalRele", () => {
  beforeEach(() => {
    // Clear instances before each test
    FalsoWS.instancias = [];
    // Use fake timers for reconnection tests
    vi.useFakeTimers();
  });
  
  afterEach(() => {
    // Restore real timers after each test
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