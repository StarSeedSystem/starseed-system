/**
 * Petición a la Protomolécula (Ola 1026P · P3): pedirle a Astraura CUALQUIER cosa sin salir del contexto.
 *
 *   leerContexto()      → qué tiene la persona delante (ruta + último anuncio de la pantalla).
 *   planificarPeticion  → texto → plan de operaciones CERRADAS (reglas locales, después el enrutador económico con tope).
 *   ejecutarPlan        → cada paso por el gobierno de la entidad (`decidirCambio`) y, si aplica, a lo que ya existe.
 *
 * Mantiene las firmas del contrato (`ejecutarPlan(plan)` y `planificarPeticion(p)` siguen valiendo con un solo argumento).
 * Los motores pesados se cargan a demanda: importar este archivo es barato.
 */
import type { ActorProto, ContextoProto, FalloPeticion, PeticionProto, PlanPeticion } from "./contrato";
import { GRAVEDADES, TIPOS_ARTEFACTO, leerObjeciones, promptDePez, veredicto } from "@/lib/agents/egm/peces";
import { leerContexto } from "./contexto";
import type { OpcionesEjecucion, ResultadoEjecucion } from "./ejecutar";
import type { DependenciasPlan } from "./planificar";

export * from "./contrato";
export { anunciarContexto, leerContexto, suscribirContexto } from "./contexto";
export { useContextoProto } from "./use-contexto";
export type { BorradorPeticion, DetallePaso, EstadoPaso, OpcionesEjecucion, ResultadoEjecucion } from "./ejecutar";
export type { DependenciasPlan } from "./planificar";

function artefactoDelPlan(plan: PlanPeticion): string {
  return [
    `Resumen: ${plan.resumen}`,
    `Tipo de cambio: ${plan.tipoCambio}`,
    ...plan.pasos.map((paso, i) => `${i + 1}. ${JSON.stringify(paso)}`),
    ...(plan.fuera.length ? [`Fuera: ${plan.fuera.join(" ")}`] : []),
  ].join("\n").slice(0, 6000);
}

async function bloqueoDePeces(plan: PlanPeticion, completar: DependenciasPlan["completar"]): Promise<string> {
  if (!completar || plan.motor === "reglas locales" || plan.tipoCambio !== "creacion") return "";
  const tipo = TIPOS_ARTEFACTO.includes("plan") ? "plan" : "respuesta";
  try {
    const respuesta = await completar([{ role: "user", content: promptDePez(artefactoDelPlan(plan), tipo) }], { maxTokens: 500 });
    if (!respuesta?.texto) return "";
    const objeciones = leerObjeciones(respuesta.texto);
    if (veredicto(objeciones).pasa) return "";
    return objeciones.find((objecion) => objecion.gravedad === GRAVEDADES[0])?.texto ?? "la revisión no aprobó el plan";
  } catch {
    return "";
  }
}

/**
 * Texto → plan. Primero reglas locales sin IA; si no bastan, UNA consulta al enrutador económico (local o gratis,
 * nunca de pago) con tope por hora. Sin IA disponible: un `FalloPeticion` honesto, nunca un plan inventado.
 */
export async function planificarPeticion(p: PeticionProto, deps: DependenciasPlan = {}): Promise<PlanPeticion | FalloPeticion> {
  const { planificar } = await import("./planificar");
  const completar = deps.completar ?? (async (mensajes, o) => (await import("./dependencias")).completarConEnrutador(mensajes, o));
  const plan = await planificar(p, { ...deps, completar });
  if ("error" in plan) return plan;
  const bloqueo = await bloqueoDePeces(plan, completar);
  if (bloqueo) return { error: "fuera-de-vocabulario", motivo: `La revisión con peces no aprobó el plan: ${bloqueo}` };
  return plan;
}

/**
 * Ejecuta un plan YA confirmado por la persona (llamar a esta función es esa confirmación). Cada paso se revalida con
 * el esquema estricto y pasa por el gobierno de la entidad: si pide propuesta o votación, no se aplica y se devuelve el
 * borrador en `borradores`. Lo que no tiene camino real se devuelve en `pendientes` con su motivo.
 */
export async function ejecutarPlan(plan: PlanPeticion, opciones: OpcionesEjecucion = {}): Promise<ResultadoEjecucion> {
  const [{ ejecutarConDependencias }, { dependenciasReales }] = await Promise.all([import("./ejecutar"), import("./dependencias")]);
  return ejecutarConDependencias(plan, { ...opciones, contexto: opciones.contexto ?? leerContexto() }, dependenciasReales({ abrirRuta: opciones.abrirRuta }));
}

/**
 * Quién es la persona para el gobierno de esta pantalla: su cuenta y su rol REAL en el grupo (si lo hay). Es el mismo
 * actor que usa `ejecutarPlan` por defecto, para que la vista previa del veredicto y la ejecución digan lo mismo.
 */
export async function actorDeLaSesion(contexto: ContextoProto, origen: ActorProto["origen"]): Promise<ActorProto> {
  return (await import("./dependencias")).actorPorDefecto(contexto, origen);
}
