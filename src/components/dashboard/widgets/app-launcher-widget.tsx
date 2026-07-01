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
import { LayoutGrid, MoreVertical, Settings2, Check, X, ChevronDown, ChevronRight, FolderOpen } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { WidgetShell, useElementSize } from "../kit";
import { cn } from "@/lib/utils";
import type { DashboardWidget } from "../dashboard-types";
import {
    resolveLauncherSettings,
    compactFolderColumns,
    ICON_SHAPE_CLASS,
    HEX_CLIP_PATH,
    OPEN_MODE_LABEL,
    type AppLauncherSettings,
    type LauncherGroup,
    type IconShape,
    type IconStyle,
    type OpenMode,
    type LauncherVariant,
    type LauncherCollection,
    type LauncherDensity,
    type StarseedApp,
} from "../apps/launcher-types";
import { resolveApps, APP_CATALOG, APP_COLLECTIONS, getApp } from "../apps/app-catalog";
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
                    "grid place-items-center overflow-hidden transition-transform hover:-translate-y-0.5 active:scale-95 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                    ICON_SHAPE_CLASS[shape],
                    isCls,
                    sizeCls,
                )}
                style={{ ...isStyle, ...hexStyle }}
            >
                {app.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={app.iconUrl} alt="" draggable={false} className="size-full object-cover" />
                ) : (
                    <Icon className={big ? "size-9" : "size-6"} strokeWidth={2} />
                )}
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

// ── MiniTile: icono compacto de app (carpeta densa tipo móvil) ────
// Icono pequeño con etiqueta minúscula opcional. Pensado para rejillas de
// 4–8 por hilera. box-border + min-w-0 → nunca recorta ni desborda.
function MiniTile({ app, settings, onOpen, onMenu }: {
    app: StarseedApp;
    settings: AppLauncherSettings;
    onOpen: () => void;
    onMenu: (e: React.MouseEvent) => void;
}) {
    const Icon = app.icon;
    const shape = settings.iconShape ?? "squircle";
    const { className: isCls, style: isStyle } = iconStyleProps(settings.iconStyle ?? "glass", app.accent);
    const hexStyle = shape === "hex" ? { clipPath: HEX_CLIP_PATH } : undefined;
    return (
        <div className="group relative flex min-w-0 flex-col items-center gap-1">
            <button
                type="button"
                onClick={onOpen}
                onContextMenu={onMenu}
                title={`${app.name} — ${app.description}`}
                className={cn(
                    "grid place-items-center overflow-hidden transition-transform hover:-translate-y-0.5 active:scale-95 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 box-border size-10 @sm:size-12",
                    ICON_SHAPE_CLASS[shape],
                    isCls,
                )}
                style={{ ...isStyle, ...hexStyle }}
            >
                {app.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={app.iconUrl} alt="" draggable={false} className="size-full object-cover" />
                ) : (
                    <Icon className="size-5" strokeWidth={2} />
                )}
            </button>
            {app.status === "soon" && (
                <span className="pointer-events-none absolute -top-1 -right-1 size-2 rounded-full bg-amber-500/90 shadow" title="Próximamente" />
            )}
            {/* Menú de modos: botón oculto que aparece al hover (esquina) */}
            <button
                type="button"
                onClick={onMenu}
                title="Modo de apertura"
                aria-label={`Modo de apertura de ${app.name}`}
                className="absolute -top-1 -left-1 grid place-items-center size-4 rounded-full bg-card/90 border border-border/60 text-muted-foreground/70 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-foreground transition-opacity cursor-pointer"
            >
                <MoreVertical className="size-2.5" />
            </button>
            {settings.showLabels !== false && (
                <span className="w-full text-center leading-tight text-[9px] font-semibold text-muted-foreground/85 truncate px-0.5">
                    {app.short ?? app.name}
                </span>
            )}
        </div>
    );
}

