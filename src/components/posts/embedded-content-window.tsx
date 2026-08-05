"use client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * EmbeddedContentWindow — VENTANA INCRUSTADA universal para adjuntos de post
 * -----------------------------------------------------------------------------
 * Componente reutilizable (rich-post-card, post-view, attachment-carousel) que
 * ofrece las TRES formas de abrir contenido completo sin perder el contexto de
 * la publicación:
 *
 *   (a) VENTANA DENTRO de la publicación — panel embebido inline que crece
 *       dentro de la tarjeta, con barra propia (minimizar/pantalla completa/
 *       abrir en pestaña/cerrar) — como una ventana del SO incrustada.
 *   (b) PANTALLA COMPLETA — overlay que cubre el viewport con la misma barra.
 *   (c) OTRA PESTAÑA — `window.open(url, '_blank')` cuando hay URL/ruta.
 *
 * Renderiza por FORMATO:
 *   · imagen / vídeo / audio            → reproductores nativos.
 *   · texto / markdown / código         → `MessageRenderer` (markdown, tablas,
 *     código con resaltado + copiar, JSON plegable, SVG seguro — se reutiliza
 *     tal cual, sin duplicar esa lógica).
 *   · PDF                               → `<object>` con fallback de descarga.
 *   · página/ruta interna (same-origin) → iframe de confianza (sin sandbox).
 *   · url externa                       → iframe con `sandbox` + aviso/enlace
 *     de reserva "Abrir en pestaña" (algunos sitios bloquean el embed).
 *   · programa/app instalada            → iframe a su ruta (misma vía que
 *     "página interna").
 *   · programa/app SIN url, con `content` → código ejecutable en línea: iframe
 *     `srcdoc` con sandbox mínimo (Adenda "Lienzo · Creador de Layouts").
 *   · pizarra/servidor                  → tratados como "página interna" (son
 *     rutas propias del OS) con fallback a enlace si no hay URL embebible.
 *   · 3D / app sin URL / genérico       → delega en `FilePreview` (reutiliza
 *     su visor 3D, tarjeta de app y tarjeta de descarga genérica).
 *
 * Estados de la ventana: "collapsed" (fila compacta, igual que hoy) → "open"
 * (panel embebido inline) ⇄ "fullscreen" (overlay) → "minimized" (sólo barra).
 * "Cerrar" siempre vuelve a "collapsed"; SSR-safe; nunca lanza.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
    Maximize2, Minimize2, Expand, Shrink, ExternalLink, X, FileImage, FileVideo, FileAudio,
    FileType2, FileCode2, LayoutDashboard, Globe, File as FileIcon, AppWindow,
    Server as ServerIcon, Cpu, Sparkles, FileText, AlertTriangle, Users2, CalendarDays, Rss,
    type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FilePreview, detectFormat, type FileLike } from "@/components/files/file-preview";
import { MessageRenderer } from "@/components/aurora/message-renderer";
import { useModalA11y } from "@/hooks/use-modal-a11y";
import type { MainRatio } from "@/lib/publish/publish";

// ───────────────────────────── Tipos públicos ───────────────────────────────

export type EmbedContext = "feed" | "page";

/** Forma flexible de un adjunto a mostrar. Compatible con `PostAttachment`,
 *  `PostContentAttachment`, `CommentAttachment` y `UniversalAttachment` — todos
 *  comparten estos campos base, así que convertir entre ellos es directo. */
export interface EmbeddedItem {
    id?: string;
    /** imagen · video · audio · pdf · archivo · markdown · codigo · texto ·
     *  enlace · pagina · app · programa · widget · pizarra · servidor ·
     *  agente · skill · … (categoría amplia; se resuelve de forma tolerante). */
    kind: string;
    url?: string | null;
    name?: string | null;
    title?: string | null;
    description?: string | null;
    mime?: string | null;
    thumbnail?: string | null;
    /** Contenido en línea (markdown/código sin URL). */
    content?: string | null;
    /** Lenguaje para bloques de código. */
    language?: string | null;
}

export interface EmbeddedContentWindowProps {
    item: EmbeddedItem;
    /** Contexto de tamaño máximo: "feed" (compacto) o "page" (página de post, más amplio). */
    context?: EmbedContext;
    /** Proporción de la vista principal cuando está abierta. */
    ratio?: MainRatio;
    className?: string;
    /** Arranca ya expandida en línea (por defecto: fila compacta colapsada). */
    defaultOpen?: boolean;
}

