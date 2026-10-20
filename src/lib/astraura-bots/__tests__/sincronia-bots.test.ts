import { describe, test, expect, vi, beforeAll } from 'vitest';
import type { BotSync } from "../sincronia-bots";

let adaptadores: typeof import("../adaptadores/sincronia-bots");

// Mock window.localStorage before importing the module
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string): string | null => {
      return store[key] || null;
    },
    setItem: (key: string, value: string): void => {
      store[key] = value;
    },
    removeItem: (key: string): void => {
      delete store[key];
    },
    clear: (): void => {
      store = {};
    },
  };
})();

// Set up the mocks before importing
beforeAll(async () => {
  // Mock the window and localStorage
  global.window = {
    localStorage: localStorageMock,
  };

  // Mock the supabase client and realtime module
  vi.mock("@/utils/supabase/client", () => ({
    createClient: vi.fn().mockReturnValue({
      channel: vi.fn().mockReturnValue({
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnValue({}),
        removeChannel: vi.fn(),
      }),
    }),
  }));
  vi.mock("@/lib/realtime/realtime", () => ({
    onTableChange: vi.fn().mockImplementation(() => {
      return () => {};
    }),
  }));

  // Now import the module
  adaptadores = await import("../adaptadores/sincronia-bots");
});

describe("fusionarBots", () => {
  test("gana el más reciente por actualizado", () => {
    const local = {
      bots: [
        { id: "b1", nombre: "Bot b1", dueno: { tipo: "perfil", id: "perfil-b1", cuentaId: "cuenta-b1" }, origen: "astraura", gobierno: "jerarquico", personalidad: { calidez: 0.5, energia: 0.5, formalidad: 0.5, curiosidad: 0.5, humor: 0.5, concision: 0.5 }, cuerpo: { forma: "orbe", tono: 200, escala: 1 }, sentidosHabilitados: ["pantalla", "red"], activo: true },
        { id: "b2", nombre: "Bot b2", dueno: { tipo: "perfil", id: "perfil-b2", cuentaId: "cuenta-b2" }, origen: "astraura", gobierno: "jerarquico", personalidad: { calidez: 0.5, energia: 0.5, formalidad: 0.5, curiosidad: 0.5, humor: 0.5, concision: 0.5 }, cuerpo: { forma: "orbe", tono: 200, escala: 1 }, sentidosHabilitados: ["pantalla", "red"], activo: true }
      ],
      actualizado: { b1: 1000, b2: 2000 }
    };
    const remoto = {
      bots: [
        { id: "b1", nombre: "Bot b1", dueno: { tipo: "perfil", id: "perfil-b1", cuentaId: "cuenta-b1" }, origen: "astraura", gobierno: "jerarquico", personalidad: { calidez: 0.5, energia: 0.5, formalidad: 0.5, curiosidad: 0.5, humor: 0.5, concision: 0.5 }, cuerpo: { forma: "orbe", tono: 200, escala: 1 }, sentidosHabilitados: ["pantalla", "red"], activo: true },
        { id: "b3", nombre: "Bot b3", dueno: { tipo: "perfil", id: "perfil-b3", cuentaId: "cuenta-b3" }, origen: "astraura", gobierno: "jerarquico", personalidad: { calidez: 0.5, energia: 0.5, formalidad: 0.5, curiosidad: 0.5, humor: 0.5, concision: 0.5 }, cuerpo: { forma: "orbe", tono: 200, escala: 1 }, sentidosHabilitados: ["pantalla", "red"], activo: true }
      ],
      actualizado: { b1: 2000, b3: 1500 }
    };
    const res = adaptadores.fusionarBots(local, remoto);
    const ids = res.bots.map(b => b.id).sort();
    expect(ids).toEqual(["b1", "b2", "b3"]);
    expect(res.actualizado["b1"]).toBe(2000);
  });

  test("conserva local si no está en remoto", () => {
    const local = {
      bots: [
        { id: "b-local", nombre: "Bot b-local", dueno: { tipo: "perfil", id: "perfil-b-local", cuentaId: "cuenta-b-local" }, origen: "astraura", gobierno: "jerarquico", personalidad: { calidez: 0.5, energia: 0.5, formalidad: 0.5, curiosidad: 0.5, humor: 0.5, concision: 0.5 }, cuerpo: { forma: "orbe", tono: 200, escala: 1 }, sentidosHabilitados: ["pantalla", "red"], activo: true }
      ],
      actualizado: { "b-local": 1000 }
    };
    const remoto = {
      bots: [],
      actualizado: {}
    };
    const res = adaptadores.fusionarBots(local, remoto);
    expect(res.bots.length).toBe(1);
    expect(res.bots[0].id).toBe("b-local");
  });

  test("fusión determinista", () => {
    const local = {
      bots: [
        { id: "A", nombre: "Bot A", dueno: { tipo: "perfil", id: "perfil-A", cuentaId: "cuenta-A" }, origen: "astraura", gobierno: "jerarquico", personalidad: { calidez: 0.5, energia: 0.5, formalidad: 0.5, curiosidad: 0.5, humor: 0.5, concision: 0.5 }, cuerpo: { forma: "orbe", tono: 200, escala: 1 }, sentidosHabilitados: ["pantalla", "red"], activo: true }
      ],
      actualizado: { A: 100 }
    };
    const remoto = {
      bots: [
        { id: "A", nombre: "Bot A", dueno: { tipo: "perfil", id: "perfil-A", cuentaId: "cuenta-A" }, origen: "astraura", gobierno: "jerarquico", personalidad: { calidez: 0.5, energia: 0.5, formalidad: 0.5, curiosidad: 0.5, humor: 0.5, concision: 0.5 }, cuerpo: { forma: "orbe", tono: 200, escala: 1 }, sentidosHabilitados: ["pantalla", "red"], activo: true }
      ],
      actualizado: { A: 150 }
    };
    const r1 = adaptadores.fusionarBots(local, remoto);
    const r2 = adaptadores.fusionarBots(local, remoto);
    expect(r1.bots.map(b => b.id).sort()).toEqual(r2.bots.map(b => b.id).sort());
  });
});

