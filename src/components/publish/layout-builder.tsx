"use client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * LayoutBuilder — Creador de Layouts ILIMITADOS del Lienzo de Creación
 * -----------------------------------------------------------------------------
 * Nuevo modo "Diseño" del composer (aditivo, opcional — el modo "Clásico" de
 * siempre queda intacto). Dos maneras de construir:
 *
 *   · MODO BLOQUES: bloques ordenables (arriba/abajo + arrastre nativo HTML5)
 *     de texto/media/código/embed/botón/separador/columnas 2·3/tarjeta, cada
 *     uno con su propio estilo (fondo, texto, tipografía, alineación, padding,
 *     radio, sombra) y presets de contenedor por contexto (publicación social,
 *     artículo, página de entidad, evento, app/widget).
 *
 *   · MODO CÓDIGO: editor libre de HTML/CSS/JS con vista previa sandbox EN
 *     VIVO (iframe `srcdoc`, sandbox="allow-scripts") — "posibilidades
 *     infinitas de código" para construir cualquier página/app/widget.
 *
 * Ambos modos convergen en UN MISMO artefacto: `layoutDocToHtml(doc)` produce
 * un documento HTML autocontenido — el mismo generador alimenta la vista
 * previa en vivo AQUÍ y el adjunto `{kind:"programa", content:html}` que se
 * publica (renderizado por `EmbeddedContentWindow`, que ya sabe ejecutar
 * `programa` sin url + con `content` en un iframe sandbox — ver Adenda en ese
 * archivo). Así "lo que ves es lo que se publica", con una sola fuente de
 * verdad de renderizado.
 *
 * Aurora generativa: botón global (genera TODA la estructura o TODO el código)
 * y botón por bloque (genera/regenera ESE bloque, con deshacer de 1 nivel).
 * Usa `auroraGenerateContent` (wrapper sobre `astrauraChat`), sin claves ni
 * infraestructura nuevas.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import {
    Type,
    Image as ImageIcon,
    Code2,
    AppWindow,
    MousePointerClick,
    Minus,
    Columns2,
    Columns3,
    CreditCard,
    Plus,
    Trash2,
    Copy,
    ArrowUp,
    ArrowDown,
    GripVertical,
    Undo2,
    Loader2,
    Palette,
    Eye,
    Upload,
    Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import AuroraGenerateButton from "@/components/publish/aurora-generate-button";
import ImageEditorDialog from "@/components/publish/image-editor-dialog";
import { AttachFilePickerButton } from "@/components/files/universal-file-picker";
import type { UniversalAttachment } from "@/lib/files/os-files";

// ── Tipos ────────────────────────────────────────────────────────────────────

export type LayoutBlockType =
    | "texto" | "media" | "codigo" | "embed" | "boton" | "separador" | "columnas2" | "columnas3" | "tarjeta";

export interface BlockStyle {
    bg?: string;
    color?: string;
    fontSize?: "sm" | "md" | "lg" | "xl";
    align?: "left" | "center" | "right";
    padding?: "none" | "sm" | "md" | "lg";
    radius?: "none" | "sm" | "md" | "lg" | "full";
    shadow?: boolean;
}

export interface LayoutBlock {
    id: string;
    type: LayoutBlockType;
    content: string;
    content2?: string;
    content3?: string;
    href?: string;
    style: BlockStyle;
    /** Contenidos anteriores de `content` (para "Deshacer" tras generar con Aurora). */
    history: string[];
}

export type LayoutPresetId = "post" | "articulo" | "pagina_entidad" | "evento" | "app_widget";

export interface LayoutFreeCode {
    html: string;
    css: string;
    js: string;
}

export interface LayoutDoc {
    mode: "bloques" | "codigo";
    preset: LayoutPresetId;
    blocks: LayoutBlock[];
    freeCode: LayoutFreeCode;
}

export function defaultLayoutDoc(): LayoutDoc {
    return {
        mode: "bloques",
        preset: "post",
        blocks: [],
        freeCode: { html: "", css: "", js: "" },
    };
}

/** ¿El documento de layout tiene algo publicable? (composer lo usa para validar el paso). */
export function layoutHasContent(doc: LayoutDoc | null | undefined): boolean {
    if (!doc) return false;
    if (doc.mode === "codigo") return Boolean(doc.freeCode.html.trim() || doc.freeCode.js.trim());
    return doc.blocks.some((b) => (b.content || "").trim() || (b.content2 || "").trim() || (b.content3 || "").trim() || b.type === "separador");
}

function newBlockId(): string {
    return `blk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── Presets de contenedor ────────────────────────────────────────────────────

const PRESETS: Record<LayoutPresetId, { label: string; maxWidth: string; padding: string; fontFamily: string; background: string; color: string }> = {
    post: { label: "Publicación social", maxWidth: "640px", padding: "16px", fontFamily: "system-ui, -apple-system, sans-serif", background: "#0d0f14", color: "#f5f1e6" },
    articulo: { label: "Artículo", maxWidth: "720px", padding: "28px", fontFamily: "Georgia, 'Times New Roman', serif", background: "#0d0f14", color: "#f5f1e6" },
    pagina_entidad: { label: "Página de entidad", maxWidth: "960px", padding: "28px", fontFamily: "system-ui, -apple-system, sans-serif", background: "#0d0f14", color: "#f5f1e6" },
    evento: { label: "Evento", maxWidth: "820px", padding: "24px", fontFamily: "system-ui, -apple-system, sans-serif", background: "#12141c", color: "#f5f1e6" },
    app_widget: { label: "App / widget", maxWidth: "100%", padding: "12px", fontFamily: "system-ui, -apple-system, sans-serif", background: "#ffffff", color: "#111111" },
};

const PRESET_LIST = Object.entries(PRESETS) as [LayoutPresetId, (typeof PRESETS)[LayoutPresetId]][];

// ── Catálogo de bloques ──────────────────────────────────────────────────────

const BLOCK_DEFS: { type: LayoutBlockType; label: string; icon: ComponentType<{ className?: string }> }[] = [
    { type: "texto", label: "Texto", icon: Type },
    { type: "media", label: "Media", icon: ImageIcon },
    { type: "codigo", label: "Código", icon: Code2 },
    { type: "embed", label: "Embed", icon: AppWindow },
    { type: "boton", label: "Botón", icon: MousePointerClick },
    { type: "separador", label: "Separador", icon: Minus },
    { type: "columnas2", label: "Columnas (2)", icon: Columns2 },
    { type: "columnas3", label: "Columnas (3)", icon: Columns3 },
    { type: "tarjeta", label: "Tarjeta", icon: CreditCard },
];

function iconForType(type: LayoutBlockType) {
    return BLOCK_DEFS.find((b) => b.type === type)?.icon || Type;
}
function labelForType(type: LayoutBlockType) {
    return BLOCK_DEFS.find((b) => b.type === type)?.label || type;
}

function newBlock(type: LayoutBlockType): LayoutBlock {
    return {
        id: newBlockId(),
        type,
        content: type === "boton" ? "Ver más" : "",
        content2: "",
        content3: "",
        href: "",
        style: { fontSize: "md", align: "left", padding: "sm", radius: "sm" },
        history: [],
    };
}

// ── Serialización a HTML (fuente única para preview en vivo Y publicación) ──

const FONT_SIZE: Record<NonNullable<BlockStyle["fontSize"]>, string> = { sm: "14px", md: "16px", lg: "22px", xl: "32px" };
const PADDING: Record<NonNullable<BlockStyle["padding"]>, string> = { none: "0", sm: "10px", md: "18px", lg: "28px" };
const RADIUS: Record<NonNullable<BlockStyle["radius"]>, string> = { none: "0", sm: "6px", md: "12px", lg: "20px", full: "999px" };

function escapeHtml(s: string): string {
    return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttr(s: string): string {
    return (s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
function nl2br(s: string): string {
    return escapeHtml(s).replace(/\n/g, "<br/>");
}

function styleToCss(s: BlockStyle): string {
    const parts: string[] = [];
    if (s.bg) parts.push(`background:${s.bg}`);
    if (s.color) parts.push(`color:${s.color}`);
    parts.push(`font-size:${FONT_SIZE[s.fontSize || "md"]}`);
    parts.push(`text-align:${s.align || "left"}`);
    parts.push(`padding:${PADDING[s.padding || "sm"]}`);
    parts.push(`border-radius:${RADIUS[s.radius || "none"]}`);
    parts.push("margin:0 0 14px 0");
    if (s.shadow) parts.push("box-shadow:0 8px 24px rgba(0,0,0,0.25)");
    return parts.join(";");
}

function blockInnerHtml(b: LayoutBlock): string {
    switch (b.type) {
        case "texto":
            return `<div>${nl2br(b.content)}</div>`;
        case "media":
            return b.content
                ? `<img src="${escapeAttr(b.content)}" style="max-width:100%;display:block;border-radius:inherit" />`
                : `<div style="opacity:.5">(sin media)</div>`;
        case "codigo":
            return `<pre style="white-space:pre-wrap;overflow:auto;background:rgba(0,0,0,.35);padding:12px;border-radius:8px;margin:0"><code>${escapeHtml(b.content)}</code></pre>`;
        case "embed":
            return b.content
                ? `<iframe src="${escapeAttr(b.content)}" style="width:100%;height:360px;border:0;border-radius:inherit" loading="lazy"></iframe>`
                : `<div style="opacity:.5">(sin url de embed)</div>`;
        case "boton":
            return `<a href="${escapeAttr(b.href || "#")}" target="_blank" rel="noreferrer" style="display:inline-block;padding:10px 20px;background:#E9C46A;color:#111;border-radius:999px;text-decoration:none;font-weight:600">${escapeHtml(b.content || "Botón")}</a>`;
        case "separador":
            return `<hr style="border:none;border-top:1px solid rgba(128,128,128,.3);margin:8px 0" />`;
        case "columnas2":
            return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:18px"><div>${nl2br(b.content)}</div><div>${nl2br(b.content2 || "")}</div></div>`;
        case "columnas3":
            return `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:18px"><div>${nl2br(b.content)}</div><div>${nl2br(b.content2 || "")}</div><div>${nl2br(b.content3 || "")}</div></div>`;
        case "tarjeta":
            return `<div style="border:1px solid rgba(128,128,128,.25);border-radius:12px;padding:16px">${nl2br(b.content)}</div>`;
        default:
            return "";
    }
}

