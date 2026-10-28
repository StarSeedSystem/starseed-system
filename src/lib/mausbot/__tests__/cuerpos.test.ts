import { describe, it, expect } from "vitest";
import {
  CUERPOS_MAUSBOT,
  CUERPOS_MAUSBOT_IDS,
  CUERPO_POR_DEFECTO,
  cuerpoMausbot,
} from "../cuerpos";

describe("CUERPOS_MAUSBOT", () => {
  it("tiene los 10 cuerpos de fábrica con ids únicos", () => {
    const ids = Object.keys(CUERPOS_MAUSBOT);
    expect(ids).toHaveLength(10);
    expect(new Set(ids).size).toBe(10);
    expect(ids).toEqual([...CUERPOS_MAUSBOT_IDS]);
  });

  it("cada body lleva la marca {{GRADIENT}} y su id coincide con la clave", () => {
    for (const id of CUERPOS_MAUSBOT_IDS) {
      const cuerpo = CUERPOS_MAUSBOT[id];
      expect(cuerpo.id).toBe(id);
      expect(cuerpo.body).toContain("{{GRADIENT}}");
      expect(cuerpo.clip).not.toBe("");
      expect(cuerpo.nombre).not.toBe("");
      expect(cuerpo.anchor.scale).toBeGreaterThan(0);
    }
  });
});

describe("cuerpoMausbot", () => {
  it("devuelve «cursor» para un valor desconocido", () => {
    expect(cuerpoMausbot('x')).toBe("cursor");
  });

  it("acepta cada id válido tal cual", () => {
    for (const id of CUERPOS_MAUSBOT_IDS) {
      expect(cuerpoMausbot(id)).toBe(id);
    }
  });

  it("devuelve el cuerpo por defecto para valores que no son cadena", () => {
    for (const valor of [null, undefined, 7, true, {}, []]) {
      expect(cuerpoMausbot(valor)).toBe(CUERPO_POR_DEFECTO);
    }
  });
});
