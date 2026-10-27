/**
 * LICENCIA POR CONTEXTO — VOZ STARSEED + VoiceStudio (Ola 1018V · VST1018C)
 * ─────────────────────────────────────────────────────────────────────────────
 * Qué motores de voz pueden sonar en cada sitio. La decisión es pura y usa la
 * misma herencia de capas de conciencia que el resto de modelos
 * (`preferencias-capas.ts`): sistema › comunidad › grupo › persona › neurona.
 *
 * Reglas de la casa:
 *  · «comercial» se juzga como «publico» y sin uso personal.
 *  · Un motor `personal` (OmniVoice, VoiceMorphic) SOLO suena en lo personal.
 *  · Una `condicionada` (Supertonic, IndexTTS) solo entra si la condición se
 *    cumple de verdad; si no, se queda fuera con el motivo a la vista.
 */

import {
  preferenciasEfectivas,
  type CapasPrefs,
  type Contexto,
} from "@/lib/modelos/preferencias-capas";

/** Contextos de uso que entiende la voz del OS. */
export type ContextoVoz = "personal" | "grupo" | "comunidad" | "publico" | "comercial";

/** Clases de licencia que puede declarar un motor de voz. */
export type ClaseLicenciaVoz = "libre" | "condicionada" | "personal";

/** Motor mínimo que necesita el elector de licencia. */
export interface MotorVozLicencia {
  id: string;
  claseLicencia: ClaseLicenciaVoz;
  /** Solo para `condicionada`: ¿se cumple su condición de uso? */
  condicionCumplida?: boolean;
}

export interface ResultadoLicenciaVoz {
  permitidos: MotorVozLicencia[];
  excluidos: { id: string; motivo: string }[];
}

const MOTIVO_PERSONAL = "pesos no comerciales: solo uso personal";
const MOTIVO_CONDICION = "condición de uso no cumplida";

export function motoresPermitidos(
  motores: MotorVozLicencia[],
  contexto: ContextoVoz,
  capas: CapasPrefs
): ResultadoLicenciaVoz {
  const contextoBase: Contexto = contexto === "comercial" ? "publico" : contexto;
  const { licenciaPermitida } = preferenciasEfectivas(capas, contextoBase);
  const permitidos: MotorVozLicencia[] = [];
  const excluidos: { id: string; motivo: string }[] = [];

  for (const motor of motores) {
    const clase = motor.claseLicencia;

    // Defensa explícita: los pesos personales nunca salen de lo personal,
    // aunque una capa los dejara pasar por error.
    if (clase === "personal" && contexto !== "personal") {
      excluidos.push({ id: motor.id, motivo: MOTIVO_PERSONAL });
      continue;
    }

    if (!licenciaPermitida.includes(clase)) {
      excluidos.push({ id: motor.id, motivo: motivoDeCapa(clase, contexto) });
      continue;
    }

    if (clase === "condicionada" && motor.condicionCumplida !== true) {
      excluidos.push({ id: motor.id, motivo: MOTIVO_CONDICION });
      continue;
    }

    permitidos.push(motor);
  }

  return { permitidos, excluidos };
}

function motivoDeCapa(clase: ClaseLicenciaVoz, contexto: ContextoVoz): string {
  if (clase === "personal") return "licencia personal no habilitada por las capas";
  if (clase === "condicionada") {
    return `licencia condicionada no habilitada por las capas en contexto ${contexto}`;
  }
  return `licencia ${clase} no permitida en contexto ${contexto}`;
}
