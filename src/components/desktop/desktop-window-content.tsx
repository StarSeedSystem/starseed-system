'use client';

// ════════════════════════════════════════════════════════════════
// StarSeed OS — Contenido de las ventanas del escritorio
// ----------------------------------------------------------------
// Resuelve QUÉ se ve dentro de cada DesktopWindow según contentRef:
//   • app     → iframe defensivo (patrón de app-launch.tsx) o módulo
//   • widget  → widget REAL del sistema (widget-registry, lazy)
//   • file    → motor de contenido existente (ContentViewer, lazy)
//   • browser → navegador con barra de URL + iframe defensivo
//   • folder  → contenido del folder (iconos hijos)
// Todo tolerante a errores: fallbacks explícitos, nunca en blanco.
// ════════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
    ExternalLink, Loader2, Hammer, Globe, RotateCw, ArrowRight,
    LayoutGrid, FileQuestion, StickyNote, FolderOpen, FileCode2, type LucideIcon,
} from "lucide-react";
import { getApp } from "@/components/dashboard/apps/app-catalog";
import type { ContentKind, ContentResource } from "@/components/dashboard/apps/content/content-types";
import { detectKind } from "@/components/dashboard/apps/content/content-types";
import type { DesktopWindow, DesktopWindowContentRef } from "./desktop-store";
import { updateIcon, useDesktopsState, findIconInTree } from "./desktop-store";
import { DesktopErrorBoundary, DesktopWidgetHost, widgetAccent, widgetLabel } from "./desktop-widget-host";
import { DesktopFolderView } from "./desktop-folder-view";
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
                subtitle: ref.meta?.kind === "note"
                    ? "Nota rápida"
                    : ref.meta?.kind ? `Archivo · ${ref.meta.kind}` : "Archivo",
                accent: ref.meta?.kind === "note" ? "#FBBF24" : "#38BDF8",
                href: ref.meta?.kind === "note" ? undefined : (ref.ref || undefined),
                iconEl: ref.meta?.kind === "note"
                    ? <StickyNote className="size-3 text-white" strokeWidth={2.2} />
                    : <FileQuestion className="size-3 text-white" strokeWidth={2.2} />,
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
                title: ref.name ?? "Folder",
                subtitle: "Folder del escritorio",
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
    /** Abre el catálogo "+ Añadir" apuntando a un folder. */
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
            if (ref.meta?.kind === "note" && ref.meta?.noteId) {
                return <NoteContent desktopId={desktopId} noteId={ref.meta.noteId} />;
            }
            // "Editar" (H-2) → editor de texto/código REAL, no un visor.
            if (ref.meta?.mode === "edit" && ref.meta?.iconId) {
                return <TextEditorContent desktopId={desktopId} iconId={ref.meta.iconId} url={ref.ref} />;
            }
            return <FileContent refData={ref} winId={win.id} />;
        case "browser":
            return <BrowserContent initialUrl={ref.ref} />;
        case "folder":
            return (
                <DesktopFolderView
                    desktopId={desktopId}
                    rootFolderId={ref.ref}
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

// ── Apps NATIVAS del OS: se montan DE VERDAD dentro de la ventana ──
// Adenda 69 · H-1. Antes, una app con `open.primary: "route"` (que son CASI
// TODAS las nativas del OS) ni siquiera llegaba aquí: el icono hacía
// `router.push(route)` y te sacaba del escritorio. Y si llegaba, la ventana
// solo pintaba una tarjeta con un botón «Abrir módulo» — que también te sacaba.
//
// Las apps del OS son componentes React: pueden vivir DENTRO de la ventana,
// como cualquier widget. Este mapa (extensible) es el registro id → módulo real.
// Regla: si una app está aquí, su ventana muestra la APP DE VERDAD; el `href`
// externo queda como atajo en la barra de título, nunca como sustituto.
function lazyApp(load: () => Promise<{ default: React.ComponentType }>, label: string): React.ComponentType {
    return dynamic(load, {
        ssr: false,
        loading: () => (
            <div className="absolute inset-0 grid place-items-center text-[11px] text-muted-foreground animate-pulse">
                Cargando {label}…
            </div>
        ),
    });
}

const NATIVE_APP_VIEWS: Record<string, React.ComponentType> = {
    audiomorphic: lazyApp(
        () => import("@/components/dashboard/apps/audiomorphic/audiomorphic-app").then((m) => ({ default: m.AudiomorphicApp })),
        "visualizador",
    ),
    omnifrecuencias: lazyApp(
        () => import("@/components/dashboard/apps/omnifrecuencias/omnifrecuencias-app").then((m) => ({ default: m.OmnifrecuenciasApp })),
        "frecuencias",
    ),
    camara: lazyApp(
        () => import("@/components/camera/camera-app").then((m) => ({ default: m.CameraApp })),
        "cámara",
    ),
    galeria: lazyApp(
        () => import("@/components/gallery/gallery-app").then((m) => ({ default: m.GalleryApp })),
        "galería",
    ),
    clima: lazyApp(
        () => import("@/modules/weather/views/atmosphere-view"),
        "atmósfera",
    ),
    immersive: lazyApp(
        () => import("@/components/dashboard/apps/immersive/immersive-space").then((m) => ({ default: m.ImmersiveSpace })),
        "espacio inmersivo",
    ),
    messages: lazyApp(() => import("@/app/(main)/messages/page"), "mensajes"),
    library: lazyApp(() => import("@/app/(app)/library/page"), "biblioteca"),
    agent: lazyApp(() => import("@/app/(app)/agent/page"), "agentes"),
    network: lazyApp(() => import("@/app/(app)/network/page"), "red"),
    // `nexus` (portal de marca externo) ya NO es una vista nativa: la antigua
    // página `/nexus` se fusionó en la pestaña «Nexus» de Astraura IA y su ruta
    // es ahora un redirect. El portal de marca se abre como iframe externo.
};

// ── APP: nativa (montada) · externa (iframe defensivo) · ruta · enlace ──
function AppContent({ appId, fallbackName }: { appId: string; fallbackName?: string }): React.ReactElement {
    const router = useRouter();
    const app = getApp(appId);
    const [loaded, setLoaded] = useState(false);
    const [stuck, setStuck] = useState(false);

    const NativeView = NATIVE_APP_VIEWS[appId];
    // Basta con estar en el registro de vistas nativas para montarse como módulo
    // del OS; `status` ya no decide (solo "soon" se queda fuera). Las apps de
    // marca externas (p. ej. StarSeed Nexus) no están en el registro: se embeben.
    const isNative = Boolean(app) && app!.status !== "soon" && Boolean(NativeView);

    const href = app?.open.href;
    const soon = app?.status === "soon";
    // OJO: una app NATIVA puede conservar `href` (p. ej. Audiomorphic mantiene el
    // enlace a la app original por su modo VR/AR). Sin este `!isNative`, el iframe
    // externo ganaría al componente nativo y volveríamos justo al problema que
    // este port venía a resolver.
    const showEmbed = Boolean(app) && !isNative && !soon && Boolean(href) && app!.open.embeddable !== false;

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

    // App PORTADA al OS → se monta aquí mismo, en la ventana. Nada de iframes.
    // `Suspense`: varias de estas páginas usan useSearchParams() y exigen un
    // boundary propio cuando se montan fuera de su ruta.
    if (isNative && NativeView) {
        return (
            <div className="absolute inset-0 overflow-auto">
                <DesktopErrorBoundary
                    fallback={
                        <CenterBody
                            icon={app.icon}
                            title={app.name}
                            text="El módulo no pudo montarse dentro de la ventana."
                            accent={app.accent}
                            action={
                                app.open.route ? (
                                    <button
                                        type="button"
                                        onClick={() => router.push(app.open.route!)}
                                        className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold text-white shadow-lg cursor-pointer transition-transform hover:-translate-y-px"
                                        style={{ background: app.accent }}
                                    >
                                        <ArrowRight className="size-3.5" /> Abrir a pantalla completa
                                    </button>
                                ) : undefined
                            }
                        />
                    }
                >
                    <React.Suspense
                        fallback={
                            <div className="absolute inset-0 grid place-items-center text-[11px] text-muted-foreground animate-pulse">
                                Cargando {app.name}…
                            </div>
                        }
                    >
                        <NativeView />
                    </React.Suspense>
                </DesktopErrorBoundary>
            </div>
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

// ── NOTE: editor de nota rápida (texto embebido, guardado en vivo) ──
function NoteContent({ desktopId, noteId }: { desktopId: string; noteId: string }): React.ReactElement {
    const state = useDesktopsState();
    const desktop = state.desktops.find((d) => d.id === desktopId);
    const note = desktop ? findIconInTree(desktop.icons, noteId) : null;
    const [draft, setDraft] = useState(note?.text ?? "");
    const [saved, setSaved] = useState(true);
    const skipRef = useRef(true);

    // Autoguardado con debounce.
    useEffect(() => {
        if (skipRef.current) { skipRef.current = false; return; }
        setSaved(false);
        const t = setTimeout(() => {
            updateIcon(desktopId, noteId, { text: draft });
            setSaved(true);
        }, 500);
        return () => clearTimeout(t);
    }, [draft, desktopId, noteId]);

    if (!note) {
        return <CenterBody icon={StickyNote} title="Nota no encontrada" text="Esta nota ya no existe en el escritorio." accent="#FBBF24" />;
    }

    return (
        <div className="flex h-full w-full flex-col bg-gradient-to-b from-amber-500/[0.04] to-transparent">
            <div className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-white/[0.03] px-3 py-1.5">
                <StickyNote className="size-3.5 text-amber-300" />
                <span className="text-[11px] font-bold text-amber-100/90">{note.name}</span>
                <span className={cn("ml-auto text-[10px] font-semibold transition-colors", saved ? "text-emerald-300/80" : "text-muted-foreground/70")}>
                    {saved ? "Guardado" : "Guardando…"}
                </span>
            </div>
            <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
                placeholder="Escribe tu nota… se guarda sola."
                spellCheck={false}
                className="min-h-0 flex-1 resize-none bg-transparent p-4 text-[13px] leading-relaxed text-foreground/90 outline-none placeholder:text-muted-foreground/50"
            />
        </div>
    );
}

// ── FILE · EDITAR: editor de texto/código real (H-2) ─────────────
// Honesto sobre dónde guarda: el contenido editado se persiste en el ICONO del
// escritorio (`icon.text`), que es soberano y del usuario. Un archivo remoto de
// la Biblioteca se CARGA aquí (fetch) y, al guardar, queda una copia editable
// en tu escritorio — nunca se finge escribir en el origen remoto (no podemos).
function TextEditorContent({ desktopId, iconId, url }: {
    desktopId: string; iconId: string; url?: string;
}): React.ReactElement {
    const state = useDesktopsState();
    const desktop = state.desktops.find((d) => d.id === desktopId);
    const icon = desktop ? findIconInTree(desktop.icons, iconId) : null;

    const [draft, setDraft] = useState<string>(icon?.text ?? "");
    const [status, setStatus] = useState<"idle" | "loading" | "saving" | "saved" | "remote-error">(
        icon?.text !== undefined ? "saved" : url ? "loading" : "saved",
    );
    const [detached, setDetached] = useState(false);
    const loadedRef = useRef(icon?.text !== undefined);
    const skipRef = useRef(true);

    // Carga diferida del contenido remoto (solo si el icono no lo trae ya).
    useEffect(() => {
        if (loadedRef.current || !url) return;
        let alive = true;
        (async () => {
            try {
                const res = await fetch(url);
                if (!res.ok) throw new Error(String(res.status));
                const text = await res.text();
                if (!alive) return;
                loadedRef.current = true;
                skipRef.current = true;
                setDraft(text);
                setStatus("saved");
            } catch {
                if (alive) setStatus("remote-error");
            }
        })();
        return () => { alive = false; };
    }, [url]);

    // Autoguardado con debounce (mismo patrón que la nota rápida).
    useEffect(() => {
        if (skipRef.current) { skipRef.current = false; return; }
        if (!loadedRef.current) return;
        setStatus("saving");
        const t = setTimeout(() => {
            updateIcon(desktopId, iconId, { text: draft });
            setDetached(Boolean(url));
            setStatus("saved");
        }, 500);
        return () => clearTimeout(t);
    }, [draft, desktopId, iconId, url]);

    if (!icon) {
        return <CenterBody icon={FileQuestion} title="Archivo no encontrado" text="Este icono ya no existe en el escritorio." accent="#38BDF8" />;
    }
    if (status === "remote-error") {
        return (
            <CenterBody
                icon={FileQuestion}
                title={icon.name}
                text="No se pudo cargar el contenido de este archivo para editarlo (el origen no permite leerlo desde aquí). Puedes abrirlo en su visor."
                accent="#38BDF8"
                action={url ? <OpenTabButton href={url} accent="#38BDF8" label="Abrir el original" /> : undefined}
            />
        );
    }

    return (
        <div className="flex h-full w-full flex-col">
            <div className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-white/[0.03] px-3 py-1.5">
                <FileCode2 className="size-3.5 text-emerald-300" />
                <span className="min-w-0 truncate text-[11px] font-bold text-emerald-100/90">{icon.name}</span>
                {detached && (
                    <span className="shrink-0 rounded-full border border-white/12 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-200/90">
                        Copia editable
                    </span>
                )}
                <span className={cn(
                    "ml-auto shrink-0 text-[10px] font-semibold transition-colors",
                    status === "saved" ? "text-emerald-300/80" : "text-muted-foreground/70",
                )}>
                    {status === "loading" ? "Cargando…" : status === "saving" ? "Guardando…" : "Guardado"}
                </span>
            </div>
            <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
                spellCheck={false}
                placeholder={status === "loading" ? "" : "Escribe… se guarda solo en tu escritorio."}
                className="min-h-0 flex-1 resize-none bg-transparent p-4 font-mono text-[12px] leading-relaxed text-foreground/90 outline-none placeholder:text-muted-foreground/50"
            />
        </div>
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

// El folder ahora se renderiza con <DesktopFolderView /> (explorador
// ramificado con breadcrumb, rejilla/lista, tipos de archivo y anidamiento).
