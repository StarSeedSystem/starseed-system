import { useCallback, useEffect, useRef, useState } from 'react';

export type ModoDisposicion = 'fuerza' | 'radial' | 'espiral' | 'planos';

export interface PeticionDisposicion {
  modo: ModoDisposicion;
  n?: number;
  aristas?: Array<{ de: number; a: number; intensidad: number }>;
  padres?: number[];
  tiempos?: number[];
  capas?: (string | number)[];
  opciones?: Record<string, unknown>;
}

export interface ResultadoDisposicion {
  posiciones: Float32Array;
  ms: number;
  desdeWorker: boolean;
}

interface EstadoHook {
  calcular: (peticion: PeticionDisposicion) => Promise<ResultadoDisposicion>;
  listo: boolean;
  error: Error | null;
}

const WORKER_URL = new URL('./disposicion.worker.ts', import.meta.url).href;

function crearWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  try {
    return new Worker(WORKER_URL, { type: 'module' });
  } catch {
    return null;
  }
}

async function calcularEnHiloPrincipal(peticion: PeticionDisposicion): Promise<Float32Array> {
  const { calcularPeticion } = await import('./disposicion.worker');
  return calcularPeticion(peticion as any);
}

export function useDisposicion(): EstadoHook {
  const workerRef = useRef<Worker | null>(null);
  const pendientesRef = useRef<
    Map<number, { resolve: (v: ResultadoDisposicion) => void; reject: (e: Error) => void }>
  >(new Map());
  const idRef = useRef(0);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const worker = crearWorker();
    workerRef.current = worker;

    if (worker) {
      worker.onmessage = (evento: MessageEvent) => {
        const datos = evento.data;
        if (!datos || !datos.tipo) return;
        const pendiente = pendientesRef.current.get(datos.id);
        if (!pendiente) return;
        pendientesRef.current.delete(datos.id);
        if (datos.tipo === 'resultado') {
          pendiente.resolve({
            posiciones: datos.posiciones,
            ms: datos.ms,
            desdeWorker: true,
          });
        } else {
          pendiente.reject(new Error(datos.mensaje));
        }
      };
      worker.onerror = (e) => {
        setError(new Error(`Worker error: ${e.message}`));
        for (const [, pendiente] of pendientesRef.current) {
          pendiente.reject(new Error('Worker falló'));
        }
        pendientesRef.current.clear();
      };
      setListo(true);
    } else {
      setListo(true);
    }

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const calcular = useCallback(
    async (peticion: PeticionDisposicion): Promise<ResultadoDisposicion> => {
      const worker = workerRef.current;
      if (worker) {
        const id = ++idRef.current;
        return new Promise((resolve, reject) => {
          pendientesRef.current.set(id, { resolve, reject });
          worker.postMessage({ tipo: 'calcular', id, peticion });
        });
      }
      const inicio = performance.now();
      try {
        const posiciones = await calcularEnHiloPrincipal(peticion);
        return { posiciones, ms: performance.now() - inicio, desdeWorker: false };
      } catch (e) {
        throw e instanceof Error ? e : new Error('Error al calcular la disposición');
      }
    },
    [],
  );

  return { calcular, listo, error };
}