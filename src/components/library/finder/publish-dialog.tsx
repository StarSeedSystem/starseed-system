"use client";

// ════════════════════════════════════════════════════════════════════════════
// PublishDialog — "Publicar en la Librería…" (un ítem) y "Publicar carpeta
// completa…" (todos los ítems de una carpeta, conservando estructura). Vuelca
// a `library_public_items` vía lib/library/public-catalog.ts. Los originales
// quedan vinculados (payload.ref) — nunca se duplica el contenido a ciegas.
// ════════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Package, FolderUp } from "lucide-react";
import { PUBLIC_CATEGORIES, publishItem, publishFolder, type PublicCategory } from "@/lib/library/public-catalog";
import type { EntityRef } from "@/lib/sync/entity-state";
import type { EntityLibraryDoc, SavedItem } from "@/lib/library/entity-library";
import { toFileLike } from "./item-meta";

const CATEGORY_LABEL: Record<PublicCategory, string> = {
    app: "Apps", widget: "Widgets", page: "Páginas", publication: "Publicaciones",
    board: "Pizarras", research: "Investigación", project: "Proyectos", design: "Diseño",
    animation: "Animación", function: "Funciones", "ai-source": "Fuentes IA", repo: "Repos",
    agent: "Agentes", otro: "Otro",
};

interface SingleItemProps {
    mode: "item";
    item: SavedItem;
}
interface FolderProps {
    mode: "folder";
    folderId: string | null;
    folderName: string;
}

export type PublishDialogProps = (SingleItemProps | FolderProps) & {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    entityRef: EntityRef;
    doc: EntityLibraryDoc;
};

export function PublishDialog(props: PublishDialogProps) {
    const { open, onOpenChange, entityRef, doc } = props;
    const [category, setCategory] = useState<PublicCategory>("otro");
    const [destFolder, setDestFolder] = useState("");
    const [recursive, setRecursive] = useState(true);
    const [busy, setBusy] = useState(false);

    const handlePublish = async () => {
        setBusy(true);
        try {
            if (props.mode === "item") {
                const file = toFileLike(props.item);
                const res = await publishItem({
                    category,
                    folder: destFolder,
                    name: props.item.title,
                    kind: props.item.type,
                    tags: props.item.tags,
                    payload: {
                        url: file.url ?? undefined,
                        route: props.item.route,
                        mime: file.mime ?? undefined,
                        type: file.type ?? undefined,
                        thumbnail: file.thumbnail ?? undefined,
                        content: file.content ?? undefined,
                        language: file.language ?? undefined,
                        description: file.description ?? undefined,
                        ref: { entityKind: entityRef.kind, entityId: entityRef.id, itemId: props.item.id },
                    },
                });
                if (res.ok) {
                    toast.success("Publicado en la Librería", { description: `«${props.item.title}» en ${CATEGORY_LABEL[category]}.` });
                    onOpenChange(false);
                } else {
                    toast.error(res.error ?? "No se pudo publicar");
                }
            } else {
                const res = await publishFolder({
                    entityRef,
                    items: doc.items,
                    folders: doc.folders,
                    sourceFolderId: props.folderId,
                    category,
                    destFolder,
                    recursive,
                });
                if (res.ok) {
                    toast.success("Carpeta publicada", { description: `${res.count} ítem(s) volcados en ${CATEGORY_LABEL[category]}.` });
                    onOpenChange(false);
                } else {
                    toast.error(res.error ?? "No se pudo publicar la carpeta");
                }
            }
        } finally {
            setBusy(false);
        }
    };

    const title = props.mode === "item" ? props.item.title : props.folderName;
    const Icon = props.mode === "item" ? Package : FolderUp;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-emerald-300" /> Publicar en la Librería
                    </DialogTitle>
                    <DialogDescription>
                        {props.mode === "item"
                            ? `«${title}» quedará visible en la sección Comunidad de la Librería. El original sigue vinculado.`
                            : `Todos los ítems de «${title}» se vuelcan conservando su estructura de carpetas.`}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                    <div>
                        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Categoría</label>
                        <Select value={category} onValueChange={(v) => setCategory(v as PublicCategory)}>
                            <SelectTrigger className="h-9 border-white/15 bg-black/30 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="border-white/10 bg-black/90 backdrop-blur-xl">
                                {PUBLIC_CATEGORIES.map((c) => (
                                    <SelectItem key={c} value={c} className="text-xs">
                                        {CATEGORY_LABEL[c]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div>
                        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Carpeta pública destino (opcional)</label>
                        <Input
                            value={destFolder}
                            onChange={(e) => setDestFolder(e.target.value)}
                            placeholder="p.ej. temas/cyberdelic"
                            className="h-9 border-white/15 bg-black/30 text-xs"
                        />
                    </div>

                    {props.mode === "folder" && (
                        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                            <input
                                type="checkbox"
                                checked={recursive}
                                onChange={(e) => setRecursive(e.target.checked)}
                                className="cursor-pointer accent-emerald-500"
                            />
                            Incluir subcarpetas
                        </label>
                    )}
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" className="cursor-pointer" onClick={() => onOpenChange(false)}>
                        Cancelar
                    </Button>
                    <Button
                        type="button"
                        onClick={() => void handlePublish()}
                        disabled={busy}
                        className="cursor-pointer gap-2 bg-emerald-600 text-white hover:bg-emerald-500"
                    >
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
                        Publicar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default PublishDialog;
