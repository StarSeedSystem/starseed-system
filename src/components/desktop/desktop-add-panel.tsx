'use client';

// ════════════════════════════════════════════════════════════════
// StarSeed OS — Panel "+ Añadir" del escritorio (catálogo glass)
// ----------------------------------------------------------------
// Categorías: Apps StarSeed (app-catalog existente) · Widgets (registry
// existente vía manifest) · Archivos (Mi Biblioteca, library-store) ·
// Navegador (ventana con iframe defensivo) · Nuevo folder.
// Puede apuntar al escritorio o al interior de un folder (targetFolderId).
// Solo referencias (Lienzo Universal): nunca duplica entidades.
// ════════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
    X, Rocket, LayoutGrid, FolderOpen, Globe, FolderPlus, Search, Plus,
    Check, ExternalLink, MonitorPlay, Library as LibraryIcon, Eye, EyeOff,
    type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { APP_CATALOG } from "@/components/dashboard/apps/app-catalog";
import { useSavedLibrary } from "@/lib/library-store";
import { detectKind } from "@/components/dashboard/apps/content/content-types";
import { addIcon, openWindow, type Desktop, type NewIconInput } from "./desktop-store";
import { getWidgetCatalog, widgetAccent, widgetWindowSize, DesktopWidgetHost } from "./desktop-widget-host";
import { useOpenDesktopIcon } from "./desktop-open";

export type AddPanelTab = "apps" | "widgets" | "files" | "web" | "folder";

const TABS: Array<{ id: AddPanelTab; label: string; icon: LucideIcon }> = [
    { id: "apps", label: "Apps", icon: Rocket },
    { id: "widgets", label: "Widgets", icon: LayoutGrid },
    { id: "files", label: "Archivos", icon: FolderOpen },
    { id: "web", label: "Navegador", icon: Globe },
    { id: "folder", label: "Folder", icon: FolderPlus },
];

const CONTENT_KINDS = new Set([
    "image", "gif", "gallery", "video", "audio", "pdf", "html", "model3d",
    "markdown", "code", "text", "dataset", "link", "entity", "app", "unknown",
]);

function prettyCategory(id: string): string {
    return id.charAt(0).toUpperCase() + id.slice(1);
}

