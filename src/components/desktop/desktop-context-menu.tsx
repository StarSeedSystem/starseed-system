'use client';

// ════════════════════════════════════════════════════════════════
// StarSeed OS — Menús contextuales del escritorio (tipo computadora)
// ----------------------------------------------------------------
// Dos menús de clic derecho (y pulsación larga táctil):
//   • Lienzo: Nuevo (folder/nota/enlace) · Organizar iconos · Ordenar
//     por (nombre/tipo/fecha) · Ver como (iconos/lista) · Rejilla ·
//     Cambiar fondo · Añadir apps/widgets · Ajustes del escritorio.
//   • Icono: Abrir · Renombrar · Duplicar · Tamaño · Vista previa ·
//     Enviar a folder · Eliminar.
// Presentacional + posicionado dentro del lienzo, con auto-clamp a los
// bordes. Ejecuta acciones del store directamente y cierra al elegir.
// ════════════════════════════════════════════════════════════════

import React from "react";
import {
    FolderPlus, StickyNote, Link2, LayoutGrid, ArrowUpDown, List, Grid3x3,
    Image as ImageIcon, MonitorPlay, Settings2, ExternalLink, Pencil, Copy,
    Trash2, Magnet, FolderInput, Sparkles, Check, PictureInPicture2, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Desktop, DesktopIcon, DesktopSortMode, DesktopIconSize } from "./desktop-store";
import {
    addIcon, createNoteIcon, sortIcons, autoArrangeIcons, setSnap, updateIcon,
    duplicateIcon, removeIcon, moveIconToFolder, setDesktopView, DEFAULT_DESKTOP_VIEW,
} from "./desktop-store";

const MENU_W = 210;

// ── Primitivas de menú ───────────────────────────────────────────
export function MenuItem({
    icon: Icon, label, shortcut, danger, active, onClick,
}: {
    icon?: LucideIcon;
    label: string;
    shortcut?: string;
    danger?: boolean;
    active?: boolean;
    onClick: () => void;
}): React.ReactElement {
    return (
        <button
            type="button"
            role="menuitem"
            onClick={onClick}
            className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[12px] font-semibold transition-colors cursor-pointer",
                danger ? "text-red-300 hover:bg-red-500/15" : "text-foreground/90 hover:bg-white/10",
                active && "bg-white/[0.06]",
            )}
        >
            {Icon ? <Icon className="size-3.5 shrink-0 opacity-90" /> : <span className="size-3.5 shrink-0" />}
            <span className="flex-1 truncate">{label}</span>
            {active && <Check className="size-3 shrink-0 text-cyan-300" />}
            {shortcut && <span className="shrink-0 text-[10px] font-bold text-muted-foreground/60">{shortcut}</span>}
        </button>
    );
}

function MenuLabel({ children }: { children: React.ReactNode }): React.ReactElement {
    return (
        <p className="px-2.5 pb-0.5 pt-1.5 text-[9px] font-black uppercase tracking-[0.16em] text-muted-foreground/60">
            {children}
        </p>
    );
}

function MenuDivider(): React.ReactElement {
    return <div className="my-1 h-px bg-white/10" />;
}

// ── Submenú desplegable en línea ─────────────────────────────────
function SubMenu({
    icon: Icon, label, children,
}: {
    icon: LucideIcon;
    label: string;
    children: React.ReactNode;
}): React.ReactElement {
    const [open, setOpen] = React.useState(false);
    return (
        <div>
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[12px] font-semibold text-foreground/90 transition-colors hover:bg-white/10 cursor-pointer",
                    open && "bg-white/[0.06]",
                )}
            >
                <Icon className="size-3.5 shrink-0 opacity-90" />
                <span className="flex-1 truncate">{label}</span>
                <span className={cn("shrink-0 text-[10px] text-muted-foreground transition-transform", open && "rotate-90")}>›</span>
            </button>
            {open && <div className="mb-0.5 ml-3 border-l border-white/10 pl-1">{children}</div>}
        </div>
    );
}

