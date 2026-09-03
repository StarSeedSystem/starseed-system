"use client";

// src/components/creation/lienzo-composer.tsx
// ─────────────────────────────────────────────────────────────────────────────
// LIENZO UNIVERSAL (/crear?area=lienzo) — creador de PUBLICACIONES por BLOQUES.
//
// Bloques LEGADOS (texto/imagen/archivo/enlace/widget) → markdown en el cuerpo.
// Bloques RICOS (portada, programa/código ejecutable, página interactiva, repo,
// pizarra, agente/bot, mapa, gráfica, referencia, entidad) → se serializan en la
// metadata `ss:meta.blocks` y los pinta el post-blocks-renderer (mismo render en
// toda la red). El código se ejecuta AISLADO (iframe sandbox, sin sesión).
//
// Tipo de publicación = ETIQUETAS MÚLTIPLES (Adenda 66 §6). Destinos: los de
// siempre + «Librería» (biblioteca + folder) → guarda un ÍTEM de biblioteca
// (con su ACL) en vez de un post.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { createPost } from "@/lib/os-social";
import { uploadFile } from "@/lib/files/os-files";
import { saveItemSecure } from "@/lib/library/entity-library";
import {
    buildSsMetaComment,
    defaultTagFor,
    destToEntity,
    CREATION_DEST_BY_ID,
    type CreationDest,
} from "@/components/creation/creation-config";
import {
    DestSelector,
    TagSelector,
    type OwnEntityOption,
} from "@/components/creation/creation-fields";
import {
    LibraryLocationPicker,
    type LibraryLocation,
} from "@/components/creation/library-location-picker";
import { NEW_BLOCK_DEFS, RichBlockEditor } from "@/components/creation/creation-blocks";
// (Adenda 219) Marco de forma opcional para fotos y vídeos del Lienzo.
import { MarcoDeMedio } from "@/components/creation/marco-de-medio";
import type { Marco } from "@/lib/profile/marco-foto";
import { SocialCrosspost } from "@/components/creation/social-crosspost";
import {
    isRichBlock,
    newBlockId,
    serializeBlocks,
    MAX_SS_META_BYTES,
    type PostBlock,
    type PostBlockType,
} from "@/lib/creation/post-blocks";
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
    type LucideIcon,
} from "lucide-react";

// ── Definiciones de bloque (legado + rico) para la barra e iconos/labels ──────

interface LegacyDef {
    type: PostBlockType;
    label: string;
    icon: LucideIcon;
}

const LEGACY_BLOCK_DEFS: LegacyDef[] = [
    { type: "texto", label: "Texto", icon: Type },
    { type: "imagen", label: "Imagen", icon: ImageIcon },
    { type: "archivo", label: "Archivo", icon: FileUp },
    { type: "enlace", label: "Enlace", icon: LinkIcon },
    { type: "widget", label: "Widget", icon: Blocks },
];

/** Mapa type → { label, icon } combinando legado + rico. */
const BLOCK_META: Record<string, { label: string; icon: LucideIcon }> = {
    ...Object.fromEntries(LEGACY_BLOCK_DEFS.map((d) => [d.type, { label: d.label, icon: d.icon }])),
    ...Object.fromEntries(NEW_BLOCK_DEFS.map((d) => [d.type, { label: d.label, icon: d.icon }])),
};

/** Crea un bloque nuevo con los defaults propios de su tipo. */
function makeBlock(type: PostBlockType): PostBlock {
    const base: PostBlock = { id: newBlockId(), type };
    if (type === "codigo" || type === "pagina") base.language = "html";
    if (type === "grafica") {
        base.chartType = "bar";
        base.data = [{ label: "", value: 0 }];
    }
    return base;
}

/** ¿El bloque tiene contenido significativo (para validar antes de publicar)? */
function blockHasContent(b: PostBlock): boolean {
    switch (b.type) {
        case "texto":
        case "enlace":
            return Boolean((b.text && b.text.trim()) || (b.url && b.url.trim()));
        case "imagen":
        case "archivo":
        case "portada":
        case "widget":
        case "repo":
        case "pizarra":
        // Adenda 67 · P4: ambos bloques nuevos se validan por su URL.
        case "penpot":
        case "video":
            return Boolean(b.url && b.url.trim());
        case "codigo":
        case "pagina":
            return Boolean(b.code && b.code.trim());
        case "agente":
            return Boolean((b.system && b.system.trim()) || (b.name && b.name.trim()));
        case "mapa":
            return typeof b.lat === "number" && typeof b.lng === "number";
        case "grafica":
            return Boolean(b.data && b.data.some((d) => d.label.trim() || Number.isFinite(d.value)));
        case "referencia":
        case "entidad":
            return Boolean(b.ref && b.ref.id);
        default:
            return false;
    }
}

