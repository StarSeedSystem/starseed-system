"use client";

// ════════════════════════════════════════════════════════════════════════════
// SaveToLibrary — acción global "Guardar en biblioteca…"
// ----------------------------------------------------------------------------
// Botón + popover reutilizable: elegir la ENTIDAD destino (Mi biblioteca, o
// cualquier página/grupo/comunidad/EF donde el usuario es dueño o miembro),
// una carpeta opcional dentro de esa biblioteca y una nota, y guarda una
// REFERENCIA (Entidad Única, nunca copia) vía lib/library/entity-library.
//
// Úsalo en cualquier ficha/tarjeta que quiera ofrecer "Guardar en biblioteca…":
// ficha de paquete (package-store), tarjeta de publicación (rich-post-card),
// ficha de archivo (app-file-page)…
//
// SOP: architecture/libreria-biblioteca-sync.md (§3)
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { BookMarked, Bookmark, Check, Folder, Loader2 } from "lucide-react";
import {
    saveItem,
    useMyLibraryDestinations,
    type SaveItemInput,
} from "@/lib/library/entity-library";

/* ───────────────────────── Componente principal ───────────────────────── */

export interface SaveToLibraryProps {
    /** Datos de la referencia a guardar (sin folderId: se elige en el popover). */
    item: Omit<SaveItemInput, "folderId">;
    /** Variante visual del disparador. */
    variant?: "button" | "icon" | "menu-item";
    /** Etiqueta del botón (por defecto "Guardar en biblioteca…"). */
    label?: string;
    className?: string;
}

export function SaveToLibrary({ item, variant = "button", label = "Guardar en biblioteca…", className }: SaveToLibraryProps) {
    const [open, setOpen] = useState(false);
    const { destinations, loading } = useMyLibraryDestinations();
    const [selectedKey, setSelectedKey] = useState<string>("");
    const [folderId, setFolderId] = useState<string>("__root__");
    const [note, setNote] = useState("");
    const [saving, setSaving] = useState(false);
    const [folders, setFolders] = useState<Array<{ id: string; name: string }>>([]);

    const selected = useMemo(
        () => destinations.find((d) => `${d.ref.kind}:${d.ref.id}` === selectedKey) ?? destinations[0],
        [destinations, selectedKey],
    );

    // Autoselecciona "Mi biblioteca" en cuanto resuelve destinos.
    useEffect(() => {
        if (!selectedKey && destinations.length > 0) {
            setSelectedKey(`${destinations[0].ref.kind}:${destinations[0].ref.id}`);
        }
    }, [destinations, selectedKey]);

    // Carga carpetas de la entidad seleccionada (solo cache local; no bloquea la UI).
    useEffect(() => {
        if (!selected) {
            setFolders([]);
            return;
        }
        let alive = true;
        import("@/lib/library/entity-library").then(({ listLibrary }) => {
            listLibrary(selected.ref).then((doc) => {
                if (alive) setFolders(doc.folders.map((f) => ({ id: f.id, name: f.name })));
            });
        });
        return () => {
            alive = false;
        };
    }, [selected]);

    const handleSave = async () => {
        if (!selected) {
            toast.error("Inicia sesión para guardar en una biblioteca");
            return;
        }
        setSaving(true);
        try {
            const res = await saveItem(
                selected.ref,
                { ...item, note: note.trim() || undefined },
                folderId === "__root__" ? null : folderId,
            );
            if (res.ok) {
                toast.success("Guardado en biblioteca", {
                    description: `«${item.title}» en ${selected.label}.`,
                });
                setOpen(false);
                setNote("");
            } else {
                toast.error("No se pudo guardar");
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
                title="Guardar en biblioteca…"
                aria-label="Guardar en biblioteca…"
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
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
                {trigger}
            </PopoverTrigger>
            <PopoverContent
                align="end"
                className="w-80 border-white/10 bg-black/85 p-4 text-white backdrop-blur-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <BookMarked className="h-4 w-4 text-primary" /> Guardar en biblioteca
                </div>

                {loading ? (
                    <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando tus bibliotecas…
                    </div>
                ) : destinations.length === 0 ? (
                    <p className="py-2 text-xs text-muted-foreground">
                        Inicia sesión para guardar referencias en tu biblioteca o en la de tus comunidades.
                    </p>
                ) : (
                    <div className="space-y-3">
                        <div>
                            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                Biblioteca destino
                            </label>
                            <Select value={selectedKey} onValueChange={setSelectedKey}>
                                <SelectTrigger className="h-9 border-white/15 bg-black/30 text-xs">
                                    <SelectValue placeholder="Elige una biblioteca" />
                                </SelectTrigger>
                                <SelectContent className="border-white/10 bg-black/90 backdrop-blur-xl">
                                    {destinations.map((d) => (
                                        <SelectItem key={`${d.ref.kind}:${d.ref.id}`} value={`${d.ref.kind}:${d.ref.id}`} className="text-xs">
                                            {d.label}
                                            {d.hint ? ` · ${d.hint}` : ""}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                Carpeta (opcional)
                            </label>
                            <Select value={folderId} onValueChange={setFolderId}>
                                <SelectTrigger className="h-9 border-white/15 bg-black/30 text-xs">
                                    <SelectValue placeholder="Sin carpeta" />
                                </SelectTrigger>
                                <SelectContent className="border-white/10 bg-black/90 backdrop-blur-xl">
                                    <SelectItem value="__root__" className="text-xs">
                                        <span className="flex items-center gap-1.5">
                                            <Folder className="h-3 w-3" /> Sin carpeta (raíz)
                                        </span>
                                    </SelectItem>
                                    {folders.map((f) => (
                                        <SelectItem key={f.id} value={f.id} className="text-xs">
                                            <span className="flex items-center gap-1.5">
                                                <Folder className="h-3 w-3" /> {f.name}
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                Nota (opcional)
                            </label>
                            <Input
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                placeholder="Por qué guardas esto…"
                                className="h-9 border-white/15 bg-black/30 text-xs"
                            />
                        </div>

                        <Button
                            type="button"
                            onClick={() => void handleSave()}
                            disabled={saving || !selected}
                            className="w-full cursor-pointer gap-2 bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-500"
                        >
                            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                            Guardar referencia
                        </Button>
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
}

export default SaveToLibrary;
