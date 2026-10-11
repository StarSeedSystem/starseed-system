import { describe, it, expect } from "vitest";
import {
  MAX_ORBES_VISIBLES,
  PosOrbe,
  disposicionOrbes,
  ordenZ,
} from "@/lib/astraura-bots/orbes";

describe("orbes (pure)", () => {
  describe("constants", () => {
    it("should have MAX_ORBES_VISIBLES = 5", () => {
      expect(MAX_ORBES_VISIBLES).toBe(5);
    });
  });

  describe("disposicionOrbes", () => {
    const vistaAncho = 800;
    const vistaAlto = 600;
    const diametro = 50;

    it("should return empty array for empty input", () => {
      const result = disposicionOrbes([], { ancho: vistaAncho, alto: vistaAlto, diametro });
      expect(result).toEqual([]);
    });

    it("should handle a single orb (principal)", () => {
      const abiertos = [{ id: "principal", principal: true }];
      const result = disposicionOrbes(abiertos, { ancho: vistaAncho, alto: vistaAlto, diametro });
      expect(result.length).toBe(1);
      expect(result[0].id).toBe("principal");
      expect(result[0].visible).toBe(true);
      // Position should be within view
      expect(result[0].pos.xRatio).toBeGreaterThanOrEqual(0);
      expect(result[0].pos.xRatio).toBeLessThanOrEqual(1);
      expect(result[0].pos.yRatio).toBeGreaterThanOrEqual(0);
      expect(result[0].pos.yRatio).toBeLessThanOrEqual(1);
    });

    it("should handle a single non-principal orb with saved position", () => {
      const abiertos = [{ id: "orb1", pos: { xRatio: 0.5, yRatio: 0.5 } }];
      const result = disposicionOrbes(abiertos, { ancho: vistaAncho, alto: vistaAlto, diametro });
      expect(result.length).toBe(1);
      expect(result[0].id).toBe("orb1");
      expect(result[0].visible).toBe(true);
      expect(result[0].pos).toEqual({ xRatio: 0.5, yRatio: 0.5 });
    });

    it("should respect saved positions for multiple orbs when they don't overlap", () => {
      const abiertos = [
        { id: "principal", principal: true, pos: { xRatio: 0.9, yRatio: 0.88 } },
        { id: "orb1", pos: { xRatio: 0.1, yRatio: 0.1 } },
        { id: "orb2", pos: { xRatio: 0.5, yRatio: 0.5 } },
      ];
      const result = disposicionOrbes(abiertos, { ancho: vistaAncho, alto: vistaAlto, diametro });
      // All should be visible (3 <= 5)
      expect(result.length).toBe(3);
      expect(result.map((r) => r.id)).toEqual(["principal", "orb1", "orb2"]);
      // Check that saved positions are respected
      const principalResult = result.find((r) => r.id === "principal");
      expect(principalResult?.pos).toEqual({ xRatio: 0.9, yRatio: 0.88 });
      const orb1Result = result.find((r) => r.id === "orb1");
      expect(orb1Result?.pos).toEqual({ xRatio: 0.1, yRatio: 0.1 });
      const orb2Result = result.find((r) => r.id === "orb2");
      expect(orb2Result?.pos).toEqual({ xRatio: 0.5, yRatio: 0.5 });
    });

    it("should reposition a saved position that is out of view", () => {
      // Position that is too far to the left (negative xRatio)
      const abiertos = [
        { id: "principal", principal: true, pos: { xRatio: 0.9, yRatio: 0.88 } },
        { id: "orb1", pos: { xRatio: -0.1, yRatio: 0.5 } }, // out of view
      ];
      const result = disposicionOrbes(abiertos, { ancho: vistaAncho, alto: vistaAlto, diametro });
      expect(result.length).toBe(2);
      // The repositioned orb should be within view
      const orb1Result = result.find((r) => r.id === "orb1");
      expect(orb1Result?.visible).toBe(true);
      expect(orb1Result?.pos.xRatio).toBeGreaterThanOrEqual(0);
      expect(orb1Result?.pos.xRatio).toBeLessThanOrEqual(1);
      expect(orb1Result?.pos.yRatio).toBeGreaterThanOrEqual(0);
      expect(orb1Result?.pos.yRatio).toBeLessThanOrEqual(1);
    });

    it("should handle narrow mobile view (360x640)", () => {
      const abiertos = [
        { id: "principal", principal: true },
        { id: "orb1" },
        { id: "orb2" },
        { id: "orb3" },
        { id: "orb4" },
        { id: "orb5" },
        { id: "orb6" }, // sixth should be hidden
      ];
      const result = disposicionOrbes(abiertos, { ancho: 360, alto: 640, diametro: 50 });
      expect(result.length).toBe(7);
      // First 5 visible, sixth and seventh hidden
      const visible = result.filter((r) => r.visible);
      const hidden = result.filter((r) => !r.visible);
      expect(visible.length).toBe(MAX_ORBES_VISIBLES); // 5
      expect(hidden.length).toBe(2);
      // Check that the principal is first in the list (by our ordering)
      expect(result[0].id).toBe("principal");
      // The next four should be the non-principal orbs in alphabetical order
      expect(result.slice(1, 5).map((r) => r.id)).toEqual(["orb1", "orb2", "orb3", "orb4"]);
      // The hidden ones should be orb5 and orb6
      expect(hidden.map((r) => r.id)).toEqual(["orb5", "orb6"]);
    });

    it("should be deterministic: same input yields same output", () => {
      const abiertos = [
        { id: "c", principal: true },
        { id: "a" },
        { id: "b" },
      ];
      const vista = { ancho: 800, alto: 600, diametro: 50 };
      const result1 = disposicionOrbes(abiertos, vista);
      const result2 = disposicionOrbes(abiertos, vista);
      expect(result1).toEqual(result2);
    });

    it("should place orbs without overlapping (distance >= diametro + 8)", () => {
      const abiertos = [
        { id: "principal", principal: true },
        { id: "orb1" },
        { id: "orb2" },
        { id: "orb3" },
      ];
      const result = disposicionOrbes(abiertos, { ancho: 800, alto: 600, diametro: 50 });
      // Convert positions to pixels
      const toPixels = (pos: PosOrbe, ancho: number, alto: number) => ({
        x: pos.xRatio * ancho,
        y: pos.yRatio * alto,
      });
      const minDist = 50 + 8; // diametro + 8
      for (let i = 0; i < result.length; i++) {
        for (let j = i + 1; j < result.length; j++) {
          const pos1 = toPixels(result[i].pos, 800, 600);
          const pos2 = toPixels(result[j].pos, 800, 600);
          const dx = pos1.x - pos2.x;
          const dy = pos1.y - pos2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          expect(dist).toBeGreaterThanOrEqual(minDist);
        }
      }
    });
  });

  describe("ordenZ", () => {
    it("should return the same array if no focused orb", () => {
      const ids = ["a", "b", "c"];
      expect(ordenZ(ids)).toEqual(ids);
    });

    it("should move focused orb to the front", () => {
      const ids = ["a", "b", "c"];
      expect(ordenZ(ids, "b")).toEqual(["b", "a", "c"]);
    });

    it("should keep the relative order of the other orbs", () => {
      const ids = ["a", "b", "c", "d"];
      expect(ordenZ(ids, "c")).toEqual(["c", "a", "b", "d"]);
    });

    it("should return the same array if the focused orb is the first", () => {
      const ids = ["a", "b", "c"];
      expect(ordenZ(ids, "a")).toEqual(ids);
    });
  });
});