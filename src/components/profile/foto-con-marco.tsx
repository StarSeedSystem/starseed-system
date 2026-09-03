"use client";

/**
 * FOTO CON MARCO + EDITOR DE ENCUADRE (Adenda 219 · 2026-09-02)
 * ─────────────────────────────────────────────────────────────────────────────
 * `<FotoConMarco>`  — muestra una imagen o vídeo recortado por la forma del
 *                     marco y encuadrado según su desplazamiento/escala.
 *                     Vale para la foto de perfil, para los medios de una
 *                     publicación y para el lienzo de creación.
 * `<EditorMarco>`   — deja ELEGIR la forma y MOVER/AMPLIAR la imagen dentro
 *                     del marco arrastrando con el ratón o el dedo, con
 *                     controles finos de escala, rotación y borde.
 *
 * El borde se pinta con un degradado StarSeed en la MISMA forma (un segundo
 * recorte detrás, un poco más grande): así la estrella lleva borde de
 * estrella y el hexágono de hexágono, no un círculo de fondo.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { type Marco, FORMAS, MARCO_POR_DEFECTO, clipPathDe, estiloImagen, normalizarMarco } from "@/lib/profile/marco-foto";

export function FotoConMarco({
    src,
    marco,
    alt = "",
    size = 96,
    video = false,
    controles = false,
    className,
    children,
}: {
    src?: string | null;
    marco?: Partial<Marco> | null;
    alt?: string;
    /** Lado en px, o una medida CSS («100%») para llenar un contenedor cuadrado. */
    size?: number | string;
    /** Si el medio es un vídeo. */
    video?: boolean;
    /** Vídeo con controles (publicaciones) en vez de bucle mudo (perfil). */
    controles?: boolean;
    className?: string;
    /** Se pinta cuando no hay `src` (iniciales, icono…). */
    children?: React.ReactNode;
}) {
    const m = normalizarMarco(marco ?? MARCO_POR_DEFECTO);
    const clip = clipPathDe(m.forma);
    const borde = m.borde;
    return (
        <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }} aria-hidden={!alt}>
            {borde > 0 && (
                <div
                    className="absolute inset-0"
                    style={{
                        clipPath: clip,
                        background: m.colorBorde || "linear-gradient(135deg, #e879f9, #a78bfa 50%, #67e8f9)",
                    }}
                />
            )}
            <div
                className="absolute bg-black/40"
                style={{ inset: borde, clipPath: clip, overflow: "hidden" }}
            >
                {src ? (
                    video ? (
                        controles ? (
                            <video src={src} controls preload="metadata" playsInline style={estiloImagen(m)} />
                        ) : (
                            <video src={src} muted loop autoPlay playsInline style={estiloImagen(m)} />
                        )
                    ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={src} alt={alt} draggable={false} style={estiloImagen(m)} />
                    )
                ) : (
                    <div className="flex h-full w-full items-center justify-center">{children}</div>
                )}
            </div>
        </div>
    );
}

