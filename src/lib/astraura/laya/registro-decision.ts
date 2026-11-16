import type { CasoLaya } from "./aprendizaje-laya";
import { anotar } from "./aprendizaje-laya";
import { puntoDecision } from "./puntos-decision";

type RespuestaRoute = {
  ok: boolean;
  plan: { accion: string; capa: string; motivo: string };
  capas: {
    needle: { ms: number; confianza?: number; ok: boolean };
    laya: { ms?: number; confianza?: number; ok: boolean } | null;
    jev: { ms?: number; probabilidad?: number; ok: boolean } | null;
  };
  bloqueHabilidad: string;
};

const MAPA_CAPA_A_PUNTO: Record<string, string> = {
  needle: "reflejo.herramienta",
  laya: "reflejo.herramienta",
  jev: "plan.dificultad",
  llm: "basico.consenso",
};

function esEscalacion(accion: string): boolean {
  return accion.startsWith("escalar");
}

export function casoDeDecision(entrada: unknown): CasoLaya | null {
  if (typeof entrada !== "object" || entrada === null) return null;
  const data = entrada as RespuestaRoute;

  const puntoId = MAPA_CAPA_A_PUNTO[data.plan.capa];
  if (!puntoId) return null;

  const punto = puntoDecision(puntoId);
  if (!punto) return null;

  const resultado = esEscalacion(data.plan.accion) ? "escalada" : "aceptada";
  const privado = punto.privacidad === "solo-propias";

  const confianza =
    data.plan.capa === "laya" && data.capas.laya?.confianza !== undefined
      ? data.capas.laya.confianza
      : data.plan.capa === "needle" && data.capas.needle?.confianza !== undefined
      ? data.capas.needle.confianza
      : 0.5;

  const ms =
    data.plan.capa === "laya" && data.capas.laya?.ms !== undefined
      ? data.capas.laya.ms
      : data.plan.capa === "needle" && data.capas.needle?.ms !== undefined
      ? data.capas.needle.ms
      : 0;

  const estado = JSON.stringify({
    punto: puntoId,
    accion: data.plan.accion,
    capa: data.plan.capa,
    resultado,
  });

  return {
    punto: puntoId,
    ambito: "a1",
    p: confianza,
    donde: "a1",
    ms,
    resultado,
    estado,
    privado,
  };
}

export function registrar(registro: readonly CasoLaya[], entrada: unknown): RegistroAprendizaje {
  const caso = casoDeDecision(entrada);
  if (!caso) return registro;
  return anotar(registro, caso);
}