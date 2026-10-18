import { describe, it, expect } from "vitest";

import {
  crearTesela,
  fusionarTesela,
  fusionarTodas,
  caducar,
  senalesDeReticula,
  huellaReticula,
} from "../teselas";
import type { NeuronaReticula, SenalMedida } from "../tipos";

describe("teselas (CRDT)", () => {
  describe("crearTesela", () => {
    it("should create a tesela with given data", () => {
      // TODO
    });
  });

  describe("fusionarTesela", () => {
    it("should merge a tesela into an empty reticula", () => {
      // TODO
    });
  });

  describe("fusionarTodas", () => {
    it("should merge multiple teselas", () => {
      // TODO
    });
  });

  describe("caducar", () => {
    it("should remove expired teselas", () => {
      // TODO
    });
  });

  describe("senalesDeReticula", () => {
    it("should combine signals by claveSenal taking the worse", () => {
      // TODO
    });
  });

  describe("huellaReticula", () => {
    it("debería dar una huella fija conocida que no cambia", () => {
      const neurona: NeuronaReticula = {
        id: "neurona-a",
        cuenta: "cuenta-ejemplo",
        capacidad: { ramGb: 8, bateriaPct: 55, cargando: false },
        medios: ["wifi-lan", "ble"],
      };
      const senal: SenalMedida = {
        de: "neurona-a",
        a: "neurona-b",
        medio: "wifi-lan",
        rssiDbm: -58,
        snrDb: 12.5,
        rttMs: 24,
        vistaEn: 1728000000000,
      };
      const reticula = fusionarTodas([crearTesela(neurona, [senal], 7)]);
      // Huella FNV-1a de 64 bits fijada (2026-10-18): si este valor cambia,
      // dos neuronas con la misma retícula verían huellas distintas y se
      // rompería el «misma retícula en N de M neuronas». Es el mismo valor
      // con la máscara dentro del bucle: aritmética módulo 2^64.
      expect(huellaReticula(reticula)).toBe("b10c59d817281fba");
    });

    it("debería tardar menos de 500 ms con 1.000 neuronas", () => {
      const teselas = Array.from({ length: 1000 }, (_, i) => {
        const id = `neurona-${i.toString().padStart(4, "0")}`;
        const neurona: NeuronaReticula = {
          id,
          cuenta: "cuenta-ejemplo",
          capacidad: { ramGb: 4, bateriaPct: 80, cargando: false },
          medios: ["wifi-lan"],
        };
        const senal: SenalMedida = {
          de: id,
          a: "neurona-central",
          medio: "wifi-lan",
          rssiDbm: -60,
          vistaEn: 1728000000000 + i,
        };
        return crearTesela(neurona, [senal], i + 1);
      });
      const reticula = fusionarTodas(teselas);
      // Sin la máscara de 64 bits en cada byte el BigInt crece sin límite y
      // esto tardaba 11 s con solo 256 neuronas (tiempo cuadrático).
      const antes = Date.now();
      const huella = huellaReticula(reticula);
      const transcurrido = Date.now() - antes;
      expect(huella).toMatch(/^[0-9a-f]{16}$/);
      expect(transcurrido).toBeLessThan(500);
    });
  });
});