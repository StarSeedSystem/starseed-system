"use client";

/*
 * usePresenciaViva — la presencia en vivo de UNA neurona con las mismas fuentes que el radar
 * (NEU1108A · 2026-11-08): presencia de la cuenta, enlaces directos sin internet, malla P2P y el faro
 * de la red local de la app nativa. La regla pura está en `presencia-viva.ts`. Contrato:
 * architecture/sincronizacion-neuronas.md §9.2. Solo LEE almacenes que ya existen (no arranca nada:
 * la malla la monta `MallaNeuronasMount` y el sondeo de la red local es el compartido del radar).
 */

import { useEffect, useMemo, useState } from "react";
import { usePresenciaNeuronas } from "@/lib/neurons/presencia";
import { useEnlacesLocales } from "@/lib/malla/registro-enlaces-locales";
import { useMallaNeuronasEstado } from "@/lib/network/malla-neuronas";
import { useRedLocal } from "@/lib/malla/sincronizacion-neuronas-motor";
import { neuronaVigente } from "@/lib/neurons/fusion-alias";
import { presenciaViva, viasDeConectores, type PresenciaViva, type ViaConectorMin } from "@/lib/neurons/presencia-viva";

/**
 * (BLE1108B) Las vías vivas del registro de conectores (planificador, MED1108B) y el Bluetooth directo: la
 * presencia ya no mira solo la red local. Se relee cuando cambian los conectores o el Bluetooth y cada 4 s.
 */
function useViasVivas(): ViaConectorMin[] {
  const [vias, setVias] = useState<ViaConectorMin[]>([]);
  useEffect(() => {
    let vivo = true;
    const bajas: Array<() => void> = [];
    const leer = async () => {
      try {
        const [reg, ble] = await Promise.all([import("@/lib/malla/conectores/registro"), import("@/lib/malla/bluetooth-directo-motor")]);
        const deRegistro = viasDeConectores(await reg.descubrirVias().catch(() => []));
        // Aunque el registro aún no tenga el conector «ble», el enlace Bluetooth ligado cuenta.
        const deBle = viasDeConectores((ble.bluetoothDirectoActivo()?.enlaces() ?? []).map((enlace) => ({ enlace })));
        const sinRepetir = [...deRegistro, ...deBle.filter((b) => !deRegistro.some((r) => r.tipo === b.tipo && r.neuronDeviceId === b.neuronDeviceId))];
        if (vivo) setVias(sinRepetir);
      } catch {
        /* sin vías: la presencia sigue con el resto de fuentes */
      }
    };
    void leer();
    const t = setInterval(() => void leer(), 4_000);
    bajas.push(() => clearInterval(t));
    void import("@/lib/malla/conectores/registro").then((m) => (vivo ? bajas.push(m.alCambiarConectores(() => void leer())) : undefined)).catch(() => undefined);
    void import("@/lib/malla/bluetooth-directo-motor")
      .then((b) => {
        const r = b.bluetoothDirectoActivo();
        if (vivo && r) bajas.push(r.suscribir(() => void leer()));
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
      for (const b of bajas.splice(0)) b();
    };
  }, []);
  return vias;
}

export function usePresenciaViva(neuronaId: string, capacidades?: Record<string, unknown> | null): PresenciaViva {
  const presencia = usePresenciaNeuronas();
  const locales = useEnlacesLocales();
  const malla = useMallaNeuronasEstado();
  const red = useRedLocal();
  const vias = useViasVivas();
  return useMemo(
    () =>
      presenciaViva(neuronaId, {
        medios: presencia.medios,
        locales,
        malla: malla?.misDispositivos ?? [],
        vias,
        vecinos: red.vecinos,
        vinculos: red.vinculos,
        capacidades: capacidades ?? null,
        vigente: neuronaVigente,
      }),
    [neuronaId, presencia.medios, locales, malla, vias, red.vecinos, red.vinculos, capacidades],
  );
}
