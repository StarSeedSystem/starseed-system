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
    Plus, Eye, EyeOff, ChevronDown, Pencil, Trash2, Check,
    MousePointer2, ExternalLink, X, Magnet, ImageIcon,
    SquareStack, Settings2, LayoutGrid, Share2, Columns2, Rows2, Grid2x2, Frame,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
    type Desktop, type DesktopIcon, type DesktopIconSize, type DesktopTheme,
    type DesktopWindowRect, type TileMode,
    useDesktopsState, useDesktopsBackup,
    seedIfEmpty, createDesktop, renameDesktop, deleteDesktop, setActiveDesktop,
    setWallpaper, setSnap, moveIcon, removeIcon, updateIcon,
    setWindowMinimized, closeWindow, focusWindow, toggleWindowMaximized,
    toggleWindowFullscreen, tileWindows, clearTiling, tiledRects,
    DEFAULT_DESKTOP_VIEW, DESKTOP_TOP_INSET,
    // Páginas del escritorio (H-3)
    MAX_DESKTOP_PAGES, desktopPageCount, desktopActivePage, iconsOfPage,
    setDesktopPage, addDesktopPage, moveIconToPage,
} from "./desktop-store";
import { useDesktopClipboard, copyIcon, cutIcon, pasteClipboard } from "./desktop-clipboard";
// Adenda 98: menú de conexiones (red externa + malla P2P) en la barra superior.
import { ConnectionsMenu } from "@/components/connectivity/connections-menu";
import { DesktopTileDividers } from "./desktop-tiles";
import { DesktopQuickLook, type QuickLookTab } from "./desktop-quick-look";
import { DesktopIconTile, ICON_CELL } from "./desktop-icon";
import { useOpenDesktopIcon, useEditDesktopIcon } from "./desktop-open";
import { DesktopWindowFrame } from "./desktop-window";
import { DesktopWindowContent, resolveWindowChrome } from "./desktop-window-content";
import { DesktopAddPanel, type AddPanelTab } from "./desktop-add-panel";
import { CursorSettingsPanel } from "./cursor-fx";
import { EmptyDesktopState } from "./desktop-empty";
import { CanvasContextMenu, IconContextMenu } from "./desktop-context-menu";
import { DesktopTaskbar } from "./desktop-taskbar";
import { DesktopSettingsPanel } from "./desktop-settings-panel";
import { DesktopExpose } from "./desktop-expose";
import { DesktopSnapPreview } from "./desktop-snap-preview";
import type { SnapZone } from "./desktop-window-snap";
// Escritorios anclados a PERFIL (Adenda 65 · SOP §10): espejo bidireccional
// en entity_state(profile:<id>,'desktops'), coexiste con useDesktopsBackup().
import { useProfileDesktopsSync } from "@/lib/sync/profile-desktops";
// Escritorio COMPARTIDO (SOP §11): si se abre con ?space=<id>, este hook
// posee la clave local mientras esté montado (useProfileDesktopsSync cede).
import { useSharedDesktopSpace } from "@/lib/sync/shared-desktop-space";

const TOPBAR_H = 44;
// Debe coincidir con DESKTOP_TOP_INSET del store (que es quien CLAMPA la
// posición de las ventanas para que nunca queden bajo la barra superior, B-1).
const WINDOW_TOP_INSET = DESKTOP_TOP_INSET;

// ── Tinte del escritorio por tema (acento del lienzo/rejilla) ────
const THEME_ACCENT: Record<DesktopTheme, string> = {
    auto: "#22D3EE",
    azure: "#007FFF",
    emerald: "#10B981",
    amber: "#FFBF00",
    crimson: "#DC143C",
    violet: "#7C3AED",
};

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
/** Banda (px) junto a los bordes que, al arrastrar un icono, cambia de página. */
const EDGE_BAND_PX = 56;
/** Tiempo que hay que sostener el icono en el borde para saltar de página. */
const EDGE_DWELL_MS = 650;