// ── Rejilla compacta de apps (columnas responsivas 4–8) ───────────
function CompactAppGrid({ apps, settings, cols, onOpen, onMenu }: {
    apps: StarseedApp[];
    settings: AppLauncherSettings;
    cols: number;
    onOpen: (a: StarseedApp) => void;
    onMenu: (a: StarseedApp, e: React.MouseEvent) => void;
}) {
    const columns = settings.columns && settings.columns > 0 ? settings.columns : cols;
    return (
        <div
            className="grid gap-2 @sm:gap-2.5 py-1 box-border"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
            {apps.map((app) => (
                <MiniTile key={app.id} app={app} settings={settings}
                    onOpen={() => onOpen(app)} onMenu={(e) => onMenu(app, e)} />
            ))}
        </div>
    );
}

// ── Panel de ajustes del launcher (portado a body) ───────────────
const VARIANTS: { v: LauncherVariant; label: string }[] = [{ v: "folder", label: "Carpeta" }, { v: "single", label: "Tile" }];
const COLLECTIONS: { c: LauncherCollection; label: string }[] = [{ c: "starseed", label: "StarSeed" }, { c: "sistema", label: "Sistema" }, { c: "media", label: "Media" }, { c: "custom", label: "Propia" }];
const SHAPES: IconShape[] = ["squircle", "circle", "rounded", "hex"];
const STYLES: IconStyle[] = ["glass", "solid", "outline", "gradient"];
const DENSITIES: LauncherDensity[] = ["comfortable", "compact"];
const OPEN_OPTS: (OpenMode | "auto")[] = ["auto", "window", "tab", "popup", "route", "embed"];

function SettingsRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/60">{label}</div>
            <div className="flex flex-wrap gap-1.5">{children}</div>
        </div>
    );
}
function Seg({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button type="button" onClick={onClick}
            className={cn("rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer capitalize",
                active ? "border-primary/50 bg-primary/15 text-primary" : "border-border/50 text-muted-foreground hover:text-foreground hover:bg-white/5")}>
            {children}
        </button>
    );
}

