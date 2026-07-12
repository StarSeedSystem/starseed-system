"use client";

// src/components/creation/pizarras-panel.tsx
// ─────────────────────────────────────────────────────────────────────────────
// PIZARRAS (/crear?area=pizarras) — espacio de trabajo ilimitado del Centro de
// Creación. Lista las pizarras de NUBE (tabla `canvases` vía listCanvases) y
// las LOCALES (useBoardSystem, localStorage 'starseed_boards'); permite crear
// una nueva (/pizarra), abrir cada una, y COMPARTIR una pizarra como
// publicación real (os_posts, tipo 'pizarra' + referencia /pizarra?canvas=…)
// para que aparezca en perfiles, páginas, grupos o secciones de la red.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { createPost } from "@/lib/os-social";
import { listCanvases, type Canvas } from "@/lib/canvas/canvas";
import { useBoardSystem } from "@/context/board-context";
import { useControlPanel } from "@/context/control-panel-context";
import {
    buildSsMetaComment,
    destToEntity,
    CREATION_DEST_BY_ID,
    type CreationDest,
} from "@/components/creation/creation-config";
import {
    DestSelector,
    type OwnEntityOption,
} from "@/components/creation/creation-fields";
import {
    Presentation,
    Plus,
    ExternalLink,
    Share2,
    Loader2,
    Cloud,
    HardDrive,
    LayoutGrid,
    X,
    Send,
} from "lucide-react";

// ── Compartir como publicación ───────────────────────────────────────────────

interface ShareTarget {
    /** "cloud" (canvases Supabase) o "local" (starseed_boards). */
    scope: "cloud" | "local";
    id: string;
    title: string;
    /** Ruta in-app para abrirla (solo nube). */
    href?: string;
}

function ShareCanvasDialog({
    target,
    onClose,
}: {
    target: ShareTarget;
    onClose: () => void;
}) {
    const { toast } = useToast();
    const [dest, setDest] = useState<CreationDest>("perfil");
    const [own, setOwn] = useState<OwnEntityOption | null>(null);
    const [note, setNote] = useState("");
    const [publishing, setPublishing] = useState(false);

    const handleShare = useCallback(async () => {
        setPublishing(true);
        try {
            const lines: string[] = [];
            if (note.trim()) lines.push(note.trim());
            lines.push(`Pizarra compartida: «${target.title}»`);
            if (target.href) lines.push(`[Abrir pizarra](${target.href})`);
            else lines.push("(Pizarra local de este dispositivo)");

            const meta = buildSsMetaComment({
                tipo: "pizarra",
                ref: {
                    kind: "pizarra",
                    scope: target.scope,
                    id: target.id,
                    title: target.title,
                    ...(target.href ? { href: target.href } : {}),
                },
            });

            const entity = destToEntity(dest, own);
            const res = await createPost({
                entityType: entity.entityType,
                entitySlug: entity.entitySlug,
                body: `${lines.join("\n\n")}\n\n${meta}`,
            });

            if (res.needsAuth) {
                toast({
                    title: "Inicia sesión",
                    description: "Necesitas una cuenta para compartir en la red.",
                    variant: "destructive",
                });
                return;
            }
            if (res.ok) {
                const destLabel =
                    dest === "propia" && own ? own.name : CREATION_DEST_BY_ID[dest].label;
                toast({
                    title: "Pizarra compartida",
                    description: `«${target.title}» se publicó en ${destLabel}.`,
                });
                onClose();
            } else {
                toast({
                    title: "Error al compartir",
                    description: res.error || "Inténtalo de nuevo.",
                    variant: "destructive",
                });
            }
        } finally {
            setPublishing(false);
        }
    }, [target, dest, own, note, toast, onClose]);

    return (
        <div className="rounded-3xl border border-emerald-400/25 bg-white/[0.05] backdrop-blur-xl p-4 sm:p-5 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-center gap-2">
                <Share2 className="w-4 h-4 text-emerald-300" />
                <h4 className="text-sm font-semibold text-white/90">
                    Compartir «{target.title}» como publicación
                </h4>
                <button
                    type="button"
                    onClick={onClose}
                    className="ml-auto p-1 rounded-md text-white/40 hover:text-white hover:bg-white/10 cursor-pointer transition-colors"
                    title="Cerrar"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
            <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Añade un comentario (opcional)…"
                rows={2}
                className="w-full rounded-xl border border-white/10 bg-black/30 p-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-emerald-400/40 resize-none"
            />
            <DestSelector value={dest} onChange={setDest} ownValue={own} onOwnChange={setOwn} />
            <div className="flex justify-end">
                <Button
                    onClick={() => void handleShare()}
                    disabled={publishing}
                    className="cursor-pointer gap-2 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-100 hover:bg-emerald-500/30 transition-all duration-200"
                >
                    {publishing ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <Send className="w-4 h-4" />
                    )}
                    {publishing ? "Publicando…" : "Publicar"}
                </Button>
            </div>
        </div>
    );
}

// ── Panel principal ──────────────────────────────────────────────────────────

