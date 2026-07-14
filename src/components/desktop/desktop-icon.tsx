'use client';

// ════════════════════════════════════════════════════════════════
// StarSeed OS — Tile visual de icono de escritorio (presentacional)
// ----------------------------------------------------------------
// Dibuja UN icono (app/archivo/folder/widget/enlace) estilo desktop:
// placa squircle de cristal con acento, imagen oficial (/app-icons/*)
// si existe, Lucide o iniciales como respaldo, nombre debajo y marco
// cristal de selección. En viewMode 'preview' los widgets se ven VIVOS
// (mini-tarjeta real) y las imágenes muestran su miniatura.
// La lógica de arrastre/apertura vive en el lienzo (desktop-canvas).
// ════════════════════════════════════════════════════════════════

import React, { useState } from "react";
import {
    Folder, Globe, LayoutGrid, FileText, Image as ImageIcon, Film, Music,
    Box, FileCode2, File as FileIcon, Link2, Settings2, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DesktopIcon, DesktopIconSize } from "./desktop-store";
import { getApp } from "@/components/dashboard/apps/app-catalog";
import { DesktopWidgetHost, widgetAccent } from "./desktop-widget-host";
import { DesktopWidgetConfigPanel } from "./desktop-widget-config-panel";
import { FileThumb, hasRichThumb } from "./desktop-thumbs";

// ── Métricas compartidas (rejilla magnética + tiles) ─────────────
export const ICON_TILE_PX: Record<DesktopIconSize, number> = { sm: 48, md: 64, lg: 84 };
export const ICON_LABEL_W: Record<DesktopIconSize, number> = { sm: 78, md: 96, lg: 118 };
export const ICON_CELL = { w: 106, h: 124 };
/** Píxeles por celda de rejilla para widgetSpan (1x1..4x4). */
const SPAN_CELL_PX = 78;
export const PREVIEW_PX: Record<DesktopIconSize, { w: number; h: number }> = {
    sm: { w: 172, h: 128 },
    md: { w: 236, h: 172 },
    lg: { w: 316, h: 224 },
};

function fileLucide(kind?: string): LucideIcon {
    switch (kind) {
        case "image": case "gif": case "gallery": return ImageIcon;
        case "video": return Film;
        case "audio": return Music;
        case "pdf": case "markdown": case "text": return FileText;
        case "model3d": return Box;
        case "code": case "html": return FileCode2;
        case "link": return Link2;
        default: return FileIcon;
    }
}

export interface IconVisual {
    iconUrl?: string;
    Lucide: LucideIcon;
    accent: string;
}

/** Resuelve la apariencia de un icono referenciando el catálogo real. */
export function resolveIconVisual(icon: DesktopIcon): IconVisual {
    if (icon.kind === "app") {
        const app = icon.refId ? getApp(icon.refId) : undefined;
        if (app) return { iconUrl: icon.iconUrl ?? app.iconUrl, Lucide: app.icon, accent: icon.accent ?? app.accent };
        return { iconUrl: icon.iconUrl, Lucide: LayoutGrid, accent: icon.accent ?? "#007FFF" };
    }
    if (icon.kind === "folder") return { iconUrl: icon.iconUrl, Lucide: Folder, accent: icon.accent ?? "#FFBF00" };
    if (icon.kind === "widget") return { iconUrl: icon.iconUrl, Lucide: LayoutGrid, accent: icon.accent ?? widgetAccent(undefined) };
    if (icon.kind === "link") return { iconUrl: icon.iconUrl, Lucide: Globe, accent: icon.accent ?? "#22D3EE" };
    return { iconUrl: icon.iconUrl, Lucide: fileLucide(icon.fileKind), accent: icon.accent ?? "#38BDF8" };
}

function initialsOf(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "·";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
}

