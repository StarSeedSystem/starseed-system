"use client";

/*
 * ShareToDialog — "Compartir / Enviar a…" UNIVERSAL (Adenda 66 §5).
 * ----------------------------------------------------------------------------
 * DISTINTO de `share-access-dialog.tsx` (que gestiona PERMISOS: ámbito + roles).
 * Aquí el usuario ENVÍA un recurso {cerebro · biblioteca · folder · archivo ·
 * publicación} a un DESTINO real:
 *   · Publicación → abre el Lienzo Universal (/crear) con el recurso integrado.
 *   · Mensaje     → adjunta el recurso a un hilo de /messages.
 *   · Entidad     → publica en un grupo / página / comunidad (os_posts).
 *   · Cerebro     → lo añade como fuente/memoria de un cerebro.
 *   · Enlace      → copia el enlace profundo.
 *   · Librería    → lo copia/refiere en una biblioteca.
 *
 * Toda la lógica de destino vive en `src/lib/sharing/share-targets.ts`. Este
 * componente es la UI (Crystal Liquid Glass, español, iconos Lucide). Datos
 * reales; sin sesión, cada acción degrada con un toast honesto.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Send, PenSquare, MessageSquare, Users, Brain as BrainIcon, Link2, Library,
    Copy, Check, Loader2, ChevronLeft, Search, ArrowRight, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
    Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
    stageCreationAttach, toCreationAttach, deepLinkFor, shareToThread, shareToEntity,
    shareToBrain, shareToLibrary, type ShareResourceRef, type EntityDest,
} from "@/lib/sharing/share-targets";
import { listThreads, type DmThreadSummary } from "@/lib/messages/dm";
import { searchGroups, type SocialGroupHit } from "@/lib/social/os-profiles";
import { listBrains, type Brain } from "@/lib/brains/brains";
import { myLibraryDestinations, type LibraryDestination } from "@/lib/library/entity-library";
import type { OsEntityType } from "@/lib/os-social";

type Dest = "publicacion" | "mensaje" | "entidad" | "cerebro" | "enlace" | "libreria";

interface DestDef {
    id: Dest;
    label: string;
    desc: string;
    icon: LucideIcon;
    accent: string;
}

const DESTS: DestDef[] = [
    { id: "publicacion", label: "Publicación", desc: "Ábrelo en el Lienzo Universal", icon: PenSquare, accent: "text-emerald-300" },
    { id: "mensaje", label: "Mensaje", desc: "Adjúntalo a un hilo", icon: MessageSquare, accent: "text-sky-300" },
    { id: "entidad", label: "Grupo · Página · Comunidad", desc: "Publícalo en una entidad", icon: Users, accent: "text-indigo-300" },
    { id: "cerebro", label: "Cerebro", desc: "Añádelo como fuente/memoria", icon: BrainIcon, accent: "text-cyan-300" },
    { id: "libreria", label: "Librería", desc: "Guárdalo en una biblioteca", icon: Library, accent: "text-teal-300" },
    { id: "enlace", label: "Enlace", desc: "Copia el enlace profundo", icon: Link2, accent: "text-amber-300" },
];

export interface ShareToDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    resource: ShareResourceRef;
}

export function ShareToDialog({ open, onOpenChange, resource }: ShareToDialogProps) {
    const [dest, setDest] = useState<Dest | null>(null);

    // Reinicia al abrir (empieza siempre en el menú de destinos).
    useEffect(() => {
        if (open) setDest(null);
    }, [open]);

    const close = () => onOpenChange(false);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md border-white/10 bg-black/90 backdrop-blur-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-base">
                        <Send className="h-4 w-4 text-primary" />
                        {dest ? DESTS.find((d) => d.id === dest)?.label : "Compartir / Enviar a…"}
                    </DialogTitle>
                    <DialogDescription className="truncate text-xs">
                        {resource.name}
                    </DialogDescription>
                </DialogHeader>

                {!dest ? (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {DESTS.map((d) => {
                            const Icon = d.icon;
                            return (
                                <button
                                    key={d.id}
                                    type="button"
                                    onClick={() => setDest(d.id)}
                                    className="group flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-left transition-colors hover:border-white/25 hover:bg-white/[0.05] cursor-pointer"
                                >
                                    <span className={cn("mt-0.5 shrink-0", d.accent)}>
                                        <Icon className="h-4 w-4" />
                                    </span>
                                    <span className="min-w-0">
                                        <span className="block text-sm font-medium text-white/90">{d.label}</span>
                                        <span className="block text-[11px] text-white/45">{d.desc}</span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <div className="space-y-3">
                        <button
                            type="button"
                            onClick={() => setDest(null)}
                            className="inline-flex items-center gap-1 text-xs text-white/50 hover:text-white cursor-pointer"
                        >
                            <ChevronLeft className="h-3.5 w-3.5" /> Otros destinos
                        </button>
                        {dest === "publicacion" && <PublishPanel resource={resource} onDone={close} />}
                        {dest === "mensaje" && <MessagePanel resource={resource} onDone={close} />}
                        {dest === "entidad" && <EntityPanel resource={resource} onDone={close} />}
                        {dest === "cerebro" && <BrainPanel resource={resource} onDone={close} />}
                        {dest === "libreria" && <LibraryPanel resource={resource} onDone={close} />}
                        {dest === "enlace" && <LinkPanel resource={resource} />}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

/* ─────────────────────────── Publicación ─────────────────────────── */

