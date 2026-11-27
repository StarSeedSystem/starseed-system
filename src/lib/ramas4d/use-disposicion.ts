import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AristaDisposicion,
  OpcionesDisposicion,
  OpcionesEspiral,
  OpcionesPlanos,
  OpcionesRadial,
} from './disposicion';
import { calcularPeticion, type PeticionDisposicion } from './disposicion.worker';

export type TipoDisposicion = 'fuerza' | 'radial' | 'espiral' | 'planos';

export interface EstadoDisposicionHook {
  posiciones: Float32Array | null;
  calculando: boolean;
  error: string | null;
  calcular: (peticion: PeticionDisposicion) => Promise<void>;
}

export function tipoDisposicionValido(tipo: string): tipo is TipoDisposicion {
  return tipo === 'fuerza' || tipo === 'radial' || tipo === 'espiral' || tipo === 'planos';
}

export async function calcularEnHiloPrincipal(peticion: PeticionDisposicion): Promise<Float32Array> {
  return calcularPeticion(peticion);
}

let workerInstance: Worker | null = null;
const callbacks = new Map<number, (posiciones: Float32Array) => void>();
const errores = new Map<number, (mensaje: string) => void>();
let idContador = 0;

function obtenerWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  if (workerInstance) return workerInstance;
  try {
    workerInstance = new Worker(new URL('./disposicion.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerInstance.onmessage = (evento: MessageEvent) => {
      const datos = evento.data;
      if (datos.tipo === 'resultado') {
        const cb = callbacks.get(datos.id);
        if (cb) {
          cb(datos.posiciones);
          callbacks.delete(datos.id);
          errores.delete(datos.id);
        }
      } else if (datos.tipo === 'error') {
        const err = errores.get(datos.id);
        if (err) {
          err(datos.mensaje);
          callbacks.delete(datos.id);
          errores.delete(datos.id);
        }
      }
    };
    workerInstance.onerror = () => {
      workerInstance = null;
    };
    return workerInstance;
  } catch {
    return null;
  }
}

export async function calcularDisposicion(peticion: PeticionDisposicion): Promise<Float32Array> {
  const worker = obtenerWorker();
  if (worker) {
    return new Promise((resolve, reject) => {
      const id = ++idContador;
      callbacks.set(id, resolve);
      errores.set(id, reject);
      worker.postMessage({ tipo: 'calcular', id, peticion });
    });
  }
  return calcularEnHiloPrincipal(peticion);
}

export function useDisposicion(): EstadoDisposicionHook {
  const [posiciones, setPosiciones] = useState<Float32Array | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  const calcular = useCallback(async (peticion: PeticionDisposicion) => {
    setCalculando(true);
    setError(null);
    try {
      const resultado = await calcularDisposicion(peticion);
      if (montado.current) {
        setPosiciones(resultado);
      }
    } catch (err) {
      if (montado.current) {
        setError(err instanceof Error ? err.message : 'Error al calcular la disposición');
      }
    } finally {
      if (montado.current) {
        setCalculando(false);
      }
    }
  }, []);

  return { posiciones, calculando, error, calcular };
}