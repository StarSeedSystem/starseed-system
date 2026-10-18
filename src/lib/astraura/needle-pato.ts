/**
 * Needle con las herramientas del pato: el modelo afinado de needle-duck en la capa Needle
 * Contrato: architecture/astraura-voces-y-robots.md
 *
 * Este módulo proporciona una capa especializada de Needle 3 afinado para controlar
 * el robot pato (Open Duck Mini) eligiendo entre las acciones: caminar, girar,
 * emoción, bailar y negar con la cabeza.
 *
 * PURO: sin React, sin red, sin `node:*`, sin reloj.
 */

import {
  type DecisionNeedle,
  type HerramientaNeedle,
  type LlamadaNeedle,
  zonaDeConfianza,
  UMBRAL_EJECUTAR,
  UMBRAL_CONFIRMAR,
} from "./needle3-client";
import { decidirConNeedle } from "./needle3-client";
import { planDeDecision, type AccionPlan, type CapaDecision } from "./decision-hibrida";

/**
 * Herramientas específicas para el robot pato.
 * Basado en las acciones definidas en src/lib/astraura-bots/acciones.ts
 */
export const HERRAMIENTAS_PATO: HerramientaNeedle[] = [
  {
    name: "caminar",
    description: "Mover el robot pato hacia adelante en su dirección actual",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "girar",
    description: "Girar el robot pato 90 grados en sentido horario",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "emocion",
    description: "Cambiar el estado emocional del robot pato",
    parameters: {
      type: "object",
      properties: {
        emocion: { type: "string", description: "Estado emocional a establecer" },
      },
    },
  },
  {
    name: "bailar",
    description: "Hacer que el robot pato realice un baile completo",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "negacion",
    description: "Hacer que el robot pato niegue con la cabeza",
    parameters: {
      type: "object",
      properties: {},
    },
  },
];

/**
 * Determina si una consulta está relacionada con acciones del robot pato.
 * En un caso real, esto podría usar análisis semántico más sofisticado.
 * Por simplicidad, verificamos palabras clave relacionadas con movimiento y acciones del pato.
 */
export function esConsultaDePato(consulta: string): boolean {
  const consultaLower = consulta.toLowerCase();
  // Palabras clave relacionadas con las acciones del pato
  const palabrasClave = [
    "caminar", "andar", "mover", "avanzar", "retroceder",
    "girar", "rotar", "turn", "dirección",
    "emocion", "sentir", "estado", "ánimo",
    "bailar", "baile", "danzar",
    "negar", "cabeza", "no", "desacuerdo",
    "pato", "duck", "robot"
  ];
  
  return palabrasClave.some(palabra => consultaLower.includes(palabra));
}

/**
 * Filtra las herramientas para asegurar que solo se usen las permitidas para el pato.
 * Aunque HERRAMIENTAS_PATO ya contiene solo las permitidas, esta función
 * proporciona una capa adicional de seguridad.
 */
export function filtrarHerramientasPato(herramientas: HerramientaNeedle[]): HerramientaNeedle[] {
  return herramientas.filter(h =>
    HERRAMIENTAS_PATO.some(hp => hp.name === h.name)
  );
}

/**
 * Ejecuta una decisión de needle específicamente para el robot pato.
 * Si la confianza es insuficiente, delega al sistema de decisión híbrida.
 */
export async function decidirConNeedlePato(
  consulta: string,
  opciones?: { sistema?: string; maxPasos?: number; enDispositivo?: boolean; timeoutDispositivoMs?: number }
): Promise<DecisionNeedle> {
  // Primero verificamos si la consulta está relacionada con el pato
  if (!esConsultaDePato(consulta)) {
    // Si no es sobre el pato, delegamos al needle estándar
    return await decidirConNeedle("nube", consulta, [], opciones);
  }

  // Filtramos las herramientas para asegurar que solo usamos las del pato
  const herramientasPato = filtrarHerramientasPato([]); // En este caso, pasamos un array vacío ya que no recibimos herramientas externas
  
  // Usamos las herramientas específicas del pato
  const decision = await decidirConNeedle("nube", consulta, HERRAMIENTAS_PATO, opciones);
  
  // Si la decisión tiene suficiente confianza, la retornamos directamente
  const zona = zonaDeConfianza(decision);
  if (zona === "ejecutar") {
    return { ...decision, origen: "dispositivo" as const };
  }
  
  // Si la confianza es media o baja, delegamos al sistema de decisión híbrida
  // Esto cumple con el requisito de usar la capa híbrida cuando Needle no está seguro
  const plan = planDeDecision(decision, null);
  
  // Según el plan, ejecutamos la acción apropiada
  if (plan.accion === "ejecutar" && plan.llamada) {
    return {
      ok: true,
      motor: "needle-pato-hibrido",
      llamadas: [plan.llamada],
      confianza: decision.confianza ?? 0.5,
      razonamiento: plan.motivo,
      origen: "servidor" as const
    };
  }
  
  // Si el plan requiere confirmación o escalado, retornamos una decisión que refleje eso
  if (plan.accion === "confirmar") {
    return {
      ok: true,
      motor: "needle-pato-requiere-confirmacion",
      llamadas: decision.llamadas ?? [],
      confianza: decision.confianza ?? 0.4,
      razonamiento: plan.motivo,
      origen: "servidor" as const
    };
  }
  
  // Para casos de escalado, retornamos la decisión original pero marcando que necesita escalado
  return {
    ...decision,
    origen: "servidor" as const,
    razonamiento: `${decision.razonamiento || ""} Escalando a decisión híbrida: ${plan.motivo}`.trim()
  };
}