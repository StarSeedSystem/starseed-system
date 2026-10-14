import { describe, it, expect } from "vitest";
import {
  MAX_ORBES_VISIBLES,
  disposicionOrbes,
  ordenZ,
  type PosOrbe,
} from "../orbes";

describe("disposicionOrbes", () => {
  it("should return empty array for empty input", () => {
    const res = disposicionOrbes([], { ancho: 800, alto: 600, diametro: 80 });
    expect(res).toHaveLength(0);
  });

  it("should handle a single non-principal orb with saved position", () => {
    const res = disposicionOrbes(
      [{ id: "a", pos: { xRatio: 0.3, yRatio: 0.4 } }],
      { ancho: 800, alto: 600, diametro: 80 },
    );
    expect(res.length).toBe(1);
    expect(res[0].id).toBe("a");
    expect(res[0].visible).toBe(true);
    expect(res[0].pos.xRatio).toBeCloseTo(0.3, 5);
    expect(res[0].pos.yRatio).toBeCloseTo(0.4, 5);
  });

  it("una sola orbe (principal) conserva su posición", () => {
    const res = disposicionOrbes(
      [{ id: "a", principal: true, pos: { xRatio: 0.3, yRatio: 0.4 } }],
      { ancho: 800, alto: 600, diametro: 80 },
    );
    expect(res.length).toBe(1);
    expect(res[0].id).toBe("a");
    expect(res[0].visible).toBe(true);
    expect(res[0].pos.xRatio).toBeCloseTo(0.3, 5);
    expect(res[0].pos.yRatio).toBeCloseTo(0.4, 5);
  });

  it("tres orbes sin solaparse", () => {
    const res = disposicionOrbes(
      [
        { id: "p", principal: true, pos: { xRatio: 0.5, yRatio: 0.5 } },
        { id: "a" },
        { id: "b" },
      ],
      { ancho: 800, alto: 600, diametro: 80 },
    );
    expect(res.length).toBe(3);
    expect(res.every((r) => r.visible)).toBe(true);
    // Ningún par está más cerca que diametro + 8 = 88 px.
    for (let i = 0; i < res.length; i++) {
      for (let j = i + 1; j < res.length; j++) {
        const dx = (res[i].pos.xRatio - res[j].pos.xRatio) * 800;
        const dy = (res[i].pos.yRatio - res[j].pos.yRatio) * 600;
        const dist = Math.sqrt(dx * dx + dy * dy);
        expect(dist).toBeGreaterThanOrEqual(88 - 0.01); // tolerancia numérica
      }
    }
  });

  it("should respect saved positions for multiple orbs when they don't overlap", () => {
    const res = disposicionOrbes(
      [
        { id: "p", principal: true, pos: { xRatio: 0.2, yRatio: 0.2 } },
        { id: "a", pos: { xRatio: 0.5, yRatio: 0.5 } },
        { id: "b", pos: { xRatio: 0.8, yRatio: 0.8 } },
      ],
      { ancho: 800, alto: 600, diametro: 80 },
    );
    expect(res.length).toBe(3);
    expect(res.every((r) => r.visible)).toBe(true);
    // Verify saved positions are respected
    const p = res.find((r) => r.id === "p")!;
    const a = res.find((r) => r.id === "a")!;
    const b = res.find((r) => r.id === "b")!;
    expect(p.pos.xRatio).toBeCloseTo(0.2, 5);
    expect(p.pos.yRatio).toBeCloseTo(0.2, 5);
    expect(a.pos.xRatio).toBeCloseTo(0.5, 5);
    expect(a.pos.yRatio).toBeCloseTo(0.5, 5);
    expect(b.pos.xRatio).toBeCloseTo(0.8, 5);
    expect(b.pos.yRatio).toBeCloseTo(0.8, 5);
    // Verify no overlap (distance >= diametro + 8 = 88 px)
    for (let i = 0; i < res.length; i++) {
      for (let j = i + 1; j < res.length; j++) {
        const dx = (res[i].pos.xRatio - res[j].pos.xRatio) * 800;
        const dy = (res[i].pos.yRatio - res[j].pos.yRatio) * 600;
        const dist = Math.sqrt(dx * dx + dy * dy);
        expect(dist).toBeGreaterThanOrEqual(88 - 0.01); // tolerancia numérica
      }
    }
  });

  it("posiciones guardadas respetadas (dentro de la vista)", () => {
    const res = disposicionOrbes(
      [
        { id: "p", principal: true, pos: { xRatio: 0.2, yRatio: 0.2 } },
        { id: "a", pos: { xRatio: 0.8, yRatio: 0.8 } },
      ],
      { ancho: 800, alto: 600, diametro: 80 },
    );
    const a = res.find((r) => r.id === "a")!;
    expect(a.pos.xRatio).toBeGreaterThanOrEqual(0.75);
    expect(a.pos.yRatio).toBeGreaterThanOrEqual(0.75);
  });

  it("recoloca si una posición guardada se sale de la vista", () => {
    // Posición fuera de márgenes con diámetro.
    const res = disposicionOrbes(
      [
        { id: "p", principal: true },
        { id: "a", pos: { xRatio: -0.2, yRatio: 1.5 } },
      ],
      { ancho: 360, alto: 640, diametro: 60 },
    );
    const a = res.find((r) => r.id === "a")!;
    expect(a.pos.xRatio).toBeGreaterThan(0);
    expect(a.pos.yRatio).toBeGreaterThan(0);
    expect(a.pos.xRatio).toBeLessThan(1);
    expect(a.pos.yRatio).toBeLessThan(1);
  });

  it("vista estrecha de móvil (360×640) mantiene margen y no solapa", () => {
    const res = disposicionOrbes(
      [
        { id: "p", principal: true },
        { id: "a" },
        { id: "b" },
        { id: "c" },
        { id: "d" },
      ],
      { ancho: 360, alto: 640, diametro: 60 },
    );
    expect(res.length).toBe(5);
    for (const r of res) {
      expect(r.pos.xRatio).toBeGreaterThanOrEqual(0);
      expect(r.pos.yRatio).toBeGreaterThanOrEqual(0);
      expect(r.pos.xRatio).toBeLessThanOrEqual(1);
      expect(r.pos.yRatio).toBeLessThanOrEqual(1);
    }
  });

  it("la sexta orbe queda oculta (visible: false)", () => {
    const res = disposicionOrbes(
      [
        { id: "p", principal: true },
        { id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }, { id: "e" }, { id: "f" },
      ],
      { ancho: 800, alto: 600, diametro: 80 },
    );
    expect(res.length).toBe(7);
    const visibles = res.filter((r) => r.visible);
    expect(visibles.length).toBeLessThanOrEqual(MAX_ORBES_VISIBLES);
    expect(res.find((r) => r.id === "f")!.visible).toBe(false);
  });

  it("determinismo: misma entrada → misma salida", () => {
    const entrada: readonly { id: string; principal?: boolean; pos?: PosOrbe }[] = [
      { id: "p", principal: true, pos: { xRatio: 0.4, yRatio: 0.4 } },
      { id: "a" },
      { id: "b" },
    ];
    const v = { ancho: 800, alto: 600, diametro: 80 };
    const r1 = disposicionOrbes(entrada, v);
    const r2 = disposicionOrbes(entrada, v);
    expect(r1).toHaveLength(r2.length);
    for (let i = 0; i < r1.length; i++) {
      expect(r1[i].id).toBe(r2[i].id);
      expect(r1[i].visible).toBe(r2[i].visible);
      expect(r1[i].pos.xRatio).toBeCloseTo(r2[i].pos.xRatio, 10);
      expect(r1[i].pos.yRatio).toBeCloseTo(r2[i].pos.yRatio, 10);
    }
  });

it("ordenZ pone enfocado último", () => {
  expect(ordenZ(["a", "b", "c"], "b")).toEqual(["a", "c", "b"]);
  expect(ordenZ(["a", "b", "c"], "")).toEqual(["a", "b", "c"]);
});

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

  it("should return the same array if the focused orb is the first", () => {
    const ids = ["a", "b", "c"];
    const enfocado = "a"; // already first
    const resultado = ordenZ(ids, enfocado);
    expect(resultado).toEqual(["a", "b", "c"]);
  });

  it("maneja duplicados", () => {
    const ids = ["a", "b", "a", "c"];
    const enfocado = "a";
    const resultado = ordenZ(ids, enfocado);
    // All 'a' should be moved to the end
    expect(resultado).toEqual(["b", "c", "a", "a"]);
  });

  it("should keep the relative order of the other orbs", () => {
    const ids = ["a", "b", "c", "d"];
    const enfocado = "b";
    const resultado = ordenZ(ids, enfocado);
    // The focused orb should be at the end
    expect(resultado[resultado.length - 1]).toBe("b");
    // The other orbs should maintain their relative order
    const otros = resultado.filter(id => id !== "b");
    expect(otros).toEqual(["a", "c", "d"]);
  });

  it("MAX_ORBES_VISIBLES = 5", () => {
    expect(MAX_ORBES_VISIBLES).toBe(5);
  });
});
