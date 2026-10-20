/**
 * Pruebas directas de `crearCanalInternet` (Supabase Realtime) con un cliente falso: tema público y
 * privado, aviso al abrir, filtro de sobres de estación, presencia (n − 1), envío solo suscrito y baja
 * al cerrar. También `motivoSeguro`.
 *
 * Origen: las tres pruebas de la rama de la nube de RTS1010-EV-ORACLE-2d se llamaban `canal-rele.test.ts`
 * pero probaban ESTE canal (Supabase), no el relé propio; son válidas y viven aquí. El caso «reconexión
 * con espera creciente» de aquella rama no aplica a este canal (la reconexión la hace el cliente
 * Realtime) y se prueba, ahora sí, en `canal-rele.test.ts` con el relé de verdad.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

interface CargaDifusion {
  payload?: { x?: unknown };
}
interface Envio {
  type: string;
  event: string;
  payload: { x: string };
}
interface FalsoCanal {
  tema: string;
  difusion: ((m: CargaDifusion) => void) | null;
  presencia: (() => void) | null;
  estado: ((estado: string, err?: unknown) => void) | null;
  enviados: Envio[];
  rastreados: Array<Record<string, unknown>>;
  presentes: Record<string, unknown>;
  on(tipo: string, filtro: { event: string }, cb: (m: CargaDifusion) => void): FalsoCanal;
  subscribe(cb: (estado: string, err?: unknown) => void): FalsoCanal;
  track(p: Record<string, unknown>): Promise<void>;
  send(p: Envio): Promise<void>;
  presenceState(): Record<string, unknown>;
}

const registro = vi.hoisted(() => ({
  canales: [] as FalsoCanal[],
  quitados: 0,
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
        rastreados: [],
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
          this.rastreados.push(p);
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
      registro.quitados += 1;
      return Promise.resolve();
    },
  }),
}));

import { crearCanalInternet, motivoSeguro } from "../canales-estacion";
import { temaPrivado, temaPublico } from "../cripto-estacion";

/** Sin temporizadores reales: el de 10 s de «sin respuesta» no debe quedar vivo entre pruebas. */
const SIN_TIEMPO = { poner: () => 0, quitar: () => undefined };
const SOBRE = '{"t":"est","s":"abc","e":"ping","d":"{}"}';

/** Simula la respuesta SUBSCRIBED de Realtime. */
function suscribir(i = 0): void {
  registro.canales[i].estado?.("SUBSCRIBED");
}

