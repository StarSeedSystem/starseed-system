'use client';

// ════════════════════════════════════════════════════════════════
// StarSeed OS — Lienzo del escritorio (/escritorios)
// ----------------------------------------------------------------
// La pantalla principal del OS: un escritorio entre computadora y
// tableta (macOS/Linux) en Crystal Liquid Glass. El FONDO es el fondo
// global del usuario ya montado por el layout raíz (aquí no se montan
// fondos nuevos; un wallpaper 'custom' se pinta como overlay propio).
// Capas: wallpaper → iconos (arrastrables, rejilla magnética opcional)
// → ventanas (multiventana propia) → barra superior glass → paneles.
// ════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
    Plus, Eye, EyeOff, ChevronDown, Pencil, Trash2, Check, Sparkles,
    LayoutGrid, MousePointer2, ExternalLink, X, Magnet, ImageIcon,
    MonitorPlay, SquareStack,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
    type Desktop, type DesktopIcon, useDesktopsState, useDesktopsBackup,
    seedIfEmpty, createDesktop, renameDesktop, deleteDesktop, setActiveDesktop,
    setWallpaper, setSnap, moveIcon, removeIcon, updateIcon,
    setWindowMinimized, focusWindow,
} from "./desktop-store";
import { DesktopIconTile, ICON_CELL } from "./desktop-icon";
import { useOpenDesktopIcon } from "./desktop-open";
import { DesktopWindowFrame } from "./desktop-window";
import { DesktopWindowContent, resolveWindowChrome } from "./desktop-window-content";
import { DesktopAddPanel, type AddPanelTab } from "./desktop-add-panel";
import { CursorSettingsPanel } from "./cursor-fx";

const TOPBAR_H = 44;
const WINDOW_TOP_INSET = TOPBAR_H + 6;

// ── Media query SSR-safe ─────────────────────────────────────────
function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState(false);
    useEffect(() => {
        if (typeof window === "undefined" || !window.matchMedia) return;
        const mq = window.matchMedia(query);
        const update = () => setMatches(mq.matches);
        update();
        try {
            mq.addEventListener("change", update);
            return () => mq.removeEventListener("change", update);
        } catch {
            mq.addListener(update);
            return () => mq.removeListener(update);
        }
    }, [query]);
    return matches;
}

// ── Reloj (hidratación segura) ───────────────────────────────────
function DesktopClock(): React.ReactElement {
    const [now, setNow] = useState<Date | null>(null);
    useEffect(() => {
        const tick = () => setNow(new Date());
        tick();
        const t = setInterval(tick, 15_000);
        return () => clearInterval(t);
    }, []);
    return (
        <div className="flex select-none items-baseline gap-1.5 px-1 text-right leading-none">
            <span className="hidden text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80 sm:inline">
                {now ? now.toLocaleDateString("es-ES", { weekday: "short", day: "numeric" }) : ""}
            </span>
            <span className="text-[12px] font-black tabular-nums text-foreground/90">
                {now ? now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : "--:--"}
            </span>
        </div>
    );
}

