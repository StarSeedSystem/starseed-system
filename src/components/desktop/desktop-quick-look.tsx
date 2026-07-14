'use client';

// ════════════════════════════════════════════════════════════════
// StarSeed OS — Quick Look del escritorio (Adenda 68 · B-2)
// ----------------------------------------------------------------
// VISOR UNIVERSAL + INFORMACIÓN + PERMISOS de cualquier cosa que viva en
// el escritorio, sin abrir una ventana entera (barra espaciadora, como en
// macOS, o menú contextual → «Vista previa» / «Información»):
//
//   • Archivo   → el motor de contenido REAL del OS (ContentViewer, que ya
//                 cubre imagen · GIF · galería · vídeo · audio · PDF · HTML ·
//                 Markdown · código · texto · modelo 3D · enlace · entidad,
//                 con visor de reserva para lo desconocido).
//   • Nota      → su texto.
//   • Widget    → el widget VIVO (DesktopWidgetHost).
//   • App       → ficha real del catálogo (estado, categoría, cómo abre).
//   • Enlace    → tarjeta del sitio + abrir en el navegador del escritorio.
//   • Folder    → su contenido (recuento y lista).
//
// La pestaña «Información» muestra los datos reales del recurso Y su ACCESO
// (src/lib/sharing/access.ts): ámbito y nº de accesos concedidos, con botones
// para COMPARTIR (ShareToDialog) y gestionar PERMISOS (ShareAccessDialog),
// reutilizando exactamente los mismos diálogos que el resto del OS.
// ════════════════════════════════════════════════════════════════

