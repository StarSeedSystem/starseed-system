'use client';

// ════════════════════════════════════════════════════════════════
// StarSeed OS — Vista de folder ramificado (jerarquía clara)
// ----------------------------------------------------------------
// Reemplaza el grid plano de FolderContent por un explorador real:
//   • Breadcrumb navegable (entra en folders anidados sin abrir más
//     ventanas — ramificación dentro de la misma ventana).
//   • Vista conmutable Rejilla / Lista.
//   • Iconos por TIPO de archivo (imagen/vídeo/audio/pdf/código/3D/
//     markdown/datos/folder) con color y etiqueta; miniatura si hay.
//   • Acciones por elemento: abrir · renombrar · duplicar · quitar.
//   • Crear folder/nota/subfolder y "Añadir aquí".
// Lee del store por id (reactivo) y navega por ruta de ids.
// ════════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useState } from "react";
import {
    FolderOpen, Plus, Trash2, LayoutGrid, List, ChevronRight, Home,
    Copy, Pencil, FolderPlus, StickyNote, ArrowUpDown, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DesktopIcon, DesktopSortMode } from "./desktop-store";
import {
    useDesktopsState, findIconInTree, removeIcon, updateIcon, duplicateIcon,
    addIcon, createNoteIcon,
} from "./desktop-store";
import { useOpenDesktopIcon } from "./desktop-open";
import { desktopIconVisual, thumbnailUrl, countFolderItems } from "./desktop-file-icons";

type FolderViewMode = "grid" | "list";
const VIEW_KEY = "starseed.desktops.folderview";

function readFolderView(): FolderViewMode {
    if (typeof localStorage === "undefined") return "grid";
    try {
        return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
    } catch {
        return "grid";
    }
}

function sortChildren(children: DesktopIcon[], mode: DesktopSortMode): DesktopIcon[] {
    const rank = (k: DesktopIcon["kind"]) =>
        k === "folder" ? 0 : k === "app" ? 1 : k === "widget" ? 2 : k === "link" ? 3 : 4;
    const arr = [...children];
    if (mode === "name") arr.sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
    else if (mode === "type") arr.sort((a, b) => rank(a.kind) - rank(b.kind) || a.name.localeCompare(b.name, "es"));
    else if (mode === "date") arr.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    // 'manual' → conserva el orden de inserción
    return arr;
}

// ── Miniatura o placa de icono por tipo ──────────────────────────
function ItemGlyph({ icon, size }: { icon: DesktopIcon; size: number }): React.ReactElement {
    const [failed, setFailed] = useState(false);
    const { Icon, accent } = desktopIconVisual(icon);
    const thumb = thumbnailUrl(icon);
    if (thumb && !failed) {
        return (
            <div
                style={{ width: size, height: size }}
                className="overflow-hidden rounded-xl border border-white/15 bg-black/40 shadow"
            >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={thumb}
                    alt=""
                    draggable={false}
                    onError={() => setFailed(true)}
                    className="h-full w-full object-cover"
                />
            </div>
        );
    }
    return (
        <span
            style={{ width: size, height: size }}
            className="relative grid shrink-0 place-items-center overflow-hidden rounded-xl border border-white/15 shadow"
        >
            <span
                aria-hidden
                className="absolute inset-0"
                style={{ background: `linear-gradient(135deg, ${accent}, color-mix(in srgb, ${accent} 30%, rgba(10,14,26,0.9)))` }}
            />
            <span aria-hidden className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />
            <Icon className="relative text-white drop-shadow" style={{ width: size * 0.5, height: size * 0.5 }} strokeWidth={1.8} />
            {icon.kind === "folder" && countFolderItems(icon) > 0 && (
                <span className="absolute bottom-0.5 right-0.5 grid min-w-3.5 place-items-center rounded-full border border-white/25 bg-black/60 px-0.5 text-[8px] font-black text-white">
                    {countFolderItems(icon)}
                </span>
            )}
        </span>
    );
}

