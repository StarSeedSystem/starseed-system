"use client";

/*
 * MediaViewer — visor a pantalla completa (espíritu iOS/Mac) para un ítem de
 * media de la Galería: zoom, flechas, panel de info, acciones (compartir a
 * mensaje/historia, guardar en…, mover, eliminar) y edición básica real
 * (rotar + filtros CSS, exportados a canvas → nueva copia guardada).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
    X, ChevronLeft, ChevronRight, Info, MoreVertical, Send, Sparkles, FolderInput,
    Trash2, Pencil, RotateCw, Check, Loader2, ZoomIn, ZoomOut, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useModalA11y } from "@/hooks/use-modal-a11y";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import type { EntityRef, SavedItem, LibraryFolder } from "@/lib/library/entity-library";
import { mediaKindOf, formatLabelOf, saveMediaToLibrary, type MediaOrigin } from "@/lib/library/media-library";
import { findFileByUrl, humanFileSize } from "@/lib/files/os-files";
import { searchUsers, type OsProfile } from "@/lib/social/os-profiles";
import { createDm, sendMessage } from "@/lib/messages/dm";

const FILTER_PRESETS: Array<{ id: string; label: string; css: string }> = [
    { id: "original", label: "Original", css: "none" },
    { id: "bn", label: "Blanco y negro", css: "grayscale(1)" },
    { id: "sepia", label: "Sepia", css: "sepia(0.8)" },
    { id: "vivido", label: "Vívido", css: "saturate(1.6) contrast(1.12)" },
    { id: "frio", label: "Frío", css: "hue-rotate(180deg) saturate(1.1)" },
    { id: "calido", label: "Cálido", css: "sepia(0.3) saturate(1.3) hue-rotate(-10deg)" },
];

export interface MediaViewerProps {
    ref_: EntityRef;
    items: SavedItem[];
    index: number;
    onIndexChange: (i: number) => void;
    onClose: () => void;
    onChanged: () => void;
    onShareStory: (item: SavedItem) => void;
    onOpenSettings: (item: SavedItem) => void;
}

export function MediaViewer({ ref_, items, index, onIndexChange, onClose, onChanged, onShareStory, onOpenSettings }: MediaViewerProps) {
    const confirm = useConfirm();
    const item = items[index];
    const [showInfo, setShowInfo] = useState(false);
    const [zoom, setZoom] = useState(1);
    const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
    const [editing, setEditing] = useState(false);
    const [rotation, setRotation] = useState(0);
    const [filterId, setFilterId] = useState("original");
    const [saving, setSaving] = useState(false);
    const [shareOpen, setShareOpen] = useState(false);
    const [fileSize, setFileSize] = useState<number | undefined>(undefined);

    const mediaRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setZoom(1);
        setDims(null);
        setEditing(false);
        setRotation(0);
        setFilterId("original");
    }, [item?.id]);

    useEffect(() => {
        if (!showInfo || !item?.url) return;
        let alive = true;
        void findFileByUrl(item.url).then((f) => {
            if (alive) setFileSize(f?.size ?? undefined);
        });
        return () => {
            alive = false;
        };
    }, [showInfo, item?.url]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
            else if (e.key === "ArrowLeft" && index > 0) onIndexChange(index - 1);
            else if (e.key === "ArrowRight" && index < items.length - 1) onIndexChange(index + 1);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [index, items.length, onClose, onIndexChange]);

    // Accesibilidad: foco inicial, trampa de Tab y devolución de foco al cerrar.
    // Escape ya lo gestiona el efecto de arriba (combinado con ←/→), por eso
    // closeOnEscape: false aquí, para no duplicar el cierre.
    useModalA11y({ open: !!item, onClose, containerRef, closeOnEscape: false });

    if (!item) return null;
    const kind = mediaKindOf(item);

    const handleDelete = useCallback(async () => {
        if (!(await confirm({
            title: "Eliminar archivo",
            description: `¿Eliminar «${item.title}»? Esta acción no se puede deshacer.`,
            destructive: true,
        }))) return;
        const { removeItem } = await import("@/lib/library/entity-library");
        await removeItem(ref_, item.id);
        if (item.url) {
            const osFile = await findFileByUrl(item.url);
            if (osFile) {
                const { deleteFile } = await import("@/lib/files/os-files");
                await deleteFile(osFile.id);
            }
        }
        toast.success("Eliminado.");
        onChanged();
        onClose();
    }, [item, ref_, onChanged, onClose]);

    const handleMoveTo = useCallback(
        async (folderId: string | null) => {
            const { moveItem } = await import("@/lib/library/entity-library");
            await moveItem(ref_, item.id, folderId);
            toast.success("Movido.");
            onChanged();
        },
        [item, ref_, onChanged],
    );

    const [folders, setFolders] = useState<LibraryFolder[]>([]);
    const [moveOpen, setMoveOpen] = useState(false);
    useEffect(() => {
        if (!moveOpen) return;
        void (async () => {
            const { listLibrary } = await import("@/lib/library/entity-library");
            const doc = await listLibrary(ref_);
            setFolders(doc.folders);
        })();
    }, [moveOpen, ref_]);

    const handleSaveEdit = useCallback(async () => {
        if (kind !== "image" || !mediaRef.current) return;
        setSaving(true);
        try {
            const img = mediaRef.current as HTMLImageElement;
            const swap = rotation % 180 !== 0;
            const w = img.naturalWidth || dims?.w || 800;
            const h = img.naturalHeight || dims?.h || 600;
            const canvas = document.createElement("canvas");
            canvas.width = swap ? h : w;
            canvas.height = swap ? w : h;
            const ctx = canvas.getContext("2d");
            if (!ctx) throw new Error("Canvas no disponible.");
            const preset = FILTER_PRESETS.find((f) => f.id === filterId);
            if (preset && preset.css !== "none") (ctx as unknown as { filter: string }).filter = preset.css;
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.rotate((rotation * Math.PI) / 180);
            ctx.drawImage(img, -w / 2, -h / 2, w, h);
            const blob: Blob | null = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.95));
            if (!blob) throw new Error("No se pudo exportar la imagen editada.");
            const origin: MediaOrigin = "Importadas";
            const res = await saveMediaToLibrary(ref_, {
                file: blob,
                name: `editado-${Date.now()}.jpg`,
                origin,
                destFolderId: item.folderId ?? null,
                tags: [...item.tags, "editado"],
                note: "Copia editada (rotación/filtro)",
            });
            if (!res.ok) throw new Error(res.error || "No se pudo guardar la copia editada.");
            toast.success("Copia editada guardada junto al original.");
            setEditing(false);
            onChanged();
        } catch (e: any) {
            toast.error(e?.message || "No se pudo editar la imagen.");
        } finally {
            setSaving(false);
        }
    }, [kind, rotation, filterId, dims, item, ref_, onChanged]);

    const currentFilterCss = FILTER_PRESETS.find((f) => f.id === filterId)?.css ?? "none";

    return (
        <div
            ref={containerRef}
            className="fixed inset-0 z-[200] flex flex-col bg-black/95 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-label={`Visor de medios — ${item.title}`}
        >
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
                <button onClick={onClose} className="grid size-9 cursor-pointer place-items-center rounded-full text-white/80 hover:bg-white/10" title="Cerrar">
                    <X className="size-4" />
                </button>
                <div className="min-w-0 flex-1 text-center">
                    <p className="truncate text-sm font-semibold text-white">{item.title}</p>
                </div>
                <div className="flex items-center gap-1.5">
                    <button
                        onClick={() => setShowInfo((v) => !v)}
                        className={cn("grid size-9 cursor-pointer place-items-center rounded-full text-white/80 hover:bg-white/10", showInfo && "bg-white/15 text-white")}
                        title="Información"
                    >
                        <Info className="size-4" />
                    </button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button className="grid size-9 cursor-pointer place-items-center rounded-full text-white/80 hover:bg-white/10" title="Más acciones">
                                <MoreVertical className="size-4" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem className="cursor-pointer" onClick={() => setShareOpen(true)}>
                                <Send className="mr-2 size-3.5" /> Compartir por mensaje
                            </DropdownMenuItem>
                            <DropdownMenuItem className="cursor-pointer" onClick={() => onShareStory(item)}>
                                <Sparkles className="mr-2 size-3.5" /> Compartir como historia
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                className="cursor-pointer"
                                onClick={() => {
                                    toast.info("Tu archivo ya está en tu biblioteca: adjúntalo desde la pestaña «Bibliotecas» del compositor.");
                                    window.open("/publicar", "_blank");
                                }}
                            >
                                <Send className="mr-2 size-3.5 rotate-90" /> Compartir como publicación
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="cursor-pointer" onClick={() => setMoveOpen(true)}>
                                <FolderInput className="mr-2 size-3.5" /> Guardar en…
                            </DropdownMenuItem>
                            {kind === "image" && (
                                <DropdownMenuItem className="cursor-pointer" onClick={() => setEditing(true)}>
                                    <Pencil className="mr-2 size-3.5" /> Editar (rotar / filtros)
                                </DropdownMenuItem>
                            )}
                            <DropdownMenuItem className="cursor-pointer" onClick={() => onOpenSettings(item)}>
                                <Sparkles className="mr-2 size-3.5" /> Cerebros y permisos
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="cursor-pointer text-rose-400 focus:text-rose-400" onClick={() => void handleDelete()}>
                                <Trash2 className="mr-2 size-3.5" /> Eliminar
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {/* Cuerpo */}
            <div className="relative flex flex-1 items-center justify-center overflow-hidden">
                {index > 0 && (
                    <button
                        onClick={() => onIndexChange(index - 1)}
                        className="absolute left-2 z-10 grid size-10 cursor-pointer place-items-center rounded-full bg-black/40 text-white hover:bg-black/60"
                    >
                        <ChevronLeft className="size-5" />
                    </button>
                )}
                {index < items.length - 1 && (
                    <button
                        onClick={() => onIndexChange(index + 1)}
                        className="absolute right-2 z-10 grid size-10 cursor-pointer place-items-center rounded-full bg-black/40 text-white hover:bg-black/60"
                    >
                        <ChevronRight className="size-5" />
                    </button>
                )}

                <div
                    className="flex h-full w-full items-center justify-center overflow-auto"
                    onWheel={(e) => {
                        if (editing) return;
                        setZoom((z) => Math.min(4, Math.max(1, z + (e.deltaY < 0 ? 0.25 : -0.25))));
                    }}
                >
                    {kind === "image" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            ref={mediaRef as React.RefObject<HTMLImageElement>}
                            src={item.url}
                            alt={item.title}
                            onLoad={(e) => setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                            onClick={() => !editing && setZoom((z) => (z === 1 ? 2 : 1))}
                            className="max-h-full max-w-full cursor-zoom-in object-contain transition-transform duration-200"
                            style={{
                                transform: `scale(${zoom}) rotate(${editing ? rotation : 0}deg)`,
                                filter: editing ? currentFilterCss : "none",
                            }}
                        />
                    ) : (
                        <video
                            ref={mediaRef as React.RefObject<HTMLVideoElement>}
                            src={item.url}
                            controls
                            onLoadedMetadata={(e) => setDims({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })}
                            className="max-h-full max-w-full object-contain"
                        />
                    )}
                </div>

                {!editing && kind === "image" && (
                    <div className="absolute bottom-4 right-4 flex items-center gap-1 rounded-full bg-black/50 p-1">
                        <button onClick={() => setZoom((z) => Math.max(1, z - 0.5))} className="grid size-8 cursor-pointer place-items-center rounded-full text-white hover:bg-white/10">
                            <ZoomOut className="size-4" />
                        </button>
                        <span className="w-10 text-center text-xs text-white/80">{Math.round(zoom * 100)}%</span>
                        <button onClick={() => setZoom((z) => Math.min(4, z + 0.5))} className="grid size-8 cursor-pointer place-items-center rounded-full text-white hover:bg-white/10">
                            <ZoomIn className="size-4" />
                        </button>
                    </div>
                )}
            </div>

            {/* Barra de edición */}
            {editing && (
                <div className="flex shrink-0 flex-col gap-3 border-t border-white/10 bg-black/80 px-4 py-3">
                    <div className="flex items-center justify-between">
                        <Button variant="ghost" size="sm" onClick={() => setRotation((r) => (r + 90) % 360)} className="cursor-pointer text-white/80 hover:text-white">
                            <RotateCw className="mr-1.5 size-4" /> Rotar 90°
                        </Button>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={() => setEditing(false)} className="cursor-pointer">
                                Cancelar
                            </Button>
                            <Button size="sm" onClick={() => void handleSaveEdit()} disabled={saving} className="cursor-pointer">
                                {saving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Check className="mr-1.5 size-4" />}
                                Guardar copia
                            </Button>
                        </div>
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                        {FILTER_PRESETS.map((f) => (
                            <button
                                key={f.id}
                                onClick={() => setFilterId(f.id)}
                                className={cn(
                                    "shrink-0 cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                                    filterId === f.id ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-200" : "border-white/15 text-white/70 hover:border-white/30",
                                )}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Panel de información */}
            {showInfo && (
                <div className="absolute right-0 top-14 z-20 w-72 space-y-2 rounded-2xl border border-white/10 bg-black/90 p-4 text-sm text-white/85 shadow-2xl">
                    <InfoRow label="Nombre" value={item.title} />
                    <InfoRow label="Fecha" value={new Date(item.addedAt).toLocaleString("es")} />
                    <InfoRow label="Tamaño" value={humanFileSize(fileSize) || "—"} />
                    <InfoRow label="Dimensiones" value={dims ? `${dims.w}×${dims.h}px` : "—"} />
                    <InfoRow label="Formato" value={formatLabelOf(item.mime)} />
                    {item.tags.length > 0 && <InfoRow label="Etiquetas" value={item.tags.join(", ")} />}
                </div>
            )}

            {/* Diálogo mover */}
            {moveOpen && (
                <div className="absolute inset-0 z-30 grid place-items-center bg-black/60" onClick={() => setMoveOpen(false)}>
                    <div className="max-h-[70vh] w-80 overflow-y-auto rounded-2xl border border-white/10 bg-neutral-900 p-4" onClick={(e) => e.stopPropagation()}>
                        <p className="mb-3 text-sm font-bold text-white">Guardar en…</p>
                        <div className="space-y-1">
                            <button
                                onClick={() => {
                                    void handleMoveTo(null);
                                    setMoveOpen(false);
                                }}
                                className="block w-full cursor-pointer rounded-lg px-3 py-2 text-left text-xs text-white/80 hover:bg-white/10"
                            >
                                Raíz de la biblioteca
                            </button>
                            {folders.map((f) => (
                                <button
                                    key={f.id}
                                    onClick={() => {
                                        void handleMoveTo(f.id);
                                        setMoveOpen(false);
                                    }}
                                    className="block w-full cursor-pointer rounded-lg px-3 py-2 text-left text-xs text-white/80 hover:bg-white/10"
                                >
                                    {f.name}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Diálogo compartir por mensaje */}
            {shareOpen && <ShareByMessage item={item} onClose={() => setShareOpen(false)} />}
        </div>
    );
}

function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-start justify-between gap-3">
            <span className="text-white/45">{label}</span>
            <span className="max-w-[60%] truncate text-right font-medium">{value}</span>
        </div>
    );
}

function ShareByMessage({ item, onClose }: { item: SavedItem; onClose: () => void }) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<OsProfile[]>([]);
    const [sending, setSending] = useState<string | null>(null);

    useEffect(() => {
        const term = query.trim();
        if (term.length < 1) {
            setResults([]);
            return;
        }
        const t = setTimeout(() => void searchUsers(term).then(setResults), 250);
        return () => clearTimeout(t);
    }, [query]);

    const send = useCallback(
        async (userId: string) => {
            setSending(userId);
            const res = await createDm(userId);
            if (!res.ok || !res.thread) {
                toast.error(res.error || "No se pudo abrir la conversación.");
                setSending(null);
                return;
            }
            const kind = mediaKindOf(item);
            await sendMessage(res.thread.id, {
                body: "",
                attachments: [{ kind: kind === "video" ? "video" : "image", url: item.url, name: item.title, mime: item.mime ?? undefined }],
            });
            toast.success("Enviado por mensaje.");
            setSending(null);
            onClose();
        },
        [item, onClose],
    );

    return (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black/60" onClick={onClose}>
            <div className="w-80 rounded-2xl border border-white/10 bg-neutral-900 p-4" onClick={(e) => e.stopPropagation()}>
                <p className="mb-3 text-sm font-bold text-white">Compartir por mensaje</p>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-white/30" />
                    <Input
                        autoFocus
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Buscar persona…"
                        className="h-8 border-white/10 bg-black/30 pl-8 text-xs text-white"
                    />
                </div>
                <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
                    {results.map((r) => (
                        <button
                            key={r.userId}
                            onClick={() => void send(r.userId)}
                            disabled={sending === r.userId}
                            className="flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-left text-xs text-white/80 hover:bg-white/10 disabled:opacity-50"
                        >
                            <span>{r.displayName} <span className="text-white/40">@{r.username}</span></span>
                            {sending === r.userId && <Loader2 className="size-3.5 animate-spin" />}
                        </button>
                    ))}
                    {query.trim().length > 0 && results.length === 0 && (
                        <p className="px-3 py-4 text-center text-[11px] text-white/40">Sin resultados.</p>
                    )}
                </div>
            </div>
        </div>
    );
}

export default MediaViewer;