describe("suscribirBotsEntidad", () => {
  test("devuelve una función de unsubscripción", () => {
    const entidades = [{ tipo: "grupo", id: "g1", cuentaId: "c1" }];
    const cb = vi.fn();
    const unsubscribe = adaptadores.suscribirBotsEntidad(entidades, cb);
    expect(typeof unsubscribe).toBe("function");
    // We can also check that the supabase client was called
    expect(unsubscribe).toBeDefined();
  });
});

describe("abiertosEnEstaNeurona", () => {
  test("devuelve un array vacío si window no está definido", () => {
    const originalWindow = global.window;
    global.window = undefined;
    expect(adaptadores.abiertosEnEstaNeurona()).toEqual([]);
    global.window = originalWindow;
  });

  test("lee la clave correcta y devuelve un array", () => {
    // Initially empty
    expect(adaptadores.abiertosEnEstaNeurona()).toEqual([]);

    // Set a value
    window.localStorage.setItem("starseed.astraura.bots.orbes.v1", '["bot1","bot2"]');
    expect(adaptadores.abiertosEnEstaNeurona()).toEqual(["bot1", "bot2"]);

    // Non-JSON value
    window.localStorage.setItem("starseed.astraura.bots.orbes.v1", "not json");
    expect(adaptadores.abiertosEnEstaNeurona()).toEqual([]);
  });
});

describe("marcarAbierto", () => {
  test("no hace nada si window no está definido", () => {
    const originalWindow = global.window;
    global.window = undefined;
    // Should not throw
    adaptadores.marcarAbierto("bot1", true);
    global.window = originalWindow;
  });

  test("marca y desmarca un bot como abierto", () => {
    // Initially empty
    adaptadores.marcarAbierto("bot1", true);
    expect(window.localStorage.getItem("starseed.astraura.bots.orbes.v1)).toBe('["bot1"]');

    adaptadores.marcarAbierto("bot2", true);
    expect(window.localStorage.getItem("starseed.astraura.bots.orbes.v1)).toBe('["bot1","bot2"]');

    adaptadores.marcarAbierto("bot1", false);
    expect(window.localStorage.getItem("starseed.astraura.bots.orbes.v1)).toBe('["bot2"]');

    adaptadores.marcarAbierto("bot2", false);
    expect(window.localStorage.getItem("starseed.astraura.bots.orbes.v1)).toBe('[]');
  });
});