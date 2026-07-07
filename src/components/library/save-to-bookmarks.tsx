"use client";

// ════════════════════════════════════════════════════════════════════════════
// SaveToBookmarks — botón reutilizable "Guardar en Marcadores"
// ----------------------------------------------------------------------------
// Captura rápida de un enlace, nota o imagen y lo guarda como `SavedItem`
// tipo "bookmark" en la carpeta "Marcadores" de una biblioteca (por defecto,
// "Mi biblioteca" del usuario con sesión) — ver src/lib/library/bookmarks.ts.
//
// Úsalo en cualquier superficie que quiera ofrecer "Guardar en Marcadores…":
// cabecera del área Biblioteca (/library), tarjetas de enlaces externos,
// resultados de búsqueda web, etc. No sustituye a `SaveToLibrary` (esa guarda
// REFERENCIAS a recursos del propio OS con selector de destino); esta es la
// captura rápida de "guardar cualquier cosa de fuera" al estilo Karakeep.
// ════════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Bookmark, Check, Loader2, Sparkles, X } from "lucide-react";
import { saveBookmark, suggestBookmarkTags, type BookmarkKind } from "@/lib/library/bookmarks";
import type { EntityRef } from "@/lib/library/entity-library";

export interface SaveToBookmarksProps {
    /** Prellenado opcional (p.ej. un enlace ya conocido en el OS). */
    defaults?: { url?: string; title?: string; note?: string; kind?: BookmarkKind };
    /** Biblioteca destino; por defecto "Mi biblioteca" (usuario con sesión). */
    libraryRef?: EntityRef;
    variant?: "button" | "icon" | "menu-item";
    label?: string;
    className?: string;
}

const KIND_LABELS: Record<BookmarkKind, string> = {
    enlace: "Enlace",
    nota: "Nota",
    imagen: "Imagen",
};

