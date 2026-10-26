export type Quien = "ambos" | "laya" | "pequeno" | "ninguno";
export type Accion = "aceptar" | "escalar";

export interface ModeloPequeno {
  respuesta: string;
  confianza?: number;
  motor: string;
}

export interface RespuestaLaya {
  respuesta: string;
  answer_confidence: number;
}

export interface EntradaConsenso {
  pequeno: ModeloPequeno;
  laya: RespuestaLaya | null;
  umbral: number;
}

export interface SalidaConsenso {
  decision: string | null;
  quien: Quien;
  accion: Accion;
  motivo: string;
}

export function consensuar(entrada: EntradaConsenso): SalidaConsenso {
  const { pequeno, laya, umbral } = entrada;
  const coincide = laya?.respuesta === pequeno.respuesta;

  if (coincide) {
    return {
      decision: pequeno.respuesta,
      quien: "ambos",
      accion: "aceptar",
      motivo: "Coinciden Laya y modelo pequeño",
    };
  }

  if (laya !== null) {
    const confianzaLaya = laya.answer_confidence;
    if (confianzaLaya >= umbral) {
      return {
        decision: laya.respuesta,
        quien: "laya",
        accion: "aceptar",
        motivo: `Laya decide con confianza ${confianzaLaya} ≥ ${umbral}`,
      };
    }
    return {
      decision: null,
      quien: "ninguno",
      accion: "escalar",
      motivo: `Laya duda (${confianzaLaya} < ${umbral}), no hay consenso`,
    };
  }

  const confianzaPequeno = pequeno.confianza ?? 0;
  if (confianzaPequeno >= umbral) {
    return {
      decision: pequeno.respuesta,
      quien: "pequeno",
      accion: "aceptar",
      motivo: `Modelo pequeño decide con confianza ${confianzaPequeno} ≥ ${umbral}`,
    };
  }

  return {
    decision: null,
    quien: "ninguno",
    accion: "escalar",
    motivo: `Modelo pequeño sin confianza suficiente (${confianzaPequeno} < ${umbral})`,
  };
}
