"use client";

/**
 * CEREBRO · VISTAS DE MEMORIA UNIFICADAS (Adenda I2 · tareas 1-3).
 * ============================================================================
 * Orquestador del pilar Memoria del cerebro. Un único toggle con:
 *
 *   · Lista   → sub-vistas Archivos (.md, MemoriaPanel sobre brain_memory_files)
 *               y Hub (memorias del cerebro, MemoryHub sobre `memories`).
 *   · 2D      → grafo de relaciones (MemoryGraph: wikilinks + tipos), clic en
 *               nodo abre su editor (interno del componente).
 *   · 3D      → malla 3D del cerebro (MemoryMesh3D en modo cerebro): archivos +
 *               memorias + fuentes; clic en un archivo abre su editor (Archivos).
 *   · Fuentes → fuentes de memoria del cerebro (MemorySourcesPanel).
 *
 * REUTILIZA los componentes existentes (no duplica): sólo compone y cablea la
 * selección de nodo → editor y el deep-link de vista.
 */

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Loader2, List, Network, Boxes, Server, FileText, Brain } from "lucide-react";
import { cn } from "@/lib/utils";
import MemoriaPanel from "@/components/cerebro/memoria-panel";
import { MemoryHub } from "@/components/exocortex/memory-hub";
import MemoryGraph from "@/components/brains/memory-graph";
import MemorySourcesPanel from "@/components/cerebro/memory-sources-panel";

const MemoryMesh3D = dynamic(
  () => import("@/components/exocortex/memory-mesh-3d").then((m) => m.MemoryMesh3D),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center text-white/60">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Preparando la malla 3D del cerebro…
      </div>
    ),
  },
);

export type MemoryViewId = "lista" | "2d" | "3d" | "fuentes";
export type MemoryListSub = "archivos" | "hub";

const VIEWS: { id: MemoryViewId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "lista", label: "Lista", icon: List },
  { id: "2d", label: "2D", icon: Network },
  { id: "3d", label: "3D", icon: Boxes },
  { id: "fuentes", label: "Fuentes", icon: Server },
];

export default function MemoryViews({
  brainId,
  brainName,
  initialView = "lista",
  initialSub = "archivos",
  onViewChange,
}: {
  brainId: string | null;
  brainName?: string;
  initialView?: MemoryViewId;
  initialSub?: MemoryListSub;
  /** Notifica cambios de vista (para deep-link / query params). */
  onViewChange?: (view: MemoryViewId, sub: MemoryListSub) => void;
}) {
  const [view, setView] = useState<MemoryViewId>(initialView);
  const [sub, setSub] = useState<MemoryListSub>(initialSub);
  // Archivo/memoria a enfocar tras un clic de nodo en 2D/3D.
  const [focusFileId, setFocusFileId] = useState<string | null>(null);

  // Sincroniza si cambian los valores iniciales (deep-link externo).
  useEffect(() => { setView(initialView); }, [initialView]);
  useEffect(() => { setSub(initialSub); }, [initialSub]);
  useEffect(() => { onViewChange?.(view, sub); }, [view, sub, onViewChange]);

  const goView = (v: MemoryViewId) => setView(v);

  // Clic en un nodo de ARCHIVO en la malla 3D → abre Archivos con ese archivo.
  const openFileFromNode = (fileId: string) => {
    setFocusFileId(fileId);
    setSub("archivos");
    setView("lista");
  };

  return (
    <div className="space-y-3">
      {/* Toggle principal de vistas */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-black/40 p-1">
          {VIEWS.map((v) => {
            const Icon = v.icon;
            return (
              <button
                key={v.id}
                onClick={() => goView(v.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition",
                  view === v.id ? "bg-cyan-500/20 text-cyan-200" : "text-white/55 hover:text-white/80",
                )}
              >
                <Icon className="h-3.5 w-3.5" /> {v.label}
              </button>
            );
          })}
        </div>

        {/* Sub-toggle de la vista Lista: Archivos (.md) · Hub (memorias) */}
        {view === "lista" && (
          <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-black/40 p-1">
            <button
              onClick={() => setSub("archivos")}
              className={cn("flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition", sub === "archivos" ? "bg-violet-500/20 text-violet-200" : "text-white/55 hover:text-white/80")}
            >
              <FileText className="h-3.5 w-3.5" /> Archivos .md
            </button>
            <button
              onClick={() => setSub("hub")}
              className={cn("flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition", sub === "hub" ? "bg-fuchsia-500/20 text-fuchsia-200" : "text-white/55 hover:text-white/80")}
            >
              <Brain className="h-3.5 w-3.5" /> Hub
            </button>
          </div>
        )}

        <span className="text-[11px] text-white/40 ml-auto hidden sm:inline">
          {view === "lista" && sub === "archivos" && "Archivos .md del cerebro (soul · memory · dream · skills · apis…)."}
          {view === "lista" && sub === "hub" && "Memorias del cerebro (tabla memories) con badges y sync."}
          {view === "2d" && "Grafo de relaciones (wikilinks + tipos). Clic en un nodo para editarlo."}
          {view === "3d" && "Malla 3D del cerebro. Clic en un archivo para abrir su editor."}
          {view === "fuentes" && "Fuentes de memoria: OS, Obsidian, servidor externo y memory_root."}
        </span>
      </div>

      {/* Contenido de la vista activa */}
      {view === "lista" && sub === "archivos" && <MemoriaPanel brainId={brainId} focusFileId={focusFileId} />}
      {view === "lista" && sub === "hub" && <MemoryHub brainId={brainId} brainName={brainName} focusMemoryId={focusFileId} />}
      {view === "2d" && (
        <div className="min-h-[62vh] h-[62vh] rounded-2xl overflow-hidden border border-white/10">
          <MemoryGraph brainId={brainId} className="h-full w-full" />
        </div>
      )}
      {view === "3d" && (
        <div className="min-h-[62vh] h-[62vh] rounded-2xl overflow-hidden border border-white/10">
          <MemoryMesh3D brainMode brainId={brainId} onSelectMemory={openFileFromNode} className="h-full w-full" />
        </div>
      )}
      {view === "fuentes" && <MemorySourcesPanel brainId={brainId} brainName={brainName} />}
    </div>
  );
}
