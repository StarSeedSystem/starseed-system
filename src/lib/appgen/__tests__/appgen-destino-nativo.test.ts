import { describe, it, expect } from "vitest";
import { requisitosNativos, planBama, newApp, type GeneratedApp, generateWithDestino } from "@/lib/appgen/appgen";

describe("App Generator BAMA Native macOS", () => {
  it("generateWithDestino crea app con destino nativa-macos", async () => {
    const result = await generateWithDestino("app de prueba", [], {}, "nativa-macos");
    expect(result.files).toBeDefined();
    expect(result.files.length).toBeGreaterThan(0);
    const planFile = result.files.find(f => f.path === "PLAN-BAMA.md");
    expect(planFile).toBeDefined();
    expect(planFile?.content).toContain("Plan de app nativa macOS (BAMA)");
  });

  it("requisitosNativos devuelve los requisitos correctos", () => {
    const req = requisitosNativos();
    expect(req).toEqual({
      xcode: true,
      swift: "6.2",
      swiftUI: true,
      swiftData: true,
      macOS: "26",
    });
  });

  it("planBama genera un plan válido", () => {
    const app: GeneratedApp = {
      id: "test",
      owner: null,
      name: "Mi App",
      files: [
        { path: "index.html", content: "<html></html>", language: "html" },
        { path: "main.swift", content: "import SwiftUI", language: "swift" },
      ],
      meta: {
        notes: "Prueba",
        plugins: ["supabase"],
        connections: [],
        requisitosNativos: requisitosNativos(),
      },
      shared: false,
    };

    const plan = planBama(app);
    expect(plan).toContain("Plan de app nativa macOS (BAMA) para Mi App");
    expect(plan).toContain("Xcode 6.2 o superior");
    expect(plan).toContain("2 archivos totales");
    expect(plan).toContain("1 archivos Swift");
    expect(plan).toContain("Prueba");
    expect(plan).toContain("supabase");
    expect(plan).toContain("Destino: nativa-macos");
  });

  it("newApp crea app con destino nativa-macos", () => {
    const app = newApp("App Nativa", null, "nativa-macos");
    expect(app.destino).toBe("nativa-macos");
    expect(app.meta.requisitosNativos).toEqual(requisitosNativos());
  });

  it("newApp crea app sin destino", () => {
    const app = newApp("App Web", null);
    expect(app.destino).toBeUndefined();
    expect(app.meta.requisitosNativos).toBeUndefined();
  });
});
