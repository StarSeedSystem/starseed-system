"use client";

// src/components/creation/creation-blocks.tsx
// ─────────────────────────────────────────────────────────────────────────────
// EDITORES de los BLOQUES RICOS del Lienzo Universal (Adenda 66 §6):
//   portada · programa/código ejecutable · página dinámica interactiva · repo ·
//   pizarra · agente/bot · mapa · gráfica · referencia (cerebro/biblioteca/
//   folder/archivo vía SourcePicker) · entidad (página/perfil/grupo/comunidad/
//   evento).
//
// Cada editor recibe `{ block, patch }` y es autónomo. El código ejecutable se
// previsualiza en un <iframe> AISLADO (sandbox="allow-scripts", sin
// allow-same-origin → sin acceso a la sesión). El RENDER en el feed vive en
// src/components/social/post-blocks-renderer.tsx (mismo aislamiento).
//
// Estilo Crystal Liquid Glass · iconos Lucide · alias @/ · SSR-safe.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fetchMyEntities } from "@/lib/os-social";
import {
    buildSandboxDoc,
    type PostBlock,
    type PostBlockType,
    type PostBlockRefKind,
    type ChartKind,
    type CodeLang,
} from "@/lib/creation/post-blocks";
import { SourcePicker, type SourceRef } from "@/components/creation/source-picker";
import {
    LayoutTemplate,
    Code2,
    MousePointerClick,
    GitBranch,
    PencilRuler,
    Bot,
    MapPin,
    BarChart3,
    Boxes,
    Building2,
    Play,
    Plus,
    Trash2,
    Loader2,
    Image as ImageIcon,
    Link2,
    Locate,
    type LucideIcon,
} from "lucide-react";

// ── Catálogo de bloques RICOS (para la barra "añadir bloque" del Lienzo) ──────

export interface BlockDef {
    type: PostBlockType;
    label: string;
    icon: LucideIcon;
    /** Grupo visual en la barra de añadir. */
    group: "contenido" | "interactivo" | "referencia";
    /** Sólo para `referencia`/`entidad`: pista del tipo de recurso. */
    refHint?: "source" | "entity";
}

export const NEW_BLOCK_DEFS: BlockDef[] = [
    { type: "portada", label: "Portada", icon: LayoutTemplate, group: "contenido" },
    { type: "codigo", label: "Programa", icon: Code2, group: "interactivo" },
    { type: "pagina", label: "Página interactiva", icon: MousePointerClick, group: "interactivo" },
    { type: "grafica", label: "Gráfica", icon: BarChart3, group: "interactivo" },
    { type: "mapa", label: "Mapa", icon: MapPin, group: "interactivo" },
    { type: "agente", label: "Agente/Bot", icon: Bot, group: "interactivo" },
    { type: "repo", label: "Repo", icon: GitBranch, group: "interactivo" },
    { type: "pizarra", label: "Pizarra", icon: PencilRuler, group: "interactivo" },
    { type: "referencia", label: "Referencia", icon: Boxes, group: "referencia", refHint: "source" },
    { type: "entidad", label: "Entidad", icon: Building2, group: "referencia", refHint: "entity" },
];

// ── SourceRef → parche de bloque `referencia` ────────────────────────────────

/** Traduce la SourceRef del SourcePicker a los campos de un bloque `referencia`. */
export function sourceRefToBlockPatch(r: SourceRef): Partial<PostBlock> {
    if (r.kind === "device" || r.kind === "url") {
        // Archivo subido o URL externa: referencia de tipo file/url.
        const kind: PostBlockRefKind = r.kind === "device" ? "file" : "url";
        return {
            url: r.url,
            name: r.name,
            text: r.label,
            ref: { kind, id: r.url || r.name || "recurso", url: r.url, label: r.label || r.name },
        };
    }
    if (r.kind === "library") {
        return {
            text: r.label,
            ref: {
                kind: "library",
                id: r.library?.id || "",
                libraryKind: r.library?.kind,
                label: r.label,
                route: "/library",
            },
        };
    }
    if (r.kind === "folder") {
        return {
            text: r.label,
            ref: {
                kind: "folder",
                id: r.library?.id || "",
                libraryKind: r.library?.kind,
                folderId: r.folderId ?? null,
                label: r.label,
                route: "/library",
            },
        };
    }
    if (r.kind === "file") {
        return {
            url: r.url,
            name: r.name,
            text: r.label,
            ref: {
                kind: "file",
                id: r.itemId || r.url || "archivo",
                itemId: r.itemId,
                url: r.url,
                libraryKind: r.library?.kind,
                folderId: r.folderId ?? null,
                label: r.label || r.name,
                route: "/library",
            },
        };
    }
    if (r.kind === "brain") {
        return { text: r.label, ref: { kind: "brain", id: r.brainId || "", label: r.label, route: "/cerebro" } };
    }
    // neuron
    return { text: r.label, ref: { kind: "neuron", id: r.neuronId || "", label: r.label, route: "/cerebro" } };
}