function LauncherSettingsPanel({ settings, patch, onClose }: { settings: AppLauncherSettings; patch: (p: Partial<AppLauncherSettings>) => void; onClose: () => void }) {
    const effectiveIds = settings.appIds.length ? settings.appIds : (APP_COLLECTIONS[settings.collection ?? "starseed"] ?? []);
    const toggleApp = (id: string) => {
        const set = new Set(effectiveIds);
        if (set.has(id)) set.delete(id); else set.add(id);
        patch({ appIds: Array.from(set), collection: "custom" });
    };
    return createPortal(
        <div className="fixed inset-0 z-[125] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Ajustes de la carpeta">
            <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
            <div className="relative w-full max-w-md max-h-[85vh] overflow-auto custom-scrollbar rounded-2xl border border-border/60 bg-card/95 backdrop-blur-2xl shadow-2xl p-4 space-y-3.5">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-black flex items-center gap-2"><Settings2 className="size-4 text-primary" /> Ajustes de la carpeta</h3>
                    <button type="button" onClick={onClose} aria-label="Cerrar" className="grid place-items-center size-7 rounded-full hover:bg-white/10 cursor-pointer"><X className="size-4" /></button>
                </div>
                <SettingsRow label="Etiqueta">
                    <input value={settings.label ?? ""} onChange={(e) => patch({ label: e.target.value })}
                        className="w-full rounded-lg border border-border/50 bg-white/5 px-2.5 py-1.5 text-sm outline-none focus:border-primary/50" placeholder="Nombre de la carpeta" />
                </SettingsRow>
                <SettingsRow label="Variante">
                    {VARIANTS.map((x) => <Seg key={x.v} active={settings.variant === x.v} onClick={() => patch({ variant: x.v })}>{x.label}</Seg>)}
                </SettingsRow>
                <SettingsRow label="Colección">
                    {COLLECTIONS.map((x) => <Seg key={x.c} active={(settings.collection ?? "starseed") === x.c} onClick={() => patch(x.c !== "custom" ? { collection: x.c, appIds: [] } : { collection: x.c })}>{x.label}</Seg>)}
                </SettingsRow>
                <SettingsRow label="Forma de icono">
                    {SHAPES.map((s) => <Seg key={s} active={(settings.iconShape ?? "squircle") === s} onClick={() => patch({ iconShape: s })}>{s}</Seg>)}
                </SettingsRow>
                <SettingsRow label="Estilo de icono">
                    {STYLES.map((s) => <Seg key={s} active={(settings.iconStyle ?? "glass") === s} onClick={() => patch({ iconStyle: s })}>{s}</Seg>)}
                </SettingsRow>
                <SettingsRow label="Densidad">
                    {DENSITIES.map((d) => <Seg key={d} active={(settings.density ?? "comfortable") === d} onClick={() => patch({ density: d })}>{d === "comfortable" ? "Cómoda" : "Compacta"}</Seg>)}
                </SettingsRow>
                <SettingsRow label="Estilo de carpeta">
                    <Seg active={settings.compactFolder !== false} onClick={() => patch({ compactFolder: true })}>Compacta (móvil)</Seg>
                    <Seg active={settings.compactFolder === false} onClick={() => patch({ compactFolder: false })}>Amplia</Seg>
                </SettingsRow>
                <SettingsRow label="Agrupar por categorías">
                    <Seg active={settings.grouped === true} onClick={() => patch({ grouped: true })}>Sí</Seg>
                    <Seg active={settings.grouped !== true} onClick={() => patch({ grouped: false })}>No</Seg>
                </SettingsRow>
                <SettingsRow label={`Columnas: ${settings.columns && settings.columns > 0 ? settings.columns : "auto"}`}>
                    <input type="range" min={0} max={8} value={settings.columns ?? 0} onChange={(e) => patch({ columns: Number(e.target.value) })} className="w-full cursor-pointer" aria-label="Columnas" />
                </SettingsRow>
                <SettingsRow label="Apertura por defecto">
                    {OPEN_OPTS.map((o) => <Seg key={o} active={(settings.defaultOpen ?? "auto") === o} onClick={() => patch({ defaultOpen: o === "auto" ? undefined : (o as OpenMode) })}>{o === "auto" ? "Auto" : OPEN_MODE_LABEL[o as OpenMode]}</Seg>)}
                </SettingsRow>
                <SettingsRow label="Etiquetas de texto">
                    <Seg active={settings.showLabels !== false} onClick={() => patch({ showLabels: true })}>Mostrar</Seg>
                    <Seg active={settings.showLabels === false} onClick={() => patch({ showLabels: false })}>Ocultar</Seg>
                </SettingsRow>
                <SettingsRow label="Apps de la carpeta">
                    <div className="grid w-full gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(96px,1fr))" }}>
                        {APP_CATALOG.map((a) => {
                            const on = effectiveIds.includes(a.id);
                            const Ic = a.icon;
                            return (
                                <button key={a.id} type="button" onClick={() => toggleApp(a.id)}
                                    className={cn("flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition-colors cursor-pointer",
                                        on ? "border-primary/50 bg-primary/10 text-foreground" : "border-border/40 text-muted-foreground hover:bg-white/5")}>
                                    <Ic className="size-3.5 shrink-0" style={{ color: a.accent }} />
                                    <span className="truncate flex-1 text-left">{a.short ?? a.name}</span>
                                    {on && <Check className="size-3 text-primary shrink-0" />}
                                </button>
                            );
                        })}
                    </div>
                </SettingsRow>
            </div>
        </div>,
        document.body
    );
}

