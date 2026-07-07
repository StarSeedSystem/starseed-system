"use client";

// ════════════════════════════════════════════════════════════════════════════
// EditItemDialog — editar título/nota/contenido de texto de un ítem guardado
// (Adenda 65, §13). Antes no existía ninguna vía de UI para esto; cada guardado
// aquí pasa por `updateItemContent()`, que versiona automáticamente el estado
// previo si algo cambió de verdad.
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PenSquare } from "lucide-react";
import type { SavedItem, VersionablePatch } from "@/lib/library/entity-library";

export interface EditItemDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    item: SavedItem;
    onSave: (patch: VersionablePatch) => void;
}

export function EditItemDialog({ open, onOpenChange, item, onSave }: EditItemDialogProps) {
    const [title, setTitle] = useState(item.title);
    const [note, setNote] = useState(item.note ?? "");
    const [content, setContent] = useState(item.content ?? "");

    useEffect(() => {
        if (open) {
            setTitle(item.title);
            setNote(item.note ?? "");
            setContent(item.content ?? "");
        }
    }, [open, item]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <PenSquare className="h-4 w-4" /> Editar
                    </DialogTitle>
                    <DialogDescription>Guardar aquí crea una versión con el estado anterior (§13).</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    <div>
                        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Título</label>
                        <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-9 border-white/15 bg-black/30 text-xs" />
                    </div>
                    <div>
                        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Nota</label>
                        <Textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            rows={2}
                            className="border-white/15 bg-black/30 text-xs"
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            Contenido de texto (opcional — código/markdown/notas embebidas)
                        </label>
                        <Textarea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            rows={8}
                            placeholder="Contenido de texto de este ítem…"
                            className="border-white/15 bg-black/30 font-mono text-xs"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" className="cursor-pointer" onClick={() => onOpenChange(false)}>
                        Cancelar
                    </Button>
                    <Button
                        type="button"
                        className="cursor-pointer"
                        onClick={() => {
                            onSave({
                                title: title.trim() || item.title,
                                note: note.trim() || undefined,
                                content: content.trim() || undefined,
                            });
                            onOpenChange(false);
                        }}
                    >
                        Guardar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default EditItemDialog;
