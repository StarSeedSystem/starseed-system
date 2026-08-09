"use client";

/**
 * RedMeshCenter — CUERPO REUTILIZABLE del centro de la Red Mesh (Adenda 99).
 * ============================================================================
 * Extraído de la página /red-mesh para poder MONTARLO en dos sitios con paridad
 * total: (1) la página completa /red-mesh, y (2) la pestaña «Internet» del hub
 * de conexiones. Compone los mismos paneles reales (mapa 3D, control de malla,
 * antenas/bandas, privacidad, peers) — cero duplicación.
 *
 *   · `embedded` = dentro del hub (sin <main>/cabecera grande de página).
 *   · `showMap`  = incluir el mapa 3D (WebGL). Desactivable en superficies
 *     ligeras (p. ej. el popover compacto de la barra superior).
 */

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect } from "react";
import { Map as MapIcon, Radar, RadioTower, Settings2, ExternalLink } from "lucide-react";
import { MeshControlPanel } from "@/components/mesh/mesh-control-panel";
import { SignalsRadar } from "@/components/mesh/signals-radar";
import { DetectedSignalsPanel } from "@/components/mesh/detected-signals-panel";
import { AntennasPanel } from "@/components/mesh/antennas-panel";
import { MeshPrivacyPanel } from "@/components/mesh/mesh-privacy-panel";
import { PeersPanel } from "@/components/mesh/peers-panel";
import { MeshStatusChip } from "@/components/mesh/mesh-status-chip";
import { startMeshSubsystem } from "@/ai/astraura/mesh";

const MeshMap3D = dynamic(() => import("@/components/mesh/mesh-map-3d"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[420px] w-full items-center justify-center rounded-2xl border border-white/10 bg-black/40 text-sm text-white/40">
      Cargando el mapa 3D de la malla…
    </div>
  ),
});

export interface RedMeshCenterProps {
  /** Montado dentro del hub (sin cabecera grande de página). */
  embedded?: boolean;
  /** Incluir el mapa 3D (WebGL). Por defecto true. */
  showMap?: boolean;
  /**
   * Mostrar el panel de privacidad de la malla. Por defecto true. Se pone en
   * false cuando se embebe dentro de Señales, donde la privacidad ya vive en el
   * panel maestro de conectividad (evita duplicar ajustes · Adenda 101).
   */
  showPrivacy?: boolean;
  /** Ocultar la cabecera interna (cuando ya hay una pestaña «Red Mesh» encima). */
  hideHeader?: boolean;
}

export function RedMeshCenter({ embedded = false, showMap = true, showPrivacy = true, hideHeader = false }: RedMeshCenterProps) {
  useEffect(() => {
    startMeshSubsystem();
  }, []);

  return (
    <div className={embedded ? "space-y-4" : "mx-auto max-w-5xl space-y-4"}>
      {/* Cabecera: completa en página, compacta cuando va embebida en el hub.
          Se oculta si una pestaña «Red Mesh» ya la envuelve (hideHeader). */}
      {hideHeader ? null : embedded ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white/85">
            <RadioTower className="h-4 w-4 text-emerald-300" /> Centro de la Red Mesh P2P
          </h2>
          <div className="flex items-center gap-2">
            <MeshStatusChip link={false} />
            <Link
              href="/red-mesh"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-200 transition-colors duration-200 hover:bg-emerald-500/20"
            >
              <ExternalLink className="h-3 w-3" /> Abrir a pantalla completa
            </Link>
          </div>
        </div>
      ) : (
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
      )}

      {/* 1 · Mapa 3D (opcional en superficies ligeras) */}
      {showMap && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-white/85">
            <MapIcon className="h-4 w-4 text-emerald-300" /> Mapa 3D de neuronas activas
          </h2>
          <MeshMap3D />
        </section>
      )}

      {/* 2 · RADAR DE SEÑALES REALES (Adenda 150): todo lo que esta neurona oye
          —nodos LoRa por RF, faros del relé, neuronas de la cuenta, portadora IP,
          BLE escaneado con gesto y puertos serie— con su RANGO DE PRECISIÓN. */}
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-white/85">
          <Radar className="h-4 w-4 text-sky-300" /> Radar de señales reales
        </h2>
        <div className="grid gap-3 xl:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
            <SignalsRadar height={280} showLegend />
          </div>
          <DetectedSignalsPanel />
        </div>
      </section>

      {/* 3 · Conexiones (panel completo reutilizado) */}
      <MeshControlPanel />

      {/* 4 · Antenas y bandas + 5 · Privacidad (la privacidad se oculta cuando va
          embebido en Señales: allí vive en el panel maestro, sin duplicar). */}
      {showPrivacy ? (
        <div className="grid gap-3 xl:grid-cols-2">
          <AntennasPanel />
          <MeshPrivacyPanel />
        </div>
      ) : (
        <AntennasPanel />
      )}

      {/* 6 · Peers y routers */}
      <PeersPanel />
    </div>
  );
}

export default RedMeshCenter;
