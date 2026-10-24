// Consenso entre el modelo pequeño (BitNet/Bonsai/Needle) y Laya para decisiones básicas
// de 1,58 bits (architecture/laya-y-habilidades.md §4, tarea C de la Ola 1018L · LYS1018C).
// Puro: sin red, sin disco, sin reloj, sin modelo cargado. Lo privado nunca baja.

export interface Pequeno {
  readonly respuesta: string;
  readonly confianza?: number;
  readonly motor: string;
}

export interface LayaRespuesta {
  readonly respuesta: string;
  readonly answer_confidence: number;
}

export interface EntradaConsenso {
  readonly pequeno: Pequeno;
  readonly laya: LayaRespuesta | null;
  readonly umbral: number;
}

export interface ResultadoConsenso {
  readonly decision: string | null;
  readonly quien: "ambos" | "laya" | "pequeno" | "ninguno";
  readonly accion: "aceptar" | "escalar";
  readonly motivo: string;
}

export function consensuar(e: EntradaConsenso): ResultadoConsenso {
  const { pequeno, laya, umbral } = e;

  // Coincidencia: los dos dicen lo mismo.
  const coincide = laya !== null && pequeno.respuesta === laya.respuesta;
  if (coincide) {
    return {
      decision: pequeno.respuesta,
      quien: "ambos",
      accion: "aceptar",
      motivo: `Coinciden: «${pequeno.respuesta}» (motor ${pequeno.motor}) y Laya confirman.`,
    };
  }

  // No coinciden: si Laya llega con confianza calibrada ≥ umbral, manda Laya.
  if (laya !== null && typeof laya.answer_confidence === "number" && Number.isFinite(laya.answer_confidence) && laya.answer_confidence >= umbral) {
    return {
      decision: laya.respuesta,
      quien: "laya",
      accion: "aceptar",
      motivo: `No coinciden; Laya manda con confianza calibrada ${laya.answer_confidence.toFixed(2)} ≥ ${umbral.toFixed(2)}: «${laya.respuesta}».`,
    };
  }

  // Laya no llegó a tiempo o dudó: solo sube la privacidad; se confía en lo pequeño si su confianza ≥ umbral.
  const confPeq = typeof pequeno.confianza === "number" && Number.isFinite(pequeno.confianza) ? pequeno.confianza : 0;
  if (confPeq >= umbral) {
    return {
      decision: pequeno.respuesta,
      quien: "pequeno",
      accion: "aceptar",
      motivo: `Laya no llegó o dudó (${laya === null ? "no llegó" : `confianza ${laya.answer_confidence.toFixed(2)} < umbral`}); pequeño (${pequeno.motor}) con confianza ${confPeq.toFixed(2)} ≥ umbral acepta «${pequeno.respuesta}».`,
    };
  }

  // Ninguno tiene confianza suficiente: se escala (regla determinista o capa superior).
  const layaAusenteOConfBaja = laya === null ? "ausente" : `dudó (${laya.answer_confidence.toFixed(2)} < ${umbral.toFixed(2)})`;
  return {
    decision: null,
    quien: "ninguno",
    accion: "escalar",
    motivo: `Ninguno tiene confianza ≥ ${umbral.toFixed(2)} (pequeño: ${confPeq.toFixed(2)}, Laya: ${layaAusenteOConfBaja}); se escala.`,
  };
}
