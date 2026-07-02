'use client';

// ════════════════════════════════════════════════════════════════
// StarSeed OS — Contenido de las ventanas del escritorio
// ----------------------------------------------------------------
// Resuelve QUÉ se ve dentro de cada DesktopWindow según contentRef:
//   • app     → iframe defensivo (patrón de app-launch.tsx) o módulo
//   • widget  → widget REAL del sistema (widget-registry, lazy)
//   • file    → motor de contenido existente (ContentViewer, lazy)
//   • browser → navegador con barra de URL + iframe defensivo
//   • folder  → contenido de la carpeta (iconos hijos)
// Todo tolerante a errores: fallbacks explícitos, nunca en blanco.
// ════════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
    ExternalLink, Loader2, Hammer, Globe, RotateCw, ArrowRight, Plus,
    FolderOpen, Trash2, LayoutGrid, FileQuestion, type LucideIcon,
} from "lucide-react";
import { getApp } from "@/components/dashboard/apps/app-catalog";
import type { ContentKind, ContentResource } from "@/components/dashboard/apps/content/content-types";
import { detectKind } from "@/components/dashboard/apps/content/content-types";
import type { DesktopIcon, DesktopWindow, DesktopWindowContentRef } from "./desktop-store";
import { removeIcon, useDesktopsState } from "./desktop-store";
import { DesktopErrorBoundary, DesktopWidgetHost, widgetAccent, widgetLabel } from "./desktop-widget-host";
import { DesktopIconTile } from "./desktop-icon";
import { useOpenDesktopIcon } from "./desktop-open";
import type { WindowChrome } from "./desktop-window";
import { WIDGET_MANIFEST } from "@/components/dashboard/widget-manifest";
import type { WidgetType } from "@/components/dashboard/dashboard-types";

const EMBED_TIMEOUT_MS = 6500;

// Motor de contenido EXISTENTE (visores por tipo), cargado en diferido.
const ContentViewerLazy = dynamic(
    () => import("@/components/dashboard/apps/content/viewer-registry").then((m) => m.ContentViewer),
    {
        ssr: false,
        loading: () => (
            <div className="absolute inset-0 grid place-items-center text-[11px] text-muted-foreground animate-pulse">
                Cargando visor…
            </div>
        ),
    },
);

// ── Chrome (título/acento/icono) por tipo de contenido ───────────
export function resolveWindowChrome(ref: DesktopWindowContentRef): WindowChrome {
    switch (ref.type) {
        case "app": {
            const app = getApp(ref.ref);
            if (app) {
                return {
                    title: app.name,
                    subtitle: app.status === "soon" ? "Módulo en construcción" : "Ventana StarSeed",
                    accent: app.accent,
                    href: app.open.href,
                    iconEl: app.iconUrl
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={app.iconUrl} alt="" className="h-full w-full object-cover" draggable={false} />
                        : <app.icon className="size-3 text-white" strokeWidth={2.2} />,
                };
            }
            return { title: ref.name ?? "App", subtitle: "Ventana StarSeed", accent: "#007FFF", iconEl: <LayoutGrid className="size-3 text-white" /> };
        }
        case "widget": {
            const entry = WIDGET_MANIFEST[ref.ref as WidgetType];
            return {
                title: ref.name ?? widgetLabel(ref.ref),
                subtitle: "Widget del sistema",
                accent: widgetAccent(entry?.category),
                iconEl: <LayoutGrid className="size-3 text-white" strokeWidth={2.2} />,
            };
        }
        case "file":
            return {
                title: ref.name ?? "Archivo",
                subtitle: ref.meta?.kind ? `Archivo · ${ref.meta.kind}` : "Archivo",
                accent: "#38BDF8",
                href: ref.ref || undefined,
                iconEl: <FileQuestion className="size-3 text-white" strokeWidth={2.2} />,
            };
        case "browser":
            return {
                title: ref.name ?? "Navegador",
                subtitle: "Navegador StarSeed",
                accent: "#22D3EE",
                href: ref.ref || undefined,
                iconEl: <Globe className="size-3 text-white" strokeWidth={2.2} />,
            };
        case "folder":
            return {
                title: ref.name ?? "Carpeta",
                subtitle: "Carpeta del escritorio",
                accent: "#FFBF00",
                iconEl: <FolderOpen className="size-3 text-white" strokeWidth={2.2} />,
            };
    }
}

