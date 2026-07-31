"use client";

/**
 * ModelDownloadNotifier — aviso global al completar una descarga (Adenda 113).
 * Escucha el evento de fin de descarga en segundo plano y muestra un toast, esté
 * el usuario donde esté en el OS. Montado una sola vez en app-providers.
 */

import { useEffect } from "react";
import { toast } from "sonner";
import { MODEL_DOWNLOAD_DONE_EVENT } from "@/ai/astraura/model-downloads";

export function ModelDownloadNotifier() {
  useEffect(() => {
    const h = (ev: Event) => {
      const d = (ev as CustomEvent).detail as { label?: string; ok?: boolean; error?: string } | undefined;
      if (!d) return;
      if (d.ok) {
        toast.success(`Modelo listo: ${d.label ?? "modelo"}`, {
          description: "Descarga completada. Ya puedes usarlo y adaptarlo a las personalidades de esta neurona.",
        });
      } else {
        toast.error(`No se pudo descargar ${d.label ?? "el modelo"}`, {
          description: d.error ? d.error.slice(0, 120) : undefined,
        });
      }
    };
    window.addEventListener(MODEL_DOWNLOAD_DONE_EVENT, h);
    return () => window.removeEventListener(MODEL_DOWNLOAD_DONE_EVENT, h);
  }, []);
  return null;
}

export default ModelDownloadNotifier;
