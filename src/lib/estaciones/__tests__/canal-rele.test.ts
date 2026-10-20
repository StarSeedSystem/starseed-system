/**
 * Pruebas de `crearCanalRele` (cliente del relé propio de estaciones): WebSocket falso inyectado y
 * temporizadores falsos de vitest. Abrir, recibir (solo sobres «est»), presencia («rele»), envío solo
 * con el socket abierto, reconexión con espera creciente (1, 2, 4… s) y el estado honesto del canal.
 * Casos 1-4 salen de la rama de origen S1010-EV-ORACLE-2 (adaptados a la API de hoy).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ESPERA_CONEXION_RELE_MS,
  ESPERA_RECONEXION_MAX_MS,
  crearCanalRele,
  estadoCanalRele,
  leerPresenciaRele,
  leerUrlRele,
  urlReleValida,
} from "../canal-rele";

const OPEN = 1;
const CLOSED = 3;
const SOBRE = '{"t":"est","s":"abc","e":"ping","d":"{}"}';

class FalsoWS {
  static instancias: FalsoWS[] = [];
  readyState = 0;
  url: string;
  enviados: string[] = [];
  cerrada = false;
  onopen: (() => void) | null = null;
  onmessage: ((ev: MessageEvent<unknown>) => void) | null = null;
  onclose: ((ev?: CloseEvent) => void) | null = null;
  constructor(u: string) {
    this.url = u;
    FalsoWS.instancias.push(this);
  }
  abrir(): void {
    this.readyState = OPEN;
    this.onopen?.();
  }
  caer(codigo?: number): void {
    this.readyState = CLOSED;
    this.onclose?.(codigo === undefined ? undefined : ({ code: codigo } as CloseEvent));
  }
  llegar(x: unknown): void {
    this.onmessage?.({ data: x } as MessageEvent<unknown>);
  }
  send(t: string): void {
    this.enviados.push(t);
  }
  close(): void {
    this.cerrada = true;
    this.readyState = CLOSED;
    this.onclose?.();
  }
}
const WS = FalsoWS as unknown as typeof WebSocket;
const URL_RELE = "wss://rele.x";

function nuevo(tema = "estacion-vivo:abcdefghijklmnopqrstuv", op: { esperaConexionMs?: number } = {}) {
  return crearCanalRele(tema, { url: URL_RELE, WebSocketImpl: WS, ...op });
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
    const c = crearCanalRele("tema uno", { url: URL_RELE, WebSocketImpl: WS });
    expect(FalsoWS.instancias).toHaveLength(1);
    expect(FalsoWS.instancias[0].url).toBe("wss://rele.x/ws?tema=tema%20uno");
    expect(c.tipo).toBe("rele");
    const aperturas: number[] = [];
    c.alAbrir?.(() => aperturas.push(1));
    expect(c.abierto()).toBe(false);
    expect(c.estado()).toEqual({ fase: "conectando", motivo: null });
    FalsoWS.instancias[0].abrir();
    expect(c.abierto()).toBe(true);
    expect(aperturas).toHaveLength(1);
    expect(c.estado()).toEqual({ fase: "abierto", motivo: null });
    c.cerrar();
  });

  it("el tema de una privada viaja codificado en la URL (los dos puntos no la rompen)", () => {
    const c = nuevo("estacion-p:0123456789abcdef0123456789abcdef");
    expect(FalsoWS.instancias[0].url).toBe("wss://rele.x/ws?tema=estacion-p%3A0123456789abcdef0123456789abcdef");
    c.cerrar();
  });

  it("solo entrega textos de estación; los de presencia actualizan oyentes y no se entregan", () => {
    const c = nuevo();
    const s = FalsoWS.instancias[0];
    s.abrir();
    const recibidos: string[] = [];
    c.alRecibir((t) => recibidos.push(t));
    expect(c.oyentes?.()).toBeNull(); // sin presencia aún: no se inventa un número
    s.llegar('{"t":"rele","n":5}');
    expect(recibidos).toHaveLength(0);
    expect(c.oyentes?.()).toBe(4);
    s.llegar(SOBRE);
    s.llegar("hola suelto");
    s.llegar({ no: "es texto" });
    s.llegar(new ArrayBuffer(4));
    expect(recibidos).toEqual([SOBRE]);
    c.cerrar();
  });

  it("la presencia con 1 conectado (solo yo) son 0 oyentes; una presencia mal formada se ignora", () => {
    const c = nuevo();
    const s = FalsoWS.instancias[0];
    s.abrir();
    s.llegar('{"t":"rele","n":1}');
    expect(c.oyentes?.()).toBe(0);
    s.llegar('{"t":"rele","n":-3}');
    s.llegar('{"t":"rele","n":"7"}');
    s.llegar('{"t":"rele","n":2.5}');
    s.llegar('{"t":"rele"');
    expect(c.oyentes?.()).toBe(0); // sigue el último dato válido
    c.cerrar();
  });

  it("al caerse deja de dar un número de oyentes que ya no es verdad", () => {
    const c = nuevo();
    const s = FalsoWS.instancias[0];
    s.abrir();
    s.llegar('{"t":"rele","n":9}');
    expect(c.oyentes?.()).toBe(8);
    s.caer();
    expect(c.oyentes?.()).toBeNull();
    c.cerrar();
  });

  it("envía solo cuando está abierto, y solo sobres de estación de tamaño razonable", () => {
    const c = nuevo();
    const s = FalsoWS.instancias[0];
    c.enviar(SOBRE);
    s.abrir();
    c.enviar(SOBRE);
    c.enviar("durante");
    c.enviar(`{"t":"est"${"x".repeat(40_000)}`);
    expect(s.enviados).toEqual([SOBRE]);
    s.caer();
    c.enviar(SOBRE);
    expect(s.enviados).toEqual([SOBRE]);
    c.cerrar();
  });

  it("reconecta con espera creciente (1, 2, 4…) y cerrar frena la reconexión", () => {
    const c = nuevo();
    FalsoWS.instancias[0].abrir();
    FalsoWS.instancias[0].caer();
    expect(FalsoWS.instancias).toHaveLength(1);
    expect(c.estado().fase).toBe("error");
    expect(c.estado().motivo).toMatch(/reintenta en 1 s/);
    vi.advanceTimersByTime(999);
    expect(FalsoWS.instancias).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FalsoWS.instancias).toHaveLength(2);
    FalsoWS.instancias[1].caer();
    expect(c.estado().motivo).toMatch(/reintenta en 2 s/);
    vi.advanceTimersByTime(1_999);
    expect(FalsoWS.instancias).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FalsoWS.instancias).toHaveLength(3);
    FalsoWS.instancias[2].caer();
    expect(c.estado().motivo).toMatch(/reintenta en 4 s/);
    c.cerrar();
    vi.advanceTimersByTime(60_000);
    expect(FalsoWS.instancias).toHaveLength(3);
    expect(c.estado()).toEqual({ fase: "cerrado", motivo: null });
  });

  it("la espera no pasa de 30 s", () => {
    const c = nuevo(undefined, { esperaConexionMs: 3_600_000 }); // aquí solo importa el tope de la reconexión
    for (let i = 0; i < 9; i++) {
      FalsoWS.instancias[i].caer();
      vi.advanceTimersByTime(ESPERA_RECONEXION_MAX_MS);
    }
    expect(FalsoWS.instancias).toHaveLength(10);
    FalsoWS.instancias[9].caer();
    expect(c.estado().motivo).toMatch(/reintenta en 30 s/);
    c.cerrar();
  });

  it("una conexión que aguanta abierta 10 s o más vuelve a esperar 1 s; una que cae al instante, no", () => {
    const c = nuevo();
    FalsoWS.instancias[0].caer();
    vi.advanceTimersByTime(1_000);
    FalsoWS.instancias[1].caer();
    vi.advanceTimersByTime(2_000);
    FalsoWS.instancias[2].abrir();
    vi.advanceTimersByTime(5_000);
    FalsoWS.instancias[2].caer(); // aguantó 5 s: aún no es sana
    expect(c.estado().motivo).toMatch(/reintenta en 4 s/);
    vi.advanceTimersByTime(4_000);
    FalsoWS.instancias[3].abrir();
    vi.advanceTimersByTime(10_000);
    FalsoWS.instancias[3].caer(); // aguantó 10 s: sana
    expect(c.estado().motivo).toMatch(/reintenta en 1 s/);
    c.cerrar();
  });

  it("un socket que no abre en 10 s se da por caído, con su motivo, y se reintenta", () => {
    const c = nuevo();
    expect(c.estado().fase).toBe("conectando");
    vi.advanceTimersByTime(ESPERA_CONEXION_RELE_MS - 1);
    expect(c.estado().fase).toBe("conectando");
    vi.advanceTimersByTime(1);
    expect(c.estado().fase).toBe("error");
    expect(c.estado().motivo).toBe("sin respuesta del relé en 10 s; reintenta en 1 s");
    expect(FalsoWS.instancias[0].cerrada).toBe(true);
    vi.advanceTimersByTime(1_000);
    expect(FalsoWS.instancias).toHaveLength(2);
    // Tras fallar, sigue en «error» (no parpadea a «conectando») hasta que abra de verdad.
    expect(c.estado().fase).toBe("error");
    FalsoWS.instancias[1].abrir();
    expect(c.estado()).toEqual({ fase: "abierto", motivo: null });
    vi.advanceTimersByTime(60_000);
    expect(c.estado().fase).toBe("abierto"); // el temporizador de espera quedó anulado al abrir
    c.cerrar();
  });

  it("los eventos de un socket viejo no tocan al canal", () => {
    const c = nuevo();
    const viejo = FalsoWS.instancias[0];
    vi.advanceTimersByTime(ESPERA_CONEXION_RELE_MS); // lo abandona
    vi.advanceTimersByTime(1_000);
    const nuevoS = FalsoWS.instancias[1];
    nuevoS.abrir();
    viejo.abrir();
    viejo.llegar(SOBRE);
    viejo.caer(1006);
    expect(c.abierto()).toBe(true);
    expect(FalsoWS.instancias).toHaveLength(2);
    c.cerrar();
  });

  it("el motivo de la caída sale del código de cierre, sin direcciones ni el tema", () => {
    const c = nuevo("estacion-vivo:abcdefghijklmnopqrstuv");
    FalsoWS.instancias[0].caer(1008);
    expect(c.estado().motivo).toMatch(/rechazó la sala/);
    vi.advanceTimersByTime(1_000);
    FalsoWS.instancias[1].caer(1013);
    expect(c.estado().motivo).toMatch(/saturado/);
    vi.advanceTimersByTime(2_000);
    FalsoWS.instancias[2].caer(1006);
    const m = c.estado().motivo ?? "";
    expect(m).toMatch(/código 1006/);
    expect(m).not.toMatch(/wss:|rele\.x|abcdefghijklmnopqrstuv/);
    c.cerrar();
  });

  it("estadoCanalRele() sigue al canal vivo de la pestaña y se vacía al cerrar", () => {
    expect(estadoCanalRele()).toBeNull();
    const c = nuevo();
    expect(estadoCanalRele()).toEqual({ fase: "conectando", motivo: null });
    FalsoWS.instancias[0].abrir();
    expect(estadoCanalRele()).toEqual({ fase: "abierto", motivo: null });
    c.cerrar();
    expect(estadoCanalRele()).toBeNull();
  });

  it("cerrar suelta el socket, los temporizadores y los avisados", () => {
    const c = nuevo();
    const llegados: string[] = [];
    const aperturas: number[] = [];
    c.alRecibir((t) => llegados.push(t));
    c.alAbrir?.(() => aperturas.push(1));
    const s = FalsoWS.instancias[0];
    c.cerrar();
    expect(s.cerrada).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    s.abrir();
    s.llegar(SOBRE);
    expect(llegados).toHaveLength(0);
    expect(aperturas).toHaveLength(0);
    expect(c.abierto()).toBe(false);
    c.cerrar(); // idempotente
  });

  it("la baja de alRecibir deja de entregar", () => {
    const c = nuevo();
    const s = FalsoWS.instancias[0];
    s.abrir();
    const llegados: string[] = [];
    const baja = c.alRecibir((t) => llegados.push(t));
    s.llegar(SOBRE);
    baja();
    s.llegar(SOBRE);
    expect(llegados).toHaveLength(1);
    c.cerrar();
  });

  it("un avisado o un oyente que lanza no tumba el canal", () => {
    const c = nuevo();
    const s = FalsoWS.instancias[0];
    c.alAbrir?.(() => {
      throw new Error("roto");
    });
    c.alRecibir(() => {
      throw new Error("roto");
    });
    expect(() => s.abrir()).not.toThrow();
    expect(() => s.llegar(SOBRE)).not.toThrow();
    expect(c.abierto()).toBe(true);
    c.cerrar();
  });

  describe("sin lanzar nunca: lo que no se puede hacer queda dicho en el estado", () => {
    it("sin WebSocket (null) queda en error con su motivo y no reintenta", () => {
      const c = crearCanalRele("t", { url: URL_RELE, WebSocketImpl: null });
      expect(c.estado()).toEqual({ fase: "error", motivo: "este navegador no trae WebSocket" });
      expect(c.abierto()).toBe(false);
      c.enviar(SOBRE);
      vi.advanceTimersByTime(120_000);
      expect(vi.getTimerCount()).toBe(0);
      c.cerrar();
    });

    it("una dirección no válida no abre ningún socket", () => {
      for (const url of ["http://rele.x", "ws://rele.x", "wss://u:p@rele.x", "wss://rele.x/otra", "no es una url", ""]) {
        const c = crearCanalRele("t", { url, WebSocketImpl: WS });
        expect(c.estado().fase).toBe("error");
        expect(c.estado().motivo).toMatch(/dirección del relé no es válida/);
        c.cerrar();
      }
      expect(FalsoWS.instancias).toHaveLength(0);
    });

    it("si el constructor lanza (contenido mixto, política de seguridad), lo dice y reintenta despacio", () => {
      class Prohibido {
        constructor() {
          throw new DOMException("bloqueado", "SecurityError");
        }
      }
      const c = crearCanalRele("t", { url: URL_RELE, WebSocketImpl: Prohibido as unknown as typeof WebSocket });
      expect(c.estado()).toEqual({ fase: "error", motivo: "el navegador no dejó abrir la conexión con el relé" });
      c.cerrar();
      expect(vi.getTimerCount()).toBe(0);
    });

    it("send que lanza entre medias no rompe el envío", () => {
      const c = nuevo();
      const s = FalsoWS.instancias[0];
      s.abrir();
      s.send = () => {
        throw new Error("InvalidStateError");
      };
      expect(() => c.enviar(SOBRE)).not.toThrow();
      c.cerrar();
    });

    it("sin indicar WebSocketImpl se usa el WebSocket global del entorno", () => {
      vi.stubGlobal("WebSocket", FalsoWS);
      try {
        const c = crearCanalRele("t", { url: URL_RELE });
        expect(FalsoWS.instancias).toHaveLength(1);
        expect(FalsoWS.instancias[0].url).toBe("wss://rele.x/ws?tema=t");
        c.cerrar();
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

  it("usa los temporizadores sin receptor (OPD1010): un setTimeout estricto no lanza «Illegal invocation»", () => {
    const original = globalThis.setTimeout;
    const originalClear = globalThis.clearTimeout;
    const estricto = function (this: unknown, fn: () => void, ms?: number) {
      if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation");
      return original(fn, ms);
    };
    const estrictoClear = function (this: unknown, h?: Parameters<typeof clearTimeout>[0]) {
      if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation");
      return originalClear(h);
    };
    globalThis.setTimeout = estricto as unknown as typeof setTimeout;
    globalThis.clearTimeout = estrictoClear as unknown as typeof clearTimeout;
    try {
      const c = nuevo();
      FalsoWS.instancias[0].abrir();
      FalsoWS.instancias[0].caer();
      vi.advanceTimersByTime(1_000);
      expect(FalsoWS.instancias).toHaveLength(2);
      expect(() => c.cerrar()).not.toThrow();
    } finally {
      globalThis.setTimeout = original;
      globalThis.clearTimeout = originalClear;
    }
  });
});

describe("urlReleValida", () => {
  it("acepta wss://host[:puerto] y ws:// solo en localhost, y devuelve la base normalizada", () => {
    expect(urlReleValida("wss://rele.x")).toBe("wss://rele.x");
    expect(urlReleValida(" wss://rele.x/ ")).toBe("wss://rele.x");
    expect(urlReleValida("wss://rele.x:8443")).toBe("wss://rele.x:8443");
    expect(urlReleValida("ws://localhost:8787")).toBe("ws://localhost:8787");
    expect(urlReleValida("ws://127.0.0.1:8787")).toBe("ws://127.0.0.1:8787");
  });

  it("rechaza ws:// remoto, https, credenciales, ruta, parámetros, fragmento, vacío y larguísimas", () => {
    for (const u of [
      "ws://rele.x", "https://rele.x", "http://localhost", "wss://u:p@rele.x", "wss://rele.x/ws", "wss://rele.x/?a=1",
      "wss://rele.x#h", "", "   ", "wss://", "javascript:alert(1)", `wss://${"a".repeat(300)}.x`,
    ]) {
      expect(urlReleValida(u), u).toBeNull();
    }
    expect(urlReleValida(undefined)).toBeNull();
    expect(urlReleValida(42)).toBeNull();
    expect(urlReleValida(null)).toBeNull();
  });
});

describe("leerUrlRele", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("sin variable no hay relé; con una válida, su base; con una no válida, nada", () => {
    vi.stubEnv("NEXT_PUBLIC_ESTACIONES_RELE_URL", "");
    expect(leerUrlRele()).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_ESTACIONES_RELE_URL", "wss://rele.x/");
    expect(leerUrlRele()).toBe("wss://rele.x");
    vi.stubEnv("NEXT_PUBLIC_ESTACIONES_RELE_URL", "ws://rele.x");
    expect(leerUrlRele()).toBeNull();
  });

  it("un valor explícito manda sobre la variable (pruebas)", () => {
    vi.stubEnv("NEXT_PUBLIC_ESTACIONES_RELE_URL", "wss://de-entorno.x");
    expect(leerUrlRele("wss://explicita.x")).toBe("wss://explicita.x");
    expect(leerUrlRele(null)).toBeNull();
  });
});

describe("leerPresenciaRele", () => {
  it("devuelve el número de conectados de un mensaje válido y null de cualquier otra cosa", () => {
    expect(leerPresenciaRele('{"t":"rele","n":5}')).toBe(5);
    expect(leerPresenciaRele('{"t":"rele","n":0}')).toBe(0);
    expect(leerPresenciaRele('{"t":"rele","n":1000001}')).toBeNull();
    expect(leerPresenciaRele('{"t":"est","n":5}')).toBeNull();
    expect(leerPresenciaRele(SOBRE)).toBeNull();
    expect(leerPresenciaRele("")).toBeNull();
  });
});
