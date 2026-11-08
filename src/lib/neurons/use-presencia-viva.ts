"use client";

/*
 * usePresenciaViva — la presencia en vivo de UNA neurona con las mismas fuentes que el radar
 * (NEU1108A · 2026-11-08): presencia de la cuenta, enlaces directos sin internet, malla P2P y el faro
 * de la red local de la app nativa. La regla pura está en `presencia-viva.ts`. Contrato:
 * architecture/sincronizacion-neuronas.md §9.2. Solo LEE almacenes que ya existen (no arranca nada:
 * la malla la monta `MallaNeuronasMount` y el sondeo de la red local es el compartido del radar).
 */

import { useMemo } from "react";
import { usePresenciaNeuronas } from "@/lib/neurons/presencia";
import { useEnlacesLocales } from "@/lib/malla/registro-enlaces-locales";
import { useMallaNeuronasEstado } from "@/lib/network/malla-neuronas";
import { useRedLocal } from "@/lib/malla/sincronizacion-neuronas-motor";
import { neuronaVigente } from "@/lib/neurons/fusion-alias";
import { presenciaViva, type PresenciaViva } from "@/lib/neurons/presencia-viva";

export function usePresenciaViva(neuronaId: string, capacidades?: Record<string, unknown> | null): PresenciaViva {
  const presencia = usePresenciaNeuronas();
  const locales = useEnlacesLocales();
  const malla = useMallaNeuronasEstado();
  const red = useRedLocal();
  return useMemo(
    () =>
      presenciaViva(neuronaId, {
        medios: presencia.medios,
        locales,
        malla: malla?.misDispositivos ?? [],
        vecinos: red.vecinos,
        vinculos: red.vinculos,
        capacidades: capacidades ?? null,
        vigente: neuronaVigente,
      }),
    [neuronaId, presencia.medios, locales, malla, red.vecinos, red.vinculos, capacidades],
  );
}
