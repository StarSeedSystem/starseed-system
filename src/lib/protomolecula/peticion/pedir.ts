/**
 * Petición a la Protomolécula · la acción `pedir` de un AGENTE (Ola 1026P · P3).
 * `[[ACCION: protomolecula {"accion":"pedir","texto":"…"}]]` convierte la petición en un PLAN (reglas locales primero,
 * después una sola consulta al enrutador económico, con el tope por hora MÁS CORTO de los agentes) y lo deja pendiente
 * de que la PERSONA lo confirme en la ventana. Un agente nunca ejecuta directamente: aquí solo se planifica.
 */
import { EVENTO_PLAN_PENDIENTE, type ContextoProto, type PlanPeticion } from "./contrato";
import { leerContexto } from "./contexto";
import { describirOperacion } from "./esquema";
import { planificar, type DependenciasPlan } from "./planificar";
import { TOPE_AGENTE_POR_HORA } from "./tope";
import { alcanceVisiblePara, type ActorMemoria } from "@/lib/nucleo/alcance-memoria";
import type { ResultadoAccionProto } from "../accion-agente";

/** La ventana lo escucha (`detail: PlanPendiente`) para enseñar «un agente propone…» con Confirmar y Descartar. */
export { EVENTO_PLAN_PENDIENTE };
const MAX_PENDIENTES = 5;

export interface PlanPendiente {
  id: string;
  /** Lo que pidió el agente (acotado). */
  texto: string;
  plan: PlanPeticion;
  /** La pantalla en que se pidió: se ejecuta contra ELLA, no contra la que haya cuando la persona confirme. */
  contexto: ContextoProto;
  agente: string;
  creado: number;
}

const cola: PlanPendiente[] = [];
let secuencia = 0;

export const planesPendientes = (): readonly PlanPendiente[] => [...cola];
export function tomarPlanPendiente(id: string): PlanPendiente | null {
  const i = cola.findIndex((p) => p.id === id);
  return i < 0 ? null : cola.splice(i, 1)[0];
}
export const descartarPlanPendiente = (id: string): boolean => tomarPlanPendiente(id) !== null;
/** Solo para pruebas. */
export function reiniciarPlanesPendientes(): void { cola.length = 0; secuencia = 0; }

export interface DependenciasPedir {
  /** Planificador y sus dependencias de IA (en pruebas, simulados). Por defecto, el real. */
  planificar?: (texto: string, contexto: ContextoProto, deps: DependenciasPlan) => ReturnType<typeof planificar>;
  deps?: DependenciasPlan;
  contexto?: ContextoProto;
  ahora?: () => number;
  emitir?: (p: PlanPendiente) => void;
}

const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const no = (message: string): ResultadoAccionProto => ({ ok: false, message, status: "Protomolécula" });

function emitirEnNavegador(p: PlanPendiente): void {
  try { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENTO_PLAN_PENDIENTE, { detail: p })); } catch { /* sin DOM */ }
}

export async function pedirComoAgente(args: Record<string, unknown>, ctx: { actor?: ActorMemoria } = {}, d: DependenciasPedir = {}): Promise<ResultadoAccionProto> {
  const peticion = texto(args.texto).slice(0, 1000);
  if (!peticion) return no("Falta «texto»: qué quiere la persona, por ejemplo «hazme un cubo 3D girando».");
  const modo = args.modo === "rama" || args.modo === "directo" ? args.modo : undefined;
  const agente = (texto(args.agente) || "astraura").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40) || "astraura";
  const contexto = d.contexto ?? leerContexto();
  if (!alcanceVisiblePara(ctx.actor ?? { tipo: "agente-personal" }).includes(contexto.ambito)) {
    return no(`Esta pantalla es de ámbito «${contexto.ambito}» y este agente no lo alcanza.`);
  }
  let dependencias: DependenciasPlan = d.deps ?? {};
  if (!d.deps) {
    const { completarConEnrutador } = await import("./dependencias");
    dependencias = { completar: completarConEnrutador };
  }
  const plan = await (d.planificar ?? ((t, c, dp) => planificar({ texto: t, contexto: c, modo }, dp)))(peticion, contexto, { ...dependencias, agenteId: `agente:${agente}`, topePorHora: TOPE_AGENTE_POR_HORA });
  if ("error" in plan) return no(`No pude preparar el plan: ${plan.motivo}`);

  const ahora = (d.ahora ?? Date.now)();
  const pendiente: PlanPendiente = { id: `plan-${ahora.toString(36)}-${++secuencia}`, texto: peticion, plan, contexto, agente, creado: ahora };
  cola.push(pendiente);
  while (cola.length > MAX_PENDIENTES) cola.shift();
  (d.emitir ?? emitirEnNavegador)(pendiente);

  const pasos = plan.pasos.map((p, i) => `${i + 1}. ${describirOperacion(p)}`).join(" · ");
  const fuera = plan.fuera.length ? ` Lo que no cabe: ${plan.fuera.join(" ")}` : "";
  return {
    ok: true,
    status: "Preparando un plan…",
    message: `Plan listo (${plan.pasos.length} ${plan.pasos.length === 1 ? "paso" : "pasos"}, tipo de cambio «${plan.tipoCambio}», planificado con ${plan.motor}): ${pasos}.${fuera} NO se ha hecho nada: queda pendiente de que la persona lo confirme en la ventana de la Protomolécula.`,
  };
}
