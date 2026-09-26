"use client";

/*
 * MallaNeuronasMount — punto de montaje ÚNICO de la malla de neuronas (Ola 366).
 * ---------------------------------------------------------------------------
 * Arranca, UNA vez por sesión, el motor `useMallaNeuronas()` (detección +
 * auto-vínculo entre las neuronas de la cuenta + radar de otras cuentas).
 * Hermano de `SovereignSyncMount`/`RealtimeSyncProvider` en el layout raíz —
 * mismo patrón: no pinta nada, degrada en silencio sin sesión/WebRTC.
 *
 * Excluido de las RUTAS_CONSOLA (`/mando`, `/voces`, ver
 * `solo-fuera-de-consola.tsx`): son herramientas de trabajo en máquinas de
 * 8 GB donde cada suscripción/timer de más le quita sitio a un agente — el
 * mismo motivo por el que esas rutas ya excluyen `AppGlobals`.
 */

import { usePathname } from "next/navigation";
import { esRutaConsola } from "@/components/layout/solo-fuera-de-consola";
import { useMallaNeuronas } from "@/lib/network/malla-neuronas";
import { startMeshSubsystem, subscribeNearby, getNearbyBeacons } from "@/ai/astraura/mesh";

function MallaNeuronasEngine(): null {
  useMallaNeuronas({
    startBeaconLayer: startMeshSubsystem,
    subscribeNearby,
    getNearbyNow: getNearbyBeacons,
  });
  return null;
}

export function MallaNeuronasMount() {
  const ruta = usePathname();
  if (esRutaConsola(ruta)) return null;
  return <MallaNeuronasEngine />;
}
