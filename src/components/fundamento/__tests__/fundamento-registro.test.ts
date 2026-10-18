import { describe, it, expect } from "vitest";
import { APP_CATALOG, APP_COLLECTIONS } from "@/components/dashboard/apps/app-catalog";
import { STARSEED_CORE_REPO } from "@/lib/library/packages";

describe("Registro de Fundamento de StarSeed", () => {
  it("está en el catálogo con ruta /fundamento", () => {
    const app = APP_CATALOG.find(a => a.id === "fundamento");
    expect(app).toBeDefined();
    expect(app?.name).toBe("Fundamento de StarSeed");
    expect(app?.open?.primary).toBe("route");
    expect(app?.open?.route).toBe("/fundamento");
  });

  it("aparece en la colección starseed", () => {
    expect(APP_COLLECTIONS.starseed).toContain("fundamento");
  });

  it("existe en la Biblioteca como paquete app con ruta /fundamento", () => {
    const pkg = STARSEED_CORE_REPO.packages.find(p => p.kind === "app" && typeof p.payload.route === "string" && p.payload.route === "/fundamento");
    expect(pkg).toBeDefined();
    expect(pkg?.name).toBe("Fundamento de StarSeed");
    expect(pkg?.icon).toBe("Gem");
  });
});