// ── Fila de acciones flotantes ───────────────────────────────────
function ItemActions({
    onRename, onDuplicate, onRemove,
}: {
    onRename: () => void;
    onDuplicate: () => void;
    onRemove: () => void;
}): React.ReactElement {
    const Btn = ({ title, onClick, danger, children }: {
        title: string; onClick: () => void; danger?: boolean; children: React.ReactNode;
    }) => (
        <button
            type="button"
            title={title}
            aria-label={title}
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            className={cn(
                "grid size-6 place-items-center rounded-lg border border-white/15 bg-black/70 backdrop-blur transition-colors cursor-pointer",
                danger ? "text-muted-foreground hover:bg-red-500/20 hover:text-red-300" : "text-muted-foreground hover:bg-white/15 hover:text-foreground",
            )}
        >
            {children}
        </button>
    );
    return (
        <div className="flex items-center gap-1">
            <Btn title="Renombrar" onClick={onRename}><Pencil className="size-3" /></Btn>
            <Btn title="Duplicar" onClick={onDuplicate}><Copy className="size-3" /></Btn>
            <Btn title="Quitar" onClick={onRemove} danger><Trash2 className="size-3" /></Btn>
        </div>
    );
}

// ── Un elemento (rejilla o lista) con renombrado en línea ────────
function FolderEntry({
    child, mode, desktopId, onOpen,
}: {
    child: DesktopIcon;
    mode: FolderViewMode;
    desktopId: string;
    onOpen: () => void;
}): React.ReactElement {
    const [renaming, setRenaming] = useState(false);
    const { label } = desktopIconVisual(child);
    const lastTap = React.useRef(0);

    const commit = (name: string) => {
        const clean = name.trim();
        if (clean) updateIcon(desktopId, child.id, { name: clean });
        setRenaming(false);
    };

    const NameField = (
        <input
            autoFocus
            defaultValue={child.name}
            onFocus={(e) => e.currentTarget.select()}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
                if (e.key === "Enter") commit(e.currentTarget.value);
                if (e.key === "Escape") setRenaming(false);
            }}
            onBlur={(e) => commit(e.currentTarget.value)}
            className="min-w-0 flex-1 rounded-md border border-sky-400/50 bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white outline-none"
        />
    );

    if (mode === "list") {
        return (
            <div
                role="button"
                tabIndex={0}
                onDoubleClick={onOpen}
                onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}
                onPointerUp={(e) => {
                    if (e.pointerType !== "touch") return;
                    const now = Date.now();
                    if (now - lastTap.current < 350) onOpen();
                    lastTap.current = now;
                }}
                className="group flex cursor-pointer items-center gap-2.5 rounded-xl border border-transparent px-2 py-1.5 transition-colors hover:border-white/10 hover:bg-white/[0.05]"
            >
                <ItemGlyph icon={child} size={34} />
                <div className="min-w-0 flex-1">
                    {renaming ? NameField : (
                        <p className="truncate text-[12px] font-bold text-foreground/90">{child.name}</p>
                    )}
                    <p className="truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/70">
                        {child.kind === "folder" ? `${countFolderItems(child)} elemento${countFolderItems(child) === 1 ? "" : "s"}` : label}
                    </p>
                </div>
                <div className="opacity-0 transition-opacity group-hover:opacity-100">
                    <ItemActions
                        onRename={() => setRenaming(true)}
                        onDuplicate={() => duplicateIcon(desktopId, child.id)}
                        onRemove={() => removeIcon(desktopId, child.id)}
                    />
                </div>
            </div>
        );
    }

    // Rejilla
    return (
        <div
            role="button"
            tabIndex={0}
            onDoubleClick={onOpen}
            onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}
            onPointerUp={(e) => {
                if (e.pointerType !== "touch") return;
                const now = Date.now();
                if (now - lastTap.current < 350) onOpen();
                lastTap.current = now;
            }}
            className="group relative flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl border border-transparent p-2 transition-colors hover:border-white/10 hover:bg-white/[0.05]"
            title={`Abrir ${child.name}`}
        >
            <ItemGlyph icon={child} size={56} />
            {renaming ? (
                <div className="w-full px-0.5">{NameField}</div>
            ) : (
                <span className="line-clamp-2 max-w-full break-words text-center text-[11px] font-semibold leading-tight text-foreground/90">
                    {child.name}
                </span>
            )}
            <div className="absolute right-1 top-1 opacity-0 transition-opacity group-hover:opacity-100">
                <ItemActions
                    onRename={() => setRenaming(true)}
                    onDuplicate={() => duplicateIcon(desktopId, child.id)}
                    onRemove={() => removeIcon(desktopId, child.id)}
                />
            </div>
        </div>
    );
}

