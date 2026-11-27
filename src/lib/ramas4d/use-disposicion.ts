/**
 * use-disposicion — hook de React que habla con el worker de disposición (MV1125C · parte 2 de 2).
 * ─────────────────────────────────────────────────────────────────────────────
 * El worker corre fuera del hilo principal y devuelve Float32Array de posiciones.
 * Si no hay Worker disponible, cae al cálculo directo en el hilo principal.
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  disposicionRadial,
  disposicionEspiralTemporal,
  disposicionPlanosPorCapa,
  disposicionFuerza,
  type AristaDisposicion,
  type OpcionesDisposicion,
  type OpcionesRadial,
  type OpcionesEspiral,
  type OpcionesPlanos,
} from './disposicion';
import type { PeticionDisposicion } from './disposicion.worker';
import {
  tipoValido,
  construirPeticion,
  type TipoDisposicion,
  type DatosCalcular,
} from './use-disposicion-puro';
import { crearWorker, esWorkerDisponible, comunicarConWorker } from './worker-disposicion';

export type { TipoDisposicion } from './use-disposicion-puro';

export interface UsarDisposicionProps {
  tipo: TipoDisposicion;
  n?: number;
  aristas?: AristaDisposicion[];
  padres?: number[];
  tiempos?: number[];
  capas?: (string | number)[];
  opciones?: OpcionesDisposicion | OpcionesRadial | OpcionesEspiral | OpcionesPlanos;
}

export interface EstadoDisposicionHook {
  posiciones: Float32Array | null;
  cargando: boolean;
  error: string | null;
  ms: number;
  recalcular: () => void;
}

function calcularDirecto(tipo: TipoDisposicion, datos: DatosCalcular): { posiciones: Float32Array; ms: number } {
  const inicio = performance.now();
  let resultado: Float32Array;
  switch (tipo) {
    case 'fuerza':
      resultado = disposicionFuerza(datos.n ?? 0, datos.aristas ?? [], datos.opciones as OpcionesDisposicion | undefined);
      break;
    case 'radial':
      resultado = disposicionRadial(datos.padres ?? [], datos.opciones as OpcionesRadial | undefined);
      break;
    case 'espiral':
      resultado = disposicionEspiralTemporal(datos.tiempos ?? [], datos.opciones as OpcionesEspiral | undefined);
      break;
    case 'planos':
      resultado = disposicionPlanosPorCapa(datos.capas ?? [], datos.opciones as OpcionesPlanos | undefined);
      break;
  }
  return { posiciones: resultado, ms: performance.now() - inicio };
}

export function useDisposicion(props: UsarDisposicionProps): EstadoDisposicionHook {
  const { tipo, n, aristas, padres, tiempos, capas, opciones } = props;
  const [posiciones, setPosiciones] = useState<Float32Array | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ms, setMs] = useState(0);
  const mounted = useRef(true);
  const workerRef = useRef<Worker | null>(null);

  const datosCalcular = useMemo<DatosCalcular>(() => ({ tipo, n, aristas, padres, tiempos, capas, opciones }), [tipo, n, aristas, padres, tiempos, capas, opciones]);
  const peticion = useMemo<PeticionDisposicion | undefined>(() => tipoValido(tipo) ? construirPeticion(tipo, datosCalcular as any) as PeticionDisposicion : undefined, [tipo, datosCalcular]);

  const calcular = useCallback(async () => {
    if (!peticion) { setCargando(false); setError('Falta configuración de disposición'); return; }
    try {
      const disponible = esWorkerDisponible();
      const resultado = disponible && workerRef.current
        ? await comunicarConWorker(workerRef.current, peticion)
        : calcularDirecto(tipo, datosCalcular);
      if (mounted.current) { setPosiciones(resultado.posiciones); setMs(resultado.ms); setError(null); }
    } catch (e) {
      if (mounted.current) { setError(e instanceof Error ? e.message : 'Error desconocido'); setPosiciones(null); }
    } finally {
      if (mounted.current) setCargando(false);
    }
  }, [peticion, tipo, datosCalcular]);

  useEffect(() => {
    mounted.current = true;
    setCargando(true);
    if (esWorkerDisponible()) workerRef.current = crearWorker();
    calcular();
    return () => {
      mounted.current = false;
      if (workerRef.current) {
        try { workerRef.current.terminate(); } catch { /* noop */ }
        workerRef.current = null;
      }
    };
  }, [calcular]);

  const recalcular = useCallback(() => { setCargando(true); setError(null); calcular(); }, [calcular]);

  return { posiciones, cargando, error, ms, recalcular };
}