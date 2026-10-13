import { describe, it, expect } from "vitest";
import { PLANTILLAS_AVATAR, adnDePlantilla, plantillaPorId, refDePlantilla } from "../plantillas";
import { sanearAdn } from "../adn/adn";

const DUENO = { tipo: "perfil" as const, id: "u1" };

describe("plantillas de avatares 3D (AV1011L)", () => {
  it("el juego inicial respeta el presupuesto: ≤ 10 modelos y ≤ 30 MB", () => {
    expect(PLANTILLAS_AVATAR.length).toBeLessThanOrEqual(10);
    expect(PLANTILLAS_AVATAR.reduce((s, p) => s + p.bytesVrm, 0)).toBeLessThanOrEqual(30 * 1024 * 1024);
  });
  it("todas las referencias son internas «biblioteca:», nunca URLs externas", () => {
    for (const p of PLANTILLAS_AVATAR) expect(refDePlantilla(p.id)).toMatch(/^biblioteca:avatares\/plantillas\//);
  });
  it("adnDePlantilla produce ADN válido con base VRM y procedencia CC0", () => {
    for (const p of PLANTILLAS_AVATAR) {
      const adn = adnDePlantilla(p.id, DUENO, "adn-1");
      expect(adn).not.toBeNull();
      expect(sanearAdn(adn)).not.toBeNull();
      expect(adn!.base).toEqual({ tipo: "vrm", ref: refDePlantilla(p.id) });
      expect(adn!.esqueleto.tipo).toBe("vrm-humanoide");
      expect(adn!.procedencia[0]).toMatchObject({ licencia: "CC0-1.0", uso: "libre" });
      expect(adn!.procedencia[0].atribucion).toContain(p.autor);
      expect(adn!.aura.tono).toBe(p.tonoAura);
    }
  });
  it("un id desconocido no inventa plantilla", () => {
    expect(plantillaPorId("no-existo")).toBeNull();
    expect(adnDePlantilla("no-existo", DUENO, "adn-2")).toBeNull();
  });
});
