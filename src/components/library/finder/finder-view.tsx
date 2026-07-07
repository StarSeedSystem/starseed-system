"use client";

// ════════════════════════════════════════════════════════════════════════════
// FinderView — gestor de archivos tipo Finder de macOS para una Biblioteca de
// entidad (mejor: carpetas anidadas, etiquetas, alias, ramas vinculadas, ACL
// por ítem, portapapeles interno, publicación al catálogo público). Orquesta:
//   · Sidebar: árbol de carpetas anidadas con drag para mover ítems/carpetas.
//   · Toolbar: conmutador iconos/lista/columnas, ordenación, buscador.
//   · Contenido: grid de iconos, lista, o columnas Miller.
//   · Panel de preview embebido (FilePreview) al seleccionar un ítem.
//   · Menú contextual (clic derecho / long-press) con todas las acciones.
//   · Diálogos: mover a…, etiquetas, permisos, publicar.
//
// Se monta DENTRO de EntityLibraryPanel (que resuelve `ref`/`accent`/sesión).
// SOP: architecture/libreria-biblioteca-sync.md (§6-7).
// ════════════════════════════════════════════════════════════════════════════

import { useMemo, useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
    Search, LayoutGrid, List as ListIcon, Columns3, ArrowUpDown,
    X, ClipboardPaste, Upload,
} from "lucide-react";
import {
    useEntityLibrary,
    listLibrary,
    removeItem as removeItemFromLibrary,
    type EntityRef,
    type SavedItem,
    type SavedItemType,
    type ItemACL,
} from "@/lib/library/entity-library";
import { createClient } from "@/utils/supabase/client";
// Subida universal de archivos (Adenda 64 §9): botón "Subir archivos…" de la
// toolbar — sube al storage real y crea ítems type:'file' en la carpeta activa.
import { AttachFilePickerButton } from "@/components/files/universal-file-picker";
import type { UniversalAttachment } from "@/lib/files/os-files";
import {
    type FinderViewMode, type FinderSort, FINDER_VIEW_KEY, FINDER_SORT_KEY,
    folderPath, folderSubtreeIds, sortItems, sortFolders,
    readClipboard, writeClipboard, clearClipboard, deepLinkFor,
    type AclViewerContext, canWrite as aclCanWrite,
} from "./finder-types";
import { FolderTree, DRAG_MIME } from "./folder-tree";
import { FinderBreadcrumb } from "./finder-breadcrumb";
import { ItemCard } from "./item-card";
import { ColumnsView } from "./columns-view";
import { ItemPreviewPane } from "./item-preview-pane";
import { FinderContextMenu, type FinderMenuTarget } from "./finder-context-menu";
import { useContextTrigger } from "./use-context-trigger";
import { MoveToDialog } from "./move-to-dialog";
import { TagsDialog } from "./tags-dialog";
import { PermissionsPopover } from "./permissions-popover";
import { PublishDialog } from "./publish-dialog";

const TYPE_FILTERS: Array<{ key: "todos" | SavedItemType; label: string }> = [
    { key: "todos", label: "Todo" },
    { key: "package", label: "Paquetes" },
    { key: "post", label: "Publicaciones" },
    { key: "file", label: "Archivos" },
    { key: "page", label: "Páginas" },
    { key: "route", label: "Rutas" },
    { key: "external", label: "Enlaces" },
    { key: "alias", label: "Accesos directos" },
    { key: "branch", label: "Ramas" },
];

function readLocalPref<T extends string>(key: string, fallback: T): T {
    if (typeof window === "undefined") return fallback;
    try {
        return (localStorage.getItem(key) as T) || fallback;
    } catch {
        return fallback;
    }
}

function writeLocalPref(key: string, value: string): void {
    if (typeof window === "undefined") return;
    try {
        localStorage.setItem(key, value);
    } catch {
        /* noop */
    }
}

type ContextPayload =
    | { kind: "item"; id: string }
    | { kind: "folder"; id: string };

export interface FinderViewProps {
    entityRef: EntityRef;
    accent?: string;
    /** Contexto de permisos: dueño de la biblioteca bypassa toda ACL. */
    aclContext?: AclViewerContext;
    compact?: boolean;
}

