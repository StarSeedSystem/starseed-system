"use client";

/**
 * /senales — PÁGINA "SEÑALES" (Adenda 99b).
 * ============================================================================
 * Accesible desde el hub de conexiones (pestaña «Señales») y agregable al dock.
 * Muestra todas las antenas de emisión/recepción de la neurona autodetectadas
 * en tiempo real + el radar de los nodos reales de la malla, con accesos a la
 * Red Mesh y a las configuraciones de cada tipo de conexión. Cuerpo en
 * <SignalsCenter/> para montarse con paridad también dentro del hub.
 */

import { useEffect } from "react";
import { SignalsCenter } from "@/components/mesh/signals-center";
import { startMeshSubsystem } from "@/ai/astraura/mesh";

export default function SenalesPage() {
  useEffect(() => {
    startMeshSubsystem();
  }, []);

  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <div className="mx-auto max-w-4xl">
        <SignalsCenter />
      </div>
    </main>
  );
}
