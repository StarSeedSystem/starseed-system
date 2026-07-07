"use client";

// ════════════════════════════════════════════════════════════════════════════
// FolderTree — árbol de carpetas anidadas en el sidebar del Finder, con drag
// para mover ítems y carpetas (arrastrar una fila sobre otra la re-anida o
// mueve los ítems soltados dentro). Usa HTML5 drag nativo (mismo patrón que
// grid-area.tsx: dataTransfer + onDragOver/onDrop), sin depender de @dnd-kit
// aquí porque el árbol es una lista simple, no necesita reordenar por índice.
// ════════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
    Folder, FolderOpen, ChevronRight, MoreVertical, PenSquare, Trash2, FolderPlus, X, Package, ShieldCheck,
    GitBranch, MessageSquare,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { buildFolderTree, type FolderNode } from "./finder-types";
import type { LibraryFolder } from "@/lib/library/entity-library";

const DRAG_ITEM_MIME = "application/x-starseed-item";
const DRAG_FOLDER_MIME = "application/x-starseed-folder";

export interface FolderTreeProps {
    folders: LibraryFolder[];
    activeFolder: string | null;
    counts: Record<string, number>;
    totalCount: number;
    canWrite: boolean;
    onSelect: (folderId: string | null) => void;
    onRename: (folderId: string, name: string) => void;
    onRemove: (folderId: string) => void;
    onCreate: (name: string, parentId: string | null) => void;
    onMoveFolder: (folderId: string, parentId: string | null) => void;
    onDropItems: (itemIds: string[], folderId: string | null) => void;
    onContextMenuFolder?: (e: React.MouseEvent | React.TouchEvent, folderId: string) => void;
    onPublishFolder?: (folderId: string) => void;
    onPermissionsFolder?: (folderId: string) => void;
    /** v2.1 (§16): abre la ficha del repositorio (si `folder.repo` ya existe). */
    onOpenRepo?: (folderId: string) => void;
    /** v2.1 (§16): abre el diálogo para convertir esta carpeta en repositorio. */
    onConvertToRepo?: (folderId: string) => void;
    /** v2.1 (§15): abre el hilo de comentarios de esta carpeta. */
    onCommentsFolder?: (folderId: string) => void;
}