export function SaveToBookmarks({ defaults, libraryRef, variant = "button", label = "Guardar en Marcadores…", className }: SaveToBookmarksProps) {
    const [open, setOpen] = useState(false);
    const [kind, setKind] = useState<BookmarkKind>(defaults?.kind ?? (defaults?.url ? "enlace" : "nota"));
    const [url, setUrl] = useState(defaults?.url ?? "");
    const [title, setTitle] = useState(defaults?.title ?? "");
    const [note, setNote] = useState(defaults?.note ?? "");
    const [tagsText, setTagsText] = useState("");
    const [suggesting, setSuggesting] = useState(false);
    const [saving, setSaving] = useState(false);

    const reset = () => {
        setKind(defaults?.kind ?? (defaults?.url ? "enlace" : "nota"));
        setUrl(defaults?.url ?? "");
        setTitle(defaults?.title ?? "");
        setNote(defaults?.note ?? "");
        setTagsText("");
    };

    const handleSuggest = async () => {
        if (!title.trim() && !url.trim()) {
            toast.message("Añade un título o una URL primero");
            return;
        }
        setSuggesting(true);
        try {
            const tags = await suggestBookmarkTags({
                title: title.trim() || url.trim(),
                url: url.trim() || undefined,
                note: note.trim() || undefined,
                kind,
            });
            setTagsText(tags.join(", "));
            toast.success("Aurora sugirió etiquetas", { description: tags.map((t) => `#${t}`).join(" ") });
        } finally {
            setSuggesting(false);
        }
    };

    const handleSave = async () => {
        if (!title.trim() && !url.trim() && !note.trim()) {
            toast.error("Escribe al menos un título, una URL o una nota");
            return;
        }
        setSaving(true);
        try {
            const tags = tagsText
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean);
            const res = await saveBookmark(
                {
                    kind,
                    title: title.trim() || undefined,
                    url: url.trim() || undefined,
                    note: note.trim() || undefined,
                    tags: tags.length ? tags : undefined,
                },
                libraryRef,
            );
            if (res.ok) {
                toast.success("Guardado en Marcadores", {
                    description: res.tags.length ? `Etiquetas: ${res.tags.map((t) => `#${t}`).join(" ")}` : undefined,
                });
                setOpen(false);
                reset();
            } else {
                toast.error("No se pudo guardar", { description: res.error });
            }
        } finally {
            setSaving(false);
        }
    };

    const trigger =
        variant === "icon" ? (
            <Button
                type="button"
                size="icon"
                variant="ghost"
                className={cn("h-8 w-8 cursor-pointer text-muted-foreground hover:text-white", className)}
                title="Guardar en Marcadores…"
                aria-label="Guardar en Marcadores…"
            >
                <Bookmark className="h-4 w-4" />
            </Button>
        ) : variant === "menu-item" ? (
            <button
                type="button"
                className={cn(
                    "flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-white/5",
                    className,
                )}
            >
                <Bookmark className="h-4 w-4" /> {label}
            </button>
        ) : (
            <Button
                type="button"
                size="sm"
                variant="outline"
                className={cn("gap-1.5 border-white/15 text-xs hover:bg-white/10 cursor-pointer", className)}
            >
                <Bookmark className="h-3.5 w-3.5" /> {label}
            </Button>
        );

    return (
        <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
            <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
                {trigger}
            </PopoverTrigger>
            <PopoverContent
                align="end"
                className="w-80 border-white/10 bg-black/85 p-4 text-white backdrop-blur-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <Bookmark className="h-4 w-4 text-primary" /> Guardar en Marcadores
                </div>

                <div className="space-y-3">
                    <div>
                        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            Tipo
                        </label>
                        <Select value={kind} onValueChange={(v) => setKind(v as BookmarkKind)}>
                            <SelectTrigger className="h-9 border-white/15 bg-black/30 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="border-white/10 bg-black/90 backdrop-blur-xl">
                                {(Object.keys(KIND_LABELS) as BookmarkKind[]).map((k) => (
                                    <SelectItem key={k} value={k} className="text-xs">
                                        {KIND_LABELS[k]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {kind !== "nota" && (
                        <div>
                            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                URL
                            </label>
                            <Input
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                placeholder="https://…"
                                className="h-9 border-white/15 bg-black/30 text-xs"
                            />
                        </div>
                    )}

                    <div>
                        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            Título
                        </label>
                        <Input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Título del marcador…"
                            className="h-9 border-white/15 bg-black/30 text-xs"
                        />
                    </div>

                    <div>
                        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            {kind === "nota" ? "Contenido" : "Nota (opcional)"}
                        </label>
                        <Textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder={kind === "nota" ? "Escribe tu nota…" : "Por qué guardas esto…"}
                            className="min-h-16 border-white/15 bg-black/30 text-xs"
                        />
                    </div>

                    <div>
                        <div className="mb-1 flex items-center justify-between">
                            <label className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                Etiquetas
                            </label>
                            <button
                                type="button"
                                onClick={() => void handleSuggest()}
                                disabled={suggesting}
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-cyan-300 hover:text-cyan-200 disabled:opacity-50 cursor-pointer"
                            >
                                {suggesting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                                Sugerir con Aurora
                            </button>
                        </div>
                        <Input
                            value={tagsText}
                            onChange={(e) => setTagsText(e.target.value)}
                            placeholder="separadas, por, comas (o deja vacío y se sugieren solas)"
                            className="h-9 border-white/15 bg-black/30 text-xs"
                        />
                    </div>

                    <div className="flex gap-2">
                        <Button
                            type="button"
                            onClick={() => void handleSave()}
                            disabled={saving}
                            className="flex-1 cursor-pointer gap-2 bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-500"
                        >
                            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                            Guardar
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setOpen(false)}
                            className="cursor-pointer gap-1.5 text-xs text-muted-foreground hover:text-white"
                        >
                            <X className="h-3.5 w-3.5" /> Cancelar
                        </Button>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}

export default SaveToBookmarks;
