"use client";

// ════════════════════════════════════════════════════════════════════════════
// VersionsDialog — historial de versiones de un ítem (Adenda 65, §13).
// Lista "Actual" + snapshots anteriores; cada uno permite "Comparar con
// actual" (diff de líneas simple) y "Restaurar" (snapshotea el estado actual
// antes, así la restauración misma es deshacible).
// ════════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { History, RotateCcw, GitCompare, Clock } from "lucide-react";
import type { SavedItem, ItemVersionEntry } from "@/lib/library/entity-library";
import { simpleLineDiff } from "./finder-types";

export interface VersionsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    item: SavedItem;
    onRestore: (versionId: string) => void;
}

function textOf(v: Pick<ItemVersionEntry, "content" | "note" | "title">): string {
    return v.content ?? v.note ?? v.title ?? "";
}

export function VersionsDialog({ open, onOpenChange, item, onRestore }: VersionsDialogProps) {
    const [compareId, setCompareId] = useState<string | null>(null);
    const versions = item.versions ?? [];

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) setCompareId(null); onOpenChange(o); }}>
            <DialogContent className="max-w-lg border-white/10 bg-black/90 text-white backdrop-blur-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
                        <History className="h-4 w-4 text-primary" /> Versiones · {item.title}
                    </DialogTitle>
                    <DialogDescription>
                        {versions.length === 0
                            ? "Aún no hay historial: se guarda automáticamente cada vez que edites este ítem."
                            : `${versions.length} versión${versions.length > 1 ? "es" : ""} anteriores guardadas.`}
                    </DialogDescription>
                </DialogHeader>

                <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                    <div className="rounded-xl border border-primary/25 bg-primary/5 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">Actual</p>
                        <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-white/70">{textOf(item) || "(sin contenido)"}</p>
                    </div>

                    {versions.map((v) => (
                        <div key={v.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                    <Clock className="h-3 w-3" /> {new Date(v.at).toLocaleString("es-ES")}
                                    {v.label ? ` · ${v.label}` : ""}
                                </p>
                                <div className="flex items-center gap-1.5">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 cursor-pointer gap-1 px-2 text-[11px]"
                                        onClick={() => setCompareId((prev) => (prev === v.id ? null : v.id))}
                                    >
                                        <GitCompare className="h-3 w-3" /> Comparar
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="h-7 cursor-pointer gap-1 border-white/15 px-2 text-[11px]"
                                        onClick={() => onRestore(v.id)}
                                    >
                                        <RotateCcw className="h-3 w-3" /> Restaurar
                                    </Button>
                                </div>
                            </div>
                            {compareId === v.id && (
                                <div className="mt-2 max-h-48 overflow-y-auto rounded-lg bg-black/40 p-2 font-mono text-[10.5px] leading-relaxed">
                                    {simpleLineDiff(textOf(v), textOf(item)).map((line, i) => (
                                        <div
                                            key={i}
                                            className={cn(
                                                "whitespace-pre-wrap px-1",
                                                line.kind === "add" && "bg-emerald-500/15 text-emerald-200",
                                                line.kind === "remove" && "bg-rose-500/15 text-rose-200 line-through decoration-rose-400/60",
                                            )}
                                        >
                                            {line.kind === "add" ? "+ " : line.kind === "remove" ? "- " : "  "}
                                            {line.text || " "}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default VersionsDialog;
