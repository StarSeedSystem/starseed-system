// src/lib/astraura-bots/__tests__/orbes.test.ts
// Tests for orbes.ts (BOT1011C1)
import { describe, it, expect } from "vitest";
import {
  MAX_ORBES_VISIBLES,
  PosOrbe,
  disposicionOrbes,
  ordenZ,
} from "../orbes";

describe("disposicionOrbes", () => {
  const vistaAncho = 360;
  const vistaAlto = 640;
  const diametro = 40; // example diameter in pixels

  it("una sola orbe", () => {
    const abiertos = [
      { id: "principal", principal: true, pos: { xRatio: 0.5, yRatio: 0.5 } },
    ];
    const resultado = disposicionOrbes(abiertos, {
      ancho: vistaAncho,
      alto: vistaAlto,
      diametro,
    });
    expect(resultado).toHaveLength(1);
    expect(resultado[0].id).toBe("principal");
    expect(resultado[0].pos).toEqual({ xRatio: 0.5, yRatio: 0.5 });
    expect(resultado[0].visible).toBe(true);
  });

  it("tres sin solaparse", () => {
    const abiertos = [
      { id: "p1", principal: true, pos: { xRatio: 0.5, yRatio: 0.5 } },
      { id: "p2", pos: { xRatio: 0.2, yRatio: 0.2 } },
      { id: "p3", pos: { xRatio: 0.8, yRatio: 0.8 } },
    ];
    const resultado = disposicionOrbes(abiertos, {
      ancho: vistaAncho,
      alto: vistaAlto,
      diametro,
    });
    // Expect all three visible and positions preserved (since they don't overlap)
    expect(resultado).toHaveLength(3);
    expect(resultado.map((r) => r.id)).toEqual(["p1", "p2", "p3"]);
    expect(resultado[0].visible).toBe(true);
    expect(resultado[1].visible).toBe(true);
    expect(resultado[2].visible).toBe(true);
    // Check that positions are approximately the same (allowing for small adjustments)
    expect(resultado[0].pos).toCloseToObject({ xRatio: 0.5, yRatio: 0.5 });
    expect(resultado[1].pos).toCloseToObject({ xRatio: 0.2, yRatio: 0.2 });
    expect(resultado[2].pos).toCloseToObject({ xRatio: 0.8, yRatio: 0.8 });
  });

  it("posiciones guardadas respetadas", () => {
    const abiertos = [
      { id: "p1", principal: true, pos: { xRatio: 0.5, yRatio: 0.5 } },
      { id: "p2", pos: { xRatio: 0.2, yRatio: 0.2 } },
    ];
    const resultado = disposicionOrbes(abiertos, {
      ancho: vistaAncho,
      alto: vistaAlto,
      diametro,
    });
    expect(resultado[0].pos).toEqual({ xRatio: 0.5, yRatio: 0.5 });
    expect(resultado[1].pos).toEqual({ xRatio: 0.2, yRatio: 0.2 });
  });

  it("recolocar si una guardada se sale de la vista", () => {
    // Position that is out of view (too far right)
    const abiertos = [
      { id: "p1", principal: true, pos: { xRatio: 0.5, yRatio: 0.5 } },
      { id: "p2", pos: { xRatio: 1.2, yRatio: 0.5 } }, // xRatio > 1
    ];
    const resultado = disposicionOrbes(abiertos, {
      ancho: vistaAncho,
      alto: vistaAlto,
      diametro,
    });
    // Expect p2 to be repositioned within view
    expect(resultado[1].pos.xRatio).toBeGreaterThanOrEqual(0);
    expect(resultado[1].pos.xRatio).toBeLessThanOrEqual(1);
    expect(resultado[1].pos.yRatio).toBeGreaterThanOrEqual(0);
    expect(resultado[1].pos.yRatio).toBeLessThanOrEqual(1);
    // Also, it should not overlap with p1
    // We'll check distance in pixels later
  });

  it("vista estrecha de móvil (360×640)", () => {
    const abiertos = [
      { id: "p1", principal: true, pos: { xRatio: 0.5, yRatio: 0.5 } },
      { id: "p2", pos: { xRatio: 0.2, yRatio: 0.2 } },
      { id: "p3", pos: { xRatio: 0.8, yRatio: 0.8 } },
      { id: "p4", pos: { xRatio: 0.2, yRatio: 0.8 } },
      { id: "p5", pos: { xRatio: 0.8, yRatio: 0.2 } },
      { id: "p6", pos: { xRatio: 0.5, yRatio: 0.5 } }, // duplicate position, will be adjusted
    ];
    const resultado = disposicionOrbes(abiertos, {
      ancho: vistaAncho,
      alto: vistaAlto,
      diametro,
    });
    // First five visible, sixth not
    expect(resultado.slice(0, 5).every((r) => r.visible)).toBe(true);
    expect(resultado[5].visible).toBe(false);
    // All positions should be within [0,1]
    resultado.forEach((r) => {
      expect(r.pos.xRatio).toBeGreaterThanOrEqual(0);
      expect(r.pos.xRatio).toBeLessThanOrEqual(1);
      expect(r.pos.yRatio).toBeGreaterThanOrEqual(0);
      expect(r.pos.yRatio).toBeLessThanOrEqual(1);
    });
  });

  it("sexta oculta", () => {
    const abiertos = Array.from({ length: 6 }, (_, i) => ({
      id: `orb${i}`,
      principal: i === 0,
      pos: i === 0 ? { xRatio: 0.5, yRatio: 0.5 } : undefined,
    }));
    const resultado = disposicionOrbes(abiertos, {
      ancho: vistaAncho,
      alto: vistaAlto,
      diametro,
    });
    // First five visible, sixth not
    expect(resultado.slice(0, 5).every((r) => r.visible)).toBe(true);
    expect(resultado[5].visible).toBe(false);
  });

  it("determinismo", () => {
    const abiertos = [
      { id: "p1", principal: true, pos: { xRatio: 0.5, yRatio: 0.5 } },
      { id: "p2", pos: { xRatio: 0.2, yRatio: 0.2 } },
      { id: "p3", pos: { xRatio: 0.8, yRatio: 0.8 } },
    ];
    const vista = { ancho: vistaAncho, alto: vistaAlto, diametro };
    const resultado1 = disposicionOrbes(abiertos, vista);
    const resultado2 = disposicionOrbes(abiertos, vista);
    expect(resultado1).toEqual(resultado2);
  });
});