export function AppLauncherWidget({ widget }: { widget: DashboardWidget }) {
    const [edits, setEdits] = useState<Partial<AppLauncherSettings>>({});
    const [panelOpen, setPanelOpen] = useState(false);
    const settings = useMemo(
        () => resolveLauncherSettings({ ...(widget.settings as Partial<AppLauncherSettings>), ...edits }),
        [widget.settings, edits]
    );
    const apps = useMemo(
        () => resolveApps(settings.appIds, settings.collection),
        [settings.appIds, settings.collection]
    );
    const { launch, windowEl } = useAppLauncher();
    const [menu, setMenu] = useState<{ app: StarseedApp; x: number; y: number } | null>(null);
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    const patch = (p: Partial<AppLauncherSettings>) => {
        setEdits((prev) => ({ ...prev, ...p }));
        if (typeof window !== "undefined") {
            const next = { ...settings, ...p };
            window.dispatchEvent(new CustomEvent("starseed:update-widget-settings", { detail: { id: widget.id, settings: next } }));
        }
    };
    const gear = (
        <button type="button" onClick={() => setPanelOpen(true)} title="Ajustes de la carpeta" aria-label="Ajustes de la carpeta"
            className="grid place-items-center size-7 rounded-full text-muted-foreground/70 hover:text-foreground hover:bg-white/10 transition-colors cursor-pointer">
            <Settings2 className="size-3.5" />
        </button>
    );
    const panel = mounted && panelOpen ? <LauncherSettingsPanel settings={settings} patch={patch} onClose={() => setPanelOpen(false)} /> : null;

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
            <WidgetShell title={app?.name ?? settings.label ?? "App"} subtitle="Acceso directo" icon={LayoutGrid} accent={app?.accent} actions={gear}>
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
                {panel}
                {windowEl}
            </WidgetShell>
        );
    }

    // ── Variante folder ──
    // Carpeta COMPACTA (por defecto): rejilla densa de iconos + cabecera con
    // contador y chevron para expandir/plegar (como una carpeta de móvil). Al
    // expandir muestra TODAS las apps; plegada muestra un adelanto. Puede
    // agruparse por categorías (secciones plegables). La carpeta "amplia"
    // (compactFolder=false) conserva el comportamiento clásico con etiquetas.
    const isCompact = settings.compactFolder !== false;

    if (!isCompact) {
        // Carpeta amplia clásica (tiles grandes con etiqueta) — sin cambios de UX.
        return (
            <WidgetShell title={settings.label ?? "Apps"} subtitle={`${apps.length} apps`} icon={LayoutGrid} accent="#39FF14" actions={gear}>
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
                {panel}
                {windowEl}
            </WidgetShell>
        );
    }

    return (
        <CompactFolder
            settings={settings}
            apps={apps}
            gear={gear}
            onOpen={openApp}
            onMenu={openMenu}
            onToggleExpanded={() => patch({ expanded: !settings.expanded })}
            onToggleGroup={(gid, collapsed) => {
                const groups = (settings.groups ?? []).map((g) => g.id === gid ? { ...g, collapsed } : g);
                patch({ groups });
            }}
        >
            {mounted && menu && (
                <ModeMenu app={menu.app} x={menu.x} y={menu.y}
                    onPick={(m) => launch(menu.app, m)} onClose={() => setMenu(null)} />
            )}
            {panel}
            {windowEl}
        </CompactFolder>
    );
}

