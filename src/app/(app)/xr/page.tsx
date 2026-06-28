"use client";

// ════════════════════════════════════════════════════════════════════════════
// Ruta /xr — Hub 3D / VR / AR unificado del StarSeed OS
// ----------------------------------------------------------------------------
// Presenta la red REAL del usuario (cerebros, archivos, memorias, baúles,
// pizarras, páginas, grupos, eventos e interconexiones) en 3D, con un menú 3D
// inteligente (VR/AR), la Trinity dock en 3D y Astraura integrada (voz + skills
// 3D). Entra en VR/AR si el dispositivo lo soporta (WebXR) y degrada a orbit-3D.
//
// El Canvas/WebGL solo puede ejecutarse en el navegador → se carga con
// next/dynamic { ssr:false }. El parámetro ?ctx=<id|nombre> abre un contexto
// (cerebro, pizarra, área…) enfocado; se lee con useSearchParams() envuelto en
// Suspense (evita el bailout de prerender estático).
// ════════════════════════════════════════════════════════════════════════════

import { Suspense } from "react";
import nextDynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

// Evita el bailout de prerender estático (este árbol lee Supabase en cliente).
export const dynamic = "force-dynamic";

const XRNetworkHub = nextDynamic(
  () => import("@/components/xr/xr-network-hub").then((m) => m.XRNetworkHub),
  {
    ssr: false,
    loading: () => (
      <div className="absolute inset-0 grid place-items-center bg-[#05060f] text-white/70">
        <div className="flex flex-col items-center gap-3 text-center">
          <Loader2 className="size-8 animate-spin text-violet-400" />
          <p className="text-sm font-semibold">Tejiendo tu red en 3D…</p>
          <p className="text-[11px] uppercase tracking-[0.16em] text-white/40">
            WebXR · Three.js · R3F
          </p>
        </div>
      </div>
    ),
  },
);

function XRHubInner() {
  const params = useSearchParams();
  const ctx = params.get("ctx");
  return <XRNetworkHub ctx={ctx} />;
}

export default function XRPage() {
  return (
    <section className="flex min-h-[78vh] flex-1 flex-col">
      <header className="mb-3 shrink-0">
        <h1 className="text-2xl font-bold text-amber-50">
          Hub 3D · VR / AR · Tu red completa
        </h1>
        <p className="mt-1 text-sm text-white/50">
          Toda tu red —{" "}
          <span className="text-amber-300">cerebros</span>,{" "}
          <span className="text-violet-300">archivos</span>,{" "}
          <span className="text-cyan-300">memorias</span>,{" "}
          <span className="text-emerald-300">baúles</span>,{" "}
          <span className="text-pink-300">pizarras</span>, páginas, grupos y eventos —
          como nodos 3D animados e interconectados. Usa el menú 3D para filtrar y navegar,
          pide a Astraura por voz que abra cualquier cosa, y entra en VR o AR si tu
          dispositivo lo soporta.
        </p>
      </header>
      <div className="relative min-h-[60vh] flex-1 overflow-hidden rounded-3xl border border-white/10 shadow-2xl">
        <Suspense fallback={<div className="absolute inset-0 bg-[#05060f]" />}>
          <XRHubInner />
        </Suspense>
      </div>
    </section>
  );
}