export function DesktopAddPanel({
    desktop, open, initialTab, targetFolderId, onClose,
}: {
    desktop: Desktop | null;
    open: boolean;
    initialTab?: AddPanelTab;
    /** Si está definido, lo añadido entra DENTRO de ese folder. */
    targetFolderId?: string | null;
    onClose: () => void;
}): React.ReactElement {
    const reduced = useReducedMotion();
    const router = useRouter();
    const [tab, setTab] = useState<AddPanelTab>(initialTab ?? "apps");
    const [added, setAdded] = useState<Set<string>>(new Set());
    const openIcon = useOpenDesktopIcon(desktop?.id);

    useEffect(() => {
        if (open) setTab(initialTab ?? "apps");
    }, [open, initialTab]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    const folderName = useMemo(() => {
        if (!targetFolderId || !desktop) return null;
        return desktop.icons.find((i) => i.id === targetFolderId)?.name ?? null;
    }, [targetFolderId, desktop]);

    const markAdded = (key: string) => {
        setAdded((s) => new Set(s).add(key));
        window.setTimeout(() => {
            setAdded((s) => {
                const next = new Set(s);
                next.delete(key);
                return next;
            });
        }, 1600);
    };

    const doAdd = (key: string, input: NewIconInput) => {
        if (!desktop) return;
        addIcon(desktop.id, input, targetFolderId ?? undefined);
        markAdded(key);
    };

    const visibleTabs = targetFolderId ? TABS.filter((t) => t.id !== "folder") : TABS;

    return (
        <AnimatePresence>
            {open && desktop && (
                <>
                    {/* Velo sutil */}
                    <motion.div
                        key="add-backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        onClick={onClose}
                        className="absolute inset-0 z-[48] bg-black/35 backdrop-blur-[2px]"
                        aria-hidden
                    />
                    {/* Hoja catálogo */}
                    <motion.aside
                        key="add-sheet"
                        role="dialog"
                        aria-label="Añadir al escritorio"
                        initial={reduced ? { opacity: 0 } : { opacity: 0, x: 60, filter: "blur(6px)" }}
                        animate={reduced ? { opacity: 1 } : { opacity: 1, x: 0, filter: "blur(0px)" }}
                        exit={reduced ? { opacity: 0 } : { opacity: 0, x: 60, filter: "blur(6px)" }}
                        transition={reduced ? { duration: 0.15 } : { type: "spring", stiffness: 320, damping: 32 }}
                        className={cn(
                            "absolute z-[49] flex flex-col overflow-hidden border border-white/12 bg-card/90 backdrop-blur-2xl shadow-2xl",
                            "max-sm:inset-x-2 max-sm:bottom-2 max-sm:top-auto max-sm:h-[76%] max-sm:rounded-3xl",
                            "sm:bottom-3 sm:right-3 sm:top-14 sm:w-[440px] sm:max-w-[calc(100%-24px)] sm:rounded-3xl",
                        )}
                    >
                        <span aria-hidden className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent" />

                        {/* Cabecera */}
                        <header className="flex shrink-0 items-center gap-2 px-4 pb-2 pt-3.5">
                            <div className="min-w-0 flex-1">
                                <h3 className="text-sm font-black tracking-tight">Añadir al escritorio</h3>
                                <p className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
                                    {folderName ? `Dentro de: ${folderName}` : desktop.name}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                title="Cerrar"
                                aria-label="Cerrar catálogo"
                                className="grid size-8 place-items-center rounded-full text-muted-foreground/70 transition-colors hover:bg-white/10 hover:text-foreground cursor-pointer"
                            >
                                <X className="size-4" />
                            </button>
                        </header>

                        {/* Pestañas */}
                        <nav className="flex shrink-0 gap-1 px-3 pb-2">
                            {visibleTabs.map(({ id, label, icon: Icon }) => (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => setTab(id)}
                                    className={cn(
                                        "flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-2 py-1.5 text-[11px] font-bold transition-all duration-200 cursor-pointer",
                                        tab === id
                                            ? "border-cyan-300/50 bg-cyan-400/10 text-cyan-200 shadow-[0_0_14px_rgba(34,211,238,0.2)]"
                                            : "border-white/10 bg-white/[0.03] text-muted-foreground hover:bg-white/[0.07] hover:text-foreground",
                                    )}
                                >
                                    <Icon className="size-3.5" />
                                    <span className="max-sm:hidden">{label}</span>
                                </button>
                            ))}
                        </nav>

                        {/* Contenido */}
                        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
                            {tab === "apps" && <AppsTab added={added} onAdd={doAdd} />}
                            {tab === "widgets" && (
                                <WidgetsTab
                                    added={added}
                                    onAdd={doAdd}
                                    onOpenWindow={(type, label) => {
                                        openWindow(desktop.id, { type: "widget", ref: type, name: label }, widgetWindowSize(type));
                                        onClose();
                                    }}
                                />
                            )}
                            {tab === "files" && (
                                <FilesTab
                                    added={added}
                                    onAdd={doAdd}
                                    onOpen={(input) => {
                                        openIcon({
                                            id: "tmp-open", kind: "file", name: input.name, url: input.url,
                                            fileKind: input.fileKind, x: 0, y: 0, size: "md", viewMode: "icon",
                                        });
                                        onClose();
                                    }}
                                    goLibrary={() => router.push("/library")}
                                />
                            )}
                            {tab === "web" && (
                                <WebTab
                                    added={added}
                                    onAdd={doAdd}
                                    onOpenWindow={(url, name) => {
                                        openWindow(desktop.id, { type: "browser", ref: url, name }, { w: 980, h: 660 });
                                        onClose();
                                    }}
                                />
                            )}
                            {tab === "folder" && !targetFolderId && (
                                <FolderTab
                                    onCreate={(name) => {
                                        doAdd(`folder:${name}`, { kind: "folder", name });
                                    }}
                                />
                            )}
                        </div>
                    </motion.aside>
                </>
            )}
        </AnimatePresence>
    );
}

