"use client";

import type { PersonalityProfile, PersonalityVoiceStyle, VoiceAudioRef, VoiceGender } from "./personalities";
import type { PortablePersona } from "./persona-coherence";

/**
 * Aplica una persona portable a un PersonalityProfile, actualizando voiceStyle y audioRef
 * sin perder los campos que el usuario ya haya personalizado (omni, voicePersona, engine).
 * Función pura: sin efectos, sin window, sin localStorage.
 */
export function aplicarPersonaAProfile(
  profile: PersonalityProfile,
  persona: PortablePersona
): PersonalityProfile {
  const voiceStyle = { ...profile.voiceStyle } as PersonalityVoiceStyle;

  voiceStyle.tone = persona.tone;
  voiceStyle.emotion = persona.emotion;
  voiceStyle.rate = persona.rate;
  voiceStyle.pitch = persona.pitch;
  voiceStyle.energy = persona.energy;

  if (persona.audioRefId) {
    voiceStyle.audioRef = {
      kind: "builtin",
      voiceId: persona.audioRefId,
      label: persona.name,
      at: Date.now(),
    };
  }

  return {
    ...profile,
    voiceStyle,
  };
}