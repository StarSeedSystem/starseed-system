export type LayaDecision = {
  respuesta: string;
  answer_confidence: number;
};

export type PequeñoDecision = {
  respuesta: string;
  confianza?: number;
  motor: string;
};

export type ConsensoResultado = {
  decision: string;
  quien: "ambos" | "laya" | "pequeño" | "ninguno";
  accion: "aceptar" | "escalar";
  motivo: string;
};

export function consensuar(
  pequeño: PequeñoDecision,
  laya: LayaDecision | null,
  umbral: number
): ConsensoResultado {
  // 1. Si coinciden, aceptar
  if (laya && pequeño.respuesta === laya.respuesta) {
    return {
      decision: pequeño.respuesta,
      quien: "ambos",
      accion: "aceptar",
      motivo: "Coincidencia entre modelo pequeño y Laya.",
    };
  }

  // 2. Si no coinciden, manda Laya con confianza ≥ umbral
  if (laya && laya.answer_confidence >= umbral) {
    return {
      decision: laya.respuesta,
      quien: "laya",
      accion: "aceptar",
      motivo: `Laya tiene confianza (${laya.answer_confidence.toFixed(2)}) ≥ umbral (${umbral.toFixed(2)}).`,
    };
  }

  // 3. Si Laya no llegó a tiempo o no tiene suficiente confianza,
  // se acepta lo pequeño solo si su confianza ≥ umbral
  if (pequeño.confianza !== undefined && pequeño.confianza >= umbral) {
    return {
      decision: pequeño.respuesta,
      quien: "pequeño",
      accion: "aceptar",
      motivo: `Laya no válida, pero modelo pequeño tiene confianza (${pequeño.confianza.toFixed(2)}) ≥ umbral (${umbral.toFixed(2)}).`,
    };
  }

  // 4. Si no, escalar
  return {
    decision: pequeño.respuesta, // Default al pequeño mientras escala
    quien: "ninguno",
    accion: "escalar",
    motivo: "Ninguna confianza alcanza el umbral necesario para consenso.",
  };
}
