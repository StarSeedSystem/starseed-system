"use client";

/**
 * VoiceNeuronOnboardingMount — Monta <VoiceNeuronOnboarding/> en su PROPIO
 * chunk de cliente (vía import() dinámico con ssr:false), AISLADO del grafo
 * estático del root layout.
 *
 * Por qué: el root layout es un Server Component cuyo bundle cliente comparte
 * el module-space con react-server-dom-client (chunk 1255). En el build de
 * Vercel (Linux) esto provocaba una colisión de module-id: el `react` que
 * resolvía VoiceNeuronOnboarding era el shim server de react-server-dom-client
 * → "Minified React error #310 / Invalid hook call". Al cargar el componente
 * en un chunk dinámico separado (ssr:false), su `react` se resuelve en el
 * bundle cliente normal y se rompe la colisión. Es defensivo: si el import
 * falla, simplemente no monta (no rompe el arranque del OS).
 */

import dynamic from "next/dynamic";

const VoiceNeuronOnboarding = dynamic(
  () => import("./voice-neuron-onboarding").then((m) => m.VoiceNeuronOnboarding),
  { ssr: false, loading: () => null },
);

export function VoiceNeuronOnboardingMount() {
  return <VoiceNeuronOnboarding />;
}
