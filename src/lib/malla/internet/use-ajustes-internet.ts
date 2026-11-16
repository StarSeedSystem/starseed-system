"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { leerAjustes, guardarAjustes, type AlmacenAjustes } from "./almacen-ajustes";
import { leerContadores, type AlmacenContadores } from "./almacen-contadores";
import { contadoresVacios } from "./contadores";
import type { AjustesInternet, Contadores, DeepPartial, Audiencia } from "./tipos";
import type { PuertaInternet } from "../cristal/puertas-internet";
import { decidirCompartir } from "./decision-compartir";

const CLAVE_AJUSTES = "starseed.malla.internet.v1";

export { AJUSTES_APAGADOS } from "./almacen-ajustes";

export interface OpcionesUseAjustesInternet {
  almacen?: AlmacenAjustes & AlmacenContadores;
  ahora?: () => number;
  desfaseMin?: number;
}

export interface ResultadoUseAjustesInternet {
  ajustes: AjustesInternet;
  contadores: Contadores;
  cambiar: (parcial: DeepPartial<AjustesInternet>) => void;
  decidir: (audiencia: Audiencia, puerta: PuertaInternet) => ReturnType<typeof decidirCompartir>;
  restanteHoyMb: number | null;
}

function esCliente(): boolean {
  return typeof window !== "undefined";
}

export function useAjustesInternet(opciones: OpcionesUseAjustesInternet = {}): ResultadoUseAjustesInternet {
  const {
    almacen: almacenExterno,
    ahora: ahoraFn,
    desfaseMin: desfaseMinPropio = -new Date().getTimezoneOffset(),
  } = opciones;

  const almacenRef = useRef<AlmacenAjustes & AlmacenContadores>(
    almacenExterno ?? (
      typeof window !== "undefined" ? localStorage : {
        getItem: () => null,
        setItem: () => {},
      }
    )
  );

  const ahora = ahoraFn ?? (() => Date.now());
  const desfaseMin = desfaseMinPropio;

  const [ajustes, setAjustes] = useState<AjustesInternet>(AJUSTES_APAGADOS);
  const [contadores, setContadores] = useState<Contadores>(() => contadoresVacios(ahora(), desfaseMin));

  useEffect(() => {
    if (!esCliente()) return;

    const ahoraActual = ahora();
    setAjustes(leerAjustes(almacenRef.current, AJUSTES_APAGADOS));
    setContadores(leerContadores(almacenRef.current, ahoraActual, desfaseMin));
  }, []);

  useEffect(() => {
    if (!esCliente()) return;

    const manejadorStorage = (evento: StorageEvent) => {
      if (evento.key !== CLAVE_AJUSTES) return;

      const ahoraActual = ahora();
      setAjustes(leerAjustes(almacenRef.current, AJUSTES_APAGADOS));
      setContadores(leerContadores(almacenRef.current, ahoraActual, desfaseMin));
    };

    window.addEventListener("storage", manejadorStorage);
    return () => {
      window.removeEventListener("storage", manejadorStorage);
    };
  }, [ahora, desfaseMin]);

  const cambiar = useCallback((parcial: DeepPartial<AjustesInternet>) => {
    setAjustes(prev => {
      const nuevos = { ...prev, ...parcial } as AjustesInternet;
      guardarAjustes(almacenRef.current, nuevos);

      const ahoraActual = ahora();
      const contadoresActualizados = leerContadores(almacenRef.current, ahoraActual, desfaseMin);
      setContadores(contadoresActualizados);

      return nuevos;
    });
  }, [ahora, desfaseMin]);

  const restanteHoyMb = (() => {
    if (!ajustes.banco.activo) return null;
    const usadoEnMb = contadores.bytesDia["mi-cuenta"] / 1_000_000;
    const restante = Math.max(0, ajustes.banco.diarioMb - usadoEnMb);
    return restante;
  })();

  const decidir = useCallback(
    (audiencia: Audiencia, puerta: PuertaInternet) => {
      return decidirCompartir({
        audiencia,
        ajustes,
        contadores,
        puerta,
        ahora: ahora(),
        desfaseMin,
      });
    },
    [ajustes, contadores, ahora, desfaseMin]
  );

  return {
    ajustes,
    contadores,
    cambiar,
    decidir,
    restanteHoyMb,
  };
}