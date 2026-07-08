"use client";

/*
 * Canvas2DEditor — mini editor 2D (espíritu Illustrator acotado) para crear
 * iconos y fondos personalizados: formas (rect/círculo/línea/estrella),
 * relleno sólido o degradado de 2 paradas, texto, capas con orden, y
 * exportación real a SVG (serializado) o PNG (rasterizado a 2x en un
 * <canvas> off-screen). El PNG se sube a `os-files` y queda listo para
 * usarse como fondo/avatar vía `onUse`. También permite subir una FOTO y
 * editarla reutilizando `ImageEditorDialog` (recorte/rotación/filtros).
 */

import React, { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
    Square, Circle, Minus as LineIcon, Star as StarIcon, Type as TypeIcon,
    Trash2, ChevronUp, ChevronDown, Download, Upload, Loader2, ImagePlus, Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { uploadFile } from "@/lib/files/os-files";
import { makeId } from "./types";

const ImageEditorDialog = React.lazy(() => import("@/components/publish/image-editor-dialog"));

type ShapeKind = "rect" | "circle" | "line" | "star" | "text";

interface GradientFill { from: string; to: string; angle: number }

interface Shape2D {
    id: string;
    kind: ShapeKind;
    x: number;
    y: number;
    size: number;
    fill: string;
    gradient?: GradientFill;
    text?: string;
    fontSize?: number;
    strokeWidth?: number;
    rotation: number;
}

const VB_W = 480;
const VB_H = 300;

function newShape(kind: ShapeKind, index: number): Shape2D {
    const base = { id: makeId("shape"), x: 80 + (index % 5) * 24, y: 60 + (index % 4) * 20, size: 90, fill: "#8850ee", rotation: 0 };
    if (kind === "text") return { ...base, kind, text: "StarSeed", fontSize: 28, fill: "#ffffff" };
    if (kind === "line") return { ...base, kind, strokeWidth: 6, fill: "#22d3ee" };
    return { ...base, kind };
}

function fillFor(s: Shape2D): string {
    return s.gradient ? `url(#grad-${s.id})` : s.fill;
}

function ShapeNode({ s }: { s: Shape2D }) {
    const fill = fillFor(s);
    const transform = s.rotation ? `rotate(${s.rotation} ${s.x} ${s.y})` : undefined;
    switch (s.kind) {
        case "rect":
            return <rect x={s.x - s.size / 2} y={s.y - s.size / 2} width={s.size} height={s.size * 0.7} rx={12} fill={fill} transform={transform} />;
        case "circle":
            return <circle cx={s.x} cy={s.y} r={s.size / 2} fill={fill} transform={transform} />;
        case "line":
            return <line x1={s.x - s.size / 2} y1={s.y} x2={s.x + s.size / 2} y2={s.y} stroke={fill} strokeWidth={s.strokeWidth ?? 6} strokeLinecap="round" transform={transform} />;
        case "star": {
            const pts = starPoints(s.x, s.y, s.size / 2, s.size / 4.5, 5);
            return <polygon points={pts} fill={fill} transform={transform} />;
        }
        case "text":
            return <text x={s.x} y={s.y} fill={fill} fontSize={s.fontSize ?? 28} fontWeight={700} textAnchor="middle" fontFamily="sans-serif">{s.text}</text>;
        default:
            return null;
    }
}

function starPoints(cx: number, cy: number, outerR: number, innerR: number, spikes: number): string {
    const pts: string[] = [];
    const step = Math.PI / spikes;
    let rot = -Math.PI / 2;
    for (let i = 0; i < spikes; i++) {
        pts.push(`${cx + Math.cos(rot) * outerR},${cy + Math.sin(rot) * outerR}`);
        rot += step;
        pts.push(`${cx + Math.cos(rot) * innerR},${cy + Math.sin(rot) * innerR}`);
        rot += step;
    }
    return pts.join(" ");
}

async function svgToPngBlob(svgEl: SVGSVGElement, scale = 2): Promise<Blob | null> {
    try {
        const xml = new XMLSerializer().serializeToString(svgEl);
        const b64 = btoa(unescape(encodeURIComponent(xml)));
        const url = `data:image/svg+xml;base64,${b64}`;
        const img = new Image();
        const loaded: HTMLImageElement | null = await new Promise((resolve) => {
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = url;
        });
        if (!loaded) return null;
        const canvas = document.createElement("canvas");
        canvas.width = VB_W * scale;
        canvas.height = VB_H * scale;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        ctx.drawImage(loaded, 0, 0, canvas.width, canvas.height);
        return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png", 0.95));
    } catch {
        return null;
    }
}

function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export interface Canvas2DEditorProps {
    /** Se llama con la URL final (subida a os-files) lista para usar como fondo/icono/avatar. */
    onUse?: (url: string) => void;
}

export function Canvas2DEditor({ onUse }: Canvas2DEditorProps) {
    const [shapes, setShapes] = useState<Shape2D[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [bg, setBg] = useState("#0c0a16");
    const [busy, setBusy] = useState<"" | "png" | "upload">("");
    const [photoSrc, setPhotoSrc] = useState<string | null>(null);
    const [editorOpen, setEditorOpen] = useState(false);
    const svgRef = useRef<SVGSVGElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const selected = useMemo(() => shapes.find((s) => s.id === selectedId) ?? null, [shapes, selectedId]);

    function addShape(kind: ShapeKind) {
        const s = newShape(kind, shapes.length);
        setShapes((prev) => [...prev, s]);
        setSelectedId(s.id);
    }
    function updateSelected(patch: Partial<Shape2D>) {
        if (!selected) return;
        setShapes((prev) => prev.map((s) => (s.id === selected.id ? { ...s, ...patch } : s)));
    }
    function removeSelected() {
        if (!selected) return;
        setShapes((prev) => prev.filter((s) => s.id !== selected.id));
        setSelectedId(null);
    }
    function move(id: string, dir: -1 | 1) {
        setShapes((prev) => {
            const i = prev.findIndex((s) => s.id === id);
            const j = i + dir;
            if (i < 0 || j < 0 || j >= prev.length) return prev;
            const next = [...prev];
            [next[i], next[j]] = [next[j], next[i]];
            return next;
        });
    }

    async function handleExportSvg() {
        if (!svgRef.current) return;
        const xml = new XMLSerializer().serializeToString(svgRef.current);
        downloadBlob(new Blob([xml], { type: "image/svg+xml" }), "estudio-diseno.svg");
    }

    async function handleExportPngUpload() {
        if (!svgRef.current) return;
        setBusy("png");
        try {
            const blob = await svgToPngBlob(svgRef.current);
            if (!blob) {
                toast.error("No se pudo generar el PNG.");
                return;
            }
            setBusy("upload");
            const file = new File([blob], "estudio-diseno.png", { type: "image/png" });
            const res = await uploadFile(file, { folder: "estudio/disenos-2d" });
            if (!res.ok || !res.file?.url) {
                toast.error(res.error || "No se pudo subir la imagen.");
                return;
            }
            toast.success("Imagen creada y subida.");
            onUse?.(res.file.url);
        } finally {
            setBusy("");
        }
    }

    async function handlePhotoPick(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        setBusy("upload");
        try {
            const res = await uploadFile(file, { folder: "estudio/fotos" });
            if (!res.ok || !res.file?.url) {
                toast.error(res.error || "No se pudo subir la foto.");
                return;
            }
            setPhotoSrc(res.file.url);
            setEditorOpen(true);
        } finally {
            setBusy("");
        }
    }

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
                <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => addShape("rect")}><Square className="h-3.5 w-3.5" /> Rect.</Button>
                <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => addShape("circle")}><Circle className="h-3.5 w-3.5" /> Círculo</Button>
                <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => addShape("line")}><LineIcon className="h-3.5 w-3.5" /> Línea</Button>
                <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => addShape("star")}><StarIcon className="h-3.5 w-3.5" /> Estrella</Button>
                <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => addShape("text")}><TypeIcon className="h-3.5 w-3.5" /> Texto</Button>
                <span className="mx-1 h-5 w-px bg-white/10" />
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoPick} />
                <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => fileRef.current?.click()} disabled={busy !== ""}>
                    {busy === "upload" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />} Editar foto…
                </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
                <div className="overflow-hidden rounded-xl border border-white/10" style={{ background: bg }}>
                    <svg ref={svgRef} viewBox={`0 0 ${VB_W} ${VB_H}`} width="100%" height="220" onClick={() => setSelectedId(null)}>
                        <defs>
                            {shapes.filter((s) => s.gradient).map((s) => (
                                <linearGradient key={s.id} id={`grad-${s.id}`} gradientTransform={`rotate(${s.gradient!.angle} 0.5 0.5)`}>
                                    <stop offset="0%" stopColor={s.gradient!.from} />
                                    <stop offset="100%" stopColor={s.gradient!.to} />
                                </linearGradient>
                            ))}
                        </defs>
                        {shapes.map((s) => (
                            <g key={s.id} onClick={(e) => { e.stopPropagation(); setSelectedId(s.id); }} style={{ cursor: "pointer" }}>
                                <ShapeNode s={s} />
                                {selectedId === s.id && (
                                    <rect x={s.x - s.size / 2 - 4} y={s.y - s.size / 2 - 4} width={s.size + 8} height={s.size * 0.7 + 8} fill="none" stroke="#22d3ee" strokeDasharray="4 3" pointerEvents="none" />
                                )}
                            </g>
                        ))}
                    </svg>
                </div>

                <div className="space-y-2">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-white/50">Capas ({shapes.length})</p>
                    <div className="max-h-32 space-y-1 overflow-y-auto">
                        {shapes.map((s, i) => (
                            <div key={s.id} className={cn("flex items-center gap-1 rounded-lg border px-1.5 py-1 text-[11px]", selectedId === s.id ? "border-cyan-400/50 bg-cyan-400/10" : "border-white/10")}>
                                <button type="button" className="flex-1 truncate text-left" onClick={() => setSelectedId(s.id)}>{i + 1}. {s.kind}</button>
                                <button type="button" title="Subir en la lista" onClick={() => move(s.id, -1)} className="text-white/40 hover:text-white"><ChevronUp className="h-3 w-3" /></button>
                                <button type="button" title="Bajar en la lista" onClick={() => move(s.id, 1)} className="text-white/40 hover:text-white"><ChevronDown className="h-3 w-3" /></button>
                                <button type="button" onClick={() => setShapes((prev) => prev.filter((x) => x.id !== s.id))} className="text-white/40 hover:text-red-300"><Trash2 className="h-3 w-3" /></button>
                            </div>
                        ))}
                        {!shapes.length && <p className="text-[11px] text-white/30">Añade una forma para empezar.</p>}
                    </div>

                    {selected && (
                        <div className="space-y-1.5 rounded-lg border border-white/10 p-2">
                            {selected.kind === "text" ? (
                                <input value={selected.text ?? ""} onChange={(e) => updateSelected({ text: e.target.value })} className="w-full rounded border border-white/10 bg-black/30 px-1.5 py-1 text-[11px]" />
                            ) : null}
                            <div className="flex items-center gap-1.5">
                                <input type="color" value={/^#/.test(selected.fill) ? selected.fill : "#8850ee"} onChange={(e) => updateSelected({ fill: e.target.value, gradient: undefined })} className="h-6 w-6 cursor-pointer rounded border border-white/15 bg-transparent" />
                                <button
                                    type="button"
                                    className="text-[10px] text-white/40 hover:text-white/70"
                                    onClick={() => updateSelected({ gradient: selected.gradient ? undefined : { from: selected.fill, to: "#22d3ee", angle: 45 } })}
                                >
                                    {selected.gradient ? "quitar degradado" : "+ degradado"}
                                </button>
                            </div>
                            {selected.gradient && (
                                <div className="flex items-center gap-1.5">
                                    <input type="color" value={selected.gradient.from} onChange={(e) => updateSelected({ gradient: { ...selected.gradient!, from: e.target.value } })} className="h-6 w-6 cursor-pointer rounded border border-white/15 bg-transparent" />
                                    <input type="color" value={selected.gradient.to} onChange={(e) => updateSelected({ gradient: { ...selected.gradient!, to: e.target.value } })} className="h-6 w-6 cursor-pointer rounded border border-white/15 bg-transparent" />
                                </div>
                            )}
                            <Slider value={[selected.size]} min={20} max={260} onValueChange={([v]) => updateSelected({ size: v })} />
                            <Slider value={[selected.rotation]} min={0} max={360} onValueChange={([v]) => updateSelected({ rotation: v })} />
                            <Button size="sm" variant="ghost" className="h-6 w-full gap-1 text-[10px] text-red-300/80 hover:text-red-300" onClick={removeSelected}>
                                <Trash2 className="h-3 w-3" /> Eliminar capa
                            </Button>
                        </div>
                    )}

                    <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-white/40">Fondo lienzo</span>
                        <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} className="h-6 w-6 cursor-pointer rounded border border-white/15 bg-transparent" />
                    </div>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={handleExportSvg}>
                    <Download className="h-3.5 w-3.5" /> Exportar SVG
                </Button>
                <Button size="sm" className="h-8 gap-1.5 bg-cyan-500/80 text-xs text-white hover:bg-cyan-500" onClick={handleExportPngUpload} disabled={busy !== ""}>
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />} Exportar PNG y usar
                </Button>
                <span className="text-[10px] text-white/30">El PNG se sube a tus archivos (os-files) y puede usarse como fondo o avatar.</span>
            </div>

            {editorOpen && photoSrc && (
                <React.Suspense fallback={null}>
                    <ImageEditorDialog
                        open={editorOpen}
                        onOpenChange={setEditorOpen}
                        srcUrl={photoSrc}
                        onApply={(url) => { onUse?.(url); }}
                    />
                </React.Suspense>
            )}
        </div>
    );
}

export default Canvas2DEditor;
