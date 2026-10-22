import { describe, it, expect } from "vitest";

import type { NeuronaReticula, Reticula, SenalMedida } from "../tipos";
import { coordinacionTitanio } from "../titanio";
import { cristalizar } from "../cristalizacion";

/** Titanio de la retícula con la batería que se quiera. */
const titanio = (bateriaPct: number | null, cargando: boolean): NeuronaReticula => ({
  id: "r",
  cuenta: "c1",
  esRouter: true,
  capacidad: { ramGb: 4, bateriaPct, cargando },
  medios: [],
});

/** Cadena de seis aparatos (medidas buenas) más un titanio medido peor contra todos ellos. */
const reticulaConTitanio = (cargando: boolean): Reticula => {
  const cadena = ["a", "b", "c", "d", "e", "f"];
  const teselas: Reticula["teselas"] = {};
  for (const id of [...cadena, "r"]) {
    teselas[id] = {
      origen: id,
      reloj: 1,
      neurona: {
        id,
        cuenta: "c1",
        esRouter: id === "r",
        capacidad: { ramGb: 4, bateriaPct: id === "r" ? 30 : 80, cargando: id === "r" ? cargando : false },
        medios: [],
      },
      senales: [],
    };
  }
  const senal = (de: string, a: string, rssiDbm: number): SenalMedida => ({
    de,
    a,
    medio: "wifi-lan",
    rssiDbm,
    vistaEn: 1,
  });
  for (let i = 0; i < cadena.length - 1; i++) {
    teselas[cadena[i]].senales.push(senal(cadena[i], cadena[i + 1], -60));
  }
  for (const id of cadena) teselas.r.senales.push(senal("r", id, -70));
  return { teselas };
};

describe("titanio con batería", () => {
  describe("coordinacionTitanio", () => {
    it("da 6 con corriente, batería desconocida o al menos 50 %", () => {
      expect(coordinacionTitanio(titanio(5, true))).toBe(6);
      expect(coordinacionTitanio(titanio(null, false))).toBe(6);
      expect(coordinacionTitanio(titanio(50, false))).toBe(6);
      expect(coordinacionTitanio(titanio(100, false))).toBe(6);
    });

    it("baja a 4 entre 20 y 50 % y a 3 por debajo del 20 %", () => {
      expect(coordinacionTitanio(titanio(49, false))).toBe(4);
      expect(coordinacionTitanio(titanio(30, false))).toBe(4);
      expect(coordinacionTitanio(titanio(20, false))).toBe(4);
      expect(coordinacionTitanio(titanio(19, false))).toBe(3);
      expect(coordinacionTitanio(titanio(0, false))).toBe(3);
    });
  });

  describe("cristalizar", () => {
    it("un titanio al 30 % sin cargar no pasa de 4 puentes", () => {
      const cristal = cristalizar(reticulaConTitanio(false));
      expect(cristal.coordinacion.r).toBeLessThanOrEqual(4);
    });

    it("enchufado vuelve a 6 puentes", () => {
      const cristal = cristalizar(reticulaConTitanio(true));
      expect(cristal.coordinacion.r).toBe(6);
    });
  });
});
