"use client";

/**
 * VoiceNeuronOnboardingLoader — Monta <VoiceNeuronOnboarding/> con un import
 * ESTÁTICO dentro del grafo de cliente.
 *
 * Por qué (fix #310 + fix apertura):
 *  - El root layout.tsx es Server Component: montar aquí el Client Component
 *    hacia que useState resuelva con react-server-dom-client -> #310. Por eso
 *    este loader se monta DENTRO de AuroraProvider (Client Component).
 *  - Probar con next/dynamic({ ssr:false }) hacía que el setState(open) no
 *    provocara re-render del portal (instancia stale del estado dentro del
 *    boundary de carga del chunk). Con import estático el componente es la
 *    MISMA instancia que usa React de cliente real, y setOpen(true) abre el
 *    modal de inmediato.
 */

import { VoiceNeuronOnboarding } from "@/components/aurora/voice-neuron-onboarding";

export function VoiceNeuronOnboardingLoader() {
  return <VoiceNeuronOnboarding />;
}
