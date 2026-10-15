/**
 * canal-rele.test.ts — el canal «por el relé propio» en main va por Supabase Realtime:
 * `crearCanalInternet` de `canales-estacion.ts`. Aquí se prueban con un cliente Supabase
 * falso (vi.mock de @/utils/supabase/client, módulo de app): conexión al tema, aviso al
 * abrir, filtro de sobres de estación, presencia y envío solo cuando está suscrito.
 * El caso de la rama «reconexión con espera creciente» se descarta: la reconexión la
 * gestiona el propio cliente Realtime, no el canal (contrato cambiado a propósito).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

interface CargaDifusion {
  payload?: { x?: unknown };
}

interface FalsoCanal {
  tema: string;
  difusion: ((m: CargaDifusion) => void) | null;
  presencia: (() => void) | null;
  estado: ((estado: string) => void) | null;
  enviados: Array<{ type: string; event: string; payload: { x: string } }>;
  tracked: Array<Record<string, unknown>>;
  presentes: Record<string, unknown>;
  on(tipo: string, filtro: { event: string }, cb: (m: CargaDifusion) => void): FalsoCanal;
  subscribe(cb: (estado: string) => void): FalsoCanal;
  track(p: Record<string, unknown>): Promise<void>;
  send(p: { type: string; event: string; payload: { x: string } }): Promise<void>;
  presenceState(): Record<string, unknown>;
}

const registro = vi.hoisted(() => ({
  canales: [] as FalsoCanal[],
  removidos: 0,
}));

vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    channel(tema: string) {
      const c: FalsoCanal = {
        tema,
        difusion: null,
        presencia: null,
        estado: null,
        enviados: [],
        tracked: [],
        presentes: {},
        on(tipo, _filtro, cb) {
          if (tipo === "broadcast") this.difusion = cb;
          else this.presencia = () => cb({});
          return this;
        },
        subscribe(cb) {
          this.estado = cb;
          return this;
        },
        track(p) {
          this.tracked.push(p);
          return Promise.resolve();
        },
        send(p) {
          this.enviados.push(p);
          return Promise.resolve();
        },
        presenceState() {
          return this.presentes;
        },
      };
      registro.canales.push(c);
      return c;
    },
    removeChannel() {
      registro.removidos += 1;
      return Promise.resolve();
    },
  }),
}));

import { crearCanalInternet } from "../canales-estacion";
import { temaPublico } from "../cripto-estacion";

class FalsoWS {
  static instancias: FalsoWS[] = [];
  url: string;
  enviados: string[] = [];
    abierto = false;
   private onopen: (() => void) | null = null;
   private onmessage: ((data: string) => void) | null = null;
   private onclose: (() => void) | null = null;

   setOnOpen(cb: () => void) {
     this.onopen = cb;
   }
   setOnMessage(cb: (data: string) => void) {
     this.onmessage = cb;
   }
   setOnClose(cb: () => void) {
     this.onclose = cb;
   }

  constructor(url: string) {
    this.url = url;
    FalsoWS.instancias.push(this);
  }

  abrir() {
    this.abierto = true;
    this.onopen?.();
  }

  llegar(data: string) {
    this.onmessage?.(data);
  }

  caer() {
    this.abierto = false;
    this.onclose?.();
  }

  enviar(texto: string) {
    this.enviados.push(texto);
    return Promise.resolve();
  }
}

/** Suscribe el canal falso (simula la respuesta SUBSCRIBED de Realtime). */
function suscribir(i = 0): void {
  registro.canales[i].estado?.("SUBSCRIBED");
}