export function PizarrasPanel() {
    const router = useRouter();
    const { boards } = useBoardSystem();
    const panel = useControlPanel();
    const boardSystem = useBoardSystem();
    const [cloud, setCloud] = useState<Canvas[]>([]);
    const [loadingCloud, setLoadingCloud] = useState(true);
    const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);

    useEffect(() => {
        let active = true;
        void (async () => {
            try {
                const list = await listCanvases();
                if (active) setCloud(list);
            } catch {
                if (active) setCloud([]);
            } finally {
                if (active) setLoadingCloud(false);
            }
        })();
        return () => {
            active = false;
        };
    }, []);

    const openLocalBoard = useCallback(
        (id: string) => {
            boardSystem.setActiveBoard(id);
            panel.setActiveTab("boards");
            panel.setIsOpen(true);
        },
        [boardSystem, panel],
    );

    return (
        <div className="space-y-5">
            {/* Acciones principales */}
            <div className="flex flex-wrap items-center gap-2">
                <Button
                    onClick={() => router.push("/pizarra")}
                    className="cursor-pointer gap-2 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-100 hover:bg-emerald-500/30 transition-all duration-200 shadow-[0_0_20px_rgba(16,185,129,0.12)]"
                >
                    <Plus className="w-4 h-4" />
                    Nueva pizarra
                </Button>
                <Button
                    variant="outline"
                    onClick={() => router.push("/pizarras")}
                    className="cursor-pointer gap-2 rounded-2xl border-white/15 bg-white/[0.03] hover:bg-white/[0.08] transition-colors duration-200"
                >
                    <LayoutGrid className="w-4 h-4" />
                    Centros de trabajo
                </Button>
            </div>

            {/* Diálogo de compartir */}
            {shareTarget && (
                <ShareCanvasDialog target={shareTarget} onClose={() => setShareTarget(null)} />
            )}

            {/* Pizarras de nube */}
            <section className="space-y-3">
                <div className="flex items-center gap-2 text-white/70">
                    <Cloud className="w-4 h-4 text-emerald-300" />
                    <h4 className="text-xs font-semibold uppercase tracking-wider">
                        Pizarras en tu nube
                    </h4>
                </div>
                {loadingCloud ? (
                    <div className="flex items-center gap-2 text-xs text-white/40 py-4">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando pizarras…
                    </div>
                ) : cloud.length === 0 ? (
                    <p className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-xs text-white/40">
                        Aún no tienes pizarras en la nube (o no has iniciado sesión). Crea una
                        con «Nueva pizarra» y se guardará en tu cuenta soberana.
                    </p>
                ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {cloud.map((c) => (
                            <div
                                key={c.id}
                                className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-4 space-y-2 transition-all duration-200 hover:border-emerald-400/30 hover:bg-white/[0.06]"
                            >
                                <div className="flex items-start gap-2">
                                    <Presentation className="w-4 h-4 text-emerald-300 mt-0.5 shrink-0" />
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-white/90 truncate">
                                            {c.title || "Pizarra sin título"}
                                        </p>
                                        <p className="text-[10px] text-white/35">
                                            {(c.blocks || []).length} bloque{(c.blocks || []).length === 1 ? "" : "s"}
                                            {c.shared ? " · compartida" : ""}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5 pt-1">
                                    <Link
                                        href={`/pizarra?canvas=${c.id}`}
                                        className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/70 hover:bg-white/[0.1] hover:text-white cursor-pointer transition-colors duration-150"
                                    >
                                        <ExternalLink className="w-3 h-3" /> Abrir
                                    </Link>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setShareTarget({
                                                scope: "cloud",
                                                id: c.id,
                                                title: c.title || "Pizarra sin título",
                                                href: `/pizarra?canvas=${c.id}`,
                                            })
                                        }
                                        className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/[0.06] px-2.5 py-1 text-[11px] text-emerald-300/90 hover:bg-emerald-500/15 hover:text-emerald-200 cursor-pointer transition-colors duration-150"
                                    >
                                        <Share2 className="w-3 h-3" /> Compartir como publicación
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* Pizarras locales */}
            <section className="space-y-3">
                <div className="flex items-center gap-2 text-white/70">
                    <HardDrive className="w-4 h-4 text-emerald-300" />
                    <h4 className="text-xs font-semibold uppercase tracking-wider">
                        Pizarras locales (este dispositivo)
                    </h4>
                </div>
                {boards.length === 0 ? (
                    <p className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-xs text-white/40">
                        Sin pizarras locales. Se crean desde el panel de tableros (cortina
                        Logic) y viven solo en este dispositivo.
                    </p>
                ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {boards.map((b) => (
                            <div
                                key={b.id}
                                className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-4 space-y-2 transition-all duration-200 hover:border-emerald-400/30 hover:bg-white/[0.06]"
                            >
                                <div className="flex items-start gap-2">
                                    <Presentation className="w-4 h-4 text-cyan-300 mt-0.5 shrink-0" />
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-white/90 truncate">{b.name}</p>
                                        <p className="text-[10px] text-white/35">
                                            {b.widgets.length} elemento{b.widgets.length === 1 ? "" : "s"} · local
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5 pt-1">
                                    <button
                                        type="button"
                                        onClick={() => openLocalBoard(b.id)}
                                        className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/70 hover:bg-white/[0.1] hover:text-white cursor-pointer transition-colors duration-150"
                                    >
                                        <ExternalLink className="w-3 h-3" /> Abrir
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setShareTarget({ scope: "local", id: b.id, title: b.name })
                                        }
                                        className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/[0.06] px-2.5 py-1 text-[11px] text-emerald-300/90 hover:bg-emerald-500/15 hover:text-emerald-200 cursor-pointer transition-colors duration-150"
                                    >
                                        <Share2 className="w-3 h-3" /> Compartir como publicación
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
