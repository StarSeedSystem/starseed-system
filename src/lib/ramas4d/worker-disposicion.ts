/**
 * worker-disposicion.ts — administración del worker para disposición 4D (MV1125C · parte 2 de 2).
 * ─────────────────────────────────────────────────────────────────────────────
 * Módulo para crear, comunicarse y destruir worker de disposición.
 */

import type { MensajeSalida, PeticionDisposicion } from './disposicion.worker';

export function crearWorker(): Worker | null {
  try {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') return null;
    return new Worker(new URL('./disposicion.worker.ts', import.meta.url), { type: 'module' });
  } catch { return null; }
}

export function esWorkerDisponible(): boolean {
  try { return typeof Worker !== 'undefined'; } catch { return false; }
}

export function comunicarConWorker(
  worker: Worker,
  peticion: PeticionDisposicion,
  timeoutMs = 10000
): Promise<{ posiciones: Float32Array; ms: number }> {
  return new Promise((resolve, reject) => {
    const idActual = Date.now();
    const timeout = setTimeout(() => {
      reject(new Error('Timeout al calcular la disposición'));
    }, timeoutMs);
    const handler = (event: MessageEvent<MensajeSalida>) => {
      const msg = event.data;
      if (msg.id !== idActual) return;
      clearTimeout(timeout);
      worker.removeEventListener('message', handler);
      if (msg.tipo === 'error') reject(new Error(msg.mensaje));
      else resolve({ posiciones: msg.posiciones, ms: msg.ms });
    };
    worker.addEventListener('message', handler);
    try {
      worker.postMessage({ tipo: 'calcular', id: idActual, peticion });
    } catch {
      clearTimeout(timeout);
      worker.removeEventListener('message', handler);
      reject(new Error('Error al enviar mensaje al worker'));
    }
  });
}