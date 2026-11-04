import { describe, it, expect } from "vitest";
import { updatePersonalityProfileVoice } from "../persona-coherence-updater";
import type { PersonalityProfile } from "../personalities";

describe("updatePersonalityProfileVoice", () => {
  const baseProfile: PersonalityProfile = {
    id: "test-id",
    name: "Test",
    description: "",
    author: "Test",
    version: "1.0.0",
    createdAt: "2026-07-11T00:00:00.000Z",
    icon: "Sparkles",
    traits: {},
    prompts: { esencia: "", estilo: "", extra: "" },
    idioma: "es",
    idiomasSecundarios: [],
    generoVoz: "femenina",
    personaje: "Guía",
    cultura: "Universal",
    filosofia: "Equilibrio",
    responseStyle: { longitud: "equilibrada", formato: "adaptativo", recomendaciones: "proactivas" },
    tools: { enabledKinds: [], plugins: [], mcp: [], apis: [] },
    memoryPolicy: { usarMemorias: true, nivelContexto: "breve", cerebrosPermitidos: "todos" },
    voiceStyle: { tone: "cálido", emotion: "calma", rate: 1, pitch: 1, energy: 55 },
    intelligence: { modo: "auto", permitirPago: false },
    knowledge: [],
  };

  it("actualiza voiceStyle manteniendo valores existentes", () => {
    const updated = updatePersonalityProfileVoice(baseProfile, { tone: "vivaz", pitch: 1.2 });
    expect(updated.voiceStyle.tone).toBe("vivaz");
    expect(updated.voiceStyle.pitch).toBe(1.2);
    expect(updated.voiceStyle.emotion).toBe("calma"); // Mantiene
    expect(updated.voiceStyle.energy).toBe(55); // Mantiene
  });

  it("actualiza audioRef si se proporciona", () => {
    const newRef = { kind: "builtin" as const, voiceId: "kokoro-ef-dora" };
    const updated = updatePersonalityProfileVoice(baseProfile, {}, newRef);
    expect(updated.voiceStyle.audioRef).toEqual(newRef);
  });
});
