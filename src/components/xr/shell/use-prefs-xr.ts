'use client';

import { useState, useEffect, useCallback } from "react";
import { 
  leerConfort, guardarConfort,
  leerCalidad, guardarCalidad,
  leerVinculos, guardarVinculos,
  leerModo, guardarModo,
  sistemaDelNavegador
} from "./prefs-xr";
import { sanearConfort } from "../../../lib/xr/confort";
import type { PreferenciasConfort } from "../../../lib/xr/confort";
import type { NivelCalidad, ModoXR, EntradaXR } from "../../../lib/xr/tipos";
import type { MapaEntrada } from "../../../lib/xr/vinculos-xr";

export function usePrefsXR() {
  const [confort, setConfortState] = useState<PreferenciasConfort>(() => {
    const { confort: c } = leerConfort();
    return c;
  });
  const [calidad, setCalidadState] = useState<{ modo: "auto" | NivelCalidad }>(() => {
    return leerCalidad();
  });
  const [vinculos, setVinculosState] = useState<Partial<Record<EntradaXR, MapaEntrada>>>(() => {
    return leerVinculos();
  });
  const [modo, setModoState] = useState<ModoXR | undefined>(() => {
    return leerModo();
  });
  const [avisos, setAvisosState] = useState<string[]>(() => {
    const { avisos } = leerConfort();
    return avisos;
  });

  // Sincronizar con el evento storage de otras pestañas
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "starseed.xr.confort.v1") {
        const { confort: c, avisos: a } = leerConfort();
        setConfortState(c);
        setAvisosState(a);
      } else if (e.key === "starseed.xr.calidad.v1") {
        setCalidadState(leerCalidad());
      } else if (e.key === "starseed.xr.vinculos.v1") {
        setVinculosState(leerVinculos());
      } else if (e.key === "starseed.xr.modo.v1") {
        setModoState(leerModo());
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  // Setters que actualizan estado y almacenamiento
  const setConfort = useCallback((nuevoConfort: PreferenciasConfort) => {
    guardarConfort(nuevoConfort);
    setConfortState(nuevoConfort);
    // Actualizar avisos basada en el nuevo confort y el sistema
    const sistema = sistemaDelNavegador();
    const { avisos } = sanearConfort(nuevoConfort, sistema); // Nota: necesitamos importar sanearConfort
    setAvisosState(avisos);
  }, []);

  const setCalidad = useCallback((nuevaCalidad: { modo: "auto" | NivelCalidad }) => {
    guardarCalidad(nuevaCalidad);
    setCalidadState(nuevaCalidad);
  }, []);

  const setVinculo = useCallback((nuevosVinculos: Partial<Record<EntradaXR, MapaEntrada>>) => {
    guardarVinculos(nuevosVinculos);
    setVinculosState(nuevosVinculos);
  }, []);

  const setModo = useCallback((nuevoModo: ModoXR) => {
    guardarModo(nuevoModo);
    setModoState(nuevoModo);
  }, []);

  return {
    confort,
    calidad,
    vinculos,
    modo,
    avisos,
    setConfort,
    setCalidad,
    setVinculo,
    setModo
  };
}