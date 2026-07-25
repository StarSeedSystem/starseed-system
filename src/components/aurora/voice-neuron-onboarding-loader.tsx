"use client";

/**
 * VoiceNeuronOnboardingLoader — Monta <VoiceNeuronOnboarding/>.
 *
 * (fix #310 / Adenda 96) Se usa React.lazy + Suspense para forzar un chunk
 * de cliente explícito que webpack resuelve y CARGA en el navegador, en vez
 * de depender del grafo estático de ProvidersTree (que en algunos builds de
 * Vercel tree-shakea el componente del grafo de hidratación del cliente,
 * dejándolo en el chunk pero sin ejecutarse → el modal nunca monta).
 */

import { lazy, Suspense } from "react";

const VoiceNeuronOnboarding = lazy(() =>
  import("@/components/aurora/voice-neuron-onboarding-v310").then((m) => ({
    default: m.VoiceNeuronOnboarding,
  })),
);

export function VoiceNeuronOnboardingLoader() {
  return (
    <Suspense fallback={null}>
      <VoiceNeuronOnboarding />
    </Suspense>
  );
}
