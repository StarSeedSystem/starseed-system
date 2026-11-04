/**
 * CTR1104X · La persona portable se ESCRIBE en el perfil de la personalidad
 * (Adenda 112): el carácter en `voiceStyle` y la voz de referencia en
 * `audioRef`, sin perder lo que el usuario ya fijó (motor, diseño OmniVoice,
 * carácter propio y, sobre todo, su voz grabada o importada).
 */
import { describe, expect, it } from "vitest";
import type { PortablePersona } from "@/lib/aurora/persona-coherence";
import type { PersonalityProfile } from "@/lib/aurora/personalities";
import { aplicarPersonaAlPerfil } from "@/lib/aurora/aplicar-persona-perfil";

function perfil(over: Partial<PersonalityProfile> = {}): PersonalityProfile {
  return {
    id: "p-aurora", name: "Aurora", description: "", author: "StarSeed",
    version: "1.0.0", createdAt: "2026-01-01T00:00:00.000Z", icon: "Sparkles",
    traits: { calidez: 80 },
    prompts: { esencia: "esencia", estilo: "estilo", extra: "" },
    idioma: "es", idiomasSecundarios: ["en"], generoVoz: "femenina",
    personaje: "Guía", cultura: "Universal", filosofia: "Equilibrio",
    responseStyle: { longitud: "equilibrada", formato: "adaptativo", recomendaciones: "proactivas" },
    tools: { enabledKinds: ["voice"], plugins: [], mcp: [], apis: [] },
    memoryPolicy: { usarMemorias: true, nivelContexto: "breve", cerebrosPermitidos: "todos" },
    voiceStyle: { tone: "cálido", emotion: "calma", rate: 1, pitch: 1, energy: 55 },
    intelligence: { modo: "auto", permitirPago: false },
    knowledge: [],
    ...over,
  };
}

const CALIDA: PortablePersona = {
  id: "calida", name: "Cálida", emotion: "dulce", tone: "cercana y afectuosa",
  energy: 58, rate: 0.98, pitch: 1.04, audioRefId: "kokoro-af-bella",
};

const voz = (audioRef?: PersonalityProfile["voiceStyle"]["audioRef"]): PersonalityProfile =>
  perfil({ voiceStyle: { tone: "cálido", emotion: "calma", rate: 1, pitch: 1, energy: 55, audioRef } });

describe("aplicarPersonaAlPerfil · la persona se escribe en el perfil", () => {
  it("escribe el carácter de la persona en voiceStyle", () => {
    const r = aplicarPersonaAlPerfil(perfil(), CALIDA);
    expect(r.voiceStyle.tone).toBe("cercana y afectuosa");
    expect(r.voiceStyle.emotion).toBe("dulce");
    expect(r.voiceStyle.rate).toBe(0.98);
    expect(r.voiceStyle.pitch).toBe(1.04);
    expect(r.voiceStyle.energy).toBe(58);
  });

  it("escribe la voz de referencia de la persona", () => {
    const r = aplicarPersonaAlPerfil(perfil(), CALIDA);
    expect(r.voiceStyle.audioRef).toEqual({ kind: "builtin", voiceId: "kokoro-af-bella", label: "Cálida" });
  });

  it("no pierde lo que el usuario ya fijó del perfil", () => {
    const p = perfil({
      prompts: { esencia: "mi esencia", estilo: "mi estilo", extra: "extra" },
      intelligence: { modo: "fija", global: { fuente: "openrouter-free" }, permitirPago: false },
    });
    const r = aplicarPersonaAlPerfil(p, CALIDA);
    expect(r.prompts).toBe(p.prompts);
    expect(r.intelligence).toBe(p.intelligence);
    expect(r.traits).toBe(p.traits);
    expect(r.id).toBe("p-aurora");
  });

  it("no pierde el motor, el diseño OmniVoice ni el carácter propio", () => {
    const p = perfil({
      voiceStyle: {
        tone: "cálido", emotion: "calma", rate: 1, pitch: 1, energy: 55,
        engine: "openvoice2", omni: { generation_mode: "voice_design" },
        voicePersona: { carácter: "joven y determinada", energía: "alegre", velocidadBase: 1, toneShift: 0.05 },
      },
    });
    const r = aplicarPersonaAlPerfil(p, CALIDA);
    expect(r.voiceStyle.engine).toBe("openvoice2");
    expect(r.voiceStyle.omni).toEqual({ generation_mode: "voice_design" });
    expect(r.voiceStyle.voicePersona?.carácter).toBe("joven y determinada");
  });

  it("la voz propia del usuario (grabada o importada) no se pisa con la del catálogo", () => {
    const grabada = { kind: "recorded" as const, dataUrl: "data:audio/webm;base64,AAA", at: 1234 };
    const importada = { kind: "library" as const, label: "mi voz.wav" };
    expect(aplicarPersonaAlPerfil(voz(grabada), CALIDA).voiceStyle.audioRef).toEqual(grabada);
    expect(aplicarPersonaAlPerfil(voz(importada), CALIDA).voiceStyle.audioRef).toEqual(importada);
  });

  it("sin referencia en la persona se conserva la que ya había", () => {
    const previa = { kind: "builtin" as const, voiceId: "kokoro-am-onyx", label: "Neutra" };
    const r = aplicarPersonaAlPerfil(voz(previa), { ...CALIDA, audioRefId: undefined });
    expect(r.voiceStyle.audioRef).toEqual(previa);
  });

  it("acota los valores fuera de rango y no rompe con valores que no son número", () => {
    const r = aplicarPersonaAlPerfil(perfil(), { ...CALIDA, rate: 3, pitch: 0.1, energy: 150 });
    expect([r.voiceStyle.rate, r.voiceStyle.pitch, r.voiceStyle.energy]).toEqual([2, 0.5, 100]);
    const s = aplicarPersonaAlPerfil(perfil(), { ...CALIDA, rate: Number.NaN, energy: Number.NaN });
    expect([s.voiceStyle.rate, s.voiceStyle.energy]).toEqual([1, 50]);
  });

  it("no muta el perfil de entrada", () => {
    const p = perfil();
    const r = aplicarPersonaAlPerfil(p, CALIDA);
    expect(r).not.toBe(p);
    expect(p.voiceStyle.tone).toBe("cálido");
    expect(p.voiceStyle.audioRef).toBeUndefined();
  });
});
