/**
 * Petición a la Protomolécula (Ola 1026P · P3). ESQUELETO del contrato: P3 lo sustituye. Honesto mientras tanto.
 */
import type { ContextoProto, FalloPeticion, PeticionProto, PlanPeticion } from "./contrato";

export * from "./contrato";

export function leerContexto(ruta = typeof window !== "undefined" ? window.location.pathname : "/"): ContextoProto {
  return { ruta, ambito: "personal" };
}

export async function planificarPeticion(_p: PeticionProto): Promise<PlanPeticion | FalloPeticion> {
  return { error: "sin-ia", motivo: "La planificación de peticiones aún no está conectada." };
}

export interface ResultadoEjecucion { ok: boolean; hechos: string[]; pendientes: string[]; motivo?: string }

export async function ejecutarPlan(_plan: PlanPeticion): Promise<ResultadoEjecucion> {
  return { ok: false, hechos: [], pendientes: [], motivo: "La ejecución de planes aún no está conectada." };
}
