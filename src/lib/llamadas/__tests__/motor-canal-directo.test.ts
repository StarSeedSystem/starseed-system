import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MetaPresencia } from "@/lib/llamadas/tipos";
import type { OpcionesMotor } from "@/lib/llamadas/motor";

let MotorLlamada: typeof import("@/lib/llamadas/motor")["MotorLlamada"];

/* ────────────────────────────── Mocks ────────────────────────────── */
  // Mock for abrirCanalLlamada (from @/lib/llamadas/senalizacion)
  vi.mock("@/lib/llamadas/senalizacion", () => ({
    abrirCanalLlamada: (sesionId: string, opciones: { clave?: string | null; tema?: string | null } = {}) => {
      const sesion = opciones.tema ?? sesionId;
      const c: any = {
        sesion,
        clave: opciones.clave ?? "obs",
        meta: null,
        oyP: new Set(),
        oyS: new Set(),
        oyE: new Set(),
        enviadas: [],
        suelta: false,
        denegado: false,
      };
      // We'll store the connection in a map so we can retrieve it later
      (globalThis as any).__mockConns = (globalThis as any).__mockConns || [];
      (globalThis as any).__mockConns.push(c);
      return {
        sesionId,
        tema: sesion,
        clave: () => c.clave,
        suscrito: () => !c.denegado,
        estado: () => (c.denegado ? "denegado" : "dentro"),
        presencia: () => [],
        onPresencia: (cb: (p: MetaPresencia[]) => void) => {
          c.oyP.add(cb);
          return () => c.oyP.delete(cb);
        },
        onSenal: (cb: (s: any) => void) => {
          c.oyS.add(cb);
          return () => c.oyS.delete(cb);
        },
        onSuscrito: () => () => undefined,
        onEstado: (cb: (e: string) => void) => {
          c.oyE.add(cb);
          return () => c.oyE.delete(cb);
        },
        enviar: (s: any) => {
          if (c.denegado || c.suelta) return;
          c.enviadas.push(s);
          for (const otro of (globalThis as any).__mockConns) {
            if (otro !== c && otro.sesion === sesion && !otro.suelta) {
              queueMicrotask(() => otro.oyS.forEach((cb) => cb(s)));
            }
          }
        },
        publicar: (meta: MetaPresencia) => {
          c.meta = meta;
          // In a real scenario, we would distribute presence to other connections in the same session.
          // For simplicity, we just update the meta and the connection's presence callback will be called with [meta]?
          // But note: the onPresencia callback expects an array of presences.
          // We'll just call the callback with [meta] for this connection.
          c.oyP.forEach((cb) => cb([meta]));
        },
        retirar: () => {
          c.meta = null;
          c.oyP.forEach((cb) => cb([]));
        },
        soltar: () => {
          c.suelta = true;
          c.oyP.forEach((cb) => cb([]));
        },
      };
    },
  }));

// Mock for medios (we don't need media for these tests, but we must mock to avoid errors)
vi.mock("@/lib/llamadas/medios", () => ({
  obtenerMedios: vi.fn(async () => ({
    stream: new MediaStream(), // We'll create a dummy stream
    error: null,
    aviso: null,
  })),
  obtenerPista: vi.fn(async () => ({ pista: null, error: "no pista" })),
  obtenerPantalla: vi.fn(async () => ({ pista: null, error: "no pantalla" })),
  listarDispositivos: vi.fn(async () => ({ microfonos: [], camaras: [], altavoces: [] })),
  pararStream: vi.fn(),
}));

// Mock for identidad
vi.mock("@/lib/llamadas/identidad", () => ({
  clavePestana: (base: string) => `${base}:t`,
}));

// Mock for ice
vi.mock("@/lib/llamadas/ice", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/llamadas/ice")>()),
  servidoresIce: () => [{ urls: "stun:x" }],
}));

/* ────────────────────────────── Helpers ────────────────────────────── */
function yo(base: string) {
  return { base, uid: base, nombre: base.toUpperCase(), avatar: null, invitado: false };
}

const OPCIONES_BASE = {
  sesionId: "test-sesion",
  yo: yo("test"),
  intervaloNivelMs: 60_000,
  intervaloStatsMs: 60_000,
};

/**
 * Creates a fake connection that mimics a direct channel.
 * We'll use the mocked abrirCanalLlamada but we want to be able to return a specific connection.
 * We'll create a connection and then we can manipulate its presence and senal callbacks.
 * We'll also add a `directo` property to distinguish it.
 */
