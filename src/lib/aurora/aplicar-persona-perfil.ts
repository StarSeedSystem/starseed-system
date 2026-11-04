import type { PersonalityProfile, PersonalityVoiceStyle, VoiceAudioRef } from "@/lib/aurora/personalities";
import type { PortablePersona } from "@/lib/aurora/persona-coherence";

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : lo));
}

export function aplicarPersonaPerfil(profile: PersonalityProfile, persona: PortablePersona): PersonalityProfile {
  const voiceStyleBase: PersonalityVoiceStyle = profile.voiceStyle ?? {
    tone: "cálido",
    emotion: "calma",
    rate: 1,
    pitch: 1,
    energy: 55,
  };

  const tone = persona.tone;
  const emotion = persona.emotion;
  const rate = clamp(persona.rate, 0.5, 2);
  const pitch = clamp(persona.pitch, 0.5, 2);
  const energy = Math.round(clamp(persona.energy, 0, 100));

  let audioRef: VoiceAudioRef | undefined = voiceStyleBase.audioRef;

  if (persona.audioRefId) {
    audioRef = {
      kind: "builtin",
      voiceId: persona.audioRefId,
      label: persona.name,
    };
  }

  const nextVoiceStyle: PersonalityVoiceStyle = {
    ...voiceStyleBase,
    tone,
    emotion,
    rate,
    pitch,
    energy,
    audioRef,
  };

  return {
    ...profile,
    voiceStyle: nextVoiceStyle,
  };
}
