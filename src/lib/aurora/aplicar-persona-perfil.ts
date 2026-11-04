/**
 * APLICAR LA PERSONA PORTÁTIL A UN PERFIL DE PERSONALIDAD (Adenda 112 · CTR1104X).
 * ============================================================================
 * El selector de personalidad ya sabe qué persona eligió: una `PortablePersona`
 * (emoción, tono, energía, ritmo, altura y una voz de referencia del catálogo).
 * Este módulo es la PUERTA PURA que la escribe en un `PersonalityProfile`: el
 * carácter en `voiceStyle` y la voz de referencia en `voiceStyle.audioRef`.
 *
 * PUREZA: sin red, sin disco, sin reloj y sin `node:*` — vale igual para el
 * cliente y para el servidor. No muta el perfil: devuelve uno nuevo.
 *
 * RESPETO (lo que el usuario ya fijó manda):
 *  · el carácter de la persona (tono, emoción, ritmo, altura, energía) cambia;
 *  · el motor elegido, el diseño OmniVoice y el carácter propio se conservan;
 *  · una voz propia del usuario (grabada o importada) NO se pisa con la voz del
 *    catálogo: la suya manda;
 *  · la referencia solo se cambia si la persona trae una (`audioRefId`).
 */

import type { PortablePersona } from "@/lib/aurora/persona-coherence";
import type { PersonalityProfile, VoiceAudioRef } from "@/lib/aurora/personalities";

/** Acota un número al rango del motor; si no es número, usa el valor por defecto. */
function acotar(n: number, lo: number, hi: number, defecto: number): number {
  if (!Number.isFinite(n)) return defecto;
  return Math.max(lo, Math.min(hi, n));
}

/** Elige la referencia de voz que queda: la del usuario manda sobre la del catálogo. */
function elegirReferencia(
  actual: VoiceAudioRef | undefined,
  persona: PortablePersona,
): VoiceAudioRef | undefined {
  if (actual && (actual.kind === "recorded" || actual.kind === "library")) return actual;
  const voiceId = persona.audioRefId?.trim();
  if (!voiceId) return actual;
  return { kind: "builtin", voiceId, label: persona.name };
}

/**
 * Devuelve el perfil con la persona escrita, sin perder lo que el usuario fijó.
 * Puro: no toca disco, red ni reloj, y no muta el perfil que recibe.
 */
export function aplicarPersonaAlPerfil(
  perfil: PersonalityProfile,
  persona: PortablePersona,
): PersonalityProfile {
  const referencia = elegirReferencia(perfil.voiceStyle?.audioRef, persona);
  const voz = {
    ...perfil.voiceStyle,
    tone: persona.tone,
    emotion: persona.emotion,
    rate: acotar(persona.rate, 0.5, 2, 1),
    pitch: acotar(persona.pitch, 0.5, 2, 1),
    energy: acotar(persona.energy, 0, 100, 50),
    ...(referencia ? { audioRef: referencia } : {}),
  };
  return { ...perfil, voiceStyle: voz };
}
