/**
 * senales-enlace-wifi — el Radar y Señales dicen el enlace Wi-Fi directo con una neurona (2026-11-08 · WFD1108A).
 * ============================================================================
 * PURO. Contrato: `architecture/wifi-directo.md` §6. A la señal de una neurona con la que hay un enlace
 * Wi-Fi directo activo (la de la cuenta, `neuron:<id>`, o la del faro de la red local, `lan:<ip>`) se le
 * añade la métrica «Enlace Wi-Fi directo» con su velocidad (o «sin medir») y, en la colocación, que la
 * conexión va de antena a antena, sin router. Nunca inventa nada: sin enlace activo, la señal sale
 * INTACTA (misma referencia).
 */

import { textoEnlaceWifi, textoMetodo, type EnlaceWifiActivo } from "@/lib/malla/enlace-wifi-orquestacion";
import type { DetectedSignal, SignalMetric } from "./signals";

export const DETALLE_WIFI_DIRECTO = "enlace Wi-Fi directo entre las dos antenas (sin router)";

function metricas(e: EnlaceWifiActivo): SignalMetric[] {
  const out: SignalMetric[] = [{ label: "Enlace Wi-Fi directo", value: textoEnlaceWifi(e).replace("Enlace Wi-Fi directo: ", "") + " · sin router" }];
  out.push({ label: "Red directa", value: `${e.ssid ?? "sin nombre"} · ${textoMetodo(e.metodo)}${e.soyAp ? " (la levanta esta neurona)" : ""}` });
  if (e.ipOtro) out.push({ label: "Dirección en la red directa", value: e.ipOtro });
  return out;
}

function sustituir(actuales: SignalMetric[], nuevas: SignalMetric[]): SignalMetric[] {
  const etiquetas = new Set(nuevas.map((m) => m.label));
  return [...(actuales ?? []).filter((m) => !etiquetas.has(m.label)), ...nuevas];
}

/** Añade el enlace Wi-Fi directo activo a la señal de esa neurona (por id de neurona o por su IP). */
export function enriquecerConEnlaceWifi(senales: DetectedSignal[], activos: readonly EnlaceWifiActivo[]): DetectedSignal[] {
  if (!activos.length) return senales;
  return (senales ?? []).map((s) => {
    const id = s.starseed?.neuronId ?? (s.id.startsWith("neuron:") ? s.id.slice("neuron:".length) : null);
    const ip = s.id.startsWith("lan:") ? s.id.slice("lan:".length) : null;
    const e = activos.find((a) => (id && a.neurona === id) || (ip && a.ipOtro === ip));
    if (!e) return s;
    const detalle = s.placement?.detail ?? "";
    return {
      ...s,
      metrics: sustituir(s.metrics, metricas(e)),
      starseed: s.starseed ? { ...s.starseed, online: true } : s.starseed,
      placement: detalle.includes(DETALLE_WIFI_DIRECTO) ? s.placement : { ...s.placement, detail: detalle ? `${detalle} · ${DETALLE_WIFI_DIRECTO}` : DETALLE_WIFI_DIRECTO },
    };
  });
}
