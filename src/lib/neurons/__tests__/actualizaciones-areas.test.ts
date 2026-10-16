import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { ModoActualizacion, PreferenciaNeurona } from "../actualizaciones";
import { leerPreferencia, guardarPreferencia, decidirAccionModelo, CLAVE_PREFERENCIAS } from "../actualizaciones";

describe("actualizaciones-areas", () => {
  describe("ModoActualizacion", () => {
    it("should include inteligente", () => {
      const modes: ModoActualizacion[] = ["automatica", "manual", "inteligente"];
      expect(modes).toContain("inteligente");
    });
  });

  describe("PreferenciaNeurona", () => {
    it("should have optional porArea", () => {
      const pref: PreferenciaNeurona = {
        neuronaId: "test-neuron",
        modo: "manual",
        ultimaComprobacion: null,
        versionVista: null,
      };
      // porArea is optional, so accessing it should return undefined
      expect(pref.porArea).toBeUndefined();
    });

    it("should allow setting porArea", () => {
      const pref: PreferenciaNeurona = {
        neuronaId: "test-neuron",
        modo: "automatica",
        ultimaComprobacion: Date.now(),
        versionVista: "1.0.0",
        porArea: {
          imagen: "inteligente",
          voz: "manual",
        },
      };
      expect(pref.porArea).toEqual({
        imagen: "inteligente",
        voz: "manual",
      });
    });
  });

  describe("leerPreferencia and guardarPreferencia", () => {
    // We need to mock localStorage for these tests.
    // Since we are in a pure environment, we can use a mock.
    const localStorageMock = (() => {
      let store: Record<string, string> = {};
      return {
        getItem: (key: string): string | null => {
          return store[key] ?? null;
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

    // We need to override the almacen function in the module to use our mock.
    // However, since we are testing the actual module, we can't easily mock the internal almacen.
    // Instead, we can test the functions in isolation by mocking global.localStorage.
    // But note: the almacen function tries to access localStorage and catches errors.
    // We'll set global.localStorage to our mock.

    beforeEach(() => {
      // @ts-ignore
      global.localStorage = localStorageMock;
      localStorageMock.clear();
    });

    afterEach(() => {
      // @ts-ignore
      global.localStorage = undefined;
    });

    it("should read and write preferences without porArea (backward compatibility)", () => {
      const neuronaId = "test-neuron";
      const pref: PreferenciaNeurona = {
        neuronaId,
        modo: "manual",
        ultimaComprobacion: 12345,
        versionVista: "1.0.0",
      };

      guardarPreferencia(pref);
      const read = leerPreferencia(neuronaId);

      expect(read.neuronaId).toBe(neuronaId);
      expect(read.modo).toBe("manual");
      expect(read.ultimaComprobacion).toBe(12345);
      expect(read.versionVista).toBe("1.0.0");
      expect(read.porArea).toBeUndefined();
    });

    it("should read and write preferences with porArea", () => {
      const neuronaId = "test-neuron";
      const pref: PreferenciaNeurona = {
        neuronaId,
        modo: "automatica",
        ultimaComprobacion: 12345,
        versionVista: "1.0.0",
        porArea: {
          imagen: "inteligente",
          voz: "manual",
        },
      };

      guardarPreferencia(pref);
      const read = leerPreferencia(neuronaId);

      expect(read.neuronaId).toBe(neuronaId);
      expect(read.modo).toBe("automatica");
      expect(read.ultimaComprobacion).toBe(12345);
      expect(read.versionVista).toBe("1.0.0");
      expect(read.porArea).toEqual({
        imagen: "inteligente",
        voz: "manual",
      });
    });
  });

  describe("decidirAccionModelo", () => {
    it("should return 'nada' for non-inteligente mode", () => {
      expect(
        decidirAccionModelo({
          modo: "manual",
          enReposo: true,
          cabe: true,
          mejora: true,
        })
      ).toBe("nada");

      expect(
        decidirAccionModelo({
          modo: "automatica",
          enReposo: true,
          cabe: true,
          mejora: true,
        })
      ).toBe("nada");
    });

    it("should return 'instalar' for inteligente mode when all conditions are met (stationary)", () => {
      expect(
        decidirAccionModelo({
          modo: "inteligente",
          enReposo: true,
          cabe: true,
          mejora: true,
          // cargando not provided -> assumed not portable
        })
      ).toBe("instalar");
    });

    it("should return 'avisar' for inteligente mode if not enReposo but there is an improvement (stationary)", () => {
      expect(
        decidirAccionModelo({
          modo: "inteligente",
          enReposo: false,
          cabe: true,
          mejora: true,
        })
      ).toBe("avisar");
    });

    it("should return 'nada' for inteligente mode if not enReposo and no mejora (stationary)", () => {
      expect(
        decidirAccionModelo({
          modo: "inteligente",
          enReposo: false,
          cabe: true,
          mejora: false,
        })
      ).toBe("nada");
    });

    it("should return 'avisar' for inteligente mode if not cabe but there is an improvement (stationary)", () => {
      expect(
        decidirAccionModelo({
          modo: "inteligente",
          enReposo: true,
          cabe: false,
          mejora: true,
        })
      ).toBe("avisar");
    });

    it("should return 'nada' for inteligente mode if not cabe and no mejora (stationary)", () => {
      expect(
        decidirAccionModelo({
          modo: "inteligente",
          enReposo: true,
          cabe: false,
          mejora: false,
        })
      ).toBe("nada");
    });

    it("should return 'nada' for inteligente mode if no mejora (stationary)", () => {
      expect(
        decidirAccionModelo({
          modo: "inteligente",
          enReposo: true,
          cabe: true,
          mejora: false,
        })
      ).toBe("nada");
    });

    it("should return 'instalar' for inteligente mode when portable and charging", () => {
      expect(
        decidirAccionModelo({
          modo: "inteligente",
          enReposo: false, // even if not enReposo, for portable we only require cargando
          cabe: false,     // even if not cabe
          mejora: false,   // even if no mejora
          cargando: true, // portable and charging
        })
      ).toBe("instalar");
    });

    it("should return 'avisar' for inteligente mode when portable but not charging but there is an improvement", () => {
      expect(
        decidirAccionModelo({
          modo: "inteligente",
          enReposo: true,
          cabe: true,
          mejora: true,
          cargando: false, // portable but not charging
        })
      ).toBe("avisar");
    });

    it("should return 'nada' for inteligente mode when portable but not charging and no mejora", () => {
      expect(
        decidirAccionModelo({
          modo: "inteligente",
          enReposo: true,
          cabe: true,
          mejora: false,
          cargando: false, // portable but not charging
        })
      ).toBe("nada");
    });

    it("should return 'avisar' for inteligente mode when portable and cargando not provided (treated as stationary) but there is an improvement and missing enReposo", () => {
      expect(
        decidirAccionModelo({
          modo: "inteligente",
          enReposo: false, // stationary but not enReposo
          cabe: true,
          mejora: true,
          // cargando is undefined -> treated as not portable -> stationary
        })
      ).toBe("avisar");
    });

    it("should return 'nada' for inteligente mode when portable and cargando not provided (treated as stationary) but no mejora", () => {
      expect(
        decidirAccionModelo({
          modo: "inteligente",
          enReposo: true,
          cabe: true,
          mejora: false,
          // cargando is undefined -> treated as not portable -> stationary
        })
      ).toBe("nada");
    });
  });
});