// ── Icono posicionado y arrastrable (pointer events) ─────────────
function PositionedIcon({
    desktopId, icon, areaRef, snap, selected, renaming,
    onSelect, onOpen, onContext, onRenameCommit, onRenameCancel,
}: {
    desktopId: string;
    icon: DesktopIcon;
    areaRef: React.RefObject<HTMLDivElement | null>;
    snap: boolean;
    selected: boolean;
    renaming: boolean;
    onSelect: (id: string, additive: boolean) => void;
    onOpen: (icon: DesktopIcon) => void;
    onContext: (x: number, y: number, icon: DesktopIcon) => void;
    onRenameCommit: (name: string) => void;
    onRenameCancel: () => void;
}): React.ReactElement {
    const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
    const gesture = useRef<{
        startX: number; startY: number; origX: number; origY: number;
        rect: DOMRect; dragging: boolean; pointerId: number;
    } | null>(null);
    const lastTapRef = useRef(0);
    const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearPress = () => {
        if (pressTimer.current) {
            clearTimeout(pressTimer.current);
            pressTimer.current = null;
        }
    };

    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (renaming) return;
        if (e.pointerType === "mouse" && e.button !== 0) return;
        const area = areaRef.current;
        if (!area) return;
        e.stopPropagation();
        onSelect(icon.id, e.shiftKey || e.metaKey || e.ctrlKey);
        const rect = area.getBoundingClientRect();
        gesture.current = {
            startX: e.clientX,
            startY: e.clientY,
            origX: icon.x * rect.width,
            origY: icon.y * rect.height,
            rect,
            dragging: false,
            pointerId: e.pointerId,
        };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        // Pulsación larga (táctil) → menú contextual
        if (e.pointerType === "touch") {
            const { clientX, clientY } = e;
            clearPress();
            pressTimer.current = setTimeout(() => {
                if (gesture.current && !gesture.current.dragging) {
                    onContext(clientX, clientY, icon);
                }
            }, 520);
        }
    };

    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const g = gesture.current;
        if (!g || g.pointerId !== e.pointerId) return;
        const dx = e.clientX - g.startX;
        const dy = e.clientY - g.startY;
        if (!g.dragging && Math.hypot(dx, dy) < 6) return;
        g.dragging = true;
        clearPress();
        const nx = Math.min(Math.max(g.origX + dx, 0), g.rect.width - 60);
        const ny = Math.min(Math.max(g.origY + dy, 0), g.rect.height - 60);
        setDragPos({ x: nx, y: ny });
    };

    const finishGesture = (e: React.PointerEvent<HTMLDivElement>) => {
        const g = gesture.current;
        clearPress();
        if (!g || g.pointerId !== e.pointerId) return;
        gesture.current = null;
        if (g.dragging && dragPos) {
            let { x, y } = dragPos;
            if (snap) {
                x = Math.round((x - 8) / ICON_CELL.w) * ICON_CELL.w + 8;
                y = Math.round((y - 8) / ICON_CELL.h) * ICON_CELL.h + 8;
                x = Math.min(Math.max(x, 0), g.rect.width - 60);
                y = Math.min(Math.max(y, 0), g.rect.height - 60);
            }
            moveIcon(desktopId, icon.id, x / g.rect.width, y / g.rect.height);
            setDragPos(null);
            return;
        }
        setDragPos(null);
        // Doble tap táctil → abrir
        if (e.pointerType === "touch") {
            const now = Date.now();
            if (now - lastTapRef.current < 350) {
                lastTapRef.current = 0;
                onOpen(icon);
            } else {
                lastTapRef.current = now;
            }
        }
    };

    const dragging = dragPos !== null;

    return (
        <div
            role="button"
            tabIndex={0}
            aria-label={icon.name}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={finishGesture}
            onPointerCancel={finishGesture}
            onDoubleClick={() => onOpen(icon)}
            onKeyDown={(e) => { if (e.key === "Enter") onOpen(icon); }}
            onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onContext(e.clientX, e.clientY, icon);
            }}
            style={
                dragging
                    ? { left: dragPos.x, top: dragPos.y }
                    : { left: `${icon.x * 100}%`, top: `${icon.y * 100}%` }
            }
            className={cn(
                "absolute touch-none cursor-pointer outline-none",
                dragging ? "z-30 scale-[1.04] opacity-90 transition-none" : "z-10 transition-[left,top] duration-200 ease-out",
            )}
        >
            <DesktopIconTile
                icon={icon}
                selected={selected}
                renaming={renaming}
                onRenameCommit={onRenameCommit}
                onRenameCancel={onRenameCancel}
            />
        </div>
    );
}