// ── Etiqueta con renombrado en línea ─────────────────────────────
function IconLabel({
    icon, selected, renaming, onRenameCommit, onRenameCancel, compact,
}: {
    icon: DesktopIcon;
    selected: boolean;
    renaming: boolean;
    onRenameCommit?: (name: string) => void;
    onRenameCancel?: () => void;
    compact?: boolean;
}): React.ReactElement {
    if (renaming) {
        return (
            <input
                autoFocus
                defaultValue={icon.name}
                onFocus={(e) => e.currentTarget.select()}
                onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                    if (e.key === "Enter") onRenameCommit?.(e.currentTarget.value);
                    if (e.key === "Escape") onRenameCancel?.();
                }}
                onBlur={(e) => onRenameCommit?.(e.currentTarget.value)}
                className="mt-1 w-[110px] rounded-lg border border-sky-400/50 bg-black/70 px-1.5 py-0.5 text-center text-[11px] font-semibold text-white outline-none"
            />
        );
    }
    return (
        <span
            className={cn(
                "mt-1 line-clamp-2 max-w-full break-words rounded-lg px-1.5 py-0.5 text-center font-semibold leading-tight text-white",
                compact ? "text-[10px]" : "text-[11px]",
                "[text-shadow:0_1px_3px_rgba(0,0,0,0.9)]",
                selected && "bg-sky-400/25 backdrop-blur-sm",
            )}
        >
            {icon.name}
        </span>
    );
}

// ── Tile ─────────────────────────────────────────────────────────
export interface DesktopIconTileProps {
    icon: DesktopIcon;
    selected?: boolean;
    /** Modo compacto (folders / móvil): tile pequeño e independiente del size. */
    compact?: boolean;
    renaming?: boolean;
    onRenameCommit?: (name: string) => void;
    onRenameCancel?: () => void;
    /** Necesario para abrir el panel de configuración del widget (engranaje). */
    desktopId?: string;
}

