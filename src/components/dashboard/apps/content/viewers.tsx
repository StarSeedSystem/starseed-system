'use client';

// ════════════════════════════════════════════════════════════════
// Visores del Abridor Universal (excepto 3D → model-viewer.tsx)
// Cada visor recibe { resource } y rellena el cuerpo de la ContentWindow.
// SOP: architecture/dashboard-launcher-apps-y-archivos.md §4
// ════════════════════════════════════════════════════════════════

import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
    Loader2, ExternalLink, FileQuestion, Star, ArrowUpRight, Link2, ZoomIn, ZoomOut, RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ContentResource } from "./content-types";

export interface ViewerProps { resource: ContentResource }

const Center: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
    <div className={cn("absolute inset-0 grid place-items-center p-6", className)}>{children}</div>
);

// ── Imagen (zoom + pan, soporta GIF animado) ─────────────────────
export function ImageViewer({ resource }: ViewerProps) {
    const [scale, setScale] = useState(1);
    const [pos, setPos] = useState({ x: 0, y: 0 });
    const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
    const [err, setErr] = useState(false);

    const zoom = (d: number) => setScale((s) => Math.min(6, Math.max(0.2, +(s + d).toFixed(2))));
    const reset = () => { setScale(1); setPos({ x: 0, y: 0 }); };

    if (!resource.url) return <FallbackViewer resource={resource} />;
    if (err) return <FallbackViewer resource={resource} note="No se pudo cargar la imagen." />;

    return (
        <div
            className="absolute inset-0 overflow-hidden bg-[repeating-conic-gradient(#0000_0deg_90deg,#ffffff08_90deg_180deg)] bg-[length:24px_24px] grid place-items-center select-none"
            onWheel={(e) => { e.preventDefault(); zoom(e.deltaY > 0 ? -0.2 : 0.2); }}
            onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y }; }}
            onPointerMove={(e) => { const d = drag.current; if (d) setPos({ x: d.px + (e.clientX - d.x), y: d.py + (e.clientY - d.y) }); }}
            onPointerUp={() => { drag.current = null; }}
            onDoubleClick={reset}
        >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={resource.url}
                alt={resource.title}
                onError={() => setErr(true)}
                draggable={false}
                className="max-w-none transition-transform duration-75"
                style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`, cursor: scale > 1 ? "grab" : "default" }}
            />
            <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-card/80 backdrop-blur border border-border/50 px-1.5 py-1">
                <IconBtn title="Alejar" onClick={() => zoom(-0.2)}><ZoomOut className="size-4" /></IconBtn>
                <span className="text-[10px] font-mono tabular-nums w-9 text-center">{Math.round(scale * 100)}%</span>
                <IconBtn title="Acercar" onClick={() => zoom(0.2)}><ZoomIn className="size-4" /></IconBtn>
                <IconBtn title="Restablecer" onClick={reset}><RotateCcw className="size-4" /></IconBtn>
            </div>
        </div>
    );
}

// ── Galería ──────────────────────────────────────────────────────
export function GalleryViewer({ resource }: ViewerProps) {
    const urls = resource.urls || [];
    const [active, setActive] = useState<number | null>(null);
    if (urls.length === 0) return <FallbackViewer resource={resource} />;
    if (active !== null) {
        return <ImageViewer resource={{ ...resource, kind: "image", url: urls[active], title: `${resource.title} (${active + 1}/${urls.length})` }} />;
    }
    return (
        <div className="absolute inset-0 overflow-auto p-3">
            <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px,1fr))" }}>
                {urls.map((u, i) => (
                    <button key={i} type="button" onClick={() => setActive(i)}
                        className="group relative aspect-square overflow-hidden rounded-xl border border-border/40 cursor-pointer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={u} alt={`${resource.title} ${i + 1}`} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                    </button>
                ))}
            </div>
        </div>
    );
}

// ── Vídeo / Audio ────────────────────────────────────────────────
export function MediaPlayer({ resource }: ViewerProps) {
    if (!resource.url) return <FallbackViewer resource={resource} />;
    if (resource.kind === "audio") {
        return (
            <Center>
                <div className="w-full max-w-md space-y-4 text-center">
                    <div className="mx-auto size-28 rounded-3xl grid place-items-center"
                        style={{ background: `linear-gradient(135deg, ${resource.accent ?? "#A855F7"}, color-mix(in srgb, ${resource.accent ?? "#A855F7"} 35%, transparent))` }}>
                        <span className="text-4xl">♪</span>
                    </div>
                    <h4 className="font-black truncate">{resource.title}</h4>
                    <audio src={resource.url} controls autoPlay className="w-full" />
                </div>
            </Center>
        );
    }
    return (
        <div className="absolute inset-0 grid place-items-center bg-black">
            <video src={resource.url} poster={resource.poster} controls autoPlay playsInline className="max-w-full max-h-full" />
        </div>
    );
}

// ── PDF (nativo del navegador) ───────────────────────────────────
export function PdfViewer({ resource }: ViewerProps) {
    if (!resource.url) return <FallbackViewer resource={resource} />;
    return (
        <object data={resource.url} type="application/pdf" className="absolute inset-0 w-full h-full">
            <iframe src={resource.url} title={resource.title} className="absolute inset-0 w-full h-full border-0" />
            <Center>
                <div className="text-center space-y-3">
                    <p className="text-sm text-muted-foreground">No se pudo incrustar el PDF.</p>
                    <OpenTab url={resource.url} />
                </div>
            </Center>
        </object>
    );
}

// ── HTML (sitio o markup en línea) ───────────────────────────────
export function HtmlViewer({ resource }: ViewerProps) {
    const common = "absolute inset-0 w-full h-full border-0 bg-white";
    const sandbox = "allow-scripts allow-same-origin allow-popups allow-forms";
    if (resource.text) return <iframe title={resource.title} srcDoc={resource.text} className={common} sandbox={sandbox} />;
    if (resource.url) return <iframe title={resource.title} src={resource.url} className={common} sandbox={sandbox} referrerPolicy="no-referrer" loading="lazy" />;
    return <FallbackViewer resource={resource} />;
}

// ── Documento: markdown / código / texto ─────────────────────────
function useRemoteText(resource: ContentResource) {
    const [text, setText] = useState<string | null>(resource.text ?? null);
    const [loading, setLoading] = useState(!resource.text && !!resource.url);
    const [error, setError] = useState(false);
    useEffect(() => {
        if (resource.text != null || !resource.url) return;
        let alive = true;
        setLoading(true);
        fetch(resource.url)
            .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.text(); })
            .then((t) => { if (alive) { setText(t); setLoading(false); } })
            .catch(() => { if (alive) { setError(true); setLoading(false); } });
        return () => { alive = false; };
    }, [resource.url, resource.text]);
    return { text, loading, error };
}

const MD_COMPONENTS = {
    h1: (p: any) => <h1 className="text-xl font-black mt-3 mb-1.5" {...p} />,
    h2: (p: any) => <h2 className="text-lg font-bold mt-3 mb-1.5" {...p} />,
    h3: (p: any) => <h3 className="text-base font-bold mt-2 mb-1" {...p} />,
    p: (p: any) => <p className="mb-2 leading-relaxed" {...p} />,
    ul: (p: any) => <ul className="list-disc pl-5 mb-2 space-y-0.5" {...p} />,
    ol: (p: any) => <ol className="list-decimal pl-5 mb-2 space-y-0.5" {...p} />,
    a: (p: any) => <a className="text-primary underline underline-offset-2" target="_blank" rel="noopener noreferrer" {...p} />,
    code: (p: any) => <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-[0.85em]" {...p} />,
    pre: (p: any) => <pre className="rounded-xl bg-black/40 border border-border/40 p-3 overflow-auto my-2 text-xs" {...p} />,
    blockquote: (p: any) => <blockquote className="border-l-2 border-primary/50 pl-3 italic text-muted-foreground my-2" {...p} />,
    table: (p: any) => <table className="w-full text-xs border-collapse my-2" {...p} />,
    th: (p: any) => <th className="border border-border/40 px-2 py-1 bg-white/5 text-left" {...p} />,
    td: (p: any) => <td className="border border-border/40 px-2 py-1" {...p} />,
};

export function DocViewer({ resource }: ViewerProps) {
    const { text, loading, error } = useRemoteText(resource);
    if (loading) return <Center><Spinner label="Cargando documento…" /></Center>;
    if (error || text == null) return <FallbackViewer resource={resource} note="No se pudo cargar el documento." />;

    if (resource.kind === "markdown") {
        return (
            <div className="absolute inset-0 overflow-auto p-5 text-sm">
                <div className="max-w-3xl mx-auto"><ReactMarkdown components={MD_COMPONENTS}>{text}</ReactMarkdown></div>
            </div>
        );
    }
    if (resource.kind === "code") {
        const lines = text.split("\n");
        return (
            <div className="absolute inset-0 overflow-auto bg-black/40 font-mono text-xs">
                <table className="w-full border-collapse">
                    <tbody>
                        {lines.map((ln, i) => (
                            <tr key={i} className="align-top">
                                <td className="select-none text-right pr-3 pl-3 text-muted-foreground/40 w-12 sticky left-0 bg-black/40 tabular-nums">{i + 1}</td>
                                <td className="pr-4 whitespace-pre">{ln || " "}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    }
    return (
        <div className="absolute inset-0 overflow-auto p-5">
            <pre className="whitespace-pre-wrap text-sm leading-relaxed max-w-3xl mx-auto">{text}</pre>
        </div>
    );
}

// ── Enlace ───────────────────────────────────────────────────────
export function LinkCard({ resource }: ViewerProps) {
    const domain = resource.meta?.domain || (resource.url ? safeDomain(resource.url) : "");
    return (
        <Center>
            <div className="max-w-md w-full rounded-2xl border border-border/50 bg-card/60 p-6 text-center space-y-3">
                <span className="mx-auto grid place-items-center size-12 rounded-2xl bg-primary/15 text-primary"><Link2 className="size-6" /></span>
                <h4 className="font-black truncate">{resource.title}</h4>
                {domain && <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground/70 font-bold">{domain}</p>}
                {resource.url && <OpenTab url={resource.url} label="Abrir enlace" />}
            </div>
        </Center>
    );
}

// ── Entidad de Biblioteca (sin bytes — info del Lienzo Universal) ──
export function EntityCard({ resource }: ViewerProps) {
    const m = resource.meta || {};
    return (
        <Center>
            <div className="max-w-md w-full rounded-2xl border border-border/50 bg-card/60 p-6 space-y-3">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] font-bold text-muted-foreground/70">
                    {m.originalKind && <span className="rounded-full bg-white/10 px-2 py-0.5">{m.originalKind}</span>}
                    {m.discipline && <span>{m.discipline}</span>}
                </div>
                <h4 className="text-lg font-black">{resource.title}</h4>
                {m.author && <p className="text-sm text-muted-foreground">por {m.author}</p>}
                {typeof m.rating === "number" && (
                    <div className="flex items-center gap-1 text-amber-400">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <Star key={i} className={cn("size-4", i < Math.round((m.rating ?? 0) * 5) ? "fill-current" : "opacity-30")} />
                        ))}
                    </div>
                )}
                <a href={m.href || "/library"} className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 border border-primary/30 px-3 py-1.5 text-sm font-bold text-primary hover:bg-primary/25 transition-colors cursor-pointer">
                    Ir a la Biblioteca <ArrowUpRight className="size-4" />
                </a>
            </div>
        </Center>
    );
}

// ── Fallback (tipo no reconocido) ────────────────────────────────
export function FallbackViewer({ resource, note }: ViewerProps & { note?: string }) {
    return (
        <Center>
            <div className="max-w-sm text-center space-y-3">
                <span className="mx-auto grid place-items-center size-14 rounded-2xl bg-white/5 border border-border/40 text-muted-foreground"><FileQuestion className="size-7" /></span>
                <h4 className="font-black truncate">{resource.title}</h4>
                <p className="text-sm text-muted-foreground">{note || "No hay un visor específico para este tipo de contenido."}</p>
                {resource.url && <OpenTab url={resource.url} label="Abrir / descargar" />}
            </div>
        </Center>
    );
}

// ── Auxiliares ───────────────────────────────────────────────────
function IconBtn({ children, title, onClick }: { children: React.ReactNode; title: string; onClick: () => void }) {
    return (
        <button type="button" title={title} aria-label={title} onClick={onClick}
            className="grid place-items-center size-7 rounded-full text-muted-foreground/80 hover:text-foreground hover:bg-white/10 transition-colors cursor-pointer">
            {children}
        </button>
    );
}
function Spinner({ label }: { label: string }) {
    return <span className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground"><Loader2 className="size-4 animate-spin" /> {label}</span>;
}
function OpenTab({ url, label = "Abrir en pestaña nueva" }: { url: string; label?: string }) {
    return (
        <a href={url} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-lg cursor-pointer transition-transform hover:-translate-y-px">
            <ExternalLink className="size-4" /> {label}
        </a>
    );
}
function safeDomain(url: string): string {
    try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}
