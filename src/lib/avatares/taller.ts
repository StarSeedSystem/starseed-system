/**
 * Taller 3D · SERVICIO DE REPARTO (G3D1011D). Contrato: architecture/astraura-avatares-3d.md §11.
 *
 * Consume el reparto ya hecho en `adaptadores/reparto-taller.ts`: dado un encargo y las neuronas del
 * registro (la parte `taller` que `resumirBus` adjunta a cada `NodoVista`, ver `metagenesis/remoto-nodos`),
 * devuelve la elección de `elegirNeurona` junto con su `OrdenTaller` lista para el préstamo de tareas de
 * MetaGenesis.
 *
 * Envío, honesto («basta de ilusiones»): la orden viaja por el bus `mg_orden` que ejecuta el nodo de
 * MetaGenesis (`scripts/puente/nodo_metagenesis_logica.py`) y firma el servidor (`/api/metagenesis/orden`).
 * Hoy ninguno de los dos admite la acción `taller_3d` (su lista blanca no la incluye y el ejecutor del
 * taller, `servicios/taller-3d/taller.py` de la cola `cola-avatares-1011`, aún no existe aquí): por eso el
 * servicio deja la ELECCIÓN hecha, no finge enviarla. PURO: sin red, sin GPU.
 */
import {
  elegirNeurona, type EleccionTaller, type EncargoTaller, type NeuronaTaller, type OrdenTaller,
} from "./adaptadores/reparto-taller";

export interface EntregaTaller {
  /** A quién va el trabajo y por qué (o por qué ninguna neurona puede, en palabras). */
  eleccion: EleccionTaller;
  /** La orden ya formada para el préstamo de MetaGenesis (bus `mg_orden`); null si no hay neurona. */
  orden: OrdenTaller | null;
  /** Por qué sí o no puede viajar hoy por el canal que ya existe. */
  envio: string;
}

const SIN_CANAL =
  "El préstamo de MetaGenesis (mg_orden) aún no admite la acción «taller_3d» (lista blanca del nodo y de /api/metagenesis/orden): queda la elección hecha, sin simular el envío.";

/** Elige la neurona del encargo y deja la orden formada; no envía nada por un canal que no la acepta. */
export function repartirEncargo(encargo: EncargoTaller, neuronas: readonly NeuronaTaller[]): EntregaTaller {
  const eleccion = elegirNeurona(encargo, neuronas);
  return { eleccion, orden: eleccion.orden, envio: SIN_CANAL };
}
