"use client";

/**
 * StarSeed OS — Red Mesh · HOOKS REACT (Adenda 97 · SOP §8).
 * ============================================================================
 * Enganche de la UI al store global del subsistema mesh con
 * `useSyncExternalStore` (API estilo zustand sin dependencias nuevas).
 * SSR-safe: el snapshot de servidor es el estado inicial estable.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { getMeshState, subscribeMeshState } from "./store";
import { getMeshRules, listMeshRules, MESH_RULES_EVENT, setMeshRules } from "./rules";
import { getNearbySnapshot, subscribeNearby } from "./synaptic";
import { getRecentDeliveries, subscribeDeliveries } from "./delivery";
import type { RelayBeacon } from "./server-relay";
import type { DeliveryReceipt } from "./delivery";
import type { MeshRules, MeshState } from "./types";

/** Estado global mesh, reactivo. */
export function useMeshState(): MeshState {
  return useSyncExternalStore(subscribeMeshState, getMeshState, getMeshState);
}

/** Radar de neuronas cercanas (faros), reactivo. Vacío en SSR. */
export function useNearbyBeacons(): RelayBeacon[] {
  return useSyncExternalStore(subscribeNearby, getNearbySnapshot, getNearbySnapshot);
}

/** Recibos de entrega recientes (indicadores de transmisión), reactivos. */
export function useDeliveryReceipts(): DeliveryReceipt[] {
  return useSyncExternalStore(subscribeDeliveries, getRecentDeliveries, getRecentDeliveries);
}

/** Reglas mesh de una personalidad (o del dispositivo con id null), reactivas. */
export function useNeuronMeshRules(personalityId: string | null | undefined): {
  rules: MeshRules;
  update: (patch: Partial<MeshRules>) => void;
} {
  const [rules, setRules] = useState<MeshRules>(() => getMeshRules(personalityId));

  useEffect(() => {
    setRules(getMeshRules(personalityId));
    if (typeof window === "undefined") return;
    const onChange = () => setRules(getMeshRules(personalityId));
    window.addEventListener(MESH_RULES_EVENT, onChange);
    return () => window.removeEventListener(MESH_RULES_EVENT, onChange);
  }, [personalityId]);

  const update = useCallback(
    (patch: Partial<MeshRules>) => {
      setRules(setMeshRules(personalityId, patch));
    },
    [personalityId],
  );

  return { rules, update };
}

/** Mapa completo de reglas (hub de Personalidades), reactivo. */
export function useAllMeshRules(): Record<string, MeshRules> {
  const [map, setMap] = useState<Record<string, MeshRules>>(() => listMeshRules());
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onChange = () => setMap(listMeshRules());
    window.addEventListener(MESH_RULES_EVENT, onChange);
    return () => window.removeEventListener(MESH_RULES_EVENT, onChange);
  }, []);
  return map;
}
