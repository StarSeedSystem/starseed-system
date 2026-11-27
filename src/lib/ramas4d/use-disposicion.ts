import { useCallback, useEffect, useRef, useState } from 'react';
import {
  calcularPeticion,
  type PeticionDisposicion,
  type MensajeEntrada,
  type MensajeSalida,
} from './disposicion.worker';

export type ModoDisposicion = PeticionDisposicion['modo'];

export interface UseDisposicionOpciones {
  modo: ModoDisposicion;
  /** Datos específicos del modo. */
  datos:
    | { n: number; aristas: PeticionDisposicion extends { modo: 'fuerza' } ? PeticionDisposicion['aristas'] : never; opciones?: PeticionDisposicion extends { modo: 'fuerza' } ? PeticionDisposicion['opciones'] : never }
    | { padres: number[]; opciones?: PeticionDisposicion extends { modo: 'radial' } ? PeticionDisposicion['opciones'] : never }
    | { tiempos: number[]; opciones?: PeticionDisposicion extends { modo: 'espiral' } ? PeticionDisposicion['opciones'] : never }
    | { capas: (string | number)[]; opciones?: PeticionDisposicion extends { modo: 'planos' } ? PeticionDisposicion['opciones'] : never };
  /** Si true, recalcula automáticamente cuando cambian las dependencias. */
  auto?: boolean;
  /** Usar Web Worker si está disponible (por defecto true). */
  usarWorker?: boolean;
}

export interface UseDisposicionResultado {
  /** Posiciones x,y,z intercaladas. */
  posiciones: Float32Array | null;
  /** True mientras se calcula. */
  calculando: boolean;
  /** Error si falló. */
  error: Error | null;
  /** Tiempo del último cálculo en ms. */
  ms: number | null;
  /** Lanza un cálculo manual. */
  calcular: () => Promise<void>;
}

function crearPeticion(
  modo: ModoDisposicion,
  datos: UseDisposicionOpciones['datos'],
): PeticionDisposicion {
  switch (modo) {
    case 'fuerza':
      return {
        modo: 'fuerza',
        n: (datos as any).n,
        aristas: (datos as any).aristas,
        opciones: (datos as any).opciones,
      };
    case 'radial':
      return {
        modo: 'radial',
        padres: (datos as any).padres,
        opciones: (datos as any).opciones,
      };
    case 'espiral':
      return {
        modo: 'espiral',
        tiempos: (datos as any).tiempos,
        opciones: (datos as any).opciones,
      };
    case 'planos':
      return {
        modo: 'planos',
        capas: (datos as any).capas,
        opciones: (datos as any).opciones,
      };
  }
}

function hayWorkerDisponible(): boolean {
  return typeof Worker !== 'undefined';
}

function crearWorker(): Worker | null {
  if (!hayWorkerDisponible()) return null;
  try {
    const worker = new Worker(new URL('./disposicion.worker.ts', import.meta.url), {
      type: 'module',
    });
    return worker;
  } catch {
    return null;
  }
}

export function useDisposicion(opciones: UseDisposicionOpciones): UseDisposicionResultado {
  const { modo, datos, auto = true, usarWorker = true } = opciones;

  const [posiciones, setPosiciones] = useState<Float32Array | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [ms, setMs] = useState<number | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const idRef = useRef(0);
  const resolversRef = useRef<Map<number, (value: MensajeSalida) => void>>(new Map());
  const peticionRef = useRef<PeticionDisposicion | null>(null);

  useEffect(() => {
    if (usarWorker && hayWorkerDisponible()) {
      const worker = crearWorker();
      if (worker) {
        workerRef.current = worker;
        worker.onmessage = (evento: MessageEvent<MensajeSalida>) => {
          const mensaje = evento.data;
          const resolver = resolversRef.current.get(mensaje.id);
          if (resolver) {
            resolversRef.current.delete(mensaje.id);
            resolver(mensaje);
          }
        };
      }
    }
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, [usarWorker]);

  const calcular = useCallback(async () => {
    setCalculando(true);
    setError(null);

    const peticion = crearPeticion(modo, datos);
    peticionRef.current = peticion;

    const worker = workerRef.current;

    if (worker) {
      const id = ++idRef.current;
      return new Promise<void>((resolve, reject) => {
        resolversRef.current.set(id, (mensaje) => {
          if (mensaje.tipo === 'resultado') {
            setPosiciones(mensaje.posiciones);
            setMs(mensaje.ms);
            resolve();
          } else {
            const err = new Error(mensaje.mensaje);
            setError(err);
            reject(err);
          }
          setCalculando(false);
        });
        worker.postMessage({ tipo: 'calcular', id, peticion } as MensajeEntrada);
      });
    } else {
      try {
        const inicio = performance.now();
        const resultado = calcularPeticion(peticion);
        const duracion = performance.now() - inicio;
        setPosiciones(resultado);
        setMs(duracion);
      } catch (err) {
        const mensaje = err instanceof Error ? err.message : 'Error al calcular la disposición';
        setError(new Error(mensaje));
      } finally {
        setCalculando(false);
      }
    }
  }, [modo, datos]);

  useEffect(() => {
    if (auto) {
      calcular();
    }
  }, [auto, calcular]);

  return { posiciones, calculando, error, ms, calcular };
}

export { calcularPeticion } from './disposicion.worker';