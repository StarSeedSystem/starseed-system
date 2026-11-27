/**
 * Sección Aparatos de la ficha de neurona: lista de aparatos con nombre, sistema, medio, última vez.
 * Tests de funciones puras exportadas.
 */
import { describe, it, expect } from "vitest";
import {
  filasAparatos,
  textoUltimaVez,
  aparatoTieneLapida,
} from "./seccion-aparatos";

describe("seccion-aparatos (funciones puras)", () => {
  describe("textoUltimaVez", () => {
    const ahora = 1_700_000_000_000;

    it("devuelve cadena vacía para valores inválidos", () => {
      expect(textoUltimaVez(undefined, ahora)).toBe("");
      expect(textoUltimaVez(null, ahora)).toBe("");
      expect(textoUltimaVez(0, ahora)).toBe("");
      expect(textoUltimaVez(ahora + 1000, ahora)).toBe("");
    });

    it("formatea minutos, horas y días", () => {
      expect(textoUltimaVez(ahora - 30_000, ahora)).toBe("vista hace 0 min");
      expect(textoUltimaVez(ahora - 5 * 60_000, ahora)).toBe("vista hace 5 min");
      expect(textoUltimaVez(ahora - 90 * 60_000, ahora)).toBe("vista hace 1 h");
      expect(textoUltimaVez(ahora - 25 * 60 * 60_000, ahora)).toBe("vista hace 1 d");
      expect(textoUltimaVez(ahora - 3 * 24 * 60 * 60_000, ahora)).toBe("vista hace 3 d");
    });
  });

  describe("aparatoTieneLapida", () => {
    it("detecta lápida correctamente", () => {
      expect(aparatoTieneLapida({ ts: 100, fuera: 200 })).toBe(true);
      expect(aparatoTieneLapida({ ts: 200, fuera: 200 })).toBe(true);
      expect(aparatoTieneLapida({ ts: 200, fuera: 100 })).toBe(false);
      expect(aparatoTieneLapida({ ts: 100 })).toBe(false);
      expect(aparatoTieneLapida({ ts: 100, fuera: undefined })).toBe(false);
    });
  });

  describe("filasAparatos", () => {
    it("devuelve filas para aparatos vinculados (sin lápidas)", () => {
      const filas = filasAparatos({
        aparatos: {
          "aparato-1": { n: "Móvil de Alex", medio: "android", so: "Android", equipo: "Pixel 8", ts: 1_700_000_000_000 - 5 * 60_000 },
          "aparato-2": { n: "Tableta", medio: "web", so: "iPadOS", equipo: "iPad Pro", ts: 1_700_000_000_000 - 2 * 60 * 60_000, fuera: 1_700_000_000_000 - 60 * 60_000 },
        },
        idActual: "aparato-1",
      });
      expect(filas).toHaveLength(1);
      expect(filas[0]).toMatchObject({
        id: "aparato-1",
        nombre: "Móvil de Alex",
        medio: "android",
        so: "Android",
        equipo: "Pixel 8",
        esActual: true,
      });
    });

    it("ordena por última vez vista (más reciente primero)", () => {
      const filas = filasAparatos({
        aparatos: {
          "aparato-a1": { n: "A", ts: 100 },
          "aparato-a2": { n: "B", ts: 200 },
          "aparato-a3": { n: "C", ts: 150 },
        },
        idActual: "aparato-a1",
      });
      expect(filas.map((f) => f.nombre)).toEqual(["B", "C", "A"]);
    });

    it("marca el aparato actual", () => {
      const filas = filasAparatos({
        aparatos: {
          "aparato-a1": { n: "A", ts: 100 },
          "aparato-a2": { n: "B", ts: 200 },
        },
        idActual: "aparato-a2",
      });
      expect(filas.find((f) => f.id === "aparato-a2")?.esActual).toBe(true);
      expect(filas.find((f) => f.id === "aparato-a1")?.esActual).toBe(false);
    });
  });
});