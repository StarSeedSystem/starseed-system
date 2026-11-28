"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Loader2, Network, GitBranch, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { listBrains, type Brain } from "@/lib/brains/brains";
import MemoryGraph from "@/components/brains/memory-graph";

// El Canvas / three.js solo puede ejecutarse en el navegador, por lo que el
// componente se carga con ssr:false (de lo contrario el build/SSR falla).
const MindMap = dynamic(() => import("@/components/cerebro-mapa/brain-mindmap-3d"), {
  ssr: false,
  loading: () => <div className="flex h-full w-full items-center justify-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Tejiendo tu mapa mental 3D…</div>,
});

const Cerebros4D = dynamic(() => import("@/components/ramas4d/plantillas/cerebros-4d"), {
  ssr: false,
  loading: () => <div className="flex h-full w-full items-center justify-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Tejiendo los recuerdos vivos…</div>,
});

type MapView = "vivos" | "mindmap" | "memories";

export default function CerebroMapaPage() {
  const [view, setView] = useState<MapView>("vivos");
  const [brains, setBrains] = useState<Brain[]>([]);
  const [brainId, setBrainId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void listBrains().then((list) => { if (alive) { setBrains(list); setBrainId((cur) => cur ?? list[0]?.id ?? null); } });
    return () => { alive = false; };
  }, []);

  return (
    // El layout (app) ya aporta header + padding; aquí ocupamos casi toda la
    // altura disponible. min-h asegura tamaño aunque el contenedor flex no lo dé.
    <section className="flex min-h-[78vh] flex-1 flex-col">
      <header className="mb-3 shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-foreground">
            {view === "vivos" ? "Recuerdos vivos 4D · Cerebros, carpetas y memorias" : view === "mindmap" ? "Mapa mental 3D · Cerebros, memorias y archivos" : "Grafo de memorias"}
          </h1>
          <div className="ml-auto flex flex-wrap items-center gap-1 rounded-xl border border-border bg-card p-1">
            <button type="button" onClick={() => setView("vivos")} className={cn("flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition-colors", view === "vivos" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground")}><Sparkles className="h-3.5 w-3.5" /> Recuerdos vivos 4D</button>
            <button type="button" onClick={() => setView("mindmap")} className={cn("flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition-colors", view === "mindmap" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground")}><GitBranch className="h-3.5 w-3.5" /> Vista clásica</button>
            <button type="button" onClick={() => setView("memories")} className={cn("flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition-colors", view === "memories" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground")}><Network className="h-3.5 w-3.5" /> Grafo de memorias</button>
          </div>
        </div>
        {view === "vivos" && (
          <p className="mt-1 text-sm text-muted-foreground">Tus cerebros como galaxias, sus carpetas como sistemas y tus recuerdos como planetas: brillan con el uso y se enfrían sin borrarse. Las aristas muestran fusiones y telepatía; el grafo guarda referencias, nunca contenido privado.</p>
        )}
        {view === "mindmap" && (
          <p className="mt-1 text-sm text-muted-foreground">Tus cerebros como núcleos, sus archivos de memoria como ramas y tus memorias como satélites. Rota, haz zoom y haz clic en cualquier nodo para inspeccionarlo.</p>
        )}
        {view === "memories" && (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>Memorias de un cerebro con enlaces [[wiki]] explícitos. Clic en un nodo para editarlo, fusionarlo o ramificarlo.</span>
            {brains.length > 0 && <select value={brainId ?? ""} onChange={(e) => setBrainId(e.target.value || null)} className="h-8 shrink-0 cursor-pointer rounded-md border border-border bg-card px-2 text-xs text-foreground"><option value="">Cuenta (sin cerebro)</option>{brains.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>}
          </div>
        )}
      </header>
      <div className="min-h-[60vh] flex-1">
        {view === "vivos" ? <Cerebros4D brainId={brainId} className="h-full w-full" /> : null}
        {view === "mindmap" ? <MindMap className="h-full w-full" /> : null}
        {view === "memories" ? <MemoryGraph brainId={brainId} className="h-full w-full" /> : null}
      </div>
    </section>
  );
}