function PublishPanel({ resource, onDone }: { resource: ShareResourceRef; onDone: () => void }) {
    const go = () => {
        const route = stageCreationAttach(toCreationAttach(resource));
        onDone();
        if (typeof window !== "undefined") window.location.assign(route);
    };
    return (
        <div className="space-y-3">
            <p className="text-xs text-white/60">
                Se abrirá el Lienzo Universal con «{resource.name}» ya integrado como bloque. Podrás combinarlo con
                texto, media y más antes de publicar.
            </p>
            <Button onClick={go} className="w-full gap-1.5 cursor-pointer">
                <PenSquare className="h-4 w-4" /> Abrir el Lienzo <ArrowRight className="h-3.5 w-3.5" />
            </Button>
        </div>
    );
}

/* ─────────────────────────── Enlace ─────────────────────────── */

function LinkPanel({ resource }: { resource: ShareResourceRef }) {
    const [copied, setCopied] = useState(false);
    const link = useMemo(() => deepLinkFor(resource), [resource]);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(link);
            setCopied(true);
            toast.success("Enlace copiado");
            setTimeout(() => setCopied(false), 1800);
        } catch {
            toast.error("No se pudo copiar el enlace");
        }
    };
    return (
        <div className="space-y-2">
            <p className="text-xs text-white/60">Enlace profundo del recurso:</p>
            <div className="flex items-center gap-2">
                <Input readOnly value={link} className="h-9 border-white/10 bg-black/30 text-xs" onFocus={(e) => e.currentTarget.select()} />
                <Button size="icon" variant="outline" onClick={copy} className="h-9 w-9 shrink-0 cursor-pointer" aria-label="Copiar enlace">
                    {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                </Button>
            </div>
        </div>
    );
}

/* ─────────────────────────── Mensaje ─────────────────────────── */

