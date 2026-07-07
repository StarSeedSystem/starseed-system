"use client";

/*
 * GalleryApp — Galería (espíritu iOS/Mac): grid por fecha, álbumes = carpetas
 * de la biblioteca, filtros por tipo/formato/origen, visor con zoom/flechas/
 * info/acciones, configuración por carpeta/archivo (cerebros/permisos) y fila
 * de Historias activas arriba del feed.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
    Upload, FolderPlus, Image as ImageIcon, Video as VideoIcon, Loader2, Settings2,
    Sparkles, MoreHorizontal, Images,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { currentUserRef, type EntityRef } from "@/lib/sync/entity-state";
import { listLibrary, createFolder, type EntityLibraryDoc, type SavedItem, type LibraryFolder } from "@/lib/library/entity-library";
import {
    ensureMediaFolders, saveMediaToLibrary, isMediaItem, mediaKindOf, groupMediaByDate,
    MEDIA_ORIGIN_SUBFOLDERS, type MediaFolders, type MediaOrigin,
} from "@/lib/library/media-library";
import { MediaViewer } from "./media-viewer";
import { ItemSettingsSheet, type SettingsTarget } from "./item-settings-sheet";
import { ShareAsStoryDialog } from "@/components/stories/share-as-story-dialog";
import { NetworkStoriesBar } from "@/components/stories/network-stories-bar";

type TypeFilter = "todos" | "imagen" | "video";
type OriginFilter = "todos" | MediaOrigin;

function thumbFor(item: SavedItem, kind: "image" | "video" | "other") {
    if (kind === "video") {
        return (
            <div className="relative h-full w-full bg-black">
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video src={item.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                <span className="absolute inset-0 grid place-items-center bg-black/20">
                    <VideoIcon className="size-6 text-white drop-shadow" />
                </span>
            </div>
        );
    }
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={item.url} alt={item.title} loading="lazy" className="h-full w-full object-cover" />;
}

export function GalleryApp() {
    const [ref, setRef] = useState<EntityRef | null>(null);
    const [doc, setDoc] = useState<EntityLibraryDoc | null>(null);
    const [mediaFolders, setMediaFolders] = useState<MediaFolders | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
    const [typeFilter, setTypeFilter] = useState<TypeFilter>("todos");
    const [originFilter, setOriginFilter] = useState<OriginFilter>("todos");
    const [query, setQuery] = useState("");
    const [viewerIndex, setViewerIndex] = useState<number | null>(null);
    const [settingsTarget, setSettingsTarget] = useState<SettingsTarget | null>(null);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [storyItem, setStoryItem] = useState<SavedItem | null>(null);
    const [importing, setImporting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const reload = useCallback(async (r: EntityRef) => {
        setLoading(true);
        const [d, folders] = await Promise.all([listLibrary(r), ensureMediaFolders(r)]);
        setDoc(d);
        setMediaFolders(folders);
        setLoading(false);
    }, []);

    useEffect(() => {
        void currentUserRef().then((r) => {
            setRef(r);
            if (r) void reload(r);
            else setLoading(false);
        });
    }, [reload]);

    const albums = useMemo(() => {
        if (!doc || !mediaFolders) return [];
        return doc.folders.filter((f) => f.parentId === mediaFolders.rootId || f.id === mediaFolders.rootId);
    }, [doc, mediaFolders]);

    const originTagOf = useCallback(
        (item: SavedItem): OriginFilter => {
            if (!mediaFolders) return "todos";
            for (const origin of MEDIA_ORIGIN_SUBFOLDERS) {
                if (item.folderId === mediaFolders.subfolders[origin]) return origin;
            }
            return "todos";
        },
        [mediaFolders],
    );

    const allMedia = useMemo(() => {
        if (!doc) return [];
        return doc.items.filter(isMediaItem);
    }, [doc]);

    const filtered = useMemo(() => {
        let list = allMedia;
        if (activeFolderId) list = list.filter((it) => it.folderId === activeFolderId);
        if (typeFilter !== "todos") list = list.filter((it) => mediaKindOf(it) === typeFilter);
        if (originFilter !== "todos") list = list.filter((it) => originTagOf(it) === originFilter);
        const q = query.trim().toLowerCase();
        if (q) list = list.filter((it) => it.title.toLowerCase().includes(q));
        return list;
    }, [allMedia, activeFolderId, typeFilter, originFilter, query, originTagOf]);

    const grouped = useMemo(() => groupMediaByDate(filtered), [filtered]);

    const handleImport = useCallback(
        async (files: FileList | null) => {
            if (!files || files.length === 0 || !ref) return;
            setImporting(true);
            let okCount = 0;
            for (const file of Array.from(files)) {
                const res = await saveMediaToLibrary(ref, {
                    file,
                    name: file.name,
                    origin: "Importadas",
                    destFolderId: activeFolderId ?? mediaFolders?.subfolders["Importadas"] ?? null,
                });
                if (res.ok) okCount++;
                else toast.error(res.error || `No se pudo importar «${file.name}».`);
            }
            setImporting(false);
            if (okCount > 0) {
                toast.success(`${okCount} archivo(s) importado(s).`);
                void reload(ref);
            }
        },
        [ref, activeFolderId, mediaFolders, reload],
    );

    const handleNewFolder = useCallback(async () => {
        if (!ref || !mediaFolders) return;
        const name = window.prompt("Nombre de la nueva carpeta/álbum:");
        if (!name?.trim()) return;
        await createFolder(ref, name.trim(), mediaFolders.rootId);
        toast.success("Álbum creado.");
        void reload(ref);
    }, [ref, mediaFolders, reload]);

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!ref) {
        return (
            <div className="flex flex-col items-center gap-3 py-20 text-center">
                <Images className="size-10 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">Inicia sesión para ver tu galería personal.</p>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <NetworkStoriesBar variant="mine" title="Tus historias activas" />

            <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-1 flex-wrap items-center gap-1.5">
                    {albums.map((f) => (
                        <button
                            key={f.id}
                            onClick={() => setActiveFolderId(f.id === mediaFolders?.rootId ? null : f.id)}
                            className={cn(
                                "cursor-pointer whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                                (f.id === mediaFolders?.rootId ? activeFolderId === null : activeFolderId === f.id)
                                    ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-200"
                                    : "border-border/50 text-muted-foreground hover:border-border",
                            )}
                        >
                            {f.id === mediaFolders?.rootId ? "Todo" : f.name}
                        </button>
                    ))}
                    <button
                        onClick={() => void handleNewFolder()}
                        className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-full border border-dashed border-border/60 text-muted-foreground hover:border-border hover:text-foreground"
                        title="Nuevo álbum"
                    >
                        <FolderPlus className="size-3.5" />
                    </button>
                    {activeFolderId && (
                        <button
                            onClick={() => {
                                const folder = doc?.folders.find((f) => f.id === activeFolderId);
                                if (folder) {
                                    setSettingsTarget({ kind: "folder", folder });
                                    setSettingsOpen(true);
                                }
                            }}
                            className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                            title="Ajustes de este álbum"
                        >
                            <Settings2 className="size-3.5" />
                        </button>
                    )}
                </div>

                <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
                    <SelectTrigger className="h-8 w-28 cursor-pointer text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="todos" className="cursor-pointer">Todo tipo</SelectItem>
                        <SelectItem value="imagen" className="cursor-pointer">Imágenes</SelectItem>
                        <SelectItem value="video" className="cursor-pointer">Vídeos</SelectItem>
                    </SelectContent>
                </Select>
                <Select value={originFilter} onValueChange={(v) => setOriginFilter(v as OriginFilter)}>
                    <SelectTrigger className="h-8 w-28 cursor-pointer text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="todos" className="cursor-pointer">Todo origen</SelectItem>
                        {MEDIA_ORIGIN_SUBFOLDERS.map((o) => (
                            <SelectItem key={o} value={o} className="cursor-pointer">{o}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar…" className="h-8 w-36 text-xs" />

                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                        void handleImport(e.target.files);
                        e.target.value = "";
                    }}
                />
                <Button size="sm" variant="outline" className="h-8 cursor-pointer text-xs" onClick={() => fileInputRef.current?.click()} disabled={importing}>
                    {importing ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Upload className="mr-1.5 size-3.5" />}
                    Importar
                </Button>
            </div>

            {grouped.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/50 py-20 text-center">
                    <ImageIcon className="size-10 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">Aún no hay fotos ni vídeos aquí. Captura con la Cámara o importa desde tu dispositivo.</p>
                </div>
            ) : (
                <div className="space-y-6">
                    {grouped.map((g) => (
                        <div key={g.key}>
                            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">{g.label}</h3>
                            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
                                {g.items.map((it) => {
                                    const kind = mediaKindOf(it);
                                    const globalIndex = filtered.findIndex((f) => f.id === it.id);
                                    return (
                                        <div key={it.id} className="group relative aspect-square overflow-hidden rounded-xl border border-border/40 bg-muted/10">
                                            <button onClick={() => setViewerIndex(globalIndex)} className="block h-full w-full cursor-pointer">
                                                {thumbFor(it, kind)}
                                            </button>
                                            <div className="absolute right-1 top-1 opacity-0 transition-opacity group-hover:opacity-100">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <button className="grid size-6 cursor-pointer place-items-center rounded-full bg-black/50 text-white hover:bg-black/70">
                                                            <MoreHorizontal className="size-3.5" />
                                                        </button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem className="cursor-pointer" onClick={() => setStoryItem(it)}>
                                                            <Sparkles className="mr-2 size-3.5" /> Compartir como historia
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            className="cursor-pointer"
                                                            onClick={() => {
                                                                setSettingsTarget({ kind: "file", item: it });
                                                                setSettingsOpen(true);
                                                            }}
                                                        >
                                                            <Settings2 className="mr-2 size-3.5" /> Cerebros y permisos
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {viewerIndex !== null && ref && (
                <MediaViewer
                    ref_={ref}
                    items={filtered}
                    index={viewerIndex}
                    onIndexChange={setViewerIndex}
                    onClose={() => setViewerIndex(null)}
                    onChanged={() => void reload(ref)}
                    onShareStory={(item) => setStoryItem(item)}
                    onOpenSettings={(item) => {
                        setSettingsTarget({ kind: "file", item });
                        setSettingsOpen(true);
                    }}
                />
            )}

            {ref && (
                <ItemSettingsSheet
                    open={settingsOpen}
                    onOpenChange={setSettingsOpen}
                    libraryRef={ref}
                    target={settingsTarget}
                />
            )}

            {storyItem && (
                <ShareAsStoryDialog
                    item={storyItem}
                    open={!!storyItem}
                    onOpenChange={(o) => !o && setStoryItem(null)}
                />
            )}
        </div>
    );
}

export default GalleryApp;
