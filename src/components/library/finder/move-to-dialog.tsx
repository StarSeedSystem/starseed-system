"use client";

// MoveToDialog — selector de folder destino (árbol plano indentado) para
// "Mover a…" de ítems o para re-anidar un folder.
// Patrón Spacedrive v2: validar → vista previa → ejecutar.

import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Folder, FolderOpen, AlertCircle } from "lucide-react";
import { buildFolderTree } from "./finder-types";
import type { LibraryFolder, SavedItem, EntityRef, EntityLibraryDoc } from "@/lib/library/entity-library";
import { planificar, resumenPlan, type OperacionBiblioteca, type PlanBiblioteca } from "@/lib/library/biblioteca-plan";

export interface MoveToDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    folders: LibraryFolder[];
    items: SavedItem[];
    entityRef: EntityRef;
    doc: EntityLibraryDoc;
    canWrite: boolean;
    excludeIds?: Set<string>;
    onConfirm: (folderId: string | null) => void;
}

export function MoveToDialog({ open, onOpenChange, folders, items, entityRef, doc, canWrite, excludeIds, onConfirm }: MoveToDialogProps) {
    const [target, setTarget] = useState<string | null>(null);
    const tree = buildFolderTree(folders.filter((f) => !excludeIds?.has(f.id)));

    const plan = useMemo(() => {
        if (!target || items.length === 0) return null;
        const op: OperacionBiblioteca = {
            tipo: "mover",
            origen: entityRef,
            destino: entityRef,
            itemIds: items.map((it) => it.id),
        };
        const instantaneas: Record<string, EntityLibraryDoc> = {};
        const origenKey = `${entityRef.kind}:${entityRef.id}`;
        instantaneas[origenKey] = doc;
        const permisos = {
            puedeVer: () => true,
            puedeEditar: () => canWrite,
        };
        return planificar(op, instantaneas, permisos);
    }, [target, items, entityRef, doc, canWrite]);

    const resumen = plan ? resumenPlan(plan) : `Mover ${items.length} ítem${items.length > 1 ? "s" : ""}.`;

    const renderNode = (node: ReturnType<typeof buildFolderTree>[number]): React.ReactNode => (
        <div key={node.folder.id}>
            <button
                type="button"
                onClick={() => setTarget(node.folder.id)}
                style={{ paddingLeft: 8 + node.depth * 16 }}
                className={cn(
                    "flex w-full cursor-pointer items-center gap-2 rounded-lg py-1.5 pr-2 text-left text-xs font-medium transition-colors",
                    target === node.folder.id ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-white/5 hover:text-white",
                )}
            >
                {target === node.folder.id ? <FolderOpen className="h-3.5 w-3.5 shrink-0" /> : <Folder className="h-3.5 w-3.5 shrink-0" />}
                <span className="min-w-0 flex-1 truncate">{node.folder.name}</span>
            </button>
            {node.children.map(renderNode)}
        </div>
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>Mover a…</DialogTitle>
                </DialogHeader>
                <div className="max-h-72 space-y-0.5 overflow-y-auto rounded-lg border border-white/10 bg-black/20 p-1.5">
                    <button
                        type="button"
                        onClick={() => setTarget(null)}
                        className={cn(
                            "flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-medium transition-colors",
                            target === null ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-white/5 hover:text-white",
                        )}
                    >
                        <FolderOpen className="h-3.5 w-3.5 shrink-0" /> Raíz (sin folder)
                    </button>
                    {tree.map(renderNode)}
                </div>
                {plan && (plan.avisos.length > 0 || plan.vistaPrevia.ultimaCopia.length > 0) && (
                    <div className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2">
                        <div className="flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                            <div className="text-xs text-amber-100">
                                {resumen}
                                {plan.avisos.map((a, i) => (
                                    <span key={i} className="block mt-1">{a}</span>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
                {!plan && (
                    <div className="mt-2 text-xs text-muted-foreground">
                        {resumen}
                    </div>
                )}
                <DialogFooter>
                    <Button type="button" variant="outline" className="cursor-pointer" onClick={() => onOpenChange(false)}>
                        Cancelar
                    </Button>
                    <Button
                        type="button"
                        className="cursor-pointer"
                        onClick={() => {
                            onConfirm(target);
                            onOpenChange(false);
                        }}
                    >
                        {resumen}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default MoveToDialog;