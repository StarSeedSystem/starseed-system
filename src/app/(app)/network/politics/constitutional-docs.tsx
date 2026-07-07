"use client";

// StarSeed · Área Política · Judicial — Referencia a los documentos
// constitucionales (fuente de verdad, CLAUDE.md §10). Enlaces estáticos: no se
// hace fetch de contenido (fuera de alcance / sin acceso a Drive aquí).

import { GlassCard } from "@/components/ui/glass-card";
import { BookMarked, ExternalLink, Landmark } from "lucide-react";
import { CONSTITUTIONAL_DOCUMENTS } from "@/lib/governance/political";

export function ConstitutionalDocsPanel() {
  return (
    <GlassCard className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <Landmark className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Documentos constitucionales</span>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Toda consulta de constitucionalidad y toda revisión judicial se resuelve conforme a estos documentos —
        autoridad máxima del sistema (CLAUDE.md §10).
      </p>
      <div className="space-y-1.5">
        {CONSTITUTIONAL_DOCUMENTS.map((doc) => (
          <a
            key={doc.url}
            href={doc.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm transition-colors hover:border-primary/40"
          >
            <span className="flex items-center gap-2">
              <BookMarked className="h-3.5 w-3.5 text-muted-foreground" />
              {doc.title}
            </span>
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </a>
        ))}
      </div>
    </GlassCard>
  );
}

export default ConstitutionalDocsPanel;
