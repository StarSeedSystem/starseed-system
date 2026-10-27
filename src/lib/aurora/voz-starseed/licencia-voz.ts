/**
 * LICENCIA DE VOZ POR CONTEXTO — MOTOR ÚNICO «VOZ STARSEED» (Ola 1018V · VST1018C)
 * ─────────────────────────────────────────────────────────────────────────────
 * Decide qué motores de voz pueden sonar en cada sitio sin duplicar la regla
 * de capas de conciencia: la herencia (sistema › comunidad › grupo › persona ›
 * neurona) la resuelve `preferenciasEfectivas`, y aquí solo se traduce a
 * motivos legibles para la interfaz.
 *
 * Reglas duras:
 *  · «comercial» se trata como «publico» y nunca admite uso personal.
 *  · Un motor «personal» (OmniVoice, VoiceMorphic) solo suena en lo personal.
 *  · Una «condicionada» solo entra si `condicionCumplida` es exactamente true.
 *  · «libre» es el piso: si las capas lo autorizan, siempre entra.
 *
 * Módulo PURO: sin red, sin disco, sin reloj. Misma entrada → misma salida.
 */

import {
  preferenciasEfectivas,
  type CapasPrefs,
  type Contexto,
  type Licencias,
} from "@/lib/modelos/preferencias-capas";

export type ClaseLicenciaVoz = "libre" | "condicionada" | "personal";

export type ContextoVoz =
  | "personal"
  | "grupo"
  | "comunidad"
  | "publico"
  | "comercial";

export interface MotorVozLicencia {
  id: string;
  claseLicencia: ClaseLicenciaVoz;
  /** Solo aplica a «condicionada»; ausente equivale a no cumplida. */
  condicionCumplida?: boolean;
}

export interface ExclusionVoz {
  id: string;
  motivo: string;
}

export interface PermisosVoz {
  permitidos: MotorVozLicencia[];
  excluidos: ExclusionVoz[];
}

const MOTIVO_PERSONAL = "pesos no comerciales: solo uso personal";
const MOTIVO_CONDICION = "condición de uso no cumplida";
const MOTIVO_SIN_AUTORIZACION =
  "licencia condicionada sin autorización en este contexto";
const MOTIVO_NEURONA = "la capa de la neurona no admite pesos de uso personal";
const MOTIVO_CAPA_PERSONAL = "requiere autorización de la capa personal";

function motivoPersonal(contexto: ContextoVoz, capas: CapasPrefs): string {
  if (contexto !== "personal") return MOTIVO_PERSONAL;
  const neuronaBloquea =
    capas.neurona !== undefined && capas.neurona !== "personal";
  return neuronaBloquea ? MOTIVO_NEURONA : MOTIVO_CAPA_PERSONAL;
}

function motivoExcluida(
  clase: Licencias,
  contexto: ContextoVoz,
  capas: CapasPrefs,
  cumple: boolean
): string {
  if (clase === "personal") return motivoPersonal(contexto, capas);
  if (clase === "condicionada") {
    return cumple ? MOTIVO_SIN_AUTORIZACION : MOTIVO_CONDICION;
  }
  return `licencia ${clase} no reconocida para voz`;
}

/**
 * Filtra los motores que pueden sonar en un contexto, heredando las capas de
 * conciencia. Devuelve los permitidos en el mismo orden de entrada y, para
 * cada excluido, un motivo legible listo para mostrar en Ajustes → Voz.
 *
 * @param motores - Catálogo de motores con su clase de licencia de pesos.
 * @param contexto - Dónde va a sonar: personal, grupo, comunidad, público o comercial.
 * @param capas - Preferencias heredadas de las capas de conciencia.
 */
export function motoresPermitidos(
  motores: MotorVozLicencia[],
  contexto: ContextoVoz,
  capas: CapasPrefs
): PermisosVoz {
  const contextoCapas: Contexto =
    contexto === "comercial" ? "publico" : contexto;
  const { licenciaPermitida } = preferenciasEfectivas(capas, contextoCapas);
  const permitidos: MotorVozLicencia[] = [];
  const excluidos: ExclusionVoz[] = [];

  for (const motor of motores) {
    const clase: Licencias = motor.claseLicencia;
    const cumple = motor.condicionCumplida === true;

    if (clase === "condicionada" && !cumple) {
      excluidos.push({ id: motor.id, motivo: MOTIVO_CONDICION });
      continue;
    }

    if (!licenciaPermitida.includes(clase)) {
      excluidos.push({
        id: motor.id,
        motivo: motivoExcluida(clase, contexto, capas, cumple),
      });
      continue;
    }

    permitidos.push(motor);
  }

  return { permitidos, excluidos };
}
