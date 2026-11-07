/**
 * anuncio-capas — anuncia las capas de conciencia de Astraura a las neuronas vinculadas (VIN1107A).
 *
 * Cada solicitud y respuesta de sincronización lleva las capacidades PÚBLICAS de esta neurona. Aquí se
 * añaden las capas de conciencia que tiene encendidas (`capa:local`, `capa:mesh`, `capa:nube`,
 * `capa:colectiva`): así el panel del vínculo puede decir cuáles se comparten. El proveedor lee la
 * preferencia guardada en cada anuncio, de modo que un cambio de interruptor se anuncia en el siguiente
 * mensaje sin suscribirse a nada. Nunca se anuncia el «contexto personal».
 */

import { preferenciaCapasGuardada } from "@/lib/astraura/capas-conciencia";
import { capasAnunciadas } from "./panel-vinculo";
import { fijarCapacidadesAnunciadas } from "./sincronizacion-neuronas-motor";

/** Lo monta `MallaNeuronasMount`. Devuelve la baja. */
export function iniciarAnuncioCapas(): () => void {
  return fijarCapacidadesAnunciadas(() => capasAnunciadas(preferenciaCapasGuardada()));
}

/** Mis capas ahora mismo, para compararlas con las de la otra neurona en el panel. */
export function misCapasAnunciadas(): string[] {
  return capasAnunciadas(preferenciaCapasGuardada());
}