const FIELD = "bg-black/30 border-white/10 text-sm";

// ── Editor raíz por tipo ─────────────────────────────────────────────────────

export function RichBlockEditor({
    block,
    patch,
}: {
    block: PostBlock;
    patch: (p: Partial<PostBlock>) => void;
}) {
    switch (block.type) {
        case "portada":
            return <PortadaEditor block={block} patch={patch} />;
        case "codigo":
        case "pagina":
            return <CodeEditor block={block} patch={patch} />;
        case "repo":
            return <RepoEditor block={block} patch={patch} />;
        case "pizarra":
            return <PizarraEditor block={block} patch={patch} />;
        case "agente":
            return <AgenteEditor block={block} patch={patch} />;
        case "mapa":
            return <MapaEditor block={block} patch={patch} />;
        case "grafica":
            return <GraficaEditor block={block} patch={patch} />;
        case "referencia":
            return <ReferenciaEditor block={block} patch={patch} />;
        case "entidad":
            return <EntidadEditor block={block} patch={patch} />;
        default:
            return null;
    }
}

// ── Portada ──────────────────────────────────────────────────────────────────

function PortadaEditor({ block, patch }: EditorProps) {
    return (
        <div className="space-y-2">
            {block.url ? (
                <div className="space-y-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={block.url}
                        alt={block.name || "Portada"}
                        loading="lazy"
                        className="max-h-40 w-full rounded-xl border border-white/10 object-cover"
                    />
                    <div className="flex items-center gap-2">
                        <SourcePicker
                            kinds={["device", "url"]}
                            uploadFolder="creaciones/portadas"
                            title="Portada"
                            onPick={(r) => patch({ url: r.url, name: r.name || r.label })}
                            trigger={
                                <Button type="button" variant="outline" size="sm" className="cursor-pointer gap-1.5 border-white/15 bg-white/[0.03]">
                                    <ImageIcon className="h-3.5 w-3.5" /> Cambiar
                                </Button>
                            }
                        />
                    </div>
                </div>
            ) : (
                <SourcePicker
                    kinds={["device", "url"]}
                    uploadFolder="creaciones/portadas"
                    title="Portada"
                    onPick={(r) => patch({ url: r.url, name: r.name || r.label })}
                    trigger={
                        <Button type="button" variant="outline" size="sm" className="cursor-pointer gap-1.5 border-white/15 bg-white/[0.03]">
                            <LayoutTemplate className="h-3.5 w-3.5" /> Elegir imagen de portada
                        </Button>
                    }
                />
            )}
            <Input
                placeholder="Título sobre la portada (opcional)"
                value={block.text || ""}
                onChange={(e) => patch({ text: e.target.value })}
                className={FIELD}
            />
        </div>
    );
}

// ── Código ejecutable / página dinámica ──────────────────────────────────────

const LANGS: Array<{ id: CodeLang; label: string }> = [
    { id: "html", label: "HTML" },
    { id: "css", label: "CSS" },
    { id: "js", label: "JS" },
    { id: "jsx", label: "JSX" },
];