function MessagePanel({ resource, onDone }: { resource: ShareResourceRef; onDone: () => void }) {
    const [threads, setThreads] = useState<DmThreadSummary[] | null>(null);
    const [busy, setBusy] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        listThreads().then((t) => alive && setThreads(t)).catch(() => alive && setThreads([]));
        return () => { alive = false; };
    }, []);

    const send = async (t: DmThreadSummary) => {
        setBusy(t.id);
        const res = await shareToThread(t.id, resource);
        setBusy(null);
        if (res.ok) {
            toast.success("Enviado al hilo");
            onDone();
        } else {
            toast.error(res.error ?? "No se pudo enviar");
        }
    };

    if (threads === null) {
        return <PanelLoading label="Cargando tus conversaciones…" />;
    }
    if (threads.length === 0) {
        return (
            <EmptyPanel
                text="No tienes conversaciones todavía."
                cta={{ label: "Ir a Mensajes", href: "/messages" }}
            />
        );
    }
    return (
        <ul className="max-h-64 space-y-1 overflow-y-auto pr-1">
            {threads.map((t) => (
                <li key={t.id}>
                    <button
                        type="button"
                        disabled={!!busy}
                        onClick={() => void send(t)}
                        className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-left text-sm hover:bg-white/[0.06] disabled:opacity-50 cursor-pointer"
                    >
                        <MessageSquare className="h-3.5 w-3.5 shrink-0 text-sky-300" />
                        <span className="min-w-0 flex-1 truncate">
                            {t.title || (t.kind === "group" ? "Grupo" : "Conversación")}
                        </span>
                        {busy === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5 text-white/40" />}
                    </button>
                </li>
            ))}
        </ul>
    );
}

/* ─────────────────────────── Entidad (grupo/página/comunidad) ─────────────────────────── */

