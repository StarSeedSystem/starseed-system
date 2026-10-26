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
import type { FalloPeticion, PeticionProto, PlanPeticion } from "./contrato";
import { leerContexto } from "./contexto";
import type { OpcionesEjecucion, ResultadoEjecucion } from "./ejecutar";
import type { DependenciasPlan } from "./planificar";

export * from "./contrato";
export { anunciarContexto, leerContexto, suscribirContexto } from "./contexto";
export { useContextoProto } from "./use-contexto";
export type { BorradorPeticion, DetallePaso, EstadoPaso, OpcionesEjecucion, ResultadoEjecucion } from "./ejecutar";
export type { DependenciasPlan } from "./planificar";

/**
 * Texto → plan. Primero reglas locales sin IA; si no bastan, UNA consulta al enrutador económico (local o gratis,
 * nunca de pago) con tope por hora. Sin IA disponible: un `FalloPeticion` honesto, nunca un plan inventado.
 */
export async function planificarPeticion(p: PeticionProto, deps: DependenciasPlan = {}): Promise<PlanPeticion | FalloPeticion> {
  const { planificar } = await import("./planificar");
  return planificar(p, {
    ...deps,
    completar: deps.completar ?? (async (mensajes, o) => (await import("./dependencias")).completarConEnrutador(mensajes, o)),
  });
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
