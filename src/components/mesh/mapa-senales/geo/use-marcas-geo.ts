"use client";

/**
 * useMarcasGeo — reúne las fuentes en vivo de MI cuenta y devuelve las marcas del Mapa (MAP1114C).
 * Solo lectura de: filas de la malla, presencia en vivo, antenas medidas de este medio, capas anunciadas, ficha de
 * este aparato y la última posición que midió este aparato. Nada se inventa.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMallaNeuronasEstado, type FichaDispositivo } from "@/lib/network/malla-neuronas";
import { usePresenciaNeuronas } from "@/lib/neurons/presencia";
import { medirSenales, type SenalesMedio } from "@/lib/neurons/senales-medio";
import { construirMarcas, type MarcaGeo } from "@/lib/senales/geo/marcas";
import {
  EVENTO_POSICION, fijarCompartirPosicion, guardarPosicionCruda, leerCompartirPosicion, leerPosicionCruda,
} from "@/lib/senales/geo/almacen-posicion";
import type { PosicionCruda } from "@/lib/senales/geo/modelo-geo";
import type { MiPosicion } from "@/components/map/map-view-extension";
import { useAhora } from "../use-mapa-vivo";

export type PermisoUbicacion = "concedido" | "denegado" | "por-pedir" | "desconocido";

export interface MarcasGeo {
  marcas: MarcaGeo[];
  presenciaConectada: boolean;
  ahora: number;
  permiso: PermisoUbicacion;
  compartir: boolean;
  fijarCompartir: (on: boolean) => void;
  /** Cada medida de la posición de este aparato (la vigilancia la hace `MapView`). */
  alMiPosicion: (p: MiPosicion) => void;
  errorUbicacion: string | null;
  alErrorUbicacion: (motivo: string) => void;
  /** Cuándo empezó esta vista (epoch ms): para decir «desde cuándo» no hay posición. */
  desde: number;
}

export function usePermisoUbicacion(): PermisoUbicacion {
  const [p, setP] = useState<PermisoUbicacion>("desconocido");
  useEffect(() => {
    let vivo = true;
    let st: PermissionStatus | null = null;
    const leer = () => { if (vivo && st) setP(st.state === "granted" ? "concedido" : st.state === "denied" ? "denegado" : "por-pedir"); };
    void (async () => {
      try {
        st = (await navigator.permissions?.query({ name: "geolocation" as PermissionName })) ?? null;
        if (!st) return;
        leer();
        st.addEventListener("change", leer);
      } catch { /* sin API de permisos: desconocido */ }
    })();
    return () => { vivo = false; try { st?.removeEventListener("change", leer); } catch { /* */ } };
  }, []);
  return p;
}

export function useMarcasGeo(): MarcasGeo {
  const malla = useMallaNeuronasEstado();
  const presencia = usePresenciaNeuronas();
  const ahora = useAhora();
  const permiso = usePermisoUbicacion();
  const [desde] = useState(() => Date.now());
  const [senales, setSenales] = useState<SenalesMedio | null>(null);
  const [capas, setCapas] = useState<string[] | null>(null);
  const [ficha, setFicha] = useState<FichaDispositivo | null>(null);
  const [cruda, setCruda] = useState<PosicionCruda | null>(null);
  const [compartir, setCompartir] = useState(true);
  const [errorUbicacion, setError] = useState<string | null>(null);

  const leerLocal = useCallback(() => {
    setCruda(leerPosicionCruda());
    setCompartir(leerCompartirPosicion());
  }, []);
  useEffect(() => {
    leerLocal();
    window.addEventListener(EVENTO_POSICION, leerLocal);
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
    // La ficha de ESTE aparato (RAM, motor local, modelos): se arma una vez y se refresca cada 5 min.
    const fichar = () => {
      void (async () => {
        try {
          const n = await import("@/lib/neurons/neurons");
          const cap = await n.detectCapabilities();
          const m = await import("@/lib/network/malla-neuronas");
          const f = await m.construirFicha({ capabilities: { memoryGb: cap.memoryGb } } as never);
          if (vivo) setFicha(f);
        } catch { if (vivo) setFicha(null); }
      })();
    };
    fichar();
    const t2 = setInterval(fichar, 5 * 60_000);
    return () => { vivo = false; clearInterval(t); clearInterval(t2); };
  }, []);

  const alMiPosicion = useCallback((p: MiPosicion) => {
    setError(null);
    guardarPosicionCruda({ lat: p.lat, lon: p.lng, precisionM: p.accuracy, t: p.t });
  }, []);

  const filas = malla.misDispositivos;
  const marcas = useMemo(() => {
    const mia = filas.find((f) => f.esEsteDispositivo);
    return construirMarcas({
      filas,
      medios: presencia.medios,
      yo: { neuronaId: mia?.neuronId ?? null, nombre: mia?.nombre ?? "Este aparato", plataforma: mia?.plataforma, senales, capas, posicion: cruda, ficha },
      ahora,
    });
  }, [filas, presencia.medios, senales, capas, cruda, ficha, ahora]);

  return {
    marcas, presenciaConectada: presencia.conectado, ahora, permiso, compartir,
    fijarCompartir: fijarCompartirPosicion, alMiPosicion, errorUbicacion, alErrorUbicacion: setError, desde,
  };
}