function EntityPanel({ resource, onDone }: { resource: ShareResourceRef; onDone: () => void }) {
    const [q, setQ] = useState("");
    const [hits, setHits] = useState<SocialGroupHit[]>([]);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);

    useEffect(() => {
        const term = q.trim();
        if (term.length < 1) {
            setHits([]);
            return;
        }
        let alive = true;
        setLoading(true);
        const h = setTimeout(() => {
            searchGroups(term).then((r) => { if (alive) { setHits(r); setLoading(false); } }).catch(() => alive && setLoading(false));
        }, 220);
        return () => { alive = false; clearTimeout(h); };
    }, [q]);

    const publish = async (hit: SocialGroupHit) => {
        const dest: EntityDest = {
            entityType: (hit.kind === "grupo" ? "group" : "page") as OsEntityType,
            entitySlug: hit.slug,
            label: hit.name,
        };
        setBusy(hit.id);
        const res = await shareToEntity(dest, resource);
        setBusy(null);
        if (res.ok) {
            toast.success(`Publicado en ${hit.name}`);
            onDone();
        } else {
            toast.error(res.needsAuth ? "Inicia sesión para publicar" : res.error ?? "No se pudo publicar");
        }
    };

    return (
        <div className="space-y-2">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
                <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Busca un grupo, página o comunidad…"
                    className="h-9 border-white/10 bg-black/30 pl-8 text-xs"
                />
            </div>
            {loading ? (
                <PanelLoading label="Buscando…" />
            ) : hits.length === 0 ? (
                <p className="px-1 py-3 text-center text-xs text-white/40">
                    {q.trim() ? "Sin resultados." : "Escribe para buscar destinos."}
                </p>
            ) : (
                <ul className="max-h-56 space-y-1 overflow-y-auto pr-1">
                    {hits.map((h) => (
                        <li key={h.id}>
                            <button
                                type="button"
                                disabled={!!busy}
                                onClick={() => void publish(h)}
                                className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-left text-sm hover:bg-white/[0.06] disabled:opacity-50 cursor-pointer"
                            >
                                <Users className="h-3.5 w-3.5 shrink-0 text-indigo-300" />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate">{h.name}</span>
                                    <span className="block truncate text-[10px] text-white/40 capitalize">{h.kind}</span>
                                </span>
                                {busy === h.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5 text-white/40" />}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

/* ─────────────────────────── Cerebro ─────────────────────────── */

function BrainPanel({ resource, onDone }: { resource: ShareResourceRef; onDone: () => void }) {
    const [brains, setBrains] = useState<Brain[] | null>(null);
    const [busy, setBusy] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        listBrains().then((b) => alive && setBrains(b)).catch(() => alive && setBrains([]));
        return () => { alive = false; };
    }, []);

    const add = async (b: Brain) => {
        setBusy(b.id);
        const res = await shareToBrain(b.id, resource);
        setBusy(null);
        if (res.ok) {
            toast.success(`Añadido a «${b.name}»`);
            onDone();
        } else {
            toast.error(res.error ?? "No se pudo añadir");
        }
    };

    if (brains === null) return <PanelLoading label="Cargando tus cerebros…" />;
    if (brains.length === 0) {
        return <EmptyPanel text="Aún no tienes cerebros." cta={{ label: "Ir a Cerebro", href: "/cerebro" }} />;
    }
    return (
        <ul className="max-h-64 space-y-1 overflow-y-auto pr-1">
            {brains.map((b) => (
                <li key={b.id}>
                    <button
                        type="button"
                        disabled={!!busy}
                        onClick={() => void add(b)}
                        className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-left text-sm hover:bg-white/[0.06] disabled:opacity-50 cursor-pointer"
                    >
                        <BrainIcon className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
                        <span className="min-w-0 flex-1 truncate">{b.name}</span>
                        {busy === b.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5 text-white/40" />}
                    </button>
                </li>
            ))}
        </ul>
    );
}

/* ─────────────────────────── Librería ─────────────────────────── */

function LibraryPanel({ resource, onDone }: { resource: ShareResourceRef; onDone: () => void }) {
    const [dests, setDests] = useState<LibraryDestination[] | null>(null);
    const [busy, setBusy] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        myLibraryDestinations().then((d) => alive && setDests(d)).catch(() => alive && setDests([]));
        return () => { alive = false; };
    }, []);

    const save = async (d: LibraryDestination) => {
        const key = `${d.ref.kind}:${d.ref.id}`;
        setBusy(key);
        const res = await shareToLibrary(d.ref, null, resource);
        setBusy(null);
        if (res.ok) {
            toast.success(`Guardado en ${d.label}`);
            onDone();
        } else {
            toast.error(res.error ?? "No se pudo guardar");
        }
    };

    if (dests === null) return <PanelLoading label="Cargando tus bibliotecas…" />;
    if (dests.length === 0) {
        return <EmptyPanel text="Inicia sesión para guardar en una biblioteca." cta={{ label: "Iniciar sesión", href: "/login" }} />;
    }
    return (
        <div className="space-y-2">
            <p className="px-1 text-[11px] text-white/40">Se guardará en la raíz de la biblioteca elegida.</p>
            <ul className="max-h-56 space-y-1 overflow-y-auto pr-1">
                {dests.map((d) => {
                    const key = `${d.ref.kind}:${d.ref.id}`;
                    return (
                        <li key={key}>
                            <button
                                type="button"
                                disabled={!!busy}
                                onClick={() => void save(d)}
                                className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-left text-sm hover:bg-white/[0.06] disabled:opacity-50 cursor-pointer"
                            >
                                <Library className="h-3.5 w-3.5 shrink-0 text-teal-300" />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate">{d.label}</span>
                                    {d.hint && <span className="block truncate text-[10px] text-white/40">{d.hint}</span>}
                                </span>
                                {busy === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5 text-white/40" />}
                            </button>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

/* ─────────────────────────── Auxiliares ─────────────────────────── */

function PanelLoading({ label }: { label: string }) {
    return (
        <p className="flex items-center gap-2 px-1 py-4 text-xs text-white/50">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> {label}
        </p>
    );
}

function EmptyPanel({ text, cta }: { text: string; cta?: { label: string; href: string } }) {
    return (
        <div className="rounded-xl border border-dashed border-white/15 p-5 text-center">
            <p className="text-xs text-white/55">{text}</p>
            {cta && (
                <Button asChild variant="outline" size="sm" className="mt-3 cursor-pointer">
                    <a href={cta.href}>{cta.label}</a>
                </Button>
            )}
        </div>
    );
}

export default ShareToDialog;
