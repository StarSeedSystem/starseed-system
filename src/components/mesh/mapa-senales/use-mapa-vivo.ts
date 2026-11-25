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
import { useLatido } from "@/lib/perf/latido-compartido"; // DIR1125L
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
import type { DetectedSignal, BleDetection } from "@/ai/astraura/mesh/signals";
import { BLE_FRESH_MS } from "@/ai/astraura/mesh/signals";
import type { EntradaYo, VivoMapa, MapaVivoRed } from "@/lib/senales/tipos-vivo";
import { ordenarSenalesPorCalidad, useDetectedSignals, type DetectedSignalsOptions, type DetectedSignalsResult } from "../use-detected-signals";
import { adaptarBluetooth, type EntradaBluetooth } from "@/lib/senales/espectro/adaptadores/bluetooth";
import type { SenalEspectro, SinFuente } from "@/lib/senales/espectro/modelo";
import { useSenalesPublicadas, type EstadoSenalesPublicadas } from "@/lib/senales/espectro/usar-senales-publicadas";
import type { Medio, OrigenDato, CapaRed, Compatibilidad, Vinculo } from "@/lib/senales/espectro/modelo";

/** Convierte una señal de enlace directo (DetectedSignal con starseed.via === "direct-link") a SenalEspectro. */
function senalDirectLinkToEspectro(s: DetectedSignal): SenalEspectro {
  const calidad = s.quality;
  const rttMetric = s.metrics.find((m) => m.label === "Latencia");
  const rttMs = rttMetric ? Number.parseFloat(rttMetric.value.replace(" ms", "")) : null;
  return {
    id: s.id,
    medio: "malla",
    banda: "enlace directo",
    frecuenciaKhz: null,
    anchoKhz: null,
    fuerzaDbm: null,
    calidad,
    origen: rttMs != null ? "medida" : "estimada",
    capa: "propia",
    fuente: "enlace directo sin internet",
    medidoEn: s.lastHeard,
    zona: null,
    vinculo: s.starseed?.sourceId ? { tipo: "neurona", id: s.starseed.sourceId } : undefined,
    compatibles: [],
  };
}

const REFRESCO_MS = 15_000;
const MEDIDA_MS = 30_000;

/** Un reloj que se detiene mientras la pestaña está oculta (nada late para nadie). */
export function useAhora(cadaMs = REFRESCO_MS): number {
  // DIR1125L: un solo reloj por periodo para toda la página (antes, uno por cada componente que usa el mapa).
  return useLatido(cadaMs);
}

export interface MapaVivo {
  detected: DetectedSignalsResult;
  senales: DetectedSignal[];
  vivo: VivoMapa;
  yo: EntradaYo;
  ahora: number;
  senalesEspectroBluetooth: readonly SenalEspectro[] | SinFuente;
  red: MapaVivoRed;
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

  // Señales publicadas por toda la red (capa pública)
  const publicadas = useSenalesPublicadas();

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

  const freshBle = useMemo<BleDetection[]>(
    () => detected.ble?.detections?.filter((d) => d.viaPicker || ahora - d.at < BLE_FRESH_MS) ?? [],
    [detected.ble?.detections, ahora],
  );

  const senalesEspectroBluetooth = useMemo<readonly SenalEspectro[] | SinFuente>(
    () => adaptarBluetooth({ disponible: senalesMedio?.bluetooth.disponible ?? null, detecciones: freshBle }),
    [senalesMedio?.bluetooth.disponible, freshBle],
  );

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

  // Construir el campo red: combinar señales propias (extras de vivo) con publicadas
  const red = useMemo<MapaVivoRed>(() => {
    const senalesPropias = vivo.extras
      .filter((s) => s.starseed?.via === "direct-link")
      .map(senalDirectLinkToEspectro);
    const todas = [...publicadas.senales, ...senalesPropias];
    const otrasCuentas = new Set(publicadas.senales.map((s) => s.vinculo?.id).filter((id): id is string => !!id)).size;
    let motivo = publicadas.motivo;
    if (publicadas.estado === "ok" && publicadas.senales.length === 0 && !motivo) {
      motivo = "nadie más ha publicado en esta capa todavía";
    } else if (publicadas.estado === "sin-tabla") {
      motivo = "las señales públicas aún no están activadas en este servidor";
    }
    return {
      senales: todas,
      estado: publicadas.estado,
      motivo,
      otrasCuentasPublicando: otrasCuentas,
    };
  }, [publicadas.senales, publicadas.estado, publicadas.motivo, vivo.extras]);

  return { detected, senales, vivo, yo, ahora, senalesEspectroBluetooth, red };
}