describe("crearCanalInternet (canal de estación por Supabase Realtime)", () => {
  beforeEach(() => {
    registro.canales.length = 0;
    registro.quitados = 0;
  });

  it("conecta al tema público de la estación y avisa al abrir al suscribirse", async () => {
    const c = await crearCanalInternet("est-1", null, SIN_TIEMPO);
    if (!c) throw new Error("sin canal");
    expect(registro.canales).toHaveLength(1);
    expect(registro.canales[0].tema).toBe(temaPublico("est-1"));
    expect(c.tipo).toBe("internet");
    const aperturas: number[] = [];
    c.alAbrir?.(() => aperturas.push(1));
    expect(c.abierto()).toBe(false);
    suscribir();
    expect(c.abierto()).toBe(true);
    expect(aperturas).toEqual([1]);
    expect(registro.canales[0].rastreados).toHaveLength(1); // se anuncia en la presencia
    c.cerrar();
  });

  it("una estación privada se conecta al tema que solo calcula quien tiene el token", async () => {
    const c = await crearCanalInternet("est-priv", "token-secreto", SIN_TIEMPO);
    if (!c) throw new Error("sin canal");
    const tema = registro.canales[0].tema;
    expect(tema).toBe(await temaPrivado("est-priv", "token-secreto"));
    expect(tema.startsWith("estacion-p:")).toBe(true);
    expect(tema).not.toContain("token-secreto");
    expect(tema).not.toContain("est-priv");
    c.cerrar();
  });

  it("solo entrega sobres de estación; la presencia cuenta a los demás (n − 1)", async () => {
    const c = await crearCanalInternet("est-2", null, SIN_TIEMPO);
    if (!c) throw new Error("sin canal");
    suscribir();
    const recibidos: string[] = [];
    c.alRecibir((t) => recibidos.push(t));
    // Un mensaje sin el sobre de estación (aquí, el de presencia del relé) no se entrega.
    registro.canales[0].difusion?.({ payload: { x: '{"t":"rele","n":5}' } });
    expect(recibidos).toHaveLength(0);
    expect(c.oyentes?.()).toBeNull(); // sin presencia aún: no se inventa un número
    // Cinco conectados contándome a mí → cuatro oyentes.
    registro.canales[0].presentes = { yo: {}, a: {}, b: {}, c: {}, d: {} };
    registro.canales[0].presencia?.();
    expect(c.oyentes?.()).toBe(4);
    registro.canales[0].difusion?.({ payload: { x: SOBRE } });
    registro.canales[0].difusion?.({ payload: { x: "hola suelto" } });
    registro.canales[0].difusion?.({ payload: {} });
    expect(recibidos).toEqual([SOBRE]);
    c.cerrar();
  });

  it("envía solo cuando está suscrito y cerrar da de baja el canal", async () => {
    const c = await crearCanalInternet("est-3", null, SIN_TIEMPO);
    if (!c) throw new Error("sin canal");
    c.enviar("antes");
    expect(registro.canales[0].enviados).toHaveLength(0);
    suscribir();
    c.enviar("durante");
    expect(registro.canales[0].enviados).toHaveLength(1);
    expect(registro.canales[0].enviados[0]).toEqual({ type: "broadcast", event: "m", payload: { x: "durante" } });
    // Suscripción perdida: deja de estar abierto y ya no envía.
    registro.canales[0].estado?.("CLOSED");
    expect(c.abierto()).toBe(false);
    c.enviar("caído");
    expect(registro.canales[0].enviados).toHaveLength(1);
    c.cerrar();
    expect(registro.quitados).toBe(1);
    c.enviar("después");
    expect(registro.canales[0].enviados).toHaveLength(1);
  });

  it("dice su estado real: conectando, abierto, error con motivo y cerrado", async () => {
    const c = await crearCanalInternet("est-4", null, SIN_TIEMPO);
    if (!c) throw new Error("sin canal");
    expect(c.estado()).toEqual({ fase: "conectando", motivo: null });
    suscribir();
    expect(c.estado()).toEqual({ fase: "abierto", motivo: null });
    registro.canales[0].estado?.("TIMED_OUT");
    expect(c.estado().fase).toBe("error");
    expect(c.estado().motivo).toContain("no contestó a tiempo");
    c.cerrar();
    expect(c.estado()).toEqual({ fase: "cerrado", motivo: null });
  });
});

describe("motivoSeguro", () => {
  it("quita el tema, direcciones, claves y datos largos del mensaje de un error", () => {
    const tema = "estacion-vivo:abcdefghijklmnopqrstuv";
    const jwt = ["eyJhbGciOiJIUzI1NiJ9", "eyJyb2xlIjoiYW5vbiJ9", "firma"].join(".");
    const m = motivoSeguro(new Error(`"Unauthorized: ${tema} wss://x.supabase.co/realtime apikey=${jwt}"`), tema);
    expect(m).toContain("Unauthorized");
    expect(m).not.toMatch(/estacion-vivo|supabase\.co|eyJ|wss:/);
  });

  it("devuelve null si el error no dice nada y recorta los larguísimos", () => {
    expect(motivoSeguro(undefined, "t")).toBeNull();
    expect(motivoSeguro({}, "t")).toBeNull();
    expect(motivoSeguro("   ", "t")).toBeNull();
    const largo = motivoSeguro("palabra ".repeat(100), "t");
    expect(largo?.length).toBeLessThanOrEqual(160);
    expect(largo?.endsWith("…")).toBe(true);
  });
});