/** Genera el documento HTML completo del modo Bloques (preset + bloques). */
export function layoutBlocksToHtml(blocks: LayoutBlock[], preset: LayoutPresetId): string {
    const p = PRESETS[preset] || PRESETS.post;
    const body = blocks
        .map((b) => `<section style="${styleToCss(b.style)}">${blockInnerHtml(b)}</section>`)
        .join("\n");
    return (
        `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
        `<style>*{box-sizing:border-box}body{margin:0;background:${p.background};color:${p.color};font-family:${p.fontFamily}}` +
        `.ss-wrap{max-width:${p.maxWidth};margin:0 auto;padding:${p.padding}}</style></head>` +
        `<body><div class="ss-wrap">${body || '<p style="opacity:.4">Añade bloques para ver el resultado…</p>'}</div></body></html>`
    );
}

function isFullDocument(html: string): boolean {
    const t = html.trim().toLowerCase();
    return t.startsWith("<!doctype") || t.startsWith("<html");
}

/** Genera el documento HTML completo del modo Código (envuelve si es un fragmento). */
export function freeCodeToHtml(freeCode: LayoutFreeCode): string {
    if (isFullDocument(freeCode.html)) return freeCode.html;
    return (
        `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
        `<style>${freeCode.css || ""}</style></head><body>${freeCode.html || ""}` +
        `<script>${freeCode.js || ""}<\/script></body></html>`
    );
}

