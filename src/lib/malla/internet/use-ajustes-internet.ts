"use client";

import { useState, useEffect, useCallback, useRef } from 'react';

import type { AjustesInternet, AjustesBanco } from './tipos';
import { AJUSTES_APAGADOS } from './almacen-ajustes';
import { leerContadores, type AlmacenContadores } from './almacen-contadores';
import { contadoresVacios, type Contadores, type Audiencia } from './contadores';
import { decidirCompartir } from './decision-compartir';
import { cupoBanco } from './cupo-banco';
import { getAjustesBanco, AJUSTES_BANCO_EVENT, type AjustesBanco as AjustesBancoType } from './ajustes-banco';
import type { PuertaInternet } from '../cristal/puertas-internet';

export interface UseAjustesInternetReturn {
  ajustes: AjustesInternet;
  contadores: Contadores;
  cambiar: (parcial: Partial<AjustesInternet>) => void;
  decidir: (
    audiencia: Audiencia,
    puerta: PuertaInternet,
    ahora?: number,
    desfaseMin?: number
  ) => ReturnType<typeof decidirCompartir>;
  restanteHoyMb: number | null;
}

export function useAjustesInternet(
  opciones: {
    almacen?: AlmacenAjustes;
    ahora?: () => number;
    desfaseMin?: number;
  } = {}
): UseAjustesInternetReturn {
  const { almacen, ahora = () => Date.now(), desfaseMin = 0 } = opciones;

  const ahoraRef = useRef(ahora);
  const desfaseMinRef = useRef(desfaseMin);

  const [ajustes, setAjustes] = useState<AjustesInternet>(AJUSTES_APAGADOS);
  const [contadores, setContadores] = useState<Contadores>(
    contadoresVacios(ahora(), desfaseMin)
  );

  useEffect(() => {
    ahoraRef.current = ahora();
    desfaseMinRef.current = desfaseMin;
  }, [ahora, desfaseMin]);

  const guardarAjustes = useCallback(
    (nuevoAjustes: AjustesInternet) => {
      if (!almacen) return;
      almacen.setItem('starseed.malla.internet.v1', JSON.stringify(nuevoAjustes));
    },
    [almacen]
  );

  const cambiar = useCallback(
    (parcial: Partial<AjustesInternet>) => {
      setAjustes((prev) => {
        const nuevoAjustes = { ...prev, ...parcial };

        guardarAjustes(nuevoAjustes);

        return nuevoAjustes;
      });
    },
    [guardarAjustes]
  );

  const decidir = useCallback(
    (
      audiencia: Audiencia,
      puerta: PuertaInternet,
      ahoraParam?: number,
      desfaseMinParam?: number
    ) => {
      const ahoraFinal = ahoraParam ?? ahoraRef.current;
      const desfaseFinal = desfaseMinParam ?? desfaseMinRef.current;

      const ajustesBanco = getAjustesBanco();
      const contadoresUsados = contadores;

      return decidirCompartir({
        audiencia,
        ajustes: ajustes,
        contadores: contadoresUsados,
        puerta,
        ahora: ahoraFinal,
        desfaseMin: desfaseFinal,
      });
    },
    [ajustes, contadores]
  );

  const restanteHoyMb = useCallback((): number | null => {
    const ajustesBanco = getAjustesBanco();
    const usadoHoy = contadores.bytesDia['mi-cuenta'] / 1000000;
    const ahoraFecha = new Date(ahoraRef.current);

    if (!ajustesBanco.activo) {
      return null;
    }

    const resultadoCupo = cupoBanco(ajustesBanco, usadoHoy, ahoraFecha, desfaseMinRef.current);

    return resultadoCupo.restanteMb > 0 ? resultadoCupo.restanteMb : (resultadoCupo.permitido ? resultadoCupo.restanteMb : 0);
  }, [contadores, desfaseMin]);

  useEffect(() => {
    if (!almacen) return;

    const nuevoContadores = leerContadores(almacen, ahora(), desfaseMin);
    setContadores(nuevoContadores);
  }, [almacen, ahora, desfaseMin]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<AjustesBancoType>;
      const nuevosAjustesBanco = customEvent.detail;

      setAjustes((prev) => {
        const nuevosAjustes = { ...prev, banco: nuevosAjustesBanco };

        guardarAjustes(nuevosAjustes);

        return nuevosAjustes;
      });
    };

    window.addEventListener(AJUSTES_BANCO_EVENT, handler);

    return () => {
      window.removeEventListener(AJUSTES_BANCO_EVENT, handler);
    };
  }, [guardarAjustes]);

  return {
    ajustes,
    contadores,
    cambiar,
    decidir,
    restanteHoyMb: restanteHoyMb(),
  };
}