import React, { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { motion, useReducedMotion } from "framer-motion";
import {
    X, Eye, Info, Share2, Lock, ExternalLink, FolderOpen, StickyNote,
    LayoutGrid, FileQuestion, Globe, ShieldCheck, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getApp } from "@/components/dashboard/apps/app-catalog";
import { detectKind, type ContentKind, type ContentResource } from "@/components/dashboard/apps/content/content-types";
import { kindLabel } from "@/components/dashboard/apps/content/viewer-registry";
import { ShareToDialog } from "@/components/sharing/share-to-dialog";
import { ShareAccessDialog } from "@/components/sharing/share-access-dialog";
import { SCOPE_LABELS, useResourceAccess, type ResourceRef } from "@/lib/sharing/access";
import type { ShareResourceRef } from "@/lib/sharing/share-targets";
import type { DesktopIcon } from "./desktop-store";
import { DesktopErrorBoundary, DesktopWidgetHost, widgetLabel } from "./desktop-widget-host";

export type QuickLookTab = "preview" | "info";

const ContentViewerLazy = dynamic(
    () => import("@/components/dashboard/apps/content/viewer-registry").then((m) => m.ContentViewer),
    {
        ssr: false,
        loading: () => (
            <div className="absolute inset-0 grid place-items-center text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-2"><Loader2 className="size-3.5 animate-spin" /> Cargando visor…</span>
            </div>
        ),
    },
);

// ── Traducción icono del escritorio → recursos del OS ─────────────

/** ContentKind efectivo de un icono de archivo. */
function iconContentKind(icon: DesktopIcon): ContentKind {
    if (icon.fileKind) return icon.fileKind as ContentKind;
    return detectKind({ url: icon.url, name: icon.name });
}

/**
 * ResourceRef (permisos) del icono. Los archivos y folders del escritorio son
 * recursos de primera clase de `access.ts`; apps y widgets son referencias al
 * catálogo del sistema (no tienen ACL propia) → devolvemos null y la UI lo dice.
 */
function iconResourceRef(icon: DesktopIcon): ResourceRef | null {
    if (icon.kind === "file") {
        return { type: "file", id: icon.refId ?? icon.id, title: icon.name };
    }
    if (icon.kind === "folder") {
        return { type: "folder", id: icon.id, title: icon.name };
    }
    return null;
}

/**
 * ShareResourceRef (compartir hacia publicación/mensaje/entidad/cerebro/enlace).
 * El vocabulario de `share-targets.ts` es cerebro|biblioteca|folder|archivo|
 * publicacion → los iconos del escritorio se traducen a él. Apps y widgets no
 * son recursos compartibles (son referencias al catálogo) → null.
 */
function iconShareRef(icon: DesktopIcon): ShareResourceRef | null {
    switch (icon.kind) {
        case "file":
            return {
                kind: "archivo",
                id: icon.refId ?? icon.id,
                name: icon.name,
                url: icon.url,
                note: icon.fileKind === "note" ? icon.text?.slice(0, 280) : undefined,
            };
        case "link":
            return { kind: "archivo", id: icon.id, name: icon.name, url: icon.url };
        case "folder":
            return { kind: "folder", id: icon.id, name: icon.name };
        default:
            return null;
    }
}

// ── Pestaña: VISTA PREVIA ────────────────────────────────────────
function PreviewBody({ icon }: { icon: DesktopIcon }): React.ReactElement {
    const resource = useMemo<ContentResource>(() => ({
        id: `ql-${icon.id}`,
        kind: iconContentKind(icon),
        title: icon.name,
        url: icon.url,
        origin: "library",
    }), [icon]);

    // Nota rápida: su texto es el contenido (no hay URL que visar).
    if (icon.kind === "file" && icon.fileKind === "note") {
        return (
            <div className="h-full overflow-y-auto whitespace-pre-wrap p-5 text-[13px] leading-relaxed text-foreground/90">
                {icon.text?.trim()
                    ? icon.text
                    : <span className="text-muted-foreground">Esta nota está vacía.</span>}
            </div>
        );
    }

    if (icon.kind === "file") {
        return (
            <div className="relative h-full w-full">
                <DesktopErrorBoundary
                    fallback={<EmptyBody icon={FileQuestion} text="El visor no pudo mostrar este archivo. Ábrelo en una ventana." />}
                >
                    <ContentViewerLazy resource={resource} />
                </DesktopErrorBoundary>
            </div>
        );
    }

    if (icon.kind === "widget" && icon.refId) {
        return (
            <div className="h-full w-full overflow-auto p-3">
                <div className="relative min-h-full overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                    <DesktopWidgetHost type={icon.refId} instanceId={`ql-${icon.id}`} className="min-h-full" />
                </div>
            </div>
        );
    }

    if (icon.kind === "app") {
        const app = icon.refId ? getApp(icon.refId) : undefined;
        if (!app) return <EmptyBody icon={LayoutGrid} text="Esta app ya no está en el catálogo del sistema." />;
        return (
            <div className="grid h-full place-items-center p-6 text-center">
                <div className="max-w-sm space-y-3">
                    <span
                        className="mx-auto grid place-items-center overflow-hidden rounded-2xl border border-white/15"
                        style={{ width: 64, height: 64, background: `linear-gradient(135deg, ${app.accent}, color-mix(in srgb, ${app.accent} 35%, transparent))` }}
                    >
                        {app.iconUrl
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={app.iconUrl} alt="" className="h-full w-full object-cover" draggable={false} />
                            : <app.icon className="size-7 text-white" />}
                    </span>
                    <h4 className="text-sm font-black">{app.name}</h4>
                    <p className="text-xs leading-relaxed text-muted-foreground">{app.description}</p>
                </div>
            </div>
        );
    }

    if (icon.kind === "link") {
        return (
            <div className="relative h-full w-full">
                <ContentViewerLazy resource={{ ...resource, kind: "link" }} />
            </div>
        );
    }

    // Folder: su contenido.
    const children = icon.children ?? [];
    return (
        <div className="h-full overflow-y-auto p-3">
            {children.length === 0 ? (
                <EmptyBody icon={FolderOpen} text="Este folder está vacío." />
            ) : (
                <ul className="space-y-1">
                    {children.map((c) => (
                        <li key={c.id} className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-1.5">
                            <span
                                className="size-2 shrink-0 rounded-full"
                                style={{ background: c.accent ?? "#64748B" }}
                            />
                            <span className="min-w-0 flex-1 truncate text-[12px] font-semibold">{c.name}</span>
                            <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/70">
                                {c.kind}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function EmptyBody({ icon: Icon, text }: { icon: React.ElementType; text: string }): React.ReactElement {
    return (
        <div className="grid h-full place-items-center p-6 text-center">
            <div className="space-y-2">
                <Icon className="mx-auto size-7 text-muted-foreground/60" />
                <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">{text}</p>
            </div>
        </div>
    );
}

// ── Pestaña: INFORMACIÓN (+ acceso real) ─────────────────────────
function InfoRow({ label, value }: { label: string; value: React.ReactNode }): React.ReactElement {
    return (
        <div className="flex gap-3 border-b border-white/[0.06] py-1.5 last:border-0">
            <span className="w-28 shrink-0 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground/70">
                {label}
            </span>
            <span className="min-w-0 flex-1 break-words text-[12px] font-semibold text-foreground/90">{value}</span>
        </div>
    );
}

function InfoBody({ icon, resourceRef }: { icon: DesktopIcon; resourceRef: ResourceRef | null }): React.ReactElement {
    const { access, loading } = useResourceAccess(resourceRef);
    const app = icon.kind === "app" && icon.refId ? getApp(icon.refId) : undefined;

    const kindText =
        icon.kind === "app" ? "App del catálogo"
            : icon.kind === "widget" ? "Widget del sistema"
                : icon.kind === "folder" ? "Folder del escritorio"
                    : icon.kind === "link" ? "Enlace web"
                        : icon.fileKind === "note" ? "Nota rápida"
                            : `Archivo · ${kindLabel(iconContentKind(icon))}`;

    return (
        <div className="h-full overflow-y-auto px-4 py-2">
            <InfoRow label="Nombre" value={icon.name} />
            <InfoRow label="Tipo" value={kindText} />
            {icon.refId && <InfoRow label="Referencia" value={<code className="text-[11px]">{icon.refId}</code>} />}
            {icon.url && (
                <InfoRow
                    label="Origen"
                    value={
                        <a
                            href={icon.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-cyan-300 underline-offset-2 hover:underline cursor-pointer"
                        >
                            <span className="truncate">{icon.url}</span>
                            <ExternalLink className="size-3 shrink-0" />
                        </a>
                    }
                />
            )}
            {app && <InfoRow label="Estado" value={app.status === "soon" ? "En construcción" : app.status === "native" ? "Módulo nativo" : "En vivo"} />}
            {icon.kind === "widget" && icon.refId && <InfoRow label="Widget" value={widgetLabel(icon.refId)} />}
            {icon.kind === "folder" && <InfoRow label="Contiene" value={`${icon.children?.length ?? 0} elemento(s)`} />}
            {icon.createdAt && (
                <InfoRow label="Creado" value={new Date(icon.createdAt).toLocaleString("es-ES")} />
            )}
            {icon.text !== undefined && icon.fileKind === "note" && (
                <InfoRow label="Longitud" value={`${icon.text.length} caracteres`} />
            )}

            {/* ── Acceso y permisos (fuente real: access.ts) ── */}
            <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
                <p className="flex items-center gap-1.5 pb-1 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground/70">
                    <ShieldCheck className="size-3" /> Acceso
                </p>
                {!resourceRef ? (
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                        Las apps y los widgets son referencias al catálogo del sistema: no tienen
                        permisos propios. Quien vea tu escritorio, los ve.
                    </p>
                ) : loading ? (
                    <p className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Loader2 className="size-3 animate-spin" /> Consultando permisos…
                    </p>
                ) : (
                    <div className="space-y-0.5">
                        <p className="text-[12px] font-bold text-foreground/90">
                            {SCOPE_LABELS[access?.scope ?? "private"] ?? "Privado"}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                            {(access?.grants?.length ?? 0) === 0
                                ? "Sin accesos concedidos a otros perfiles."
                                : `${access!.grants.length} acceso(s) concedido(s).`}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Shell ────────────────────────────────────────────────────────
export function DesktopQuickLook({
    desktopId, icon, initialTab = "preview", onClose, onOpen,
}: {
    desktopId: string;
    icon: DesktopIcon;
    initialTab?: QuickLookTab;
    onClose: () => void;
    onOpen: (icon: DesktopIcon) => void;
}): React.ReactElement {
    const reduced = useReducedMotion();
    const [tab, setTab] = useState<QuickLookTab>(initialTab);
    const [shareOpen, setShareOpen] = useState(false);
    const [accessOpen, setAccessOpen] = useState(false);
    void desktopId;

    const resourceRef = useMemo(() => iconResourceRef(icon), [icon]);
    const shareRef = useMemo(() => iconShareRef(icon), [icon]);

    const HeadIcon =
        icon.kind === "folder" ? FolderOpen
            : icon.kind === "widget" ? LayoutGrid
                : icon.kind === "link" ? Globe
                    : icon.fileKind === "note" ? StickyNote
                        : icon.kind === "app" ? LayoutGrid
                            : FileQuestion;

    return (
        <>
            {/* Velo */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16 }}
                onClick={onClose}
                className="absolute inset-0 z-[64] bg-black/50"
                aria-hidden
            />
            {/* Panel — centrado con FLEX, no con `-translate-x-1/2`: Framer Motion
                escribe su propio `transform` (scale/y) y machacaría las clases de
                translate de Tailwind, dejando el panel descentrado. */}
            <div className="pointer-events-none absolute inset-0 z-[66] grid place-items-center p-4">
            <motion.div
                role="dialog"
                aria-label={`Vista previa de ${icon.name}`}
                initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 14 }}
                animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
                transition={reduced ? { duration: 0.14 } : { type: "spring", stiffness: 320, damping: 30 }}
                className={cn(
                    "ss-crystal pointer-events-auto flex w-[min(860px,100%)]",
                    "h-[min(620px,calc(100dvh-120px))] flex-col",
                    "overflow-hidden rounded-3xl border border-white/12 bg-card/95 shadow-2xl backdrop-blur-2xl",
                )}
            >
                <header className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-2">
                    <span
                        className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/15"
                        style={{ background: `linear-gradient(135deg, ${icon.accent ?? "#38BDF8"}, color-mix(in srgb, ${icon.accent ?? "#38BDF8"} 35%, transparent))` }}
                    >
                        {icon.iconUrl
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={icon.iconUrl} alt="" className="h-full w-full object-cover" draggable={false} />
                            : <HeadIcon className="size-3.5 text-white" />}
                    </span>
                    <h3 className="min-w-0 flex-1 truncate text-[13px] font-black tracking-tight">{icon.name}</h3>

                    {/* Pestañas */}
                    <div className="flex shrink-0 items-center gap-0.5 rounded-full border border-white/10 bg-white/[0.04] p-0.5">
                        {([["preview", Eye, "Vista previa"], ["info", Info, "Información"]] as Array<[QuickLookTab, typeof Eye, string]>).map(([id, Icon, label]) => (
                            <button
                                key={id}
                                type="button"
                                onClick={() => setTab(id)}
                                title={label}
                                aria-label={label}
                                className={cn(
                                    "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors cursor-pointer",
                                    tab === id ? "bg-white/15 text-foreground" : "text-muted-foreground hover:bg-white/[0.08]",
                                )}
                            >
                                <Icon className="size-3" />
                                <span className="max-sm:hidden">{label}</span>
                            </button>
                        ))}
                    </div>

                    {shareRef && (
                        <button
                            type="button"
                            onClick={() => setShareOpen(true)}
                            title="Compartir"
                            aria-label="Compartir"
                            className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground/80 transition-colors hover:bg-white/10 hover:text-foreground cursor-pointer"
                        >
                            <Share2 className="size-3.5" />
                        </button>
                    )}
                    {resourceRef && (
                        <button
                            type="button"
                            onClick={() => setAccessOpen(true)}
                            title="Acceso y permisos"
                            aria-label="Acceso y permisos"
                            className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground/80 transition-colors hover:bg-white/10 hover:text-foreground cursor-pointer"
                        >
                            <Lock className="size-3.5" />
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => onOpen(icon)}
                        title="Abrir en una ventana"
                        className="hidden shrink-0 items-center gap-1.5 rounded-full border border-cyan-300/40 bg-cyan-400/15 px-3 py-1 text-[11px] font-black text-cyan-100 transition-colors hover:bg-cyan-400/25 cursor-pointer sm:inline-flex"
                    >
                        <ExternalLink className="size-3" /> Abrir
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        title="Cerrar (Esc)"
                        aria-label="Cerrar vista previa"
                        className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground/70 transition-colors hover:bg-white/10 hover:text-foreground cursor-pointer"
                    >
                        <X className="size-3.5" />
                    </button>
                </header>

                <div className="relative min-h-0 flex-1 bg-black/25">
                    {tab === "preview" ? <PreviewBody icon={icon} /> : <InfoBody icon={icon} resourceRef={resourceRef} />}
                </div>
            </motion.div>
            </div>

            {shareRef && (
                <ShareToDialog open={shareOpen} onOpenChange={setShareOpen} resource={shareRef} />
            )}
            {resourceRef && (
                <ShareAccessDialog
                    open={accessOpen}
                    onOpenChange={setAccessOpen}
                    resource={resourceRef}
                    title={`Acceso a «${icon.name}»`}
                    description="Quién puede ver o editar este recurso del escritorio."
                />
            )}
        </>
    );
}