// ── Carpeta compacta y expandible ────────────────────────────────
// Cabecera con icono, etiqueta, contador y chevron. Plegada: adelanto denso
// (una o dos hileras). Expandida: todas las apps, con animación suave. Puede
// mostrarse agrupada por categorías (secciones plegables independientes).
// Columnas 4–8 según el ancho real medido (useElementSize) → aprovecha el
// espacio sin recortar en cualquier pantalla (móvil → escritorio, VR/AR).
function CompactFolder({
    settings, apps, gear, onOpen, onMenu, onToggleExpanded, onToggleGroup, children,
}: {
    settings: AppLauncherSettings;
    apps: StarseedApp[];
    gear: React.ReactNode;
    onOpen: (a: StarseedApp) => void;
    onMenu: (a: StarseedApp, e: React.MouseEvent) => void;
    onToggleExpanded: () => void;
    onToggleGroup: (groupId: string, collapsed: boolean) => void;
    children?: React.ReactNode;
}) {
    const { ref, size } = useElementSize<HTMLDivElement>();
    const cols = compactFolderColumns(size.width);
    const expanded = !!settings.expanded;

    // Agrupación por categorías. Usa `groups` si existen; si no, agrupa por la
    // categoría declarada de cada app (fallback automático, sin config previa).
    const groups: LauncherGroup[] = useMemo(() => {
        if (!settings.grouped) return [];
        if (settings.groups && settings.groups.length > 0) {
            const known = new Set(settings.groups.flatMap((g) => g.appIds));
            const rest = apps.filter((a) => !known.has(a.id)).map((a) => a.id);
            const base = settings.groups.map((g) => ({
                ...g,
                appIds: g.appIds.filter((id) => apps.some((a) => a.id === id)),
            }));
            if (rest.length) base.push({ id: "__general", label: "General", appIds: rest });
            return base.filter((g) => g.appIds.length > 0);
        }
        // Fallback: agrupa por categoría de la app.
        const byCat = new Map<string, string[]>();
        for (const a of apps) {
            const k = a.category || "otros";
            if (!byCat.has(k)) byCat.set(k, []);
            byCat.get(k)!.push(a.id);
        }
        const LABELS: Record<string, string> = {
            starseed: "StarSeed", sistema: "Sistema", media: "Media",
            utilidad: "Utilidades", creacion: "Creación", otros: "Otras",
        };
        return Array.from(byCat.entries()).map(([k, ids]) => ({ id: k, label: LABELS[k] ?? k, appIds: ids }));
    }, [settings.grouped, settings.groups, apps]);

    // En plegado sin agrupar, mostramos un adelanto: 2 hileras (cols*2).
    const previewCount = Math.max(cols * 2, 8);
    const shownApps = expanded || settings.grouped ? apps : apps.slice(0, previewCount);
    const hiddenCount = apps.length - shownApps.length;

    return (
        <WidgetShell
            title={settings.label ?? "Apps"}
            subtitle={`${apps.length} apps`}
            icon={FolderOpen}
            accent="#39FF14"
            actions={
                <div className="flex items-center gap-1">
                    {gear}
                    <button
                        type="button"
                        onClick={onToggleExpanded}
                        title={expanded ? "Plegar carpeta" : "Expandir carpeta"}
                        aria-label={expanded ? "Plegar carpeta" : "Expandir carpeta"}
                        aria-expanded={expanded}
                        className="grid place-items-center size-7 rounded-full text-muted-foreground/70 hover:text-foreground hover:bg-white/10 transition-colors cursor-pointer"
                    >
                        <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.22 }}>
                            <ChevronDown className="size-4" />
                        </motion.span>
                    </button>
                </div>
            }
        >
            <div ref={ref} className="box-border w-full">
                {apps.length === 0 ? (
                    <div className="grid place-items-center py-6">
                        <p className="text-sm text-muted-foreground">Carpeta vacía.</p>
                    </div>
                ) : settings.grouped ? (
                    <div className="space-y-2.5">
                        {groups.map((g) => {
                            const gApps = g.appIds.map(getApp).filter((a): a is StarseedApp => Boolean(a));
                            const collapsed = !!g.collapsed;
                            return (
                                <div key={g.id} className="rounded-2xl border border-border/30 bg-white/[0.02] p-2">
                                    <button
                                        type="button"
                                        onClick={() => onToggleGroup(g.id, !collapsed)}
                                        className="flex w-full items-center gap-1.5 px-1 py-0.5 text-left cursor-pointer group/gh"
                                        aria-expanded={!collapsed}
                                    >
                                        <motion.span animate={{ rotate: collapsed ? 0 : 90 }} transition={{ duration: 0.2 }}>
                                            <ChevronRight className="size-3.5 text-muted-foreground/70" />
                                        </motion.span>
                                        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/80 group-hover/gh:text-foreground">
                                            {g.label}
                                        </span>
                                        <span className="ml-auto text-[9px] font-bold tabular-nums text-muted-foreground/50">{gApps.length}</span>
                                    </button>
                                    <AnimatePresence initial={false}>
                                        {!collapsed && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: "auto", opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.24, ease: "easeInOut" }}
                                                className="overflow-hidden"
                                            >
                                                <div className="pt-1.5">
                                                    <CompactAppGrid apps={gApps} settings={settings} cols={cols} onOpen={onOpen} onMenu={onMenu} />
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <>
                        <CompactAppGrid apps={shownApps} settings={settings} cols={cols} onOpen={onOpen} onMenu={onMenu} />
                        {!expanded && hiddenCount > 0 && (
                            <button
                                type="button"
                                onClick={onToggleExpanded}
                                className="mt-2 w-full rounded-xl border border-border/40 bg-white/[0.02] py-1.5 text-[11px] font-semibold text-muted-foreground/80 hover:text-foreground hover:bg-white/[0.05] transition-colors cursor-pointer"
                            >
                                Mostrar {hiddenCount} más
                            </button>
                        )}
                    </>
                )}
            </div>
            {children}
        </WidgetShell>
    );
}