function crearConexionFalsa(tema: string | null = null): any {
  // We'll use the mocked abrirCanalLlamada to get a connection object, but we need to enhance it.
  // Instead, we can create a mock connection object directly.
  const conn: any = {
    sesionId: "test-sesion",
    tema: tema ?? `directo:test-sesion`,
    clave: () => "test-clave",
    suscrito: () => true,
    estado: () => "dentro",
    presencia: [] as MetaPresencia[],
    enviadas: [] as any[],
    oyP: new Set<(p: MetaPresencia[]) => void>(),
    oyS: new Set<(s: any) => void>(),
    oyE: new Set<(e: string) => void>(),
    onPresencia: (cb: (p: MetaPresencia[]) => void) => {
      conn.oyP.add(cb);
      return () => conn.oyP.delete(cb);
    },
    onSenal: (cb: (s: any) => void) => {
      conn.oyS.add(cb);
      return () => conn.oyS.delete(cb);
    },
    onSuscrito: () => () => undefined,
    onEstado: (cb: (e: string) => void) => {
      conn.oyE.add(cb);
      return () => conn.oyE.delete(cb);
    },
    enviar: (s: any) => {
      conn.enviadas.push(s);
      // In a real direct channel, we would send to the other peer. For simplicity, we just store.
      // For presence, we need to update the presence of the connection when the other peer publishes.
      // But in our test, we will manually call the presence callback when we want to simulate a message.
    },
    publicar: (meta: MetaPresencia) => {
      // When we publish, we update the presence array and then call the presence callbacks with the new array.
      conn.presencia = [meta];
      conn.oyP.forEach((cb) => cb([meta]));
    },
    retirar: () => {
      conn.presencia = [];
      conn.oyP.forEach((cb) => cb([]));
    },
    soltar: () => {
      // No-op for now
    },
  };
  // Add a directo property to indicate it's a direct channel
  conn.directo = true;
  return conn;
}

/* ────────────────────────────── Setup ────────────────────────────── */
beforeEach(() => {
  // Clear any stored mock connections
  delete (globalThis as any).__mockConns;
});

beforeEach(async () => {
  const module = await import("@/lib/llamadas/motor");
  MotorLlamada = module.MotorLlamada;
});

/* ────────────────────────────── Tests ────────────────────────────── */
describe("MotorLlamada con canales directos", () => {
  it("devuelve true cuando entrar() usa canales directos", async () => {
    const canalDirecto = crearConexionFalsa();

    const opciones: OpcionesMotor = {
      ...OPCIONES_BASE,
      canalesDirectos: () => [canalDirecto],
    };
    const motor = new MotorLlamada(opciones);

    const resultado = motor.entrar();

    expect(resultado).toBe(true);
    expect(motor.estado().fase).toBe("esperando");
    expect(motor.canales.length).toBe(1);
    expect(motor.canales[0].directo).toBe(true);
  });

  it("cuando un canal directo publica presencia, el motor crea su par", () => {
    const canalDirecto = crearConexionFalsa();

    const opciones: OpcionesMotor = {
      ...OPCIONES_BASE,
      canalesDirectos: () => [canalDirecto],
    };
    const motor = new MotorLlamada(opciones);
    motor.entrar();

    canalDirecto.publicar({
      id: "person-2",
      uid: "person-2-uid",
      nombre: "Person 2",
      avatar: null,
      invitado: false,
      micro: true,
      camara: false,
      pantalla: false,
      unido: 123,
    });

    const participantes = motor.estado().participantes;
    expect(participantes.some((p) => p.id === "person-2")).toBe(true);
    expect(motor.pares.has("person-2")).toBe(true);
    expect(globalThis.RTCPeerConnection).toHaveBeenCalledWith(
      expect.objectContaining({ iceServers: expect.any(Array) })
    );
  });

  it("revisarCanal nunca suelta el canal directo", () => {
    const canalSupabase = crearConexionFalsa("llamada:test-sesion-supabase");

    vi.mock("@/lib/llamadas/senalizacion", async (importOriginal) => {
      const original = await importOriginal();
      return {
        ...original as any,
        abrirCanalLlamada: vi.fn((id, opts) => {
          if (opts.clave === "test-clave-supabase") {
            return canalSupabase;
          }
          return null;
        }),
      };
    });

    const opciones: OpcionesMotor = {
      ...OPCIONES_BASE,
      canalesDirectos: () => [crearConexionFalsa("llamada:test-sesion-directo")],
    };
    const motor = new MotorLlamada(opciones);
    motor.entrar();

    const antes = motor.canales.length;
    expect(motor.canales.some((c) => c.directo)).toBe(true);
    expect(motor.canales.some((c) => !c.directo)).toBe(true);

    motor.revisarCanal(false);

    const despues = motor.canales.length;
    expect(despues).toBe(antes);
    expect(motor.canales.some((c) => c.directo)).toBe(true);
  });
});