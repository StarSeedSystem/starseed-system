"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { scoutSignature, hasNewScoutFindings, markScoutSeen } from "@/ai/astraura/model-scout";
import { ALL_LLM_SPECS, ALL_VOICE_SPECS } from "@/ai/astraura/model-requirements";
import { detectCapabilities, type NeuronCapabilities } from "@/lib/neurons/neurons";

const SCOUT_EVENT = "starseed:scout-findings";

export function ModelScoutNotifier() {
  useEffect(() => {
    const handler = (caps: NeuronCapabilities) => {
      const catalogLen = ALL_LLM_SPECS.length + ALL_VOICE_SPECS.length;
      const sig = scoutSignature(caps, catalogLen);
      if (hasNewScoutFindings(sig)) {
        markScoutSeen(sig);
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent(SCOUT_EVENT, { detail: { sig, catalogLen } }));
        }
      }
    };

    let alive = true;
    (async () => {
      try {
        const caps = await detectCapabilities();
        if (alive) handler(caps);
      } catch {
        /* noop */
      }
    })();

    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const handler = (ev: Event) => {
      const d = (ev as CustomEvent).detail as { sig?: string; catalogLen?: number } | undefined;
      if (!d?.catalogLen) return;
      toast.info("Hay modelos que rinden mejor para tu equipo", {
        description: "Abre Astraura → Ajustes para ver las recomendaciones.",
      });
    };
    window.addEventListener(SCOUT_EVENT, handler);
    return () => window.removeEventListener(SCOUT_EVENT, handler);
  }, []);

  return null;
}

export default ModelScoutNotifier;