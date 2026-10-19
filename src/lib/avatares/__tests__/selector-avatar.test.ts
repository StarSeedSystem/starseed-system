import { describe, it, expect } from "vitest";
import { getViewerType } from "../visor";

describe("getViewerType", () => {
  it("devuelve 'AvatarVivoAdn' para referencias de biblioteca:", () => {
    expect(getViewerType("biblioteca:avatares/personas/vrm-persona")).toBe("AvatarVivoAdn");
    expect(getViewerType("biblioteca:avatares/plantillas/orbe-gris")).toBe("AvatarVivoAdn");
  });

  it("devuelve 'model-viewer' para URLs GLB reales", () => {
    expect(getViewerType("https://example.com/model.glb")).toBe("model-viewer");
    expect(getViewerType("https://example.com/model.gltf")).toBe("model-viewer");
  });

  it("devuelve null para otras referencias", () => {
    expect(getViewerType("orbe-gris")).toBeNull();
    expect(getViewerType("vrm-persona")).toBeNull();
    expect(getViewerType("")).toBeNull();
  });
});