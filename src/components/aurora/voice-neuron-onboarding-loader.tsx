"use client";

/**
 * VoiceNeuronOnboardingLoader — Monta <VoiceNeuronOnboarding/> dentro del grafo
 * de cliente vía next/dynamic({ ssr:false }).
 *
 * Por qué (fix #310): el error "Minified React error #310" = useState ejecutado
 * con el dispatcher de react-server-dom-client (copia de servidor). Sucede cuando
 * un Client Component se renderiza DESDE un Server Component (p.ej. el root
 * layout.tsx) o se resuelve con el shim server de React. Montarlo aquí, dentro de
 * un Client Component (AuroraProvider), Y con ssr:false fuerza la carga 100%
 * cliente con la copia REAL de React — la misma que usan AuroraWidget/InstallModelModalHost.
 *
 * Además: el componente pesado se importa de forma estática dentro del grafo del
 * cliente (no en un import() aislado), así que `react` resuelve a la MISMA copia
 * que el resto de la app. Sin colisión de module-id.
 */

import dynamic from "next/dynamic";

const VoiceNeuronOnboarding = dynamic(
  () => import("@/components/aurora/voice-neuron-onboarding").then((m) => ({ default: m.VoiceNeuronOnboarding })),
  { ssr: false },
);

export function VoiceNeuronOnboardingLoader() {
  return <VoiceNeuronOnboarding />;
}