// ───────────────────────────── Estrategia de render ─────────────────────────

type Strategy =
    | "image" | "video" | "audio" | "pdf" | "text"
    | "iframe-trusted" | "iframe-sandboxed" | "code-sandbox" | "generic";

/** Adjuntos que son "superficies" del propio SO: se embeben como ruta/iframe. */
const EMBEDDABLE_KINDS = new Set([
    "pagina", "app", "programa", "widget", "pizarra", "servidor", "agente", "skill",
    // Referencias de "Contenido de la red" (jul-2026 · mensajes/comentarios/correos,
    // @/lib/files/network-content-ref.ts): grupo/evento/publicación son también
    // rutas internas del OS — se embeben igual que "pagina" (si son un
    // servidor/espacio vivo, la propia ruta embebida ya muestra su tiempo real).
    "grupo", "evento", "publicacion",
]);

/** Estrategias a las que tiene sentido aplicar una proporción fija (recorte). */
const BOXABLE: ReadonlySet<Strategy> = new Set(["image", "video", "pdf", "iframe-trusted", "iframe-sandboxed", "code-sandbox"]);

const RATIO_CLASS: Partial<Record<MainRatio, string>> = {
    "1:1": "aspect-square",
    "4:5": "aspect-[4/5]",
    "16:9": "aspect-video",
};

const OS_KIND_ICON: Record<string, LucideIcon> = {
    pagina: FileText,
    app: AppWindow,
    programa: AppWindow,
    widget: LayoutDashboard,
    pizarra: LayoutDashboard,
    servidor: ServerIcon,
    agente: Cpu,
    skill: Sparkles,
    grupo: Users2,
    evento: CalendarDays,
    publicacion: Rss,
};

/** ¿Este adjunto es una "superficie" embebible del propio SO (página/app/pizarra…) con URL? */
export function isEmbeddableSurface(item: EmbeddedItem): boolean {
    return EMBEDDABLE_KINDS.has((item.kind || "").toLowerCase()) && Boolean((item.url || "").trim());
}

function isInternalPath(url: string): boolean {
    if (!url) return false;
    if (url.startsWith("/")) return true;
    if (typeof window === "undefined") return false;
    try {
        return new URL(url, window.location.origin).origin === window.location.origin;
    } catch {
        return false;
    }
}

export function toFileLike(item: EmbeddedItem): FileLike {
    return {
        url: item.url ?? undefined,
        name: item.name ?? undefined,
        mime: item.mime ?? undefined,
        type: item.kind ?? undefined,
        thumbnail: item.thumbnail ?? undefined,
        content: item.content ?? undefined,
        language: item.language ?? undefined,
        description: item.description ?? undefined,
    };
}