export function DesktopIconTile({
    icon, selected = false, compact = false, renaming = false, onRenameCommit, onRenameCancel, desktopId,
}: DesktopIconTileProps): React.ReactElement {
    const [imgFailed, setImgFailed] = useState(false);
    const [configAt, setConfigAt] = useState<{ x: number; y: number } | null>(null);
    const gearTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const { iconUrl, Lucide, accent } = resolveIconVisual(icon);
    const px = compact ? ICON_TILE_PX.sm : ICON_TILE_PX[icon.size];
    const labelW = compact ? ICON_LABEL_W.sm : ICON_LABEL_W[icon.size];

    // ── Preview vivo: widget real en miniatura ──
    if (!compact && icon.kind === "widget" && icon.viewMode === "preview" && icon.refId) {
        const dims = icon.widgetSpan
            ? { w: icon.widgetSpan.cols * SPAN_CELL_PX, h: icon.widgetSpan.rows * SPAN_CELL_PX }
            : PREVIEW_PX[icon.size];
        const appearance = icon.appearance;
        const tint = appearance?.tint ?? accent;
        const radius = appearance?.radius ?? 16;
        const opacity = appearance?.opacity ?? 1;
        const openGear = (e: React.MouseEvent | React.PointerEvent) => {
            e.stopPropagation();
            setConfigAt({ x: Math.min(e.clientX, window.innerWidth - 280), y: Math.min(e.clientY, window.innerHeight - 320) });
        };
        return (
            <div className="group/widget flex flex-col items-center" style={{ width: dims.w }}>
                <div
                    style={{ width: dims.w, height: dims.h, borderRadius: radius, opacity }}
                    className={cn(
                        "relative overflow-hidden border bg-black/35 backdrop-blur-xl shadow-xl transition-all duration-200",
                        selected
                            ? "border-sky-300/70 ring-2 ring-sky-300/50 shadow-[0_0_24px_rgba(56,189,248,0.35)]"
                            : "border-white/12 hover:border-white/25",
                    )}
                >
                    <span
                        aria-hidden
                        className="pointer-events-none absolute inset-x-3 top-0 h-px opacity-70"
                        style={{ background: `linear-gradient(90deg, transparent, ${tint}, transparent)` }}
                    />
                    <DesktopWidgetHost type={icon.refId} instanceId={`prev-${icon.id}`} interactive={false} />
                    {/* Engranaje: hover en ratón, siempre visible en táctil (touch:opacity-100) */}
                    {desktopId && (
                        <button
                            type="button"
                            onClick={openGear}
                            onPointerDown={(e) => {
                                e.stopPropagation();
                                if (e.pointerType !== "touch") return;
                                gearTimer.current = setTimeout(() => openGear(e), 480);
                            }}
                            onPointerUp={() => { if (gearTimer.current) clearTimeout(gearTimer.current); }}
                            onPointerLeave={() => { if (gearTimer.current) clearTimeout(gearTimer.current); }}
                            title="Configurar widget"
                            aria-label={`Configurar ${icon.name}`}
                            className="absolute right-1.5 top-1.5 z-20 grid size-6 place-items-center rounded-full border border-white/20 bg-black/60 text-white/80 opacity-0 backdrop-blur transition-opacity hover:bg-black/80 hover:text-white group-hover/widget:opacity-100 cursor-pointer sm:opacity-0"
                        >
                            <Settings2 className="size-3.5" />
                        </button>
                    )}
                </div>
                <IconLabel icon={icon} selected={selected} renaming={renaming} onRenameCommit={onRenameCommit} onRenameCancel={onRenameCancel} />
                {desktopId && configAt && (
                    <DesktopWidgetConfigPanel
                        desktopId={desktopId}
                        icon={icon}
                        x={configAt.x}
                        y={configAt.y}
                        onClose={() => setConfigAt(null)}
                    />
                )}
            </div>
        );
    }

    // ── Vista previa RICA de un archivo (H-4) ──
    // Antes solo las imágenes tenían tarjeta; el resto caía al icono genérico.
    // Ahora la tarjeta grande muestra la miniatura REAL de CUALQUIER tipo:
    // vídeo (primer fotograma), pdf (primera página), audio (onda/portada),
    // código/texto/markdown (fragmento renderizado).
    if (!compact && icon.kind === "file" && icon.viewMode === "preview" && hasRichThumb(icon)) {
        const dims = PREVIEW_PX[icon.size];
        return (
            <div className="flex flex-col items-center" style={{ width: dims.w }}>
                <div
                    style={{ width: dims.w, height: dims.h }}
                    className={cn(
                        "overflow-hidden rounded-2xl border bg-black/35 shadow-xl transition-all duration-200",
                        selected ? "border-sky-300/70 ring-2 ring-sky-300/50" : "border-white/12 hover:border-white/25",
                    )}
                >
                    <FileThumb icon={icon} rich />
                </div>
                <IconLabel icon={icon} selected={selected} renaming={renaming} onRenameCommit={onRenameCommit} onRenameCancel={onRenameCancel} />
            </div>
        );
    }

    // ── Tile clásico: placa squircle de cristal ──
    // Los ARCHIVOS con miniatura real la enseñan aquí también (H-4): la placa
    // deja de ser un icono genérico y pasa a ser una ventana a su contenido.
    const showImg = Boolean(iconUrl) && !imgFailed;
    const useFileThumb = icon.kind === "file" && !showImg && hasRichThumb(icon);
    return (
        <div className="flex flex-col items-center" style={{ width: labelW }}>
            <div
                style={{ width: px, height: px }}
                className={cn(
                    "relative grid place-items-center overflow-hidden rounded-[26%] border shadow-lg transition-all duration-200",
                    selected
                        ? "border-sky-300/80 ring-2 ring-sky-300/60 shadow-[0_0_22px_rgba(56,189,248,0.4)]"
                        : "border-white/15 hover:border-white/30 hover:shadow-[0_0_16px_rgba(255,255,255,0.12)]",
                )}
            >
                {/* Fondo cristal con acento de la entidad */}
                <span
                    aria-hidden
                    className="absolute inset-0"
                    style={{
                        background: `linear-gradient(135deg, color-mix(in srgb, ${accent} 82%, #0B1020), color-mix(in srgb, ${accent} 28%, rgba(10,14,26,0.9)))`,
                    }}
                />
                <span aria-hidden className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />
                {useFileThumb ? (
                    <FileThumb icon={icon} showBadge={!compact} className="absolute inset-0" />
                ) : showImg ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={iconUrl}
                        alt=""
                        draggable={false}
                        onError={() => setImgFailed(true)}
                        className="relative h-full w-full object-cover"
                    />
                ) : icon.kind === "folder" || icon.kind === "widget" || icon.kind === "link" || icon.kind === "file" ? (
                    <Lucide className="relative text-white drop-shadow" style={{ width: px * 0.46, height: px * 0.46 }} strokeWidth={1.8} />
                ) : (
                    <span className="relative select-none font-black text-white drop-shadow" style={{ fontSize: px * 0.34 }}>
                        {initialsOf(icon.name)}
                    </span>
                )}
                {/* Contador de folder */}
                {icon.kind === "folder" && (icon.children?.length ?? 0) > 0 && (
                    <span className="absolute bottom-1 right-1 grid min-w-4 place-items-center rounded-full border border-white/25 bg-black/55 px-1 text-[9px] font-black text-white">
                        {icon.children!.length}
                    </span>
                )}
            </div>
            <IconLabel
                icon={icon}
                selected={selected}
                renaming={renaming}
                onRenameCommit={onRenameCommit}
                onRenameCancel={onRenameCancel}
                compact={compact}
            />
        </div>
    );
}
