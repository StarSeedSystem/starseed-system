"use client";

// ════════════════════════════════════════════════════════════════════════════
// ItemCard — tarjeta de un ítem de Biblioteca, en layout "iconos" o "lista".
// Soporta: selección (checkbox visible en hover/seleccionado), drag (HTML5
// nativo, mismo MIME que folder-tree.tsx), doble clic para abrir, clic derecho
// / long-press para menú contextual (delegado al padre vía onContextMenu).
// ════════════════════════════════════════════════════════════════════════════

import { cn } from "@/lib/utils";
import { Check, CornerUpRight, GitBranch, Lock } from "lucide-react";
import { itemTypeMeta, itemFormat } from "./item-meta";
import { FORMAT_ICON_COLOR } from "./format-glyph";
import type { SavedItem } from "@/lib/library/entity-library";
import { DRAG_MIME } from "./folder-tree";

export interface ItemCardProps {
    item: SavedItem;
    layout: "iconos" | "lista";
    accent?: string;
    selected: boolean;
    readOnly?: boolean;
    onSelect: (e: React.MouseEvent) => void;
    onOpen: () => void;
    onContextMenu: (e: React.MouseEvent) => void;
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: () => void;
    onTouchCancel: () => void;
    onDragStartExtra?: () => string[];
}

export function ItemCard({
    item, layout, accent, selected, readOnly, onSelect, onOpen, onContextMenu,
    onTouchStart, onTouchMove, onTouchEnd, onTouchCancel, onDragStartExtra,
}: ItemCardProps) {
    const meta = itemTypeMeta(item.type);
    const fmt = itemFormat(item);
    const Icon = meta.icon;
    const isLinked = item.type === "alias" || item.type === "branch";
    const isRestricted = !!(item.acl && (item.acl.read.length > 0 || item.acl.write.length > 0));

    const handleDragStart = (e: React.DragEvent) => {
        const ids = onDragStartExtra ? onDragStartExtra() : [item.id];
        const set = ids.includes(item.id) ? ids : [item.id];
        e.dataTransfer.setData(DRAG_MIME.ITEM, JSON.stringify(set));
        e.dataTransfer.effectAllowed = "move";
    };

    const linkedBadge = item.type === "alias" ? CornerUpRight : item.type === "branch" ? GitBranch : null;
    const LinkedIcon = linkedBadge;

    if (layout === "lista") {
        return (
            <div
                role="button"
                tabIndex={0}
                draggable
                onDragStart={handleDragStart}
                onClick={onSelect}
                onDoubleClick={onOpen}
                onContextMenu={onContextMenu}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
                onTouchCancel={onTouchCancel}
                onKeyDown={(e) => {
                    if (e.key === "Enter") onOpen();
                }}
                className={cn(
                    "group flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition-colors duration-200",
                    selected ? "border-primary/40 bg-primary/10" : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]",
                )}
            >
                <span
                    className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-opacity",
                        selected ? "border-primary bg-primary text-white opacity-100" : "border-white/20 bg-transparent opacity-0 group-hover:opacity-100",
                    )}
                >
                    {selected && <Check className="h-3 w-3" />}
                </span>
                <span
                    className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: `${accent ?? FORMAT_ICON_COLOR[fmt]}18`, color: accent ?? FORMAT_ICON_COLOR[fmt] }}
                >
                    <Icon className="h-4 w-4" />
                    {LinkedIcon && <LinkedIcon className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-black/80 p-0.5 text-white/80" />}
                </span>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium leading-tight">{item.title}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] text-muted-foreground">{meta.label}</span>
                        {item.tags.slice(0, 3).map((t) => (
                            <span key={t} className="rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                #{t}
                            </span>
                        ))}
                    </div>
                </div>
                {isRestricted && (
                    <span title="Acceso restringido" className="shrink-0">
                        <Lock className="h-3.5 w-3.5 text-amber-300/70" />
                    </span>
                )}
                {readOnly && <span className="shrink-0 text-[10px] text-muted-foreground">Solo lectura</span>}
            </div>
        );
    }

    return (
        <div
            role="button"
            tabIndex={0}
            draggable
            onDragStart={handleDragStart}
            onClick={onSelect}
            onDoubleClick={onOpen}
            onContextMenu={onContextMenu}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onTouchCancel={onTouchCancel}
            onKeyDown={(e) => {
                if (e.key === "Enter") onOpen();
            }}
            className={cn(
                "group relative flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-colors duration-200",
                selected ? "border-primary/40 bg-primary/10" : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.05]",
            )}
        >
            <span
                className={cn(
                    "absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-md border transition-opacity",
                    selected ? "border-primary bg-primary text-white opacity-100" : "border-white/20 bg-black/40 opacity-0 group-hover:opacity-100",
                )}
            >
                {selected && <Check className="h-3 w-3" />}
            </span>
            {isRestricted && (
                <Lock className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-amber-300/70" />
            )}
            <span
                className="relative flex h-12 w-12 items-center justify-center rounded-2xl"
                style={{ background: `${accent ?? FORMAT_ICON_COLOR[fmt]}18`, color: accent ?? FORMAT_ICON_COLOR[fmt] }}
            >
                <Icon className="h-6 w-6" />
                {LinkedIcon && <LinkedIcon className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full bg-black/80 p-0.5 text-white/80" />}
            </span>
            <p className="line-clamp-2 w-full text-xs font-medium leading-tight">{item.title}</p>
            <span className="text-[10px] text-muted-foreground">{meta.label}</span>
        </div>
    );
}

export default ItemCard;
