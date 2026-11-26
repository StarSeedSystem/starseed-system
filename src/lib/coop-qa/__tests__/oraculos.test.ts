import { describe, expect, it } from "vitest";
import {
  testConvergencia,
  invariantesCriticas,
  type EstadoSalaSync,
} from "../index";

const estadoValido: EstadoSalaSync = {
  salaId: "sala-test",
  reloj: 1,
  objetos: {
    o1: { id: "o1", tipo: "frasco", propietario: "p1", epoch: 1, salud: 100 },
    o2: { id: "o2", tipo: "llave", propietario: "p2", epoch: 1 },
  },
  jugadores: {
    p1: { id: "p1", nombre: "Ana", inventario: [], salud: 100 },
    p2: { id: "p2", nombre: "Luis", inventario: [], salud: 100 },
  },
};

describe("oraculos", () => {
  describe("unPropietarioPorObjeto", () => {
    it("pasa cuando cada objeto tiene un solo propietario", () => {
      const r = invariantesCriticas.unPropietarioPorObjeto(estadoValido);
      expect(r.ok).toBe(true);
    });

    it("falla cuando un objeto tiene múltiples propietarios", () => {
      const estado: EstadoSalaSync = {
        ...estadoValido,
        objetos: {
          o1: { id: "o1", tipo: "frasco", propietario: "p1", epoch: 1, salud: 100 },
          o3: { id: "o3", tipo: "llave", propietario: "p1", epoch: 1 },
        },
      };
      const r = invariantesCriticas.unPropietarioPorObjeto(estado);
      expect(r.ok).toBe(false);
      expect(r.error).toContain("Propietario duplicado");
    });
  });

  describe("conservacionObjetos", () => {
    it("pasa cuando el número de objetos vivos es constante", () => {
      const r = invariantesCriticas.conservacionObjetos(estadoValido, estadoValido);
      expect(r.ok).toBe(true);
    });

    it("falla cuando se crean objetos", () => {
      const inicial = { ...estadoValido, reloj: 1 };
      const actual: EstadoSalaSync = {
        ...estadoValido,
        reloj: 2,
        objetos: {
          ...estadoValido.objetos,
          o3: { id: "o3", tipo: "espada", propietario: "p1", epoch: 2 },
        },
      };
      const r = invariantesCriticas.conservacionObjetos(actual, inicial);
      expect(r.ok).toBe(false);
      expect(r.error).toContain("Objetos creados/perdidos");
    });
  });

  describe("relojMonotonicamenteCreciente", () => {
    it("pasa cuando el reloj crece", () => {
      const r = invariantesCriticas.relojMonotonicamenteCreciente(1, 2);
      expect(r.ok).toBe(true);
    });

    it("pasa cuando el reloj se mantiene", () => {
      const r = invariantesCriticas.relojMonotonicamenteCreciente(5, 5);
      expect(r.ok).toBe(true);
    });

    it("falla cuando el reloj retrocede", () => {
      const r = invariantesCriticas.relojMonotonicamenteCreciente(10, 5);
      expect(r.ok).toBe(false);
      expect(r.error).toContain("retrocedió");
    });
  });

  describe("convergencia", () => {
    it("pasa cuando hay un solo estado", () => {
      const r = invariantesCriticas.convergencia([estadoValido]);
      expect(r.ok).toBe(true);
    });

    it("pasa cuando todos los estados son idénticos", () => {
      const r = invariantesCriticas.convergencia([estadoValido, estadoValido, estadoValido]);
      expect(r.ok).toBe(true);
    });

    it("falla cuando los relojes difieren", () => {
      const otro: EstadoSalaSync = { ...estadoValido, reloj: 5 };
      const r = invariantesCriticas.convergencia([estadoValido, otro]);
      expect(r.ok).toBe(false);
      expect(r.error).toContain("Relojes diferentes");
    });

    it("falla cuando los objetos difieren", () => {
      const otro: EstadoSalaSync = {
        ...estadoValido,
        objetos: {
          o1: { id: "o1", tipo: "frasco", propietario: "p1", epoch: 1, salud: 100 },
        },
      };
      const r = invariantesCriticas.convergencia([estadoValido, otro]);
      expect(r.ok).toBe(false);
    });

    it("pasa con array vacío", () => {
      const r = invariantesCriticas.convergencia([]);
      expect(r.ok).toBe(true);
    });
  });
});

describe("testConvergencia", () => {
  it("retorna PASS cuando todos los oráculos pasan", () => {
    const r = testConvergencia([estadoValido, estadoValido]);
    expect(r.resultado).toBe("PASS");
    expect(r.fail).toBe(0);
  });

  it("retorna FAIL cuando hay incoherencia", () => {
    const otro: EstadoSalaSync = { ...estadoValido, reloj: 5 };
    const r = testConvergencia([estadoValido, otro]);
    expect(r.resultado).toBe("FAIL");
    expect(r.fail).toBeGreaterThan(0);
    expect(r.errores.length).toBeGreaterThan(0);
  });

  it("cuenta correctamente los tests", () => {
    const estado2: EstadoSalaSync = {
      ...estadoValido,
      objetos: {
        o1: { id: "o1", tipo: "frasco", propietario: "p1", epoch: 1, salud: 100 },
        o2: { id: "o2", tipo: "llave", propietario: "p2", epoch: 1 },
      },
      reloj: 1,
    };
    const r = testConvergencia([estadoValido, estado2]);
    expect(r.pass).toBeGreaterThan(0);
    expect(r.fail).toBe(0);
  });
});