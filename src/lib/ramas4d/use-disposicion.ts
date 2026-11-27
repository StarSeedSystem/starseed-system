'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  PeticionDisposicion,
  MensajeEntrada,
  MensajeSalida,
} from './disposicion.worker';
import { calcularPeticion } from './disposicion.worker';

export type ModoDisposicion = PeticionDisposicion['modo'];

export interface UseDisposicionOpciones {
  /** Si está activo, recalcula al cambiar la petición. */
  auto?: boolean;
  /** Tiempo máximo de espera al worker antes de caer al hilo principal (ms). */
  timeoutWorker?: number;
}

export interface UseDisposicionResultado {
  /** Posiciones calculadas (x, y, z intercaladas). */
  posiciones: Float32Array | null;
  /** true mientras se calcula. */
  calculando: boolean;
  /** Error si falló tanto el worker como el fallback. */
  error: string | null;
  /** Dispara un cálculo con la petición dada. */
  calcular: (peticion: PeticionDisposicion) => Promise<Float32Array>;
  /** Cancela el cálculo en curso. */
  cancelar: () => void;
  /** Indica si se está usando el worker (true) o el hilo principal (false). */
  usaWorker: boolean;
}

let idGlobal = 0;

function crearId(): number {
  return ++idGlobal;
}

function workerDisponible(): boolean {
  return typeof Worker !== 'undefined';
}

function crearWorker(): Worker | null {
  if (!workerDisponible()) return null;
  try {
    const w = new Worker(
      new URL('./disposicion.worker.ts', import.meta.url),
      { type: 'module' },
    );
    return w;
  } catch {
    return null;
  }
}

export function useDisposicion(
  opciones: UseDisposicionOpciones = {},
): UseDisposicionResultado {
  const { auto = false, timeoutWorker = 5000 } = opciones;
  const workerRef = useRef<Worker | null>(null);
  const pendientesRef = useRef<Map<number, { resolve: (v: Float32Array) => void; reject: (e: Error) => void }>>(new Map());
  const timeoutRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const [posiciones, setPosiciones] = useState<Float32Array | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usaWorker, setUsaWorker] = useState(false);
  const peticionActualRef = useRef<PeticionDisposicion | null>(null);

  useEffect(() => {
    if (workerDisponible()) {
      const w = crearWorker();
      if (w) {
        workerRef.current = w;
        setUsaWorker(true);
        w.addEventListener('message', (evento: MessageEvent<MensajeSalida>) => {
          const datos = evento.data;
          if (!datos) return;
          const pendiente = pendientesRef.current.get(datos.id);
          if (!pendiente) return;
          clearTimeout(timeoutRef.current.get(datos.id));
          timeoutRef.current.delete(datos.id);
          pendientesRef.current.delete(datos.id);
          if (datos.tipo === 'resultado') {
            pendiente.resolve(datos.posiciones);
          } else {
            pendiente.reject(new Error(datos.mensaje));
          }
        });
      }
    }
    return () => {
      workerRef.current?.terminate();
      for (const t of timeoutRef.current.values()) clearTimeout(t);
      timeoutRef.current.clear();
      for (const [, p] of pendientesRef.current) {
        p.reject(new Error('Componente desmontado'));
      }
      pendientesRef.current.clear();
    };
  }, []);

  const calcular = useCallback(
    async (peticion: PeticionDisposicion): Promise<Float32Array> => {
      setError(null);
      if (auto) peticionActualRef.current = peticion;
      setCalculando(true);

      const id = crearId();
      const mensaje: MensajeEntrada = { tipo: 'calcular', id, peticion };

      if (workerRef.current && usaWorker) {
        try {
          const resultado = await new Promise<Float32Array>((resolve, reject) => {
            pendientesRef.current.set(id, { resolve, reject });
            const t = setTimeout(() => {
              pendientesRef.current.delete(id);
              reject(new Error('Timeout del worker'));
            }, timeoutWorker);
            timeoutRef.current.set(id, t);
            workerRef.current!.postMessage(mensaje);
          });
          setPosiciones(resultado);
          setCalculando(false);
          return resultado;
        } catch (errWorker) {
          const msg = errWorker instanceof Error ? errWorker.message : 'Error en worker';
          console.warn('[useDisposicion] Worker falló, fallback a hilo principal:', msg);
          setUsaWorker(false);
          workerRef.current?.terminate();
          workerRef.current = null;
        }
      }

      try {
        const resultado = calcularPeticion(peticion);
        setPosiciones(resultado);
        setCalculando(false);
        return resultado;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error al calcular la disposición';
        setError(msg);
        setCalculando(false);
        throw new Error(msg);
      }
    },
    [auto, timeoutWorker, usaWorker],
  );

  const cancelar = useCallback(() => {
    for (const t of timeoutRef.current.values()) clearTimeout(t);
    timeoutRef.current.clear();
    for (const [, p] of pendientesRef.current) {
      p.reject(new Error('Cancelado'));
    }
    pendientesRef.current.clear();
    setCalculando(false);
  }, []);

  useEffect(() => {
    if (auto && peticionActualRef.current) {
      calcular(peticionActualRef.current).catch(() => {});
    }
  }, [auto, calcular]);

  return { posiciones, calculando, error, calcular, cancelar, usaWorker };
}

export function useDisposicionFuerza(
  n: number,
  aristas: Array<{ de: number; a: number; intensidad: number }>,
  opciones?: import('./disposicion').OpcionesDisposicion,
  auto = false,
) {
  return useDisposicion({ auto });
}

export function useDisposicionRadial(
  padres: number[],
  opciones?: import('./disposicion').OpcionesRadial,
  auto = false,
) {
  return useDisposicion({ auto });
}

export function useDisposicionEspiral(
  tiempos: number[],
  opciones?: import('./disposicion').OpcionesEspiral,
  auto = false,
) {
  return useDisposicion({ auto });
}

export function useDisposicionPlanos(
  capas: (string | number)[],
  opciones?: import('./disposicion').OpcionesPlanos,
  auto = false,
) {
  return useDisposicion({ auto });
}