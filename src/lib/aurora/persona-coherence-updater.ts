import type { PersonalityProfile, PersonalityVoiceStyle, VoiceAudioRef } from "@/lib/aurora/personalities";

/**
 * Actualiza el perfil de personalidad con nuevos datos de voz, manteniendo
 * lo que ya existía (ej. los ajustes de motor que el usuario ya fijó).
 */
export function updatePersonalityProfileVoice(
  profile: PersonalityProfile,
  voiceStyle: Partial<PersonalityVoiceStyle>,
  audioRef?: VoiceAudioRef
): PersonalityProfile {
  return {
    ...profile,
    voiceStyle: {
      ...profile.voiceStyle,
      ...voiceStyle,
      ...(audioRef ? { audioRef } : {}),
    },
  };
}
