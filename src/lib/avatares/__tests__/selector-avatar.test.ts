import { describe, it, expect } from "vitest";
import { getFuenteAvatarParaRef } from "../../../components/avatares/selector-avatar-3d";

describe("getFuenteAvatarParaRef (función pura)", () => {
  it("devuelve el orbe gris para la referencia 'orbe-gris'", () => {
    const result = getFuenteAvatarParaRef("orbe-gris");
    expect(result).toEqual({ tipo: "procedural", svg: "orbe-gris" });
  });

  it("devuelve el orbe gris para cualquier otra referencia", () => {
    const testCases = [
      "vrm-persona",
      "biblioteca:avatares/plantillas/inicio-01.vrm",
      "genesis:algo",
      "referencia-desconocida",
      "",
    ];

    for (const ref of testCases) {
      expect(getFuenteAvatarParaRef(ref)).toEqual({
        tipo: "procedural",
        svg: "orbe-gris",
      });
    }
  });
});