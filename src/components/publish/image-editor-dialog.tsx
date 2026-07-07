"use client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * ImageEditorDialog — editor ligero de imagen (espíritu Lightroom/Photoshop
 * básico) para adjuntos de imagen del Lienzo de Creación.
 * -----------------------------------------------------------------------------
 * Recorte por proporción (aspect) con desplazamiento (pan), rotación rápida
 * (90°) + enderezado fino, y filtros (brillo/contraste/saturación/temperatura/
 * viñeta) — todo aplicado DE VERDAD sobre un <canvas> (no sólo previsualizado
 * con CSS): el resultado final se sube como un ARCHIVO NUEVO real vía
 * `uploadFile` (bucket `os-files`), y el llamador recibe la nueva URL.
 *
 * SSR-safe (todo el trabajo ocurre en efectos/handlers de cliente). Tolerante:
 * si la imagen no se puede leer en el canvas (CORS de un origen externo), se
 * informa con un error honesto en vez de romper.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useEffect, useRef, useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { uploadFile } from "@/lib/files/os-files";
import {
    Crop,
    RotateCw,
    Sun,
    Contrast as ContrastIcon,
    Droplets,
    Thermometer,
    CircleDashed,
    Loader2,
    Check,
    RotateCcw as ResetIcon,
} from "lucide-react";

export interface ImageEditorDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** URL de la imagen de origen (subida o externa). */
    srcUrl: string;
    /** Se llama con la URL de la nueva imagen ya subida tras "Aplicar". */
    onApply: (newUrl: string) => void;
}

type AspectId = "libre" | "1:1" | "4:5" | "16:9";
const ASPECTS: { id: AspectId; label: string }[] = [
    { id: "libre", label: "Original" },
    { id: "1:1", label: "1:1" },
    { id: "4:5", label: "4:5" },
    { id: "16:9", label: "16:9" },
];

interface EditState {
    aspect: AspectId;
    panX: number; // 0-100
    panY: number; // 0-100
    quickRotation: 0 | 90 | 180 | 270;
    fineRotation: number; // -15..15
    brightness: number; // 50-150
    contrast: number; // 50-150
    saturation: number; // 0-200
    temperature: number; // -50..50
    vignette: number; // 0-100
}

const DEFAULT_STATE: EditState = {
    aspect: "libre",
    panX: 50,
    panY: 50,
    quickRotation: 0,
    fineRotation: 0,
    brightness: 100,
    contrast: 100,
    saturation: 100,
    temperature: 0,
    vignette: 0,
};

/** Rectángulo de recorte (en px de la imagen fuente) para un aspecto + pan dados. */
function cropRectFor(aspect: AspectId, imgW: number, imgH: number, panX: number, panY: number) {
    if (aspect === "libre") return { sx: 0, sy: 0, sw: imgW, sh: imgH };
    const [aw, ah] = aspect.split(":").map(Number);
    const targetRatio = aw / ah;
    const srcRatio = imgW / imgH;
    let cw: number, ch: number;
    if (srcRatio > targetRatio) {
        ch = imgH;
        cw = ch * targetRatio;
    } else {
        cw = imgW;
        ch = cw / targetRatio;
    }
    const maxX = Math.max(0, imgW - cw);
    const maxY = Math.max(0, imgH - ch);
    return { sx: maxX * (panX / 100), sy: maxY * (panY / 100), sw: cw, sh: ch };
}

/** Compone el resultado final en un <canvas> nuevo: recorte → rotación → filtros → viñeta. */
function renderToCanvas(img: HTMLImageElement, state: EditState): HTMLCanvasElement {
    const { sx, sy, sw, sh } = cropRectFor(state.aspect, img.naturalWidth, img.naturalHeight, state.panX, state.panY);

    // 1) Recorte + brillo/contraste/saturación (ctx.filter aplica al drawImage).
    const cropped = document.createElement("canvas");
    cropped.width = Math.max(1, Math.round(sw));
    cropped.height = Math.max(1, Math.round(sh));
    const cctx = cropped.getContext("2d")!;
    cctx.filter = `brightness(${state.brightness}%) contrast(${state.contrast}%) saturate(${state.saturation}%)`;
    cctx.drawImage(img, sx, sy, sw, sh, 0, 0, cropped.width, cropped.height);

    // 2) Rotación (90° rápida, que intercambia dimensiones, + enderezado fino).
    const swap = state.quickRotation === 90 || state.quickRotation === 270;
    const outW = swap ? cropped.height : cropped.width;
    const outH = swap ? cropped.width : cropped.height;
    const rotated = document.createElement("canvas");
    rotated.width = outW;
    rotated.height = outH;
    const rctx = rotated.getContext("2d")!;
    const rad = ((state.quickRotation + state.fineRotation) * Math.PI) / 180;
    rctx.translate(outW / 2, outH / 2);
    rctx.rotate(rad);
    rctx.drawImage(cropped, -cropped.width / 2, -cropped.height / 2);
    rctx.setTransform(1, 0, 0, 1, 0, 0);

    // 3) Temperatura: superposición cálida (ámbar) o fría (azul) por "overlay".
    if (state.temperature !== 0) {
        const warm = state.temperature > 0;
        const alpha = Math.min(1, Math.abs(state.temperature) / 100);
        rctx.globalCompositeOperation = "overlay";
        rctx.fillStyle = warm ? `rgba(255,159,28,${alpha})` : `rgba(28,130,255,${alpha})`;
        rctx.fillRect(0, 0, outW, outH);
        rctx.globalCompositeOperation = "source-over";
    }

    // 4) Viñeta: degradado radial oscurecido hacia los bordes ("multiply").
    if (state.vignette > 0) {
        const strength = state.vignette / 100;
        const grad = rctx.createRadialGradient(
            outW / 2, outH / 2, Math.min(outW, outH) * 0.25,
            outW / 2, outH / 2, Math.max(outW, outH) * 0.72,
        );
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(1, `rgba(0,0,0,${strength})`);
        rctx.globalCompositeOperation = "multiply";
        rctx.fillStyle = grad;
        rctx.fillRect(0, 0, outW, outH);
        rctx.globalCompositeOperation = "source-over";
    }

    return rotated;
}

