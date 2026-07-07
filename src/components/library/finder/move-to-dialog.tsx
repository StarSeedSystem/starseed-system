"use client";

// MoveToDialog — selector de carpeta destino (árbol plano indentado) para
// "Mover a…" de ítems o para re-anidar una carpeta.

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Folder, FolderOpen } from "lucide-react";
import { buildFolderTree } from "./finder-types";
import type { LibraryFolder } from "@/lib/library/entity-library";

export interface MoveToDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    folders: LibraryFolder[];
    /** Carpetas a excluir del árbol de destino (p.ej. la propia carpeta y sus descendientes al mover una carpeta). */
    excludeIds?: Set<string>;
    onConfirm: (folderId: string | null) => void;
}

export function MoveToDialog({ open, onOpenChange, folders, excludeIds, onConfirm }: MoveToDialogProps) {
    const [target, setTarget] = useState<string | null>(null);
    const tree = buildFolderTree(folders.filter((f) => !excludeIds?.has(f.id)));

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
                        <FolderOpen className="h-3.5 w-3.5 shrink-0" /> Raíz (sin carpeta)
                    </button>
                    {tree.map(renderNode)}
                </div>
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
                        Mover aquí
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default MoveToDialog;