function FolderRow({
    node, props, expanded, onToggle,
}: {
    node: FolderNode;
    props: FolderTreeProps;
    expanded: Set<string>;
    onToggle: (id: string) => void;
}) {
    const { folder, children, depth } = node;
    const isActive = props.activeFolder === folder.id;
    const count = props.counts[folder.id] ?? 0;
    const hasChildren = children.length > 0;
    const isOpen = expanded.has(folder.id);
    const [dragOver, setDragOver] = useState(false);
    const [renaming, setRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState(folder.name);

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const itemsRaw = e.dataTransfer.getData(DRAG_ITEM_MIME);
        const folderRaw = e.dataTransfer.getData(DRAG_FOLDER_MIME);
        if (itemsRaw) {
            try {
                const ids = JSON.parse(itemsRaw) as string[];
                if (ids.length) props.onDropItems(ids, folder.id);
            } catch {
                /* noop */
            }
        } else if (folderRaw && folderRaw !== folder.id) {
            props.onMoveFolder(folderRaw, folder.id);
        }
    };

    return (
        <div>
            <div
                className={cn(
                    "group flex items-center gap-1 rounded-lg transition-colors",
                    isActive ? "bg-white/10 text-white" : "text-muted-foreground hover:bg-white/5 hover:text-white",
                    dragOver && "bg-primary/15 ring-1 ring-primary/40",
                )}
                style={{ paddingLeft: 4 + depth * 14 }}
                draggable={props.canWrite}
                onDragStart={(e) => {
                    e.dataTransfer.setData(DRAG_FOLDER_MIME, folder.id);
                    e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onContextMenu={(e) => props.onContextMenuFolder?.(e, folder.id)}
            >
                {hasChildren ? (
                    <button
                        type="button"
                        onClick={() => onToggle(folder.id)}
                        className="cursor-pointer p-0.5 text-muted-foreground hover:text-white"
                        aria-label={isOpen ? "Contraer" : "Expandir"}
                    >
                        <ChevronRight className={cn("h-3 w-3 transition-transform duration-200", isOpen && "rotate-90")} />
                    </button>
                ) : (
                    <span className="w-4" />
                )}

                {renaming ? (
                    <div className="flex flex-1 items-center gap-1 py-1">
                        <Input
                            autoFocus
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    props.onRename(folder.id, renameValue);
                                    setRenaming(false);
                                }
                                if (e.key === "Escape") setRenaming(false);
                            }}
                            className="h-6 rounded border-white/10 bg-black/30 px-1.5 text-[11px]"
                        />
                        <button type="button" onClick={() => setRenaming(false)} className="cursor-pointer text-muted-foreground hover:text-white">
                            <X className="h-3 w-3" />
                        </button>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => props.onSelect(folder.id)}
                        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-1.5 text-left text-xs font-medium"
                    >
                        {folder.repo ? (
                            <GitBranch className="h-3.5 w-3.5 shrink-0 text-lime-300" />
                        ) : isActive ? (
                            <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                        ) : (
                            <Folder className="h-3.5 w-3.5 shrink-0" />
                        )}
                        <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                        <span className="shrink-0 tabular-nums opacity-60">{count}</span>
                    </button>
                )}

                {props.canWrite && !renaming && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 shrink-0 cursor-pointer opacity-0 group-hover:opacity-100"
                                aria-label={`Más acciones para ${folder.name}`}
                            >
                                <MoreVertical className="h-3 w-3" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="border-white/10 bg-black/85 backdrop-blur-xl">
                            <DropdownMenuItem
                                className="cursor-pointer gap-2 text-xs"
                                onClick={() => {
                                    setRenameValue(folder.name);
                                    setRenaming(true);
                                }}
                            >
                                <PenSquare className="h-3.5 w-3.5" /> Renombrar
                            </DropdownMenuItem>
                            {props.onPermissionsFolder && (
                                <DropdownMenuItem
                                    className="cursor-pointer gap-2 text-xs"
                                    onClick={() => props.onPermissionsFolder?.(folder.id)}
                                >
                                    <ShieldCheck className="h-3.5 w-3.5" /> Permisos…
                                </DropdownMenuItem>
                            )}
                            {props.onCommentsFolder && (
                                <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => props.onCommentsFolder?.(folder.id)}>
                                    <MessageSquare className="h-3.5 w-3.5" /> Comentarios…
                                </DropdownMenuItem>
                            )}
                            {props.onPublishFolder && (
                                <DropdownMenuItem
                                    className="cursor-pointer gap-2 text-xs text-emerald-300 focus:text-emerald-200"
                                    onClick={() => props.onPublishFolder?.(folder.id)}
                                >
                                    <Package className="h-3.5 w-3.5" /> Publicar carpeta completa…
                                </DropdownMenuItem>
                            )}
                            {(props.onOpenRepo || props.onConvertToRepo) && <DropdownMenuSeparator className="bg-white/10" />}
                            {folder.repo && props.onOpenRepo && (
                                <DropdownMenuItem
                                    className="cursor-pointer gap-2 text-xs text-lime-300 focus:text-lime-200"
                                    onClick={() => props.onOpenRepo?.(folder.id)}
                                >
                                    <GitBranch className="h-3.5 w-3.5" /> Ficha del repositorio…
                                </DropdownMenuItem>
                            )}
                            {!folder.repo && props.onConvertToRepo && (
                                <DropdownMenuItem
                                    className="cursor-pointer gap-2 text-xs text-lime-300 focus:text-lime-200"
                                    onClick={() => props.onConvertToRepo?.(folder.id)}
                                >
                                    <GitBranch className="h-3.5 w-3.5" /> Convertir en repositorio…
                                </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                                className="cursor-pointer gap-2 text-xs text-rose-300 focus:text-rose-200"
                                onClick={() => props.onRemove(folder.id)}
                            >
                                <Trash2 className="h-3.5 w-3.5" /> Eliminar carpeta
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </div>

            {hasChildren && isOpen && (
                <div>
                    {children.map((child) => (
                        <FolderRow key={child.folder.id} node={child} props={props} expanded={expanded} onToggle={onToggle} />
                    ))}
                </div>
            )}
        </div>
    );
}

