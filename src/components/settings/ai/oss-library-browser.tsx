"use client";

// ════════════════════════════════════════════════════════════════
// OssLibraryBrowser — Catálogo incorporado de la Librería de Código
// Abierto. Reutilizable en CUALQUIER superficie de configuración
// (IA, MoA, canales, memorias, servidores, almacenamiento, plugins).
// Las opciones se leen de `@/lib/oss-library` y se actualizan desde
// la librería (LIBRARY_SOURCES).
// ════════════════════════════════════════════════════════════════

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Plus, BookMarked, Check } from "lucide-react";
import { getByCategory, OSS_CATEGORY_META, type OssCategory, type OssOption } from "@/lib/oss-library";

export function OssLibraryBrowser({
  category,
  onAdd,
  addedIds = [],
  initial = 6,
}: {
  category: OssCategory;
  onAdd?: (opt: OssOption) => void;
  addedIds?: string[];
  initial?: number;
}) {
  const meta = OSS_CATEGORY_META[category];
  const options = getByCategory(category);
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? options : options.slice(0, initial);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-muted-foreground">
        <BookMarked className="h-3.5 w-3.5" /> Librería de código abierto · {meta.label}
      </div>
      <p className="text-[11px] text-muted-foreground">{meta.hint} El catálogo se actualiza desde la librería.</p>

      <div className="grid sm:grid-cols-2 gap-2">
        {visible.map((o) => {
          const added = addedIds.includes(o.id);
          return (
            <div key={o.id} className="rounded-lg border border-white/5 bg-black/20 p-3 flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold flex items-center gap-1.5">{meta.emoji} {o.name}</span>
                <div className="flex items-center gap-1">
                  {o.moaNative && <Badge variant="outline" className="text-cyan-300 border-cyan-300/40 text-[9px]">MoA nativo</Badge>}
                  {!o.oss && <Badge variant="outline" className="text-amber-300 border-amber-300/40 text-[9px]">open-weight</Badge>}
                  {!o.maintained && <Badge variant="outline" className="text-rose-300 border-rose-300/40 text-[9px]">archivado</Badge>}
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground line-clamp-2">{o.description}</p>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-muted-foreground/70">{o.license}</span>
                <div className="flex items-center gap-1.5">
                  <a href={o.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-[10px] flex items-center gap-0.5">
                    repo <ExternalLink className="h-3 w-3" />
                  </a>
                  {onAdd && (
                    <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] gap-1" disabled={added} onClick={() => onAdd(o)}>
                      {added ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />} {added ? "Activo" : "Usar"}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {options.length > initial && (
        <Button variant="ghost" size="sm" className="text-[11px] h-7" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Ver menos" : `Ver todas (${options.length})`}
        </Button>
      )}
    </div>
  );
}
