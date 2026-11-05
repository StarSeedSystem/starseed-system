import { describe, it, expect } from "vitest";
import { addPlanBamaIfNeeded, newApp, type AppFile, type GenerateResult } from "@/lib/appgen/appgen";

describe("App Generator destino nativa-macos", () => {
  const baseResult: GenerateResult = {
    files: [
      { path: "index.html", content: "<html></html>", language: "html" },
      { path: "main.swift", content: "import SwiftUI", language: "swift" },
    ],
    notes: "App generada",
  };

  it("addPlanBamaIfNeeded con nativa-macos añade PLAN-BAMA.md", () => {
    const result = addPlanBamaIfNeeded(baseResult, "App de prueba", "nativa-macos");

    expect(result.files).toBeDefined();
    const planFile = result.files.find((f) => f.path === "PLAN-BAMA.md");
    expect(planFile).toBeDefined();
    expect(planFile?.language).toBe("markdown");
    expect(planFile?.content).toContain("Plan de app nativa macOS (BAMA)");
    expect(planFile?.content).toContain("Destino: nativa-macos");
    expect(planFile?.content).toContain("Xcode 6.2 o superior");
    expect(planFile?.content).toContain("macOS 26 o superior");
  });

  it("addPlanBamaIfNeeded sin destino no añade PLAN-BAMA.md", () => {
    const result = addPlanBamaIfNeeded(baseResult, "App web", undefined);

    const planFile = result.files.find((f) => f.path === "PLAN-BAMA.md");
    expect(planFile).toBeUndefined();
    expect(result.files).toEqual(baseResult.files);
  });

  it("addPlanBamaIfNeeded con destino web no añade PLAN-BAMA.md", () => {
    const result = addPlanBamaIfNeeded(baseResult, "App web", "web");

    const planFile = result.files.find((f) => f.path === "PLAN-BAMA.md");
    expect(planFile).toBeUndefined();
    expect(result.files).toEqual(baseResult.files);
  });

  it("addPlanBamaIfNeeded preserva archivos originales", () => {
    const result = addPlanBamaIfNeeded(baseResult, "App con archivos", "nativa-macos");

    expect(result.files.length).toBe(3);
    const htmlFile = result.files.find((f) => f.path === "index.html");
    const swiftFile = result.files.find((f) => f.path === "main.swift");
    expect(htmlFile).toBeDefined();
    expect(swiftFile).toBeDefined();
    expect(htmlFile?.content).toBe("<html></html>");
    expect(swiftFile?.content).toBe("import SwiftUI");
  });

  it("addPlanBamaIfNeeded incluye requisitosNativos en el plan", () => {
    const result = addPlanBamaIfNeeded(baseResult, "App requisitos", "nativa-macos");

    const planFile = result.files.find((f) => f.path === "PLAN-BAMA.md");
    expect(planFile).toBeDefined();
    expect(planFile?.content).toContain("SwiftUI: Sí");
    expect(planFile?.content).toContain("SwiftData: Sí");
  });

  it("addPlanBamaIfNeeded incluye notes en el plan", () => {
    const resultWithNotes: GenerateResult = {
      files: [{ path: "index.html", content: "<html></html>", language: "html" }],
      notes: "Notas de prueba",
    };

    const result = addPlanBamaIfNeeded(resultWithNotes, "Mi especificación", "nativa-macos");

    const planFile = result.files.find((f) => f.path === "PLAN-BAMA.md");
    expect(planFile).toBeDefined();
    expect(planFile?.content).toContain("Notas de prueba");
  });

  it("addPlanBamaIfNeeded no modifica el resultado original", () => {
    const originalFiles = [...baseResult.files];
    addPlanBamaIfNeeded(baseResult, "App", "nativa-macos");

    expect(baseResult.files).toEqual(originalFiles);
  });
});