export function resolveStrategy(item: EmbeddedItem): Strategy {
    const kind = (item.kind || "").toLowerCase();
    const url = (item.url || "").trim();

    // NUEVO · código ejecutable EN LÍNEA (HTML/CSS/JS completo, sin URL propia):
    // vista previa sandbox real vía `srcdoc` (Adenda "Lienzo · Creador de
    // Layouts / Modo Código" — "posibilidades infinitas de código"). No compite
    // con "codigo"/"texto" (fragmentos de sólo lectura → MessageRenderer) ni con
    // "programa"+url (iframe de siempre, sin cambios): sólo aplica cuando NO hay
    // url y SÍ hay `content` (el documento HTML autocontenido a ejecutar).
    if ((kind === "programa" || kind === "app") && !url && (item.content || "").trim()) {
        return "code-sandbox";
    }

    if (EMBEDDABLE_KINDS.has(kind) && url) {
        return isInternalPath(url) ? "iframe-trusted" : "iframe-sandboxed";
    }
    // Categorías textuales explícitas: siempre al visor de texto, aunque la URL
    // no tenga una extensión reconocible (p. ej. un snippet servido sin `.md`).
    if (kind === "texto" || kind === "markdown" || kind === "codigo") return "text";

    const fmt = detectFormat(toFileLike(item));
    if (fmt === "image") return "image";
    if (fmt === "video") return "video";
    if (fmt === "audio") return "audio";
    if (fmt === "pdf") return "pdf";
    if (fmt === "markdown" || fmt === "code") return "text";
    if (fmt === "link" && /^https?:\/\//i.test(url)) return "iframe-sandboxed";
    return "generic"; // model3d, app sin URL, enlace sin http(s), genérico
}

export function iconFor(item: EmbeddedItem, strategy?: Strategy): LucideIcon {
    const kind = (item.kind || "").toLowerCase();
    if (OS_KIND_ICON[kind]) return OS_KIND_ICON[kind];
    switch (strategy ?? resolveStrategy(item)) {
        case "image": return FileImage;
        case "video": return FileVideo;
        case "audio": return FileAudio;
        case "pdf": return FileType2;
        case "text": return FileCode2;
        case "iframe-trusted": return LayoutDashboard;
        case "iframe-sandboxed": return Globe;
        default: return FileIcon;
    }
}

export function titleOf(item: EmbeddedItem): string {
    if (item.title) return item.title;
    if (item.name) return item.name;
    if (item.url) {
        try {
            const p = new URL(item.url, typeof window !== "undefined" ? window.location.origin : "https://x.invalid");
            const last = p.pathname.split("/").filter(Boolean).pop();
            if (last) return decodeURIComponent(last);
            return p.hostname;
        } catch {
            /* url no parseable: usa fallback genérico */
        }
    }
    return "Contenido adjunto";
}

// ───────────────────────────── Tamaños por contexto ─────────────────────────

const FEED_CAP = "max-h-[65vh]";
const PAGE_CAP = "max-h-[80vh]";

function frameContainerClass(boxed: boolean, ratio: MainRatio, context: EmbedContext, scrollable: boolean): string {
    if (boxed) {
        return cn("relative w-full overflow-hidden rounded-xl bg-black/30", RATIO_CLASS[ratio]);
    }
    const cap = context === "feed" ? FEED_CAP : PAGE_CAP;
    return cn("w-full rounded-xl", cap, scrollable ? "overflow-y-auto" : "overflow-hidden");
}

function mediaClass(boxed: boolean, context: EmbedContext): string {
    if (boxed) return "absolute inset-0 h-full w-full object-cover bg-black";
    const cap = context === "feed" ? FEED_CAP : PAGE_CAP;
    return cn("w-full object-contain bg-black/40", cap);
}

function fillClass(boxed: boolean, context: EmbedContext): string {
    if (boxed) return "absolute inset-0 h-full w-full";
    return cn("w-full", context === "feed" ? "h-[55vh]" : "h-[70vh]");
}

// ───────────────────────────── Cuerpos por formato ──────────────────────────

function GenericFallback({ item }: { item: EmbeddedItem }) {
    return (
        <div className="p-3">
            <FilePreview file={toFileLike(item)} context="post" actions={false} />
        </div>
    );
}

function TextBody({ item }: { item: EmbeddedItem }) {
    const [text, setText] = useState(item.content ?? "");
    const [loading, setLoading] = useState(!item.content && !!item.url);
    const fmt = useMemo(() => detectFormat(toFileLike(item)), [item]);

    useEffect(() => {
        let active = true;
        if (!item.content && item.url) {
            setLoading(true);
            fetch(item.url)
                .then((r) => (r.ok ? r.text() : Promise.reject(new Error("fetch"))))
                .then((t) => {
                    if (active) {
                        setText(t.slice(0, 40000));
                        setLoading(false);
                    }
                })
                .catch(() => {
                    if (active) setLoading(false);
                });
        } else {
            setText(item.content ?? "");
        }
        return () => {
            active = false;
        };
    }, [item.url, item.content]);

    if (loading) return <div className="h-32 w-full animate-pulse rounded-xl bg-white/5" />;
    if (!text.trim()) {
        return <p className="p-4 text-sm italic text-white/40">Documento vacío.</p>;
    }

    const isCode = fmt === "code" || (item.kind || "").toLowerCase() === "codigo";
    const wrapped = isCode ? "```" + (item.language || "") + "\n" + text + "\n```" : text;

    return (
        <div className="w-full p-3">
            <MessageRenderer text={wrapped} media={false} />
        </div>
    );
}

function AudioBody({ item }: { item: EmbeddedItem }) {
    if (!item.url) return <GenericFallback item={item} />;
    return (
        <div className="flex w-full flex-col items-center justify-center gap-3 p-6">
            <span className="grid size-14 shrink-0 place-items-center rounded-2xl border border-violet-400/30 bg-violet-500/10">
                <FileAudio className="size-7 text-violet-300" />
            </span>
            <p className="max-w-full truncate text-sm font-semibold text-white/85">{titleOf(item)}</p>
            <audio src={item.url} controls preload="metadata" className="w-full max-w-md" />
        </div>
    );
}

function PdfBody({ item, boxed, context }: { item: EmbeddedItem; boxed: boolean; context: EmbedContext }) {
    return (
        <object data={item.url || ""} type="application/pdf" className={cn("bg-white", fillClass(boxed, context))}>
            <div className="grid h-full place-items-center gap-2 bg-black/40 p-6 text-center">
                <FileType2 className="size-7 text-rose-300" />
                <p className="text-xs text-white/60">Tu navegador no puede incrustar este PDF.</p>
                <a
                    href={item.url || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-400/40 bg-rose-500/15 px-3 py-1.5 text-[11px] font-bold text-rose-200 hover:bg-rose-500/25"
                >
                    <ExternalLink className="size-3.5" /> Abrir PDF
                </a>
            </div>
        </object>
    );
}

function TrustedIframeBody({ item, boxed, context }: { item: EmbeddedItem; boxed: boolean; context: EmbedContext }) {
    return (
        <iframe
            src={item.url || ""}
            className={cn("border-0 bg-white/[0.03]", fillClass(boxed, context))}
            title={titleOf(item)}
        />
    );
}

function SandboxedIframeBody({ item, boxed, context }: { item: EmbeddedItem; boxed: boolean; context: EmbedContext }) {
    const [loaded, setLoaded] = useState(false);
    const [slow, setSlow] = useState(false);
    const src = item.url || "";

    useEffect(() => {
        setLoaded(false);
        setSlow(false);
        const t = window.setTimeout(() => setSlow(true), 3500);
        return () => window.clearTimeout(t);
    }, [src]);

    return (
        <div className={cn("relative", fillClass(boxed, context))}>
            <iframe
                src={src}
                onLoad={() => setLoaded(true)}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
                className="h-full w-full border-0 bg-white"
                title={titleOf(item)}
            />
            {!loaded && slow && (
                <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
                    <div className="pointer-events-auto flex flex-col items-center gap-2 rounded-xl border border-white/10 bg-black/80 p-4 text-center">
                        <AlertTriangle className="size-5 text-amber-300" />
                        <p className="text-xs text-white/70">Este sitio puede bloquear la vista incrustada.</p>
                        <a
                            href={src}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-3 py-1.5 text-[11px] font-bold text-cyan-200 hover:bg-cyan-500/25"
                        >
                            <ExternalLink className="size-3.5" /> Abrir en una pestaña
                        </a>
                    </div>
                </div>
            )}
            <a
                href={src}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 rounded-md border border-white/10 bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white/60 backdrop-blur-sm transition-colors hover:text-white"
            >
                <ExternalLink className="size-2.5" /> ¿No carga? Ábrelo en pestaña
            </a>
        </div>
    );
}

/** Código ejecutable en línea: iframe `srcdoc` con el sandbox MÁS estricto
 *  posible (sólo `allow-scripts`, sin `allow-same-origin`) — el contenido es
 *  HTML/CSS/JS arbitrario escrito por el autor (o generado por Aurora), así que
 *  se ejecuta en un origen opaco sin acceso a cookies/storage del sitio. */
function CodeSandboxBody({ item, boxed, context }: { item: EmbeddedItem; boxed: boolean; context: EmbedContext }) {
    return (
        <iframe
            srcDoc={item.content || ""}
            sandbox="allow-scripts"
            className={cn("border-0 bg-white", fillClass(boxed, context))}
            title={titleOf(item)}
        />
    );
}

function Body({ item, strategy, ratio, context }: { item: EmbeddedItem; strategy: Strategy; ratio: MainRatio; context: EmbedContext }) {
    const boxed = BOXABLE.has(strategy) && (ratio === "1:1" || ratio === "4:5" || ratio === "16:9");
    const scrollable = strategy === "text" || strategy === "generic";
    const containerClass = frameContainerClass(boxed, ratio, context, scrollable);

    let inner: ReactNode;
    switch (strategy) {
        case "image":
            inner = item.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.url} alt={titleOf(item)} loading="lazy" className={mediaClass(boxed, context)} />
            ) : <GenericFallback item={item} />;
            break;
        case "video":
            inner = item.url ? (
                <video
                    src={item.url}
                    poster={item.thumbnail || undefined}
                    controls
                    playsInline
                    preload="metadata"
                    className={mediaClass(boxed, context)}
                />
            ) : <GenericFallback item={item} />;
            break;
        case "audio":
            inner = <AudioBody item={item} />;
            break;
        case "pdf":
            inner = item.url ? <PdfBody item={item} boxed={boxed} context={context} /> : <GenericFallback item={item} />;
            break;
        case "text":
            inner = <TextBody item={item} />;
            break;
        case "iframe-trusted":
            inner = item.url ? <TrustedIframeBody item={item} boxed={boxed} context={context} /> : <GenericFallback item={item} />;
            break;
        case "iframe-sandboxed":
            inner = item.url ? <SandboxedIframeBody item={item} boxed={boxed} context={context} /> : <GenericFallback item={item} />;
            break;
        case "code-sandbox":
            inner = (item.content || "").trim() ? <CodeSandboxBody item={item} boxed={boxed} context={context} /> : <GenericFallback item={item} />;
            break;
        default:
            inner = <GenericFallback item={item} />;
    }

    return <div className={containerClass}>{inner}</div>;
}

