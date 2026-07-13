"use client";

// ════════════════════════════════════════════════════════════════════════════
// ColumnsView — navegación Miller estilo Finder: una columna por nivel de
// folder, cada clic en un subfolder abre una columna nueva a la derecha;
// clic en un ítem lo selecciona (el padre muestra su preview en el panel
// lateral). Reusa ItemCard en layout "lista" dentro de cada columna.
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useRef } from "react";
import { ChevronRight, Folder, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LibraryFolder, SavedItem } from "@/lib/library/entity-library";
import { ItemCard } from "./item-card";
import { DRAG_MIME } from "./folder-tree";

export interface ColumnsViewProps {
    /** Cadena de folders activos (columnas), desde la raíz. */
    chain: (string | null)[];
    folders: LibraryFolder[];
    itemsByFolder: (folderId: string | null) => SavedItem[];
    foldersOf: (folderId: string | null) => LibraryFolder[];
    selectedId: string | null;
    selectedIds: Set<string>;
    accent?: string;
    onEnterFolder: (depth: number, folderId: string | null) => void;
    onSelectItem: (e: React.MouseEvent, item: SavedItem) => void;
    onOpenItem: (item: SavedItem) => void;
    onContextMenuItem: (e: React.MouseEvent, item: SavedItem) => void;
    onContextMenuFolder: (e: React.MouseEvent, folderId: string) => void;
    onDropOnFolder: (folderId: string | null, itemIds: string[]) => void;
    touchBind: (payload: { kind: "item" | "folder"; id: string }) => {
        onTouchStart: (e: React.TouchEvent) => void;
        onTouchMove: (e: React.TouchEvent) => void;
        onTouchEnd: () => void;
        onTouchCancel: () => void;
    };
    dragSelection: () => string[];
}

function Column({
    folderId, props, depth,
}: {
    folderId: string | null;
    props: ColumnsViewProps;
    depth: number;
}) {
    const subfolders = props.foldersOf(folderId);
    const items = props.itemsByFolder(folderId);
    const activeChild = props.chain[depth + 1] ?? undefined;

    return (
        <div className="flex h-full w-56 shrink-0 flex-col gap-1 overflow-y-auto border-r border-white/10 px-1.5 py-1.5">
            {subfolders.map((f) => {
                const isChainActive = activeChild === f.id;
                return (
                    <button
                        key={f.id}
                        type="button"
                        onClick={() => props.onEnterFolder(depth, f.id)}
                        onContextMenu={(e) => props.onContextMenuFolder(e, f.id)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                            e.preventDefault();
                            const raw = e.dataTransfer.getData(DRAG_MIME.ITEM);
                            if (!raw) return;
                            try {
                                const ids = JSON.parse(raw) as string[];
                                if (ids.length) props.onDropOnFolder(f.id, ids);
                            } catch {
                                /* noop */
                            }
                        }}
                        className={cn(
                            "flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-medium transition-colors",
                            isChainActive ? "bg-white/10 text-white" : "text-muted-foreground hover:bg-white/5 hover:text-white",
                        )}
                    >
                        {isChainActive ? <FolderOpen className="h-3.5 w-3.5 shrink-0" /> : <Folder className="h-3.5 w-3.5 shrink-0" />}
                        <span className="min-w-0 flex-1 truncate">{f.name}</span>
                        <ChevronRight className="h-3 w-3 shrink-0 opacity-40" />
                    </button>
                );
            })}

            {items.map((item) => (
                <ItemCard
                    key={item.id}
                    item={item}
                    layout="lista"
                    accent={props.accent}
                    selected={props.selectedIds.has(item.id) || props.selectedId === item.id}
                    onSelect={(e) => props.onSelectItem(e, item)}
                    onOpen={() => props.onOpenItem(item)}
                    onContextMenu={(e) => props.onContextMenuItem(e, item)}
                    onDragStartExtra={props.dragSelection}
                    {...props.touchBind({ kind: "item", id: item.id })}
                />
            ))}

            {subfolders.length === 0 && items.length === 0 && (
                <p className="px-2 py-3 text-center text-[11px] text-muted-foreground">Vacío</p>
            )}
        </div>
    );
}

export function ColumnsView(props: ColumnsViewProps) {
    const scrollRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        scrollRef.current?.scrollTo({ left: scrollRef.current.scrollWidth, behavior: "smooth" });
    }, [props.chain.length]);

    return (
        <div ref={scrollRef} className="flex h-[440px] max-h-[60vh] overflow-x-auto rounded-xl border border-white/10 bg-black/10">
            {props.chain.map((folderId, depth) => (
                <Column key={`${folderId ?? "root"}-${depth}`} folderId={folderId} props={props} depth={depth} />
            ))}
        </div>
    );
}

export default ColumnsView;