// ── Estado vacío: bienvenida guiada por Aurora ───────────────────
function EmptyDesktopState({
    desktop, onAddApps, onAddWidgets,
}: {
    desktop: Desktop;
    onAddApps: () => void;
    onAddWidgets: () => void;
}): React.ReactElement {
    const reduced = useReducedMotion();

    const askAurora = () => {
        try {
            window.dispatchEvent(new CustomEvent("starseed:open-aurora-exocortex"));
            window.dispatchEvent(new CustomEvent("aurora:suggest", {
                detail: { context: "desktop-empty", desktopName: desktop.name },
            }));
        } catch { /* noop */ }
    };

    return (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center p-6">
            <div className="pointer-events-auto flex max-w-sm flex-col items-center text-center">
                {/* Orbe estelar estático (respiración sutil si el usuario lo permite) */}
                <motion.div
                    aria-hidden
                    animate={reduced ? undefined : { scale: [1, 1.045, 1], opacity: [0.95, 1, 0.95] }}
                    transition={reduced ? undefined : { duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
                    className="relative mb-5 size-28"
                >
                    <span className="absolute inset-0 rounded-full opacity-90"
                        style={{ background: "radial-gradient(circle at 34% 30%, rgba(234,246,255,0.95), rgba(63,182,255,0.55) 38%, rgba(109,40,217,0.4) 68%, transparent 78%)" }} />
                    <span className="absolute -inset-4 rounded-full blur-2xl"
                        style={{ background: "radial-gradient(circle, rgba(0,127,255,0.35), rgba(124,58,237,0.18) 55%, transparent 75%)" }} />
                    <svg viewBox="0 0 24 24" className="absolute inset-0 m-auto size-12 opacity-95 drop-shadow-[0_0_10px_rgba(191,243,255,0.9)]">
                        <path
                            d="M12 1 C12.9 8 15.5 10.6 22.5 12 C15.5 13.4 12.9 16 12 23 C11.1 16 8.5 13.4 1.5 12 C8.5 10.6 11.1 8 12 1 Z"
                            fill="white"
                        />
                    </svg>
                </motion.div>

                <h2 className="text-lg font-black tracking-tight text-foreground">
                    «{desktop.name}» está en blanco
                </h2>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    Este es tu espacio. Coloca apps, widgets vivos, archivos y carpetas —
                    o deja que Aurora lo componga contigo.
                </p>

                <div className="mt-5 flex flex-col items-center gap-2">
                    <button
                        type="button"
                        onClick={askAurora}
                        className="group inline-flex items-center gap-2 rounded-full border border-violet-300/40 bg-gradient-to-r from-violet-500/25 to-sky-500/25 px-5 py-2.5 text-[12px] font-black text-violet-100 shadow-[0_0_24px_rgba(124,58,237,0.35)] transition-all hover:shadow-[0_0_32px_rgba(124,58,237,0.55)] hover:-translate-y-px cursor-pointer"
                    >
                        <Sparkles className="size-4 transition-transform group-hover:rotate-12" />
                        Pídele a Aurora que lo arme
                    </button>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={onAddApps}
                            className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.05] px-4 py-2 text-[11px] font-bold text-foreground/90 transition-colors hover:bg-white/[0.12] cursor-pointer"
                        >
                            <LayoutGrid className="size-3.5" /> Añadir apps
                        </button>
                        <button
                            type="button"
                            onClick={onAddWidgets}
                            className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.05] px-4 py-2 text-[11px] font-bold text-foreground/90 transition-colors hover:bg-white/[0.12] cursor-pointer"
                        >
                            <MonitorPlay className="size-3.5" /> Añadir widgets
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Menú contextual de icono ─────────────────────────────────────
interface CtxMenuState { x: number; y: number; icon: DesktopIcon; }

function IconContextMenu({
    ctx, desktopId, canvasRef, onClose, onOpen, onRename,
}: {
    ctx: CtxMenuState;
    desktopId: string;
    canvasRef: React.RefObject<HTMLDivElement | null>;
    onClose: () => void;
    onOpen: (icon: DesktopIcon) => void;
    onRename: (id: string) => void;
}): React.ReactElement {
    const rect = canvasRef.current?.getBoundingClientRect();
    const left = Math.min((rect ? ctx.x - rect.left : ctx.x), (rect?.width ?? 400) - 190);
    const top = Math.min((rect ? ctx.y - rect.top : ctx.y), (rect?.height ?? 400) - 230);
    const icon = ctx.icon;
    const canPreview = icon.kind === "widget" || (icon.kind === "file" && (icon.fileKind === "image" || icon.fileKind === "gif"));

    const Item = ({ onClick, danger, children }: { onClick: () => void; danger?: boolean; children: React.ReactNode }) => (
        <button
            type="button"
            onClick={() => { onClick(); onClose(); }}
            className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] font-semibold transition-colors cursor-pointer",
                danger ? "text-red-300 hover:bg-red-500/15" : "text-foreground/90 hover:bg-white/10",
            )}
        >
            {children}
        </button>
    );

    return (
        <div
            role="menu"
            style={{ left: Math.max(8, left), top: Math.max(TOPBAR_H + 4, top) }}
            className="absolute z-[60] w-[180px] rounded-2xl border border-white/12 bg-card/95 p-1.5 shadow-2xl backdrop-blur-2xl"
        >
            <Item onClick={() => onOpen(icon)}>
                <ExternalLink className="size-3.5" /> Abrir
            </Item>
            <Item onClick={() => onRename(icon.id)}>
                <Pencil className="size-3.5" /> Renombrar
            </Item>
            {canPreview && (
                <Item onClick={() => updateIcon(desktopId, icon.id, { viewMode: icon.viewMode === "preview" ? "icon" : "preview" })}>
                    <MonitorPlay className="size-3.5" />
                    {icon.viewMode === "preview" ? "Ver como icono" : "Vista previa viva"}
                </Item>
            )}
            <div className="my-1 flex items-center gap-1 px-2.5">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">Tamaño</span>
                <div className="ml-auto flex gap-1">
                    {(["sm", "md", "lg"] as const).map((s) => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => updateIcon(desktopId, icon.id, { size: s })}
                            className={cn(
                                "rounded-md border px-1.5 py-0.5 text-[10px] font-black uppercase transition-colors cursor-pointer",
                                icon.size === s
                                    ? "border-sky-300/60 bg-sky-400/20 text-sky-100"
                                    : "border-white/10 text-muted-foreground hover:bg-white/10",
                            )}
                        >
                            {s.toUpperCase()[0]}
                        </button>
                    ))}
                </div>
            </div>
            <div className="my-1 h-px bg-white/10" />
            <Item danger onClick={() => removeIcon(desktopId, icon.id)}>
                <Trash2 className="size-3.5" /> Quitar del escritorio
            </Item>
        </div>
    );
}

