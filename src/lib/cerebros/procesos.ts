// Procesos activos del cerebro: normalización de datos de múltiples fuentes a ProcesoActivo[].
// Módulo puro, sin disco ni red. Contrato: architecture/cerebros-fusion-telepatia.md Section 7.

import {
  type ProcesoActivo,
  type TipoProceso,
  type EstadoProceso,
  type TipoServidor,
  type HardwareServidor,
  fromAgentesMac,
  fromLatidos,
  fromNodos,
  fromPoligenesis,
  fromSuenos,
  fromImaginacion,
  fromInstalaciones,
  fromActualizaciones,
  fromVentanas,
  fromPresencia,
  unirProcesos,
  agruparPorTipo,
} from "./procesos-normalizar";

export type { TipoProceso, EstadoProceso, TipoServidor };
export { ProcesoActivo };
export type { HardwareServidor };
export { fromAgentesMac, fromLatidos, fromNodos, fromPoligenesis, fromSuenos, fromImaginacion, fromInstalaciones, fromActualizaciones, fromVentanas, fromPresencia, unirProcesos, agruparPorTipo };

import { leerEstadoAutonomo } from "@/lib/metagenesis/remoto-nodos-cliente";

/**
 * Lee procesos activos de todas las fuentes y los combina en una única lista.
 * 
 * Esta es la función principal que implementa Section 7 de architecture/cerebros-fusion-telepatia.md.
 * Combina datos de:
 * - desdeAgentesMac (/api/mando/agentes)
 * - desdeLatidos (/api/mando/medidores)
 * - desdeNodos (leerEstadoAutonomo)
 * - desdePoligenesis (leerHistorial)
 * - desdeSuenos (/api/mando/suenos)
 * - desdeImaginacion (fetchAstraura158ImaginationStatus)
 * - desdeInstalaciones (leerInstalaciones)
 * - desdeActualizaciones (leerActualizaciones)
 * - desdeVentanas (readDesktopsSnapshot)
 * - desdePresencia (usePresenciaNeuronas)
 */
export async function leerProcesosActivos(): Promise<ProcesoActivo[]> {
  const ahora = Date.now();

  // 1. Procesos de agentes (desdeAgentesMac)
  let desdeAgentesMac: ProcesoActivo[] = [];
  try {
    const r = await fetch("/api/mando/agentes", { cache: "no-store" });
    desdeAgentesMac = fromAgentesMac(await r.json().catch(() => null));
  } catch {
    desdeAgentesMac = [];
  }

  // 2. Procesos de latidos (desdeLatidos)
  let desdeLatidos: ProcesoActivo[] = [];
  try {
    const r = await fetch("/api/mando/medidores", { cache: "no-store" });
    const datos = await r.json().catch(() => null);
    desdeLatidos = fromLatidos(datos?.latidos);
  } catch {
    desdeLatidos = [];
  }

  // 3. Procesos de nodos (desdeNodos)
  let desdeNodos: ProcesoActivo[] = [];
  try {
    const estado = await leerEstadoAutonomo(ahora).catch(() => null);
    if (estado?.ok) {
      desdeNodos = fromNodos(estado.estado.nodos);
    }
  } catch {
    desdeNodos = [];
  }

  // 4. Procesos de poligenesis (desdePoligenesis)
  let desdePoligenesis: ProcesoActivo[] = [];
  try {
    const historial = await (await import("@/lib/genesis/historial"))?.leerHistorial?.("origenes")?.catch(() => null);
    desdePoligenesis = fromPoligenesis({ historial: { operaciones: historial?.entradas?.filter(e => e.tipo === "propuesta") } });
  } catch {
    desdePoligenesis = [];
  }

  // 5. Procesos de sueños (desdeSuenos)
  let desdeSuenos: ProcesoActivo[] = [];
  try {
    const r = await fetch("/api/mando/suenos", { cache: "no-store" });
    desdeSuenos = fromSuenos(await r.json().catch(() => null));
  } catch {
    desdeSuenos = [];
  }

  // 6. Procesos de imaginacion (desdeImaginacion)
  let desdeImaginacion: ProcesoActivo[] = [];
  try {
    const imaginacion = await (await import("@/lib/mando/suenos"))?.fetchAstraura158ImaginationStatus?.().catch(() => null);
    desdeImaginacion = fromImaginacion({ imaginacion });
  } catch {
    desdeImaginacion = [];
  }

  // 7. Procesos de instalaciones (desdeInstalaciones)
  let desdeInstalaciones: ProcesoActivo[] = [];
  try {
    const instalaciones = await (await import("@/lib/mando/sincronizar"))?.leerInstalaciones?.().catch(() => null);
    desdeInstalaciones = fromInstalaciones({ instalaciones });
  } catch {
    desdeInstalaciones = [];
  }

  // 8. Procesos de actualizaciones (desdeActualizaciones)
  let desdeActualizaciones: ProcesoActivo[] = [];
  try {
    const actualizaciones = await (await import("@/lib/mando/actualizaciones"))?.leerActualizaciones?.().catch(() => null);
    desdeActualizaciones = fromActualizaciones({ actualizaciones });
  } catch {
    desdeActualizaciones = [];
  }

  // 9. Procesos de ventanas (desdeVentanas)
  let desdeVentanas: ProcesoActivo[] = [];
  try {
    const ventanas = await (await import("@/lib/desktop"))?.readDesktopsSnapshot?.().catch(() => null);
    desdeVentanas = fromVentanas({ ventanas });
  } catch {
    desdeVentanas = [];
  }

  // 10. Procesos de presencia (desdePresencia)
  let desdePresencia: ProcesoActivo[] = [];
  try {
    const presencia = await (await import("@/lib/neurons"))?.usePresenciaNeuronas?.().catch(() => null);
    desdePresencia = fromPresencia({ presencia });
  } catch {
    desdePresencia = [];
  }

  // Combinar todos los procesos
  const todos = unirProcesos(
    desdeAgentesMac,
    desdeLatidos,
    desdeNodos,
    desdePoligenesis,
    desdeSuenos,
    desdeImaginacion,
    desdeInstalaciones,
    desdeActualizaciones,
    desdeVentanas,
    desdePresencia,
  );

  return todos;
}