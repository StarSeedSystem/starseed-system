import { describe, expect, it } from "vitest";
import {
  CUERPO_MAUSBOT_POR_DEFECTO,
  CUERPOS_MAUSBOT,
  IDS_CUERPO_MAUSBOT,
  cuerpoMausbot,
} from "@/lib/mausbot/cuerpos";

describe("cuerpos del Mausbot", () => {
  it("trae los diez cuerpos con ids únicos", () => {
    const ids = Object.keys(CUERPOS_MAUSBOT);
    expect(ids).toHaveLength(10);
    expect(new Set(ids).size).toBe(10);
    expect(ids).toEqual([...IDS_CUERPO_MAUSBOT]);
  });

  it("cada cuerpo lleva el marcador de degradado en su SVG", () => {
    for (const id of IDS_CUERPO_MAUSBOT) {
      const cuerpo = CUERPOS_MAUSBOT[id];
      expect(cuerpo.id).toBe(id);
      expect(cuerpo.nombre.length).toBeGreaterThan(0);
      expect(cuerpo.body).toContain("{{GRADIENT}}");
      expect(cuerpo.clip.length).toBeGreaterThan(0);
      expect(cuerpo.fit.length).toBeGreaterThan(0);
      expect(cuerpo.anchor.scale).toBeGreaterThan(0);
    }
  });

  it("un valor desconocido cae al cuerpo cursor", () => {
    expect(cuerpoMausbot("x")).toBe("cursor");
    expect(cuerpoMausbot("cursor")).toBe("cursor");
    expect(cuerpoMausbot(undefined)).toBe("cursor");
    expect(cuerpoMausbot(null)).toBe("cursor");
    expect(cuerpoMausbot(42)).toBe("cursor");
    expect(cuerpoMausbot({ id: "star" })).toBe("cursor");
    expect(cuerpoMausbot(true)).toBe("cursor");
    expect(cuerpoMausbot({})).toBe("cursor");
    expect(cuerpoMausbot([])).toBe("cursor");
    expect(CUERPO_MAUSBOT_POR_DEFECTO).toBe("cursor");
  });

  it("acepta cualquier id conocido tal cual", () => {
    for (const id of IDS_CUERPO_MAUSBOT) {
      expect(cuerpoMausbot(id)).toBe(id);
    }
  });
});