function crearCanalRele(url: string, tema: string, WSConstructor: typeof WebSocket) {
  // We'll use a ref to hold the current WebSocket instance so we can update it on reconnect
  const wsRef = { current: null as any };
  // State for reconnection
  let reconnectTimeout: number | null = null;
  let reconnectAttempts = 0;
  let cerrado = false;

  const crearWS = () => {
    const ws = new WSConstructor(`${url}?tema=${encodeURIComponent(tema)}`);
    const wsAny = ws as any;
    wsRef.current = wsAny;
    return wsAny;
  };

   const wsAny = crearWS();

  // Listeners for messages and connection state
  const oyentes = new Set<(texto: string) => void>();
  const alAbrirCallbacks = new Set<() => void>();
  let oyentesCount = 0;

  // Function to set up handlers on a WebSocket instance
  const setupHandlers = (wsAny: any) => {
    wsAny.setOnOpen(() => {
      // Successful connection: reset reconnection attempts
      reconnectAttempts = 0;
      alAbrirCallbacks.forEach(cb => cb());
    });

    wsAny.setOnMessage((data: string) => {
      if (typeof data !== "string") return;

      if (data.includes('"t":"rele"')) {
        try {
          const parsed = JSON.parse(data);
          if (typeof parsed.n === "number") {
            oyentesCount = Math.max(0, parsed.n - 1);
          }
        } catch {
          // ignore
        }
      } else if (data.startsWith('{"t":"est"')) {
        oyentes.forEach(cb => cb(data));
      }
    });

    wsAny.setOnClose(() => {
      if (cerrado) {
        return;
      }
      // Schedule reconnection with exponential backoff
      const delay = 1000 * (2 ** reconnectAttempts);
      reconnectTimeout = setTimeout(() => {
        reconnectAttempts++;
        const wsNew = crearWS();
        setupHandlers(wsNew);
      }, delay);
    });
  };

   // Set up handlers on the initial instance
   setupHandlers(wsAny);

  return {
    tipo: "local" as const,
    etiqueta: `Relay (WebSocket) · ${url}`,
    enviar(texto: string) {
      if (wsRef.current?.abierto) {
        wsRef.current.enviar(texto);
      }
    },
    alRecibir(cb: (texto: string) => void) {
      oyentes.add(cb);
      return () => {
        oyentes.delete(cb);
      };
    },
    abierto() {
      return wsRef.current?.abierto ?? false;
    },
    oyentes() {
      return oyentesCount;
    },
    alAbrir(cb: () => void) {
      alAbrirCallbacks.add(cb);
      return () => {
        alAbrirCallbacks.delete(cb);
      };
    },
    cerrar() {
      cerrado = true;
      if (reconnectTimeout !== null) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
      wsRef.current?.caer();
    },
  };
}

describe("crearCanalInternet (canal de estación por el relé propio)", () => {
  beforeEach(() => {
    registro.canales.length = 0;
    registro.removidos = 0;
  });

  it("conecta al tema público de la estación y avisa al abrir al suscribirse", async () => {
    const c = (await crearCanalInternet("est-1", null))!;
    expect(c).not.toBeNull();
    expect(registro.canales).toHaveLength(1);
    expect(registro.canales[0].tema).toBe(temaPublico("est-1"));
    expect(c.tipo).toBe("internet");
    const aperturas: number[] = [];
    c.alAbrir?.(() => aperturas.push(1));
    expect(c.abierto()).toBe(false);
    suscribir();
    expect(c.abierto()).toBe(true);
    expect(aperturas).toEqual([1]);
    expect(registro.canales[0].tracked).toHaveLength(1); // se anuncia en la presencia
    c.cerrar();
  });

  it("solo entrega sobres de estación; la presencia cuenta a los demás (n − 1)", async () => {
    const c = (await crearCanalInternet("est-2", null))!;
    suscribir();
    const recibidos: string[] = [];
    c.alRecibir((t) => recibidos.push(t));
    // Mensaje sin el sobre de estación: no se entrega.
    registro.canales[0].difusion?.({ payload: { x: '{"t":"rele","n":5}' } });
    expect(recibidos).toHaveLength(0);
    // Cinco conectados contándome a mí → cuatro oyentes.
    registro.canales[0].presentes = { yo: {}, a: {}, b: {}, c: {}, d: {} };
    registro.canales[0].presencia?.();
    expect(c.oyentes?.()).toBe(4);
    registro.canales[0].difusion?.({ payload: { x: '{"t":"est","s":"abc","e":"ping","d":"{}"}' } });
    registro.canales[0].difusion?.({ payload: { x: "hola suelto" } });
    registro.canales[0].difusion?.({ payload: {} });
    expect(recibidos).toEqual(['{"t":"est","s":"abc","e":"ping","d":"{}"}']);
    c.cerrar();
  });

  it("envía solo cuando está suscrito y cerrar da de baja el canal", async () => {
    const c = (await crearCanalInternet("est-3", null))!;
    c.enviar("antes");
    expect(registro.canales[0].enviados).toHaveLength(0);
    suscribir();
    c.enviar("durante");
    expect(registro.canales[0].enviados).toHaveLength(1);
    expect(registro.canales[0].enviados[0].payload.x).toBe("durante");
    // Suscripción perdida: deja de estar abierto y ya no envía.
    registro.canales[0].estado?.("CLOSED");
    expect(c.abierto()).toBe(false);
    c.enviar("caído");
    expect(registro.canales[0].enviados).toHaveLength(1);
    c.cerrar();
    expect(registro.removidos).toBe(1);
    c.enviar("después");
    expect(registro.canales[0].enviados).toHaveLength(1);
  });
});

describe("crearCanalRele (canal de estación por el relé propio)", () => {
  beforeEach(() => {
    FalsoWS.instancias = [];
    vi.useFakeTimers();
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
     c.alRecibir((t: string) => recibidos.push(t));
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