function CodeEditor({ block, patch }: EditorProps) {
    const lang: CodeLang = block.language || "html";
    const [previewNonce, setPreviewNonce] = useState(0);
    const [showPreview, setShowPreview] = useState(false);
    const doc = useMemo(
        () => buildSandboxDoc({ code: block.code || "", language: lang }),
        // Recalcula solo cuando el usuario pide ejecutar.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [previewNonce],
    );

    const run = useCallback(() => {
        setShowPreview(true);
        setPreviewNonce((n) => n + 1);
    }, []);

    return (
        <div className="space-y-2">
            {block.type === "pagina" && (
                <p className="rounded-lg border border-indigo-400/20 bg-indigo-500/5 px-2.5 py-1.5 text-[11px] text-indigo-200/80">
                    Página interactiva: usa varias secciones, botones y transiciones. Se ejecuta en el
                    mismo entorno AISLADO que el bloque de código.
                </p>
            )}
            <div className="flex flex-wrap items-center gap-1.5">
                {LANGS.map((l) => (
                    <button
                        key={l.id}
                        type="button"
                        onClick={() => patch({ language: l.id })}
                        className={cn(
                            "rounded-full border px-2.5 py-1 text-[11px] font-mono transition-colors cursor-pointer",
                            lang === l.id
                                ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-200"
                                : "border-white/10 bg-white/[0.03] text-white/50 hover:bg-white/[0.07]",
                        )}
                    >
                        {l.label}
                    </button>
                ))}
                <Button
                    type="button"
                    size="sm"
                    onClick={run}
                    className="ml-auto cursor-pointer gap-1.5 bg-emerald-500/20 border border-emerald-400/40 text-emerald-100 hover:bg-emerald-500/30 h-7"
                >
                    <Play className="h-3.5 w-3.5" /> Ejecutar
                </Button>
            </div>
            <Textarea
                placeholder={
                    lang === "jsx"
                        ? "function App(){ return <h1>Hola StarSeed</h1> }\nReactDOM.createRoot(document.getElementById('root')).render(<App/>)"
                        : lang === "js"
                          ? "document.getElementById('app').textContent = 'Hola StarSeed'"
                          : lang === "css"
                            ? ".preview{ color: #39ff14 }"
                            : "<h1>Hola StarSeed</h1>\n<style>h1{color:#39ff14}</style>"
                }
                rows={7}
                spellCheck={false}
                value={block.code || ""}
                onChange={(e) => patch({ code: e.target.value })}
                className={cn(FIELD, "font-mono text-[12px] leading-relaxed")}
            />
            {showPreview && (
                <div className="overflow-hidden rounded-xl border border-white/10 bg-black/40">
                    <div className="flex items-center gap-1.5 border-b border-white/10 px-2.5 py-1 text-[10px] uppercase tracking-wider text-white/40">
                        <Play className="h-3 w-3" /> Vista previa aislada
                    </div>
                    <iframe
                        key={previewNonce}
                        title="Vista previa del programa"
                        // AISLAMIENTO: allow-scripts SIN allow-same-origin → origen opaco,
                        // sin acceso a cookies/localStorage/sesión de la app.
                        sandbox="allow-scripts allow-popups allow-modals"
                        referrerPolicy="no-referrer"
                        srcDoc={doc}
                        className="h-64 w-full bg-white/0"
                    />
                </div>
            )}
        </div>
    );
}

// ── Repo ─────────────────────────────────────────────────────────────────────

function RepoEditor({ block, patch }: EditorProps) {
    return (
        <div className="grid gap-2 sm:grid-cols-2">
            <Input
                placeholder="https://github.com/usuario/repo"
                value={block.url || ""}
                onChange={(e) => patch({ url: e.target.value })}
                className={FIELD}
            />
            <Input
                placeholder="Nombre del repo (opcional)"
                value={block.text || ""}
                onChange={(e) => patch({ text: e.target.value })}
                className={FIELD}
            />
        </div>
    );
}

// ── Pizarra ──────────────────────────────────────────────────────────────────

function PizarraEditor({ block, patch }: EditorProps) {
    return (
        <div className="space-y-2">
            <p className="text-[11px] text-white/45">
                Enlaza o incrusta una pizarra (canvas/board). Pega su URL pública.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
                <Input
                    placeholder="URL de la pizarra…"
                    value={block.url || ""}
                    onChange={(e) => patch({ url: e.target.value })}
                    className={FIELD}
                />
                <Input
                    placeholder="Título (opcional)"
                    value={block.text || ""}
                    onChange={(e) => patch({ text: e.target.value })}
                    className={FIELD}
                />
            </div>
        </div>
    );
}

// ── Agente / Bot ─────────────────────────────────────────────────────────────

function AgenteEditor({ block, patch }: EditorProps) {
    return (
        <div className="space-y-2">
            <p className="rounded-lg border border-fuchsia-400/20 bg-fuchsia-500/5 px-2.5 py-1.5 text-[11px] text-fuchsia-200/80">
                Define un mini-agente que usa Aurora/Astraura. En la publicación aparecerá un chat
                embebido y AISLADO con este comportamiento.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
                <Input
                    placeholder="Nombre del agente"
                    value={block.name || ""}
                    onChange={(e) => patch({ name: e.target.value })}
                    className={FIELD}
                />
                <Input
                    placeholder="Personalidad (p. ej. cercano, técnico…)"
                    value={block.persona || ""}
                    onChange={(e) => patch({ persona: e.target.value })}
                    className={FIELD}
                />
            </div>
            <Textarea
                placeholder="Instrucciones del sistema (system prompt): qué sabe y cómo responde…"
                rows={4}
                value={block.system || ""}
                onChange={(e) => patch({ system: e.target.value })}
                className={cn(FIELD, "text-[13px]")}
            />
        </div>
    );
}

