// Adaptado de OpenMausBot (Copyright 2026 Milind Soni y colaboradores, Apache-2.0): N/A (implementación original basada en la especificación).

export type NivelBot = "nada" | "proponer" | "aplicar-bajo" | "aplicar";

export interface AccionAgente {
  tipo: "click" | "type" | "navigate";
  rect: { top: number; left: number; width: number; height: number };
  etiqueta: string;
}

export function anunciarAccion(accion: AccionAgente) {
  const event = new CustomEvent("starseed:mausbot-agente", { detail: accion });
  window.dispatchEvent(event);
}

export function puedeActuar(
  permisos: { agent: boolean; screenVoice: boolean },
  nivel: NivelBot,
  esReversible: boolean
): { permitido: boolean; motivo?: string } {
  if (!permisos.agent || !permisos.screenVoice) {
    return { permitido: false, motivo: "Permisos de neurona insuficientes" };
  }
  if (nivel === "nada") return { permitido: false, motivo: "Nivel de bot: nada" };
  if (nivel === "proponer") return { permitido: false, motivo: "El bot debe proponer la acción" };
  if (nivel === "aplicar-bajo" && !esReversible) {
    return { permitido: false, motivo: "Acción no reversible" };
  }
  return { permitido: true };
}
