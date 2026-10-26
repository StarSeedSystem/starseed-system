"use client";

/**
 * ConnectionsTab — sección «Conexiones» del Centro de Control (Adenda 98).
 * Monta el Centro de Conexiones completo: red externa, malla P2P con conexión
 * rápida, modo dual, ruta preferida, Bluetooth y antenas, con enlace al
 * Centro Red Mesh (/red-mesh, mapa 3D).
 */

import { ConnectionsCenter } from "@/components/connectivity/connections-center";

export function ConnectionsTab() {
  return (
    <div className="pt-1" data-testid="seccion-conexiones">
      <ConnectionsCenter />
    </div>
  );
}

export default ConnectionsTab;