/** Punto único de entrada: el HTML final publicable de un `LayoutDoc`, sea cual sea su modo. */
export function layoutDocToHtml(doc: LayoutDoc): string {
    return doc.mode === "codigo" ? freeCodeToHtml(doc.freeCode) : layoutBlocksToHtml(doc.blocks, doc.preset);
}

// ── Paletas rápidas de color (swatches + hex libre) ─────────────────────────

const SWATCHES = ["transparent", "#0d0f14", "#1c1f2b", "#E9C46A", "#10B981", "#39FF14", "#007FFF", "#DC143C", "#ffffff", "#000000"];

function ColorField({ label, value, onChange }: { label: string; value?: string; onChange: (v: string | undefined) => void }) {
    return (
        <div className="space-y-1">
            <label className="text-[10px] font-medium uppercase tracking-wide text-white/40">{label}</label>
            <div className="flex flex-wrap items-center gap-1">
                {SWATCHES.map((c) => (
                    <button
                        key={c}
                        type="button"
                        title={c}
                        onClick={() => onChange(c === "transparent" ? undefined : c)}
                        className={cn(
                            "h-5 w-5 shrink-0 rounded-full border transition-transform hover:scale-110",
                            (value || "transparent") === c ? "border-cyan-300 ring-1 ring-cyan-300" : "border-white/20",
                        )}
                        style={{ background: c === "transparent" ? "repeating-conic-gradient(#555 0% 25%, #333 0% 50%) 50%/8px 8px" : c }}
                    />
                ))}
                <input
                    type="color"
                    value={value && value.startsWith("#") ? value : "#000000"}
                    onChange={(e) => onChange(e.target.value)}
                    className="h-5 w-6 cursor-pointer rounded border border-white/20 bg-transparent"
                    title="Color personalizado"
                />
            </div>
        </div>
    );
}

