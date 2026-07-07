"use client";

// TagsDialog — editor de etiquetas de un ítem (chips + input con Enter/coma).

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Tags } from "lucide-react";

export interface TagsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    initialTags: string[];
    onSave: (tags: string[]) => void;
}

export function TagsDialog({ open, onOpenChange, title, initialTags, onSave }: TagsDialogProps) {
    const [tags, setTags] = useState<string[]>(initialTags);
    const [raw, setRaw] = useState("");

    const commit = () => {
        const t = raw.trim().replace(/^#+/, "");
        if (t && !tags.includes(t)) setTags((prev) => [...prev, t]);
        setRaw("");
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(o) => {
                if (o) {
                    setTags(initialTags);
                    setRaw("");
                }
                onOpenChange(o);
            }}
        >
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Tags className="h-4 w-4" /> Etiquetas · {title}
                    </DialogTitle>
                </DialogHeader>
                <div className="flex flex-wrap gap-1.5">
                    {tags.map((t) => (
                        <span key={t} className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs">
                            #{t}
                            <button type="button" onClick={() => setTags((prev) => prev.filter((x) => x !== t))} className="cursor-pointer text-muted-foreground hover:text-rose-300">
                                <X className="h-3 w-3" />
                            </button>
                        </span>
                    ))}
                </div>
                <Input
                    value={raw}
                    onChange={(e) => setRaw(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === ",") {
                            e.preventDefault();
                            commit();
                        }
                    }}
                    placeholder="Nueva etiqueta… (Enter para añadir)"
                    className="h-9 rounded-lg border-white/10 bg-black/20 text-xs"
                />
                <DialogFooter>
                    <Button type="button" variant="outline" className="cursor-pointer" onClick={() => onOpenChange(false)}>
                        Cancelar
                    </Button>
                    <Button
                        type="button"
                        className="cursor-pointer"
                        onClick={() => {
                            onSave(tags);
                            onOpenChange(false);
                        }}
                    >
                        Guardar etiquetas
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default TagsDialog;