// ── Mapa ─────────────────────────────────────────────────────────────────────

function MapaEditor({ block, patch }: EditorProps) {
    const [locating, setLocating] = useState(false);
    const useMyLocation = useCallback(() => {
        if (typeof navigator === "undefined" || !navigator.geolocation) return;
        setLocating(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                patch({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                setLocating(false);
            },
            () => setLocating(false),
            { enableHighAccuracy: false, timeout: 8000 },
        );
    }, [patch]);

    return (
        <div className="space-y-2">
            <Input
                placeholder="Nombre del lugar / zona (opcional)"
                value={block.place || ""}
                onChange={(e) => patch({ place: e.target.value })}
                className={FIELD}
            />
            <div className="grid grid-cols-2 gap-2">
                <Input
                    type="number"
                    step="any"
                    placeholder="Latitud"
                    value={typeof block.lat === "number" ? String(block.lat) : ""}
                    onChange={(e) => patch({ lat: e.target.value === "" ? undefined : Number(e.target.value) })}
                    className={FIELD}
                />
                <Input
                    type="number"
                    step="any"
                    placeholder="Longitud"
                    value={typeof block.lng === "number" ? String(block.lng) : ""}
                    onChange={(e) => patch({ lng: e.target.value === "" ? undefined : Number(e.target.value) })}
                    className={FIELD}
                />
            </div>
            <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={useMyLocation}
                disabled={locating}
                className="cursor-pointer gap-1.5 border-white/15 bg-white/[0.03]"
            >
                {locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Locate className="h-3.5 w-3.5" />}
                Usar mi ubicación
            </Button>
        </div>
    );
}

// ── Gráfica ──────────────────────────────────────────────────────────────────

const CHART_KINDS: Array<{ id: ChartKind; label: string }> = [
    { id: "bar", label: "Barras" },
    { id: "line", label: "Líneas" },
    { id: "area", label: "Área" },
    { id: "pie", label: "Circular" },
];

function GraficaEditor({ block, patch }: EditorProps) {
    const data = block.data && block.data.length > 0 ? block.data : [{ label: "", value: 0 }];
    const chartType: ChartKind = block.chartType || "bar";

    const setRow = (i: number, key: "label" | "value", v: string) => {
        const next = data.map((d, idx) => {
            if (idx !== i) return d;
            return key === "value" ? { ...d, value: Number(v) } : { ...d, label: v };
        });
        patch({ data: next });
    };
    const addRow = () => patch({ data: [...data, { label: "", value: 0 }] });
    const removeRow = (i: number) => patch({ data: data.filter((_, idx) => idx !== i) });

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
                {CHART_KINDS.map((c) => (
                    <button
                        key={c.id}
                        type="button"
                        onClick={() => patch({ chartType: c.id })}
                        className={cn(
                            "rounded-full border px-2.5 py-1 text-[11px] transition-colors cursor-pointer",
                            chartType === c.id
                                ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-200"
                                : "border-white/10 bg-white/[0.03] text-white/50 hover:bg-white/[0.07]",
                        )}
                    >
                        {c.label}
                    </button>
                ))}
            </div>
            <div className="space-y-1.5">
                {data.map((d, i) => (
                    <div key={i} className="flex items-center gap-2">
                        <Input
                            placeholder="Etiqueta"
                            value={d.label}
                            onChange={(e) => setRow(i, "label", e.target.value)}
                            className={cn(FIELD, "h-8")}
                        />
                        <Input
                            type="number"
                            step="any"
                            placeholder="Valor"
                            value={Number.isFinite(d.value) ? String(d.value) : ""}
                            onChange={(e) => setRow(i, "value", e.target.value)}
                            className={cn(FIELD, "h-8 w-28")}
                        />
                        <button
                            type="button"
                            onClick={() => removeRow(i)}
                            className="p-1 rounded-md text-white/30 hover:text-red-300 hover:bg-red-500/10 cursor-pointer"
                            title="Quitar fila"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </button>
                    </div>
                ))}
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addRow}
                    className="cursor-pointer gap-1.5 border-white/15 bg-white/[0.03] h-7"
                >
                    <Plus className="h-3.5 w-3.5" /> Añadir dato
                </Button>
            </div>
        </div>
    );
}