export function EditorMarco({
    src,
    value,
    onChange,
    video = false,
    size = 200,
}: {
    src: string;
    value?: Partial<Marco> | null;
    onChange: (m: Marco) => void;
    video?: boolean;
    size?: number;
}) {
    const [m, setM] = useState<Marco>(() => normalizarMarco(value ?? MARCO_POR_DEFECTO));
    useEffect(() => { setM(normalizarMarco(value ?? MARCO_POR_DEFECTO)); }, [value]);

    const set = useCallback((patch: Partial<Marco>) => {
        setM((prev) => { const next = normalizarMarco({ ...prev, ...patch }); onChange(next); return next; });
    }, [onChange]);

    // Arrastre: mueve la imagen dentro del marco (en % del lado).
    const drag = useRef<{ x: number; y: number; mx: number; my: number } | null>(null);
    const onDown = (e: React.PointerEvent) => {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        drag.current = { x: e.clientX, y: e.clientY, mx: m.x, my: m.y };
    };
    const onMove = (e: React.PointerEvent) => {
        if (!drag.current) return;
        const dx = ((e.clientX - drag.current.x) / size) * 100;
        const dy = ((e.clientY - drag.current.y) / size) * 100;
        set({ x: drag.current.mx + dx, y: drag.current.my + dy });
    };
    const onUp = () => { drag.current = null; };
    const onWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        set({ escala: m.escala * (e.deltaY < 0 ? 1.06 : 0.94) });
    };

    const rango = "h-1.5 w-full cursor-pointer accent-fuchsia-400";

    return (
        <div className="space-y-3">
            <div className="flex flex-col items-center gap-2">
                <div
                    className="cursor-grab touch-none select-none active:cursor-grabbing"
                    onPointerDown={onDown}
                    onPointerMove={onMove}
                    onPointerUp={onUp}
                    onPointerCancel={onUp}
                    onWheel={onWheel}
                    title="Arrastra para mover · rueda para ampliar"
                >
                    <FotoConMarco src={src} marco={m} size={size} video={video} />
                </div>
                <p className="text-[10.5px] text-white/45">Arrastra la imagen para colocarla · rueda o control para ampliar</p>
            </div>

            <div>
                <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-white/45">Forma del marco</p>
                <div className="flex flex-wrap gap-1.5">
                    {FORMAS.map((f) => (
                        <button
                            key={f.id}
                            type="button"
                            onClick={() => set({ forma: f.id })}
                            aria-pressed={m.forma === f.id}
                            title={f.nombre}
                            className={cn(
                                "flex h-9 w-9 items-center justify-center rounded-lg border transition-colors",
                                m.forma === f.id ? "border-fuchsia-400/60 bg-fuchsia-500/15" : "border-white/10 bg-white/[0.03] hover:border-white/25",
                            )}
                        >
                            <span className="block h-5 w-5 bg-gradient-to-br from-fuchsia-300 to-cyan-300" style={{ clipPath: clipPathDe(f.id) }} />
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-[10.5px] text-white/55">
                    Ampliación <span className="text-white/80">{m.escala.toFixed(2)}×</span>
                    <input className={rango} type="range" min={0.5} max={3} step={0.01} value={m.escala} onChange={(e) => set({ escala: +e.target.value })} />
                </label>
                <label className="text-[10.5px] text-white/55">
                    Rotación <span className="text-white/80">{Math.round(m.rotacion ?? 0)}°</span>
                    <input className={rango} type="range" min={-180} max={180} step={1} value={m.rotacion ?? 0} onChange={(e) => set({ rotacion: +e.target.value })} />
                </label>
                <label className="text-[10.5px] text-white/55">
                    Horizontal <span className="text-white/80">{Math.round(m.x)}%</span>
                    <input className={rango} type="range" min={-50} max={50} step={1} value={m.x} onChange={(e) => set({ x: +e.target.value })} />
                </label>
                <label className="text-[10.5px] text-white/55">
                    Vertical <span className="text-white/80">{Math.round(m.y)}%</span>
                    <input className={rango} type="range" min={-50} max={50} step={1} value={m.y} onChange={(e) => set({ y: +e.target.value })} />
                </label>
                <label className="text-[10.5px] text-white/55">
                    Borde <span className="text-white/80">{m.borde}px</span>
                    <input className={rango} type="range" min={0} max={12} step={1} value={m.borde} onChange={(e) => set({ borde: +e.target.value })} />
                </label>
                <label className="flex items-center gap-2 text-[10.5px] text-white/55">
                    Color del borde
                    <input type="color" value={m.colorBorde || "#e879f9"} onChange={(e) => set({ colorBorde: e.target.value })} className="h-6 w-8 cursor-pointer rounded border border-white/10 bg-transparent" />
                    <button type="button" onClick={() => set({ colorBorde: undefined })} className="text-[10px] text-cyan-300/80 hover:text-cyan-200">degradado</button>
                </label>
            </div>

            <div className="flex justify-end">
                <button type="button" onClick={() => set(MARCO_POR_DEFECTO)} className="text-[10.5px] text-white/45 hover:text-white/75">Restablecer</button>
            </div>
        </div>
    );
}