function Slider({
    label, icon: IconCmp, value, min, max, step = 1, onChange, suffix = "",
}: {
    label: string; icon: typeof Sun; value: number; min: number; max: number; step?: number;
    onChange: (v: number) => void; suffix?: string;
}) {
    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] text-white/55">
                <span className="flex items-center gap-1.5">
                    <IconCmp className="h-3.5 w-3.5" /> {label}
                </span>
                <span className="text-cyan-200">{value}{suffix}</span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                className="w-full accent-cyan-400"
            />
        </div>
    );
}

export default function ImageEditorDialog({ open, onOpenChange, srcUrl, onApply }: ImageEditorDialogProps) {
    const [state, setState] = useState<EditState>(DEFAULT_STATE);
    const [img, setImg] = useState<HTMLImageElement | null>(null);
    const [loadError, setLoadError] = useState(false);
    const [applying, setApplying] = useState(false);
    const previewRef = useRef<HTMLCanvasElement>(null);
    const set = (patch: Partial<EditState>) => setState((s) => ({ ...s, ...patch }));

    // Carga la imagen al abrir (o al cambiar de origen); reinicia el estado.
    useEffect(() => {
        if (!open || !srcUrl) return;
        setState(DEFAULT_STATE);
        setLoadError(false);
        const el = new Image();
        el.crossOrigin = "anonymous";
        el.onload = () => setImg(el);
        el.onerror = () => setLoadError(true);
        el.src = srcUrl;
        return () => {
            setImg(null);
        };
    }, [open, srcUrl]);

    // Redibuja la vista previa (misma función que el resultado final: WYSIWYG).
    useEffect(() => {
        if (!img || !previewRef.current) return;
        try {
            const out = renderToCanvas(img, state);
            const canvas = previewRef.current;
            canvas.width = out.width;
            canvas.height = out.height;
            const ctx = canvas.getContext("2d");
            ctx?.clearRect(0, 0, canvas.width, canvas.height);
            ctx?.drawImage(out, 0, 0);
        } catch {
            setLoadError(true);
        }
    }, [img, state]);

    async function handleApply() {
        if (!img) return;
        setApplying(true);
        try {
            const out = renderToCanvas(img, state);
            const blob: Blob | null = await new Promise((resolve) => {
                try {
                    out.toBlob((b) => resolve(b), "image/png", 0.95);
                } catch {
                    resolve(null);
                }
            });
            if (!blob) {
                toast.error("No se pudo procesar esta imagen (posible restricción de origen/CORS). Prueba subiendo el archivo original antes de editarlo.");
                return;
            }
            const file = new File([blob], "editada.png", { type: "image/png" });
            const res = await uploadFile(file, { folder: "publicaciones/editadas" });
            if (!res.ok || !res.file || !res.file.url) {
                toast.error(res.error || "No se pudo guardar la imagen editada.");
                return;
            }
            onApply(res.file.url);
            toast.success("Imagen editada aplicada.");
            onOpenChange(false);
        } finally {
            setApplying(false);
        }
    }

    const cropRect = img ? cropRectFor(state.aspect, img.naturalWidth, img.naturalHeight, state.panX, state.panY) : null;
    const canPanX = Boolean(img) && cropRect ? cropRect.sw < img!.naturalWidth - 0.5 : false;
    const canPanY = Boolean(img) && cropRect ? cropRect.sh < img!.naturalHeight - 0.5 : false;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle className="text-amber-50">Editar imagen</DialogTitle>
                    <DialogDescription className="text-white/50">
                        Recorte, rotación y filtros — se aplican de verdad y se guardan como una imagen nueva.
                    </DialogDescription>
                </DialogHeader>

                {loadError ? (
                    <div className="rounded-lg border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">
                        No se pudo cargar esta imagen para editarla (puede bloquear el acceso entre orígenes). Sube el
                        archivo directamente a StarSeed y vuelve a intentarlo.
                    </div>
                ) : !img ? (
                    <div className="flex items-center gap-2 p-6 text-sm text-white/50">
                        <Loader2 className="h-4 w-4 animate-spin" /> Cargando imagen…
                    </div>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-[1.3fr_1fr]">
                        {/* Vista previa EN VIVO — el mismo canvas que se sube al aplicar */}
                        <div className="flex items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/40 p-2">
                            <canvas ref={previewRef} className="max-h-[420px] w-full object-contain" />
                        </div>

                        <div className="max-h-[440px] space-y-4 overflow-y-auto pr-1">
                            {/* Recorte por proporción */}
                            <div className="space-y-1.5">
                                <label className="flex items-center gap-1.5 text-xs font-medium text-white/60">
                                    <Crop className="h-3.5 w-3.5" /> Recorte
                                </label>
                                <div className="flex flex-wrap gap-1.5">
                                    {ASPECTS.map((a) => (
                                        <button
                                            key={a.id}
                                            type="button"
                                            onClick={() => set({ aspect: a.id, panX: 50, panY: 50 })}
                                            className={cn(
                                                "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                                                state.aspect === a.id
                                                    ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-100"
                                                    : "border-white/15 text-white/55 hover:border-white/30",
                                            )}
                                        >
                                            {a.label}
                                        </button>
                                    ))}
                                </div>
                                {(canPanX || canPanY) && (
                                    <div className="space-y-2 pt-1">
                                        {canPanX && (
                                            <Slider label="Desplazar horizontal" icon={Crop} value={state.panX} min={0} max={100} onChange={(v) => set({ panX: v })} suffix="%" />
                                        )}
                                        {canPanY && (
                                            <Slider label="Desplazar vertical" icon={Crop} value={state.panY} min={0} max={100} onChange={(v) => set({ panY: v })} suffix="%" />
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Rotación */}
                            <div className="space-y-1.5">
                                <label className="flex items-center gap-1.5 text-xs font-medium text-white/60">
                                    <RotateCw className="h-3.5 w-3.5" /> Rotación
                                </label>
                                <div className="flex gap-1.5">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => set({ quickRotation: ((state.quickRotation + 90) % 360) as EditState["quickRotation"] })}
                                        className="h-7 gap-1.5 px-2.5 text-xs"
                                    >
                                        <RotateCw className="h-3.5 w-3.5" /> Girar 90°
                                    </Button>
                                    <span className="flex items-center text-[11px] text-white/40">{state.quickRotation}°</span>
                                </div>
                                <Slider label="Enderezar" icon={RotateCw} value={state.fineRotation} min={-15} max={15} onChange={(v) => set({ fineRotation: v })} suffix="°" />
                            </div>

                            {/* Filtros */}
                            <div className="space-y-2.5">
                                <label className="text-xs font-medium text-white/60">Filtros</label>
                                <Slider label="Brillo" icon={Sun} value={state.brightness} min={50} max={150} onChange={(v) => set({ brightness: v })} suffix="%" />
                                <Slider label="Contraste" icon={ContrastIcon} value={state.contrast} min={50} max={150} onChange={(v) => set({ contrast: v })} suffix="%" />
                                <Slider label="Saturación" icon={Droplets} value={state.saturation} min={0} max={200} onChange={(v) => set({ saturation: v })} suffix="%" />
                                <Slider label="Temperatura" icon={Thermometer} value={state.temperature} min={-50} max={50} onChange={(v) => set({ temperature: v })} />
                                <Slider label="Viñeta" icon={CircleDashed} value={state.vignette} min={0} max={100} onChange={(v) => set({ vignette: v })} suffix="%" />
                            </div>

                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setState(DEFAULT_STATE)}
                                className="gap-1.5 text-xs text-white/50 hover:text-white/80"
                            >
                                <ResetIcon className="h-3.5 w-3.5" /> Restablecer
                            </Button>
                        </div>
                    </div>
                )}

                <div className="flex items-center justify-end gap-2 border-t border-white/10 pt-3">
                    <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="text-white/60">
                        Cancelar
                    </Button>
                    <Button
                        type="button"
                        onClick={handleApply}
                        disabled={!img || applying || loadError}
                        className="gap-1.5 bg-cyan-500/80 text-white hover:bg-cyan-500"
                    >
                        {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        Aplicar y subir
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
