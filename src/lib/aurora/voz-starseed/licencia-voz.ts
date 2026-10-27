/**
 * LICENCIA DE VOZ POR CONTEXTO — MOTOR ÚNICO «VOZ STARSEED» (Ola 1018V · tarea C)
 * ─────────────────────────────────────────────────────────────────────────────
 * Qué motores pueden sonar en cada sitio. Es puro: no toca red, disco, reloj
 * ni audio. La herencia de capas (sistema › comunidad › grupo › persona ›
 * neurona) la resuelve `preferenciasEfectivas`; aquí solo se cruza con la clase
 * de licencia de cada motor y con su condición, si la tiene.
 *
 * Reglas duras (`architecture/voz-voicestudio.md` §4 y `vigia-modelos.md` §4):
 *  · «comercial» se trata como «publico» sin uso personal.
 *  · fuera del contexto personal no suena ningún motor de clase «personal».
 *  · una «condicionada» solo entra si su condición consta cumplida.
 */

import {
  preferenciasEfectivas,
  type CapasPrefs,
  type Contexto,
  type Licencias,
} from "@/lib/modelos/preferencias-capas";

export type ContextoLicenciaVoz =
  | "personal"
  | "grupo"
  | "comunidad"
  | "publico"
  | "comercial";

/** Clases que puede declarar un motor de voz (la «desconocida» nunca entra). */
export type ClaseLicenciaVoz = Extract<Licencias, "libre" | "condicionada" | "personal">;

export interface MotorInfo {
  id: string;
  claseLicencia: ClaseLicenciaVoz;
  /** Solo se mira para las «condicionada»; ausente equivale a no cumplida. */
  condicionCumplida?: boolean;
}

export interface MotorExcluido {
  id: string;
  motivo: string;
}

export interface ResultadoPermisos {
  permitidos: MotorInfo[];
  excluidos: MotorExcluido[];
}

/** «comercial» no tiene capa propia: comparte la de «publico». */
const CONTEXTO_DE_CAPAS: Record<ContextoLicenciaVoz, Contexto> = {
  personal: "personal",
  grupo: "grupo",
  comunidad: "comunidad",
  publico: "publico",
  comercial: "publico",
};

/**
 * Filtra los motores que pueden sonar en un contexto, conservando el orden de
 * entrada (determinista) y explicando en español por qué se excluye cada uno.
 */
export function motoresPermitidos(
  motores: readonly MotorInfo[],
  contexto: ContextoLicenciaVoz,
  capas: CapasPrefs,
): ResultadoPermisos {
  const { licenciaPermitida } = preferenciasEfectivas(capas, CONTEXTO_DE_CAPAS[contexto]);
  const permitidos: MotorInfo[] = [];
  const excluidos: MotorExcluido[] = [];

  for (const motor of motores) {
    const motivo = motivoDeExclusion(motor, contexto, licenciaPermitida);
    if (motivo === null) permitidos.push(motor);
    else excluidos.push({ id: motor.id, motivo });
  }

  return { permitidos, excluidos };
}

function motivoDeExclusion(
  motor: MotorInfo,
  contexto: ContextoLicenciaVoz,
  licenciaPermitida: readonly Licencias[],
): string | null {
  if (motor.claseLicencia === "libre") return null;

  if (motor.claseLicencia === "personal") {
    if (contexto !== "personal") return "pesos no comerciales: solo uso personal";
    if (!licenciaPermitida.includes("personal")) {
      return "pesos no comerciales: las capas de esta persona no habilitan uso personal";
    }
    return null;
  }

  if (!licenciaPermitida.includes("condicionada")) {
    return `licencia condicionada no habilitada en contexto ${contexto}`;
  }
  if (motor.condicionCumplida !== true) {
    return "licencia condicionada: su condición no consta cumplida";
  }
  return null;
}
