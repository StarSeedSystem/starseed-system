"use client";

/**
 * ── ExportGraphButton — Exporta mi grafo (Identidad Soberana) ────────────────
 * Popover con descarga JSON / CSV y copiar como Markdown. Feedback transitorio.
 */

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Download, FileJson, FileSpreadsheet, ClipboardCopy, Check } from "lucide-react";
import {
    buildExport, toJSON, toCSV, toMarkdown, downloadFile, copyText, exportFilename,
} from "@/lib/hub-social/export-graph";
import type { GraphNode, GraphMetrics, ActiveProfileLite } from "@/lib/hub-social/graph";

export function ExportGraphButton({
    mine, metrics, profile, disabled,
}: {
    mine: GraphNode[]; metrics: GraphMetrics; profile: ActiveProfileLite | null; disabled?: boolean;
}) {
    const [done, setDone] = useState<string | null>(null);
    const flash = (what: string) => { setDone(what); setTimeout(() => setDone(null), 1800); };

    const doc = () => buildExport(mine, metrics, profile);

    const onJSON = () => { if (downloadFile(exportFilename("json"), toJSON(doc()), "application/json")) flash("json"); };
    const onCSV = () => { if (downloadFile(exportFilename("csv"), toCSV(doc()), "text/csv")) flash("csv"); };
    const onMD = async () => { if (await copyText(toMarkdown(doc()))) flash("md"); };

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    disabled={disabled}
                    className="btn-pill min-h-[2.75rem] gap-1.5 border-cyan-500/30 text-cyan-200 hover:bg-cyan-500/10 sm:min-h-[2.25rem]"
                >
                    <Download className="h-3.5 w-3.5" /> Exportar mi grafo
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 border-white/12 bg-background/95 p-2 backdrop-blur-xl">
                <p className="px-2 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Identidad Soberana · tus datos
                </p>
                <div className="space-y-1">
                    <ExportRow icon={FileJson} label="Descargar JSON" hint="estructura completa" active={done === "json"} onClick={onJSON} />
                    <ExportRow icon={FileSpreadsheet} label="Descargar CSV" hint="para hojas de cálculo" active={done === "csv"} onClick={onCSV} />
                    <ExportRow icon={ClipboardCopy} label="Copiar como Markdown" hint="para pegar en cualquier sitio" active={done === "md"} onClick={() => void onMD()} />
                </div>
            </PopoverContent>
        </Popover>
    );
}

function ExportRow({
    icon: Icon, label, hint, active, onClick,
}: {
    icon: React.ComponentType<{ className?: string }>; label: string; hint: string; active: boolean; onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex w-full min-h-[2.75rem] cursor-pointer items-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-1.5 text-left transition-colors duration-200 hover:border-cyan-500/30 hover:bg-cyan-500/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:min-h-[2.5rem]"
        >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-white/10 bg-white/[0.04] text-cyan-200">
                {active ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Icon className="h-3.5 w-3.5" />}
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-foreground/90">{active ? "Listo" : label}</span>
                <span className="block truncate text-[10px] text-muted-foreground">{hint}</span>
            </span>
        </button>
    );
}

export default ExportGraphButton;
