import { describe, it, expect } from "vitest";

function getViewerType(ref: string): "AvatarVivoAdn" | "model-viewer" | null {
  if (ref.startsWith("biblioteca:avatares/")) {
    return "AvatarVivoAdn";
  }
  if (ref.endsWith(".glb") || ref.endsWith(".gltf")) {
    return "model-viewer";
  }
  return null;
}

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