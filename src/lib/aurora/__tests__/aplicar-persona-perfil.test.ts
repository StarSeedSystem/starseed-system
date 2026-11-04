import { describe, it, expect } from "vitest";
import { aplicarPersonaPerfil } from "../aplicar-persona-perfil";
import type { PersonalityProfile } from "../personalities";
import { PERSONA_REFERENCE_PRESETS } from "../persona-coherence";

const baseProfile = (): PersonalityProfile => ({
  id: "p1",
  name: "Test",
  description: "",
  author: "Test",
  version: "1.0.0",
  createdAt: "2026-01-01T00:00:00.000Z",
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
  voiceStyle: {
    tone: "cálido",
    emotion: "calma",
    rate: 1,
    pitch: 1,
    energy: 55,
    omni: { generation_mode: "voice_design" } as any,
    engine: "kokoro",
    voicePersona: { id: "custom" } as any,
    audioRef: { kind: "recorded", label: "Mi grabación" } as any,
  },
  intelligence: { modo: "auto", permitirPago: false },
  knowledge: [],
});

describe("aplicarPersonaPerfil", () => {
  it("aplica tono/emoción/rate/pitch/energy de la persona preservando campos del voiceStyle", () => {
    const persona = PERSONA_REFERENCE_PRESETS[0];
    const profile = baseProfile();
    const next = aplicarPersonaPerfil(profile, persona);

    expect(next.voiceStyle.tone).toBe(persona.tone);
    expect(next.voiceStyle.emotion).toBe(persona.emotion);
    expect(next.voiceStyle.rate).toBe(persona.rate);
    expect(next.voiceStyle.pitch).toBe(persona.pitch);
    expect(next.voiceStyle.energy).toBe(Math.round(persona.energy));

    expect(next.voiceStyle.omni).toBeDefined();
    expect(next.voiceStyle.engine).toBe("kokoro");
    expect(next.voiceStyle.voicePersona).toBeDefined();

    expect(next.id).toBe(profile.id);
    expect(next.name).toBe(profile.name);
  });

  it("establece audioRef builtin desde audioRefId de la persona", () => {
    const persona = PERSONA_REFERENCE_PRESETS.find(p => p.audioRefId) ?? PERSONA_REFERENCE_PRESETS[0];
    const profile = baseProfile();
    const next = aplicarPersonaPerfil(profile, persona);

    expect(next.voiceStyle.audioRef).toEqual({
      kind: "builtin",
      voiceId: persona.audioRefId,
      label: persona.name,
    });
  });

  it("no pierde audioRef existente si la persona no define audioRefId", () => {
    const persona = { id: "nada", name: "Nada", emotion: "serena", tone: "neutro", energy: 50, rate: 1, pitch: 1 };
    const profile = baseProfile();
    const existingRef = { kind: "library" as const, voiceId: "x", label: "Lib" };
    profile.voiceStyle.audioRef = existingRef;

    const next = aplicarPersonaPerfil(profile, persona as any);
    expect(next.voiceStyle.audioRef).toEqual(existingRef);
  });

  it("es pura: no muta el perfil original", () => {
    const persona = PERSONA_REFERENCE_PRESETS[1];
    const profile = baseProfile();
    const copy = JSON.parse(JSON.stringify(profile));
    aplicarPersonaPerfil(profile, persona);
    expect(profile).toEqual(copy);
  });
});
