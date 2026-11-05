"use client";

/**
 * ModelScoutNotifier — aviso de novedades del explorador de modelos (Adenda 138).
 * Espejo de `model-download-notifier.tsx`: vive en segundo plano y muestra un toast
 * con enlace a Neuronas. Avisa UNA sola vez por firma de hardware/catálogo
 * (`scoutSignature`), igual que la ventana de inicio con sus firmas de catálogo.
 * Se monta UNA vez en los globales de (app), junto a `ModelDownloadNotifier`.
 */

import { useEffect } from "react";
import { toast } from "sonner";
import { detectCapabilities, type NeuronCapabilities } from "@/lib/neurons/neurons";
import { ALL_LLM_SPECS, ALL_VOICE_SPECS } from "@/ai/astraura/model-requirements";
import {
  SCOUT_SIGNATURE_KEY,
  markScoutSeen,
  scoutModels,
  scoutSignature,
  type ScoutResult,
} from "@/ai/astraura/model-scout";
import { safeGet } from "@/lib/safe-storage";

/** Ruta de la pestaña Neuronas del Cerebro. */
export const NEURONAS_PATH = "/agent?tab=neuronas";

/** Decisión PURA: avisar solo con una firma válida y distinta de la última vista. */
export function debeAvisarScoutNovedades(firma: string, ultimaVista: string | null): boolean {
  return firma.length > 0 && firma !== ultimaVista;
}

/** Texto del aviso: usa el resumen del scout y cae a una frase fija si no lo hay. */
export function resumenAvisoScout(resultado: { summary?: string } | null): string {
  const resumen = resultado?.summary?.trim();
  return resumen || "Aurora revisó este dispositivo y encontró modelos que encajan mejor.";
}

export interface ModelScoutNotifierProps {
  /** Capacidades ya detectadas (inyectables en pruebas). Si faltan, se detectan aquí. */
  caps?: NeuronCapabilities;
  /** Longitud del catálogo a considerar; por defecto, LLM + voz. */
  catalogLen?: number;
  /** Navegación al enlace «Ver en Neuronas» (inyectable en pruebas). */
  onIrANeuronas?: () => void;
}

export function ModelScoutNotifier({ caps: capsProp, catalogLen, onIrANeuronas }: ModelScoutNotifierProps = {}) {
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const caps = capsProp ?? (await detectCapabilities());
        if (!vivo) return;
        const len = catalogLen ?? ALL_LLM_SPECS.length + ALL_VOICE_SPECS.length;
        const firma = scoutSignature(caps, len);
        if (!debeAvisarScoutNovedades(firma, safeGet(SCOUT_SIGNATURE_KEY))) return;
        markScoutSeen(firma);
        let resultado: ScoutResult | null = null;
        try {
          resultado = scoutModels(caps);
        } catch {
          /* el aviso no depende del cálculo */
        }
        toast.success("Hay modelos que encajan mejor con este equipo", {
          description: resumenAvisoScout(resultado),
          action: {
            label: "Ver en Neuronas",
            onClick: () => {
              if (onIrANeuronas) onIrANeuronas();
              else if (typeof window !== "undefined") window.location.assign(NEURONAS_PATH);
            },
          },
        });
      } catch {
        /* nunca rompe la pantalla */
      }
    })();
    return () => {
      vivo = false;
    };
  }, [capsProp, catalogLen, onIrANeuronas]);

  return null;
}

export default ModelScoutNotifier;
