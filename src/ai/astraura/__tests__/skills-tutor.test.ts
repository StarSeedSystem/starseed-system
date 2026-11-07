import { describe, it, expect } from "vitest";
import { SKILL_CAPABILITIES } from "../skills";
import { esPeticionDeAprender } from "@/lib/education/tutor";

describe("capacidad tutor (Ola 1104R · DeepTutor nativo)", () => {
  it("existe en SKILL_CAPABILITIES con los campos requeridos", () => {
    const cap = SKILL_CAPABILITIES.find((c) => c.id === "tutor");
    expect(cap).toBeDefined();
    expect(cap?.label).toBe("Tutor");
    expect(cap?.defaultOn).toBe(true);
    expect(cap?.routing).toEqual({ preferStrong: true });
    expect(cap?.skillIds).toEqual(["aurora-tutor"]);
    expect(cap?.packageIds).toContain("iatool-deeptutor");
  });

  it("su systemPrompt describe el método DeepTutor: explicar → comprobar → practicar → resumir", () => {
    const cap = SKILL_CAPABILITIES.find((c) => c.id === "tutor");
    expect(cap).toBeDefined();
    const prompt = cap!.systemPrompt.toLowerCase();
    expect(prompt).toContain("explicar");
    expect(prompt).toContain("comprobar");
    expect(prompt).toContain("practicar");
    expect(prompt).toContain("resumir");
    expect(prompt).toContain("deeptutor");
    expect(prompt).toContain("recuerdos");
    expect(prompt).toContain("interfaz viva");
  });

  it("esPeticionDeAprender detecta «explícame la fotosíntesis» como petición de aprender", () => {
    expect(esPeticionDeAprender("explícame la fotosíntesis")).toBe(true);
  });

  it("esPeticionDeAprender detecta variaciones en español e inglés", () => {
    expect(esPeticionDeAprender("quiero aprender typescript")).toBe(true);
    expect(esPeticionDeAprender("enséñame cómo funciona react")).toBe(true);
    expect(esPeticionDeAprender("help me understand quantum physics")).toBe(true);
    expect(esPeticionDeAprender("teach me about photosynthesis")).toBe(true);
    expect(esPeticionDeAprender("no entiendo cómo funciona")).toBe(true);
    expect(esPeticionDeAprender("hazme un cuestionario sobre historia")).toBe(true);
  });

  it("esPeticionDeAprender no detecta charla casual como petición de aprender", () => {
    expect(esPeticionDeAprender("hola, ¿qué tal?")).toBe(false);
    expect(esPeticionDeAprender("gracias")).toBe(false);
    expect(esPeticionDeAprender("vale")).toBe(false);
  });
});