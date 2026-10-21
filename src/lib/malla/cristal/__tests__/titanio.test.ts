import { describe, it, expect } from "vitest";
import {
  COORDINACION_TITANIO,
  MARGEN_TITANIO,
  esTitanio,
  temperaturaAmortiguada,
  margenDePuente,
  bonusTroncal,
  teselaDeRouter,
} from "../titanio";
import type { NeuronaReticula, Tesela, Medio } from "../tipos";

describe("titanio", () => {
  describe("constantes", () => {
    it("COORDINACION_TITANIO es 6", () => {
      expect(COORDINACION_TITANIO).toBe(6);
    });
    it("MARGEN_TITANIO es 0.30", () => {
      expect(MARGEN_TITANIO).toBe(0.30);
    });
  });

  describe("teselaDeRouter", () => {
    it("crea una tesela con neurona titanio y señales por troncal", () => {
      const t = teselaDeRouter({
        routerId: "r1",
        cuenta: "c1",
        adoptadoPor: "n-adoptante",
        troncales: [
          { a: "r1", b: "n2", rssiDbm: -45, anchoBandaKbps: 10000 },
          { a: "n2", b: "r1", frecuenciaMhz: 5200 },
        ],
        reloj: 42,
        ahora: 1000,
      });
      expect(t.origen).toBe("n-adoptante");
      expect(t.reloj).toBe(42);
      expect(t.neurona.esRouter).toBe(true);
      expect(t.neurona.medios).toEqual(["wifi-mesh"]);
      expect(t.neurona.capacidad.ramGb).toBe(0.25);
      expect(t.neurona.capacidad.bateriaPct).toBeNull();
      expect(t.neurona.capacidad.cargando).toBe(true);
      expect(t.senales.length).toBe(2);
      expect(t.senales[0].medio).toBe("wifi-mesh");
    });
    it("ignora troncales que no tocan al router", () => {
      const t = teselaDeRouter({
        routerId: "r1",
        cuenta: "c1",
        adoptadoPor: "n1",
        troncales: [
          { a: "n2", b: "n3" },
        ],
        reloj: 1,
        ahora: 10,
      });
      expect(t.senales.length).toBe(0);
    });
    it("no incluye firma (la pone la neurona adoptante)", () => {
      const t = teselaDeRouter({
        routerId: "r1",
        cuenta: "c1",
        adoptadoPor: "n1",
        troncales: [],
        reloj: 1,
        ahora: 10,
      });
      expect((t as { firma?: string }).firma).toBeUndefined();
    });
  });

  describe("temperaturaAmortiguada", () => {
    it("reduce proporcionalmente con vecinos titanio", () => {
      // Sin vecinos Ti: factor = 1 - 0 = 1, temperatura = t (limitada a 0.2)
      expect(temperaturaAmortiguada(1, 0, 4)).toBeLessThanOrEqual(0.2);
      // 2 Ti de 4 vecinos: factor = 1 - 0.6*2/4 = 0.7; t=1 -> 0.7, limitado a 0.2
      expect(temperaturaAmortiguada(1, 2, 4)).toBe(0.2);
      // Todos vecinos Ti (4 de 4): factor = 1 - 0.6 = 0.4; t=0.5 -> 0.2
      expect(temperaturaAmortiguada(0.5, 4, 4)).toBe(0.2);
    });
    it("nunca supera 0.2 (titanio fija la red)", () => {
      for (let t = 0; t <= 1; t += 0.1) {
        expect(temperaturaAmortiguada(t, 1, 1)).toBeLessThanOrEqual(0.2);
      }
    });
  });

  describe("margenDePuente", () => {
    it("devuelve MARGEN_TITANIO si alguno es Ti", () => {
      expect(margenDePuente(0.1, true, false)).toBe(0.30);
      expect(margenDePuente(0.1, false, true)).toBe(0.30);
      expect(margenDePuente(0.1, true, true)).toBe(0.30);
    });
    it("devuelve el margen base si ninguno es Ti", () => {
      expect(margenDePuente(0.15, false, false)).toBe(0.15);
    });
  });

  describe("bonusTroncal", () => {
    it("resta 0.15 entre dos Ti por wifi-mesh", () => {
      expect(bonusTroncal("wifi-mesh" as Medio, true, true)).toBe(-0.15);
    });
    it("es 0 si no es wifi-mesh o no son ambos Ti", () => {
      expect(bonusTroncal("wifi-mesh" as Medio, true, false)).toBe(0);
      expect(bonusTroncal("wifi-mesh" as Medio, false, true)).toBe(0);
      expect(bonusTroncal("lora" as Medio, true, true)).toBe(0);
      expect(bonusTroncal("lora" as Medio, false, false)).toBe(0);
    });
  });

  describe("esTitanio", () => {
    it("devuelve true cuando esRouter es true", () => {
      const n: NeuronaReticula = {
        id: "r1",
        cuenta: "c1",
        esRouter: true,
        capacidad: { ramGb: 4, bateriaPct: 80, cargando: false },
        medios: ["wifi-mesh"],
      };
      expect(esTitanio(n)).toBe(true);
    });
    it("devuelve false cuando esRouter es false o ausente", () => {
      const n: NeuronaReticula = {
        id: "n1",
        cuenta: "c1",
        esRouter: false,
        capacidad: { ramGb: 4, bateriaPct: 80, cargando: false },
        medios: ["lora"],
      };
      expect(esTitanio(n)).toBe(false);
    });
  });
});
