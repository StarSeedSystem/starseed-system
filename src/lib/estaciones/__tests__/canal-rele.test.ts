import { describe, it, expect, vi, beforeEach } from "vitest";
import { crearCanalRele } from "../canal-rele";
import type { CanalRele } from "../canal-rele";

interface FalsoWS extends EventTarget {
  url: string;
  listening: boolean;
  agregarEventoListener(tipo: string, manejador: (evento: any) => void): void;
  abrir(): void;
  caer(): void;
  enviar?(texto: string): void;
  llegar(datos: string): void;
}

class FalsoWSClass {
  static instancias: FalsoWS[] = [];
  
  url: string;
  listening: boolean = false;
  private manejadores: Map<string, ((evento: any) => void)[]> = new Map();
  
  constructor(url: string) {
    this.url = url;
    FalsoWSClass.instancias.push(this as any);
  }
  
  agregarEventoListener(tipo: string, manejador: (evento: any) => void) {
    if (!this.manejadores.has(tipo)) {
      this.manejadores.set(tipo, []);
    }
    this.manejadores.get(tipo)?.push(manejador);
  }
  
  dispararEvento(tipo: string, evento?: any) {
    this.manejadores.get(tipo)?.forEach(manejador => manejador(evento));
  }
  
  abrir() {
    this.listening = true;
    this.dispararEvento("open");
  }
  
  caer() {
    this.listening = false;
    this.dispararEvento("close");
  }
  
  enviar(texto: string) {
    (this as any).enviados ??= [];
    (this as any).enviados.push(texto);
  }
  
  llegar(datos: string) {
    this.dispararEvento("message", { data: datos });
  }
}

function resetFalsoWS() {
  FalsoWSClass.instancias = [];
}

const FalsoWS = FalsoWSClass as unknown as typeof WebSocket;

function crearCanalConFalsoWS(url: string, tema: string): CanalRele {
  return crearCanalRele(url, tema, FalsoWS as unknown as typeof WebSocket);
}

beforeEach(() => {
  vi.useFakeTimers();
});

function suscribir(i = 0): void {
  FalsoWS.instancias[i].abrir();
}

describe("crearCanalRele (canal de estación por el relé propio)", () => {
  beforeEach(() => {
    vi.clearAllTimers();
    resetFalsoWS();
  });

  it("conecta al tema público de la estación y avisa al abrir al suscribirse", () => {
    const c = crearCanalConFalsoWS("wss://est-1", "tema-publico");
    expect(FalsoWS.instancias).toHaveLength(1);
    expect(FalsoWS.instancias[0].url).toBe("wss://est-1?tema=tema-publico");
    const aperturas: number[] = [];
    c.alAbrir?.(() => aperturas.push(1));
    expect(c.abierto()).toBe(false);
    suscribir();
    expect(c.abierto()).toBe(true);
    expect(aperturas).toEqual([1]);
    c.cerrar();
  });

  it("solo entrega textos de estación; los de presencia actualizan oyentes", () => {
    const c = crearCanalConFalsoWS("wss://r", "t", FalsoWS as unknown as typeof WebSocket);
    const s = FalsoWS.instancias[0];
    s.abrir();
    const recibidos: string[] = [];
    c.alRecibir((t) => recibidos.push(t));
    s.llegar('{"t":"rele","n":5}');
    expect(recibidos).toHaveLength(0);
    expect(c.oyentes?.()).toBe(1);
    s.llegar('{"t":"est","s":"abc","e":"ping","d":"{}"}');
    s.llegar("hola suelto");
    expect(recibidos).toEqual(['{"t":"est","s":"abc","e":"ping","d":"{}"}']);
    c.cerrar();
  });

  it("envía solo cuando está abierto", () => {
    const c = crearCanalConFalsoWS("wss://r", "t", FalsoWS as unknown as typeof WebSocket);
    const s = FalsoWS.instancias[0];
    c.enviar("antes");
    s.abrir();
    c.enviar("durante");
    expect(s.enviados).toEqual(["durante"]);
    c.cerrar();
  });

  it("reconecta con espera creciente (1, 2, 4…) y cerrar frena la reconexión", () => {
    const c = crearCanalConFalsoWS("wss://r", "t", FalsoWS as unknown as typeof WebSocket);
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