// ───────────────────────────── Barra de ventana (chrome) ────────────────────

function HeaderBtn({
    title, onClick, icon: Icon, disabled,
}: { title: string; onClick: () => void; icon: LucideIcon; disabled?: boolean }) {
    return (
        <button
            type="button"
            title={title}
            aria-label={title}
            disabled={disabled}
            onClick={onClick}
            className={cn(
                "grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-white/50 transition-colors duration-200 hover:bg-white/10 hover:text-white/90",
                disabled && "cursor-not-allowed opacity-30 hover:bg-transparent hover:text-white/50",
            )}
        >
            <Icon className="size-3.5" />
        </button>
    );
}

function WindowHeader({
    item, strategy, fullscreen, minimized, canOpenTab,
    onMinimize, onToggleFullscreen, onOpenTab, onClose, onRestore,
}: {
    item: EmbeddedItem;
    strategy: Strategy;
    fullscreen: boolean;
    minimized: boolean;
    canOpenTab: boolean;
    onMinimize: () => void;
    onToggleFullscreen: () => void;
    onOpenTab: () => void;
    onClose: () => void;
    onRestore: () => void;
}) {
    const KindIcon = iconFor(item, strategy);
    return (
        <div
            className={cn(
                "flex items-center gap-2 border-white/10 bg-white/[0.04] px-3 py-2",
                !minimized && "border-b",
                minimized && "cursor-pointer hover:bg-white/[0.06]",
            )}
            onClick={minimized ? onRestore : undefined}
            role={minimized ? "button" : undefined}
            title={minimized ? "Restaurar" : undefined}
        >
            <KindIcon className="size-3.5 shrink-0 text-cyan-300/80" />
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-white/80">
                {titleOf(item)}
            </span>
            <div className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                {minimized ? (
                    <HeaderBtn title="Restaurar" onClick={onRestore} icon={Expand} />
                ) : (
                    <>
                        <HeaderBtn title="Minimizar" onClick={onMinimize} icon={Minimize2} />
                        <HeaderBtn
                            title={fullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
                            onClick={onToggleFullscreen}
                            icon={fullscreen ? Shrink : Expand}
                        />
                    </>
                )}
                <HeaderBtn title="Abrir en pestaña" onClick={onOpenTab} icon={ExternalLink} disabled={!canOpenTab} />
                <HeaderBtn title="Cerrar" onClick={onClose} icon={X} />
            </div>
        </div>
    );
}

// ───────────────────────────── Fila colapsada (estado inicial) ─────────────

function CollapsedRow({ item, strategy, onExpand, className }: { item: EmbeddedItem; strategy: Strategy; onExpand: () => void; className?: string }) {
    const KindIcon = iconFor(item, strategy);
    return (
        <div className={cn("overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]", className)}>
            <button
                type="button"
                onClick={onExpand}
                className="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
            >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                    <KindIcon className="size-3.5 shrink-0 text-white/50" />
                    <span className="min-w-0 truncate text-xs font-semibold text-white/75">
                        {titleOf(item)}
                    </span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-cyan-300/70">
                    <Maximize2 className="size-3" />
                    Expandir
                </span>
            </button>
        </div>
    );
}

// ───────────────────────────── Componente raíz ──────────────────────────────

type WinState = "collapsed" | "open" | "minimized" | "fullscreen";

export function EmbeddedContentWindow({
    item, context = "feed", ratio = "auto", className, defaultOpen = false,
}: EmbeddedContentWindowProps) {
    const [state, setState] = useState<WinState>(defaultOpen ? "open" : "collapsed");
    const fullscreenRef = useRef<HTMLDivElement>(null);
    // Adenda 142: a11y del overlay a pantalla completa — foco inicial, trampa
    // de Tab y Escape (no gestionado hasta ahora). "Cerrar" con Escape sale de
    // pantalla completa (vuelve a "open"), igual que el botón Shrink, sin
    // colapsar la tarjeta ni perder el contenido incrustado.
    useModalA11y({ open: state === "fullscreen", onClose: () => setState("open"), containerRef: fullscreenRef });
    const strategy = useMemo(
        () => resolveStrategy(item),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [item.kind, item.url, item.mime, item.name, item.content, item.language],
    );
    const canOpenTab = Boolean(item.url);

    const openTab = () => {
        if (item.url && typeof window !== "undefined") {
            window.open(item.url, "_blank", "noopener,noreferrer");
        }
    };

    if (state === "collapsed") {
        return <CollapsedRow item={item} strategy={strategy} onExpand={() => setState("open")} className={className} />;
    }

    if (state === "minimized") {
        return (
            <div className={cn("overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]", className)}>
                <WindowHeader
                    item={item}
                    strategy={strategy}
                    fullscreen={false}
                    minimized
                    canOpenTab={canOpenTab}
                    onMinimize={() => setState("minimized")}
                    onToggleFullscreen={() => setState("open")}
                    onOpenTab={openTab}
                    onClose={() => setState("collapsed")}
                    onRestore={() => setState("open")}
                />
            </div>
        );
    }

    const bodyNode = <Body item={item} strategy={strategy} ratio={ratio} context={context} />;

    if (state === "fullscreen") {
        return (
            <>
                {/* Mantiene el hueco en el flujo de la tarjeta mientras se muestra el overlay */}
                <div className={cn("overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]", className)}>
                    <WindowHeader
                        item={item}
                        strategy={strategy}
                        fullscreen
                        minimized={false}
                        canOpenTab={canOpenTab}
                        onMinimize={() => setState("minimized")}
                        onToggleFullscreen={() => setState("open")}
                        onOpenTab={openTab}
                        onClose={() => setState("collapsed")}
                        onRestore={() => setState("open")}
                    />
                    <div className="p-3 text-center text-[11px] text-white/35">Mostrando en pantalla completa…</div>
                </div>
                <div
                    ref={fullscreenRef}
                    className="fixed inset-0 z-[100] flex flex-col bg-black/95 backdrop-blur-sm animate-in fade-in duration-200"
                    role="dialog"
                    aria-modal="true"
                    aria-label={`Contenido a pantalla completa — ${titleOf(item)}`}
                >
                    <WindowHeader
                        item={item}
                        strategy={strategy}
                        fullscreen
                        minimized={false}
                        canOpenTab={canOpenTab}
                        onMinimize={() => setState("minimized")}
                        onToggleFullscreen={() => setState("open")}
                        onOpenTab={openTab}
                        onClose={() => setState("collapsed")}
                        onRestore={() => setState("open")}
                    />
                    <div className="relative min-h-0 flex-1 overflow-auto p-4">{bodyNode}</div>
                </div>
            </>
        );
    }

    // state === "open"
    return (
        <div className={cn("overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] animate-in fade-in-50 duration-200", className)}>
            <WindowHeader
                item={item}
                strategy={strategy}
                fullscreen={false}
                minimized={false}
                canOpenTab={canOpenTab}
                onMinimize={() => setState("minimized")}
                onToggleFullscreen={() => setState("fullscreen")}
                onOpenTab={openTab}
                onClose={() => setState("collapsed")}
                onRestore={() => setState("open")}
            />
            <div className="p-3">{bodyNode}</div>
        </div>
    );
}

export default EmbeddedContentWindow;