// ── Vista principal de folder ───────────────────────────────────
export function DesktopFolderView({
    desktopId, rootFolderId, onRequestAddInto,
}: {
    desktopId: string;
    /** Folder raíz que abrió la ventana. */
    rootFolderId: string;
    /** Abre el catálogo "+ Añadir" apuntando a un folder (por id). */
    onRequestAddInto?: (folderId: string) => void;
}): React.ReactElement {
    const state = useDesktopsState();
    const desktop = state.desktops.find((d) => d.id === desktopId);
    const openIcon = useOpenDesktopIcon(desktopId);

    const [mode, setMode] = useState<FolderViewMode>("grid");
    const [sortMode, setSortMode] = useState<DesktopSortMode>("manual");
    const [sortOpen, setSortOpen] = useState(false);
    // Ruta de navegación (ids de folder), empezando en la raíz.
    const [path, setPath] = useState<string[]>([rootFolderId]);

    useEffect(() => { setMode(readFolderView()); }, []);
    useEffect(() => { setPath([rootFolderId]); }, [rootFolderId]);

    const setModePersist = (m: FolderViewMode) => {
        setMode(m);
        try { localStorage.setItem(VIEW_KEY, m); } catch { /* noop */ }
    };

    // Folder actual = último id de la ruta que aún existe.
    const trail = useMemo(() => {
        if (!desktop) return [];
        const out: DesktopIcon[] = [];
        for (const id of path) {
            const f = findIconInTree(desktop.icons, id);
            if (f && f.kind === "folder") out.push(f);
            else break;
        }
        return out;
    }, [desktop, path]);

    const current = trail[trail.length - 1];

    if (!desktop || !current) {
        return (
            <div className="grid h-full place-items-center p-6 text-center">
                <div className="max-w-xs space-y-2">
                    <FolderOpen className="mx-auto size-8 text-amber-300/70" />
                    <p className="text-xs leading-relaxed text-muted-foreground">
                        Este folder ya no existe en el escritorio.
                    </p>
                </div>
            </div>
        );
    }

    const children = sortChildren(current.children ?? [], sortMode);

    const enterFolder = (child: DesktopIcon) => {
        if (child.kind === "folder") setPath((p) => [...p, child.id]);
        else openIcon(child);
    };

    return (
        <div className="flex h-full w-full flex-col">
            {/* Breadcrumb + controles */}
            <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-white/10 bg-white/[0.03] px-2.5 py-1.5">
                <button
                    type="button"
                    onClick={() => setPath([rootFolderId])}
                    title="Raíz del folder"
                    className="grid size-6 shrink-0 place-items-center rounded-lg text-muted-foreground/80 transition-colors hover:bg-white/10 hover:text-foreground cursor-pointer"
                >
                    <Home className="size-3.5" />
                </button>
                <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
                    {trail.map((f, i) => (
                        <React.Fragment key={f.id}>
                            {i > 0 && <ChevronRight className="size-3 shrink-0 text-muted-foreground/50" />}
                            <button
                                type="button"
                                onClick={() => setPath((p) => p.slice(0, i + 1))}
                                className={cn(
                                    "shrink-0 truncate rounded-md px-1.5 py-0.5 text-[11px] font-bold transition-colors cursor-pointer",
                                    i === trail.length - 1
                                        ? "text-amber-200"
                                        : "text-muted-foreground hover:bg-white/10 hover:text-foreground",
                                )}
                            >
                                {f.name}
                            </button>
                        </React.Fragment>
                    ))}
                </nav>

                {/* Ordenar */}
                <div className="relative shrink-0">
                    <button
                        type="button"
                        onClick={() => setSortOpen((o) => !o)}
                        title="Ordenar"
                        aria-label="Ordenar contenido"
                        className={cn(
                            "grid size-6 place-items-center rounded-lg border transition-colors cursor-pointer",
                            sortOpen ? "border-white/25 bg-white/10 text-foreground" : "border-white/12 text-muted-foreground hover:bg-white/10 hover:text-foreground",
                        )}
                    >
                        <ArrowUpDown className="size-3.5" />
                    </button>
                    {sortOpen && (
                        <>
                            <div className="fixed inset-0 z-[70]" onPointerDown={() => setSortOpen(false)} aria-hidden />
                            <div className="absolute right-0 top-[calc(100%+4px)] z-[71] w-36 rounded-xl border border-white/12 bg-card/95 p-1 shadow-2xl backdrop-blur-2xl">
                                {([
                                    ["manual", "Manual"], ["name", "Nombre"], ["type", "Tipo"], ["date", "Fecha"],
                                ] as Array<[DesktopSortMode, string]>).map(([m, lbl]) => (
                                    <button
                                        key={m}
                                        type="button"
                                        onClick={() => { setSortMode(m); setSortOpen(false); }}
                                        className={cn(
                                            "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] font-semibold transition-colors cursor-pointer",
                                            sortMode === m ? "bg-amber-400/15 text-amber-100" : "text-foreground/90 hover:bg-white/10",
                                        )}
                                    >
                                        {sortMode === m ? <Check className="size-3" /> : <span className="size-3" />}
                                        {lbl}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                {/* Conmutar rejilla/lista */}
                <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-white/12 bg-black/30 p-0.5">
                    <button
                        type="button"
                        onClick={() => setModePersist("grid")}
                        title="Ver como iconos"
                        aria-label="Ver como iconos"
                        className={cn("grid size-5.5 place-items-center rounded-md transition-colors cursor-pointer", mode === "grid" ? "bg-white/15 text-foreground" : "text-muted-foreground hover:text-foreground")}
                        style={{ width: 22, height: 22 }}
                    >
                        <LayoutGrid className="size-3" />
                    </button>
                    <button
                        type="button"
                        onClick={() => setModePersist("list")}
                        title="Ver como lista"
                        aria-label="Ver como lista"
                        className={cn("grid size-5.5 place-items-center rounded-md transition-colors cursor-pointer", mode === "list" ? "bg-white/15 text-foreground" : "text-muted-foreground hover:text-foreground")}
                        style={{ width: 22, height: 22 }}
                    >
                        <List className="size-3" />
                    </button>
                </div>
            </div>

            {/* Barra de acciones de creación */}
            <div className="flex shrink-0 items-center gap-1.5 border-b border-white/10 bg-white/[0.02] px-2.5 py-1.5">
                <span className="mr-auto text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">
                    {children.length === 0 ? "Folder vacío" : `${children.length} elemento${children.length === 1 ? "" : "s"}`}
                </span>
                <button
                    type="button"
                    onClick={() => addIcon(desktopId, { kind: "folder", name: "Nuevo folder", accent: "#FFBF00" }, current.id)}
                    title="Nuevo subfolder"
                    className="inline-flex items-center gap-1 rounded-full border border-white/12 bg-white/[0.04] px-2 py-1 text-[10px] font-bold text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground cursor-pointer"
                >
                    <FolderPlus className="size-3" /> Folder
                </button>
                <button
                    type="button"
                    onClick={() => createNoteIcon(desktopId, "Nota", "", current.id)}
                    title="Nueva nota"
                    className="inline-flex items-center gap-1 rounded-full border border-white/12 bg-white/[0.04] px-2 py-1 text-[10px] font-bold text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground cursor-pointer"
                >
                    <StickyNote className="size-3" /> Nota
                </button>
                {onRequestAddInto && (
                    <button
                        type="button"
                        onClick={() => onRequestAddInto(current.id)}
                        className="inline-flex items-center gap-1 rounded-full border border-amber-300/30 bg-amber-300/10 px-2.5 py-1 text-[10px] font-bold text-amber-200 transition-colors hover:bg-amber-300/20 cursor-pointer"
                    >
                        <Plus className="size-3" /> Añadir aquí
                    </button>
                )}
            </div>

            {/* Contenido */}
            {children.length === 0 ? (
                <div className="grid flex-1 place-items-center p-6 text-center">
                    <div className="max-w-[280px] space-y-2">
                        <FolderOpen className="mx-auto size-8 text-amber-300/50" />
                        <p className="text-xs leading-relaxed text-muted-foreground">
                            Este folder está esperando contenido. Crea un subfolder o una nota,
                            o usa <strong>Añadir aquí</strong> para guardar apps, archivos y widgets.
                        </p>
                    </div>
                </div>
            ) : mode === "grid" ? (
                <div className="grid flex-1 auto-rows-min grid-cols-3 gap-1 overflow-y-auto p-2.5 sm:grid-cols-4 md:grid-cols-5">
                    {children.map((child) => (
                        <FolderEntry key={child.id} child={child} mode="grid" desktopId={desktopId} onOpen={() => enterFolder(child)} />
                    ))}
                </div>
            ) : (
                <div className="flex-1 space-y-0.5 overflow-y-auto p-2">
                    {children.map((child) => (
                        <FolderEntry key={child.id} child={child} mode="list" desktopId={desktopId} onOpen={() => enterFolder(child)} />
                    ))}
                </div>
            )}
        </div>
    );
}
