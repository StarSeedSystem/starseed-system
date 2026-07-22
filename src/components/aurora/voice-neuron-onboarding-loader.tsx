"use client";

/**
 * VoiceNeuronOnboardingLoader — Monta <VoiceNeuronOnboarding/> via un
 * import() CRUDO dentro de useEffect (NO next/dynamic). Esto crea un chunk
 * NUEVO y AISLADO con su PROPIA instancia de React, FUERA del grafo
 * estático del root layout.
 *
 * Por qué (fix #310): el root layout es un Server Component cuyo
 * bundle cliente comparte el module-space con react-server-dom-client
 * (chunk 1255). En el build de Vercel (Linux) eso provocaba una
 * colisión de module-id: el `react` que resolvía VoiceNeuronOnboarding
 * era el shim server de react-server-dom-client → useState undefined →
 * "Minified React error #310". Al cargar el componente via import() crudo
 * en useEffect, su React vive en un chunk aparte y NO colisiona.
 *
 * Defensivo: si el import falla, simplemente no monta (no rompe el arranque).
 */

import { useEffect, useRef, useState } from "react";

export function VoiceNeuronOnboardingLoader() {
  const [Mod, setMod] = useState<{ VoiceNeuronOnboarding: React.ComponentType } | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let alive = true;
    import("@/components/aurora/voice-neuron-onboarding")
      .then((m) => { if (alive) setMod({ VoiceNeuronOnboarding: m.VoiceNeuronOnboarding }); })
      .catch(() => { /* silencioso: el onboarding de voz es opcional */ });
    return () => { alive = false; };
  }, []);

  if (!Mod) return null;
  const { VoiceNeuronOnboarding } = Mod;
  return <VoiceNeuronOnboarding />;
}