function PillGroup<T extends string>({
    options, value, onChange,
}: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
    return (
        <div className="flex flex-wrap gap-1">
            {options.map((o) => (
                <button
                    key={o.id}
                    type="button"
                    onClick={() => onChange(o.id)}
                    className={cn(
                        "rounded-full border px-2 py-0.5 text-[10px] transition-colors",
                        value === o.id ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-100" : "border-white/15 text-white/50 hover:border-white/30",
                    )}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}

function StyleEditor({ style, onChange }: { style: BlockStyle; onChange: (s: BlockStyle) => void }) {
    return (
        <div className="grid gap-2.5 rounded-lg border border-white/10 bg-black/20 p-2.5 sm:grid-cols-2">
            <ColorField label="Fondo" value={style.bg} onChange={(bg) => onChange({ ...style, bg })} />
            <ColorField label="Texto" value={style.color} onChange={(color) => onChange({ ...style, color })} />
            <div className="space-y-1">
                <label className="text-[10px] font-medium uppercase tracking-wide text-white/40">Tamaño</label>
                <PillGroup
                    options={[{ id: "sm", label: "S" }, { id: "md", label: "M" }, { id: "lg", label: "L" }, { id: "xl", label: "XL" }]}
                    value={style.fontSize || "md"}
                    onChange={(fontSize) => onChange({ ...style, fontSize })}
                />
            </div>
            <div className="space-y-1">
                <label className="text-[10px] font-medium uppercase tracking-wide text-white/40">Alineación</label>
                <PillGroup
                    options={[{ id: "left", label: "Izq" }, { id: "center", label: "Centro" }, { id: "right", label: "Der" }]}
                    value={style.align || "left"}
                    onChange={(align) => onChange({ ...style, align })}
                />
            </div>
            <div className="space-y-1">
                <label className="text-[10px] font-medium uppercase tracking-wide text-white/40">Padding</label>
                <PillGroup
                    options={[{ id: "none", label: "0" }, { id: "sm", label: "S" }, { id: "md", label: "M" }, { id: "lg", label: "L" }]}
                    value={style.padding || "sm"}
                    onChange={(padding) => onChange({ ...style, padding })}
                />
            </div>
            <div className="space-y-1">
                <label className="text-[10px] font-medium uppercase tracking-wide text-white/40">Radio</label>
                <PillGroup
                    options={[{ id: "none", label: "0" }, { id: "sm", label: "S" }, { id: "md", label: "M" }, { id: "lg", label: "L" }, { id: "full", label: "Full" }]}
                    value={style.radius || "none"}
                    onChange={(radius) => onChange({ ...style, radius })}
                />
            </div>
            <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-white/55">
                <input type="checkbox" checked={Boolean(style.shadow)} onChange={(e) => onChange({ ...style, shadow: e.target.checked })} className="accent-cyan-400" />
                Sombra
            </label>
        </div>
    );
}

// ── Un bloque en la lista (editor + estilo + reordenar + Aurora) ────────────

function BlockCard({
    block, index, total, presetContext, onUpdate, onRemove, onDuplicate, onMove, dragProps,
}: {
    block: LayoutBlock;
    index: number;
    total: number;
    presetContext: string;
    onUpdate: (patch: Partial<LayoutBlock>) => void;
    onRemove: () => void;
    onDuplicate: () => void;
    onMove: (dir: -1 | 1) => void;
    dragProps: {
        draggable: boolean;
        onDragStart: () => void;
        onDragOver: (e: React.DragEvent) => void;
        onDrop: () => void;
        onDragEnd: () => void;
    };
}) {
    const [styleOpen, setStyleOpen] = useState(false);
    const [imgEditorOpen, setImgEditorOpen] = useState(false);
    const Icon = iconForType(block.type);

    const applyGenerated = (text: string) => {
        onUpdate({ content: text, history: [block.content, ...block.history].slice(0, 5) });
    };
    const undo = () => {
        if (!block.history.length) return;
        const [prev, ...rest] = block.history;
        onUpdate({ content: prev, history: rest });
    };

    return (
        <div
            className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]"
            onDragOver={dragProps.onDragOver}
            onDrop={dragProps.onDrop}
        >
            <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.03] px-2.5 py-1.5">
                <span
                    draggable={dragProps.draggable}
                    onDragStart={dragProps.onDragStart}
                    onDragEnd={dragProps.onDragEnd}
                    className="cursor-grab text-white/30 hover:text-white/60 active:cursor-grabbing"
                    title="Arrastrar para reordenar"
                >
                    <GripVertical className="h-3.5 w-3.5" />
                </span>
                <Icon className="h-3.5 w-3.5 shrink-0 text-cyan-300/80" />
                <span className="text-xs font-semibold text-white/75">{labelForType(block.type)}</span>
                <div className="ml-auto flex items-center gap-0.5">
                    {block.history.length > 0 && (
                        <button type="button" title="Deshacer" onClick={undo} className="grid h-6 w-6 place-items-center rounded-md text-white/40 hover:bg-white/10 hover:text-white/80">
                            <Undo2 className="h-3.5 w-3.5" />
                        </button>
                    )}
                    <button type="button" title="Estilo" onClick={() => setStyleOpen((v) => !v)} className={cn("grid h-6 w-6 place-items-center rounded-md hover:bg-white/10", styleOpen ? "text-cyan-300" : "text-white/40 hover:text-white/80")}>
                        <Palette className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" title="Subir" onClick={() => onMove(-1)} disabled={index === 0} className="grid h-6 w-6 place-items-center rounded-md text-white/40 hover:bg-white/10 hover:text-white/80 disabled:opacity-25">
                        <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" title="Bajar" onClick={() => onMove(1)} disabled={index === total - 1} className="grid h-6 w-6 place-items-center rounded-md text-white/40 hover:bg-white/10 hover:text-white/80 disabled:opacity-25">
                        <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" title="Duplicar" onClick={onDuplicate} className="grid h-6 w-6 place-items-center rounded-md text-white/40 hover:bg-white/10 hover:text-white/80">
                        <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" title="Eliminar" onClick={onRemove} className="grid h-6 w-6 place-items-center rounded-md text-white/40 hover:bg-white/10 hover:text-red-300">
                        <Trash2 className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>

            <div className="space-y-2 p-2.5">
                {block.type === "separador" ? (
                    <p className="text-[11px] italic text-white/35">Línea divisoria — sin contenido.</p>
                ) : block.type === "media" ? (
                    <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5">
                            <Input value={block.content} onChange={(e) => onUpdate({ content: e.target.value })} placeholder="URL de la imagen…" className="h-8 bg-white/[0.03] text-xs text-amber-50" />
                            <AttachFilePickerButton
                                onPick={(picked: UniversalAttachment[]) => picked[0]?.url && onUpdate({ content: picked[0].url as string })}
                                accept="image/*"
                                folder="publicaciones"
                                title="Subir imagen"
                                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-cyan-400/30 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-400/15"
                            >
                                <Upload className="h-3.5 w-3.5" />
                            </AttachFilePickerButton>
                            {block.content && (
                                <button type="button" title="Editar imagen" onClick={() => setImgEditorOpen(true)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/15 text-white/60 hover:border-white/30 hover:text-white/90">
                                    <Pencil className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>
                        {block.content && (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={block.content} alt="" className="h-24 w-full rounded-md object-cover" />
                        )}
                        <ImageEditorDialog open={imgEditorOpen} onOpenChange={setImgEditorOpen} srcUrl={block.content} onApply={(url) => onUpdate({ content: url })} />
                    </div>
                ) : block.type === "embed" ? (
                    <Input value={block.content} onChange={(e) => onUpdate({ content: e.target.value })} placeholder="URL a incrustar (https://…)" className="h-8 bg-white/[0.03] text-xs text-amber-50" />
                ) : block.type === "boton" ? (
                    <div className="grid gap-1.5 sm:grid-cols-2">
                        <Input value={block.content} onChange={(e) => onUpdate({ content: e.target.value })} placeholder="Texto del botón" className="h-8 bg-white/[0.03] text-xs text-amber-50" />
                        <Input value={block.href || ""} onChange={(e) => onUpdate({ href: e.target.value })} placeholder="Enlace (https://…)" className="h-8 bg-white/[0.03] text-xs text-amber-50" />
                    </div>
                ) : block.type === "columnas2" ? (
                    <div className="grid gap-1.5 sm:grid-cols-2">
                        <Textarea value={block.content} onChange={(e) => onUpdate({ content: e.target.value })} placeholder="Columna 1…" className="min-h-[70px] bg-white/[0.03] text-xs text-amber-50" />
                        <Textarea value={block.content2 || ""} onChange={(e) => onUpdate({ content2: e.target.value })} placeholder="Columna 2…" className="min-h-[70px] bg-white/[0.03] text-xs text-amber-50" />
                    </div>
                ) : block.type === "columnas3" ? (
                    <div className="grid gap-1.5 sm:grid-cols-3">
                        <Textarea value={block.content} onChange={(e) => onUpdate({ content: e.target.value })} placeholder="Columna 1…" className="min-h-[70px] bg-white/[0.03] text-xs text-amber-50" />
                        <Textarea value={block.content2 || ""} onChange={(e) => onUpdate({ content2: e.target.value })} placeholder="Columna 2…" className="min-h-[70px] bg-white/[0.03] text-xs text-amber-50" />
                        <Textarea value={block.content3 || ""} onChange={(e) => onUpdate({ content3: e.target.value })} placeholder="Columna 3…" className="min-h-[70px] bg-white/[0.03] text-xs text-amber-50" />
                    </div>
                ) : (
                    <Textarea
                        value={block.content}
                        onChange={(e) => onUpdate({ content: e.target.value })}
                        placeholder={block.type === "codigo" ? "Fragmento de código a mostrar (se ve tal cual, no se ejecuta)…" : "Texto del bloque…"}
                        className={cn("min-h-[70px] bg-white/[0.03] text-xs text-amber-50", block.type === "codigo" && "font-mono")}
                    />
                )}

                {block.type !== "separador" && (
                    <AuroraGenerateButton
                        kind="bloque"
                        context={`Bloque de tipo "${labelForType(block.type)}" dentro de: ${presetContext}.`}
                        currentText={block.content}
                        onResult={applyGenerated}
                        size="xs"
                    />
                )}

                {styleOpen && <StyleEditor style={block.style} onChange={(style) => onUpdate({ style })} />}
            </div>
        </div>
    );
}

// ── Vista previa sandbox en vivo (misma fuente que lo publicado) ────────────

function SandboxPreview({ html }: { html: string }) {
    const [debounced, setDebounced] = useState(html);
    useEffect(() => {
        const t = window.setTimeout(() => setDebounced(html), 250);
        return () => window.clearTimeout(t);
    }, [html]);
    return (
        <div className="overflow-hidden rounded-xl border border-white/10 bg-black/30">
            <div className="flex items-center gap-1.5 border-b border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-white/45">
                <Eye className="h-3 w-3" /> Vista previa en vivo (sandbox)
            </div>
            <iframe srcDoc={debounced} sandbox="allow-scripts" className="h-[360px] w-full border-0 bg-white" title="Vista previa del diseño" />
        </div>
    );
}

// ── Componente raíz ──────────────────────────────────────────────────────────

export interface LayoutBuilderProps {
    value: LayoutDoc;
    onChange: (doc: LayoutDoc) => void;
}

export default function LayoutBuilder({ value, onChange }: LayoutBuilderProps) {
    const confirm = useConfirm();
    const set = (patch: Partial<LayoutDoc>) => onChange({ ...value, ...patch });
    const dragIndex = useRef<number | null>(null);

    const html = useMemo(() => layoutDocToHtml(value), [value]);
    const presetLabel = PRESETS[value.preset]?.label || "publicación";

    function addBlock(type: LayoutBlockType) {
        onChange({ ...value, blocks: [...value.blocks, newBlock(type)] });
    }
    function updateBlock(id: string, patch: Partial<LayoutBlock>) {
        onChange({ ...value, blocks: value.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) });
    }
    function removeBlock(id: string) {
        onChange({ ...value, blocks: value.blocks.filter((b) => b.id !== id) });
    }
    function duplicateBlock(id: string) {
        const i = value.blocks.findIndex((b) => b.id === id);
        if (i < 0) return;
        const copy = { ...value.blocks[i], id: newBlockId() };
        const next = [...value.blocks];
        next.splice(i + 1, 0, copy);
        onChange({ ...value, blocks: next });
    }
    function moveBlock(id: string, dir: -1 | 1) {
        const i = value.blocks.findIndex((b) => b.id === id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= value.blocks.length) return;
        const next = [...value.blocks];
        [next[i], next[j]] = [next[j], next[i]];
        onChange({ ...value, blocks: next });
    }
    function reorderTo(targetIndex: number) {
        const from = dragIndex.current;
        if (from === null || from === targetIndex) return;
        const next = [...value.blocks];
        const [moved] = next.splice(from, 1);
        next.splice(targetIndex, 0, moved);
        onChange({ ...value, blocks: next });
        dragIndex.current = null;
    }

    async function applyGeneratedLayout(text: string) {
        try {
            const parsed = JSON.parse(text);
            if (!Array.isArray(parsed)) throw new Error("no-array");
            const validTypes = new Set(BLOCK_DEFS.map((b) => b.type));
            const blocks: LayoutBlock[] = parsed
                .filter((it) => it && typeof it === "object" && validTypes.has(it.type))
                .map((it) => ({
                    ...newBlock(it.type as LayoutBlockType),
                    content: typeof it.content === "string" ? it.content : "",
                }));
            if (!blocks.length) throw new Error("empty");
            if (value.blocks.length > 0) {
                const ok = await confirm({
                    title: "Reemplazar bloques",
                    description: "Aurora generó una nueva estructura. ¿Reemplazar los bloques actuales?",
                    destructive: true,
                });
                if (!ok) return;
            }
            onChange({ ...value, blocks });
            toast.success(`Aurora generó ${blocks.length} bloque(s).`);
        } catch {
            toast.error("Aurora no devolvió una estructura válida. Prueba a pedirlo de otra forma.");
        }
    }

    return (
        <div className="space-y-4 rounded-xl border border-cyan-400/15 bg-cyan-400/[0.03] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-cyan-100">
                    <Palette className="h-4 w-4" /> Diseño — Creador de Layouts
                </div>
                <PillGroup
                    options={[{ id: "bloques", label: "Bloques" }, { id: "codigo", label: "Código libre" }]}
                    value={value.mode}
                    onChange={(mode) => set({ mode })}
                />
            </div>

            {/* Preset de contenedor */}
            <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-white/50">Preset por contexto</label>
                <div className="flex flex-wrap gap-1.5">
                    {PRESET_LIST.map(([id, p]) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => set({ preset: id })}
                            className={cn(
                                "rounded-full border px-3 py-1 text-xs transition-colors",
                                value.preset === id ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-100" : "border-white/15 text-white/55 hover:border-white/30",
                            )}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
            </div>

            {value.mode === "bloques" ? (
                <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
                    <div className="space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <AuroraGenerateButton
                                kind="layout"
                                context={`Layout completo de tipo "${presetLabel}".`}
                                onResult={applyGeneratedLayout}
                                label="Generar estructura con Aurora"
                                placeholder="Describe el layout completo que quieres (ej: 'una página de bienvenida con título, imagen de portada y 3 columnas de beneficios')…"
                            />
                            <div className="flex flex-wrap gap-1">
                                {BLOCK_DEFS.map((b) => (
                                    <button
                                        key={b.type}
                                        type="button"
                                        title={`Añadir ${b.label}`}
                                        onClick={() => addBlock(b.type)}
                                        className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-white/15 text-white/55 hover:border-cyan-400/50 hover:text-cyan-200"
                                    >
                                        <b.icon className="h-3.5 w-3.5" />
                                    </button>
                                ))}
                                <span className="flex items-center pl-1 text-[10px] text-white/30">
                                    <Plus className="mr-0.5 h-3 w-3" /> bloque
                                </span>
                            </div>
                        </div>

                        {value.blocks.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-white/15 bg-white/[0.02] p-6 text-center text-xs text-white/40">
                                Sin bloques todavía. Añade uno del catálogo o pide a Aurora que genere la estructura completa.
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {value.blocks.map((b, i) => (
                                    <BlockCard
                                        key={b.id}
                                        block={b}
                                        index={i}
                                        total={value.blocks.length}
                                        presetContext={presetLabel}
                                        onUpdate={(patch) => updateBlock(b.id, patch)}
                                        onRemove={() => removeBlock(b.id)}
                                        onDuplicate={() => duplicateBlock(b.id)}
                                        onMove={(dir) => moveBlock(b.id, dir)}
                                        dragProps={{
                                            draggable: true,
                                            onDragStart: () => {
                                                dragIndex.current = i;
                                            },
                                            onDragOver: (e) => e.preventDefault(),
                                            onDrop: () => reorderTo(i),
                                            onDragEnd: () => {
                                                dragIndex.current = null;
                                            },
                                        }}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="lg:sticky lg:top-2 lg:self-start">
                        <SandboxPreview html={html} />
                    </div>
                </div>
            ) : (
                <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
                    <div className="space-y-2.5">
                        <AuroraGenerateButton
                            kind="codigo"
                            context={`Página/app/widget de tipo "${presetLabel}".`}
                            currentText={value.freeCode.html}
                            onResult={(text) => set({ freeCode: { ...value.freeCode, html: text } })}
                            label="Generar código con Aurora"
                            placeholder="Describe la página, app o widget de código que quieres (HTML/CSS/JS completo)…"
                        />
                        <div className="space-y-1">
                            <label className="text-[11px] font-medium text-white/50">HTML (o documento completo)</label>
                            <Textarea
                                value={value.freeCode.html}
                                onChange={(e) => set({ freeCode: { ...value.freeCode, html: e.target.value } })}
                                placeholder="<div>Tu HTML aquí…</div> — o pega un documento completo <!doctype html>…"
                                className="min-h-[140px] bg-white/[0.03] font-mono text-xs text-amber-50"
                            />
                        </div>
                        <div className="grid gap-2.5 sm:grid-cols-2">
                            <div className="space-y-1">
                                <label className="text-[11px] font-medium text-white/50">CSS</label>
                                <Textarea
                                    value={value.freeCode.css}
                                    onChange={(e) => set({ freeCode: { ...value.freeCode, css: e.target.value } })}
                                    placeholder="body { … }"
                                    className="min-h-[110px] bg-white/[0.03] font-mono text-xs text-amber-50"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[11px] font-medium text-white/50">JavaScript</label>
                                <Textarea
                                    value={value.freeCode.js}
                                    onChange={(e) => set({ freeCode: { ...value.freeCode, js: e.target.value } })}
                                    placeholder="console.log('hola')"
                                    className="min-h-[110px] bg-white/[0.03] font-mono text-xs text-amber-50"
                                />
                            </div>
                        </div>
                        <p className="text-[11px] text-white/35">
                            Si el campo HTML ya empieza por <code>&lt;!doctype html&gt;</code> se usa tal cual (CSS/JS se ignoran, se
                            asume que ya están dentro). Si no, se combinan automáticamente en un único documento.
                        </p>
                    </div>
                    <div className="lg:sticky lg:top-2 lg:self-start">
                        <SandboxPreview html={html} />
                    </div>
                </div>
            )}
        </div>
    );
}