// ── Contenedor posicionado (auto-clamp a bordes del lienzo) ──────
function MenuShell({
    x, y, canvasRef, children,
}: {
    x: number;
    y: number;
    canvasRef: React.RefObject<HTMLDivElement | null>;
    children: React.ReactNode;
}): React.ReactElement {
    const rect = canvasRef.current?.getBoundingClientRect();
    const localX = rect ? x - rect.left : x;
    const localY = rect ? y - rect.top : y;
    const maxW = rect?.width ?? 800;
    const maxH = rect?.height ?? 600;
    const left = Math.max(6, Math.min(localX, maxW - MENU_W - 6));
    const top = Math.max(48, Math.min(localY, maxH - 40));
    return (
        <div
            role="menu"
            style={{ left, top, width: MENU_W, maxHeight: maxH - top - 10 }}
            className="absolute z-[62] overflow-y-auto rounded-2xl border border-white/12 bg-card/95 p-1.5 shadow-2xl backdrop-blur-2xl"
        >
            <span aria-hidden className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/50 to-transparent" />
            {children}
        </div>
    );
}

// ── Menú del LIENZO (fondo vacío) ────────────────────────────────
export function CanvasContextMenu({
    x, y, desktop, canvasRef, snap, onClose,
    onAddApps, onAddWidgets, onChangeBackground, onOpenSettings, onOpenExpose,
}: {
    x: number;
    y: number;
    desktop: Desktop;
    canvasRef: React.RefObject<HTMLDivElement | null>;
    snap: boolean;
    onClose: () => void;
    onAddApps: () => void;
    onAddWidgets: () => void;
    onChangeBackground: () => void;
    onOpenSettings: () => void;
    /** Abre Exposé (vista de conjunto). Omitido → oculta el ítem. */
    onOpenExpose?: () => void;
}): React.ReactElement {
    const view = desktop.view ?? {};
    const run = (fn: () => void) => { fn(); onClose(); };
    const askAurora = () => {
        try {
            window.dispatchEvent(new CustomEvent("starseed:open-aurora-exocortex"));
            window.dispatchEvent(new CustomEvent("aurora:suggest", { detail: { context: "desktop-canvas", desktopName: desktop.name } }));
        } catch { /* noop */ }
    };

    return (
        <MenuShell x={x} y={y} canvasRef={canvasRef}>
            <MenuLabel>Nuevo</MenuLabel>
            <MenuItem icon={FolderPlus} label="Folder" onClick={() => run(() => addIcon(desktop.id, { kind: "folder", name: "Nuevo folder", accent: "#FFBF00" }))} />
            <MenuItem icon={StickyNote} label="Nota" onClick={() => run(() => createNoteIcon(desktop.id, "Nota"))} />
            <MenuItem icon={LayoutGrid} label="Añadir apps…" onClick={() => run(onAddApps)} />
            <MenuItem icon={MonitorPlay} label="Añadir widgets…" onClick={() => run(onAddWidgets)} />

            <MenuDivider />
            <MenuItem icon={Sparkles} label="Pídeselo a Aurora" onClick={() => run(askAurora)} />
            {onOpenExpose && desktop.windows.length > 0 && (
                <MenuItem icon={LayoutGrid} label="Vista de conjunto" shortcut="F3" onClick={() => run(onOpenExpose)} />
            )}
            <MenuItem icon={LayoutGrid} label="Auto-organizar" onClick={() => run(() => autoArrangeIcons(desktop.id))} />
            <SubMenu icon={ArrowUpDown} label="Ordenar por">
                {([["name", "Nombre"], ["type", "Tipo"], ["date", "Fecha"]] as Array<[DesktopSortMode, string]>).map(([m, lbl]) => (
                    <MenuItem key={m} label={lbl} active={view.sortMode === m} onClick={() => run(() => sortIcons(desktop.id, m))} />
                ))}
            </SubMenu>
            <SubMenu icon={view.showGrid ? Grid3x3 : List} label="Ver">
                <MenuItem icon={Grid3x3} label="Rejilla visible" active={view.showGrid === true} onClick={() => run(() => setDesktopView(desktop.id, { showGrid: true }))} />
                <MenuItem icon={List} label="Rejilla oculta" active={!view.showGrid} onClick={() => run(() => setDesktopView(desktop.id, { showGrid: false }))} />
            </SubMenu>
            <MenuItem icon={Magnet} label="Rejilla magnética" active={snap} onClick={() => run(() => setSnap(!snap))} />
            <MenuItem
                icon={PictureInPicture2}
                label="Snap de ventanas a bordes"
                active={(view.windowSnap ?? DEFAULT_DESKTOP_VIEW.windowSnap) !== false}
                onClick={() => run(() => setDesktopView(desktop.id, { windowSnap: !(view.windowSnap ?? DEFAULT_DESKTOP_VIEW.windowSnap) }))}
            />

            <MenuDivider />
            <MenuItem icon={ImageIcon} label="Cambiar fondo…" onClick={() => run(onChangeBackground)} />
            <MenuItem icon={Settings2} label="Ajustes del escritorio…" onClick={() => run(onOpenSettings)} />
        </MenuShell>
    );
}

