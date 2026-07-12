"use client";

// src/components/creation/lienzo-composer.tsx
// ─────────────────────────────────────────────────────────────────────────────
// LIENZO UNIVERSAL (/crear?area=lienzo) — creador de PUBLICACIONES específicas
// por BLOQUES (no es la pizarra): título + bloques de texto, imagen y archivo
// (subida REAL a Storage vía os-files), enlace y widget forjado embebido.
//
// Publica con el MISMO mecanismo que /publish (tabla os_posts, createPost de
// src/lib/os-social.ts) guardando la metadata { area, tipo, blocks } embebida
// en el cuerpo (comentario ss:meta) sin romper el esquema existente.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { createPost } from "@/lib/os-social";
import { uploadFile } from "@/lib/files/os-files";
import {
    buildSsMetaComment,
    defaultTipoFor,
    destToEntity,
    CREATION_DEST_BY_ID,
    type CreationDest,
} from "@/components/creation/creation-config";
import {
    DestSelector,
    TipoSelector,
    type OwnEntityOption,
} from "@/components/creation/creation-fields";
import type { DashboardWidget } from "@/components/dashboard/dashboard-types";
import {
    Type,
    Image as ImageIcon,
    FileUp,
    Link as LinkIcon,
    Blocks,
    ArrowUp,
    ArrowDown,
    Trash2,
    Loader2,
    Sparkles,
    Send,
    Globe,
    Tags,
    MapPin,
    X,
} from "lucide-react";

// ── Bloques ──────────────────────────────────────────────────────────────────

type BlockType = "texto" | "imagen" | "archivo" | "enlace" | "widget";

interface LienzoBlock {
    id: string;
    type: BlockType;
    /** texto: contenido · enlace: etiqueta · widget: título del widget. */
    text: string;
    /** imagen/archivo: URL pública subida · enlace: URL · widget: id del widget. */
    url: string;
    /** imagen/archivo: nombre del archivo original. */
    name: string;
    uploading?: boolean;
}

const BLOCK_DEFS: Array<{ type: BlockType; label: string; icon: React.ElementType }> = [
    { type: "texto", label: "Texto", icon: Type },
    { type: "imagen", label: "Imagen", icon: ImageIcon },
    { type: "archivo", label: "Archivo", icon: FileUp },
    { type: "enlace", label: "Enlace", icon: LinkIcon },
    { type: "widget", label: "Widget", icon: Blocks },
];

