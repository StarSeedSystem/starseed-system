import { puntoDecision, type MedioLaya } from "./puntos-decision";
import { anotar, huellaEstado, type CasoLaya, type RegistroAprendizaje } from "./aprendizaje-laya";

export interface EntradaDecision {
  readonly punto: string;
  readonly ambito: string;
  readonly answer_confidence: number;
  readonly donde: MedioLaya;
  readonly ms: number;
  readonly escalo: boolean;
  readonly estado: string;
}

function esPuntoPrivado(punto: string): boolean {
  const p = puntoDecision(punto);
  return p?.privacidad === "solo-propias";
}

export function casoDeDecision(entrada: EntradaDecision): CasoLaya | null {
  const puntoInfo = puntoDecision(entrada.punto);
  if (!puntoInfo) return null;

  const p = entrada.answer_confidence;
  if (typeof p !== "number" || !Number.isFinite(p)) return null;

  const privado = esPuntoPrivado(entrada.punto);
  const estado = privado ? huellaEstado(entrada.estado) : entrada.estado;
  const resultado: CasoLaya["resultado"] = entrada.escalo ? "escalada" : "aceptada";

  return {
    punto: entrada.punto,
    ambito: entrada.ambito,
    p,
    donde: entrada.donde,
    ms: entrada.ms,
    resultado,
    estado,
    privado,
  };
}

export function registrar(
  registro: RegistroAprendizaje,
  entrada: EntradaDecision
): RegistroAprendizaje {
  const caso = casoDeDecision(entrada);
  if (!caso) return registro;
  return anotar(registro, caso);
}