// ── Componente raíz del contenido ────────────────────────────────
export function DesktopWindowContent({
    desktopId, win, onRequestAddInto,
}: {
    desktopId: string;
    win: DesktopWindow;
    /** Abre el catálogo "+ Añadir" apuntando a una carpeta. */
    onRequestAddInto?: (folderId: string) => void;
}): React.ReactElement {
    const ref = win.contentRef;
    switch (ref.type) {
        case "app":
            return <AppContent appId={ref.ref} fallbackName={ref.name} />;
        case "widget":
            return (
                <div className="h-full w-full overflow-auto">
                    <DesktopWidgetHost type={ref.ref} instanceId={win.id} className="min-h-full" />
                </div>
            );
        case "file":
            return <FileContent refData={ref} winId={win.id} />;
        case "browser":
            return <BrowserContent initialUrl={ref.ref} />;
        case "folder":
            return (
                <FolderContent
                    desktopId={desktopId}
                    folderId={ref.ref}
                    onRequestAddInto={onRequestAddInto}
                />
            );
    }
}

// ── Cuerpos auxiliares (fallbacks explícitos, nunca en blanco) ───
function CenterBody({ icon: Icon, title, text, accent, action }: {
    icon: LucideIcon; title: string; text: string; accent: string; action?: React.ReactNode;
}): React.ReactElement {
    return (
        <div className="absolute inset-0 grid place-items-center p-6 text-center">
            <div className="max-w-sm space-y-3">
                <span
                    className="mx-auto grid size-13 place-items-center rounded-2xl border border-white/15"
                    style={{ width: 52, height: 52, background: `linear-gradient(135deg, ${accent}, color-mix(in srgb, ${accent} 35%, transparent))` }}
                >
                    <Icon className="size-6 text-white" />
                </span>
                <h4 className="text-sm font-black">{title}</h4>
                <p className="text-xs leading-relaxed text-muted-foreground">{text}</p>
                {action}
            </div>
        </div>
    );
}

function OpenTabButton({ href, accent, label = "Abrir en pestaña nueva" }: { href: string; accent: string; label?: string }): React.ReactElement {
    return (
        <button
            type="button"
            onClick={() => window.open(href, "_blank", "noopener,noreferrer")}
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold text-white shadow-lg cursor-pointer transition-transform hover:-translate-y-px"
            style={{ background: accent }}
        >
            <ExternalLink className="size-3.5" /> {label}
        </button>
    );
}

// ── APP: iframe defensivo (mismo patrón que app-launch.tsx) ──────
function AppContent({ appId, fallbackName }: { appId: string; fallbackName?: string }): React.ReactElement {
    const router = useRouter();
    const app = getApp(appId);
    const [loaded, setLoaded] = useState(false);
    const [stuck, setStuck] = useState(false);

    const href = app?.open.href;
    const soon = app?.status === "soon";
    const showEmbed = Boolean(app) && !soon && Boolean(href) && app!.open.embeddable !== false;

    useEffect(() => {
        if (!showEmbed) return;
        const t = setTimeout(() => setStuck((s) => (loaded ? s : true)), EMBED_TIMEOUT_MS);
        return () => clearTimeout(t);
    }, [showEmbed, loaded]);

    if (!app) {
        return (
            <CenterBody
                icon={LayoutGrid}
                title={fallbackName ?? "App no disponible"}
                text="Esta app ya no está en el catálogo del sistema. Puedes quitar su icono del escritorio."
                accent="#64748B"
            />
        );
    }

    if (soon) {
        return (
            <CenterBody
                icon={Hammer}
                title={app.name}
                text={`${app.description} — Módulo nativo en construcción.`}
                accent={app.accent}
            />
        );
    }

    if (showEmbed && href) {
        return (
            <>
                <iframe
                    src={href}
                    title={app.name}
                    className="absolute inset-0 h-full w-full border-0 bg-white"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                    onLoad={() => setLoaded(true)}
                />
                {!loaded && !stuck && (
                    <div className="absolute inset-0 grid place-items-center bg-card/80 text-muted-foreground">
                        <span className="inline-flex items-center gap-2 text-xs font-semibold">
                            <Loader2 className="size-4 animate-spin" /> Cargando {app.name}…
                        </span>
                    </div>
                )}
                {stuck && !loaded && (
                    <div className="absolute inset-0 bg-card/95">
                        <CenterBody
                            icon={app.icon}
                            title={app.name}
                            text="Esta app no permite incrustarse aquí (protección de framing). Ábrela en una pestaña nueva para la experiencia completa."
                            accent={app.accent}
                            action={<OpenTabButton href={href} accent={app.accent} />}
                        />
                    </div>
                )}
            </>
        );
    }

    if (app.open.route) {
        const route = app.open.route;
        return (
            <CenterBody
                icon={app.icon}
                title={app.name}
                text={app.description}
                accent={app.accent}
                action={
                    <button
                        type="button"
                        onClick={() => router.push(route)}
                        className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold text-white shadow-lg cursor-pointer transition-transform hover:-translate-y-px"
                        style={{ background: app.accent }}
                    >
                        <ArrowRight className="size-3.5" /> Abrir módulo
                    </button>
                }
            />
        );
    }

    return (
        <CenterBody
            icon={app.icon}
            title={app.name}
            text={app.description}
            accent={app.accent}
            action={href ? <OpenTabButton href={href} accent={app.accent} /> : undefined}
        />
    );
}