function newBlock(type: BlockType): LienzoBlock {
    return {
        id: `blk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        type,
        text: "",
        url: "",
        name: "",
    };
}

/** Widgets forjados disponibles (AI_GENERATED) leídos del mismo almacén del dashboard. */
function listForgedWidgets(): Array<{ id: string; title: string }> {
    if (typeof window === "undefined") return [];
    try {
        const raw = localStorage.getItem("starseed_widgets");
        const map = raw ? (JSON.parse(raw) as Record<string, DashboardWidget[]>) : {};
        const out: Array<{ id: string; title: string }> = [];
        for (const list of Object.values(map)) {
            if (!Array.isArray(list)) continue;
            for (const w of list) {
                if (w?.widget_type === "AI_GENERATED") {
                    const title = (w.settings as any)?.ontology?.title || "Widget forjado";
                    out.push({ id: w.id, title });
                }
            }
        }
        return out;
    } catch {
        return [];
    }
}

// ── Composer ─────────────────────────────────────────────────────────────────

interface LienzoComposerProps {
    /** Destino inicial (p. ej. desde ?dest=). */
    initialDest?: CreationDest;
    /**
     * Geolocalización inicial (?geo=lat,lng desde el Mapa del Hub, SOP §12):
     * se adjunta como metadata.geo del post para pintarlo en /hub/mapa.
     */
    initialGeo?: { lat: number; lng: number };
}

export function LienzoComposer({ initialDest, initialGeo }: LienzoComposerProps) {
    const { toast } = useToast();
    const [titulo, setTitulo] = useState("");
    const [blocks, setBlocks] = useState<LienzoBlock[]>([newBlock("texto")]);
    const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(initialGeo ?? null);
    const [dest, setDest] = useState<CreationDest>(initialDest ?? "perfil");
    const [tipo, setTipo] = useState<string>(defaultTipoFor(initialDest ?? "perfil"));
    const [own, setOwn] = useState<OwnEntityOption | null>(null);
    const [publishing, setPublishing] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const forged = useMemo(listForgedWidgets, []);

    const changeDest = useCallback((d: CreationDest) => {
        setDest(d);
        setTipo(defaultTipoFor(d));
    }, []);

    const patchBlock = useCallback((id: string, patch: Partial<LienzoBlock>) => {
        setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    }, []);

    const removeBlock = useCallback((id: string) => {
        setBlocks((prev) => prev.filter((b) => b.id !== id));
    }, []);

    const moveBlock = useCallback((id: string, dir: -1 | 1) => {
        setBlocks((prev) => {
            const idx = prev.findIndex((b) => b.id === id);
            if (idx < 0) return prev;
            const to = idx + dir;
            if (to < 0 || to >= prev.length) return prev;
            const next = [...prev];
            const [item] = next.splice(idx, 1);
            next.splice(to, 0, item);
            return next;
        });
    }, []);

    const addBlock = useCallback((type: BlockType) => {
        const b = newBlock(type);
        setBlocks((prev) => [...prev, b]);
        if (type === "imagen" || type === "archivo") {
            // Abre el picker de inmediato para ese bloque.
            requestAnimationFrame(() => {
                if (fileInputRef.current) {
                    fileInputRef.current.accept = type === "imagen" ? "image/*" : "*/*";
                    fileInputRef.current.dataset.blockId = b.id;
                    fileInputRef.current.value = "";
                    fileInputRef.current.click();
                }
            });
        }
    }, []);

    const pickFileFor = useCallback((block: LienzoBlock) => {
        if (!fileInputRef.current) return;
        fileInputRef.current.accept = block.type === "imagen" ? "image/*" : "*/*";
        fileInputRef.current.dataset.blockId = block.id;
        fileInputRef.current.value = "";
        fileInputRef.current.click();
    }, []);

    // Subida REAL (bucket os-files) del archivo elegido para un bloque.
    const handleFileChosen = useCallback(
        async (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            const blockId = e.target.dataset.blockId || "";
            if (!file || !blockId) return;
            patchBlock(blockId, { uploading: true, name: file.name });
            const res = await uploadFile(file, {
                folder: "creaciones",
                meta: { context: "lienzo-universal" },
            });
            if (res.ok && res.file?.url) {
                patchBlock(blockId, { uploading: false, url: res.file.url, name: file.name });
                toast({ title: "Archivo subido", description: `«${file.name}» ya está en tu nube.` });
            } else {
                patchBlock(blockId, { uploading: false });
                toast({
                    title: "Error al subir",
                    description: res.error || "No se pudo subir el archivo.",
                    variant: "destructive",
                });
            }
        },
        [patchBlock, toast],
    );

    const anyUploading = blocks.some((b) => b.uploading);

    // ── Publicación real (mismo mecanismo que /publish → os_posts) ──
    const handlePublish = useCallback(async () => {
        const hasContent =
            titulo.trim().length > 0 ||
            blocks.some((b) => b.text.trim() || b.url.trim());
        if (!hasContent) {
            toast({
                title: "Lienzo vacío",
                description: "Añade un título o al menos un bloque con contenido.",
                variant: "destructive",
            });
            return;
        }
        if (anyUploading) {
            toast({ title: "Subida en curso", description: "Espera a que terminen los archivos." });
            return;
        }
        setPublishing(true);
        try {
            const parts: string[] = [];
            if (titulo.trim()) parts.push(titulo.trim());
            let firstImage: string | undefined;
            const metaBlocks: Array<Record<string, unknown>> = [];

            for (const b of blocks) {
                if (b.type === "texto" && b.text.trim()) {
                    parts.push(b.text.trim());
                    metaBlocks.push({ t: "texto" });
                } else if (b.type === "imagen" && b.url) {
                    parts.push(`![${b.name || "imagen"}](${b.url})`);
                    if (!firstImage) firstImage = b.url;
                    metaBlocks.push({ t: "imagen", url: b.url, name: b.name });
                } else if (b.type === "archivo" && b.url) {
                    parts.push(`[${b.name || "archivo"}](${b.url})`);
                    metaBlocks.push({ t: "archivo", url: b.url, name: b.name });
                } else if (b.type === "enlace" && b.url.trim()) {
                    parts.push(`[${b.text.trim() || b.url.trim()}](${b.url.trim()})`);
                    metaBlocks.push({ t: "enlace", url: b.url.trim(), label: b.text.trim() });
                } else if (b.type === "widget" && b.url) {
                    parts.push(`[Widget embebido: ${b.text || "Widget forjado"}]`);
                    metaBlocks.push({ t: "widget", id: b.url, title: b.text });
                }
            }

            const meta = buildSsMetaComment({
                area: dest,
                tipo,
                blocks: metaBlocks,
                // Geo del Mapa del Hub (si vino por ?geo=): el post aparecerá
                // como marcador en la capa "Publicaciones" de /hub/mapa.
                ...(geo ? { geo } : {}),
            });
            const body = `${parts.join("\n\n")}${meta ? `\n\n${meta}` : ""}`;
            const entity = destToEntity(dest, own);

            const res = await createPost({
                entityType: entity.entityType,
                entitySlug: entity.entitySlug,
                body,
                mediaUrl: firstImage,
            });

            if (res.needsAuth) {
                toast({
                    title: "Inicia sesión",
                    description: "Necesitas una cuenta para publicar en la red.",
                    variant: "destructive",
                });
                return;
            }
            if (res.ok) {
                const destLabel =
                    dest === "propia" && own ? own.name : CREATION_DEST_BY_ID[dest].label;
                toast({
                    title: "Publicado",
                    description: `Tu creación se publicó en ${destLabel}.`,
                });
                setTitulo("");
                setBlocks([newBlock("texto")]);
            } else {
                toast({
                    title: "Error al publicar",
                    description: res.error || "Inténtalo de nuevo.",
                    variant: "destructive",
                });
            }
        } finally {
            setPublishing(false);
        }
    }, [titulo, blocks, dest, tipo, own, anyUploading, toast]);

    // ── Render ──
    return (
        <div className="grid gap-5 lg:grid-cols-5">
            {/* Columna izquierda: bloques */}
            <div className="lg:col-span-3 space-y-4">
                <div className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-4 sm:p-5 space-y-4">
                    <div className="flex items-center gap-2 text-emerald-300">
                        <Sparkles className="w-4 h-4" />
                        <h3 className="text-sm font-semibold text-white/90">Lienzo Universal</h3>
                        <span className="text-[10px] uppercase tracking-widest text-emerald-300/50 font-mono">
                            Publicación por bloques
                        </span>
                    </div>

                    <Input
                        placeholder="Título de la creación…"
                        value={titulo}
                        onChange={(e) => setTitulo(e.target.value)}
                        className="bg-black/30 border-white/10 text-base"
                    />

                    {/* Ubicación adjunta desde el Mapa del Hub (?geo=lat,lng) */}
                    {geo && (
                        <div className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs text-sky-200">
                            <MapPin className="w-3.5 h-3.5" />
                            Ubicación adjunta: {geo.lat.toFixed(4)}, {geo.lng.toFixed(4)}
                            <button
                                type="button"
                                onClick={() => setGeo(null)}
                                title="Quitar ubicación"
                                className="cursor-pointer text-sky-300/60 hover:text-sky-100 transition-colors"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    )}

                    {/* Bloques */}
                    <div className="space-y-3">
                        {blocks.map((b, i) => {
                            const def = BLOCK_DEFS.find((d) => d.type === b.type)!;
                            const Icon = def.icon;
                            return (
                                <div
                                    key={b.id}
                                    className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 space-y-2 transition-colors duration-200 hover:border-emerald-400/20"
                                >
                                    <div className="flex items-center gap-2">
                                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-300">
                                            <Icon className="w-3 h-3" />
                                            {def.label}
                                        </span>
                                        <div className="ml-auto flex items-center gap-1">
                                            <button
                                                type="button"
                                                onClick={() => moveBlock(b.id, -1)}
                                                disabled={i === 0}
                                                className="p-1 rounded-md text-white/30 hover:text-white/80 hover:bg-white/10 disabled:opacity-20 cursor-pointer transition-colors"
                                                title="Subir bloque"
                                            >
                                                <ArrowUp className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => moveBlock(b.id, 1)}
                                                disabled={i === blocks.length - 1}
                                                className="p-1 rounded-md text-white/30 hover:text-white/80 hover:bg-white/10 disabled:opacity-20 cursor-pointer transition-colors"
                                                title="Bajar bloque"
                                            >
                                                <ArrowDown className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => removeBlock(b.id)}
                                                className="p-1 rounded-md text-white/30 hover:text-red-300 hover:bg-red-500/10 cursor-pointer transition-colors"
                                                title="Quitar bloque"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>

                                    {b.type === "texto" && (
                                        <Textarea
                                            placeholder="Escribe aquí…"
                                            rows={3}
                                            value={b.text}
                                            onChange={(e) => patchBlock(b.id, { text: e.target.value })}
                                            className="bg-black/30 border-white/10 text-sm"
                                        />
                                    )}

                                    {(b.type === "imagen" || b.type === "archivo") && (
                                        <div className="space-y-2">
                                            {b.uploading ? (
                                                <div className="flex items-center gap-2 text-xs text-white/50">
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-300" />
                                                    Subiendo «{b.name}»…
                                                </div>
                                            ) : b.url ? (
                                                <div className="space-y-2">
                                                    {b.type === "imagen" && (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img
                                                            src={b.url}
                                                            alt={b.name}
                                                            className="max-h-48 w-auto rounded-xl border border-white/10 object-cover"
                                                        />
                                                    )}
                                                    <p className="text-xs text-white/50 truncate">
                                                        {b.name} — subido a tu nube
                                                    </p>
                                                </div>
                                            ) : (
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => pickFileFor(b)}
                                                    className="cursor-pointer gap-2 border-white/15 bg-white/[0.03] hover:bg-white/[0.08]"
                                                >
                                                    <FileUp className="w-3.5 h-3.5" />
                                                    {b.type === "imagen" ? "Elegir imagen" : "Elegir archivo"}
                                                </Button>
                                            )}
                                        </div>
                                    )}

                                    {b.type === "enlace" && (
                                        <div className="grid gap-2 sm:grid-cols-2">
                                            <Input
                                                placeholder="https://…"
                                                value={b.url}
                                                onChange={(e) => patchBlock(b.id, { url: e.target.value })}
                                                className="bg-black/30 border-white/10 text-sm"
                                            />
                                            <Input
                                                placeholder="Etiqueta (opcional)"
                                                value={b.text}
                                                onChange={(e) => patchBlock(b.id, { text: e.target.value })}
                                                className="bg-black/30 border-white/10 text-sm"
                                            />
                                        </div>
                                    )}

                                    {b.type === "widget" && (
                                        <div className="space-y-2">
                                            {forged.length === 0 ? (
                                                <p className="text-xs text-white/40">
                                                    Aún no tienes widgets forjados. Ábrelos desde la pestaña
                                                    «Fragua de Widgets» y vuelve aquí.
                                                </p>
                                            ) : (
                                                <div className="flex flex-wrap gap-1.5">
                                                    {forged.map((w) => {
                                                        const active = b.url === w.id;
                                                        return (
                                                            <button
                                                                key={w.id}
                                                                type="button"
                                                                onClick={() =>
                                                                    patchBlock(b.id, {
                                                                        url: active ? "" : w.id,
                                                                        text: active ? "" : w.title,
                                                                    })
                                                                }
                                                                className={cn(
                                                                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors duration-150 cursor-pointer",
                                                                    active
                                                                        ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-200"
                                                                        : "border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.07]",
                                                                )}
                                                            >
                                                                <Blocks className="w-3 h-3" />
                                                                <span className="max-w-[150px] truncate">{w.title}</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Añadir bloque */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                        {BLOCK_DEFS.map((d) => {
                            const Icon = d.icon;
                            return (
                                <button
                                    key={d.type}
                                    type="button"
                                    onClick={() => addBlock(d.type)}
                                    className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/[0.06] px-3 py-1.5 text-xs font-medium text-emerald-300/90 hover:bg-emerald-500/15 hover:text-emerald-200 transition-all duration-150 cursor-pointer"
                                >
                                    <Icon className="w-3.5 h-3.5" />
                                    {d.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* Input de archivos oculto (compartido por bloques de imagen/archivo) */}
                    <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        onChange={(e) => void handleFileChosen(e)}
                    />
                </div>
            </div>

            {/* Columna derecha: destino + tipo + publicar */}
            <div className="lg:col-span-2 space-y-4">
                <div className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-4 sm:p-5 space-y-3">
                    <div className="flex items-center gap-2 text-white/70">
                        <Globe className="w-4 h-4 text-emerald-300" />
                        <h4 className="text-xs font-semibold uppercase tracking-wider">Destino</h4>
                    </div>
                    <DestSelector value={dest} onChange={changeDest} ownValue={own} onOwnChange={setOwn} />
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-4 sm:p-5 space-y-3">
                    <div className="flex items-center gap-2 text-white/70">
                        <Tags className="w-4 h-4 text-emerald-300" />
                        <h4 className="text-xs font-semibold uppercase tracking-wider">
                            Tipo de publicación
                        </h4>
                    </div>
                    <TipoSelector dest={dest} value={tipo} onChange={setTipo} />
                </div>

                <Button
                    size="lg"
                    onClick={() => void handlePublish()}
                    disabled={publishing || anyUploading}
                    className="w-full cursor-pointer gap-2 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-100 hover:bg-emerald-500/30 transition-all duration-200 shadow-[0_0_20px_rgba(16,185,129,0.12)]"
                >
                    {publishing ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <Send className="w-4 h-4" />
                    )}
                    {publishing ? "Publicando…" : "Publicar creación"}
                </Button>
            </div>
        </div>
    );
}
