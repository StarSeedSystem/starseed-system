import { describe, it, expect } from "vitest";
import { CATALOGO_PROTOMOLECULA } from "@/lib/protomolecula/catalogo-herramientas";

describe("Catálogo mallas cerradas", () => {
  it("incluye PixelArtistry Watertight Meshes con datos exactos", () => {
    const entry = CATALOGO_PROTOMOLECULA.find(h => h.id === "pixelartistry-watertight");
    expect(entry).toBeDefined();
    expect(entry?.nombre).toBe("PixelArtistry Watertight Meshes");
    expect(entry?.categoria).toBe("modelado-3d");
    expect(entry?.licencia).toBe("MIT");
    expect(entry?.medios.windows).toBe(true);
    expect(entry?.medios.macos).toBe(false);
    expect(entry?.estado).toBe("proximamente");
    expect(entry?.motivo).toContain("Windows 10/11 con NVIDIA RTX 20+");
    expect(entry?.motivo).toContain("6 GB→1024");
    expect(entry?.motivo).toContain("8 GB→1536");
    expect(entry?.motivo).toContain("16 GB→2048");
    expect(entry?.motivo).toContain("Proyecto muy nuevo");
  });
});
