import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';

// Mock WebSocket
class FalsoWS {
  static instancias: FalsoWS[] = [];
  url: string;
  enviados: string[] = [];
  private abierto = false;
  private listeners: ((event: MessageEvent) => void)[] = [];
  private closeListeners: (() => void)[] = [];

  constructor(url: string) {
    this.url = url;
    FalsoWS.instancias.push(this);
  }

  abrir() {
    this.abierto = true;
    // Trigger open event if any
    if (this._onopen) {
      this._onopen();
    }
  }

  caer() {
    this.abierto = false;
    // Trigger close event
    if (this._onclose) {
      this._onclose();
    }
  }

  llegar(data: string) {
    if (!this.abierto) return;
    const event = new MessageEvent("message", { data });
    if (this._onmessage) {
      this._onmessage(event);
    }
  }

  // WebSocket interface
  set onopen(fn: () => void) {
    this._onopen = fn;
  }
  get onopen() {
    return this._onopen;
  }
  set onmessage(fn: (event: MessageEvent) => void) {
    this._onmessage = fn;
  }
  get onmessage() {
    return this._onmessage;
  }
  set onclose(fn: () => void) {
    this._onclose = fn;
  }
  get onclose() {
    return this._onclose;
  }

  send(data: string) {
    if (this.abierto) {
      this.enviados.push(data);
    }
  }

  close() {
    this.abierto = false;
    if (this._onclose) {
      this._onclose();
    }
  }
}

// Reset mock instances before each test
afterEach(() => {
  FalsoWS.instancias = [];
});

// Function under test - we'll try to import it
let crearCanalRele: (url: string, tema: string, WSConstructor: typeof WebSocket) => any;

beforeAll(async () => {
  try {
    const mod = await import('@/lib/estaciones/canal-rele');
    crearCanalRele = mod.crearCanalRele;
  } catch (e) {
    console.error('Failed to import crearCanalRele:', e);
    // If import fails, we leave it as undefined and tests will fail.
  }
});

describe('crearCanalRele', () => {
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