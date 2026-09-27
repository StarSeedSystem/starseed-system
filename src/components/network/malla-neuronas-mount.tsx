"use client";

/*
 * MallaNeuronasMount — punto de montaje ÚNICO de la malla de neuronas (Ola 366).
 * ---------------------------------------------------------------------------
 * Arranca, UNA vez por sesión, el motor `useMallaNeuronas()` (detección +
 * auto-vínculo entre las neuronas de la cuenta + radar de otras cuentas).
 * Hermano de `SovereignSyncMount`/`RealtimeSyncProvider` en el layout raíz —
 * mismo patrón: degrada en silencio sin sesión/WebRTC. Desde la Ola 369
 * también pinta las tarjetas flotantes de ofertas de archivo ENTRANTES (ver
 * `TransferenciasArchivoToast`) para que lleguen aunque el panel esté cerrado
 * — es lo único que este montaje dibuja; todo lo demás sigue siendo motor puro.
 *
 * Excluido de las RUTAS_CONSOLA (`/mando`, `/voces`, ver
 * `solo-fuera-de-consola.tsx`): son herramientas de trabajo en máquinas de
 * 8 GB donde cada suscripción/timer de más le quita sitio a un agente — el
 * mismo motivo por el que esas rutas ya excluyen `AppGlobals`.
 */

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { esRutaConsola } from "@/components/layout/solo-fuera-de-consola";
import { useMallaNeuronas } from "@/lib/network/malla-neuronas";
import { startMeshSubsystem, subscribeNearby, getNearbyBeacons } from "@/ai/astraura/mesh";
import { iniciarServidorAstrauraPorMalla } from "@/lib/network/astraura-por-malla";
import { iniciarServidorIaPorMalla } from "@/lib/network/ia-por-malla";
import { iniciarMotorArchivosPorMalla } from "@/lib/network/archivos-malla";
import { TransferenciasArchivoToast } from "@/components/network/transferencias-archivo-panel";

function MallaNeuronasEngine() {
  useMallaNeuronas({
    startBeaconLayer: startMeshSubsystem,
    subscribeNearby,
    getNearbyNow: getNearbyBeacons,
  });
  // (Ola 367) Rol SERVIDOR de Astraura por la malla: atiende `astraura.pedir`
  // de otros peers cuando esta neurona puede relayar (mismo mesh compartido,
  // nunca uno propio). Arranca UNA vez por sesión, junto con el motor.
  useEffect(() => iniciarServidorAstrauraPorMalla(), []);
  // (Ola 368) Rol SERVIDOR del relé GENÉRICO `ia-malla`: atiende `ia.pedir`
  // (namespace `ia.*`, disjunto de `astraura.*`) sobre el MISMO mesh
  // compartido — coexisten sin pisarse.
  useEffect(() => iniciarServidorIaPorMalla(), []);
  // (Ola 369) Motor de ARCHIVOS por la malla: namespace `archivo.*`, mismo
  // mesh compartido de siempre. La tarjeta de "aceptar/rechazar" de una
  // oferta entrante se pinta aquí (global) para que llegue con el panel
  // cerrado; el resto de la UI (botón «Enviar archivo», lista de
  // transferencias) vive en `MallaNeuronasPanel`.
  useEffect(() => iniciarMotorArchivosPorMalla(), []);
  return <TransferenciasArchivoToast />;
}

export function MallaNeuronasMount() {
  const ruta = usePathname();
  if (esRutaConsola(ruta)) return null;
  return <MallaNeuronasEngine />;
}
