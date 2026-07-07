"use client";

// ════════════════════════════════════════════════════════════════════════════
// BranchesDialog — vista de linaje de ramas de un ítem + fusión con confirmación
// (Adenda 65, §14). Si el ítem ES una rama, muestra su origen ("Fusionar con
// origen"); siempre muestra las ramas que apuntan a este ítem ("Fusionar aquí").
// ════════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { GitBranch, GitMerge, ArrowUpRight } from "lucide-react";
import type { EntityLibraryDoc, SavedItem } from "@/lib/library/entity-library";
import { branchesOf, originOfBranch } from "./finder-types";

export interface BranchesDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    doc: EntityLibraryDoc;
    item: SavedItem;
    onMerge: (branchItemId: string, removeAfter: boolean) => void;
}

function ConfirmMergeRow({ label, onConfirm }: { label: string; onConfirm: (removeAfter: boolean) => void }) {
    const [confirming, setConfirming] = useState(false);
    const [removeAfter, setRemoveAfter] = useState(false);

    if (!confirming) {
        return (
            <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 shrink-0 cursor-pointer gap-1 border-emerald-500/30 px-2 text-[11px] text-emerald-300 hover:bg-emerald-500/10"
                onClick={() => setConfirming(true)}
            >
                <GitMerge className="h-3 w-3" /> {label}
            </Button>
        );
    }
    return (
        <div className="flex w-full flex-col gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2">
            <p className="text-[11px] text-emerald-200">
                ¿Fusionar? Se sobrescriben los campos del origen (reversible después con «Restaurar» en Versiones).
            </p>
            <label className="flex cursor-pointer items-center gap-1.5 text-[10px] text-muted-foreground">
                <input
                    type="checkbox"
                    checked={removeAfter}
                    onChange={(e) => setRemoveAfter(e.target.checked)}
                    className="cursor-pointer accent-emerald-500"
                />
                Eliminar esta rama tras fusionar
            </label>
            <div className="flex items-center gap-1.5">
                <Button
                    type="button"
                    size="sm"
                    className="h-7 cursor-pointer bg-emerald-600 px-2 text-[11px] text-white hover:bg-emerald-500"
                    onClick={() => {
                        onConfirm(removeAfter);
                        setConfirming(false);
                    }}
                >
                    Confirmar fusión
                </Button>
                <Button type="button" size="sm" variant="ghost" className="h-7 cursor-pointer px-2 text-[11px]" onClick={() => setConfirming(false)}>
                    Cancelar
                </Button>
            </div>
        </div>
    );
}

export function BranchesDialog({ open, onOpenChange, doc, item, onMerge }: BranchesDialogProps) {
    const origin = item.type === "branch" ? originOfBranch(doc, item) : undefined;
    const children = branchesOf(doc, item.id);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md border-white/10 bg-black/90 text-white backdrop-blur-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
                        <GitBranch className="h-4 w-4 text-primary" /> Ramas · {item.title}
                    </DialogTitle>
                    <DialogDescription>Linaje de ramificaciones («Replicar») de este ítem.</DialogDescription>
                </DialogHeader>

                <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
                    {item.type === "branch" && (
                        <div>
                            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Origen</p>
                            {origin ? (
                                <div className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
                                    <span className="min-w-0 flex-1 truncate text-xs">{origin.title}</span>
                                    <ConfirmMergeRow label="Fusionar con origen" onConfirm={(removeAfter) => onMerge(item.id, removeAfter)} />
                                </div>
                            ) : (
                                <p className="text-[11px] text-muted-foreground">No se pudo resolver el origen (puede haberse eliminado).</p>
                            )}
                        </div>
                    )}

                    <div>
                        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Ramas de este ítem {children.length > 0 ? `(${children.length})` : ""}
                        </p>
                        {children.length === 0 ? (
                            <p className="text-[11px] text-muted-foreground">Nadie ha replicado (ramificado) este ítem todavía.</p>
                        ) : (
                            <div className="space-y-2">
                                {children.map((b) => (
                                    <div key={b.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
                                        <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-xs">
                                            <ArrowUpRight className="h-3 w-3 shrink-0 text-muted-foreground" /> {b.title}
                                        </span>
                                        <ConfirmMergeRow label="Fusionar aquí" onConfirm={(removeAfter) => onMerge(b.id, removeAfter)} />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default BranchesDialog;
