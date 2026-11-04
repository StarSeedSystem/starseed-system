import { describe, it, expect } from "vitest";
import { PERSONA_REFERENCE_PRESETS, type PortablePersona } from "../persona-coherence";
import { PERSONALITY_PRESETS, type PersonalityProfile } from "../personalities";
import { aplicarPersonaAProfile } from "../aplicar-persona-perfil";

describe("aplicarPersonaAProfile", () => {
  const baseProfile = PERSONALITY_PRESETS[0];
  const personaCalida = PERSONA_REFERENCE_PRESETS.find((p) => p.id === "calida")!;

  it("actualiza tone, emotion, rate, pitch, energy desde la persona", () => {
    const result = aplicarPersonaAProfile(baseProfile, personaCalida);

    expect(result.voiceStyle.tone).toBe(personaCalida.tone);
    expect(result.voiceStyle.emotion).toBe(personaCalida.emotion);
    expect(result.voiceStyle.rate).toBe(personaCalida.rate);
    expect(result.voiceStyle.pitch).toBe(personaCalida.pitch);
    expect(result.voiceStyle.energy).toBe(personaCalida.energy);
  });

  it("escribe audioRef con kind=builtin y voiceId de la persona", () => {
    const result = aplicarPersonaAProfile(baseProfile, personaCalida);

    expect(result.voiceStyle.audioRef).toBeDefined();
    expect(result.voiceStyle.audioRef?.kind).toBe("builtin");
    expect(result.voiceStyle.audioRef?.voiceId).toBe(personaCalida.audioRefId);
    expect(result.voiceStyle.audioRef?.label).toBe(personaCalida.name);
    expect(typeof result.voiceStyle.audioRef?.at).toBe("number");
  });

  it("preserva omni, voicePersona y engine del perfil original", () => {
    const result = aplicarPersonaAProfile(baseProfile, personaCalida);

    expect(result.voiceStyle.omni).toEqual(baseProfile.voiceStyle.omni);
    expect(result.voiceStyle.voicePersona).toEqual(baseProfile.voiceStyle.voicePersona);
    expect(result.voiceStyle.engine).toEqual(baseProfile.voiceStyle.engine);
  });

  it("no muta el perfil original", () => {
    const originalTone = baseProfile.voiceStyle.tone;
    const originalEmotion = baseProfile.voiceStyle.emotion;

    aplicarPersonaAProfile(baseProfile, personaCalida);

    expect(baseProfile.voiceStyle.tone).toBe(originalTone);
    expect(baseProfile.voiceStyle.emotion).toBe(originalEmotion);
  });

  it("si la persona no tiene audioRefId, no toca audioRef existente", () => {
    const personaSinRef: PortablePersona = {
      ...personaCalida,
      audioRefId: undefined,
    };
    const profileConRef: PersonalityProfile = {
      ...baseProfile,
      voiceStyle: {
        ...baseProfile.voiceStyle,
        audioRef: { kind: "library", voiceId: "mi-voz", label: "Mi voz", at: 123 },
      },
    };

    const result = aplicarPersonaAProfile(profileConRef, personaSinRef);

    expect(result.voiceStyle.audioRef).toEqual(profileConRef.voiceStyle.audioRef);
  });

  it("sobrescribe audioRef si la persona tiene audioRefId", () => {
    const profileConRef: PersonalityProfile = {
      ...baseProfile,
      voiceStyle: {
        ...baseProfile.voiceStyle,
        audioRef: { kind: "library", voiceId: "mi-voz", label: "Mi voz", at: 123 },
      },
    };

    const result = aplicarPersonaAProfile(profileConRef, personaCalida);

    expect(result.voiceStyle.audioRef?.kind).toBe("builtin");
    expect(result.voiceStyle.audioRef?.voiceId).toBe(personaCalida.audioRefId);
    expect(result.voiceStyle.audioRef?.label).toBe(personaCalida.name);
  });

  it("devuelve nueva instancia de perfil (inmutabilidad)", () => {
    const result = aplicarPersonaAProfile(baseProfile, personaCalida);

    expect(result).not.toBe(baseProfile);
    expect(result.voiceStyle).not.toBe(baseProfile.voiceStyle);
  });
});