import { describe, it, expect } from "vitest";
import {
  EstadoRobotPato,
  ESTADO_INICIAL,
  caminar,
  girar,
  emocion,
  bailar,
  negacion,
  alto,
} from "../robot-pato";

describe("robot-pato", () => {
  describe("ESTADO_INICIAL", () => {
    it("tiene la posición en (0,0) y orientación 0", () => {
      expect(ESTADO_INICIAL.posicion).toEqual({ x: 0, y: 0 });
      expect(ESTADO_INICIAL.orientacion).toBe(0);
      expect(ESTADO_INICIAL.emocion).toBeUndefined();
    });
  });

  describe("caminar", () => {
    it("avanza 0.5 metros en la dirección actual", () => {
      const estado = caminar({}, ESTADO_INICIAL);
      const expectedX = 0.5 * Math.cos(0);
      const expectedY = 0.5 * Math.sin(0);
      expect(estado.posicion.x).toBeCloseTo(expectedX);
      expect(estado.posicion.y).toBeCloseTo(expectedY);
      expect(estado.orientacion).toBe(0);
    });

    it("avanza en la dirección de la orientación actual", () => {
      const estadoConOrientacion = { ...ESTADO_INICIAL, orientacion: Math.PI / 2 }; // mirando hacia arriba (eje Y positivo)
      const estado = caminar({}, estadoConOrientacion);
      expect(estado.posicion.x).toBeCloseTo(0);
      expect(estado.posicion.y).toBeCloseTo(0.5);
      expect(estado.orientacion).toBe(Math.PI / 2);
    });
  });

  describe("girar", () => {
    it("gira 90 grados en sentido horario", () => {
      const estado = girar({}, ESTADO_INICIAL);
      expect(estado.orientacion).toBeCloseTo(Math.PI / 2);
      expect(estado.posicion).toEqual(ESTADO_INICIAL.posicion);
    });

    it("gira desde una orientación inicial", () => {
      const estadoInicial = { ...ESTADO_INICIAL, orientacion: Math.PI };
      const estado = girar({}, estadoInicial);
      expect(estado.orientacion).toBeCloseTo(Math.PI + Math.PI / 2);
    });
  });

  describe("emocion", () => {
    it("establece el estado emocional", () => {
      const estado = emocion({}, ESTADO_INICIAL);
      expect(estado.emocion).toBe("alegre");
      expect(estado.posicion).toEqual(ESTADO_INICIAL.posicion);
      expect(estado.orientacion).toBe(ESTADO_INICIAL.orientacion);
    });
  });

  describe("bailar", () => {
    it("deja al robot en la misma posición y orientación", () => {
      const estado = bailar({}, ESTADO_INICIAL);
      expect(estado).toEqual(ESTADO_INICIAL);
    });

    it("funciona con orientación inicial distinta", () => {
      const estadoInicial = { ...ESTADO_INICIAL, orientacion: Math.PI / 4 };
      const estado = bailar({}, estadoInicial);
      expect(estado).toEqual(estadoInicial);
    });
  });

  describe("negacion", () => {
    it("no cambia el estado", () => {
      const estado = negacion({}, ESTADO_INICIAL);
      expect(estado).toEqual(ESTADO_INICIAL);
    });
  });

  describe("alto", () => {
    it("no cambia el estado", () => {
      const estado = alto({}, ESTADO_INICIAL);
      expect(estado).toEqual(ESTADO_INICIAL);
    });
  });
});