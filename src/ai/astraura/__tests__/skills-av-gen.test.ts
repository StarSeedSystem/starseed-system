import { describe, it, expect } from "vitest";
import { SKILL_CAPABILITIES } from "../skills";

describe("capacidad av-gen (Adenda 138 · generación audiovisual)", () => {
  it("existe en SKILL_CAPABILITIES con los campos requeridos", () => {
    const cap = SKILL_CAPABILITIES.find((c) => c.id === "av-gen");
    expect(cap).toBeDefined();
    expect(cap?.label).toBe("Generación audiovisual (imagen · vídeo · audio)");
    expect(cap?.defaultOn).toBe(true);
    expect(cap?.skillIds).toEqual(["aurora-av-gen"]);
    expect(cap?.packageIds).toContain("iatool-media-gen");
  });

  it("su systemPrompt no promete vídeo gratis y es honesto sobre audio", () => {
    const cap = SKILL_CAPABILITIES.find((c) => c.id === "av-gen");
    expect(cap).toBeDefined();
    const prompt = cap!.systemPrompt.toLowerCase();

    // No promete vídeo gratis
    expect(prompt).not.toContain("vídeo gratis");
    expect(prompt).not.toContain("video gratis");
    expect(prompt).not.toContain("generar vídeo sin");
    expect(prompt).not.toContain("generar video sin");

    // Audio: solo síntesis de voz del propio texto (TTS), no música
    expect(prompt).toContain("voz del propio texto");
    expect(prompt).toContain("no música");
  });

  it("menciona Pollinations como motor gratis por defecto para imagen", () => {
    const cap = SKILL_CAPABILITIES.find((c) => c.id === "av-gen");
    expect(cap).toBeDefined();
    const prompt = cap!.systemPrompt.toLowerCase();
    expect(prompt).toContain("pollinations");
    expect(prompt).toContain("gratis");
    expect(prompt).toContain("imagen");
  });

  it("explica que vídeo requiere servicio propio conectado", () => {
    const cap = SKILL_CAPABILITIES.find((c) => c.id === "av-gen");
    expect(cap).toBeDefined();
    const prompt = cap!.systemPrompt.toLowerCase();
    expect(prompt).toContain("vídeo");
    expect(prompt).toContain("servicio");
    expect(prompt).toContain("conectó");
  });
});