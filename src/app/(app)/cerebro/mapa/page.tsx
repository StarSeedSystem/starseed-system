"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Loader2, Network, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import { listBrains, type Brain } from "@/lib/brains/brains";
import MemoryGraph from "@/components/brains/memory-graph";

// El Canvas / three.js solo puede ejecutarse en el navegador, por lo que el
// componente se carga con ssr:false (de lo contrario el build/SSR falla).
const MindMap = dynamic(
  () => import("@/components/cerebro-mapa/brain-mindmap-3d"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center text-white/60">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Tejiendo tu mapa mental 3D…
      </div>
    ),
  },
);

type MapView = "mindmap" | "memories";

export default function CerebroMapaPage() {
  // Vista: "Mapa mental 3D" (BrainMindMap3D, intacto) | "Grafo de memorias"
  // (memory-graph.tsx — Adenda 66, ver architecture/cerebros-memorias-graphify.md §9).
  const [view, setView] = useState<MapView>("mindmap");
  const [brains, setBrains] = useState<Brain[]>([]);
  const [brainId, setBrainId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void listBrains().then((list) => {
      if (!alive) return;
      setBrains(list);
      setBrainId((cur) => cur ?? list[0]?.id ?? null);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    // El layout (app) ya aporta header + padding; aquí ocupamos casi toda la
    // altura disponible. min-h asegura tamaño aunque el contenedor flex no lo dé.
    <section className="flex min-h-[78vh] flex-1 flex-col">
      <header className="mb-3 shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-amber-50">
            {view === "mindmap" ? "Mapa mental 3D · Cerebros, memorias y archivos" : "Grafo de memorias"}
          </h1>
          <div className="ml-auto flex items-center gap-1 rounded-xl border border-white/10 bg-black/40 p-1">
            <button
              onClick={() => setView("mindmap")}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition",
                view === "mindmap" ? "bg-amber-500/20 text-amber-200" : "text-white/55 hover:text-white/80",
              )}
            >
              <GitBranch className="h-3.5 w-3.5" /> Mapa mental 3D
            </button>
            <button
              onClick={() => setView("memories")}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition",
                view === "memories" ? "bg-amber-500/20 text-amber-200" : "text-white/55 hover:text-white/80",
              )}
            >
              <Network className="h-3.5 w-3.5" /> Grafo de memorias
            </button>
          </div>
        </div>
        {view === "mindmap" ? (
          <p className="mt-1 text-sm text-white/50">
            Tus <span className="text-amber-300">cerebros</span> como núcleos, sus{" "}
            <span className="text-violet-300">archivos de memoria</span> (soul · memory · dream ·
            skills · apis) como ramas, y tus <span className="text-cyan-300">memorias</span> como
            satélites conectados. Rota, haz zoom y haz clic en cualquier nodo para inspeccionarlo y
            ajustar su fuente, configuración de servidor y sincronización — en vivo.
          </p>
        ) : (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-white/50">
            <span>
              Memorias de un cerebro coloreadas por tipo, con enlaces <span className="text-amber-300">[[wiki]]</span>{" "}
              explícitos y agrupación por tipo. Clic en un nodo para editarlo, fusionarlo o ramificarlo.
            </span>
            {brains.length > 0 && (
              <select
                value={brainId ?? ""}
                onChange={(e) => setBrainId(e.target.value || null)}
                className="h-8 shrink-0 rounded-md border border-white/10 bg-black/30 px-2 text-xs text-white/85"
              >
                <option value="">Cuenta (sin cerebro)</option>
                {brains.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </header>
      <div className="min-h-[60vh] flex-1">
        {view === "mindmap" ? (
          <MindMap className="h-full w-full" />
        ) : (
          <MemoryGraph brainId={brainId} className="h-full w-full" />
        )}
      </div>
    </section>
  );
}
