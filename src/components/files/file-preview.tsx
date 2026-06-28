"use client";

// ════════════════════════════════════════════════════════════════════════════
// FilePreview — Previsualización universal de archivos / programas por contexto
// ----------------------------------------------------------------------------
// Renderiza una vista RICA según el formato del archivo (imagen, vídeo, audio,
// pdf, markdown, código, enlace/OG, 3D/glb, app, genérico) y ofrece acciones
// transversales:
//   · Insertar / Embeder en la red   → emitAttach({kind:'file'})  (bus share)
//   · Abrir en ventana externa       → window.open(url)
//   · Abrir en una pizarra           → emitAttach({kind:'file'})  (la pizarra
//       que escucha el bus añade un bloque con la URL)
//   · Insertar en una publicación    → openComposer({content})    (compositor)
//
// El `context` ("post" | "message" | "pizarra" | "library") adapta la densidad
// y qué acciones se muestran (p.ej. dentro de una pizarra no ofrecemos "abrir en
// pizarra"). Aditivo y SSR-safe: nada de window en el cuerpo del módulo; los
// reproductores pesados (3D) cargan sólo en cliente y degradan a miniatura.
// ════════════════════════════════════════════════════════════════════════════

import React, { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import {
    FileText, FileCode2, FileImage, FileVideo, FileAudio, FileType2,
    File as FileIcon, Link as LinkIcon, Box, AppWindow, ExternalLink,
    Share2, LayoutDashboard, PenSquare, Download, Play, Globe, Copy, Check,
    type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { emitAttach, openComposer } from "@/lib/share/bridge";

// Visor 3D ligero: sólo cliente. Si no existe el módulo o falla, degradamos a
// miniatura/poster vía el catch del propio componente (ver GlbPreview).
const ModelViewer = dynamic(() => import("./model-viewer").then((m) => m.ModelViewer), {
    ssr: false,
    loading: () => (
        <div className="grid h-full w-full place-items-center bg-black/40 text-[11px] text-white/40">
            Cargando visor 3D…
        </div>
    ),
});

// ───────────────────────────── Tipos ────────────────────────────────────────

export type FilePreviewContext = "post" | "message" | "pizarra" | "library";

export type FileFormat =
    | "image" | "video" | "audio" | "pdf" | "markdown" | "code"
    | "link" | "model3d" | "app" | "generic";

/** Forma flexible de un archivo/recurso. Tolerante a distintos orígenes
 *  (os_posts.media_url, canvas block.data, mensajes, biblioteca…). */
export interface FileLike {
    url?: string | null;
    name?: string | null;
    /** mime explícito si se conoce (image/png, video/mp4…). */
    mime?: string | null;
    /** tipo/categoría textual si se conoce (imagen, video, app, enlace…). */
    type?: string | null;
    /** tamaño en bytes o ya formateado ("2.3 MB"). */
    size?: number | string | null;
    /** miniatura/poster para vídeo o 3D. */
    thumbnail?: string | null;
    /** contenido en línea (para markdown/código sin URL). */
    content?: string | null;
    /** lenguaje para bloques de código. */
    language?: string | null;
    /** metadatos OG opcionales para enlaces. */
    description?: string | null;
    /** para apps/programas: id de lanzamiento o ruta interna. */
    appId?: string | null;
    launchHref?: string | null;
}

interface FilePreviewProps {
    file: FileLike;
    context?: FilePreviewContext;
    className?: string;
    /** Oculta la barra de acciones (sólo vista). */
    actions?: boolean;
    /** Acento CSS. */
    accent?: string;
    /** Compacto: reduce alturas (útil en listas/mensajes). */
    compact?: boolean;
}

// ───────────────────────── Detección de formato ─────────────────────────────

const EXT_MAP: Record<string, FileFormat> = {
    png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image",
    svg: "image", avif: "image", bmp: "image", ico: "image",
    mp4: "video", webm: "video", mov: "video", mkv: "video", avi: "video", m4v: "video",
    mp3: "audio", wav: "audio", ogg: "audio", flac: "audio", m4a: "audio", aac: "audio",
    pdf: "pdf",
    md: "markdown", markdown: "markdown", mdx: "markdown",
    glb: "model3d", gltf: "model3d", usdz: "model3d", fbx: "model3d", obj: "model3d",
    js: "code", jsx: "code", ts: "code", tsx: "code", json: "code", py: "code",
    rs: "code", go: "code", java: "code", c: "code", cpp: "code", css: "code",
    html: "code", sh: "code", yml: "code", yaml: "code", toml: "code", sql: "code",
};

function extOf(name?: string | null, url?: string | null): string {
    const src = (name || url || "").split(/[?#]/)[0];
    const m = src.toLowerCase().match(/\.([a-z0-9]+)$/);
    return m ? m[1] : "";
}

export function detectFormat(file: FileLike): FileFormat {
    // 1) tipo textual explícito
    const t = (file.type || "").toLowerCase();
    if (t) {
        if (["imagen", "image", "img", "photo"].includes(t)) return "image";
        if (["video", "vídeo"].includes(t)) return "video";
        if (["audio", "sonido", "música", "musica"].includes(t)) return "audio";
        if (["pdf", "documento"].includes(t)) return "pdf";
        if (["markdown", "md"].includes(t)) return "markdown";
        if (["código", "codigo", "code"].includes(t)) return "code";
        if (["enlace", "link", "url", "web"].includes(t)) return "link";
        if (["3d", "modelo", "glb", "model3d"].includes(t)) return "model3d";
        if (["app", "programa", "aplicación", "aplicacion", "widget"].includes(t)) return "app";
    }
    // 2) mime
    const mime = (file.mime || "").toLowerCase();
    if (mime.startsWith("image/")) return "image";
    if (mime.startsWith("video/")) return "video";
    if (mime.startsWith("audio/")) return "audio";
    if (mime === "application/pdf") return "pdf";
    if (mime.startsWith("text/markdown")) return "markdown";
    if (mime.startsWith("text/") || mime.includes("json") || mime.includes("javascript")) return "code";
    if (mime.includes("model/") || mime.includes("gltf")) return "model3d";
    // 3) app por campos propios
    if (file.appId || file.launchHref) return "app";
    // 4) extensión
    const ext = extOf(file.name, file.url);
    if (ext && EXT_MAP[ext]) return EXT_MAP[ext];
    // 5) contenido en línea sin URL → markdown/código
    if (!file.url && file.content) return file.language ? "code" : "markdown";
    // 6) una URL sin extensión reconocible → enlace
    if (file.url && /^https?:\/\//i.test(file.url) && !ext) return "link";
    return "generic";
}

const FORMAT_META: Record<FileFormat, { icon: LucideIcon; label: string; color: string }> = {
    image:    { icon: FileImage, label: "Imagen",   color: "#38bdf8" },
    video:    { icon: FileVideo, label: "Vídeo",    color: "#f472b6" },
    audio:    { icon: FileAudio, label: "Audio",    color: "#a78bfa" },
    pdf:      { icon: FileType2, label: "PDF",      color: "#fb7185" },
    markdown: { icon: FileText,  label: "Markdown", color: "#34d399" },
    code:     { icon: FileCode2, label: "Código",   color: "#facc15" },
    link:     { icon: LinkIcon,  label: "Enlace",   color: "#22d3ee" },
    model3d:  { icon: Box,       label: "3D",       color: "#c084fc" },
    app:      { icon: AppWindow, label: "App",      color: "#fbbf24" },
    generic:  { icon: FileIcon,  label: "Archivo",  color: "#94a3b8" },
};

// ─────────────────────────── Utilidades UI ──────────────────────────────────

function humanSize(size?: number | string | null): string {
    if (size == null) return "";
    if (typeof size === "string") return size;
    if (!Number.isFinite(size) || size <= 0) return "";
    const units = ["B", "KB", "MB", "GB"];
    let s = size, i = 0;
    while (s >= 1024 && i < units.length - 1) { s /= 1024; i++; }
    return `${s.toFixed(s < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

function safeDomain(url: string): string {
    try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

function fileTitle(file: FileLike, fmt: FileFormat): string {
    if (file.name) return file.name;
    if (file.url) {
        try {
            const p = new URL(file.url).pathname.split("/").filter(Boolean).pop();
            if (p) return decodeURIComponent(p);
        } catch { /* noop */ }
        if (fmt === "link") return safeDomain(file.url);
    }
    return FORMAT_META[fmt].label;
}

// ───────────────────────────── Acciones ─────────────────────────────────────

function ActionBar({ file, fmt, context }: { file: FileLike; fmt: FileFormat; context: FilePreviewContext }) {
    const [done, setDone] = useState<string | null>(null);
    const url = file.url || file.launchHref || "";
    const title = fileTitle(file, fmt);

    const flash = (k: string) => { setDone(k); window.setTimeout(() => setDone((d) => (d === k ? null : d)), 1600); };

    const data: Record<string, unknown> = {
        name: title, mime: file.mime ?? undefined, type: file.type ?? fmt,
        size: file.size ?? undefined, thumbnail: file.thumbnail ?? undefined,
        format: fmt,
    };

    const embedInNetwork = () => {
        emitAttach({ kind: "file", url: url || undefined, title, data });
        flash("net");
    };
    const openExternal = () => {
        if (!url) return;
        if (typeof window !== "undefined") window.open(url, "_blank", "noopener,noreferrer");
    };
    const openInBoard = () => {
        emitAttach({ kind: "file", url: url || undefined, title, data: { ...data, target: "pizarra" } });
        flash("board");
    };
    const insertInPost = () => {
        const content: Record<string, unknown> =
            fmt === "image" ? { image: url, title }
                : fmt === "link" ? { link: url, title }
                    : fmt === "markdown" ? { markdown: file.content ?? "", title }
                        : { file: { url, name: title, format: fmt } };
        openComposer({ type: "publicacion", format: fmt === "image" ? "imagen" : fmt, content });
        flash("post");
    };

    const Btn = ({ onClick, icon: Icon, label, k, disabled }: {
        onClick: () => void; icon: LucideIcon; label: string; k: string; disabled?: boolean;
    }) => (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            title={label}
            className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors",
                "border-white/10 bg-white/[0.03] text-white/70 hover:border-white/25 hover:bg-white/[0.07] hover:text-white",
                disabled && "opacity-40 cursor-not-allowed hover:bg-white/[0.03] hover:border-white/10",
            )}
        >
            {done === k ? <Check className="size-3.5 text-emerald-400" /> : <Icon className="size-3.5" />}
            <span className="hidden @[16rem]:inline">{done === k ? "Hecho" : label}</span>
        </button>
    );

    return (
        <div className="flex flex-wrap items-center gap-1.5 pt-2">
            <Btn onClick={embedInNetwork} icon={Share2} label="Embeder en la red" k="net" />
            <Btn onClick={openExternal} icon={ExternalLink} label="Ventana externa" k="ext" disabled={!url} />
            {context !== "pizarra" && (
                <Btn onClick={openInBoard} icon={LayoutDashboard} label="Abrir en pizarra" k="board" />
            )}
            {context !== "post" && (
                <Btn onClick={insertInPost} icon={PenSquare} label="Insertar en publicación" k="post" />
            )}
        </div>
    );
}

// ─────────────────────── Previsualizaciones por formato ─────────────────────

function ImagePreview({ file, compact }: { file: FileLike; compact?: boolean }) {
    if (!file.url) return <GenericBody file={file} fmt="image" hint="Sin URL de imagen." />;
    return (
        <div className={cn("overflow-hidden rounded-xl border border-white/10 bg-black/30", compact ? "max-h-48" : "")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={file.url} alt={file.name || "imagen"} className="w-full object-contain" loading="lazy" />
        </div>
    );
}

function VideoPreview({ file }: { file: FileLike }) {
    if (!file.url) return <GenericBody file={file} fmt="video" hint="Sin URL de vídeo." />;
    return (
        <div className="overflow-hidden rounded-xl border border-white/10 bg-black">
            <video
                src={file.url}
                poster={file.thumbnail || undefined}
                controls
                loop
                playsInline
                preload="metadata"
                className="w-full max-h-[60vh]"
            />
        </div>
    );
}

function AudioPreview({ file }: { file: FileLike }) {
    if (!file.url) return <GenericBody file={file} fmt="audio" hint="Sin URL de audio." />;
    return (
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-violet-400/30 bg-violet-500/10">
                <FileAudio className="size-5 text-violet-300" />
            </span>
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white/90">{fileTitle(file, "audio")}</p>
                <audio src={file.url} controls preload="metadata" className="mt-1.5 w-full" />
            </div>
        </div>
    );
}

function PdfPreview({ file, compact }: { file: FileLike; compact?: boolean }) {
    if (!file.url) return <GenericBody file={file} fmt="pdf" hint="Sin URL de PDF." />;
    return (
        <div className="overflow-hidden rounded-xl border border-white/10 bg-white">
            <object data={file.url} type="application/pdf" className="w-full" style={{ height: compact ? 280 : 520 }}>
                <div className="grid place-items-center gap-2 bg-black/40 p-6 text-center">
                    <FileType2 className="size-7 text-rose-300" />
                    <p className="text-xs text-white/60">Tu navegador no puede incrustar este PDF.</p>
                    <a href={file.url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-rose-400/40 bg-rose-500/15 px-3 py-1.5 text-[11px] font-bold text-rose-200 hover:bg-rose-500/25">
                        <ExternalLink className="size-3.5" /> Abrir PDF
                    </a>
                </div>
            </object>
        </div>
    );
}

function MarkdownPreview({ file, compact }: { file: FileLike; compact?: boolean }) {
    const [text, setText] = useState<string>(file.content ?? "");
    const [loading, setLoading] = useState<boolean>(!file.content && !!file.url);

    React.useEffect(() => {
        let active = true;
        if (!file.content && file.url) {
            setLoading(true);
            fetch(file.url)
                .then((r) => (r.ok ? r.text() : Promise.reject(new Error("fetch"))))
                .then((t) => { if (active) { setText(t.slice(0, 20000)); setLoading(false); } })
                .catch(() => { if (active) setLoading(false); });
        }
        return () => { active = false; };
    }, [file.url, file.content]);

    if (loading) return <div className="h-24 animate-pulse rounded-xl bg-white/5" />;
    if (!text) return <GenericBody file={file} fmt="markdown" hint="Documento markdown vacío." />;

    return (
        <div className={cn(
            "prose prose-invert prose-sm max-w-none overflow-auto rounded-xl border border-white/10 bg-white/[0.02] p-4",
            "prose-headings:text-white/90 prose-p:text-white/75 prose-a:text-cyan-300 prose-strong:text-white prose-code:text-amber-200",
            compact ? "max-h-56" : "max-h-[60vh]",
        )}>
            <ReactMarkdown>{text}</ReactMarkdown>
        </div>
    );
}

function CodePreview({ file, compact }: { file: FileLike; compact?: boolean }) {
    const [text, setText] = useState<string>(file.content ?? "");
    const [loading, setLoading] = useState<boolean>(!file.content && !!file.url);
    const [copied, setCopied] = useState(false);
    const lang = file.language || extOf(file.name, file.url) || "txt";

    React.useEffect(() => {
        let active = true;
        if (!file.content && file.url) {
            setLoading(true);
            fetch(file.url)
                .then((r) => (r.ok ? r.text() : Promise.reject(new Error("fetch"))))
                .then((t) => { if (active) { setText(t.slice(0, 20000)); setLoading(false); } })
                .catch(() => { if (active) setLoading(false); });
        }
        return () => { active = false; };
    }, [file.url, file.content]);

    const copy = () => {
        if (typeof navigator !== "undefined" && navigator.clipboard) {
            navigator.clipboard.writeText(text).then(() => {
                setCopied(true); window.setTimeout(() => setCopied(false), 1500);
            }).catch(() => { /* noop */ });
        }
    };

    if (loading) return <div className="h-24 animate-pulse rounded-xl bg-white/5" />;
    if (!text) return <GenericBody file={file} fmt="code" hint="Archivo de código vacío." />;

    return (
        <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0b0b12]">
            <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-3 py-1.5">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-200/80">
                    <FileCode2 className="size-3.5" /> {lang}
                </span>
                <button type="button" onClick={copy} className="inline-flex items-center gap-1 text-[10px] font-semibold text-white/50 hover:text-white">
                    {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                    {copied ? "Copiado" : "Copiar"}
                </button>
            </div>
            <pre className={cn("overflow-auto p-3 text-[11px] leading-relaxed text-white/80", compact ? "max-h-56" : "max-h-[60vh]")}>
                <code>{text}</code>
            </pre>
        </div>
    );
}

function LinkPreview({ file }: { file: FileLike }) {
    const url = file.url || "";
    const domain = safeDomain(url);
    return (
        <a href={url} target="_blank" rel="noopener noreferrer"
            className="group flex items-stretch gap-0 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] transition-colors hover:border-cyan-400/30 hover:bg-white/[0.06]">
            <div className="grid w-16 shrink-0 place-items-center border-r border-white/10 bg-gradient-to-br from-cyan-500/10 to-transparent">
                {file.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={file.thumbnail} alt="" className="size-full object-cover" />
                ) : (
                    <Globe className="size-6 text-cyan-300/70" />
                )}
            </div>
            <div className="min-w-0 flex-1 p-3">
                <p className="truncate text-sm font-semibold text-white/90">{file.name || domain}</p>
                {file.description && <p className="mt-0.5 line-clamp-2 text-[11px] text-white/55">{file.description}</p>}
                <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-cyan-300/70">
                    <LinkIcon className="size-3" /> {domain}
                </span>
            </div>
        </a>
    );
}

function GlbPreview({ file }: { file: FileLike }) {
    const [failed, setFailed] = useState(false);
    if (!file.url || failed) {
        return (
            <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black/40">
                {file.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={file.thumbnail} alt={file.name || "modelo 3D"} className="w-full object-cover opacity-90" />
                ) : (
                    <div className="grid h-48 place-items-center">
                        <div className="text-center">
                            <Box className="mx-auto size-8 text-purple-300/70" />
                            <p className="mt-2 text-[11px] text-white/50">{fileTitle(file, "model3d")}</p>
                        </div>
                    </div>
                )}
                <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/60 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-purple-200">
                    <Box className="size-3" /> 3D
                </span>
            </div>
        );
    }
    return (
        <div className="h-64 overflow-hidden rounded-xl border border-white/10 bg-black/40">
            <ErrorBoundary onError={() => setFailed(true)}>
                <ModelViewer src={file.url} />
            </ErrorBoundary>
        </div>
    );
}

function AppPreview({ file }: { file: FileLike }) {
    const href = file.launchHref || file.url || "";
    const launch = () => {
        if (!href) return;
        if (href.startsWith("/")) { if (typeof window !== "undefined") window.location.href = href; }
        else if (typeof window !== "undefined") window.open(href, "_blank", "noopener,noreferrer");
    };
    return (
        <div className="flex items-center gap-3 rounded-xl border border-amber-400/20 bg-gradient-to-br from-amber-500/10 to-transparent p-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl border border-amber-400/30 bg-amber-500/15">
                <AppWindow className="size-6 text-amber-300" />
            </span>
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-white/90">{fileTitle(file, "app")}</p>
                <p className="text-[11px] text-white/55">{file.description || "Aplicación / programa de StarSeed OS"}</p>
            </div>
            <button type="button" onClick={launch} disabled={!href}
                className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-500/15 px-3 py-2 text-[11px] font-bold text-amber-200 hover:bg-amber-500/25",
                    !href && "opacity-40 cursor-not-allowed",
                )}>
                <Play className="size-3.5" /> Abrir
            </button>
        </div>
    );
}

function GenericBody({ file, fmt, hint }: { file: FileLike; fmt: FileFormat; hint?: string }) {
    const meta = FORMAT_META[fmt];
    const Icon = meta.icon;
    const size = humanSize(file.size);
    return (
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl border" style={{ borderColor: `${meta.color}40`, background: `${meta.color}1a` }}>
                <Icon className="size-5" style={{ color: meta.color }} />
            </span>
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white/90">{fileTitle(file, fmt)}</p>
                <p className="text-[11px] text-white/50">
                    {hint || [meta.label, size].filter(Boolean).join(" · ")}
                </p>
            </div>
            {file.url && (
                <a href={file.url} target="_blank" rel="noopener noreferrer"
                    className="grid size-9 place-items-center rounded-lg border border-white/10 bg-white/[0.03] text-white/60 hover:text-white"
                    title="Descargar / abrir">
                    <Download className="size-4" />
                </a>
            )}
        </div>
    );
}

// Pequeño límite de error para el visor 3D (degrada a miniatura).
class ErrorBoundary extends React.Component<
    { children: React.ReactNode; onError: () => void },
    { hasError: boolean }
> {
    constructor(props: { children: React.ReactNode; onError: () => void }) {
        super(props);
        this.state = { hasError: false };
    }
    static getDerivedStateFromError() { return { hasError: true }; }
    componentDidCatch() { this.props.onError(); }
    render() { return this.state.hasError ? null : this.props.children; }
}

// ───────────────────────────── Componente raíz ──────────────────────────────

export function FilePreview({
    file, context = "library", className, actions = true, accent, compact,
}: FilePreviewProps) {
    const fmt = useMemo(() => detectFormat(file), [file]);
    const meta = FORMAT_META[fmt];
    const HeaderIcon = meta.icon;

    const body = (() => {
        switch (fmt) {
            case "image": return <ImagePreview file={file} compact={compact} />;
            case "video": return <VideoPreview file={file} />;
            case "audio": return <AudioPreview file={file} />;
            case "pdf": return <PdfPreview file={file} compact={compact} />;
            case "markdown": return <MarkdownPreview file={file} compact={compact} />;
            case "code": return <CodePreview file={file} compact={compact} />;
            case "link": return <LinkPreview file={file} />;
            case "model3d": return <GlbPreview file={file} />;
            case "app": return <AppPreview file={file} />;
            default: return <GenericBody file={file} fmt="generic" />;
        }
    })();

    return (
        <div
            className={cn("@container w-full", className)}
            style={accent ? ({ ["--fp-accent" as string]: accent } as React.CSSProperties) : undefined}
        >
            {/* Cabecera compacta con tipo + nombre (omitida en compacto para img/link/app que ya muestran su propio chrome) */}
            {!compact && !["image", "link", "app"].includes(fmt) && (
                <div className="mb-2 flex items-center gap-2">
                    <span className="grid size-6 place-items-center rounded-md border" style={{ borderColor: `${meta.color}40`, background: `${meta.color}1a` }}>
                        <HeaderIcon className="size-3.5" style={{ color: meta.color }} />
                    </span>
                    <span className="truncate text-[12px] font-semibold text-white/80">{fileTitle(file, fmt)}</span>
                    <span className="ml-auto rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider" style={{ background: `${meta.color}1a`, color: meta.color }}>
                        {meta.label}
                    </span>
                </div>
            )}

            {body}

            {actions && <ActionBar file={file} fmt={fmt} context={context} />}
        </div>
    );
}

export default FilePreview;
