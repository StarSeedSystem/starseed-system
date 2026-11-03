import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  CAPSULAS_KEY,
  CAPSULAS_EVENT,
  capsulaEncendida,
  encenderCapsula,
  type SujetosCapsulas,
} from "@/lib/memorias/capsulas-ajustes";

const sujeitoKey = "personalidad:aurora";
const sujeitoKey2 = "cerebro:principal";

class AlmacenMemoria {
  private readonly datos = new Map<string, string>();
  getItem(clave: string): string | null { return this.datos.get(clave) ?? null; }
  setItem(clave: string, valor: string): void { this.datos.set(clave, valor); }
  removeItem(clave: string): void { this.datos.delete(clave); }
  clear(): void { this.datos.clear(); }
}

describe("capsulas-ajustes", () => {
  let eventos: string[];
  beforeEach(() => {
    eventos = [];
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: new AlmacenMemoria(),
        dispatchEvent: (evento: Event) => { eventos.push(evento.type); return true; },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });
  });
  afterEach(() => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: undefined,
    });
  });

  describe("CAPSULAS_KEY", () => {
    it("debe ser la clave correcta de localStorage", () => {
      expect(CAPSULAS_KEY).toBe("starseed.memorias.capsulas.v1");
    });
  });

  describe("CAPSULAS_EVENT", () => {
    it("debe ser el evento correcto", () => {
      expect(CAPSULAS_EVENT).toBe("starseed:memorias-capsulas");
    });
  });

  describe("capsulaEncendida", () => {
    it("devuelve false por defecto (apagada)", () => {
      expect(capsulaEncendida(sujeitoKey)).toBe(false);
    });

    it("devuelve true después de encenderla", () => {
      encenderCapsula(sujeitoKey, true);
      expect(capsulaEncendida(sujeitoKey)).toBe(true);
    });

    it("devuelve false después de apagarla", () => {
      encenderCapsula(sujeitoKey, true);
      encenderCapsula(sujeitoKey, false);
      expect(capsulaEncendida(sujeitoKey)).toBe(false);
    });

    it("maneja múltiples sujetos independientemente", () => {
      encenderCapsula(sujeitoKey, true);
      encenderCapsula(sujeitoKey2, false);
      expect(capsulaEncendida(sujeitoKey)).toBe(true);
      expect(capsulaEncendida(sujeitoKey2)).toBe(false);
    });

    it("es defensiva: no lanza si localStorage no está disponible", () => {
      // Simular entorno sin window
      Object.defineProperty(globalThis, "window", { configurable: true, value: undefined });
      expect(capsulaEncendida(sujeitoKey)).toBe(false);
      Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: new AlmacenMemoria(), dispatchEvent: (e: Event) => true } });
    });

    it("es defensiva: no lanza si JSON.parse falla", () => {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(CAPSULAS_KEY, "json-invalido{");
      }
      expect(capsulaEncendida(sujeitoKey)).toBe(false);
    });

    it("maneja valores no-objeto en localStorage", () => {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(CAPSULAS_KEY, '"string-en-lugar-de-objeto"');
      }
      expect(capsulaEncendida(sujeitoKey)).toBe(false);
    });

    it("maneja objeto sin campo sujetos", () => {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(CAPSULAS_KEY, '{"v": 1}');
      }
      expect(capsulaEncendida(sujeitoKey)).toBe(false);
    });
  });

  describe("encenderCapsula", () => {
    it("crea la estructura inicial si no existe", () => {
      encenderCapsula(sujeitoKey, true);
      const raw = window.localStorage.getItem(CAPSULAS_KEY);
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw!);
      expect(parsed.v).toBe(1);
      expect(parsed.sujetos[sujeitoKey]).toBe(true);
    });

    it("actualiza un sujeto existente", () => {
      encenderCapsula(sujeitoKey, true);
      encenderCapsula(sujeitoKey, false);
      const raw = window.localStorage.getItem(CAPSULAS_KEY);
      const parsed = JSON.parse(raw!);
      expect(parsed.sujetos[sujeitoKey]).toBe(false);
    });

    it("mantiene otros sujetos al actualizar uno", () => {
      encenderCapsula(sujeitoKey, true);
      encenderCapsula(sujeitoKey2, true);
      encenderCapsula(sujeitoKey, false);
      const raw = window.localStorage.getItem(CAPSULAS_KEY);
      const parsed = JSON.parse(raw!);
      expect(parsed.sujetos[sujeitoKey]).toBe(false);
      expect(parsed.sujetos[sujeitoKey2]).toBe(true);
    });

    it("emite el evento CAPSULAS_EVENT al cambiar", () => {
      encenderCapsula(sujeitoKey, true);
      expect(eventos).toContain(CAPSULAS_EVENT);
    });

    it("no emite evento si el valor no cambia", () => {
      encenderCapsula(sujeitoKey, true);
      const longitudAntes = eventos.length;
      encenderCapsula(sujeitoKey, true); // mismo valor
      expect(eventos.length).toBe(longitudAntes);
    });

    it("es defensiva: no lanza si localStorage no está disponible", () => {
      Object.defineProperty(globalThis, "window", { configurable: true, value: undefined });
      expect(() => encenderCapsula(sujeitoKey, true)).not.toThrow();
      Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: new AlmacenMemoria(), dispatchEvent: (e: Event) => true } });
    });

    it("es defensiva: no lanza si localStorage lanza al escribir", () => {
      if (typeof window !== "undefined") {
        const originalSetItem = window.localStorage.setItem;
        window.localStorage.setItem = () => {
          throw new Error("Cuota excedida");
        };
        expect(() => encenderCapsula(sujeitoKey, true)).not.toThrow();
        window.localStorage.setItem = originalSetItem;
      }
    });
  });

  describe("tipo SujetosCapsulas", () => {
    it("permite estructura correcta", () => {
      const sujetos: SujetosCapsulas = {
        v: 1,
        sujetos: {
          "personalidad:aurora": true,
          "cerebro:principal": false,
        },
      };
      expect(sujetos.v).toBe(1);
      expect(sujetos.sujetos["personalidad:aurora"]).toBe(true);
      expect(sujetos.sujetos["cerebro:principal"]).toBe(false);
    });
  });
});