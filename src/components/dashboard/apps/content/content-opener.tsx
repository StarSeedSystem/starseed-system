'use client';

// ════════════════════════════════════════════════════════════════
// Abridor Universal — useContentOpener + ContentWindow + acciones
// ----------------------------------------------------------------
// useContentOpener mantiene una pila de ventanas (portal a body) y
// expone open()/openMany(). ContentWindow envuelve el visor en una
// OSWindow y añade la barra de acciones universal: abrir en pestaña,
// descargar, copiar (enlace/contenido), clonar/duplicar, guardar en
// biblioteca, instalar. copiar/descargar/pestaña son reales; guardar/
// instalar emiten callbacks (persistencia → Fase 2.1).
// SOP: architecture/dashboard-launcher-apps-y-archivos.md §4
// ════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
    Image as ImageIcon, Film, Music, FileText, FileCode2, Box, Link2, Library,
    File as FileIcon, ExternalLink, Download, Copy, Check, Save, CopyPlus, LayoutGrid,
    type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { OSWindow } from "../os-window";
import { ContentViewer, kindLabel } from "./viewer-registry";
import type { ContentKind, ContentResource } from "./content-types";
import { saveResource, installApp } from "@/lib/library-store";

const KIND_ICON: Record<ContentKind, LucideIcon> = {
    image: ImageIcon, gif: ImageIcon, gallery: ImageIcon, video: Film, audio: Music,
    pdf: FileText, html: FileCode2, model3d: Box, markdown: FileText, code: FileCode2,
    text: FileText, dataset: LayoutGrid, link: Link2, entity: Library, app: LayoutGrid, unknown: FileIcon,
};

export interface ContentOpenerOptions {
    /** Persistencia real de "Guardar en Biblioteca" (→ Supabase / user_settings). */
    onSave?: (r: ContentResource) => void;
    /** Persistencia real de "Instalar" (→ cafe_accounts.apps). */
    onInstall?: (r: ContentResource) => void;
    /** Gancho para el Exocórtex / memoria del usuario (recurso abierto). */
    onOpen?: (r: ContentResource) => void;
}

export interface UseContentOpener {
    open: (r: ContentResource) => void;
    openMany: (rs: ContentResource[]) => void;
    windowEl: React.ReactNode;
}

export function useContentOpener(opts?: ContentOpenerOptions): UseContentOpener {
    const router = useRouter();
    const [mounted, setMounted] = useState(false);
    const [stack, setStack] = useState<ContentResource[]>([]);
    useEffect(() => setMounted(true), []);

    const open = useCallback((r: ContentResource) => {
        setStack((s) => [...s, r]);
        opts?.onOpen?.(r);
    }, [opts]);

    const openMany = useCallback((rs: ContentResource[]) => {
        if (rs.length) { setStack((s) => [...s, ...rs]); rs.forEach((r) => opts?.onOpen?.(r)); }
    }, [opts]);

    const close = useCallback((id: string) => setStack((s) => s.filter((x) => x.id !== id)), []);
    const clone = useCallback((r: ContentResource) => {
        setStack((s) => [...s, { ...r, id: `${r.id}-copy-${Date.now().toString(36)}`, title: `${r.title} (copia)` }]);
    }, []);

    // Defaults de persistencia (Fase 2.1): cuando el llamador NO pasa onSave/
    // onInstall, persistimos en el store soberano local (library-store). El
    // guardado por defecto ADEMÁS conserva la navegación a /library como
    // acción secundaria existente. saveResource/installApp son SSR-safe.
    const goLibrary = useCallback(() => router.push("/library"), [router]);

    const defaultSave = useCallback((r: ContentResource) => {
        saveResource({ id: r.id, kind: r.kind, title: r.title, url: r.url, origin: r.origin });
        goLibrary();
    }, [goLibrary]);

    const defaultInstall = useCallback((r: ContentResource) => {
        installApp({ id: r.id, name: r.title });
    }, []);

    const effSave = opts?.onSave ?? defaultSave;
    const effInstall = opts?.onInstall ?? defaultInstall;

    const windowEl = mounted && stack.length > 0
        ? createPortal(
            <>
                {stack.map((r) => (
                    <ContentWindow
                        key={r.id}
                        resource={r}
                        onClose={() => close(r.id)}
                        onClone={() => clone(r)}
                        onSave={effSave}
                        onInstall={effInstall}
                        goLibrary={goLibrary}
                    />
                ))}
            </>,
            document.body
        )
        : null;

    return { open, openMany, windowEl };
}