// ── Menú gestor de escritorios (barra superior) ──────────────────
function DesktopManagerMenu({
    desktops, active, snap, onClose, onOpenCursorPanel,
}: {
    desktops: Desktop[];
    active: Desktop;
    snap: boolean;
    onClose: () => void;
    onOpenCursorPanel: () => void;
}): React.ReactElement {
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [wallpaperDraft, setWallpaperDraft] = useState(active.wallpaper?.value ?? "");

    return (
        <div className="absolute left-2 top-[calc(100%+6px)] z-[55] w-[300px] max-w-[calc(100vw-16px)] rounded-2xl border border-white/12 bg-card/95 p-2 shadow-2xl backdrop-blur-2xl">
            <p className="px-2 pb-1 pt-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/70">
                Escritorios
            </p>
            <div className="max-h-44 space-y-0.5 overflow-y-auto">
                {desktops.map((d) => (
                    <div
                        key={d.id}
                        className={cn(
                            "group flex items-center gap-1.5 rounded-xl px-2 py-1.5 transition-colors",
                            d.id === active.id ? "bg-sky-400/15" : "hover:bg-white/[0.06]",
                        )}
                    >
                        {renamingId === d.id ? (
                            <input
                                autoFocus
                                defaultValue={d.name}
                                onFocus={(e) => e.currentTarget.select()}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") { renameDesktop(d.id, e.currentTarget.value); setRenamingId(null); }
                                    if (e.key === "Escape") setRenamingId(null);
                                }}
                                onBlur={(e) => { renameDesktop(d.id, e.currentTarget.value); setRenamingId(null); }}
                                className="h-6 min-w-0 flex-1 rounded-lg border border-sky-400/50 bg-black/60 px-2 text-[12px] font-semibold outline-none"
                            />
                        ) : (
                            <button
                                type="button"
                                onClick={() => setActiveDesktop(d.id)}
                                className="min-w-0 flex-1 truncate text-left text-[12px] font-bold text-foreground/90 cursor-pointer"
                            >
                                {d.name}
                            </button>
                        )}
                        {d.id === active.id && renamingId !== d.id && <Check className="size-3 shrink-0 text-sky-300" />}
                        <button
                            type="button"
                            title="Renombrar"
                            aria-label={`Renombrar ${d.name}`}
                            onClick={() => setRenamingId(d.id)}
                            className="grid size-6 shrink-0 place-items-center rounded-lg text-muted-foreground/70 opacity-0 transition-opacity hover:bg-white/10 hover:text-foreground group-hover:opacity-100 cursor-pointer"
                        >
                            <Pencil className="size-3" />
                        </button>
                        <button
                            type="button"
                            title={desktops.length <= 1 ? "Siempre queda al menos un escritorio" : "Eliminar"}
                            aria-label={`Eliminar ${d.name}`}
                            disabled={desktops.length <= 1}
                            onClick={() => deleteDesktop(d.id)}
                            className="grid size-6 shrink-0 place-items-center rounded-lg text-muted-foreground/70 opacity-0 transition-opacity hover:bg-red-500/15 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-20 group-hover:opacity-100 cursor-pointer"
                        >
                            <Trash2 className="size-3" />
                        </button>
                    </div>
                ))}
            </div>
            <button
                type="button"
                onClick={() => createDesktop()}
                className="mt-1 flex w-full items-center gap-2 rounded-xl border border-dashed border-white/15 px-2.5 py-1.5 text-[12px] font-bold text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground cursor-pointer"
            >
                <Plus className="size-3.5" /> Nuevo escritorio
            </button>

            <div className="my-2 h-px bg-white/10" />

            {/* Fondo del escritorio activo */}
            <p className="flex items-center gap-1.5 px-2 pb-1 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/70">
                <ImageIcon className="size-3" /> Fondo de «{active.name}»
            </p>
            <div className="space-y-1.5 px-1">
                <div className="flex gap-1.5">
                    <button
                        type="button"
                        onClick={() => setWallpaper(active.id, undefined)}
                        className={cn(
                            "flex-1 rounded-lg border px-2 py-1 text-[11px] font-bold transition-colors cursor-pointer",
                            active.wallpaper?.type !== "custom"
                                ? "border-sky-300/50 bg-sky-400/15 text-sky-100"
                                : "border-white/10 text-muted-foreground hover:bg-white/[0.06]",
                        )}
                    >
                        Fondo global
                    </button>
                    <button
                        type="button"
                        onClick={() => setWallpaper(active.id, { type: "custom", value: wallpaperDraft || undefined })}
                        className={cn(
                            "flex-1 rounded-lg border px-2 py-1 text-[11px] font-bold transition-colors cursor-pointer",
                            active.wallpaper?.type === "custom"
                                ? "border-sky-300/50 bg-sky-400/15 text-sky-100"
                                : "border-white/10 text-muted-foreground hover:bg-white/[0.06]",
                        )}
                    >
                        Propio
                    </button>
                </div>
                <input
                    value={wallpaperDraft}
                    onChange={(e) => setWallpaperDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") setWallpaper(active.id, { type: "custom", value: wallpaperDraft || undefined });
                    }}
                    placeholder="URL de imagen o gradiente CSS…"
                    spellCheck={false}
                    className="h-7 w-full rounded-lg border border-white/10 bg-black/40 px-2 text-[11px] font-medium outline-none transition-colors focus:border-sky-400/50"
                />
            </div>

            <div className="my-2 h-px bg-white/10" />

            {/* Rejilla magnética */}
            <button
                type="button"
                onClick={() => setSnap(!snap)}
                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-[12px] font-bold text-foreground/90 transition-colors hover:bg-white/[0.06] cursor-pointer"
            >
                <Magnet className="size-3.5" />
                Rejilla magnética
                <span
                    className={cn(
                        "ml-auto flex h-4.5 w-8 items-center rounded-full border px-0.5 transition-colors",
                        snap ? "justify-end border-emerald-300/50 bg-emerald-400/25" : "justify-start border-white/15 bg-white/[0.06]",
                    )}
                    style={{ height: 18, width: 32 }}
                >
                    <span className="size-3 rounded-full bg-white/90 shadow" style={{ width: 13, height: 13 }} />
                </span>
            </button>

            {/* Personalizar → Cursor y gestos */}
            <button
                type="button"
                onClick={() => { onOpenCursorPanel(); onClose(); }}
                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-[12px] font-bold text-foreground/90 transition-colors hover:bg-white/[0.06] cursor-pointer"
            >
                <MousePointer2 className="size-3.5" />
                Personalizar · Cursor y gestos
                <ChevronDown className="ml-auto size-3.5 -rotate-90 text-muted-foreground" />
            </button>
        </div>
    );
}