// ── Pestaña: Apps StarSeed ───────────────────────────────────────
function AppsTab({ added, onAdd }: {
    added: Set<string>;
    onAdd: (key: string, input: NewIconInput) => void;
}): React.ReactElement {
    return (
        <div className="grid grid-cols-3 gap-2">
            {APP_CATALOG.map((app) => {
                const key = `app:${app.id}`;
                const isAdded = added.has(key);
                return (
                    <button
                        key={app.id}
                        type="button"
                        title={app.description}
                        onClick={() =>
                            onAdd(key, {
                                kind: "app",
                                refId: app.id,
                                name: app.name,
                                iconUrl: app.iconUrl,
                                accent: app.accent,
                            })
                        }
                        className={cn(
                            "group relative flex flex-col items-center gap-1.5 rounded-2xl border p-2.5 transition-all duration-200 cursor-pointer",
                            isAdded
                                ? "border-emerald-400/50 bg-emerald-400/10"
                                : "border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.07]",
                        )}
                    >
                        <span
                            className="grid size-11 place-items-center overflow-hidden rounded-[26%] border border-white/15 shadow"
                            style={{ background: `linear-gradient(135deg, ${app.accent}, color-mix(in srgb, ${app.accent} 30%, transparent))` }}
                        >
                            {app.iconUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={app.iconUrl} alt="" className="h-full w-full object-cover" draggable={false} />
                            ) : (
                                <app.icon className="size-5 text-white" strokeWidth={2} />
                            )}
                        </span>
                        <span className="line-clamp-2 text-center text-[10px] font-bold leading-tight">
                            {app.short ?? app.name}
                        </span>
                        <span
                            className={cn(
                                "absolute right-1.5 top-1.5 grid size-4.5 place-items-center rounded-full border text-[9px]",
                                isAdded
                                    ? "border-emerald-300/60 bg-emerald-400/30 text-emerald-100"
                                    : "border-white/15 bg-black/40 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100",
                            )}
                            style={{ width: 18, height: 18 }}
                        >
                            {isAdded ? <Check className="size-3" /> : <Plus className="size-3" />}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

// ── Pestaña: Widgets (registry real) ─────────────────────────────
function WidgetsTab({ added, onAdd, onOpenWindow }: {
    added: Set<string>;
    onAdd: (key: string, input: NewIconInput) => void;
    onOpenWindow: (type: string, label: string) => void;
}): React.ReactElement {
    const [q, setQ] = useState("");
    const [previewType, setPreviewType] = useState<string | null>(null);
    const catalog = useMemo(() => getWidgetCatalog(), []);
    const filtered = useMemo(() => {
        const t = q.trim().toLowerCase();
        if (!t) return catalog;
        return catalog.filter((w) =>
            w.label.toLowerCase().includes(t) || w.category.toLowerCase().includes(t),
        );
    }, [q, catalog]);

    return (
        <div className="space-y-2">
            <div className="sticky top-0 z-10 flex items-center gap-2 rounded-xl border border-white/10 bg-black/50 px-2.5 py-1.5 backdrop-blur-xl">
                <Search className="size-3.5 shrink-0 text-muted-foreground" />
                <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Buscar widget…"
                    className="min-w-0 flex-1 bg-transparent text-[12px] font-medium outline-none placeholder:text-muted-foreground/60"
                />
            </div>
            {filtered.length === 0 && (
                <p className="px-2 py-6 text-center text-xs text-muted-foreground">Sin resultados para “{q}”.</p>
            )}
            {filtered.map((w) => {
                const accent = widgetAccent(w.category);
                const keyIcon = `widget:${w.type}`;
                const previewing = previewType === w.type;
                return (
                    <div
                        key={w.type}
                        className="rounded-2xl border border-white/10 bg-white/[0.03] transition-colors hover:bg-white/[0.06]"
                    >
                        <div className="flex items-center gap-2.5 p-2">
                            <span
                                className="grid size-8 shrink-0 place-items-center rounded-xl border border-white/15"
                                style={{ background: `linear-gradient(135deg, ${accent}, color-mix(in srgb, ${accent} 30%, transparent))` }}
                            >
                                <LayoutGrid className="size-4 text-white" strokeWidth={2} />
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-[12px] font-bold leading-tight">{w.label}</p>
                                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
                                    {prettyCategory(w.category)}
                                </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                                <MiniAction
                                    title={previewing ? "Ocultar vista previa" : "Ver vista previa"}
                                    added={false}
                                    onClick={() => setPreviewType(previewing ? null : w.type)}
                                >
                                    {previewing ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                                </MiniAction>
                                <MiniAction
                                    title="Añadir como icono"
                                    added={added.has(keyIcon)}
                                    onClick={() =>
                                        onAdd(keyIcon, { kind: "widget", refId: w.type, name: w.label, accent, viewMode: "icon" })
                                    }
                                >
                                    <Plus className="size-3.5" />
                                </MiniAction>
                                <MiniAction
                                    title="Añadir con vista previa viva"
                                    added={added.has(`${keyIcon}:prev`)}
                                    onClick={() =>
                                        onAdd(`${keyIcon}:prev`, { kind: "widget", refId: w.type, name: w.label, accent, viewMode: "preview" })
                                    }
                                >
                                    <MonitorPlay className="size-3.5" />
                                </MiniAction>
                                <MiniAction title="Abrir en ventana" onClick={() => onOpenWindow(w.type, w.label)}>
                                    <ExternalLink className="size-3.5" />
                                </MiniAction>
                            </div>
                        </div>
                        {previewing && (
                            <div className="border-t border-white/10 p-2">
                                <div
                                    className="relative h-40 overflow-hidden rounded-xl border border-white/12 bg-black/40"
                                    style={{ boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${accent} 25%, transparent)` }}
                                >
                                    <DesktopWidgetHost type={w.type} instanceId={`gallery-prev-${w.type}`} interactive={false} />
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

function MiniAction({ title, added, onClick, children }: {
    title: string;
    added?: boolean;
    onClick: () => void;
    children: React.ReactNode;
}): React.ReactElement {
    return (
        <button
            type="button"
            title={title}
            aria-label={title}
            onClick={onClick}
            className={cn(
                "grid size-7 place-items-center rounded-full border transition-colors cursor-pointer",
                added
                    ? "border-emerald-300/60 bg-emerald-400/20 text-emerald-200"
                    : "border-white/12 text-muted-foreground hover:bg-white/10 hover:text-foreground",
            )}
        >
            {added ? <Check className="size-3.5" /> : children}
        </button>
    );
}

// ── Pestaña: Archivos (Mi Biblioteca) ────────────────────────────
function FilesTab({ added, onAdd, onOpen, goLibrary }: {
    added: Set<string>;
    onAdd: (key: string, input: NewIconInput) => void;
    onOpen: (input: { name: string; url?: string; fileKind?: string }) => void;
    goLibrary: () => void;
}): React.ReactElement {
    const { items } = useSavedLibrary();

    if (items.length === 0) {
        return (
            <div className="grid place-items-center px-4 py-10 text-center">
                <div className="max-w-[260px] space-y-3">
                    <LibraryIcon className="mx-auto size-8 text-muted-foreground/60" />
                    <p className="text-xs leading-relaxed text-muted-foreground">
                        Tu Biblioteca todavía no tiene recursos guardados. Guarda archivos y
                        entidades desde cualquier parte del OS y aparecerán aquí.
                    </p>
                    <button
                        type="button"
                        onClick={goLibrary}
                        className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/30 bg-amber-300/10 px-3.5 py-1.5 text-[11px] font-bold text-amber-200 transition-colors hover:bg-amber-300/20 cursor-pointer"
                    >
                        <LibraryIcon className="size-3.5" /> Ir a la Biblioteca
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-1.5">
            {items.map((r) => {
                const fileKind = CONTENT_KINDS.has(r.kind)
                    ? r.kind
                    : detectKind({ url: r.url, name: r.title });
                const key = `file:${r.id}`;
                return (
                    <div
                        key={r.id}
                        className="flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.03] p-2 transition-colors hover:bg-white/[0.06]"
                    >
                        <span className="grid size-8 shrink-0 place-items-center rounded-xl border border-white/15 bg-sky-400/15">
                            <FolderOpen className="size-4 text-sky-200" strokeWidth={2} />
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-[12px] font-bold leading-tight">{r.title}</p>
                            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
                                {fileKind}{r.origin ? ` · ${r.origin}` : ""}
                            </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                            <MiniAction
                                title="Añadir al escritorio"
                                added={added.has(key)}
                                onClick={() =>
                                    onAdd(key, {
                                        kind: "file",
                                        refId: r.id,
                                        name: r.title,
                                        url: r.url,
                                        fileKind,
                                        viewMode: fileKind === "image" || fileKind === "gif" ? "preview" : "icon",
                                    })
                                }
                            >
                                <Plus className="size-3.5" />
                            </MiniAction>
                            <MiniAction
                                title="Abrir ahora"
                                onClick={() => onOpen({ name: r.title, url: r.url, fileKind })}
                            >
                                <ExternalLink className="size-3.5" />
                            </MiniAction>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ── Pestaña: Navegador ───────────────────────────────────────────
function WebTab({ added, onAdd, onOpenWindow }: {
    added: Set<string>;
    onAdd: (key: string, input: NewIconInput) => void;
    onOpenWindow: (url: string, name?: string) => void;
}): React.ReactElement {
    const [url, setUrl] = useState("");
    const suggestions = useMemo(() => APP_CATALOG.filter((a) => Boolean(a.open.href)).slice(0, 4), []);
    const clean = url.trim();

    return (
        <div className="space-y-3">
            <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <label className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                    Dirección web
                </label>
                <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && clean) onOpenWindow(clean); }}
                    placeholder="https://…"
                    spellCheck={false}
                    className="h-8 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-[12px] font-medium outline-none transition-colors focus:border-cyan-400/50"
                />
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        disabled={!clean}
                        onClick={() => onOpenWindow(clean)}
                        className="inline-flex items-center gap-1.5 rounded-full bg-cyan-500/20 px-3.5 py-1.5 text-[11px] font-bold text-cyan-200 transition-colors hover:bg-cyan-500/30 disabled:opacity-40 cursor-pointer"
                    >
                        <Globe className="size-3.5" /> Abrir ventana
                    </button>
                    <button
                        type="button"
                        disabled={!clean}
                        onClick={() =>
                            onAdd(`link:${clean}`, {
                                kind: "link",
                                name: clean.replace(/^https?:\/\//i, "").split("/")[0] || "Enlace",
                                url: clean,
                                accent: "#22D3EE",
                            })
                        }
                        className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[11px] font-bold transition-colors disabled:opacity-40 cursor-pointer",
                            added.has(`link:${clean}`)
                                ? "border-emerald-300/50 bg-emerald-400/15 text-emerald-200"
                                : "border-white/12 text-muted-foreground hover:bg-white/10 hover:text-foreground",
                        )}
                    >
                        {added.has(`link:${clean}`) ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
                        Crear acceso directo
                    </button>
                </div>
            </div>

            <div className="space-y-1.5">
                <p className="px-1 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                    Destinos del ecosistema
                </p>
                {suggestions.map((a) => (
                    <button
                        key={a.id}
                        type="button"
                        onClick={() => a.open.href && onOpenWindow(a.open.href, a.name)}
                        className="flex w-full items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.03] p-2 text-left transition-colors hover:bg-white/[0.07] cursor-pointer"
                    >
                        <span
                            className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/15"
                            style={{ background: `linear-gradient(135deg, ${a.accent}, color-mix(in srgb, ${a.accent} 30%, transparent))` }}
                        >
                            {a.iconUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={a.iconUrl} alt="" className="h-full w-full object-cover" draggable={false} />
                            ) : (
                                <a.icon className="size-4 text-white" />
                            )}
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12px] font-bold leading-tight">{a.name}</span>
                            <span className="block truncate text-[10px] text-muted-foreground">{a.open.href}</span>
                        </span>
                        <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
                    </button>
                ))}
            </div>
        </div>
    );
}

// ── Pestaña: Nuevo folder ───────────────────────────────────────
function FolderTab({ onCreate }: { onCreate: (name: string) => void }): React.ReactElement {
    const [name, setName] = useState("");
    const [done, setDone] = useState(false);
    const clean = name.trim();

    const create = () => {
        if (!clean) return;
        onCreate(clean);
        setName("");
        setDone(true);
        window.setTimeout(() => setDone(false), 1600);
    };

    return (
        <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <label className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                Nombre del folder
            </label>
            <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") create(); }}
                placeholder="Proyectos, Media, Gobernanza…"
                className="h-8 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-[12px] font-medium outline-none transition-colors focus:border-amber-300/50"
            />
            <button
                type="button"
                disabled={!clean}
                onClick={create}
                className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[11px] font-bold transition-colors disabled:opacity-40 cursor-pointer",
                    done
                        ? "border-emerald-300/50 bg-emerald-400/15 text-emerald-200"
                        : "border-amber-300/30 bg-amber-300/10 text-amber-200 hover:bg-amber-300/20",
                )}
            >
                {done ? <Check className="size-3.5" /> : <FolderPlus className="size-3.5" />}
                {done ? "Folder creado" : "Crear folder"}
            </button>
        </div>
    );
}
