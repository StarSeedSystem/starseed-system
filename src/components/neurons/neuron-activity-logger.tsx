"use client";

/**
 * NeuronActivityLogger — alimenta la bitácora de ESTA neurona con eventos REALES
 * (Adenda 115): neuronas cercanas (radar), contenido recibido por la red y
 * descargas de modelos completadas. Se monta una vez en app-providers. Registra
 * de forma discreta (throttle del radar). SSR-safe. No renderiza nada.
 */

import { useEffect, useRef } from "react";
import { thisDeviceId } from "@/lib/neurons/neurons";
import { logNeuron } from "@/lib/neurons/neuron-logs";
import { MESH_NEARBY_EVENT } from "@/ai/astraura/mesh/synaptic";
import { MODEL_DOWNLOAD_DONE_EVENT } from "@/ai/astraura/model-downloads";

export function NeuronActivityLogger() {
  const lastNearby = useRef<number>(-1);

  useEffect(() => {
    const did = thisDeviceId();
    if (!did) return;

    const onNearby = (ev: Event) => {
      const count = Number((ev as CustomEvent).detail?.count ?? 0);
      if (count !== lastNearby.current) {
        lastNearby.current = count;
        logNeuron(did, "net", `${count} neurona${count === 1 ? "" : "s"} cercana${count === 1 ? "" : "s"} en el radar`);
      }
    };
    const onInbound = (ev: Event) => {
      const type = String((ev as CustomEvent).detail?.type ?? "contenido");
      logNeuron(did, "net", `Recibido de la red: ${type}`);
    };
    const onDownload = (ev: Event) => {
      const d = (ev as CustomEvent).detail as { label?: string; ok?: boolean } | undefined;
      if (!d) return;
      logNeuron(did, d.ok ? "info" : "error", d.ok ? `Modelo descargado: ${d.label ?? "modelo"}` : `Fallo al descargar ${d.label ?? "modelo"}`);
    };

    window.addEventListener(MESH_NEARBY_EVENT, onNearby);
    window.addEventListener("starseed:mesh-inbound", onInbound);
    window.addEventListener(MODEL_DOWNLOAD_DONE_EVENT, onDownload);
    return () => {
      window.removeEventListener(MESH_NEARBY_EVENT, onNearby);
      window.removeEventListener("starseed:mesh-inbound", onInbound);
      window.removeEventListener(MODEL_DOWNLOAD_DONE_EVENT, onDownload);
    };
  }, []);

  return null;
}

export default NeuronActivityLogger;
