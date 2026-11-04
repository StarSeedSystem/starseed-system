"use client";

/**
 * ModelScoutNotifier — notificador de novedades del explorador de modelos (Adenda 138).
 * Escucha la firma del scout de modelos y avisa UNA vez cuando hay una firma nueva,
 * espejo del patrón de ModelDownloadNotifier. No monta en ninguna página en esta ola;
 * se integra más adelante en startup-updates-modal.tsx o neuron-models-panel.tsx.
 */
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