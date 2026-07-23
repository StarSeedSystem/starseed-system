"use client";

/**
 * VoiceNeuronOnboardingLoader — Monta <VoiceNeuronOnboarding/> DIRECTAMENTE
 * dentro del grafo normal del cliente (NO via import() aislado en useEffect).
 *
 * Por qué (fix #310): el import() crudo en useEffect creaba un chunk aislado
 * con su PROPIA instancia de React, fuera del grafo estático del root layout.
 * En el build de Vercel (Linux) eso provocaba una colisión de module-id con
 * react-server-dom-client (chunk 1255): el `react` que resolvía el componente
 * aislado era el shim server → useState undefined → "Minified React error #310".
 *
 * Al importar el componente en el grafo principal del cliente, `react` resuelve
 * a la MISMA copia real que usan el resto de los componentes (que funcionan),
 * eliminando la colisión. Los módulos pesados de tts-oss ya se cargan de forma
 * perezosa (lazy/dynamic) dentro del propio componente, así que el top-level
 * solo trae imports livianos del grafo normal.
 */

import { VoiceNeuronOnboarding } from "@/components/aurora/voice-neuron-onboarding-v310";

export function VoiceNeuronOnboardingLoader() {
  return <VoiceNeuronOnboarding />;
}