function PositionedIcon({
    desktopId, icon, areaRef, snap, selected, renaming, sizeOverride, cut,
    onSelect, onOpen, onContext, onRenameCommit, onRenameCancel, onEdgeDwell,
}: {
    desktopId: string;
    icon: DesktopIcon;
    areaRef: React.RefObject<HTMLDivElement | null>;
    snap: boolean;
    selected: boolean;
    renaming: boolean;
    /** Tamaño efectivo del escritorio (sobrescribe icon.size en el render). */
    sizeOverride?: DesktopIconSize;
    /** Marcado para CORTAR (se pinta atenuado hasta que se pega). */
    cut?: boolean;
    onSelect: (id: string, additive: boolean) => void;
    onOpen: (icon: DesktopIcon) => void;
    onContext: (x: number, y: number, icon: DesktopIcon) => void;
    onRenameCommit: (name: string) => void;
    onRenameCancel: () => void;
    /**
     * Arrastrar hasta el borde y SOSTENER cambia de página (H-3, como iOS).
     * Devuelve `true` si el salto se produjo (el icono ya vive en la otra página).
     */
    onEdgeDwell?: (iconId: string, dir: -1 | 1) => boolean;
}): React.ReactElement {
    const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
    const [edge, setEdge] = useState<-1 | 1 | null>(null);
    const gesture = useRef<{
        startX: number; startY: number; origX: number; origY: number;
        rect: DOMRect; dragging: boolean; pointerId: number;
    } | null>(null);
    const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const edgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const edgeDirRef = useRef<-1 | 1 | null>(null);

    const clearPress = () => {
        if (pressTimer.current) {
            clearTimeout(pressTimer.current);
            pressTimer.current = null;
        }
    };
    const clearEdge = () => {
        if (edgeTimer.current) {
            clearTimeout(edgeTimer.current);
            edgeTimer.current = null;
        }
        edgeDirRef.current = null;
        setEdge(null);
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
                    // Consumimos el gesto: al soltar NO se abre (era una pulsación larga).
                    gesture.current = null;
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

        // ── Borde vivo (H-3): sostener en el borde salta de página ──
        if (!onEdgeDwell) return;
        const localX = e.clientX - g.rect.left;
        const dir: -1 | 1 | null =
            localX < EDGE_BAND_PX ? -1
                : localX > g.rect.width - EDGE_BAND_PX ? 1
                    : null;
        if (dir === edgeDirRef.current) return;
        clearEdge();
        if (dir === null) return;
        edgeDirRef.current = dir;
        setEdge(dir);
        edgeTimer.current = setTimeout(() => {
            const jumped = onEdgeDwell(icon.id, dir);
            if (jumped) {
                // El icono ya está en la otra página: el arrastre termina aquí.
                gesture.current = null;
                setDragPos(null);
            }
            clearEdge();
        }, EDGE_DWELL_MS);
    };

    const finishGesture = (e: React.PointerEvent<HTMLDivElement>) => {
        const g = gesture.current;
        clearPress();
        clearEdge();
        if (!g || g.pointerId !== e.pointerId) { setDragPos(null); return; }
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
        // TÁCTIL: UN toque abre (convención de iOS/Android; el escritorio con
        // ratón conserva el doble clic de toda la vida). Antes hacía falta un
        // doble tap y casi nadie lo descubría.
        if (e.pointerType === "touch") onOpen(icon);
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
                // `pointer-events-auto`: la capa de página es pointer-events-none
                // (para no robarle el fondo al lienzo); el icono los reactiva.
                "pointer-events-auto absolute touch-none cursor-pointer outline-none",
                dragging ? "z-30 scale-[1.04] opacity-90 transition-none" : "z-10 transition-[left,top] duration-200 ease-out",
                cut && "opacity-45",
                edge && "ring-2 ring-cyan-300/60 rounded-2xl",
            )}
        >
            <DesktopIconTile
                icon={sizeOverride ? { ...icon, size: sizeOverride } : icon}
                selected={selected}
                renaming={renaming}
                onRenameCommit={onRenameCommit}
                onRenameCancel={onRenameCancel}
                desktopId={desktopId}
            />
        </div>
    );
}

// ── Indicador de páginas (puntos, estilo iOS/Android) ─────────────
function PageDots({
    count, active, accent, onSelect, onAdd,
}: {
    count: number;
    active: number;
    accent: string;
    onSelect: (p: number) => void;
    onAdd: () => void;
}): React.ReactElement {
    return (
        <div className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-white/12 bg-black/45 px-2.5 py-1.5 backdrop-blur-xl">
            {Array.from({ length: count }, (_, p) => (
                <button
                    key={p}
                    type="button"
                    onClick={() => onSelect(p)}
                    title={`Pantalla ${p + 1}`}
                    aria-label={`Ir a la pantalla ${p + 1}`}
                    aria-current={p === active}
                    className="grid size-4 place-items-center cursor-pointer"
                >
                    <span
                        className={cn(
                            "block rounded-full transition-all duration-200",
                            p === active ? "size-2" : "size-1.5 bg-white/35 hover:bg-white/60",
                        )}
                        style={p === active ? { background: accent, boxShadow: `0 0 8px ${accent}` } : undefined}
                    />
                </button>
            ))}
            {count < MAX_DESKTOP_PAGES && (
                <button
                    type="button"
                    onClick={onAdd}
                    title="Nueva pantalla"
                    aria-label="Añadir una pantalla al escritorio"
                    className="ml-0.5 grid size-4 place-items-center rounded-full text-white/45 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
                >
                    <Plus className="size-3" />
                </button>
            )}
        </div>
    );
}

// ── Rejilla del escritorio (patrón sutil, conmutable) ────────────
function DesktopGrid({ accent }: { accent: string }): React.ReactElement {
    return (
        <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-[4] opacity-[0.5]"
            style={{
                backgroundImage: `linear-gradient(color-mix(in srgb, ${accent} 22%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, ${accent} 22%, transparent) 1px, transparent 1px)`,
                backgroundSize: `${ICON_CELL.w}px ${ICON_CELL.h}px`,
                backgroundPosition: "12px 12px",
                maskImage: "radial-gradient(ellipse 80% 70% at 50% 45%, black, transparent 92%)",
                WebkitMaskImage: "radial-gradient(ellipse 80% 70% at 50% 45%, black, transparent 92%)",
            }}
        />
    );
}

// ── Marco de selección (marquee) ─────────────────────────────────
function SelectionBox({ box }: { box: { x: number; y: number; w: number; h: number } }): React.ReactElement {
    return (
        <div
            aria-hidden
            className="pointer-events-none absolute z-[9] rounded-lg border border-cyan-300/70 bg-cyan-400/10"
            style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
        />
    );
}

// ── Estado del menú contextual (icono o lienzo) ──────────────────
interface CtxMenuState {
    x: number;
    y: number;
    icon: DesktopIcon | null;
    /** Punto del lienzo (fracción 0..1) donde se pulsó → destino de «Pegar». */
    spot?: { x: number; y: number };
}

