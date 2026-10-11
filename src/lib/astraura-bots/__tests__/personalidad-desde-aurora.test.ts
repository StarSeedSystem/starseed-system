import { describe, it, expect } from "vitest";
import type { Personalidad } from "../tipos";
import { rasgosDesdePersonalidad, ANIMO_DESDE_VOZ } from "../personalidad-desde-aurora";

describe("personalidad-desde-aurora", () => {
  const basePersonalidad: Personalidad = {
    calidez: 0.5,
    energia: 0.5,
    formalidad: 0.5,
    curiosidad: 0.5,
    humor: 0.5,
    concision: 0.5,
  };

  describe("rasgosDesdePersonalidad", () => {
    it("should handle params in 0-100 scale", () => {
      const input = {
        params: {
          calidez: 80, // 0.8
          energia: 30, // 0.3
          humor: 60,   // 0.6
        },
      };
      const result = rasgosDesdePersonalidad(input, basePersonalidad);
      // Con peso 0.5: resultado = base + 0.5 * (entrada - base)
      expect(result.calidez).toBeCloseTo(0.5 + 0.5 * (0.8 - 0.5)); // 0.65
      expect(result.energia).toBeCloseTo(0.5 + 0.5 * (0.3 - 0.5)); // 0.4
      expect(result.humor).toBeCloseTo(0.5 + 0.5 * (0.6 - 0.5));   // 0.55
      // Otros rasgos deben permanecer igual
      expect(result.formalidad).toBe(0.5);
      expect(result.curiosidad).toBe(0.5);
      expect(result.concision).toBe(0.5);
    });

    it("should handle params in 0-1 scale", () => {
      const input = {
        params: {
          calidez: 0.8,
          energia: 0.3,
          humor: 0.6,
        },
      };
      const result = rasgosDesdePersonalidad(input, basePersonalidad);
      expect(result.calidez).toBeCloseTo(0.5 + 0.5 * (0.8 - 0.5)); // 0.65
      expect(result.energia).toBeCloseTo(0.5 + 0.5 * (0.3 - 0.5)); // 0.4
      expect(result.humor).toBeCloseTo(0.5 + 0.5 * (0.6 - 0.5));   // 0.55
    });

    it("should handle English aliases", () => {
      const input = {
        params: {
          warmth: 80,    // calidez
          energy: 30,    // energia
          brevity: 60,   // concision (valor alto = más conciso)
        },
      };
      const result = rasgosDesdePersonalidad(input, basePersonalidad);
      expect(result.calidez).toBeCloseTo(0.5 + 0.5 * (0.8 - 0.5)); // 0.65
      expect(result.energia).toBeCloseTo(0.5 + 0.5 * (0.3 - 0.5)); // 0.4
      expect(result.concision).toBeCloseTo(0.5 + 0.5 * (0.6 - 0.5)); // 0.55
    });

    it("should fall back to base for missing values", () => {
      const input = {
        params: {
          calidez: 80, // Solo se especifica calidez
        },
      };
      const result = rasgosDesdePersonalidad(input, basePersonalidad);
      expect(result.calidez).toBeCloseTo(0.65); // 0.5 + 0.5 * (0.8 - 0.5)
      // Todos los demás deben ser exactamente los valores base
      expect(result.energia).toBe(0.5);
      expect(result.formalidad).toBe(0.5);
      expect(result.curiosidad).toBe(0.5);
      expect(result.humor).toBe(0.5);
      expect(result.concision).toBe(0.5);
    });

    it("should not throw with invalid values", () => {
      // Estos no deben lanzar excepciones
      expect(() => rasgosDesdePersonalidad({ params: { calidez: "invalid" as any } }, basePersonalidad)).not.toThrow();
      expect(() => rasgosDesdePersonalidad({ params: { calidez: undefined } }, basePersonalidad)).not.toThrow();
      expect(() => rasgosDesdePersonalidad({ params: { calidez: null as any } }, basePersonalidad)).not.toThrow();
      expect(() => rasgosDesdePersonalidad({ emotions: { alegria: "invalid" as any } }, basePersonalidad)).not.toThrow();
    });

    it("should handle emotions: alegria increases energy and humor", () => {
      const input = {
        emotions: {
          alegria: 0.8, // 80%
        },
      };
      const result = rasgosDesdePersonalidad(input, basePersonalidad);
      // alegria sube energía y humor con peso 0.3 cada uno
      expect(result.energia).toBeCloseTo(0.5 + 0.3 * 0.8); // 0.74
      expect(result.humor).toBeCloseTo(0.5 + 0.3 * 0.8);   // 0.74
      // Otros rasgos deben permanecer igual
      expect(result.calidez).toBe(0.5);
      expect(result.formalidad).toBe(0.5);
      expect(result.curiosidad).toBe(0.5);
      expect(result.concision).toBe(0.5);
    });

    it("should handle emotions: calma decreases energy", () => {
      const input = {
        emotions: {
          calma: 0.6, // 60%
        },
      };
      const result = rasgosDesdePersonalidad(input, basePersonalidad);
      // calma baja energía con peso 0.3
      expect(result.energia).toBeCloseTo(0.5 - 0.3 * 0.6); // 0.32
      // Otros rasgos deben permanecer igual
      expect(result.calidez).toBe(0.5);
      expect(result.formalidad).toBe(0.5);
      expect(result.curiosidad).toBe(0.5);
      expect(result.humor).toBe(0.5);
      expect(result.concision).toBe(0.5);
    });

     it("should handle English emotion aliases", () => {
       const input = {
         emotions: {
           joy: 0.7,    // alegria
           calm: 0.4,   // calma
         },
       };
       const result = rasgosDesdePersonalidad(input, basePersonalidad);
       // joy (alegria) sube energía y humor; calm (calma) baja energía
       expect(result.energia).toBeCloseTo(0.5 + 0.3 * 0.7 - 0.3 * 0.4); // 0.59
       expect(result.humor).toBeCloseTo(0.5 + 0.3 * 0.7);   // 0.71
     });

    it("should clamp values to [0,1] range", () => {
      // Valores muy altos
      const inputAlto = {
        params: {
          calidez: 200, // 2.0 después de normalizar
        },
      };
      const resultAlto = rasgosDesdePersonalidad(inputAlto, basePersonalidad);
      expect(resultAlto.calidez).toBeLessThanOrEqual(1);
      expect(resultAlto.calidez).toBeGreaterThanOrEqual(0);

      // Valores muy bajos
      const inputBajo = {
        params: {
          calidez: -50, // -0.5 después de normalizar
        },
      };
      const resultBajo = rasgosDesdePersonalidad(inputBajo, basePersonalidad);
      expect(resultBajo.calidez).toBeLessThanOrEqual(1);
      expect(resultBajo.calidez).toBeGreaterThanOrEqual(0);
    });
  });

  describe("ANIMO_DESDE_VOZ", () => {
    it("should have all known moods", () => {
      const knownMoods = ["alegre", "sereno", "tenso", "triste", "enérgico", "neutral"];
      for (const mood of knownMoods) {
        expect(ANIMO_DESDE_VOZ[mood]).toBeDefined();
      }
    });

    it("should have ánimo values within proper ranges", () => {
      for (const [mood, animo] of Object.entries(ANIMO_DESDE_VOZ)) {
        // Valencia debe estar entre -1 y 1
        expect(animo.valencia).toBeGreaterThanOrEqual(-1);
        expect(animo.valencia).toBeLessThanOrEqual(1);
        // Activación debe estar entre 0 y 1
        expect(animo.activacion).toBeGreaterThanOrEqual(0);
        expect(animo.activacion).toBeLessThanOrEqual(1);
      }
    });
  });
});