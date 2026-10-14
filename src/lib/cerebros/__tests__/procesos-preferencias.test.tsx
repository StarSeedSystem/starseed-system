import { describe, expect, it, afterEach } from "vitest";
import {
  leerPreferencias,
  guardarPreferencias,
  normalizarPreferencias,
  PREFERENCIAS_POR_DEFECTO,
  limitesDeCerebro,
  guardarLimites,
} from "../procesos-preferencias";

// Mock de localStorage para las pruebas
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string | null): string | null => {
      return key === null ? null : store[key] ?? null;
    },
    setItem: (key: string, value: string): void => {
      store[key] = value;
    },
    clear: (): void => {
      store = {};
    },
  };
})();

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
});

describe("Preferencias de procesos", () => {
  afterEach(() => {
    // Limpiar localStorage después de cada prueba
    (window.localStorage as Storage).clear();
  });

  describe("normalizarPreferencias", () => {
    it("devuelve valores por defecto para entrada nula o no objeto", () => {
      expect(normalizarPreferencias(null)).toEqual(PREFERENCIAS_POR_DEFECTO);
      expect(normalizarPreferencias(undefined)).toEqual(PREFERENCIAS_POR_DEFECTO);
      expect(normalizarPreferencias("cadena")).toEqual(PREFERENCIAS_POR_DEFECTO);
      expect(normalizarPreferencias(123)).toEqual(PREFERENCIAS_POR_DEFECTO);
      expect(normalizarPreferencias([])).toEqual(PREFERENCIAS_POR_DEFECTO);
    });

    it("normaliza tipos visibles válidos", () => {
      const entrada = {
        tipos: ["genesis", "poligenesis", "sueno"],
      };
      const resultado = normalizarPreferencias(entrada);
      expect(resultado.tipos).toEqual([
        "genesis",
        "poligenesis",
        "sueno",
        "imaginacion",
        "descarga",
        "instalacion",
        "actualizacion",
        "app-fondo",
        "servicio",
      ]); // Debería incluir todos los valores válidos + los solicitados
    });

    it("filtra tipos no válidos y mantiene los válidos", () => {
      const entrada = {
        tipos: ["genesis", "tipo-invalido", "poligenesis", "", "sueno"],
      };
      const resultado = normalizarPreferencias(entrada);
      expect(resultado.tipos).toEqual([
        "genesis",
        "poligenesis",
        "sueno",
        "imaginacion",
        "descarga",
        "instalacion",
        "actualizacion",
        "app-fondo",
        "servicio",
      ]);
    });

    it("devuelve todos los tipos si el array está vacío o no tiene valores válidos", () => {
      let entrada = { tipos: [] };
      let resultado = normalizarPreferencias(entrada);
      expect(resultado.tipos).toEqual(PREFERENCIAS_POR_DEFECTO.tipos);

      entrada = { tipos: ["invalido1", "invalido2"] };
      resultado = normalizarPreferencias(entrada);
      expect(resultado.tipos).toEqual(PREFERENCIAS_POR_DEFECTO.tipos);
    });

    it("normaliza intervaloSeg dentro del rango", () => {
      expect(normalizarPreferencias({ intervaloSeg: 10 }).intervaloSeg).toBe(10);
      expect(normalizarPreferencias({ intervaloSeg: 15 }).intervaloSeg).toBe(15);
      expect(normalizarPreferencias({ intervaloSeg: 120 }).intervaloSeg).toBe(120);
    });

    it("ajusta intervaloSeg fuera del rango a los límites", () => {
      expect(normalizarPreferencias({ intervaloSeg: 1 }).intervaloSeg).toBe(5); // mínimo
      expect(normalizarPreferencias({ intervaloSeg: 4 }).intervaloSeg).toBe(5); // por debajo del mínimo
      expect(normalizarPreferencias({ intervaloSeg: 121 }).intervaloSeg).toBe(120); // máximo
      expect(normalizarPreferencias({ intervaloSeg: 200 }).intervaloSeg).toBe(120); // por encima del máximo
    });

    it("usa valor por defecto para intervaloSeg no numérico", () => {
      expect(normalizarPreferencias({ intervaloSeg: "no es un número" as unknown as number }).intervaloSeg).toBe(15);
      expect(normalizarPreferencias({ intervaloSeg: NaN as unknown as number }).intervaloSeg).toBe(15);
    });

    it("normaliza umbrales dentro del rango", () => {
      const entrada = {
        umbrales: { cpu: 50, ram: 60, disco: 70, bateria: 30 },
      };
      const resultado = normalizarPreferencias(entrada);
      expect(resultado.umbrales).toEqual({ cpu: 50, ram: 60, disco: 70, bateria: 30 });
    });

    it("ajusta umbrales fuera del rango a los límites", () => {
      const entrada = {
        umbrales: { cpu: 0, ram: 0, disco: 0, bateria: 0 }, // por debajo del mínimo
      };
      const resultado = normalizarPreferencias(entrada);
      expect(resultado.umbrales).toEqual({ cpu: 1, ram: 1, disco: 1, bateria: 1 }); // mínimo
    });

    it("ajusta umbrales por encima del máximo", () => {
      const entrada = {
        umbrales: { cpu: 101, ram: 101, disco: 101, bateria: 101 }, // por encima del máximo
      };
      const resultado = normalizarPreferencias(entrada);
      expect(resultado.umbrales).toEqual({ cpu: 100, ram: 100, disco: 100, bateria: 100 }); // máximo
    });

    it("usa valores por defecto para umbrales no numéricos", () => {
      const entrada = {
        umbrales: {
          cpu: "no es un número" as unknown as number,
          ram: NaN as unknown as number,
          disco: null as unknown as number,
          bateria: undefined as unknown as number,
        },
      };
      const resultado = normalizarPreferencias(entrada);
      expect(resultado.umbrales).toEqual({
        cpu: 85, // por defecto
        ram: 90, // por defecto
        disco: 90, // por defecto
        bateria: 20, // por defecto
      });
    });

    it("normaliza ocultos como array de strings", () => {
      const entrada = {
        ocultos: ["servidor1", "servidor2"],
      };
      const resultado = normalizarPreferencias(entrada);
      expect(resultado.ocultos).toEqual(["servidor1", "servidor2"]);
    });

    it("filtra ocultos no string", () => {
      const entrada = {
        ocultos: ["servidor1", 123, null, undefined, "servidor2"],
      };
      const resultado = normalizarPreferencias(entrada);
      expect(resultado.ocultos).toEqual(["servidor1", "servidor2"]);
    });

    it("devuelve array vacío para ocultos no array", () => {
      const entrada = {
        ocultos: "no es un array" as unknown as string[],
      };
      const resultado = normalizarPreferencias(entrada);
      expect(resultado.ocultos).toEqual([]);
    });
  });

  describe("leerPreferencias y guardarPreferencias", () => {
    it("lee valores por defecto cuando no hay nada en localStorage", () => {
      const resultado = leerPreferencias("cerebro-id-1");
      expect(resultado).toEqual(PREFERENCIAS_POR_DEFECTO);
    });

    it("lee y normaliza preferencias desde localStorage", () => {
      // Guardar algunas preferencias con valores fuera de rango
      guardarPreferencias("cerebro-id-1", {
        tipos: ["genesis"],
        intervaloSeg: 30, // válido
        umbrales: { cpu: 50, ram: 60, disco: 70, bateria: 30 },
        ocultos: ["servidor1"],
      });

      const resultado = leerPreferencias("cerebro-id-1");
      expect(resultado).toEqual({
        tipos: ["genesis"], // Solo lo solicitado
        intervaloSeg: 30,
        umbrales: { cpu: 50, ram: 60, disco: 70, bateria: 30 },
        ocultos: ["servidor1"],
      });
    });

    it("normaliza preferencias con valores fuera de rango al leer", () => {
      // Guardar preferencias con valores fuera de rango
      guardarPreferencias("cerebro-id-2", {
        tipos: ["genesis", "poligenesis"],
        intervaloSeg: 200, // por encima del máximo
        umbrales: { cpu: 0, ram: 0, disco: 0, bateria: 0 }, // por debajo del mínimo
        ocultos: ["servidor1", 123, null], // mezclando tipos
      });

      const resultado = leerPreferencias("cerebro-id-2");
      expect(resultado).toEqual({
        tipos: ["genesis", "poligenesis"],
        intervaloSeg: 120, // ajustado al máximo
        umbrales: { cpu: 1, ram: 1, disco: 1, bateria: 1 }, // ajustado al mínimo
        ocultos: ["servidor1"], // solo los strings válidos
      });
    });

    it("devuelve valores por defecto para cerebro id nulo o vacío", () => {
      expect(leerPreferencias(null)).toEqual(PREFERENCIAS_POR_DEFECTO);
      expect(leerPreferencias("")).toEqual(PREFERENCIAS_POR_DEFECTO);
    });
  });

  describe("limitesDeCerebro y guardarLimites", () => {
    it("lee null cuando no hay límites en localStorage", () => {
      const resultado = limitesDeCerebro("cerebro-id-1");
      expect(resultado).toBeNull();
    });

    it("lee y devuelve límites desde localStorage", () => {
      // Guardar algunos límites
      guardarLimites("cerebro-id-1", { cpuMaxPct: 80, ramMaxMb: 4096 });

      const resultado = limitesDeCerebro("cerebro-id-1");
      expect(resultado).toEqual({ cpuMaxPct: 80, ramMaxMb: 4096 });
    });

    it("devuelve null para cerebro id nulo o vacío", () => {
      expect(limitesDeCerebro(null)).toBeNull();
      expect(limitesDeCerebro("")).toBeNull();
    });

    it("guarda límites correctamente", () => {
      guardarLimites("cerebro-id-3", { cpuMaxPct: 90, ramMaxMb: 6144 });

      const resultado = limitesDeCerebro("cerebro-id-3");
      expect(resultado).toEqual({ cpuMaxPct: 90, ramMaxMb: 6144 });
    });

    it("guarda valores null correctamente", () => {
      guardarLimites("cerebro-id-4", { cpuMaxPct: null, ramMaxMb: null });

      const resultado = limitesDeCerebro("cerebro-id-4");
      expect(resultado).toEqual({ cpuMaxPct: null, ramMaxMb: null });
    });
  });
});