// ── Menú gestor de escritorios (barra superior) ──────────────────
function DesktopManagerMenu({
    desktops, active, snap, onClose, onOpenCursorPanel, onOpenSettings,
}: {
    desktops: Desktop[];
    active: Desktop;
    snap: boolean;
    onClose: () => void;
    onOpenCursorPanel: () => void;
    onOpenSettings: () => void;
}): React.ReactElement {
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [wallpaperDraft, setWallpaperDraft] = useState(active.wallpaper?.value ?? "");

    return (
        <div className="ss-crystal absolute left-2 top-[calc(100%+6px)] z-[55] w-[300px] max-w-[calc(100vw-16px)] rounded-2xl border border-white/12 bg-card/95 p-2 shadow-2xl backdrop-blur-2xl">
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

            {/* Ajustes completos del escritorio */}
            <button
                type="button"
                onClick={() => { onOpenSettings(); onClose(); }}
                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-[12px] font-bold text-foreground/90 transition-colors hover:bg-white/[0.06] cursor-pointer"
            >
                <Settings2 className="size-3.5" />
                Ajustes del escritorio…
                <ChevronDown className="ml-auto size-3.5 -rotate-90 text-muted-foreground" />
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
export function DesktopCanvas({ spaceId = null }: { spaceId?: string | null } = {}): React.ReactElement {
    // Modo espacio compartido (debe montarse ANTES que useProfileDesktopsSync
    // para que su guard hasOpenSpace() vea el espacio ya abierto en el mismo ciclo).
    const sharedSpace = useSharedDesktopSpace(spaceId);
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
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [addOpen, setAddOpen] = useState(false);
    const [addTab, setAddTab] = useState<AddPanelTab>("apps");
    const [addFolderTarget, setAddFolderTarget] = useState<string | null>(null);
    const [exposeOpen, setExposeOpen] = useState(false);
    const [snapZone, setSnapZone] = useState<SnapZone | null>(null);
    // Vista previa / Información / Compartir de un icono (B-2, Quick Look de macOS).
    const [quickLook, setQuickLook] = useState<{ icon: DesktopIcon; tab: QuickLookTab; share?: boolean } | null>(null);
    // Viewport en vivo: el MOSAICO (B-3) calcula sus rects en píxeles a partir
    // de él, así que hay que re-renderizar al redimensionar la ventana.
    const [viewport, setViewport] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
    const swipeRef = useRef<{ x: number; y: number } | null>(null);
    // Marquee de selección (marco arrastrando sobre el fondo).
    const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
    const marqueeRef = useRef<{ startX: number; startY: number; areaRect: DOMRect; moved: boolean; additive: boolean } | null>(null);

    // Espejo soberano en la cuenta (best-effort, patrón dashboards-sync).
    useDesktopsBackup();

    // Escritorios anclados al perfil activo (SOP §10): ancla, migra el doc
    // local existente al perfil por defecto, y sincroniza en tiempo real.
    useProfileDesktopsSync();

    // Siembra del primer escritorio (solo cliente).
    useEffect(() => {
        setMounted(true);
        seedIfEmpty();
    }, []);

    // Viewport en vivo (para el mosaico).
    useEffect(() => {
        const measure = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
        measure();
        window.addEventListener("resize", measure);
        window.addEventListener("orientationchange", measure);
        return () => {
            window.removeEventListener("resize", measure);
            window.removeEventListener("orientationchange", measure);
        };
    }, []);

    const desktop = useMemo<Desktop | null>(
        () => state.desktops.find((d) => d.id === state.activeId) ?? state.desktops[0] ?? null,
        [state],
    );

    const openIcon = useOpenDesktopIcon(desktop?.id);
    const editIcon = useEditDesktopIcon(desktop?.id);
    const clipboard = useDesktopClipboard();

    // ── Páginas del escritorio (H-3) ──
    // Retrocompatible por construcción: sin `pageCount` ⇒ 1 página, y todos los
    // iconos (que no tienen `page`) viven en la 0 ⇒ se ve exactamente lo de antes.
    const pageCount = desktop ? desktopPageCount(desktop) : 1;
    const page = desktop ? desktopActivePage(desktop) : 0;

    // Preferencias de vista/diseño efectivas del escritorio activo.
    const view = useMemo(() => ({ ...DEFAULT_DESKTOP_VIEW, ...(desktop?.view ?? {}) }), [desktop?.view]);
    const themeAccent = THEME_ACCENT[view.theme] ?? THEME_ACCENT.auto;

    const openAdd = useCallback((tab: AddPanelTab, folderId?: string | null) => {
        setAddTab(tab);
        setAddFolderTarget(folderId ?? null);
        setAddOpen(true);
    }, []);

    /** Cambia de página; si ya no hay más, salta al escritorio contiguo. */
    const goToPage = useCallback((dir: -1 | 1) => {
        if (!desktop) return;
        const n = desktopPageCount(desktop);
        const cur = desktopActivePage(desktop);
        const next = cur + dir;
        if (next >= 0 && next < n) {
            setDesktopPage(desktop.id, next);
            return;
        }
        // Bordes: continúa al escritorio anterior/siguiente (si existe).
        const idx = state.desktops.findIndex((d) => d.id === desktop.id);
        const target = state.desktops[idx + dir];
        if (target) setActiveDesktop(target.id);
    }, [desktop, state.desktops]);

    /** Arrastrar un icono al borde y sostener → salta de página (H-3). */
    const onIconEdgeDwell = useCallback((iconId: string, dir: -1 | 1): boolean => {
        if (!desktop) return false;
        const n = desktopPageCount(desktop);
        const cur = desktopActivePage(desktop);
        const next = cur + dir;
        if (next < 0 || next >= n) return false;
        moveIconToPage(desktop.id, iconId, next);
        setDesktopPage(desktop.id, next);
        return true;
    }, [desktop]);

    // Menú contextual del LIENZO (clic derecho sobre el fondo). Guarda el PUNTO
    // exacto (en fracciones del lienzo) para que «Pegar» deje el icono ahí.
    const onBackgroundContext = useCallback((e: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>) => {
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        setSelection(new Set());
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const spot = rect.width > 0 && rect.height > 0
            ? {
                x: Math.min(0.94, Math.max(0, (e.clientX - rect.left) / rect.width)),
                y: Math.min(0.9, Math.max(0, (e.clientY - rect.top) / rect.height)),
            }
            : undefined;
        setCtxMenu({ x: e.clientX, y: e.clientY, icon: null, spot });
    }, []);

    // Teclado: Supr elimina selección · Escape cierra paneles/Exposé ·
    // Ctrl/Cmd+`` alterna Exposé · Ctrl/Cmd+N nuevo escritorio ·
    // Ctrl/Cmd+Alt+←/→ cambia de escritorio · Ctrl/Cmd+W cierra la
    // ventana enfocada · Ctrl/Cmd+M la minimiza · F11 maximiza/restaura.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
            if (e.key === "Escape") {
                if (quickLook) { setQuickLook(null); return; }
                if (exposeOpen) { setExposeOpen(false); return; }
                // Esc sale de pantalla completa (convención universal).
                const fs = desktop?.windows.find((w) => w.fullscreen);
                if (fs && desktop) { toggleWindowFullscreen(desktop.id, fs.id); return; }
                setCtxMenu(null);
                setManagerOpen(false);
                setSelection(new Set());
                return;
            }
            if (typing || !desktop) return;
            const meta = e.metaKey || e.ctrlKey;
            // Barra espaciadora → Vista previa del icono seleccionado (Quick Look).
            if (e.key === " " && !meta && selection.size === 1 && !quickLook) {
                const only = [...selection][0];
                const icon = desktop.icons.find((i) => i.id === only);
                if (icon) {
                    e.preventDefault();
                    setQuickLook({ icon, tab: "preview" });
                    return;
                }
            }
            // ── Portapapeles del escritorio (H-2): ⌘C · ⌘X · ⌘V ──
            if (meta && !e.altKey && (e.key === "c" || e.key === "C") && selection.size === 1) {
                const only = [...selection][0];
                if (desktop.icons.some((i) => i.id === only)) {
                    e.preventDefault();
                    copyIcon(desktop.id, only);
                    return;
                }
            }
            if (meta && !e.altKey && (e.key === "x" || e.key === "X") && selection.size === 1) {
                const only = [...selection][0];
                if (desktop.icons.some((i) => i.id === only)) {
                    e.preventDefault();
                    cutIcon(desktop.id, only);
                    return;
                }
            }
            if (meta && !e.altKey && (e.key === "v" || e.key === "V")) {
                e.preventDefault();
                pasteClipboard(desktop.id, null);
                return;
            }
            // Páginas del escritorio (H-3): ←/→ sin modificadores.
            if (!meta && !e.altKey && (e.key === "ArrowRight" || e.key === "ArrowLeft") && selection.size === 0) {
                e.preventDefault();
                goToPage(e.key === "ArrowRight" ? 1 : -1);
                return;
            }
            // Ctrl/Cmd+Alt+T → organizar en mosaico · Ctrl/Cmd+Alt+F → libre.
            if (meta && e.altKey && (e.key === "t" || e.key === "T")) {
                e.preventDefault();
                tileWindows(desktop.id, "grid");
                return;
            }
            if (meta && e.altKey && (e.key === "f" || e.key === "F")) {
                e.preventDefault();
                clearTiling(desktop.id);
                return;
            }
            if ((e.key === "Delete" || e.key === "Backspace") && selection.size > 0) {
                selection.forEach((id) => removeIcon(desktop.id, id));
                setSelection(new Set());
                return;
            }
            // Exposé: F3 (estilo macOS) o Ctrl/Cmd+`
            if (e.key === "F3" || (meta && e.key === "`")) {
                e.preventDefault();
                setExposeOpen((v) => !v);
                return;
            }
            if (meta && !e.altKey && (e.key === "n" || e.key === "N")) {
                e.preventDefault();
                createDesktop();
                return;
            }
            if (meta && e.altKey && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
                e.preventDefault();
                const idx = state.desktops.findIndex((d) => d.id === desktop.id);
                const next = e.key === "ArrowRight" ? idx + 1 : idx - 1;
                const target2 = state.desktops[next];
                if (target2) setActiveDesktop(target2.id);
                return;
            }
            const focused = desktop.windows.filter((w) => !w.minimized).reduce<typeof desktop.windows[number] | null>(
                (top, w) => (!top || w.z > top.z ? w : top), null,
            );
            if (meta && (e.key === "w" || e.key === "W") && focused) {
                e.preventDefault();
                closeWindow(desktop.id, focused.id);
                return;
            }
            if (meta && (e.key === "m" || e.key === "M") && focused) {
                e.preventDefault();
                setWindowMinimized(desktop.id, focused.id, true);
                return;
            }
            if (e.key === "F11" && focused) {
                e.preventDefault();
                toggleWindowFullscreen(desktop.id, focused.id);
                return;
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [desktop, selection, exposeOpen, quickLook, state.desktops, goToPage]);

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

    // Fondo: swipe (táctil → cambia de escritorio) + marquee (ratón → selección).
    const onBackgroundPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.target !== e.currentTarget) return;
        setCtxMenu(null);
        setManagerOpen(false);
        const additive = e.shiftKey || e.metaKey || e.ctrlKey;
        if (!additive) setSelection(new Set());
        swipeRef.current = { x: e.clientX, y: e.clientY };
        // Marquee solo con ratón en escritorio (el táctil se reserva al swipe).
        if (!isMobile && e.pointerType === "mouse" && e.button === 0) {
            const area = e.currentTarget.getBoundingClientRect();
            marqueeRef.current = { startX: e.clientX, startY: e.clientY, areaRect: area, moved: false, additive };
            try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }
        }
    };

    const onBackgroundPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const m = marqueeRef.current;
        if (!m || !desktop) return;
        const dx = e.clientX - m.startX;
        const dy = e.clientY - m.startY;
        if (!m.moved && Math.hypot(dx, dy) < 6) return;
        m.moved = true;
        const rect = m.areaRect;
        const x = Math.min(m.startX, e.clientX) - rect.left;
        const y = Math.min(m.startY, e.clientY) - rect.top;
        const w = Math.abs(dx);
        const h = Math.abs(dy);
        setMarquee({ x, y, w, h });
        // Selecciona los iconos cuyo ancla cae dentro del marco.
        const inBox = new Set<string>(m.additive ? Array.from(selection) : []);
        desktop.icons.forEach((icon) => {
            const ix = icon.x * rect.width;
            const iy = icon.y * rect.height;
            if (ix >= x && ix <= x + w && iy >= y && iy <= y + h) inBox.add(icon.id);
        });
        setSelection(inBox);
    };

    /**
     * Fin del gesto de fondo. Deslizar LATERALMENTE cambia de PÁGINA (H-3) y,
     * al agotarse las páginas, salta al escritorio contiguo (como iOS).
     *
     * Criterio con RATÓN (documentado a propósito): el arrastre sobre el fondo
     * sigue siendo el MARCO DE SELECCIÓN de siempre, salvo que sea claramente un
     * barrido horizontal (|dx| > 110 px y |dx| > 3·|dy|). Un marco de selección
     * de menos de ~37 px de alto no selecciona nada útil (una celda de iconos
     * mide 124 px), así que el gesto no le roba nada al marquee.
     */
    const onBackgroundPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        const m = marqueeRef.current;
        marqueeRef.current = null;
        setMarquee(null);
        const s = swipeRef.current;
        swipeRef.current = null;
        if (!s || !desktop) return;
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
        const horizontal = Math.abs(dx) > 3 * Math.abs(dy);

        if (e.pointerType === "touch") {
            if (Math.abs(dx) < 72 || Math.abs(dy) > 60) return;
            goToPage(dx < 0 ? 1 : -1);
            return;
        }
        // Ratón: barrido horizontal inequívoco → página; si no, era un marquee.
        if (m?.moved && !(horizontal && Math.abs(dx) > 110)) return;
        if (!horizontal || Math.abs(dx) < 110) return;
        setSelection(new Set());
        goToPage(dx < 0 ? 1 : -1);
    };

    // Rueda HORIZONTAL (trackpad de dos dedos / rueda lateral) → cambia de página.
    const wheelLockRef = useRef(0);
    const onBackgroundWheel = (e: React.WheelEvent<HTMLDivElement>) => {
        if (!desktop) return;
        const { deltaX, deltaY } = e;
        if (Math.abs(deltaX) < 24 || Math.abs(deltaX) < Math.abs(deltaY)) return;
        const now = Date.now();
        if (now - wheelLockRef.current < 420) return; // una página por gesto
        wheelLockRef.current = now;
        goToPage(deltaX > 0 ? 1 : -1);
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

    const allVisible = desktop.windows.filter((w) => !w.minimized);
    // La ventana en PANTALLA COMPLETA sale de la capa del lienzo (z-[15]) y se
    // pinta en su propia capa por ENCIMA de la barra superior y del dock (B-3).
    const fullscreenWin = allVisible.find((w) => w.fullscreen) ?? null;
    const visibleWindows = allVisible.filter((w) => !w.fullscreen);
    const minimizedWindows = desktop.windows.filter((w) => w.minimized);
    const topZ = allVisible.reduce((m, w) => Math.max(m, w.z), 0);
    // Solo los iconos de la PÁGINA visible (H-3). En un escritorio de una sola
    // página esto es, literalmente, todos los iconos: cero cambio de conducta.
    const pageIcons = iconsOfPage(desktop, page);
    const sortedIcons = [...pageIcons].sort((a, b) => a.y - b.y || a.x - b.x);
    const desktopIndex = state.desktops.findIndex((d) => d.id === desktop.id);
    /** Icono marcado para CORTAR (se pinta atenuado hasta pegarlo). */
    const cutId = clipboard?.mode === "cut" ? clipboard.node.id : null;

    // ── Mosaico (B-3): rects derivados del layout + viewport ──
    const tiling = desktop.tiling ?? null;
    const tileGap = 6;
    const tileArea: DesktopWindowRect = {
        x: tileGap,
        y: WINDOW_TOP_INSET + tileGap,
        w: Math.max(0, viewport.w - tileGap * 2),
        h: Math.max(0, viewport.h - WINDOW_TOP_INSET - tileGap * 2),
    };
    const tileRects =
        tiling && viewport.w > 0 && !isMobile
            ? tiledRects(tiling, viewport.w, viewport.h, WINDOW_TOP_INSET, tileGap)
            : {};
    const tilingActive = Boolean(tiling) && viewport.w > 0 && !isMobile;

    const doTile = (mode: TileMode) => tileWindows(desktop.id, mode);

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
                        onContextMenu={onBackgroundContext}
                        onWheel={onBackgroundWheel}
                        className="absolute inset-x-2 bottom-24 top-12 overflow-y-auto"
                    >
                        {/* pointer-events-none en la rejilla: así el SWIPE de páginas
                            (H-3) funciona también deslizando SOBRE la zona de iconos,
                            no solo por debajo. Los iconos los reactivan. */}
                        <motion.div
                            key={`page-${desktop.id}-${page}`}
                            initial={reduced ? { opacity: 0 } : { opacity: 0, x: 28 }}
                            animate={reduced ? { opacity: 1 } : { opacity: 1, x: 0 }}
                            transition={{ duration: 0.22, ease: "easeOut" }}
                            className="pointer-events-none grid grid-cols-4 gap-y-3 pt-2 min-[420px]:grid-cols-5 min-[540px]:grid-cols-6"
                        >
                            {sortedIcons.map((icon) => (
                                <div
                                    key={icon.id}
                                    role="button"
                                    tabIndex={0}
                                    className={cn(
                                        "pointer-events-auto flex cursor-pointer justify-center outline-none",
                                        cutId === icon.id && "opacity-45",
                                    )}
                                    onClick={() => selectIcon(icon.id, false)}
                                    onDoubleClick={() => openIcon(icon)}
                                    onKeyDown={(e) => { if (e.key === "Enter") openIcon(icon); }}
                                    onContextMenu={(e) => {
                                        e.preventDefault();
                                        selectIcon(icon.id, false);
                                        setCtxMenu({ x: e.clientX, y: e.clientY, icon });
                                    }}
                                >
                                    <MobileTapIcon
                                        icon={icon}
                                        selected={selection.has(icon.id)}
                                        onOpen={() => openIcon(icon)}
                                        onContext={(x, y) => { selectIcon(icon.id, false); setCtxMenu({ x, y, icon }); }}
                                    />
                                </div>
                            ))}
                        </motion.div>
                    </div>
                ) : (
                    /* Escritorio: posiciones libres + rejilla magnética opcional */
                    <div
                        ref={iconAreaRef}
                        onPointerDown={onBackgroundPointerDown}
                        onPointerMove={onBackgroundPointerMove}
                        onPointerUp={onBackgroundPointerUp}
                        onContextMenu={onBackgroundContext}
                        onWheel={onBackgroundWheel}
                        className="absolute inset-x-3 bottom-24 top-12"
                    >
                        {view.showGrid && <DesktopGrid accent={themeAccent} />}
                        {/* La envoltura de página NO recibe eventos: si los recibiera,
                            se comería el clic derecho del FONDO, el marco de selección
                            y el swipe (el lienzo comprueba `e.target === e.currentTarget`).
                            Los iconos, que sí son interactivos, los reactivan. */}
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={`page-${desktop.id}-${page}`}
                                initial={reduced ? { opacity: 0 } : { opacity: 0, x: 34 }}
                                animate={reduced ? { opacity: 1 } : { opacity: 1, x: 0 }}
                                exit={reduced ? { opacity: 0 } : { opacity: 0, x: -34 }}
                                transition={{ duration: 0.2, ease: "easeOut" }}
                                className="pointer-events-none absolute inset-0"
                            >
                                {pageIcons.map((icon) => (
                                    <PositionedIcon
                                        key={icon.id}
                                        desktopId={desktop.id}
                                        icon={icon}
                                        areaRef={iconAreaRef}
                                        snap={state.snap}
                                        sizeOverride={view.iconSize}
                                        selected={selection.has(icon.id)}
                                        renaming={renamingId === icon.id}
                                        cut={cutId === icon.id}
                                        onSelect={selectIcon}
                                        onOpen={openIcon}
                                        onContext={(x, y, i) => { selectIcon(i.id, false); setCtxMenu({ x, y, icon: i }); }}
                                        onEdgeDwell={pageCount > 1 ? onIconEdgeDwell : undefined}
                                        onRenameCommit={(name) => {
                                            if (name.trim()) updateIcon(desktop.id, icon.id, { name: name.trim() });
                                            setRenamingId(null);
                                        }}
                                        onRenameCancel={() => setRenamingId(null)}
                                    />
                                ))}
                            </motion.div>
                        </AnimatePresence>
                        {marquee && <SelectionBox box={marquee} />}
                    </div>
                )}

                {/* Estado vacío premium (bienvenida + geometría sagrada) */}
                {desktop.icons.length === 0 && desktop.windows.length === 0 && (
                    <EmptyDesktopState
                        desktop={desktop}
                        onAddApps={() => openAdd("apps")}
                        onAddWidgets={() => openAdd("widgets")}
                        onExploreLibrary={() => openAdd("files")}
                    />
                )}
            </motion.div>

            {/* ── Indicador de PÁGINAS (H-3) ──
                Vive por encima de los iconos y por DEBAJO de las ventanas: las
                ventanas NO se deslizan con las páginas (son una capa aparte, y
                así una app abierta no desaparece por barrer el fondo). */}
            {(pageCount > 1 || desktop.icons.length > 0) && (
                <div className="pointer-events-none absolute inset-x-0 bottom-[76px] z-[14] flex justify-center">
                    <PageDots
                        count={pageCount}
                        active={page}
                        accent={themeAccent}
                        onSelect={(p) => setDesktopPage(desktop.id, p)}
                        onAdd={() => addDesktopPage(desktop.id)}
                    />
                </div>
            )}

            {/* ── Capa de ventanas ──
                ⚠️ CAUSA RAÍZ del bug H-1 (Adenda 69), documentada para que no vuelva:
                esta capa es `absolute inset-0` (cubre el lienzo ENTERO) y vive en
                z-[15], POR ENCIMA de la capa de iconos (z-[5]). Sin
                `pointer-events-none`, este div invisible se comía TODOS los clics
                de los iconos: pulsar una app no hacía absolutamente nada — ni
                seleccionar, ni abrir, ni menú contextual — hubiera o no ventanas
                abiertas. Medido en producción: `document.elementsFromPoint(icono)`
                devolvía ESTE div como elemento superior, no el icono.
                REGLA: la capa NUNCA recibe eventos; solo los reciben sus hijos
                reales (ventanas, chips, divisores del mosaico), que se marcan
                explícitamente con `pointer-events-auto`. */}
            <div
                className={cn(
                    "pointer-events-none absolute inset-0 z-[15] transition-all duration-300",
                    cleanView && "scale-[0.98] opacity-0",
                )}
            >
                <AnimatePresence>
                    {visibleWindows.map((win) => {
                        const chrome = resolveWindowChrome(win.contentRef);
                        const hiddenOnMobile = isMobile && win.z !== topZ;
                        return (
                            <div key={win.id} className={cn("pointer-events-auto", hiddenOnMobile && "hidden")}>
                                <DesktopWindowFrame
                                    desktopId={desktop.id}
                                    win={win}
                                    chrome={chrome}
                                    isTop={win.z === topZ}
                                    isMobile={isMobile}
                                    topInset={WINDOW_TOP_INSET}
                                    snapEnabled={view.windowSnap !== false && !tilingActive}
                                    onSnapPreview={setSnapZone}
                                    tiledRect={tilingActive ? (tileRects[win.id] ?? null) : null}
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
                    <div className="pointer-events-auto absolute inset-x-0 bottom-24 z-[45] flex justify-center">
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

                {/* Vista previa translúcida de snap (mitades/cuartos) al arrastrar */}
                {!isMobile && <DesktopSnapPreview zone={snapZone} topInset={WINDOW_TOP_INSET} accent={themeAccent} />}

                {/* Divisores arrastrables del MOSAICO (pantalla dividida, N ventanas) */}
                {tilingActive && tiling && (
                    <DesktopTileDividers
                        desktopId={desktop.id}
                        tiling={tiling}
                        area={tileArea}
                        accent={themeAccent}
                    />
                )}
            </div>

            {/* ── Capa de PANTALLA COMPLETA (por encima de la barra y del dock) ── */}
            <AnimatePresence>
                {fullscreenWin && (
                    <div key={`fs-${fullscreenWin.id}`} className="fixed inset-0 z-[75]">
                        <DesktopWindowFrame
                            desktopId={desktop.id}
                            win={fullscreenWin}
                            chrome={resolveWindowChrome(fullscreenWin.contentRef)}
                            isTop
                            isMobile={isMobile}
                            topInset={0}
                        >
                            <DesktopWindowContent
                                desktopId={desktop.id}
                                win={fullscreenWin}
                                onRequestAddInto={(folderId) => openAdd("apps", folderId)}
                            />
                        </DesktopWindowFrame>
                    </div>
                )}
            </AnimatePresence>

            {/* ── Exposé: vista de conjunto de ventanas ── */}
            <DesktopExpose
                desktopId={desktop.id}
                windows={desktop.windows}
                topZ={topZ}
                open={exposeOpen}
                onClose={() => setExposeOpen(false)}
            />

            {/* ── Dock / barra de tareas (ventanas abiertas) ── */}
            {!cleanView && (
                <DesktopTaskbar
                    desktopId={desktop.id}
                    windows={desktop.windows}
                    topZ={topZ}
                    isMobile={isMobile}
                />
            )}

            {/* ── Barra superior fina (glass) ── */}
            <header
                className="absolute inset-x-0 top-0 z-[40] flex items-center gap-1.5 border-b border-white/10 bg-black/30 backdrop-blur-2xl"
                style={{
                    height: `calc(${TOPBAR_H}px + env(safe-area-inset-top, 0px))`,
                    paddingTop: "env(safe-area-inset-top, 0px)",
                    paddingLeft: "calc(0.5rem + env(safe-area-inset-left, 0px))",
                    paddingRight: "calc(0.5rem + env(safe-area-inset-right, 0px))",
                }}
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

                    {/* Indicador de escritorio COMPARTIDO (SOP §11, ?space=<id>) */}
                    {sharedSpace.space && (
                        <span
                            title={`Espacio compartido: ${sharedSpace.space.title}`}
                            className="flex shrink-0 items-center gap-1 rounded-full border border-cyan-300/30 bg-cyan-400/10 px-2 py-1 text-[10px] font-bold text-cyan-100"
                        >
                            <Share2 className="size-3" />
                            <span className="max-w-[100px] truncate">{sharedSpace.space.title}</span>
                        </span>
                    )}

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
                            onOpenSettings={() => setSettingsOpen(true)}
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

                {/* Mosaico / pantalla dividida (B-3) — cualquier nº de ventanas */}
                {!isMobile && visibleWindows.length > 1 && (
                    <div className="flex items-center gap-0.5 rounded-full border border-white/12 bg-white/[0.04] p-0.5">
                        {([
                            ["grid", Grid2x2, "Mosaico en rejilla (⌘⌥T)"],
                            ["columns", Columns2, "Mosaico en columnas"],
                            ["rows", Rows2, "Mosaico en filas"],
                        ] as Array<[TileMode, typeof Grid2x2, string]>).map(([mode, Icon, title]) => (
                            <button
                                key={mode}
                                type="button"
                                onClick={() => doTile(mode)}
                                title={title}
                                aria-label={title}
                                className={cn(
                                    "grid size-6 place-items-center rounded-full transition-colors cursor-pointer",
                                    "text-muted-foreground hover:bg-white/[0.12] hover:text-foreground",
                                )}
                            >
                                <Icon className="size-3.5" />
                            </button>
                        ))}
                        <button
                            type="button"
                            onClick={() => clearTiling(desktop.id)}
                            title="Ventanas libres (⌘⌥F)"
                            aria-label="Ventanas libres"
                            disabled={!tilingActive}
                            className={cn(
                                "grid size-6 place-items-center rounded-full transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-30",
                                tilingActive
                                    ? "bg-cyan-400/20 text-cyan-200"
                                    : "text-muted-foreground hover:bg-white/[0.12] hover:text-foreground",
                            )}
                        >
                            <Frame className="size-3.5" />
                        </button>
                    </div>
                )}

                {/* Exposé: vista de conjunto de ventanas */}
                {desktop.windows.length > 0 && (
                    <button
                        type="button"
                        onClick={() => setExposeOpen(true)}
                        title="Vista de conjunto (F3)"
                        aria-label="Vista de conjunto de ventanas"
                        className={cn(
                            "grid size-7 place-items-center rounded-full border transition-colors cursor-pointer",
                            "border-white/12 bg-white/[0.04] text-muted-foreground hover:bg-white/[0.09] hover:text-foreground",
                        )}
                    >
                        <LayoutGrid className="size-3.5" />
                    </button>
                )}

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

                {/* Ajustes del escritorio (acceso rápido) */}
                <button
                    type="button"
                    onClick={() => setSettingsOpen(true)}
                    title="Ajustes del escritorio"
                    aria-label="Ajustes del escritorio"
                    className={cn(
                        "grid size-7 place-items-center rounded-full border transition-colors cursor-pointer",
                        settingsOpen
                            ? "border-violet-300/50 bg-violet-400/15 text-violet-200"
                            : "border-white/12 bg-white/[0.04] text-muted-foreground hover:bg-white/[0.09] hover:text-foreground",
                    )}
                >
                    <Settings2 className="size-3.5" />
                </button>

                {/* Conexiones de la neurona (Adenda 98): red externa + malla P2P */}
                <ConnectionsMenu />

                <DesktopClock />
            </header>

            {/* ── Menú contextual (icono o lienzo) ── */}
            {ctxMenu && (
                <>
                    <div className="absolute inset-0 z-[58]" onPointerDown={() => setCtxMenu(null)} onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null); }} aria-hidden />
                    {ctxMenu.icon ? (
                        <IconContextMenu
                            x={ctxMenu.x}
                            y={ctxMenu.y}
                            desktop={desktop}
                            icon={ctxMenu.icon}
                            canvasRef={canvasRef}
                            onClose={() => setCtxMenu(null)}
                            onOpen={openIcon}
                            onEdit={editIcon}
                            onRename={(id) => setRenamingId(id)}
                            onQuickLook={(icon, tab, share) => setQuickLook({ icon, tab, share })}
                        />
                    ) : (
                        <CanvasContextMenu
                            x={ctxMenu.x}
                            y={ctxMenu.y}
                            desktop={desktop}
                            canvasRef={canvasRef}
                            snap={state.snap}
                            activePage={page}
                            pasteSpot={ctxMenu.spot}
                            onClose={() => setCtxMenu(null)}
                            onAddApps={() => openAdd("apps")}
                            onAddWidgets={() => openAdd("widgets")}
                            onChangeBackground={() => setSettingsOpen(true)}
                            onOpenSettings={() => setSettingsOpen(true)}
                            onOpenExpose={() => setExposeOpen(true)}
                            onTile={visibleWindows.length > 1 && !isMobile ? doTile : undefined}
                            onUntile={tilingActive ? () => clearTiling(desktop.id) : undefined}
                        />
                    )}
                </>
            )}

            {/* ── Vista previa / Información / Compartir de un icono (B-2) ── */}
            {quickLook && (
                <DesktopQuickLook
                    desktopId={desktop.id}
                    icon={quickLook.icon}
                    initialTab={quickLook.tab}
                    initialShare={quickLook.share}
                    onClose={() => setQuickLook(null)}
                    onOpen={(icon) => { setQuickLook(null); openIcon(icon); }}
                />
            )}

            {/* ── Panel "+ Añadir" ── */}
            <DesktopAddPanel
                desktop={desktop}
                open={addOpen}
                initialTab={addTab}
                targetFolderId={addFolderTarget}
                onClose={() => { setAddOpen(false); setAddFolderTarget(null); }}
            />

            {/* ── Ajustes del escritorio (diseño y edición) ── */}
            <DesktopSettingsPanel
                desktop={desktop}
                desktops={state.desktops}
                snap={state.snap}
                open={settingsOpen}
                onClose={() => setSettingsOpen(false)}
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
                        {/* Centrado con FLEX, no con `-translate-*`: Framer Motion escribe
                            su propio `transform` y machacaría las clases de translate. */}
                        <div key="cursor-sheet-wrap" className="pointer-events-none absolute inset-0 z-[52] grid place-items-center p-3">
                        <motion.div
                            key="cursor-sheet"
                            role="dialog"
                            aria-label="Cursor y gestos"
                            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.97 }}
                            animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.97 }}
                            transition={reduced ? { duration: 0.15 } : { type: "spring", stiffness: 320, damping: 30 }}
                            className="ss-crystal pointer-events-auto w-[400px] max-w-full rounded-3xl border border-white/12 bg-card/95 p-4 shadow-2xl backdrop-blur-2xl"
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
                        </div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}

