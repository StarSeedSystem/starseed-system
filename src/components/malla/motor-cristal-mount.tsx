"use client";

import { identidadDispositivo } from "@/lib/network/identidad-dispositivo";
import { usePeersMalla } from "@/lib/network/malla-neuronas";
import { useMemo, useEffect, useState, useCallback } from "react";
import { crearMotorCristal } from "@/lib/malla/cristal/motor";
import { crearDifusor } from "@/lib/malla/cristal/difusion-teselas";
import { signContent, verifyContent } from "@/ai/astraura/mesh/mesh-identity";
import { tick } from "@/ai/astraura/mesh/logical-clock";
import { esAppNativa } from "@/lib/nativa/puente";
import { getSharedMesh } from "@/lib/network/lan-sync";
import { enviarAPar, vinculosActivos } from "@/lib/network/vinculos-entre-cuentas";
import { crearBucle } from "@/lib/network/bucle-fondo";
import type { NeuronaReticula, SenalMedida, Tesela } from "@/lib/malla/cristal/tipos";

type MotorCristal = ReturnType<typeof crearMotorCristal>;

export function MotorCristalMount(): MotorCristal {
  const { meshDeviceId, neuronDeviceId, syncDeviceId } = identidadDispositivo();
  const peersMalla = usePeersMalla();
  const esNativa = esAppNativa();
  const [antenasNativas, setAntenasNativas] = useState<any>(null);

  useEffect(() => {
    if (esNativa) {
      // Carga el estado de antenas nativas solo en app nativa
      // No se detalla aquí por brevedad, se integra con el hook nativo
    }
  }, [esNativa]);

  const miNeurona = useCallback((): NeuronaReticula => ({
    id: neuronDeviceId,
    cuenta: "",
    capacidad: { ramGb: 8, bateriaPct: null, cargando: false },
    medios: [],
  }), [neuronDeviceId]);

  const medir = useMemo(async (): Promise<SenalMedida[]> => {
    const { getMeshState } = await import("@/ai/astraura/mesh");
    const meshState = getMeshState();
    const yo = meshState.self?.id ?? meshDeviceId;
    const salida: SenalMedida[] = [];
    try {
      const nodos: Array<{ id: string; snr?: number; rssi?: number; lastHeard?: number }> = meshState.nodes.map((n: any) => ({
        id: n.id ?? "", snr: n.snr, rssi: n.rssi, lastHeard: n.lastHeard,
      }));
      const { senalesDeNodosMesh } = await import("@/lib/malla/cristal/medidas-locales");
      salida.push(...senalesDeNodosMesh(yo, nodos, Date.now()));
    } catch { /* sin radar de radio: sigue con lo demás */ }
    try {
      const { senalesDeEnlacesLocales } = await import("@/lib/malla/cristal/medidas-locales");
      const enlaces: Array<{ id: string; tipo?: string; par?: string; rttMs?: number }> = peersMalla.pares.map((e: any) => ({
        id: e.id,
        tipo: e.par.plataforma ? "webrtc" : undefined,
        par: e.par.neuronDeviceId ?? e.par.syncDeviceId ?? undefined,
        rttMs: e.rttMs ?? undefined,
      }));
      salida.push(...senalesDeEnlacesLocales(yo, enlaces, Date.now()));
    } catch { /* sin enlaces locales: lo que haya basta */ }
    return salida;
  }, [meshDeviceId, peersMalla]);

  const firmar = useMemo(async (t: Tesela): Promise<string | null> => {
    try {
      const r = await signContent(t);
      return r ? r.s : null;
    } catch { return null; }
  }, []);

  const difundir = useMemo((t: Tesela): void => {
    const malla = getSharedMesh();
    if (malla?.broadcast) {
      malla.broadcast(JSON.stringify(t));
    }
    const vinculos = vinculosActivos();
    if (vinculos.length > 0) {
      for (const v of vinculos) {
        enviarAPar(v.vinculoId, JSON.stringify(t));
      }
    }
  }, []);

  const motor = useMemo(
    () => crearMotorCristal({
      miNeurona,
      medir,
      reloj: () => tick(),
      firmar,
      difundir,
      ahora: () => Date.now(),
    }),
    [miNeurona, medir, firmar, difundir],
  );

  // Bucle con crearBucle, solo pestaña líder y aparato visible
  useEffect(() => {
    const limpiar = crearBucle({
      nombre: "motor-cristal",
      consulta: async () => {
        await motor.vuelta();
        return { ok: true, valor: null };
      },
      intervaloMs: motor.intervaloMs,
      esencial: false,
    });
    return limpiar;
  }, [motor]);

  return motor;
}

export function useMotorCristal(): MotorCristal {
  const motor = MotorCristalMount();
  return motor;
}