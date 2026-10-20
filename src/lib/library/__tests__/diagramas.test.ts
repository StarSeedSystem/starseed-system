import { describe, it, expect } from "vitest";
import { STARSEED_LABS_REPO } from "@/lib/library/packages";

describe("Diagram Design package", () => {
  it("should be present in StarSeed Labs repo", () => {
    const packageId = "fn-diagram-design";
    const found = STARSEED_LABS_REPO.packages.some(
      (pkg) => pkg.id === packageId
    );
    expect(found).toBe(true);
  });

  it("should have correct properties", () => {
    const packageId = "fn-diagram-design";
    const pkg = STARSEED_LABS_REPO.packages.find(
      (p) => p.id === packageId
    );
    expect(pkg).toBeDefined();
    if (!pkg) return;
    expect(pkg.kind).toBe("function");
    expect(pkg.name).toBe("Diagram Design");
    expect(pkg.description).toBe(
      "45 tipos de diagrama en un HTML+SVG con tu marca; en chats, lienzo, pizarra, escritorio, 3D y XR"
    );
    expect(pkg.icon).toBe("Layout");
    expect(pkg.tags).toEqual([
      "diagramas",
      "svg",
      "arquitectura",
      "flujo",
      "3d",
    ]);
    expect(pkg.version).toBe("2.6.110");
    expect(pkg.author).toBe("cathrynlavery");
    expect(pkg.sourceRepoId).toBe("starseed-labs");
    expect(pkg.free).toBe(true);
    expect(pkg.featured).toBe(true);
    expect(pkg.payload).toMatchObject({
      skillId: "diagram-design",
    });
  });
});