// ── FILE: motor de contenido existente (ContentViewer) ───────────
function FileContent({ refData, winId }: { refData: DesktopWindowContentRef; winId: string }): React.ReactElement {
    const resource = useMemo<ContentResource>(() => {
        const url = refData.ref || undefined;
        const hinted = refData.meta?.kind as ContentKind | undefined;
        const kind: ContentKind = hinted ?? (url ? detectKind({ url, name: refData.name }) : "unknown");
        return {
            id: `deskfile-${winId}`,
            kind,
            title: refData.name ?? "Archivo",
            url,
            origin: "library",
        };
    }, [refData, winId]);

    return (
        <div className="relative h-full w-full">
            <DesktopErrorBoundary
                fallback={
                    <CenterBody
                        icon={FileQuestion}
                        title={resource.title}
                        text="El visor no pudo mostrar este archivo aquí."
                        accent="#38BDF8"
                        action={resource.url ? <OpenTabButton href={resource.url} accent="#38BDF8" /> : undefined}
                    />
                }
            >
                <ContentViewerLazy resource={resource} />
            </DesktopErrorBoundary>
        </div>
    );
}

// ── BROWSER: barra de URL + iframe defensivo ─────────────────────
function normalizeWebUrl(raw: string): string {
    const t = (raw || "").trim();
    if (!t) return "https://duckduckgo.com/";
    if (/^https?:\/\//i.test(t)) return t;
    if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/i.test(t)) return `https://${t}`;
    return `https://duckduckgo.com/?q=${encodeURIComponent(t)}`;
}

function BrowserContent({ initialUrl }: { initialUrl: string }): React.ReactElement {
    const [url, setUrl] = useState(() => normalizeWebUrl(initialUrl));
    const [input, setInput] = useState(url);
    const [frameKey, setFrameKey] = useState(0);
    const [loaded, setLoaded] = useState(false);
    const [stuck, setStuck] = useState(false);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        setLoaded(false);
        setStuck(false);
        setDismissed(false);
        const t = setTimeout(() => setStuck(true), EMBED_TIMEOUT_MS);
        return () => clearTimeout(t);
    }, [url, frameKey]);

    const go = () => {
        const next = normalizeWebUrl(input);
        setInput(next);
        if (next === url) setFrameKey((k) => k + 1);
        else setUrl(next);
    };

    return (
        <div className="flex h-full w-full flex-col">
            {/* Barra de URL (glass) */}
            <div className="flex shrink-0 items-center gap-1.5 border-b border-white/10 bg-white/[0.04] px-2 py-1.5">
                <button
                    type="button"
                    onClick={() => setFrameKey((k) => k + 1)}
                    title="Recargar"
                    aria-label="Recargar página"
                    className="grid size-7 place-items-center rounded-full text-muted-foreground/80 transition-colors hover:bg-white/10 hover:text-foreground cursor-pointer"
                >
                    <RotateCw className="size-3.5" />
                </button>
                <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") go(); }}
                    onPointerDown={(e) => e.stopPropagation()}
                    placeholder="Escribe una URL o busca…"
                    spellCheck={false}
                    className="h-7 min-w-0 flex-1 rounded-full border border-white/10 bg-black/40 px-3 text-[11px] font-medium text-foreground outline-none transition-colors focus:border-cyan-400/50"
                />
                <button
                    type="button"
                    onClick={go}
                    title="Ir"
                    aria-label="Ir a la dirección"
                    className="grid size-7 place-items-center rounded-full bg-cyan-500/20 text-cyan-300 transition-colors hover:bg-cyan-500/30 cursor-pointer"
                >
                    <ArrowRight className="size-3.5" />
                </button>
                <button
                    type="button"
                    onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
                    title="Abrir en pestaña nueva"
                    aria-label="Abrir en pestaña nueva"
                    className="grid size-7 place-items-center rounded-full text-muted-foreground/80 transition-colors hover:bg-white/10 hover:text-foreground cursor-pointer"
                >
                    <ExternalLink className="size-3.5" />
                </button>
            </div>

            {/* Marco defensivo */}
            <div className="relative min-h-0 flex-1">
                <iframe
                    key={frameKey}
                    src={url}
                    title="Navegador StarSeed"
                    className="absolute inset-0 h-full w-full border-0 bg-white"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                    onLoad={() => setLoaded(true)}
                />
                {!loaded && !stuck && (
                    <div className="absolute inset-0 grid place-items-center bg-card/80 text-muted-foreground">
                        <span className="inline-flex items-center gap-2 text-xs font-semibold">
                            <Loader2 className="size-4 animate-spin" /> Cargando…
                        </span>
                    </div>
                )}
                {stuck && !loaded && !dismissed && (
                    <div className="absolute inset-0 bg-card/95">
                        <CenterBody
                            icon={Globe}
                            title="Este sitio se resiste"
                            text="Muchos sitios bloquean su incrustación (protección de framing). Puedes abrirlo en una pestaña nueva o seguir esperando."
                            accent="#22D3EE"
                            action={
                                <div className="flex flex-wrap items-center justify-center gap-2">
                                    <OpenTabButton href={url} accent="#22D3EE" />
                                    <button
                                        type="button"
                                        onClick={() => setDismissed(true)}
                                        className="rounded-full border border-white/15 px-4 py-2 text-xs font-bold text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground cursor-pointer"
                                    >
                                        Seguir esperando
                                    </button>
                                </div>
                            }
                        />
                    </div>
                )}
            </div>
        </div>
    );
}

