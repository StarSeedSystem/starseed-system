"use client";

/**
 * /red-mesh — CENTRO COMPLETO DE LA RED MESH P2P (Adenda 98).
 * ============================================================================
 * La página de administración total de la malla, accesible desde el hub de
 * conexiones (Control Center / barra superior) y AGREGABLE AL DOCK (app
 * "Red Mesh" del catálogo):
 *
 *   1. MAPA 3D — cada neurona activa ubicada por GPS real (si el nodo lo
 *      comparte) o por ESTIMACIÓN DE RADIOFRECUENCIA (distancia derivada del
 *      SNR del enlace), con tus otras neuronas federadas en órbita.
 *   2. CONEXIONES — todos los tipos de conexión mesh (USB/BLE/daemon/simulador),
 *      salud dual, nodos, decisiones del router, airtime y pruebas.
 *   3. ANTENAS Y BANDAS — inventario real de radios del dispositivo + selector
 *      INTELIGENTE de banda/preset (distancia ↔ capacidad ↔ velocidad, auto).
 *   4. PRIVACIDAD Y PERMISOS — visibilidad, posición, nombres y uso del relé.
 *   5. PEERS Y ROUTERS — P2P activos con datos de antena, neuronas federadas y
 *      la red externa (Wi-Fi/datos) medida.
 */

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect } from "react";
import { Map as MapIcon, RadioTower, Settings2 } from "lucide-react";
import { MeshControlPanel } from "@/components/mesh/mesh-control-panel";
import { AntennasPanel } from "@/components/mesh/antennas-panel";
import { MeshPrivacyPanel } from "@/components/mesh/mesh-privacy-panel";
import { PeersPanel } from "@/components/mesh/peers-panel";
import { MeshStatusChip } from "@/components/mesh/mesh-status-chip";
import { startMeshSubsystem } from "@/ai/astraura/mesh";

// El mapa 3D usa WebGL (three/R3F): solo en cliente, cargado al entrar aquí.
const MeshMap3D = dynamic(() => import("@/components/mesh/mesh-map-3d"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[420px] w-full items-center justify-center rounded-2xl border border-white/10 bg-black/40 text-sm text-white/40">
      Cargando el mapa 3D de la malla…
    </div>
  ),
});

export default function RedMeshPage() {
  useEffect(() => {
    startMeshSubsystem();
  }, []);

  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-emerald-50">
              <RadioTower className="h-6 w-6 text-emerald-300" /> Red Mesh P2P
            </h1>
            <p className="mt-1 text-sm text-white/50">
              La malla soberana de StarSeed: radios LoRa libres, sin operadores. Mapa vivo, antenas,
              bandas inteligentes, privacidad y todos los peers — de esta neurona y de tu cuenta.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <MeshStatusChip link={false} />
            <Link
              href="/agent?tab=personalidades"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/70 transition-colors duration-200 hover:border-emerald-400/40 hover:text-white"
            >
              <Settings2 className="h-3 w-3" /> Reglas por neurona
            </Link>
          </div>
        </div>

        {/* 1 · Mapa 3D */}
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-white/85">
            <MapIcon className="h-4 w-4 text-emerald-300" /> Mapa 3D de neuronas activas
          </h2>
          <MeshMap3D />
        </section>

        {/* 2 · Conexiones (panel completo reutilizado) */}
        <MeshControlPanel />

        {/* 3 · Antenas y bandas + 4 · Privacidad */}
        <div className="grid gap-3 xl:grid-cols-2">
          <AntennasPanel />
          <MeshPrivacyPanel />
        </div>

        {/* 5 · Peers y routers */}
        <PeersPanel />
      </div>
    </main>
  );
}
