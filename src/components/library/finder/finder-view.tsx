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
    X, ClipboardPaste, Upload, GitBranch, Link2 as ConnectIcon, Copy as CopyIcon,
    Image as ImageIcon, User as UserIcon, Play as PlayIcon, Archive as ArchiveIcon,
    BrainCircuit,
} from "lucide-react";
import {
    useEntityLibrary,
    listLibrary,
    removeItem as removeItemFromLibrary,
    type EntityRef,
    type SavedItem,
    type SavedItemType,
    type ItemACL,
    type LibraryFolder,
    type VersionablePatch,
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
import { itemFormat } from "./item-meta";
import { FolderTree, DRAG_MIME } from "./folder-tree";
import { FinderBreadcrumb } from "./finder-breadcrumb";
import { ItemCard } from "./item-card";
import { ColumnsView } from "./columns-view";
import { ItemPreviewPane } from "./item-preview-pane";
import { FinderContextMenu, type FinderMenuTarget, type FinderExtraAction } from "./finder-context-menu";
import { useContextTrigger } from "./use-context-trigger";
import { MoveToDialog } from "./move-to-dialog";
import { TagsDialog } from "./tags-dialog";
import { PermissionsPopover } from "./permissions-popover";
import { PublishDialog } from "./publish-dialog";
// Adenda 65: versiones, ramas, comentarios, instalar/guardar en…
import { VersionsDialog } from "./versions-dialog";
import { EditItemDialog } from "./edit-item-dialog";
import { BranchesDialog } from "./branches-dialog";
import { CommentsDialog } from "./comments-dialog";
import { InstallToDialog } from "./install-to-dialog";
// Adenda 65 §16-17: repositorios creables + repos externos conectados.
import { CreateRepoDialog, type CreateRepoSubmitValue } from "@/components/library/repos/create-repo-dialog";
import { RepoDetailSheet } from "@/components/library/repos/repo-detail-sheet";
import { ConnectRepoDialog } from "@/components/library/repos/connect-repo-dialog";
import { ConnectedRepoSheet } from "@/components/library/repos/connected-repo-sheet";
import { createRepo, convertFolderToRepo } from "@/lib/library/user-repos";
import { readDesktopsSnapshot, addIcon, setWallpaper, openWindow } from "@/components/desktop/desktop-store";
import { updateProfile, activeProfileId } from "@/lib/profiles/profiles";
import { listZipEntries } from "@/lib/files/simple-zip";

const TYPE_FILTERS: Array<{ key: "todos" | SavedItemType; label: string }> = [
    { key: "todos", label: "Todo" },
    { key: "package", label: "Paquetes" },
    { key: "post", label: "Publicaciones" },
    { key: "file", label: "Archivos" },
    { key: "page", label: "Páginas" },
    { key: "route", label: "Rutas" },
    { key: "external", label: "Enlaces" },
    { key: "bookmark", label: "Marcadores" },
    { key: "alias", label: "Accesos directos" },
    { key: "branch", label: "Ramas" },
    { key: "repo", label: "Repos conectados" },
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
        doc, loading, reload, saveItem, removeItem, moveItem, createFolder, renameFolder, removeFolder,
        moveFolder, setItemTags, setItemAcl, setFolderAcl, createAlias, replicateItem, duplicateItem,
        updateItemContent, restoreItemVersion, mergeBranch,
    } = useEntityLibrary(entityRef);

    const ctx: AclViewerContext = aclContext ?? { isOwner: true, userId: null, groupSlugs: [] };

    // uid actual (best-effort, para "Comentarios" — distingue "Tú" y habilita borrar los propios).
    const [myUserId, setMyUserId] = useState<string | null>(null);
    useEffect(() => {
        let alive = true;
        createClient().auth.getUser().then(({ data }) => {
            if (alive) setMyUserId(data.user?.id ?? null);
        });
        return () => {
            alive = false;
        };
    }, []);

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
    // Adenda 65: versiones / ramas / comentarios / instalar-guardar-en / repositorios.
    const [editItemTarget, setEditItemTarget] = useState<SavedItem | null>(null);
    const [versionsTarget, setVersionsTarget] = useState<SavedItem | null>(null);
    const [branchesTarget, setBranchesTarget] = useState<SavedItem | null>(null);
    const [commentsTarget, setCommentsTarget] = useState<{ kind: "item" | "folder"; id: string; title: string } | null>(null);
    const [installTo, setInstallTo] = useState<{ item: SavedItem; defaultDest?: "biblioteca" | "escritorio" | "cerebro" | "servidor" } | null>(null);
    const [repoDialog, setRepoDialog] = useState<{ mode: "create" | "convert"; parentId: string | null; folder?: LibraryFolder } | null>(null);
    const [repoDetailFolderId, setRepoDetailFolderId] = useState<string | null>(null);
    const [connectRepoOpen, setConnectRepoOpen] = useState(false);
    const [connectedRepoItem, setConnectedRepoItem] = useState<SavedItem | null>(null);
    const [repoBusy, setRepoBusy] = useState(false);

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
            // Repo conectado (§17): "Abrir" muestra la ficha en vez de saltar directo a GitHub.
            if (resolved.type === "repo" && resolved.connectedRepo) {
                setConnectedRepoItem(resolved);
                return;
            }
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
                        mime: source.mime,
                        thumbnail: source.thumbnail,
                        content: source.content,
                        language: source.language,
                        description: source.description,
                        connectedRepo: source.connectedRepo,
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

    // ── Versiones / edición (§13) ────────────────────────────────────────────

    const handleSaveEdit = useCallback(
        async (patch: VersionablePatch) => {
            if (!editItemTarget) return;
            await updateItemContent(editItemTarget.id, patch);
            toast.success("Editado", { description: "Se guardó una versión con el estado anterior." });
        },
        [editItemTarget, updateItemContent],
    );

    const handleRestoreVersion = useCallback(
        async (versionId: string) => {
            if (!versionsTarget) return;
            const res = await restoreItemVersion(versionsTarget.id, versionId);
            if (res.ok) toast.success("Versión restaurada");
            else toast.error("No se pudo restaurar la versión");
        },
        [versionsTarget, restoreItemVersion],
    );

    // ── Ramas: fusión (§14) ──────────────────────────────────────────────────

    const handleMergeBranch = useCallback(
        async (branchItemId: string, removeAfter: boolean) => {
            const res = await mergeBranch(branchItemId, { removeBranchAfter: removeAfter });
            if (res.ok) {
                toast.success("Rama fusionada", { description: "El origen quedó actualizado; puedes deshacerlo desde Versiones." });
                setBranchesTarget(null);
            } else {
                toast.error("No se pudo fusionar", { description: res.message });
            }
        },
        [mergeBranch],
    );

    // ── Más acciones por formato (§18) ───────────────────────────────────────

    const buildExtraActions = useCallback((item: SavedItem): FinderExtraAction[] => {
        const fmt = itemFormat(item);
        const actions: FinderExtraAction[] = [];

        const imageUrl = fmt === "image" ? item.url : undefined;
        if (imageUrl) {
            actions.push({
                label: "Fondo de escritorio",
                icon: ImageIcon,
                onClick: () => {
                    const snap = readDesktopsSnapshot();
                    if (!snap.activeId) {
                        toast.error("No hay un escritorio activo.");
                        return;
                    }
                    setWallpaper(snap.activeId, { type: "custom", value: imageUrl });
                    toast.success("Fondo de escritorio actualizado");
                },
            });
            actions.push({
                label: "Foto de perfil",
                icon: UserIcon,
                onClick: () => {
                    const pid = activeProfileId();
                    if (!pid) {
                        toast.error("No hay un perfil activo.");
                        return;
                    }
                    void updateProfile(pid, { avatarUrl: imageUrl }).then((r) => {
                        if (r) toast.success("Foto de perfil actualizada");
                        else toast.error("No se pudo actualizar la foto de perfil");
                    });
                },
            });
        }

        if ((fmt === "markdown" || fmt === "code") && (item.content || item.url)) {
            actions.push({
                label: "Copiar contenido",
                icon: CopyIcon,
                onClick: () => {
                    void (async () => {
                        let text = item.content ?? "";
                        if (!text && item.url) {
                            try {
                                const res = await fetch(item.url);
                                if (res.ok) text = await res.text();
                            } catch {
                                /* CORS/red: se avisa abajo si sigue vacío */
                            }
                        }
                        if (!text) {
                            toast.error("No hay contenido de texto disponible para copiar.");
                            return;
                        }
                        if (typeof navigator !== "undefined" && navigator.clipboard) {
                            await navigator.clipboard.writeText(text);
                            toast.success("Contenido copiado");
                        }
                    })();
                },
            });
        }

        if (fmt === "markdown") {
            actions.push({
                label: "Convertir en memoria de cerebro",
                icon: BrainCircuit,
                onClick: () => setInstallTo({ item, defaultDest: "cerebro" }),
            });
        }

        if ((fmt === "audio" || fmt === "video") && (item.url || item.route)) {
            actions.push({
                label: "Reproducir en ventana",
                icon: PlayIcon,
                onClick: () => {
                    const snap = readDesktopsSnapshot();
                    if (!snap.activeId) {
                        toast.error("No hay un escritorio activo.");
                        return;
                    }
                    openWindow(snap.activeId, { type: "file", ref: item.url ?? item.route ?? "", name: item.title, meta: { mime: item.mime ?? "" } });
                    toast.success("Abierto en una ventana del escritorio");
                },
            });
        }

        const isZip = /\.zip($|\?)/i.test(item.url ?? "") || item.mime === "application/zip";
        if (isZip && item.url) {
            actions.push({
                label: "Ver contenido del zip",
                icon: ArchiveIcon,
                onClick: () => {
                    void (async () => {
                        try {
                            const res = await fetch(item.url as string);
                            if (!res.ok) throw new Error("fetch");
                            const buf = await res.arrayBuffer();
                            const entries = listZipEntries(buf);
                            if (entries.length === 0) {
                                toast.message("No se pudo leer el contenido (¿CORS o zip vacío?).");
                                return;
                            }
                            toast.message(`${entries.length} archivo(s) en el zip`, {
                                description: entries.slice(0, 8).map((e) => e.name).join(", ") + (entries.length > 8 ? "…" : ""),
                            });
                        } catch {
                            toast.error("No se pudo leer el zip (posiblemente bloqueado por CORS).");
                        }
                    })();
                },
            });
        }

        return actions;
    }, []);

    // ── Repositorios (§16-17) ────────────────────────────────────────────────

    const handleCreateRepoSubmit = useCallback(
        async (value: CreateRepoSubmitValue) => {
            if (!repoDialog) return;
            setRepoBusy(true);
            if (repoDialog.mode === "create") {
                const res = await createRepo(entityRef, value, repoDialog.parentId);
                setRepoBusy(false);
                if (res.ok) {
                    toast.success("Repositorio creado", { description: `«${value.name}» ya está en tu biblioteca.` });
                    setRepoDialog(null);
                    if (res.folderId) setActiveFolder(res.folderId);
                } else {
                    toast.error("No se pudo crear el repositorio", { description: res.error });
                }
            } else if (repoDialog.folder) {
                await convertFolderToRepo(entityRef, repoDialog.folder, value);
                setRepoBusy(false);
                toast.success("Carpeta convertida en repositorio");
                setRepoDialog(null);
            }
        },
        [repoDialog, entityRef],
    );

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

                {currentWriteAllowed && (
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-9 cursor-pointer gap-1.5 border-lime-500/30 text-xs text-lime-300 hover:bg-lime-500/10"
                        onClick={() => setRepoDialog({ mode: "create", parentId: activeFolder })}
                    >
                        <GitBranch className="h-3.5 w-3.5" /> Nuevo repositorio…
                    </Button>
                )}
                {currentWriteAllowed && (
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-9 cursor-pointer gap-1.5 border-white/15 text-xs hover:bg-white/10"
                        onClick={() => setConnectRepoOpen(true)}
                    >
                        <ConnectIcon className="h-3.5 w-3.5" /> Conectar repo externo…
                    </Button>
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

            {/* ── Aviso: esta carpeta es un repositorio (§16) ── */}
            {activeFolder && (() => {
                const active = doc.folders.find((f) => f.id === activeFolder);
                if (!active?.repo) return null;
                return (
                    <button
                        type="button"
                        onClick={() => setRepoDetailFolderId(active.id)}
                        className="flex w-fit cursor-pointer items-center gap-2 rounded-xl border border-lime-500/25 bg-lime-500/[0.06] px-3 py-1.5 text-xs font-medium text-lime-300 hover:bg-lime-500/10"
                    >
                        <GitBranch className="h-3.5 w-3.5" /> Esta carpeta es un repositorio — ver ficha
                    </button>
                );
            })()}

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
                        onCommentsFolder={(folderId) => {
                            const f = doc.folders.find((x) => x.id === folderId);
                            if (f) setCommentsTarget({ kind: "folder", id: f.id, title: f.name });
                        }}
                        onOpenRepo={(folderId) => setRepoDetailFolderId(folderId)}
                        onConvertToRepo={(folderId) => {
                            const f = doc.folders.find((x) => x.id === folderId);
                            if (f) setRepoDialog({ mode: "convert", parentId: f.parentId, folder: f });
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
                            doc={doc}
                            onSelectRelated={(r) => setPreviewId(r.id)}
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
                    onEdit={
                        menuTarget.kind === "item"
                            ? () => {
                                  const it = itemsById.get(menuTarget.id);
                                  if (it) setEditItemTarget(it);
                              }
                            : undefined
                    }
                    onVersions={
                        menuTarget.kind === "item"
                            ? () => {
                                  const it = itemsById.get(menuTarget.id);
                                  if (it) setVersionsTarget(it);
                              }
                            : undefined
                    }
                    onBranches={
                        menuTarget.kind === "item"
                            ? () => {
                                  const it = itemsById.get(menuTarget.id);
                                  if (it) setBranchesTarget(it);
                              }
                            : undefined
                    }
                    onComments={() => {
                        if (menuTarget.kind === "item") {
                            const it = itemsById.get(menuTarget.id);
                            if (it) setCommentsTarget({ kind: "item", id: it.id, title: it.title });
                        } else {
                            const f = doc.folders.find((x) => x.id === menuTarget.id);
                            if (f) setCommentsTarget({ kind: "folder", id: f.id, title: f.name });
                        }
                    }}
                    onInstallTo={
                        menuTarget.kind === "item"
                            ? () => {
                                  const it = itemsById.get(menuTarget.id);
                                  if (it) setInstallTo({ item: it });
                              }
                            : undefined
                    }
                    extraActions={
                        menuTarget.kind === "item"
                            ? (() => {
                                  const it = itemsById.get(menuTarget.id);
                                  return it ? buildExtraActions(it) : undefined;
                              })()
                            : undefined
                    }
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

            {/* ── Editar ítem (§13) ── */}
            {editItemTarget && (
                <EditItemDialog
                    open
                    onOpenChange={(o) => !o && setEditItemTarget(null)}
                    item={editItemTarget}
                    onSave={(patch) => void handleSaveEdit(patch)}
                />
            )}

            {/* ── Versiones (§13) ── */}
            {versionsTarget && (
                <VersionsDialog
                    open
                    onOpenChange={(o) => !o && setVersionsTarget(null)}
                    item={itemsById.get(versionsTarget.id) ?? versionsTarget}
                    onRestore={(versionId) => void handleRestoreVersion(versionId)}
                />
            )}

            {/* ── Ramas: linaje + fusión (§14) ── */}
            {branchesTarget && (
                <BranchesDialog
                    open
                    onOpenChange={(o) => !o && setBranchesTarget(null)}
                    doc={doc}
                    item={itemsById.get(branchesTarget.id) ?? branchesTarget}
                    onMerge={(branchId, removeAfter) => void handleMergeBranch(branchId, removeAfter)}
                />
            )}

            {/* ── Comentarios (§15) ── */}
            {commentsTarget && (
                <CommentsDialog
                    open
                    onOpenChange={(o) => !o && setCommentsTarget(null)}
                    entityRef={entityRef}
                    title={commentsTarget.title}
                    targetId={commentsTarget.id}
                    myUserId={myUserId}
                />
            )}

            {/* ── Instalar / guardar en… (§18) ── */}
            {installTo && (
                <InstallToDialog
                    open
                    onOpenChange={(o) => !o && setInstallTo(null)}
                    item={installTo.item}
                    defaultDest={installTo.defaultDest}
                />
            )}

            {/* ── Repositorios: crear / convertir (§16) ── */}
            {repoDialog && (
                <CreateRepoDialog
                    open
                    onOpenChange={(o) => !o && setRepoDialog(null)}
                    fixedName={repoDialog.mode === "convert" ? repoDialog.folder?.name : undefined}
                    title={repoDialog.mode === "convert" ? "Convertir en repositorio" : "Nuevo repositorio"}
                    submitLabel={repoDialog.mode === "convert" ? "Convertir" : "Crear repositorio"}
                    busy={repoBusy}
                    onSubmit={(value) => void handleCreateRepoSubmit(value)}
                />
            )}

            {/* ── Repositorios: ficha (§16) ── */}
            {repoDetailFolderId && (() => {
                const f = doc.folders.find((x) => x.id === repoDetailFolderId);
                if (!f?.repo) return null;
                return (
                    <RepoDetailSheet
                        open
                        onOpenChange={(o) => !o && setRepoDetailFolderId(null)}
                        entityRef={entityRef}
                        doc={doc}
                        folder={f}
                        onOpenFolder={(folderId) => setActiveFolder(folderId)}
                        onChanged={reload}
                    />
                );
            })()}

            {/* ── Repos externos conectados (§17) ── */}
            {connectRepoOpen && (
                <ConnectRepoDialog
                    open
                    onOpenChange={setConnectRepoOpen}
                    entityRef={entityRef}
                    folderId={activeFolder}
                    onConnected={(itemId) => setPreviewId(itemId)}
                />
            )}
            {connectedRepoItem && (
                <ConnectedRepoSheet
                    open
                    onOpenChange={(o) => !o && setConnectedRepoItem(null)}
                    entityRef={entityRef}
                    item={itemsById.get(connectedRepoItem.id) ?? connectedRepoItem}
                    onChanged={reload}
                />
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
