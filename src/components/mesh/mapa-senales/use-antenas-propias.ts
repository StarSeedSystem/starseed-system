"use client";

/**
 * Antenas propias de ESTA neurona (qué puede emitir y recibir), vivas con la conectividad.
 * Solo se vuelve a leer cuando cambia algo que de verdad las altera (estado, región, transporte
 * o cuántos nodos hay al alcance): `mesh` entero cambia en cada nodo oído.
 * Con `fuera` (el padre ya las conoce) no detecta nada y devuelve esas.
 */

import { useEffect, useMemo, useState } from "react";
import { detectSignals, subscribeConnectivity, useMeshState } from "@/ai/astraura/mesh";
import type { SignalSource } from "@/ai/astraura/mesh/signals";

export function useAntenasPropias(fuera?: SignalSource[]): SignalSource[] {
  const mesh = useMeshState();
  const [fuentes, setFuentes] = useState<SignalSource[]>([]);
  const online = useMemo(() => mesh.nodes.filter((n) => !n.isSelf && n.presence === "online").length, [mesh.nodes]);
  useEffect(() => {
    if (fuera) return;
    let vivo = true;
    let ultima = 0;
    const leer = () => {
      const mi = ++ultima;
      void detectSignals(mesh).then((r) => { if (vivo && mi === ultima) setFuentes(r); });
    };
    leer();
    const off = subscribeConnectivity(leer);
    return () => { vivo = false; off(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fuera, mesh.status, mesh.region, mesh.transport, online]);
  return fuera ?? fuentes;
}
