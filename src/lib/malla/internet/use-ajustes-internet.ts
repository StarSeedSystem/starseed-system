"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { leerAjustes, guardarAjustes, type AlmacenAjustes } from "./almacen-ajustes";
import { leerContadores, type AlmacenContadores } from "./almacen-contadores";
import { contadoresVacios } from "./contadores";
import type { AjustesInternet, DeepPartial, Audiencia } from "./tipos";
import type { Contadores } from "./contadores";
import type { PuertaInternet } from "../cristal/puertas-internet";
import { decidirCompartir } from "./decision-compartir";

const CLAVE_AJUSTES = "starseed.malla.internet.v1";
const EVENTO_AJUSTES = "starseed:malla:internet:ajustes";

import { AJUSTES_APAGADOS } from "./almacen-ajustes";

export { AJUSTES_APAGADOS };

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
  const ajustesRef = useRef(ajustes);

  useEffect(() => {
    if (!esCliente()) return;

    const ahoraActual = ahora();
    const leidos = leerAjustes(almacenRef.current, AJUSTES_APAGADOS);
    ajustesRef.current = leidos;
    setAjustes(leidos);
    setContadores(leerContadores(almacenRef.current, ahoraActual, desfaseMin));
  }, []);

  useEffect(() => {
    if (!esCliente()) return;

    const recargar = () => {
      const ahoraActual = ahora();
      const leidos = leerAjustes(almacenRef.current, AJUSTES_APAGADOS);
      ajustesRef.current = leidos;
      setAjustes(leidos);
      setContadores(leerContadores(almacenRef.current, ahoraActual, desfaseMin));
    };

    const manejadorStorage = (evento: StorageEvent) => {
      if (evento.key !== CLAVE_AJUSTES) return;
      recargar();
    };

    window.addEventListener("storage", manejadorStorage);
    window.addEventListener(EVENTO_AJUSTES, recargar);
    return () => {
      window.removeEventListener("storage", manejadorStorage);
      window.removeEventListener(EVENTO_AJUSTES, recargar);
    };
  }, [ahora, desfaseMin]);

  const cambiar = useCallback((parcial: DeepPartial<AjustesInternet>) => {
    const nuevos = { ...ajustesRef.current, ...parcial } as AjustesInternet;
    ajustesRef.current = nuevos;
    guardarAjustes(almacenRef.current, nuevos);

    const ahoraActual = ahora();
    setAjustes(nuevos);
    setContadores(leerContadores(almacenRef.current, ahoraActual, desfaseMin));

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(EVENTO_AJUSTES));
    }
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