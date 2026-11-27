/**
 * disposicion.worker — la física de Ramas 4D fuera del hilo principal (MV1125C · parte 1).
 * ─────────────────────────────────────────────────────────────────────────────
 * La escena nunca se bloquea: el worker recibe una petición, calcula con los módulos
 * puros (`disposicion.ts` y `octree.ts`) y devuelve un `Float32Array` de posiciones
 * x,y,z intercaladas. Importar este archivo fuera de un worker no arranca nada.
 */

import {
  disposicionEspiralTemporal,
  disposicionFuerza,
  disposicionPlanosPorCapa,
  disposicionRadial,
  type AristaDisposicion,
  type OpcionesDisposicion,
  type OpcionesEspiral,
  type OpcionesPlanos,
  type OpcionesRadial,
} from './disposicion';

export type PeticionDisposicion =
  | { modo: 'fuerza'; n: number; aristas: AristaDisposicion[]; opciones?: OpcionesDisposicion }
  | { modo: 'radial'; padres: number[]; opciones?: OpcionesRadial }
  | { modo: 'espiral'; tiempos: number[]; opciones?: OpcionesEspiral }
  | { modo: 'planos'; capas: (string | number)[]; opciones?: OpcionesPlanos };

export type MensajeEntrada = { tipo: 'calcular'; id: number; peticion: PeticionDisposicion };

export type MensajeSalida =
  | { tipo: 'resultado'; id: number; posiciones: Float32Array; ms: number }
  | { tipo: 'error'; id: number; mensaje: string };

function ahora(): number {
  try {
    return performance.now();
  } catch {
    return Date.now();
  }
}

/** Calcula la disposición pedida. Función pura: útil también sin Worker. */
export function calcularPeticion(peticion: PeticionDisposicion): Float32Array {
  switch (peticion.modo) {
    case 'fuerza':
      return disposicionFuerza(peticion.n, peticion.aristas, peticion.opciones);
    case 'radial':
      return disposicionRadial(peticion.padres, peticion.opciones);
    case 'espiral':
      return disposicionEspiralTemporal(peticion.tiempos, peticion.opciones);
    case 'planos':
      return disposicionPlanosPorCapa(peticion.capas, peticion.opciones);
  }
}

interface AlcanceDeWorker {
  addEventListener?: (
    tipo: 'message',
    oyente: (evento: MessageEvent<MensajeEntrada>) => void,
  ) => void;
  postMessage?: (mensaje: MensajeSalida, transferencia?: Transferable[]) => void;
}

const alcance = globalThis as unknown as AlcanceDeWorker;

function responder(evento: MessageEvent<MensajeEntrada>): void {
  const datos = evento.data;
  if (!datos || datos.tipo !== 'calcular') return;
  const inicio = ahora();
  try {
    const posiciones = calcularPeticion(datos.peticion);
    alcance.postMessage?.(
      { tipo: 'resultado', id: datos.id, posiciones, ms: ahora() - inicio },
      [posiciones.buffer as ArrayBuffer],
    );
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : 'Error al calcular la disposición';
    alcance.postMessage?.({ tipo: 'error', id: datos.id, mensaje });
  }
}

if (typeof alcance.addEventListener === 'function' && typeof alcance.postMessage === 'function') {
  alcance.addEventListener('message', responder);
}
