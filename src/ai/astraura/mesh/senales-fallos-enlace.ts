/**
 * senales-fallos-enlace — Señales dice que un carril directo falló con una neurona y por cuál sigue (2026-11-09 · MTZ1109A).
 * ============================================================================
 * PURO. Contrato: `architecture/matriz-enlaces-directos.md` §5. A la señal de la neurona con la que un carril anunciado por
 * las dos puntas no abrió se le añade la métrica «Carril directo» y, en la colocación, la frase «Wi‑Fi Direct con
 * <neurona>: falló (motivo) · sigue por Bluetooth». Sin fallos vigentes, la señal sale INTACTA (misma referencia).
 */

import type { DetectedSignal, SignalMetric } from "./signals";

export interface FraseFalloEnlace {
  otra: string;
  texto: string;
}

export function enriquecerConFallosEnlace(senales: DetectedSignal[], frases: readonly FraseFalloEnlace[]): DetectedSignal[] {
  if (!frases.length) return senales;
  return (senales ?? []).map((s) => {
    const id = s.starseed?.neuronId ?? (s.id.startsWith("neuron:") ? s.id.slice("neuron:".length) : null);
    if (!id) return s;
    const mias = frases.filter((f) => f.otra === id);
    if (!mias.length) return s;
    const detalle = s.placement?.detail ?? "";
    const nuevas: SignalMetric[] = mias.map((f) => ({ label: "Carril directo", value: f.texto }));
    const etiquetas = new Set(nuevas.map((m) => m.label));
    const textos = mias.map((f) => f.texto).filter((t) => !detalle.includes(t));
    return {
      ...s,
      metrics: [...(s.metrics ?? []).filter((m) => !etiquetas.has(m.label)), ...nuevas],
      placement: textos.length ? { ...s.placement, detail: detalle ? `${detalle} · ${textos.join(" · ")}` : textos.join(" · ") } : s.placement,
    };
  });
}