// ── Referencia (cerebro / biblioteca / folder / archivo / neurona / URL) ──────

function ReferenciaEditor({ block, patch }: EditorProps) {
    const ref = block.ref;
    return (
        <div className="space-y-2">
            {ref ? (
                <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/80">
                    <Link2 className="h-4 w-4 shrink-0 text-cyan-300" />
                    <span className="min-w-0 flex-1 truncate">{ref.label || block.text || ref.id}</span>
                    <span className="text-[10px] uppercase text-white/35">{ref.kind}</span>
                </div>
            ) : (
                <p className="text-[11px] text-white/45">
                    Referencia un cerebro, una biblioteca, un folder, un archivo, una neurona o una URL.
                </p>
            )}
            <SourcePicker
                title="Referenciar recurso"
                onPick={(r) => patch(sourceRefToBlockPatch(r))}
                trigger={
                    <Button type="button" variant="outline" size="sm" className="cursor-pointer gap-1.5 border-white/15 bg-white/[0.03]">
                        <Boxes className="h-3.5 w-3.5" /> {ref ? "Cambiar referencia" : "Elegir recurso"}
                    </Button>
                }
            />
        </div>
    );
}

// ── Entidad (página / perfil / grupo / comunidad / evento) ───────────────────

const ENTITY_KINDS: Array<{ id: PostBlockRefKind; label: string; route: (id: string) => string }> = [
    { id: "page", label: "Página", route: (id) => `/pagina/${id}` },
    { id: "profile", label: "Perfil", route: (id) => `/profile/${id}` },
    { id: "group", label: "Grupo", route: (id) => `/grupo/${id}` },
    { id: "community", label: "Comunidad", route: (id) => `/pagina/${id}` },
    { id: "event", label: "Evento", route: (id) => `/evento/${id}` },
];

function EntidadEditor({ block, patch }: EditorProps) {
    const [mine, setMine] = useState<Array<{ kind: PostBlockRefKind; id: string; label: string }>>([]);
    const kind = (block.ref?.kind as PostBlockRefKind) || "page";
    const slug = block.ref?.id || "";

    useEffect(() => {
        let alive = true;
        fetchMyEntities()
            .then((res) => {
                if (!alive) return;
                const list: Array<{ kind: PostBlockRefKind; id: string; label: string }> = [
                    ...res.pages.map((p) => ({ kind: "page" as PostBlockRefKind, id: p.slug, label: p.name })),
                    ...res.groups.map((g) => ({ kind: "group" as PostBlockRefKind, id: g.slug, label: g.name })),
                    ...res.events.map((e) => ({ kind: "event" as PostBlockRefKind, id: e.slug, label: e.title })),
                ];
                setMine(list);
            })
            .catch(() => {});
        return () => {
            alive = false;
        };
    }, []);

    const setRef = (k: PostBlockRefKind, id: string, label?: string) => {
        const def = ENTITY_KINDS.find((e) => e.id === k);
        patch({
            text: label,
            ref: { kind: k, id, label: label || id, route: def ? def.route(id) : undefined },
        });
    };

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
                {ENTITY_KINDS.map((e) => (
                    <button
                        key={e.id}
                        type="button"
                        onClick={() => setRef(e.id, slug, block.ref?.label)}
                        className={cn(
                            "rounded-full border px-2.5 py-1 text-[11px] transition-colors cursor-pointer",
                            kind === e.id
                                ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-200"
                                : "border-white/10 bg-white/[0.03] text-white/50 hover:bg-white/[0.07]",
                        )}
                    >
                        {e.label}
                    </button>
                ))}
            </div>
            <Input
                placeholder="slug o usuario de la entidad…"
                value={slug}
                onChange={(e) => setRef(kind, e.target.value, block.ref?.label)}
                className={FIELD}
            />
            {mine.length > 0 && (
                <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-wider text-white/35">Mis entidades</p>
                    <div className="flex flex-wrap gap-1.5">
                        {mine.map((m) => (
                            <button
                                key={`${m.kind}-${m.id}`}
                                type="button"
                                onClick={() => setRef(m.kind, m.id, m.label)}
                                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/60 hover:bg-white/[0.07] cursor-pointer"
                            >
                                <Building2 className="h-3 w-3" />
                                <span className="max-w-[140px] truncate">{m.label}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Tipos internos ───────────────────────────────────────────────────────────

interface EditorProps {
    block: PostBlock;
    patch: (p: Partial<PostBlock>) => void;
}