export function FinderView({ entityRef, accent = "#7FB8FF", aclContext, compact }: FinderViewProps) {
    const {
        doc, loading, saveItem, removeItem, moveItem, createFolder, renameFolder, removeFolder,
        moveFolder, setItemTags, setItemAcl, setFolderAcl, createAlias, replicateItem, duplicateItem,
    } = useEntityLibrary(entityRef);

    const ctx: AclViewerContext = aclContext ?? { isOwner: true, userId: null, groupSlugs: [] };

    const [activeFolder, setActiveFolder] = useState<string | null>(null);
    const [columnsChain, setColumnsChain] = useState<(string | null)[]>([null]);
    const [query, setQuery] = useState("");
    const [typeFilter, setTypeFilter] = useState<"todos" | SavedItemType>("todos");
    const [viewMode, setViewMode] = useState<FinderViewMode>(() => readLocalPref<FinderViewMode>(FINDER_VIEW_KEY, "iconos"));
    const [sort, setSort] = useState<FinderSort>(() => readLocalPref<FinderSort>(FINDER_SORT_KEY, "nombre"));
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [previewId, setPreviewId] = useState<string | null>(null);
    const [clipboardHasContent, setClipboardHasContent] = useState(false);

    useEffect(() => {
        const refresh = () => setClipboardHasContent(!!readClipboard());
        refresh();
        window.addEventListener("starseed:clipboard", refresh);
        return () => window.removeEventListener("starseed:clipboard", refresh);
    }, []);

    // Diálogos
    const [moveDialog, setMoveDialog] = useState<{ kind: "item" | "folder"; ids: string[] } | null>(null);
    const [tagsDialog, setTagsDialog] = useState<SavedItem | null>(null);
    const [permissionsTarget, setPermissionsTarget] = useState<{ kind: "item" | "folder"; id: string; title: string; acl?: ItemACL } | null>(null);
    const [publishTarget, setPublishTarget] = useState<
        | { mode: "item"; item: SavedItem }
        | { mode: "folder"; folderId: string | null; folderName: string }
        | null
    >(null);

    const { menu, bind, close: closeMenu } = useContextTrigger<ContextPayload>();

    const setView = (v: FinderViewMode) => {
        setViewMode(v);
        writeLocalPref(FINDER_VIEW_KEY, v);
    };
    const setSortMode = (s: FinderSort) => {
        setSort(s);
        writeLocalPref(FINDER_SORT_KEY, s);
    };

    // ── Datos derivados ──────────────────────────────────────────────────────

    const itemsById = useMemo(() => new Map(doc.items.map((it) => [it.id, it] as const)), [doc.items]);
    const folderCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const it of doc.items) {
            if (it.folderId) counts[it.folderId] = (counts[it.folderId] ?? 0) + 1;
        }
        return counts;
    }, [doc.items]);

    const filteredItems = useMemo(() => {
        let items: SavedItem[] = ctx.isOwner ? doc.items : doc.items.filter((it) => aclAllowsRead(it, ctx));
        if (activeFolder !== null) items = items.filter((it) => (it.folderId ?? null) === activeFolder);
        if (typeFilter !== "todos") items = items.filter((it) => it.type === typeFilter);
        const q = query.trim().toLowerCase();
        if (q) {
            items = items.filter(
                (it) =>
                    it.title.toLowerCase().includes(q) ||
                    (it.note ?? "").toLowerCase().includes(q) ||
                    it.tags.some((t) => t.toLowerCase().includes(q)),
            );
        }
        return sortItems(items, sort);
    }, [doc.items, activeFolder, typeFilter, query, sort, ctx]);

    const visibleFolders = useMemo(() => {
        const list = ctx.isOwner ? doc.folders : doc.folders.filter((f) => aclAllowsReadFolder(f, ctx));
        return sortFolders(list, sort === "tipo" ? "nombre" : sort);
    }, [doc.folders, sort, ctx]);

    const breadcrumbPath = useMemo(() => folderPath(visibleFolders, activeFolder), [visibleFolders, activeFolder]);

    const selectedItem = previewId ? itemsById.get(previewId) ?? null : null;
    const resolvedPreviewTarget = useMemo(() => {
        if (!selectedItem) return null;
        if (selectedItem.type === "alias" && selectedItem.targetItemId) {
            return itemsById.get(selectedItem.targetItemId) ?? null;
        }
        return null;
    }, [selectedItem, itemsById]);

    // La raíz de la biblioteca no tiene ACL propia (solo las carpetas/ítems la tienen);
    // `aclCanWrite(undefined, ctx)` ya resuelve isOwner=true o "sin restricción" (v1 compat) → true.
    const currentWriteAllowed = aclCanWrite(undefined, ctx);

    // ── Selección ────────────────────────────────────────────────────────────

    const toggleSelect = useCallback((e: React.MouseEvent, id: string) => {
        if (e.shiftKey || e.metaKey || e.ctrlKey) {
            setSelectedIds((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
            });
        } else {
            setSelectedIds(new Set([id]));
        }
        setPreviewId(id);
    }, []);

    const dragSelectionIds = useCallback(() => Array.from(selectedIds), [selectedIds]);

    // ── Acciones de ítem ─────────────────────────────────────────────────────

    const handleOpenItem = useCallback(
        (item: SavedItem) => {
            const resolved = item.type === "alias" && item.targetItemId ? itemsById.get(item.targetItemId) ?? item : item;
            const href = resolved.route ?? resolved.url;
            if (!href) {
                toast.message("Sin destino abrible", { description: "Este ítem no tiene ruta ni URL asociada." });
                return;
            }
            if (resolved.route) window.location.assign(resolved.route);
            else if (resolved.url) window.open(resolved.url, "_blank", "noopener,noreferrer");
        },
        [itemsById],
    );

    const handleRemove = useCallback(
        async (id: string) => {
            await removeItem(id);
            setSelectedIds((prev) => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
            if (previewId === id) setPreviewId(null);
            toast.success("Quitado de la biblioteca");
        },
        [removeItem, previewId],
    );

    const handleMoveItems = useCallback(
        async (ids: string[], folderId: string | null) => {
            await Promise.all(ids.map((id) => moveItem(id, folderId)));
            toast.success(ids.length > 1 ? `${ids.length} ítems movidos` : "Movido");
        },
        [moveItem],
    );

    const handleCopy = useCallback((ids: string[], mode: "copiar" | "cortar") => {
        writeClipboard({ ref: entityRef, itemIds: ids, mode, at: new Date().toISOString() });
        toast.success(mode === "copiar" ? "Copiado al portapapeles" : "Cortado al portapapeles", {
            description: `${ids.length} ítem(s). Usa «Pegar en carpeta» donde quieras colocarlos.`,
        });
    }, [entityRef]);

    const handlePaste = useCallback(
        async (folderId: string | null) => {
            const entry = readClipboard();
            if (!entry || entry.itemIds.length === 0) return;
            const sameLibrary = entry.ref.kind === entityRef.kind && entry.ref.id === entityRef.id;
            if (sameLibrary) {
                if (entry.mode === "cortar") {
                    await Promise.all(entry.itemIds.map((id) => moveItem(id, folderId)));
                } else {
                    await Promise.all(entry.itemIds.map((id) => duplicateItem(id, folderId)));
                }
                if (entry.mode === "cortar") clearClipboard();
                setClipboardHasContent(!!readClipboard());
                toast.success("Pegado");
                return;
            }

            // ── Pegado ENTRE bibliotecas distintas ──────────────────────────────
            // Leemos el doc completo de la biblioteca ORIGEN (puede no estar cargada
            // en este dispositivo) y creamos copias nuevas (nuevo id) en la biblioteca
            // ACTUAL (destino), preservando el payload pero sin ACL/folderId/addedAt/
            // addedBy del original — igual que `duplicateItem` resetea `acl` en su
            // copia dentro de la misma biblioteca.
            let sourceDoc;
            try {
                sourceDoc = await listLibrary(entry.ref);
            } catch {
                sourceDoc = { items: [], folders: [], rev: 0, updatedAt: "" };
            }
            const sourceItemsById = new Map(sourceDoc.items.map((it) => [it.id, it] as const));

            let copied = 0;
            let missing = 0;
            const copiedSourceIds: string[] = [];
            for (const id of entry.itemIds) {
                const source = sourceItemsById.get(id);
                if (!source) {
                    missing++;
                    continue;
                }
                const res = await saveItem(
                    {
                        type: source.type,
                        refId: source.refId,
                        route: source.route,
                        url: source.url,
                        title: source.title,
                        note: source.note,
                        tags: source.tags,
                    },
                    folderId,
                );
                if (res.ok) {
                    copied++;
                    copiedSourceIds.push(id);
                } else {
                    missing++;
                }
            }

            let removedFromSource = 0;
            let removalDenied = false;
            if (entry.mode === "cortar" && copiedSourceIds.length > 0) {
                const canDeleteFromSource = await canWriteSourceLibrary(entry.ref, sourceItemsById);
                if (canDeleteFromSource) {
                    await Promise.all(
                        copiedSourceIds.map(async (id) => {
                            try {
                                await removeItemFromLibrary(entry.ref, id);
                                removedFromSource++;
                            } catch {
                                /* fallo puntual de borrado: se reporta abajo como no removido */
                            }
                        }),
                    );
                    if (removedFromSource < copiedSourceIds.length) removalDenied = true;
                } else {
                    removalDenied = true;
                }
            }

            if (entry.mode === "cortar" && removedFromSource === copiedSourceIds.length && !removalDenied) {
                clearClipboard();
            }
            setClipboardHasContent(!!readClipboard());

            // ── Toast honesto según lo que realmente ocurrió ──────────────────
            if (copied === 0) {
                toast.message("No se pudo pegar", {
                    description: "No se encontró ninguno de los ítems en la biblioteca de origen.",
                });
                return;
            }
            if (entry.mode === "copiar") {
                if (missing === 0) {
                    toast.success(`Pegado (${copied} ítem${copied > 1 ? "s" : ""} copiados de otra biblioteca)`);
                } else {
                    toast.success("Pegado parcialmente", {
                        description: `${copied} copiados, ${missing} no encontrados en el origen.`,
                    });
                }
                return;
            }
            // mode === "cortar"
            if (missing === 0 && !removalDenied) {
                toast.success(`Movido (${copied} ítem${copied > 1 ? "s" : ""} desde otra biblioteca)`);
            } else if (removalDenied) {
                toast.message("Copiado, pero no movido del todo", {
                    description:
                        missing === 0
                            ? `${copied} copiados; el original no se pudo quitar de la biblioteca de origen (sin permiso de escritura ahí).`
                            : `${copied} copiados, ${missing} no encontrados en el origen; el resto no se pudo quitar de la biblioteca de origen (sin permiso de escritura ahí).`,
                });
            } else {
                toast.success("Pegado parcialmente", {
                    description: `${copied} copiados, ${missing} no encontrados en el origen.`,
                });
            }
        },
        [entityRef, moveItem, duplicateItem, saveItem],
    );

    const handleShare = useCallback((id: string) => {
        const link = deepLinkFor(entityRef, id);
        if (navigator.clipboard) {
            navigator.clipboard.writeText(link).then(
                () => toast.success("Enlace copiado", { description: link }),
                () => toast.message("Enlace generado", { description: link }),
            );
        } else {
            toast.message("Enlace generado", { description: link });
        }
    }, [entityRef]);

    /** Archivos subidos desde el selector universal: crea un ítem type:'file' por cada uno en la carpeta activa. */
    const handleUploadedFiles = useCallback(
        async (attachments: UniversalAttachment[]) => {
            let created = 0;
            for (const a of attachments) {
                if (!a.url) continue;
                const res = await saveItem(
                    {
                        type: "file",
                        url: a.url,
                        title: a.name || "Archivo",
                        refId: a.fileId,
                    },
                    activeFolder,
                );
                if (res.ok) created++;
            }
            if (created > 0) {
                toast.success(created === 1 ? "Archivo subido a la biblioteca" : `${created} archivos subidos a la biblioteca`);
            }
        },
        [saveItem, activeFolder],
    );

    const handlePublishNavigate = useCallback((item: SavedItem) => {
        const resolved = item.type === "alias" && item.targetItemId ? itemsById.get(item.targetItemId) ?? item : item;
        const ref = {
            kind: resolved.type,
            title: resolved.title,
            url: resolved.url,
            route: resolved.route,
            note: resolved.note,
        };
        const q = encodeURIComponent(JSON.stringify(ref));
        window.location.assign(`/publish?attach=${q}`);
    }, [itemsById]);

    // ── Menú contextual: resolución del target ─────────────────────────────

    const menuTarget: FinderMenuTarget | null = useMemo(() => {
        if (!menu) return null;
        if (menu.payload.kind === "item") {
            const item = itemsById.get(menu.payload.id);
            if (!item) return null;
            return { kind: "item", id: item.id, canWrite: ctx.isOwner || aclCanWrite(item.acl, ctx), isAlias: item.type === "alias" };
        }
        const folder = doc.folders.find((f) => f.id === menu.payload.id);
        if (!folder) return null;
        return { kind: "folder", id: folder.id, canWrite: ctx.isOwner || aclCanWrite(folder.acl, ctx) };
    }, [menu, itemsById, doc.folders, ctx]);

    // ── Render ───────────────────────────────────────────────────────────────

    if (loading && doc.items.length === 0 && doc.folders.length === 0) {
        return (
            <div className="flex items-center justify-center py-10 text-xs text-muted-foreground">
                Cargando biblioteca…
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-3">
            {/* ── Toolbar ── */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[180px] flex-1">
                    <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Buscar guardados, etiquetas…"
                        className="h-9 rounded-xl border-white/10 bg-black/20 pl-8 text-xs"
                    />
                </div>

                <div className="inline-flex gap-0.5 rounded-xl border border-white/10 bg-black/20 p-0.5">
                    {([
                        { key: "iconos" as const, icon: LayoutGrid, label: "Iconos" },
                        { key: "lista" as const, icon: ListIcon, label: "Lista" },
                        { key: "columnas" as const, icon: Columns3, label: "Columnas" },
                    ]).map(({ key, icon: Icon, label }) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setView(key)}
                            title={label}
                            aria-label={label}
                            className={cn(
                                "flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors duration-200",
                                viewMode === key ? "bg-white/10 text-white" : "text-muted-foreground hover:text-white",
                            )}
                        >
                            <Icon className="h-3.5 w-3.5" />
                        </button>
                    ))}
                </div>

                <div className="relative">
                    <select
                        value={sort}
                        onChange={(e) => setSortMode(e.target.value as FinderSort)}
                        className="h-9 cursor-pointer appearance-none rounded-xl border border-white/10 bg-black/20 py-1.5 pl-7 pr-3 text-xs text-white/80 outline-none"
                        aria-label="Ordenar por"
                    >
                        <option value="nombre">Nombre</option>
                        <option value="fecha">Fecha</option>
                        <option value="tipo">Tipo</option>
                    </select>
                    <ArrowUpDown className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                </div>

                {clipboardHasContent && viewMode !== "columnas" && (
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-9 cursor-pointer gap-1.5 border-white/15 text-xs hover:bg-white/10"
                        onClick={() => void handlePaste(activeFolder)}
                    >
                        <ClipboardPaste className="h-3.5 w-3.5" /> Pegar aquí
                    </Button>
                )}

                {currentWriteAllowed && (
                    <AttachFilePickerButton
                        onPick={(a) => void handleUploadedFiles(a)}
                        folder={`biblioteca/${entityRef.kind}-${entityRef.id}`}
                        title="Subir archivos a esta biblioteca"
                        hideTabs={["neuronas"]}
                        className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.03] px-3 text-xs font-medium text-white/75 hover:bg-white/10"
                    >
                        <Upload className="h-3.5 w-3.5" /> Subir archivos…
                    </AttachFilePickerButton>
                )}

                {selectedIds.size > 0 && (
                    <div className="flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-xs text-primary">
                        {selectedIds.size} seleccionado{selectedIds.size > 1 ? "s" : ""}
                        <button type="button" onClick={() => setSelectedIds(new Set())} className="cursor-pointer" aria-label="Limpiar selección">
                            <X className="h-3 w-3" />
                        </button>
                    </div>
                )}
            </div>

            {/* ── Breadcrumb + filtros de tipo ── */}
            <div className="flex flex-wrap items-center justify-between gap-2">
                <FinderBreadcrumb path={breadcrumbPath} onNavigate={setActiveFolder} />
                <div className="flex flex-wrap gap-1.5">
                    {TYPE_FILTERS.map((f) => (
                        <button
                            key={f.key}
                            type="button"
                            onClick={() => setTypeFilter(f.key)}
                            className={cn(
                                "cursor-pointer rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors duration-200",
                                typeFilter === f.key
                                    ? "border-white/25 bg-white/10 text-white"
                                    : "border-white/10 bg-white/[0.02] text-muted-foreground hover:bg-white/5 hover:text-white",
                            )}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Cuerpo: sidebar + contenido + preview ── */}
            <div className={cn("flex flex-col gap-3 md:flex-row", compact && "md:max-h-[560px]")}>
                {viewMode !== "columnas" && (
                    <FolderTree
                        folders={visibleFolders}
                        activeFolder={activeFolder}
                        counts={folderCounts}
                        totalCount={doc.items.length}
                        canWrite={currentWriteAllowed}
                        onSelect={setActiveFolder}
                        onRename={(id, name) => void renameFolder(id, name)}
                        onRemove={(id) => {
                            void removeFolder(id);
                            if (activeFolder === id) setActiveFolder(null);
                            toast.success("Carpeta eliminada", { description: "Sus referencias pasaron a la raíz." });
                        }}
                        onCreate={(name, parentId) => {
                            void createFolder(name, parentId).then(() => toast.success(`Carpeta «${name}» creada`));
                        }}
                        onMoveFolder={(folderId, parentId) => void moveFolder(folderId, parentId)}
                        onDropItems={(ids, folderId) => void handleMoveItems(ids, folderId)}
                        onContextMenuFolder={(e, folderId) => {
                            e.preventDefault();
                            const me = e as React.MouseEvent;
                            bind({ kind: "folder", id: folderId }).onContextMenu(me);
                        }}
                        onPublishFolder={(folderId) => {
                            const f = doc.folders.find((x) => x.id === folderId);
                            if (f) setPublishTarget({ mode: "folder", folderId: f.id, folderName: f.name });
                        }}
                        onPermissionsFolder={(folderId) => {
                            const f = doc.folders.find((x) => x.id === folderId);
                            if (f) setPermissionsTarget({ kind: "folder", id: f.id, title: f.name, acl: f.acl });
                        }}
                    />
                )}

                <div className="min-w-0 flex-1">
                    {viewMode === "columnas" ? (
                        <ColumnsView
                            chain={columnsChain}
                            folders={visibleFolders}
                            itemsByFolder={(folderId) =>
                                sortItems(
                                    doc.items.filter((it) => (ctx.isOwner || aclAllowsRead(it, ctx)) && (it.folderId ?? null) === folderId && (typeFilter === "todos" || it.type === typeFilter)),
                                    sort,
                                )
                            }
                            foldersOf={(folderId) => visibleFolders.filter((f) => (f.parentId ?? null) === folderId)}
                            selectedId={previewId}
                            selectedIds={selectedIds}
                            accent={accent}
                            onEnterFolder={(depth, folderId) => setColumnsChain((prev) => [...prev.slice(0, depth + 1), folderId])}
                            onSelectItem={(e, item) => toggleSelect(e, item.id)}
                            onOpenItem={handleOpenItem}
                            onContextMenuItem={(e, item) => {
                                e.preventDefault();
                                bind({ kind: "item", id: item.id }).onContextMenu(e);
                            }}
                            onContextMenuFolder={(e, folderId) => {
                                e.preventDefault();
                                bind({ kind: "folder", id: folderId }).onContextMenu(e);
                            }}
                            onDropOnFolder={(folderId, ids) => void handleMoveItems(ids, folderId)}
                            touchBind={(p) => bind(p)}
                            dragSelection={dragSelectionIds}
                        />
                    ) : filteredItems.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] py-12 text-center text-muted-foreground">
                            <p className="text-sm">
                                {query.trim() || typeFilter !== "todos" || activeFolder !== null
                                    ? "No hay guardados que coincidan."
                                    : "Aún no hay nada guardado aquí."}
                            </p>
                        </div>
                    ) : (
                        <div
                            className={cn(
                                viewMode === "iconos"
                                    ? "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"
                                    : "flex flex-col gap-1.5",
                                compact && "max-h-[440px] overflow-y-auto pr-1",
                            )}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                                e.preventDefault();
                                const raw = e.dataTransfer.getData(DRAG_MIME.ITEM);
                                if (!raw) return;
                                try {
                                    const ids = JSON.parse(raw) as string[];
                                    if (ids.length) void handleMoveItems(ids, activeFolder);
                                } catch {
                                    /* noop */
                                }
                            }}
                        >
                            {filteredItems.map((item) => (
                                <ItemCard
                                    key={item.id}
                                    item={item}
                                    layout={viewMode === "lista" ? "lista" : "iconos"}
                                    accent={accent}
                                    selected={selectedIds.has(item.id)}
                                    readOnly={!ctx.isOwner && !aclCanWrite(item.acl, ctx)}
                                    onSelect={(e) => toggleSelect(e, item.id)}
                                    onOpen={() => handleOpenItem(item)}
                                    onDragStartExtra={dragSelectionIds}
                                    {...bind({ kind: "item", id: item.id })}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {previewId && selectedItem && viewMode !== "columnas" && (
                    <div className="shrink-0 md:w-72">
                        <ItemPreviewPane
                            item={selectedItem}
                            accent={accent}
                            resolvedTarget={resolvedPreviewTarget}
                            onOpen={() => handleOpenItem(selectedItem)}
                            onClose={() => setPreviewId(null)}
                        />
                    </div>
                )}
            </div>

            {/* ── Menú contextual ── */}
            {menu && menuTarget && (
                <FinderContextMenu
                    x={menu.x}
                    y={menu.y}
                    target={menuTarget}
                    clipboardHasContent={clipboardHasContent}
                    onClose={closeMenu}
                    onOpen={() => {
                        if (menuTarget.kind === "item") {
                            const it = itemsById.get(menuTarget.id);
                            if (it) handleOpenItem(it);
                        } else {
                            setActiveFolder(menuTarget.id);
                        }
                    }}
                    onPreview={menuTarget.kind === "item" ? () => setPreviewId(menuTarget.id) : undefined}
                    onReplicate={menuTarget.kind === "item" ? () => void replicateItem(menuTarget.id, activeFolder).then(() => toast.success("Rama creada")) : undefined}
                    onDuplicate={menuTarget.kind === "item" ? () => void duplicateItem(menuTarget.id, activeFolder).then(() => toast.success("Duplicado")) : undefined}
                    onCopy={() => handleCopy(selectedIds.has(menuTarget.id) ? Array.from(selectedIds) : [menuTarget.id], "copiar")}
                    onCut={menuTarget.canWrite ? () => handleCopy(selectedIds.has(menuTarget.id) ? Array.from(selectedIds) : [menuTarget.id], "cortar") : undefined}
                    onPaste={menuTarget.kind === "folder" ? () => void handlePaste(menuTarget.id) : undefined}
                    onCreateShortcut={
                        menuTarget.kind === "item"
                            ? () => void createAlias(menuTarget.id, activeFolder).then(() => toast.success("Acceso directo creado"))
                            : undefined
                    }
                    onMove={() => setMoveDialog({ kind: menuTarget.kind, ids: [menuTarget.id] })}
                    onTags={() => {
                        const it = itemsById.get(menuTarget.id);
                        if (it) setTagsDialog(it);
                    }}
                    onShare={() => handleShare(menuTarget.id)}
                    onPublish={
                        menuTarget.kind === "item"
                            ? () => {
                                  const it = itemsById.get(menuTarget.id);
                                  if (it) handlePublishNavigate(it);
                              }
                            : undefined
                    }
                    onPublishToCatalog={
                        menuTarget.kind === "item"
                            ? () => {
                                  const it = itemsById.get(menuTarget.id);
                                  if (it) setPublishTarget({ mode: "item", item: it });
                              }
                            : undefined
                    }
                    onPublishFolderToCatalog={
                        menuTarget.kind === "folder"
                            ? () => {
                                  const f = doc.folders.find((x) => x.id === menuTarget.id);
                                  if (f) setPublishTarget({ mode: "folder", folderId: f.id, folderName: f.name });
                              }
                            : undefined
                    }
                    onPermissions={() => {
                        if (menuTarget.kind === "item") {
                            const it = itemsById.get(menuTarget.id);
                            if (it) setPermissionsTarget({ kind: "item", id: it.id, title: it.title, acl: it.acl });
                        } else {
                            const f = doc.folders.find((x) => x.id === menuTarget.id);
                            if (f) setPermissionsTarget({ kind: "folder", id: f.id, title: f.name, acl: f.acl });
                        }
                    }}
                    onRemove={() => {
                        if (menuTarget.kind === "item") void handleRemove(menuTarget.id);
                        else {
                            void removeFolder(menuTarget.id);
                            if (activeFolder === menuTarget.id) setActiveFolder(null);
                            toast.success("Carpeta eliminada");
                        }
                    }}
                />
            )}

            {/* ── Diálogo: mover a… ── */}
            {moveDialog && (
                <MoveToDialog
                    open
                    onOpenChange={(o) => !o && setMoveDialog(null)}
                    folders={doc.folders}
                    excludeIds={
                        moveDialog.kind === "folder" ? folderSubtreeIds(doc.folders, moveDialog.ids[0]) : undefined
                    }
                    onConfirm={(folderId) => {
                        if (moveDialog.kind === "item") void handleMoveItems(moveDialog.ids, folderId);
                        else void moveFolder(moveDialog.ids[0], folderId).then(() => toast.success("Carpeta movida"));
                        setMoveDialog(null);
                    }}
                />
            )}

            {/* ── Diálogo: etiquetas ── */}
            {tagsDialog && (
                <TagsDialog
                    open
                    onOpenChange={(o) => !o && setTagsDialog(null)}
                    title={tagsDialog.title}
                    initialTags={tagsDialog.tags}
                    onSave={(tags) => {
                        void setItemTags(tagsDialog.id, tags).then(() => toast.success("Etiquetas actualizadas"));
                    }}
                />
            )}

            {/* ── Permisos (sin trigger visible: se abre desde el menú contextual, ancla al centro) ── */}
            {permissionsTarget && (
                <PermissionsPopover
                    open
                    onOpenChange={(o) => !o && setPermissionsTarget(null)}
                    title={permissionsTarget.title}
                    acl={permissionsTarget.acl}
                    onSave={async (acl) => {
                        if (permissionsTarget.kind === "item") await setItemAcl(permissionsTarget.id, acl);
                        else await setFolderAcl(permissionsTarget.id, acl);
                    }}
                />
            )}

            {/* ── Publicar en la Librería ── */}
            {publishTarget && (
                publishTarget.mode === "item" ? (
                    <PublishDialog
                        mode="item"
                        item={publishTarget.item}
                        open
                        onOpenChange={(o) => !o && setPublishTarget(null)}
                        entityRef={entityRef}
                        doc={doc}
                    />
                ) : (
                    <PublishDialog
                        mode="folder"
                        folderId={publishTarget.folderId}
                        folderName={publishTarget.folderName}
                        open
                        onOpenChange={(o) => !o && setPublishTarget(null)}
                        entityRef={entityRef}
                        doc={doc}
                    />
                )
            )}
        </div>
    );
}

// Helpers de visibilidad ACL a nivel de módulo (evita recrear closures pesadas).
function aclAllowsRead(it: SavedItem, ctx: AclViewerContext): boolean {
    if (!it.acl || it.acl.read.length === 0) return true;
    if (!ctx.userId) return false;
    return it.acl.read.some((e) => (e.kind === "user" && e.id === ctx.userId) || (e.kind === "group" && ctx.groupSlugs.includes(e.id)));
}
function aclAllowsReadFolder(f: { acl?: ItemACL }, ctx: AclViewerContext): boolean {
    if (!f.acl || f.acl.read.length === 0) return true;
    if (!ctx.userId) return false;
    return f.acl.read.some((e) => (e.kind === "user" && e.id === ctx.userId) || (e.kind === "group" && ctx.groupSlugs.includes(e.id)));
}

/**
 * Determina (de forma pragmática, sin re-derivar todo el contexto ACL de una
 * biblioteca AJENA) si el usuario actual puede borrar de la biblioteca ORIGEN
 * al pegar-cortar entre bibliotecas distintas:
 *   · `ref.kind==="user"` y coincide con el uid actual → es "Mi biblioteca": dueño, permite.
 *   · Resto de entidades: no tenemos membresías/owner_id a mano aquí sin ampliar
 *     el alcance de esta tarea, así que respetamos el ACL propio de CADA ítem
 *     recortado (mismo criterio que `aclAllows()` de finder-types.ts): si el
 *     ítem tiene una lista `write` no vacía, el usuario debe aparecer en ella
 *     (por id de usuario; no podemos resolver pertenencia a grupo de OTRA
 *     entidad aquí, así que esa parte se omite); si el ítem no tiene ACL (o
 *     `write` vacío) se permite por defecto — igual que el resto del código
 *     trata "ACL ausente" como "sin restricción, permitir" (postura permisiva
 *     por defecto, restrictiva solo cuando hay una denegación explícita).
 */
async function canWriteSourceLibrary(ref: EntityRef, sourceItemsById: Map<string, SavedItem>): Promise<boolean> {
    try {
        const supabase = createClient();
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData?.user?.id ?? null;

        if (ref.kind === "user") return !!uid && uid === ref.id;

        if (!uid) return true; // sin sesión: no hay forma de restringir por usuario, se mantiene el default permisivo v1
        for (const item of sourceItemsById.values()) {
            const writeList = item.acl?.write ?? [];
            if (writeList.length === 0) continue; // ACL ausente/sin restricción: permitido por defecto
            const allowed = writeList.some((e) => e.kind === "user" && e.id === uid);
            if (!allowed) return false;
        }
        return true;
    } catch {
        return true; // fallo al resolver sesión/tablas: no bloqueamos el borrado, mismo criterio permisivo del resto del archivo
    }
}

export default FinderView;
