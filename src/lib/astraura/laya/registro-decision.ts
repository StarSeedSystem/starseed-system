// Registro de decisiones de Laya: convierte la respuesta de /api/astraura/decidir en un CasoLaya.
// PURA: sin red, sin disco, sin reloj (ts inyectado).
import type { MedioLaya } from "./puntos-decision";
import type { ResultadoLaya, RegistroAprendizaje, CasoLaya } from "./aprendizaje-laya";
import { puntoDecision, type PuntoDecision } from "./puntos-decision";
import { anotar } from "./aprendizaje-laya";

export type PuntoDecisionId =
  | "reflejo.herramienta"
  | "plan.dificultad"
  | "respuesta.basta"
  | "basico.consenso"
  | "habilidad.elegir"
  | "publicar.moderar"
  | "privacidad.subir"
  | "voz.tono"
  | "video.intencion"
  | "enjambre.medio";

export interface EntradaDecision {
  readonly punto: PuntoDecisionId;
  readonly ambito: string;
  readonly answer_confidence: number | null;
  readonly donde: MedioLaya;
  readonly ms: number;
  readonly escalo: boolean;
  readonly estado: string;
  readonly ts?: number;
}

export function casoDeDecision(entrada: EntradaDecision): CasoLaya | null {
  const punto = puntoDecision(entrada.punto);
  if (!punto) return null;

  const privado = punto.privacidad === "solo-propias";
  const resultado: ResultadoLaya = entrada.escalo ? "escalada" : "aceptada";

  return {
    punto: entrada.punto,
    ambito: entrada.ambito,
    p: entrada.answer_confidence ?? 0,
    donde: entrada.donde,
    ms: entrada.ms,
    resultado,
    estado: entrada.estado,
    privado,
    ts: entrada.ts,
  };
}

export function registrar(registro: RegistroAprendizaje, entrada: EntradaDecision): RegistroAprendizaje {
  const caso = casoDeDecision(entrada);
  if (!caso) return registro;
  return anotar(registro, caso);
}