'use client';

// ════════════════════════════════════════════════════════════════
// StarSeed OS — Panel de configuración por WIDGET (icono con preview)
// ----------------------------------------------------------------
// Se abre desde el engranaje que aparece al pasar el ratón (o al
// mantener pulsado en táctil) sobre un widget en vista previa viva.
// Permite ajustar:
//   • Tamaño en celdas (1x1 hasta 4x4) — independiente del tile clásico.
//   • Apariencia: opacidad del cristal, tinte de acento, radio de esquina.
// Todo se guarda en el propio icono (desktop-store: appearance/widgetSpan)
// y es 100% opcional — sin tocar nada, el widget sigue con el cristal
// por defecto del sistema. Presentacional + posicionado (auto-clamp).
// ════════════════════════════════════════════════════════════════

import React from "react";
import { X, RotateCcw, Palette, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DesktopIcon, DesktopWidgetSpan } from "./desktop-store";
import { setWidgetAppearance, resetWidgetAppearance, setWidgetSpan } from "./desktop-store";

const TINTS = ["#007FFF", "#39FF14", "#FFBF00", "#DC143C", "#7C3AED", "#22D3EE", "#F472B6", "#94A3B8"];
const SPANS: DesktopWidgetSpan[] = [
    { cols: 1, rows: 1 }, { cols: 2, rows: 1 }, { cols: 2, rows: 2 },
    { cols: 3, rows: 2 }, { cols: 3, rows: 3 }, { cols: 4, rows: 3 }, { cols: 4, rows: 4 },
];

export function DesktopWidgetConfigPanel({
    desktopId, icon, x, y, onClose,
}: {
    desktopId: string;
    icon: DesktopIcon;
    x: number;
    y: number;
    onClose: () => void;
}): React.ReactElement {
    const appearance = icon.appearance ?? {};
    const span = icon.widgetSpan ?? { cols: 2, rows: 2 };

    return (
        <>
            <div className="fixed inset-0 z-[64]" onPointerDown={onClose} aria-hidden />
            <div
                role="dialog"
                aria-label={`Configurar ${icon.name}`}
                style={{ left: x, top: y, width: 264 }}
                className="fixed z-[65] max-w-[calc(100vw-16px)] rounded-2xl border border-white/12 bg-card/95 p-3 shadow-2xl backdrop-blur-2xl"
                onPointerDown={(e) => e.stopPropagation()}
            >
                <span aria-hidden className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-violet-300/60 to-transparent" />
                <header className="mb-2 flex items-center gap-2">
                    <Palette className="size-3.5 text-violet-300" />
                    <h4 className="min-w-0 flex-1 truncate text-[12px] font-black tracking-tight">{icon.name}</h4>
                    <button
                        type="button"
                        onClick={onClose}
                        title="Cerrar"
                        aria-label="Cerrar configuración"
                        className="grid size-6 place-items-center rounded-full text-muted-foreground/70 transition-colors hover:bg-white/10 hover:text-foreground cursor-pointer"
                    >
                        <X className="size-3.5" />
                    </button>
                </header>

                {/* Tamaño en celdas (solo si tiene vista previa viva) */}
                {icon.viewMode === "preview" && (
                    <section className="mb-3 space-y-1.5">
                        <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.16em] text-muted-foreground/70">
                            <Maximize2 className="size-3" /> Tamaño
                        </p>
                        <div className="grid grid-cols-4 gap-1">
                            {SPANS.map((s) => {
                                const active = span.cols === s.cols && span.rows === s.rows;
                                return (
                                    <button
                                        key={`${s.cols}x${s.rows}`}
                                        type="button"
                                        onClick={() => setWidgetSpan(desktopId, icon.id, s)}
                                        title={`${s.cols}x${s.rows}`}
                                        className={cn(
                                            "rounded-lg border py-1.5 text-[10px] font-black transition-colors cursor-pointer",
                                            active ? "border-violet-300/60 bg-violet-400/20 text-violet-100" : "border-white/10 text-muted-foreground hover:bg-white/10",
                                        )}
                                    >
                                        {s.cols}×{s.rows}
                                    </button>
                                );
                            })}
                        </div>
                    </section>
                )}

                {/* Opacidad del cristal */}
                <section className="mb-3 space-y-1.5">
                    <label className="flex items-center justify-between text-[9px] font-black uppercase tracking-[0.16em] text-muted-foreground/70">
                        Transparencia
                        <span className="text-foreground/80">{Math.round((appearance.opacity ?? 1) * 100)}%</span>
                    </label>
                    <input
                        type="range"
                        min={20}
                        max={100}
                        step={5}
                        value={Math.round((appearance.opacity ?? 1) * 100)}
                        onChange={(e) => setWidgetAppearance(desktopId, icon.id, { opacity: Number(e.target.value) / 100 })}
                        className="w-full cursor-pointer accent-violet-400"
                    />
                </section>

                {/* Radio de esquina */}
                <section className="mb-3 space-y-1.5">
                    <label className="flex items-center justify-between text-[9px] font-black uppercase tracking-[0.16em] text-muted-foreground/70">
                        Redondeo
                        <span className="text-foreground/80">{appearance.radius ?? 16}px</span>
                    </label>
                    <input
                        type="range"
                        min={8}
                        max={32}
                        step={2}
                        value={appearance.radius ?? 16}
                        onChange={(e) => setWidgetAppearance(desktopId, icon.id, { radius: Number(e.target.value) })}
                        className="w-full cursor-pointer accent-violet-400"
                    />
                </section>

                {/* Tinte */}
                <section className="mb-1 space-y-1.5">
                    <p className="text-[9px] font-black uppercase tracking-[0.16em] text-muted-foreground/70">Tinte</p>
                    <div className="flex flex-wrap gap-1.5">
                        {TINTS.map((t) => (
                            <button
                                key={t}
                                type="button"
                                onClick={() => setWidgetAppearance(desktopId, icon.id, { tint: t })}
                                title={t}
                                aria-label={`Tinte ${t}`}
                                className={cn(
                                    "size-6 shrink-0 rounded-full border-2 transition-transform hover:scale-110 cursor-pointer",
                                    appearance.tint === t ? "border-white/80 scale-110" : "border-white/20",
                                )}
                                style={{ background: t }}
                            />
                        ))}
                    </div>
                </section>

                <button
                    type="button"
                    onClick={() => resetWidgetAppearance(desktopId, icon.id)}
                    className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/10 px-2 py-1.5 text-[11px] font-bold text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground cursor-pointer"
                >
                    <RotateCcw className="size-3" /> Restablecer apariencia
                </button>
            </div>
        </>
    );
}
