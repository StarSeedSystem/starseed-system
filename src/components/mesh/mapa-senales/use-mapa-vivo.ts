"use client";

/**
 * useMapaVivo — la ÚNICA lista de lo que dibuja el mapa, el radar plano y el mini radar.
 * ====================================================================================
 * Junta las fuentes reales (señales detectadas, filas de la malla, presencia en vivo, enlaces
 * directos sin internet, el radio y las antenas de ESTE medio) y devuelve:
 *   · `senales`  — todo lo que se oye, con los aparatos ya cruzados con su enlace, las cuentas ajenas
 *                  anónimas y Bluetooth/Wi-Fi colocados en su escala corta;
 *   · `vivo`     — estado, enlace y medios abiertos de cada aparato;
 *   · `yo`       — lo que se sabe de «Tú» (este aparato, este medio, tus antenas, tu radio).
 * Nada se inventa aquí: cada pieza viene de un instrumento o se declara «no medido».
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMeshState } from "@/ai/astraura/mesh";
import { useMallaNeuronasEstado } from "@/lib/network/malla-neuronas";
import { usePresenciaNeuronas } from "@/lib/neurons/presencia";
import { useEnlacesLocales } from "@/lib/malla/registro-enlaces-locales";
import { describirMedio, type DescripcionMedio } from "@/lib/neurons/medio";
import { medirSenales, type SenalesMedio } from "@/lib/neurons/senales-medio";
import { uidActual } from "@/lib/consumo/usuario";
import { construirVivo } from "@/lib/senales/aparatos";
import { anonimizarAjenas } from "@/lib/senales/cuentas";
import { reubicar } from "@/lib/senales/escalas";
import type { DetectedSignal } from "@/ai/astraura/mesh/signals";
import type { EntradaYo, VivoMapa } from "@/lib/senales/tipos-vivo";
import { ordenarSenalesPorCalidad, useDetectedSignals, type DetectedSignalsOptions, type DetectedSignalsResult } from "../use-detected-signals";

const REFRESCO_MS = 15_000;
const MEDIDA_MS = 30_000;

/** Un reloj que se detiene mientras la pestaña está oculta (nada late para nadie). */
export function useAhora(cadaMs = REFRESCO_MS): number {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    let t: ReturnType<typeof setInterval> | null = null;
    const parar = () => { if (t) { clearInterval(t); t = null; } };
    const arrancar = () => {
      parar();
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      t = setInterval(() => setAhora(Date.now()), cadaMs);
    };
    const alCambiar = () => { if (document.visibilityState === "visible") setAhora(Date.now()); arrancar(); };
    arrancar();
    document.addEventListener("visibilitychange", alCambiar);
    return () => { parar(); document.removeEventListener("visibilitychange", alCambiar); };
  }, [cadaMs]);
  return ahora;
}

export interface MapaVivo {
  detected: DetectedSignalsResult;
  senales: DetectedSignal[];
  vivo: VivoMapa;
  yo: EntradaYo;
  ahora: number;
}

export function useMapaVivo(opciones?: DetectedSignalsOptions & { verPublicos?: boolean }): MapaVivo {
  const { verPublicos = true, ...deteccion } = opciones ?? {};
  const detected = useDetectedSignals(Object.keys(deteccion).length > 0 ? deteccion : undefined);
  const mesh = useMeshState();
  const malla = useMallaNeuronasEstado();
  const presencia = usePresenciaNeuronas();
  const locales = useEnlacesLocales();
  const ahora = useAhora();
  const [medio, setMedio] = useState<DescripcionMedio | null>(null);
  const [senalesMedio, setSenalesMedio] = useState<SenalesMedio | null>(null);
  const [miUid, setMiUid] = useState<string | null>(null);

  // Lo que depende del navegador se lee DESPUÉS de montar (el HTML del servidor no lo conoce).
  useEffect(() => {
    try { setMedio(describirMedio()); } catch { setMedio(null); }
    void uidActual().then(setMiUid).catch(() => setMiUid(null));
  }, []);

  const medir = useCallback(() => { void medirSenales().then(setSenalesMedio).catch(() => setSenalesMedio(null)); }, []);
  useEffect(() => {
    medir();
    const t = setInterval(() => { if (typeof document === "undefined" || document.visibilityState !== "hidden") medir(); }, MEDIDA_MS);
    return () => clearInterval(t);
  }, [medir]);

  const filas = malla.misDispositivos;
  const base = detected.signals;

  const vivo = useMemo(
    () => construirVivo(base, { filas, presencia, locales, miMedioId: medio?.id || null, miUid, ahora }),
    [base, filas, presencia, locales, medio?.id, miUid, ahora],
  );

  const senales = useMemo(
    () => ordenarSenalesPorCalidad(anonimizarAjenas([...base, ...vivo.extras], { verPublicos }).map(reubicar)),
    [base, vivo.extras, verPublicos],
  );

  const yo = useMemo<EntradaYo>(() => {
    const mia = filas.find((f) => f.esEsteDispositivo);
    const listo = mesh.status === "ready" || mesh.status === "degraded";
    return {
      neuronaId: mia?.neuronId ?? null,
      nombre: mia?.nombre ?? "",
      plataforma: mia?.plataforma,
      medio: medio?.id ? { id: medio.id, tipo: medio.tipo, etiqueta: medio.etiqueta } : null,
      senales: senalesMedio,
      radio: {
        estado: mesh.status === "disconnected" ? "sin-radio" : mesh.status,
        transporte: mesh.transport ?? null,
        nodos: listo ? mesh.nodes.filter((n) => !n.isSelf && n.presence === "online").length : 0,
        region: mesh.region ?? null,
        gps: typeof mesh.self?.lat === "number" && typeof mesh.self?.lon === "number",
        simulador: mesh.transport === "simulator",
      },
    };
  }, [filas, medio, senalesMedio, mesh.status, mesh.transport, mesh.nodes, mesh.region, mesh.self?.lat, mesh.self?.lon]);

  return { detected, senales, vivo, yo, ahora };
}