// ── Menú de un ICONO ─────────────────────────────────────────────
export function IconContextMenu({
    x, y, desktop, icon, canvasRef, onClose, onOpen, onRename,
}: {
    x: number;
    y: number;
    desktop: Desktop;
    icon: DesktopIcon;
    canvasRef: React.RefObject<HTMLDivElement | null>;
    onClose: () => void;
    onOpen: (icon: DesktopIcon) => void;
    onRename: (id: string) => void;
}): React.ReactElement {
    const run = (fn: () => void) => { fn(); onClose(); };
    const canPreview = icon.kind === "widget" || (icon.kind === "file" && (icon.fileKind === "image" || icon.fileKind === "gif"));
    // Folders raíz destino (no la propia si es folder).
    const folders = desktop.icons.filter((i) => i.kind === "folder" && i.id !== icon.id);

    return (
        <MenuShell x={x} y={y} canvasRef={canvasRef}>
            <MenuItem icon={ExternalLink} label="Abrir" onClick={() => run(() => onOpen(icon))} />
            <MenuItem icon={Pencil} label="Renombrar" onClick={() => run(() => onRename(icon.id))} />
            <MenuItem icon={Copy} label="Duplicar" onClick={() => run(() => duplicateIcon(desktop.id, icon.id))} />
            {canPreview && (
                <MenuItem
                    icon={MonitorPlay}
                    label={icon.viewMode === "preview" ? "Ver como icono" : "Vista previa viva"}
                    onClick={() => run(() => updateIcon(desktop.id, icon.id, { viewMode: icon.viewMode === "preview" ? "icon" : "preview" }))}
                />
            )}

            <MenuDivider />
            <MenuLabel>Tamaño</MenuLabel>
            <div className="flex gap-1 px-2 pb-1">
                {(["sm", "md", "lg"] as DesktopIconSize[]).map((s) => (
                    <button
                        key={s}
                        type="button"
                        onClick={() => run(() => updateIcon(desktop.id, icon.id, { size: s }))}
                        className={cn(
                            "flex-1 rounded-md border py-1 text-[10px] font-black uppercase transition-colors cursor-pointer",
                            icon.size === s ? "border-sky-300/60 bg-sky-400/20 text-sky-100" : "border-white/10 text-muted-foreground hover:bg-white/10",
                        )}
                    >
                        {s === "sm" ? "Peq" : s === "md" ? "Med" : "Gr"}
                    </button>
                ))}
            </div>

            {folders.length > 0 && (
                <SubMenu icon={FolderInput} label="Enviar a folder">
                    {folders.map((f) => (
                        <MenuItem key={f.id} icon={FolderPlus} label={f.name} onClick={() => run(() => moveIconToFolder(desktop.id, icon.id, f.id))} />
                    ))}
                </SubMenu>
            )}

            <MenuDivider />
            <MenuItem icon={Trash2} label="Eliminar" danger onClick={() => run(() => removeIcon(desktop.id, icon.id))} />
        </MenuShell>
    );
}
