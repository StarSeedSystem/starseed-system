import type { PersonalityProfile, VoiceAudioRef } from "./personalities";
import type { PortablePersona } from "./persona-coherence";

export interface AplicarPersonaResult {
    perfil: PersonalityProfile;
    cambios: string[];
    preservado: string[];
}

interface VoiceStylePersona {
    tone: string;
    emotion: string;
    rate: number;
    pitch: number;
    energy: number;
    persona?: string;
}

const PERSONA_VOICE_FIELDS: (keyof VoiceStylePersona)[] = ["tone", "emotion", "rate", "pitch", "energy", "persona"];

export function aplicarPersonaAPerfil(
    perfil: PersonalityProfile,
    persona: PortablePersona,
    opts?: {
        preservarVoiceStyle?: boolean;
        preservarAudioRef?: boolean;
    },
): AplicarPersonaResult {
    const cambios: string[] = [];
    const preservado: string[] = [];

    const voiceStyleUpdate = personaToVoiceStyle(persona);
    const currentVoiceStyle = perfil.voiceStyle || {};

    const newVoiceStyle: PersonalityProfile["voiceStyle"] = { ...currentVoiceStyle };
    const fieldsPreserved: string[] = [];

    if (opts?.preservarVoiceStyle !== false) {
        for (const field of PERSONA_VOICE_FIELDS) {
            const personaVal = voiceStyleUpdate[field];
            const currentVal = currentVoiceStyle[field];
            if (personaVal !== undefined && currentVal === undefined) {
                (newVoiceStyle as Record<string, unknown>)[field] = personaVal;
            } else if (currentVal !== undefined) {
                fieldsPreserved.push(field);
            }
        }
        if (fieldsPreserved.length > 0) {
            preservado.push("voiceStyle");
        }
    } else {
        Object.assign(newVoiceStyle, voiceStyleUpdate);
    }

    let newAudioRef: VoiceAudioRef | undefined = undefined;

    if (opts?.preservarAudioRef !== false) {
        if (persona.audioRefId) {
            newAudioRef = {
                kind: "builtin",
                voiceId: persona.audioRefId,
                label: persona.name,
            };
        } else if (perfil.voiceStyle?.audioRef) {
            newAudioRef = perfil.voiceStyle.audioRef;
            preservado.push("audioRef");
        } else {
            preservado.push("audioRef (ausente)");
        }
    } else {
        if (persona.audioRefId) {
            newAudioRef = {
                kind: "builtin",
                voiceId: persona.audioRefId,
                label: persona.name,
            };
            cambios.push("audioRef");
        }
    }

    const newPerfil: PersonalityProfile = {
        ...perfil,
        voiceStyle: newVoiceStyle,
    };

    if (newAudioRef !== undefined) {
        newPerfil.voiceStyle = {
            ...newVoiceStyle,
            audioRef: newAudioRef,
        };
    }

    return {
        perfil: newPerfil,
        cambios,
        preservado,
    };
}

function personaToVoiceStyle(persona: PortablePersona): VoiceStylePersona {
    return {
        tone: persona.tone,
        emotion: persona.emotion,
        rate: clampRange(persona.rate, 0.5, 2, 1),
        pitch: clampRange(persona.pitch, 0.5, 2, 1),
        energy: Math.round(clampRange(persona.energy, 0, 100, 50)),
        persona: persona.name,
    };
}

function clampRange(value: number, min: number, max: number, defaultValue: number): number {
    if (!Number.isFinite(value)) return defaultValue;
    return Math.max(min, Math.min(max, value));
}