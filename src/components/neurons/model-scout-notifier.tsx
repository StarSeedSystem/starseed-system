"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { scoutSignature, hasNewScoutFindings, markScoutSeen } from "@/ai/astraura/model-scout";
import { ALL_LLM_SPECS, ALL_VOICE_SPECS } from "@/ai/astraura/model-requirements";
import { detectCapabilities } from "@/lib/neurons/neurons";

export function ModelScoutNotifier() {
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const caps = await detectCapabilities();
        if (!alive) return;
        const catalogLen = ALL_LLM_SPECS.length + ALL_VOICE_SPECS.length;
        const sig = scoutSignature(caps, catalogLen);
        if (hasNewScoutFindings(sig)) {
          markScoutSeen(sig);
          toast.info("Hay modelos que rinden mejor para tu equipo", {
            description: "Abre Astraura → Ajustes para ver las recomendaciones.",
          });
        }
      } catch {
        /* noop */
      }
    })();

    return () => { alive = false; };
  }, []);

  return null;
}

export default ModelScoutNotifier;