import { describe, expect, it } from "vitest";
import { accionToComando, ACCIONES_PATO, type AccionPato } from "../pato-simulado";

describe("pato-simulado (Ola 1011I · Voces locales fluidas)", () => {
  describe("accionToComando", () => {
    it("traduce 'caminar' a comando de movimiento hacia adelante", () => {
      const resultado = accionToComando("caminar", 0.5);
      expect(resultado).toHaveProperty("adelante");
      expect(resultado.adelante).toBe(0.5);
    });

    it("traduce 'girar' a comando de giro con dirección aleatoria", () => {
      const resultado = accionToComando("girar", 0.7);
      expect(resultado).toHaveProperty("giro");
      // El valor debe estar entre -0.7 y 0.7
      expect(Math.abs(resultado.giro)).toBeLessThanOrEqual(0.7);
      expect(Math.abs(resultado.giro)).toBeGreaterThanOrEqual(0);
    });

    it("traduce 'emocion' a comando de expresión emocional", () => {
      const resultado = accionToComando("emocion", 0.3);
      expect(resultado).toHaveProperty("emocion");
      expect(resultado.emocion).toBe(0.3);
    });

    it("traduce 'bailar' a comando de baile", () => {
      const resultado = accionToComando("bailar", 0.8);
      expect(resultado).toHaveProperty("baile");
      expect(resultado.baile).toBe(0.8);
    });

    it("traduce 'negacion' a comando de movimiento de cabeza", () => {
      const resultado = accionToComando("negacion", 0.6);
      expect(resultado).toHaveProperty("cabeza");
      expect(resultado.cabeza).toBe(0.6);
    });

    it("usa intensidad por defecto cuando no se especifica", () => {
      const resultado = accionToComando("caminar");
      // El valor por defecto en la función es 0.5
      expect(resultado.adelante).toBe(0.5);
    });

    it("limita intensidad entre 0 y 1", () => {
      // Valor negativo se convierte en 0
      let resultado = accionToComando("caminar", -0.2);
      expect(resultado.adelante).toBe(0);
      
      // Valor mayor a 1 se convierte en 1
      resultado = accionToComando("caminar", 1.5);
      expect(resultado.adelante).toBe(1);
      
      // Valores dentro del rango se mantienen
      resultado = accionToComando("caminar", 0.7);
      expect(resultado.adelante).toBe(0.7);
    });

    it("devuelve objeto vacío para acción desconocida", () => {
      // @ts-ignore: Probando con acción intencionalmente desconocida
      const resultado = accionToComando("volar" as AccionPato, 0.5);
      expect(resultado).toEqual({});
    });
  });

  describe("ACCIONES_PATO", () => {
    it("contiene exactamente las 5 acciones esperadas", () => {
      expect(ACCIONES_PATO).toHaveLength(5);
      expect(ACCIONES_PATO).toContain("caminar");
      expect(ACCIONES_PATO).toContain("girar");
      expect(ACCIONES_PATO).toContain("emocion");
      expect(ACCIONES_PATO).toContain("bailar");
      expect(ACCIONES_PATO).toContain("negacion");
    });
  });
});