// ════════════════════════════════════════════════════════════════
// Lienzo principal
// ════════════════════════════════════════════════════════════════
export function DesktopCanvas(): React.ReactElement {
    const state = useDesktopsState();
    const isMobile = useMediaQuery("(max-width: 640px)");
    const reduced = useReducedMotion();
    const canvasRef = useRef<HTMLDivElement | null>(null);
    const iconAreaRef = useRef<HTMLDivElement | null>(null);

    const [mounted, setMounted] = useState(false);
    const [selection, setSelection] = useState<Set<string>>(new Set());
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null);
    const [managerOpen, setManagerOpen] = useState(false);
    const [cleanView, setCleanView] = useState(false);
    const [cursorPanelOpen, setCursorPanelOpen] = useState(false);
    const [addOpen, setAddOpen] = useState(false);
    const [addTab, setAddTab] = useState<AddPanelTab>("apps");
    const [addFolderTarget, setAddFolderTarget] = useState<string | null>(null);
    const swipeRef = useRef<{ x: number; y: number } | null>(null);

    // Espejo soberano en la cuenta (best-effort, patrón dashboards-sync).
    useDesktopsBackup();

    // Siembra del primer escritorio (solo cliente).
    useEffect(() => {
        setMounted(true);
        seedIfEmpty();
    }, []);

    const desktop = useMemo<Desktop | null>(
        () => state.desktops.find((d) => d.id === state.activeId) ?? state.desktops[0] ?? null,
        [state],
    );

    const openIcon = useOpenDesktopIcon(desktop?.id);

    const openAdd = useCallback((tab: AddPanelTab, folderId?: string | null) => {
        setAddTab(tab);
        setAddFolderTarget(folderId ?? null);
        setAddOpen(true);
    }, []);

    // Teclado: Supr elimina selección · Escape cierra paneles.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
            if (e.key === "Escape") {
                setCtxMenu(null);
                setManagerOpen(false);
                setSelection(new Set());
                return;
            }
            if (typing || !desktop) return;
            if ((e.key === "Delete" || e.key === "Backspace") && selection.size > 0) {
                selection.forEach((id) => removeIcon(desktop.id, id));
                setSelection(new Set());
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [desktop, selection]);

    const selectIcon = useCallback((id: string, additive: boolean) => {
        setCtxMenu(null);
        setSelection((prev) => {
            if (additive) {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
            }
            return prev.has(id) && prev.size === 1 ? prev : new Set([id]);
        });
    }, []);

    // Swipe en el fondo → cambia de escritorio (móvil/táctil).
    const onBackgroundPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.target !== e.currentTarget) return;
        setSelection(new Set());
        setCtxMenu(null);
        setManagerOpen(false);
        swipeRef.current = { x: e.clientX, y: e.clientY };
    };

    const onBackgroundPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        const s = swipeRef.current;
        swipeRef.current = null;
        if (!s || !desktop || state.desktops.length < 2) return;
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
        if (Math.abs(dx) < 72 || Math.abs(dy) > 60) return;
        const idx = state.desktops.findIndex((d) => d.id === desktop.id);
        const next = dx < 0 ? idx + 1 : idx - 1;
        const target = state.desktops[next];
        if (target) setActiveDesktop(target.id);
    };

    // ── Shell de carga (SSR / primer frame) ──
    if (!mounted || !desktop) {
        return (
            <div className="relative h-[100dvh] w-full overflow-hidden">
                <div className="absolute inset-x-0 top-0 h-11 border-b border-white/10 bg-black/25 backdrop-blur-xl" />
                <div className="grid h-full place-items-center">
                    <span className="text-xs font-semibold text-muted-foreground/70 animate-pulse">
                        Preparando tu escritorio…
                    </span>
                </div>
            </div>
        );
    }

    const wallpaper = desktop.wallpaper;
    const isCustomWallpaper = wallpaper?.type === "custom" && Boolean(wallpaper.value);
    const wallpaperIsImage = isCustomWallpaper && /^(https?:|data:|blob:|\/)/i.test(wallpaper!.value!);

    const visibleWindows = desktop.windows.filter((w) => !w.minimized);
    const minimizedWindows = desktop.windows.filter((w) => w.minimized);
    const topZ = visibleWindows.reduce((m, w) => Math.max(m, w.z), 0);
    const sortedIcons = [...desktop.icons].sort((a, b) => a.y - b.y || a.x - b.x);
    const desktopIndex = state.desktops.findIndex((d) => d.id === desktop.id);

    return (
        <div
            ref={canvasRef}
            className="relative h-[100dvh] w-full select-none overflow-hidden"
        >
            {/* ── Wallpaper propio del escritorio (overlay; el fondo global vive en el layout) ── */}
            <AnimatePresence>
                {isCustomWallpaper && (
                    <motion.div
                        key={`wp-${desktop.id}-${wallpaper!.value}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: reduced ? 0 : 0.5 }}
                        aria-hidden
                        className="absolute inset-0 z-0"
                    >
                        {wallpaperIsImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={wallpaper!.value} alt="" className="h-full w-full object-cover" draggable={false} />
                        ) : (
                            <div className="h-full w-full" style={{ background: wallpaper!.value }} />
                        )}
                        <span className="absolute inset-0 bg-black/25" />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Capa de iconos ── */}
            <motion.div
                key={`icons-${desktop.id}`}
                initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.985 }}
                animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1 }}
                transition={{ duration: 0.28, ease: "easeOut" }}
                className="absolute inset-0 z-[5]"
            >
                {isMobile ? (
                    /* Móvil: rejilla compacta 4-6 por fila */
                    <div
                        ref={iconAreaRef}
                        onPointerDown={onBackgroundPointerDown}
                        onPointerUp={onBackgroundPointerUp}
                        className="absolute inset-x-2 bottom-24 top-12 overflow-y-auto"
                    >
                        <div className="grid grid-cols-4 gap-y-3 pt-2 min-[420px]:grid-cols-5 min-[540px]:grid-cols-6">
                            {sortedIcons.map((icon) => (
                                <div
                                    key={icon.id}
                                    role="button"
                                    tabIndex={0}
                                    className="flex cursor-pointer justify-center outline-none"
                                    onPointerUp={(e) => {
                                        if (e.pointerType !== "touch") return;
                                        selectIcon(icon.id, false);
                                    }}
                                    onClick={() => selectIcon(icon.id, false)}
                                    onDoubleClick={() => openIcon(icon)}
                                    onKeyDown={(e) => { if (e.key === "Enter") openIcon(icon); }}
                                    onContextMenu={(e) => {
                                        e.preventDefault();
                                        selectIcon(icon.id, false);
                                        setCtxMenu({ x: e.clientX, y: e.clientY, icon });
                                    }}
                                >
                                    <MobileTapIcon icon={icon} selected={selection.has(icon.id)} onOpen={() => openIcon(icon)} />
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    /* Escritorio: posiciones libres + rejilla magnética opcional */
                    <div
                        ref={iconAreaRef}
                        onPointerDown={onBackgroundPointerDown}
                        onPointerUp={onBackgroundPointerUp}
                        className="absolute inset-x-3 bottom-24 top-12"
                    >
                        {desktop.icons.map((icon) => (
                            <PositionedIcon
                                key={icon.id}
                                desktopId={desktop.id}
                                icon={icon}
                                areaRef={iconAreaRef}
                                snap={state.snap}
                                selected={selection.has(icon.id)}
                                renaming={renamingId === icon.id}
                                onSelect={selectIcon}
                                onOpen={openIcon}
                                onContext={(x, y, i) => { selectIcon(i.id, false); setCtxMenu({ x, y, icon: i }); }}
                                onRenameCommit={(name) => {
                                    if (name.trim()) updateIcon(desktop.id, icon.id, { name: name.trim() });
                                    setRenamingId(null);
                                }}
                                onRenameCancel={() => setRenamingId(null)}
                            />
                        ))}
                    </div>
                )}

                {/* Estado vacío guiado por Aurora */}
                {desktop.icons.length === 0 && desktop.windows.length === 0 && (
                    <EmptyDesktopState
                        desktop={desktop}
                        onAddApps={() => openAdd("apps")}
                        onAddWidgets={() => openAdd("widgets")}
                    />
                )}
            </motion.div>

            {/* ── Capa de ventanas ── */}
            <div
                className={cn(
                    "absolute inset-0 z-[15] transition-all duration-300",
                    cleanView && "pointer-events-none scale-[0.98] opacity-0",
                )}
            >
                <AnimatePresence>
                    {visibleWindows.map((win) => {
                        const chrome = resolveWindowChrome(win.contentRef);
                        const hiddenOnMobile = isMobile && win.z !== topZ;
                        return (
                            <div key={win.id} className={cn(hiddenOnMobile && "hidden")}>
                                <DesktopWindowFrame
                                    desktopId={desktop.id}
                                    win={win}
                                    chrome={chrome}
                                    isTop={win.z === topZ}
                                    isMobile={isMobile}
                                    topInset={WINDOW_TOP_INSET}
                                    headerExtra={chrome.href ? (
                                        <button
                                            type="button"
                                            onClick={() => window.open(chrome.href, "_blank", "noopener,noreferrer")}
                                            title="Abrir en pestaña nueva"
                                            aria-label="Abrir en pestaña nueva"
                                            className="grid size-6 place-items-center rounded-full text-muted-foreground/70 transition-colors hover:bg-white/10 hover:text-foreground cursor-pointer"
                                        >
                                            <ExternalLink className="size-3" />
                                        </button>
                                    ) : undefined}
                                >
                                    <DesktopWindowContent
                                        desktopId={desktop.id}
                                        win={win}
                                        onRequestAddInto={(folderId) => openAdd("apps", folderId)}
                                    />
                                </DesktopWindowFrame>
                            </div>
                        );
                    })}
                </AnimatePresence>

                {/* Swap de ventanas en móvil */}
                {isMobile && visibleWindows.length > 1 && (
                    <div className="absolute inset-x-0 bottom-24 z-[45] flex justify-center">
                        <div className="flex max-w-[92%] gap-1 overflow-x-auto rounded-full border border-white/12 bg-black/55 p-1 backdrop-blur-xl">
                            {[...visibleWindows].sort((a, b) => a.z - b.z).map((w) => {
                                const c = resolveWindowChrome(w.contentRef);
                                return (
                                    <button
                                        key={w.id}
                                        type="button"
                                        onClick={() => focusWindow(desktop.id, w.id)}
                                        title={c.title}
                                        className={cn(
                                            "flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold transition-colors cursor-pointer",
                                            w.z === topZ ? "bg-white/15 text-foreground" : "text-muted-foreground hover:bg-white/[0.08]",
                                        )}
                                    >
                                        <span className="size-1.5 rounded-full" style={{ background: c.accent }} />
                                        <span className="max-w-[76px] truncate">{c.title}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* ── Barra superior fina (glass) ── */}
            <header
                className="absolute inset-x-0 top-0 z-[40] flex items-center gap-1.5 border-b border-white/10 bg-black/30 px-2 backdrop-blur-2xl"
                style={{ height: TOPBAR_H }}
            >
                <span aria-hidden className="pointer-events-none absolute inset-x-10 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan-300/40 to-transparent" />

                {/* Selector de escritorios */}
                <div className="relative flex min-w-0 items-center gap-1.5">
                    <button
                        type="button"
                        onClick={() => setManagerOpen((o) => !o)}
                        title="Gestionar escritorios"
                        className={cn(
                            "flex min-w-0 items-center gap-1.5 rounded-full border px-2.5 py-1 transition-colors cursor-pointer",
                            managerOpen
                                ? "border-cyan-300/50 bg-cyan-400/10"
                                : "border-white/12 bg-white/[0.04] hover:bg-white/[0.09]",
                        )}
                    >
                        <SquareStack className="size-3.5 shrink-0 text-cyan-200/90" />
                        <span className="max-w-[120px] truncate text-[11px] font-black tracking-tight sm:max-w-[180px]">
                            {desktop.name}
                        </span>
                        <ChevronDown className={cn("size-3 shrink-0 text-muted-foreground transition-transform", managerOpen && "rotate-180")} />
                    </button>

                    {/* Puntos deslizables */}
                    <div className="flex max-w-[30vw] items-center gap-1 overflow-x-auto px-0.5">
                        {state.desktops.map((d, i) => (
                            <button
                                key={d.id}
                                type="button"
                                onClick={() => setActiveDesktop(d.id)}
                                title={d.name}
                                aria-label={`Ir a ${d.name}`}
                                className={cn(
                                    "shrink-0 rounded-full transition-all duration-300 cursor-pointer",
                                    i === desktopIndex
                                        ? "h-1.5 w-5 bg-cyan-300 shadow-[0_0_8px_rgba(103,232,249,0.8)]"
                                        : "h-1.5 w-1.5 bg-white/30 hover:bg-white/60",
                                )}
                            />
                        ))}
                        <button
                            type="button"
                            onClick={() => createDesktop()}
                            title="Nuevo escritorio"
                            aria-label="Crear nuevo escritorio"
                            className="grid size-4 shrink-0 place-items-center rounded-full border border-white/20 text-white/50 transition-colors hover:border-cyan-300/60 hover:text-cyan-200 cursor-pointer"
                        >
                            <Plus className="size-2.5" />
                        </button>
                    </div>

                    {managerOpen && (
                        <DesktopManagerMenu
                            desktops={state.desktops}
                            active={desktop}
                            snap={state.snap}
                            onClose={() => setManagerOpen(false)}
                            onOpenCursorPanel={() => setCursorPanelOpen(true)}
                        />
                    )}
                </div>

                <div className="flex-1" />

                {/* Ventanas minimizadas */}
                {minimizedWindows.length > 0 && (
                    <div className="flex max-w-[34vw] items-center gap-1 overflow-x-auto">
                        {minimizedWindows.slice(0, 5).map((w) => {
                            const c = resolveWindowChrome(w.contentRef);
                            return (
                                <button
                                    key={w.id}
                                    type="button"
                                    onClick={() => setWindowMinimized(desktop.id, w.id, false)}
                                    title={`Restaurar ${c.title}`}
                                    className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.05] px-2 py-1 text-[10px] font-bold text-muted-foreground transition-colors hover:bg-white/[0.12] hover:text-foreground cursor-pointer"
                                >
                                    <span className="size-1.5 rounded-full" style={{ background: c.accent }} />
                                    <span className="max-w-[70px] truncate max-sm:hidden">{c.title}</span>
                                </button>
                            );
                        })}
                        {minimizedWindows.length > 5 && (
                            <span className="text-[10px] font-bold text-muted-foreground">+{minimizedWindows.length - 5}</span>
                        )}
                    </div>
                )}

                {/* + Añadir */}
                <button
                    type="button"
                    onClick={() => openAdd("apps")}
                    className="flex items-center gap-1.5 rounded-full border border-cyan-300/40 bg-cyan-400/15 px-3 py-1.5 text-[11px] font-black text-cyan-100 shadow-[0_0_14px_rgba(34,211,238,0.25)] transition-all hover:bg-cyan-400/25 hover:shadow-[0_0_20px_rgba(34,211,238,0.4)] cursor-pointer"
                >
                    <Plus className="size-3.5" />
                    <span className="max-sm:hidden">Añadir</span>
                </button>

                {/* Vista limpia */}
                <button
                    type="button"
                    onClick={() => setCleanView((v) => !v)}
                    title={cleanView ? "Mostrar ventanas" : "Vista limpia (ocultar ventanas)"}
                    aria-label={cleanView ? "Mostrar ventanas" : "Ocultar ventanas"}
                    className={cn(
                        "grid size-7 place-items-center rounded-full border transition-colors cursor-pointer",
                        cleanView
                            ? "border-amber-300/50 bg-amber-300/15 text-amber-200"
                            : "border-white/12 bg-white/[0.04] text-muted-foreground hover:bg-white/[0.09] hover:text-foreground",
                    )}
                >
                    {cleanView ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>

                <DesktopClock />
            </header>

            {/* ── Menú contextual de icono ── */}
            {ctxMenu && (
                <>
                    <div className="absolute inset-0 z-[58]" onPointerDown={() => setCtxMenu(null)} aria-hidden />
                    <IconContextMenu
                        ctx={ctxMenu}
                        desktopId={desktop.id}
                        canvasRef={canvasRef}
                        onClose={() => setCtxMenu(null)}
                        onOpen={openIcon}
                        onRename={(id) => setRenamingId(id)}
                    />
                </>
            )}

            {/* ── Panel "+ Añadir" ── */}
            <DesktopAddPanel
                desktop={desktop}
                open={addOpen}
                initialTab={addTab}
                targetFolderId={addFolderTarget}
                onClose={() => { setAddOpen(false); setAddFolderTarget(null); }}
            />

            {/* ── Hoja: Personalizar cursor y gestos ── */}
            <AnimatePresence>
                {cursorPanelOpen && (
                    <>
                        <motion.div
                            key="cursor-backdrop"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.18 }}
                            onClick={() => setCursorPanelOpen(false)}
                            className="absolute inset-0 z-[50] bg-black/35 backdrop-blur-[2px]"
                            aria-hidden
                        />
                        <motion.div
                            key="cursor-sheet"
                            role="dialog"
                            aria-label="Cursor y gestos"
                            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.97 }}
                            animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.97 }}
                            transition={reduced ? { duration: 0.15 } : { type: "spring", stiffness: 320, damping: 30 }}
                            className="absolute left-1/2 top-1/2 z-[52] w-[400px] max-w-[calc(100vw-24px)] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-white/12 bg-card/95 p-4 shadow-2xl backdrop-blur-2xl"
                        >
                            <span aria-hidden className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-violet-300/70 to-transparent" />
                            <header className="mb-3 flex items-center gap-2">
                                <MousePointer2 className="size-4 text-violet-300" />
                                <h3 className="flex-1 text-sm font-black tracking-tight">Cursor y gestos</h3>
                                <button
                                    type="button"
                                    onClick={() => setCursorPanelOpen(false)}
                                    title="Cerrar"
                                    aria-label="Cerrar panel de cursor"
                                    className="grid size-7 place-items-center rounded-full text-muted-foreground/70 transition-colors hover:bg-white/10 hover:text-foreground cursor-pointer"
                                >
                                    <X className="size-3.5" />
                                </button>
                            </header>
                            <div className="max-h-[62vh] overflow-y-auto pr-1">
                                <CursorSettingsPanel />
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}

// ── Icono móvil (tap simple selecciona, doble tap abre) ──────────
function MobileTapIcon({ icon, selected, onOpen }: {
    icon: DesktopIcon;
    selected: boolean;
    onOpen: () => void;
}): React.ReactElement {
    const lastTapRef = useRef(0);
    return (
        <div
            onPointerUp={(e) => {
                if (e.pointerType !== "touch") return;
                const now = Date.now();
                if (now - lastTapRef.current < 350) {
                    lastTapRef.current = 0;
                    onOpen();
                } else {
                    lastTapRef.current = now;
                }
            }}
        >
            <DesktopIconTile icon={icon} selected={selected} compact />
        </div>
    );
}
