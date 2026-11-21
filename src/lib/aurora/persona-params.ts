/**
 * StarSeed OS — Ajustes de parámetros de la orbe por personalidad (compartido).
 * ----------------------------------------------------------------------------
 * Módulo PURO (sin "use client", sin DOM) para que tanto el frontend
 * (quantum-orb-avatar.tsx) como el backend (route.ts) puedan usarlo.
 * Valores en 0..1, derivados de la identidad visual de cada personalidad.
 */
import type { QuantumOrbParams } from "./quantum-orb-theme";

export const PERSONA_PARAM_ADJUSTMENTS: Record<string, Partial<QuantumOrbParams>> = {
  hephaestus: { turbulence: 0.6, spikiness: 0.7, symmetry: 0.3, hueShift: 0.1, breath: 0.4 },
  hermione: { turbulence: 0.2, spikiness: 0.3, symmetry: 0.9, hueShift: 0.4, breath: 0.3 },
  atenea: { turbulence: 0.3, spikiness: 0.4, symmetry: 0.8, hueShift: 0.3, breath: 0.5 },
  oneiros: { turbulence: 0.7, spikiness: 0.2, symmetry: 0.4, hueShift: 0.6, breath: 0.7 },
  hermes: { turbulence: 0.4, spikiness: 0.5, symmetry: 0.5, hueShift: 0.2, breath: 0.6 },
  logos: { turbulence: 0.1, spikiness: 0.2, symmetry: 0.95, hueShift: 0.0, breath: 0.3 },
  mnemosyne: { turbulence: 0.3, spikiness: 0.2, symmetry: 0.6, hueShift: 0.5, breath: 0.5 },
  kallisti: { turbulence: 0.5, spikiness: 0.6, symmetry: 0.4, hueShift: 0.8, breath: 0.6 },
  astraura_prime: { turbulence: 0.2, spikiness: 0.3, symmetry: 0.85, hueShift: 0.1, breath: 0.4 },
  aurora: { turbulence: 0.35, spikiness: 0.4, symmetry: 0.6, hueShift: 0.5, breath: 0.5 },
};

export const FALLBACK_PERSONA = "aurora";

export function getPersonaParams(personaId: string): Partial<QuantumOrbParams> {
  const key = personaId.toLowerCase().trim();
  return PERSONA_PARAM_ADJUSTMENTS[key] ?? PERSONA_PARAM_ADJUSTMENTS[FALLBACK_PERSONA];
}