describe("ordenZ", () => {
  it("pone delante la enfocada", () => {
    const ids = ["a", "b", "c"];
    const enfocado = "b";
    const resultado = ordenZ(ids, enfocado);
    // The focused orb should be last (painted on top)
    expect(resultado).toEqual(["a", "c", "b"]);
  });

  it("si no está enfocado, devuelve el mismo orden", () => {
    const ids = ["a", "b", "c"];
    const enfocado = "d"; // not in list
    const resultado = ordenZ(ids, enfocado);
    expect(resultado).toEqual(["a", "b", "c"]);
  });

  it("maneja duplicados", () => {
    const ids = ["a", "b", "a", "c"];
    const enfocado = "a";
    const resultado = ordenZ(ids, enfocado);
    // All 'a' should be moved to the end? The spec doesn't specify, but we move the enfocado to the end.
    // We'll implement: remove all occurrences of enfocado and then append them at the end.
    expect(resultado).toEqual(["b", "c", "a", "a"]);
  });
});

// Helper for toCloseToObject
expect.extend({
  toCloseToObject(received, expected) {
    const pass = Object.keys(expected).every((key) => {
      // @ts-ignore
      return Math.abs(received[key] - expected[key]) < 0.01; // tolerance 1%
    });
    if (pass) {
      return {
        message: () =>
          `expected ${JSON.stringify(received)} not to be close to ${JSON.stringify(expected)}`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `expected ${JSON.stringify(received)} to be close to ${JSON.stringify(expected)}`,
        pass: false,
      };
    }
  },
});