export function FolderTree(props: FolderTreeProps) {
    const tree = buildFolderTree(props.folders);
    const [expanded, setExpanded] = useState<Set<string>>(new Set(props.folders.map((f) => f.id)));
    const [newFolderOpen, setNewFolderOpen] = useState(false);
    const [newFolderName, setNewFolderName] = useState("");
    const [rootDragOver, setRootDragOver] = useState(false);

    const toggle = (id: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleRootDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setRootDragOver(false);
        const itemsRaw = e.dataTransfer.getData(DRAG_ITEM_MIME);
        const folderRaw = e.dataTransfer.getData(DRAG_FOLDER_MIME);
        if (itemsRaw) {
            try {
                const ids = JSON.parse(itemsRaw) as string[];
                if (ids.length) props.onDropItems(ids, null);
            } catch {
                /* noop */
            }
        } else if (folderRaw) {
            props.onMoveFolder(folderRaw, null);
        }
    };

    return (
        <div className="flex shrink-0 flex-col gap-1 md:w-56">
            <button
                type="button"
                onClick={() => props.onSelect(null)}
                onDragOver={(e) => {
                    e.preventDefault();
                    setRootDragOver(true);
                }}
                onDragLeave={() => setRootDragOver(false)}
                onDrop={handleRootDrop}
                className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-colors",
                    props.activeFolder === null ? "bg-white/10 text-white" : "text-muted-foreground hover:bg-white/5 hover:text-white",
                    rootDragOver && "bg-primary/15 ring-1 ring-primary/40",
                )}
            >
                <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">Todo</span>
                <span className="shrink-0 tabular-nums opacity-60">{props.totalCount}</span>
            </button>

            {tree.map((node) => (
                <FolderRow key={node.folder.id} node={node} props={props} expanded={expanded} onToggle={toggle} />
            ))}

            {props.canWrite && (
                newFolderOpen ? (
                    <div className="flex items-center gap-1 pt-1">
                        <Input
                            autoFocus
                            value={newFolderName}
                            onChange={(e) => setNewFolderName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && newFolderName.trim()) {
                                    props.onCreate(newFolderName.trim(), props.activeFolder);
                                    setNewFolderName("");
                                    setNewFolderOpen(false);
                                }
                                if (e.key === "Escape") {
                                    setNewFolderOpen(false);
                                    setNewFolderName("");
                                }
                            }}
                            placeholder="Nombre de la carpeta"
                            className="h-8 rounded-lg border-white/10 bg-black/20 text-xs"
                        />
                        <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 shrink-0 cursor-pointer text-muted-foreground hover:text-white"
                            onClick={() => {
                                setNewFolderOpen(false);
                                setNewFolderName("");
                            }}
                            aria-label="Cancelar"
                        >
                            <X className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => setNewFolderOpen(true)}
                        className="mt-1 flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-white/5 hover:text-white"
                    >
                        <FolderPlus className="h-3.5 w-3.5 shrink-0" /> Nueva carpeta
                    </button>
                )
            )}
        </div>
    );
}

export const DRAG_MIME = { ITEM: DRAG_ITEM_MIME, FOLDER: DRAG_FOLDER_MIME };

export default FolderTree;
