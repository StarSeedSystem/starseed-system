"use client";

/**
 * useMarcasGeo — reúne las fuentes en vivo de MI cuenta y devuelve las marcas del Mapa (MAP1114B).
 * Solo lectura: filas de la malla, presencia en vivo, antenas medidas de este medio, capas anunciadas
 * y la posición/preferencia guardadas en ESTE aparato. Nada se inventa.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMallaNeuronasEstado } from "@/lib/network/malla-neuronas";
import { usePresenciaNeuronas } from "@/lib/neurons/presencia";
import { medirSenales, type SenalesMedio } from "@/lib/neurons/senales-medio";
import { construirMarcas, type MarcaGeo } from "@/lib/senales/geo/marcas";
import {
  EVENTO_POSICION, leerPosicionCruda, leerPreferenciaPosicion, refrescarSiConcedido,
} from "@/lib/senales/geo/almacen-posicion";
import { PREFERENCIA_POSICION_DEFECTO, type PosicionCruda, type PreferenciaPosicion } from "@/lib/senales/geo/modelo-geo";
import { useAhora } from "../use-mapa-vivo";

export interface MarcasGeo {
  marcas: MarcaGeo[];
  pref: PreferenciaPosicion;
  cruda: PosicionCruda | null;
  /** La presencia en vivo está suscrita (la lista de medios es de verdad en vivo). */
  presenciaConectada: boolean;
  ahora: number;
}

export function useMarcasGeo(): MarcasGeo {
  const malla = useMallaNeuronasEstado();
  const presencia = usePresenciaNeuronas();
  const ahora = useAhora();
  const [senales, setSenales] = useState<SenalesMedio | null>(null);
  const [capas, setCapas] = useState<string[] | null>(null);
  const [cruda, setCruda] = useState<PosicionCruda | null>(null);
  const [pref, setPref] = useState<PreferenciaPosicion>(PREFERENCIA_POSICION_DEFECTO);

  const leerLocal = useCallback(() => {
    setCruda(leerPosicionCruda());
    setPref(leerPreferenciaPosicion());
  }, []);
  useEffect(() => {
    leerLocal();
    window.addEventListener(EVENTO_POSICION, leerLocal);
    void refrescarSiConcedido();
    return () => window.removeEventListener(EVENTO_POSICION, leerLocal);
  }, [leerLocal]);

  useEffect(() => {
    let vivo = true;
    const medir = () => {
      void medirSenales().then((s) => vivo && setSenales(s)).catch(() => vivo && setSenales(null));
      void import("@/lib/malla/anuncio-capas").then((m) => vivo && setCapas(m.misCapasAnunciadas())).catch(() => vivo && setCapas(null));
    };
    medir();
    const t = setInterval(() => { if (document.visibilityState !== "hidden") medir(); }, 30_000);
    return () => { vivo = false; clearInterval(t); };
  }, []);

  const filas = malla.misDispositivos;
  const marcas = useMemo(() => {
    const mia = filas.find((f) => f.esEsteDispositivo);
    return construirMarcas({
      filas,
      medios: presencia.medios,
      yo: { neuronaId: mia?.neuronId ?? null, nombre: mia?.nombre ?? "Este aparato", plataforma: mia?.plataforma, senales, capas, posicion: cruda, pref },
      ahora,
    });
  }, [filas, presencia.medios, senales, capas, cruda, pref, ahora]);

  return { marcas, pref, cruda, presenciaConectada: presencia.conectado, ahora };
}