/** Widgets forjados disponibles (AI_GENERATED) leídos del almacén del dashboard. */
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
    initialDest?: CreationDest;
    initialGeo?: { lat: number; lng: number };
}

export function LienzoComposer({ initialDest, initialGeo }: LienzoComposerProps) {
    const { toast } = useToast();
    const [titulo, setTitulo] = useState("");
    const [blocks, setBlocks] = useState<PostBlock[]>([makeBlock("texto")]);
    const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(initialGeo ?? null);
    const [dest, setDest] = useState<CreationDest>(initialDest ?? "perfil");
    const [tags, setTags] = useState<string[]>([defaultTagFor(initialDest ?? "perfil")]);
    const [own, setOwn] = useState<OwnEntityOption | null>(null);
    const [libLocation, setLibLocation] = useState<LibraryLocation | null>(null);
    const [publishing, setPublishing] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const forged = useMemo(listForgedWidgets, []);

    const changeDest = useCallback((d: CreationDest) => {
        setDest(d);
        // Sugiere una etiqueta por defecto solo si el usuario no eligió aún.
        setTags((prev) => (prev.length === 0 ? [defaultTagFor(d)] : prev));
    }, []);

    const patchBlock = useCallback((id: string, patch: Partial<PostBlock>) => {
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

    const addBlock = useCallback((type: PostBlockType) => {
        const b = makeBlock(type);
        setBlocks((prev) => [...prev, b]);
        if (type === "imagen" || type === "archivo") {
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

    const pickFileFor = useCallback((block: PostBlock) => {
        if (!fileInputRef.current) return;
        fileInputRef.current.accept = block.type === "imagen" ? "image/*" : "*/*";
        fileInputRef.current.dataset.blockId = block.id;
        fileInputRef.current.value = "";
        fileInputRef.current.click();
    }, []);

    // Subida REAL (bucket os-files) del archivo elegido para un bloque legado.
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

    // Compone el cuerpo (markdown de bloques legados) + metadata ss:meta.
    // (Ola 224) Devuelve también `meta` para poder medir su tamaño antes de publicar.
    const composeBody = useCallback((): { body: string; firstImage?: string; meta: string } => {
        const parts: string[] = [];
        if (titulo.trim()) parts.push(titulo.trim());
        let firstImage: string | undefined;

        for (const b of blocks) {
            if (b.type === "texto" && b.text?.trim()) {
                parts.push(b.text.trim());
            } else if (b.type === "imagen" && b.url) {
                parts.push(`![${b.name || "imagen"}](${b.url})`);
                if (!firstImage) firstImage = b.url;
            } else if (b.type === "portada" && b.url) {
                // La portada también sirve como media principal (primera imagen).
                if (!firstImage) firstImage = b.url;
            } else if (b.type === "archivo" && b.url) {
                parts.push(`[${b.name || "archivo"}](${b.url})`);
            } else if (b.type === "enlace" && b.url?.trim()) {
                parts.push(`[${b.text?.trim() || b.url.trim()}](${b.url.trim()})`);
            } else if (b.type === "widget" && b.url) {
                parts.push(`[Widget embebido: ${b.text || "Widget forjado"}]`);
            }
        }

        // Bloques RICOS → ss:meta.blocks (el renderer los pinta; no van como markdown).
        const richBlocks = serializeBlocks(blocks.filter((b) => isRichBlock(b.type)));
        const primaryTipo = tags[0] || defaultTagFor(dest);
        // (Adenda 219) Marcos de forma por URL: la tarjeta del feed los aplica a la
        // foto/vídeo principal aunque el bloque viaje como markdown.
        const marcos: Record<string, Marco> = {};
        for (const b of blocks) {
            if ((b.type === "imagen" || b.type === "portada" || b.type === "video") && b.url && b.marco) {
                marcos[b.url] = b.marco;
            }
        }
        const meta = buildSsMetaComment({
            area: dest,
            tipo: primaryTipo,
            tags,
            ...(richBlocks.length > 0 ? { blocks: richBlocks } : {}),
            ...(geo ? { geo } : {}),
            ...(Object.keys(marcos).length > 0 ? { marcos } : {}),
        });
        const body = `${parts.join("\n\n")}${meta ? `\n\n${meta}` : ""}`;
        return { body, firstImage, meta };
    }, [titulo, blocks, tags, dest, geo]);

    // ── Publicación real ──
    const handlePublish = useCallback(async () => {
        const hasContent = titulo.trim().length > 0 || blocks.some(blockHasContent);
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

        // (Ola 224) Tope de tamaño de la metadata ss:meta: si el comentario generado
        // supera el límite, ni guardamos en la Librería ni publicamos en la red.
        const metaCheck = composeBody().meta;
        const metaBytes = new TextEncoder().encode(metaCheck).length;
        if (metaBytes > MAX_SS_META_BYTES) {
            const kb = (metaBytes / 1024).toFixed(1);
            const cap = Math.round(MAX_SS_META_BYTES / 1024);
            toast({
                title: "Publicación demasiado grande",
                description: `La publicación es demasiado grande (${kb} KB de ${cap}). Reduce el código o los datos de las gráficas.`,
                variant: "destructive",
            });
            return;
        }

        // Destino LIBRERÍA: guardar como ÍTEM de biblioteca (no como post).
        if (dest === "libreria") {
            if (!libLocation) {
                toast({
                    title: "Elige una ubicación",
                    description: "Selecciona la biblioteca y el folder destino.",
                    variant: "destructive",
                });
                return;
            }
            setPublishing(true);
            try {
                const { body } = composeBody();
                const title = titulo.trim() || firstTextSnippet(blocks) || "Creación del Lienzo";
                const res = await saveItemSecure(
                    libLocation.ref,
                    {
                        type: "post",
                        title,
                        content: body,
                        tags,
                        mime: "text/markdown",
                    },
                    libLocation.folderId,
                );
                if (res.ok) {
                    const where = libLocation.folderLabel
                        ? `${libLocation.libraryLabel} · ${libLocation.folderLabel}`
                        : libLocation.libraryLabel;
                    toast({
                        title: "Guardado en la Librería",
                        description: res.aviso || `Tu creación se guardó en ${where}.`,
                    });
                    setTitulo("");
                    setBlocks([makeBlock("texto")]);
                }
            } catch (e: any) {
                toast({
                    title: "Error al guardar",
                    description: e?.message || "Inténtalo de nuevo.",
                    variant: "destructive",
                });
            } finally {
                setPublishing(false);
            }
            return;
        }

        // Resto de destinos: publicar en os_posts (mismo mecanismo que /publish).
        setPublishing(true);
        try {
            const { body, firstImage } = composeBody();
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
                toast({ title: "Publicado", description: `Tu creación se publicó en ${destLabel}.` });
                setTitulo("");
                setBlocks([makeBlock("texto")]);
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
    }, [titulo, blocks, dest, tags, own, libLocation, anyUploading, composeBody, toast]);

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
                            const meta = BLOCK_META[b.type] ?? { label: b.type, icon: Blocks };
                            const Icon = meta.icon;
                            return (
                                <div
                                    key={b.id}
                                    className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 space-y-2 transition-colors duration-200 hover:border-emerald-400/20"
                                >
                                    <div className="flex items-center gap-2">
                                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-300">
                                            <Icon className="w-3 h-3" />
                                            {meta.label}
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
                                            value={b.text || ""}
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
                                                    {b.type === "imagen" && (
                                                        <MarcoDeMedio
                                                            src={b.url}
                                                            value={b.marco ?? null}
                                                            onChange={(marco) => patchBlock(b.id, { marco })}
                                                        />
                                                    )}
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
                                                value={b.url || ""}
                                                onChange={(e) => patchBlock(b.id, { url: e.target.value })}
                                                className="bg-black/30 border-white/10 text-sm"
                                            />
                                            <Input
                                                placeholder="Etiqueta (opcional)"
                                                value={b.text || ""}
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

                                    {/* Bloques ricos: editor delegado */}
                                    {isRichBlock(b.type) && (
                                        <RichBlockEditor
                                            block={b}
                                            patch={(patch) => patchBlock(b.id, patch)}
                                        />
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Añadir bloque (agrupado) */}
                    <div className="space-y-2 pt-1">
                        <div className="flex flex-wrap gap-1.5">
                            {LEGACY_BLOCK_DEFS.map((d) => (
                                <AddBlockButton key={d.type} label={d.label} icon={d.icon} onClick={() => addBlock(d.type)} />
                            ))}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {NEW_BLOCK_DEFS.map((d) => (
                                <AddBlockButton key={d.type} label={d.label} icon={d.icon} onClick={() => addBlock(d.type)} />
                            ))}
                        </div>
                    </div>

                    {/* Input de archivos oculto (compartido por bloques legados). */}
                    <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        onChange={(e) => void handleFileChosen(e)}
                    />
                </div>
            </div>

            {/* Columna derecha: destino + etiquetas + publicar */}
            <div className="lg:col-span-2 space-y-4">
                <div className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-4 sm:p-5 space-y-3">
                    <div className="flex items-center gap-2 text-white/70">
                        <Globe className="w-4 h-4 text-emerald-300" />
                        <h4 className="text-xs font-semibold uppercase tracking-wider">Destino</h4>
                    </div>
                    <DestSelector value={dest} onChange={changeDest} ownValue={own} onOwnChange={setOwn} />

                    {/* Ubicación de la Librería (biblioteca + folder). */}
                    {dest === "libreria" && (
                        <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.04] p-3">
                            <LibraryLocationPicker value={libLocation} onChange={setLibLocation} />
                        </div>
                    )}
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-4 sm:p-5 space-y-3">
                    <div className="flex items-center gap-2 text-white/70">
                        <Tags className="w-4 h-4 text-emerald-300" />
                        <h4 className="text-xs font-semibold uppercase tracking-wider">
                            Etiquetas de la publicación
                        </h4>
                    </div>
                    <TagSelector dest={dest} value={tags} onChange={setTags} />
                </div>

                <Button
                    size="lg"
                    onClick={() => void handlePublish()}
                    disabled={publishing || anyUploading}
                    className="w-full cursor-pointer gap-2 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-100 hover:bg-emerald-500/30 transition-all duration-200 shadow-[0_0_20px_rgba(16,185,129,0.12)]"
                >
                    {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {publishing
                        ? dest === "libreria"
                            ? "Guardando…"
                            : "Publicando…"
                        : dest === "libreria"
                          ? "Guardar en la Librería"
                          : "Publicar creación"}
                </Button>

                {/* (Adenda 67 · P4-8) Crossposting a redes con Postiz. Solo aparece si
                    el usuario lo tiene configurado. Es un acto SEPARADO del botón de
                    arriba: publicar en StarSeed NUNCA publica fuera por su cuenta. */}
                <SocialCrosspost
                    getText={() =>
                        [titulo.trim(), ...blocks.filter((b) => b.type === "texto").map((b) => (b.text ?? "").trim())]
                            .filter(Boolean)
                            .join("\n\n")
                    }
                    getImageUrl={() =>
                        blocks.find((b) => (b.type === "imagen" || b.type === "portada") && b.url?.trim())?.url?.trim()
                    }
                />
            </div>
        </div>
    );
}

/** Botón para añadir un bloque (mismo estilo esmeralda de la barra). */
function AddBlockButton({ label, icon: Icon, onClick }: { label: string; icon: LucideIcon; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/[0.06] px-3 py-1.5 text-xs font-medium text-emerald-300/90 hover:bg-emerald-500/15 hover:text-emerald-200 transition-all duration-150 cursor-pointer"
        >
            <Icon className="w-3.5 h-3.5" />
            {label}
        </button>
    );
}

/** Primer fragmento de texto (para titular ítems de biblioteca sin título). */
function firstTextSnippet(blocks: PostBlock[]): string {
    const t = blocks.find((b) => b.type === "texto" && b.text?.trim())?.text?.trim();
    if (!t) return "";
    return t.length > 60 ? `${t.slice(0, 57)}…` : t;
}