// ── Icono móvil (UN toque abre · mantener pulsado = menú) ────────
// H-1/H-2: antes hacía falta un DOBLE TAP para abrir (nadie lo descubría) y no
// había menú contextual táctil. Ahora es la convención de iOS/Android.
function MobileTapIcon({ icon, selected, onOpen, onContext }: {
    icon: DesktopIcon;
    selected: boolean;
    onOpen: () => void;
    onContext?: (x: number, y: number) => void;
}): React.ReactElement {
    const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const longPressed = useRef(false);
    const start = useRef<{ x: number; y: number } | null>(null);

    const clear = () => {
        if (pressTimer.current) {
            clearTimeout(pressTimer.current);
            pressTimer.current = null;
        }
    };

    return (
        <div
            onPointerDown={(e) => {
                if (e.pointerType !== "touch") return;
                longPressed.current = false;
                start.current = { x: e.clientX, y: e.clientY };
                const { clientX, clientY } = e;
                clear();
                pressTimer.current = setTimeout(() => {
                    longPressed.current = true;
                    onContext?.(clientX, clientY);
                }, 520);
            }}
            onPointerMove={(e) => {
                const s = start.current;
                if (!s) return;
                if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10) clear();
            }}
            onPointerCancel={clear}
            onPointerUp={(e) => {
                clear();
                if (e.pointerType !== "touch") return;
                if (longPressed.current) { longPressed.current = false; return; }
                onOpen();
            }}
        >
            <DesktopIconTile icon={icon} selected={selected} compact />
        </div>
    );
}
