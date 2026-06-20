'use client';

// ════════════════════════════════════════════════════════════════
// AppLauncherWidget — carpeta / tile de apps en el dashboard
// ----------------------------------------------------------------
// Variantes:
//   • folder  → grid de iconos de apps (carpeta personalizable).
//   • single  → tile grande de una sola app.
// Personalizable vía DashboardWidget.settings (columnas, forma de
// icono, estilo, densidad, etiquetas, modo de apertura por defecto).
// Un clic abre la app en su modo por defecto; el botón ⋯ ofrece los
// modos permitidos (aquí mismo / ventana / pestaña / popup / módulo).
// SOP: architecture/dashboard-launcher-apps-y-archivos.md
// ════════════════════════════════════════════════════════════════

import React, { useMemo, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { LayoutGrid, MoreVertical } from "lucide-react";
import { WidgetShell } from "../kit";
import { cn } from "@/lib/utils";
import type { DashboardWidget } from "../dashboard-types";
import {
    resolveLauncherSettings,
    ICON_SHAPE_CLASS,
    HEX_CLIP_PATH,
    OPEN_MODE_LABEL,
    type AppLauncherSettings,
    type IconStyle,
    type OpenMode,
    type StarseedApp,
} from "../apps/launcher-types";
import { resolveApps } from "../apps/app-catalog";
import { useAppLauncher } from "../apps/app-launch";

function iconStyleProps(style: IconStyle, accent: string): { className: string; style: React.CSSProperties } {
    switch (style) {
        case "solid":
            return { className: "text-white border border-white/15 shadow-lg", style: { background: accent } };
        case "outline":
            return { className: "border-2 bg-transparent", style: { borderColor: accent, color: accent } };
        case "gradient":
            return {
                className: "text-white border border-white/15 shadow-lg",
                style: { background: `linear-gradient(135deg, ${accent}, color-mix(in srgb, ${accent} 35%, transparent))` },
            };
        case "glass":
        default:
            return {
                className: "border border-white/15 backdrop-blur-md shadow",
                style: { background: `color-mix(in srgb, ${accent} 22%, transparent)`, color: accent },
            };
    }
}

// ── Menú de modos de apertura (portado a body para no recortarse) ──
function ModeMenu({ app, x, y, onPick, onClose }: {
    app: StarseedApp; x: number; y: number; onPick: (m: OpenMode) => void; onClose: () => void;
}) {
    const left = Math.min(x, (typeof window !== "undefined" ? window.innerWidth : 9999) - 200);
    const top = Math.min(y, (typeof window !== "undefined" ? window.innerHeight : 9999) - 40 - app.open.allowed.length * 36);
    return createPortal(
        <div className="fixed inset-0 z-[130]" onClick={onClose} role="presentation">
            <div
                className="absolute min-w-[180px] rounded-xl border border-border/60 bg-card/95 backdrop-blur-2xl shadow-2xl p-1"
                style={{ left, top }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="px-2.5 py-1.5 text-[10px] uppercase tracking-[0.16em] font-bold text-muted-foreground/60 truncate">
                    {app.name}
                </div>
                {app.open.allowed.map((m) => (
                    <button
                        key={m}
                        type="button"
                        onClick={() => { onPick(m); onClose(); }}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg text-sm hover:bg-primary/15 hover:text-primary transition-colors cursor-pointer"
                    >
                        {OPEN_MODE_LABEL[m]}
                    </button>
                ))}
            </div>
        </div>,
        document.body
    );
}

// ── Tile de una app ──────────────────────────────────────────────
function AppTile({ app, settings, big, onOpen, onMenu }: {
    app: StarseedApp;
    settings: AppLauncherSettings;
    big?: boolean;
    onOpen: () => void;
    onMenu: (e: React.MouseEvent) => void;
}) {
    const Icon = app.icon;
    const shape = settings.iconShape ?? "squircle";
    const sizeCls = big ? "size-20" : settings.density === "compact" ? "size-11" : "size-14";
    const { className: isCls, style: isStyle } = iconStyleProps(settings.iconStyle ?? "glass", app.accent);
    const hexStyle = shape === "hex" ? { clipPath: HEX_CLIP_PATH } : undefined;

    return (
        <div className={cn("relative group flex flex-col items-center gap-1.5", big && "gap-3")}>
            <button
                type="button"
                onClick={onOpen}
                title={`${app.name} — ${app.description}`}
                className={cn(
                    "grid place-items-center transition-transform hover:-translate-y-0.5 active:scale-95 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                    ICON_SHAPE_CLASS[shape],
                    isCls,
                    sizeCls,
                )}
                style={{ ...isStyle, ...hexStyle }}
            >
                <Icon className={big ? "size-9" : "size-6"} strokeWidth={2} />
            </button>

            {/* Badge "pronto" para módulos en construcción */}
            {app.status === "soon" && (
                <span className="pointer-events-none absolute -top-1 -right-1 rounded-full bg-amber-500/90 text-[8px] font-black uppercase tracking-wide text-black px-1.5 py-0.5 shadow">
                    pronto
                </span>
            )}

            {/* Botón de menú de modos (hover) — hermano del tile, no anidado */}
            <button
                type="button"
                onClick={onMenu}
                title="Modo de apertura"
                aria-label={`Modo de apertura de ${app.name}`}
                className="absolute -top-1 -left-1 grid place-items-center size-5 rounded-full bg-card/90 border border-border/60 text-muted-foreground/70 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-foreground transition-opacity cursor-pointer"
            >
                <MoreVertical className="size-3" />
            </button>

            {settings.showLabels !== false && (
                <span className={cn(
                    "text-center leading-tight text-muted-foreground/90 truncate max-w-[8rem]",
                    big ? "text-sm font-bold" : "text-[10px] font-semibold"
                )}>
                    {big ? app.name : (app.short ?? app.name)}
                </span>
            )}
        </div>
    );
}

export function AppLauncherWidget({ widget }: { widget: DashboardWidget }) {
    const settings = useMemo(
        () => resolveLauncherSettings(widget.settings as Partial<AppLauncherSettings>),
        [widget.settings]
    );
    const apps = useMemo(
        () => resolveApps(settings.appIds, settings.collection),
        [settings.appIds, settings.collection]
    );
    const { launch, windowEl } = useAppLauncher();
    const [menu, setMenu] = useState<{ app: StarseedApp; x: number; y: number } | null>(null);
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    const openApp = (app: StarseedApp) => launch(app, settings.defaultOpen);
    const openMenu = (app: StarseedApp, e: React.MouseEvent) => {
        e.stopPropagation();
        setMenu({ app, x: e.clientX, y: e.clientY });
    };

    const gridCols = settings.columns && settings.columns > 0
        ? `repeat(${settings.columns}, minmax(0, 1fr))`
        : `repeat(auto-fill, minmax(${settings.density === "compact" ? "64px" : "78px"}, 1fr))`;

    // ── Variante single: tile grande de la primera app ──
    if (settings.variant === "single") {
        const app = apps[0];
        return (
            <WidgetShell title={app?.name ?? settings.label ?? "App"} subtitle="Acceso directo" icon={LayoutGrid} accent={app?.accent}>
                <div className="h-full grid place-items-center p-2">
                    {app ? (
                        <AppTile app={app} settings={settings} big onOpen={() => openApp(app)} onMenu={(e) => openMenu(app, e)} />
                    ) : (
                        <p className="text-sm text-muted-foreground">Sin app seleccionada.</p>
                    )}
                </div>
                {mounted && menu && (
                    <ModeMenu app={menu.app} x={menu.x} y={menu.y}
                        onPick={(m) => launch(menu.app, m)} onClose={() => setMenu(null)} />
                )}
                {windowEl}
            </WidgetShell>
        );
    }

    // ── Variante folder: grid de apps ──
    return (
        <WidgetShell title={settings.label ?? "Apps"} subtitle={`${apps.length} apps`} icon={LayoutGrid} accent="#39FF14">
            <div className="grid gap-3 py-1" style={{ gridTemplateColumns: gridCols }}>
                {apps.map((app) => (
                    <AppTile key={app.id} app={app} settings={settings}
                        onOpen={() => openApp(app)} onMenu={(e) => openMenu(app, e)} />
                ))}
            </div>
            {apps.length === 0 && (
                <div className="h-full grid place-items-center">
                    <p className="text-sm text-muted-foreground">Carpeta vacía.</p>
                </div>
            )}
            {mounted && menu && (
                <ModeMenu app={menu.app} x={menu.x} y={menu.y}
                    onPick={(m) => launch(menu.app, m)} onClose={() => setMenu(null)} />
            )}
            {windowEl}
        </WidgetShell>
    );
}