// ── ContentWindow ────────────────────────────────────────────────
function ContentWindow({ resource, onClose, onClone, onSave, onInstall, goLibrary }: {
    resource: ContentResource;
    onClose: () => void;
    onClone: () => void;
    onSave?: (r: ContentResource) => void;
    onInstall?: (r: ContentResource) => void;
    goLibrary: () => void;
}) {
    const [copied, setCopied] = useState(false);
    const [saved, setSaved] = useState(false);
    const Icon = KIND_ICON[resource.kind] ?? FileIcon;
    const accent = resource.accent ?? "#39FF14";
    const url = resource.url;

    const copy = async (text: string) => {
        try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* noop */ }
    };
    const save = () => {
        setSaved(true);
        if (onSave) onSave(resource); else goLibrary();
    };
    const install = () => {
        if (onInstall) onInstall(resource); else save();
    };

    return (
        <OSWindow
            title={resource.title}
            subtitle={`${kindLabel(resource.kind)}${resource.meta?.source ? " · " + resource.meta.source : ""}`}
            icon={Icon}
            accent={accent}
            onClose={onClose}
            actions={url ? (
                <a href={url} target="_blank" rel="noopener noreferrer" title="Abrir en pestaña nueva" aria-label="Abrir en pestaña nueva"
                    className="grid place-items-center size-8 rounded-full text-muted-foreground/70 hover:text-foreground hover:bg-white/10 transition-colors cursor-pointer">
                    <ExternalLink className="size-4" />
                </a>
            ) : undefined}
            toolbar={
                <>
                    {url && <ActionBtn icon={Download} label="Descargar" href={url} download={resource.title} />}
                    {url && <ActionBtn icon={copied ? Check : Copy} label={copied ? "Copiado" : "Copiar enlace"} onClick={() => copy(url)} />}
                    {!url && resource.text && <ActionBtn icon={copied ? Check : Copy} label={copied ? "Copiado" : "Copiar contenido"} onClick={() => copy(resource.text!)} />}
                    <ActionBtn icon={CopyPlus} label="Clonar" onClick={onClone} />
                    <span className="mx-0.5 h-5 w-px bg-border/50" aria-hidden />
                    <ActionBtn icon={saved ? Check : Save} label={saved ? "Guardado" : "Guardar en Biblioteca"} onClick={save} accent />
                    <ActionBtn icon={Box} label="Instalar" onClick={install} />
                </>
            }
        >
            <ContentViewer resource={resource} />
        </OSWindow>
    );
}

function ActionBtn({ icon: Icon, label, onClick, href, download, accent }: {
    icon: LucideIcon; label: string; onClick?: () => void; href?: string; download?: string; accent?: boolean;
}) {
    const cls = cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors cursor-pointer",
        accent
            ? "border-primary/40 bg-primary/15 text-primary hover:bg-primary/25"
            : "border-border/50 text-muted-foreground hover:text-foreground hover:bg-white/10"
    );
    const inner = <><Icon className="size-3.5" /> <span>{label}</span></>;
    if (href) {
        return <a href={href} download={download} target="_blank" rel="noopener noreferrer" className={cls} title={label}>{inner}</a>;
    }
    return <button type="button" onClick={onClick} className={cls} title={label}>{inner}</button>;
}