// ── FOLDER: contenido de carpeta (iconos hijos) ──────────────────
function FolderItem({
    child, onOpen, onRemove,
}: {
    child: DesktopIcon;
    onOpen: () => void;
    onRemove: () => void;
}): React.ReactElement {
    const lastTapRef = useRef(0);
    return (
        <div className="group relative flex flex-col items-center rounded-xl p-1.5 transition-colors hover:bg-white/[0.06]">
            <button
                type="button"
                onDoubleClick={onOpen}
                onPointerUp={(e) => {
                    if (e.pointerType !== "touch") return;
                    const now = Date.now();
                    if (now - lastTapRef.current < 350) onOpen();
                    lastTapRef.current = now;
                }}
                className="cursor-pointer"
                title={`Abrir ${child.name}`}
            >
                <DesktopIconTile icon={child} compact />
            </button>
            <button
                type="button"
                onClick={onRemove}
                title="Quitar de la carpeta"
                aria-label={`Quitar ${child.name}`}
                className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full border border-white/20 bg-black/70 text-muted-foreground opacity-0 transition-opacity hover:text-red-300 group-hover:opacity-100 cursor-pointer"
            >
                <Trash2 className="size-3" />
            </button>
        </div>
    );
}

function FolderContent({
    desktopId, folderId, onRequestAddInto,
}: {
    desktopId: string;
    folderId: string;
    onRequestAddInto?: (folderId: string) => void;
}): React.ReactElement {
    const state = useDesktopsState();
    const desktop = state.desktops.find((d) => d.id === desktopId);
    const folder = desktop?.icons.find((i) => i.id === folderId && i.kind === "folder");
    const openIcon = useOpenDesktopIcon(desktopId);
    const children = folder?.children ?? [];

    if (!folder) {
        return (
            <CenterBody
                icon={FolderOpen}
                title="Carpeta no encontrada"
                text="Esta carpeta ya no existe en el escritorio."
                accent="#FFBF00"
            />
        );
    }

    return (
        <div className="flex h-full w-full flex-col">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-white/[0.03] px-3 py-1.5">
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                    {children.length === 0 ? "Carpeta vacía" : `${children.length} elemento${children.length === 1 ? "" : "s"}`}
                </span>
                {onRequestAddInto && (
                    <button
                        type="button"
                        onClick={() => onRequestAddInto(folderId)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/30 bg-amber-300/10 px-2.5 py-1 text-[11px] font-bold text-amber-200 transition-colors hover:bg-amber-300/20 cursor-pointer"
                    >
                        <Plus className="size-3.5" /> Añadir aquí
                    </button>
                )}
            </div>
            {children.length === 0 ? (
                <div className="grid flex-1 place-items-center p-6 text-center">
                    <p className="max-w-[260px] text-xs leading-relaxed text-muted-foreground">
                        Esta carpeta está esperando contenido. Usa <strong>Añadir aquí</strong> para
                        guardar apps, archivos o widgets dentro.
                    </p>
                </div>
            ) : (
                <div className="grid flex-1 auto-rows-min grid-cols-3 gap-1 overflow-y-auto p-3 sm:grid-cols-4 md:grid-cols-5">
                    {children.map((child) => (
                        <FolderItem
                            key={child.id}
                            child={child}
                            onOpen={() => openIcon(child)}
                            onRemove={() => removeIcon(desktopId, child.id)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
