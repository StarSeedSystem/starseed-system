'use client';

// ════════════════════════════════════════════════════════════════
// AudiomorphicConfigWindow — ventana de configuración del fondo
// ----------------------------------------------------------------
// Abre una ventana del OS ENCIMA con (1) vista previa interactiva en vivo
// del visualizador (donde el navegador pide permiso de micrófono/cámara) y
// (2) controles: modo (auto reactivo al micrófono / manual autónomo),
// micrófono, cámara/AR, preset visual y opacidad del overlay. Todo se
// guarda en config.background.audiomorphic (sync soberana) y un botón lo
// aplica como fondo del sistema. Escucha 'starseed:open-audiomorphic-config'.
// ════════════════════════════════════════════════════════════════

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
    AudioWaveform, Power, X, ExternalLink, Mic, Camera, Sparkles, Wand2, Zap,
} from "lucide-react";
import { OSWindow } from "@/components/dashboard/apps/os-window";
import { useAppearance } from "@/context/appearance-context";
import { cn } from "@/lib/utils";

const IFRAME_ALLOW =
    "microphone; camera; autoplay; fullscreen; gyroscope; accelerometer; magnetometer; xr-spatial-tracking";

const PRESETS: { id: string; label: string }[] = [
    { id: "nebula", label: "Nebulosa" },
    { id: "genesis", label: "Génesis" },
    { id: "solaris", label: "Solaris" },
    { id: "aqua", label: "Aqua" },
    { id: "void", label: "Vacío" },
];

interface AudioCfg { url?: string; overlay?: number; mode?: "auto" | "manual"; mic?: boolean; camera?: boolean; preset?: string }

/** URL interactiva de vista previa (la app muestra su UI y pide permisos). */
function buildPreviewUrl(cfg: AudioCfg): string {
    const base = cfg.url || "https://audiomorphic.vercel.app";
    try {
        const u = new URL(base);
        u.searchParams.set("starseed_os", "1");
        u.searchParams.set("full", "1");
        u.searchParams.set("autostart", "1");
        if (cfg.mic || cfg.mode === "auto") u.searchParams.set("mic", "1");
        if (cfg.camera) u.searchParams.set("cam", "1");
        if (cfg.preset) u.searchParams.set("preset", cfg.preset);
        return u.toString();
    } catch { return `${base}?starseed_os=1&full=1&autostart=1`; }
}

function Toggle({ on, onClick, icon: Icon, label, hint }: {
    on: boolean; onClick: () => void; icon: typeof Mic; label: string; hint?: string;
}) {
    return (
        <button type="button" onClick={onClick} aria-pressed={on}
            className={cn("w-full flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors cursor-pointer",
                on ? "border-purple-400/50 bg-purple-400/10" : "border-border/50 bg-white/[0.02] hover:bg-white/[0.04]")}>
            <span className={cn("grid place-items-center size-8 rounded-lg shrink-0", on ? "bg-purple-400/20 text-purple-200" : "bg-white/5 text-muted-foreground")}>
                <Icon className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-xs font-bold">{label}</span>
                {hint && <span className="block text-[10px] text-muted-foreground/60 truncate">{hint}</span>}
            </span>
            <span className={cn("h-5 w-9 rounded-full p-0.5 transition-colors shrink-0", on ? "bg-purple-400" : "bg-white/15")}>
                <span className={cn("block size-4 rounded-full bg-white transition-transform", on && "translate-x-4")} />
            </span>
        </button>
    );
}

function ConfigWindow({ onClose }: { onClose: () => void }) {
    const { config, updateConfig } = useAppearance();
    const a = (config.background.audiomorphic ?? {}) as AudioCfg;
    const isActive = (config.background.type as string) === "audiomorphic";
    const overlay = a.overlay ?? 0.15;
    const mode = a.mode ?? "manual";
    const preset = a.preset ?? "nebula";

    const patch = (p: Partial<AudioCfg>) => updateConfig({ background: { audiomorphic: p } } as any);
    const setMode = (m: "auto" | "manual") => patch({ mode: m, mic: m === "auto" });
    const activate = () => updateConfig({ background: { type: "audiomorphic", audiomorphic: a } } as any);
    const deactivate = () => updateConfig({ background: { type: "none" } } as any);

    const previewUrl = buildPreviewUrl(a);

    return (
        <OSWindow
            title="Audiomorphic · Fondo del sistema"
            subtitle="Configura y aplica como fondo"
            icon={AudioWaveform}
            accent="#A855F7"
            onClose={onClose}
            actions={
                <a href="https://audiomorphic.vercel.app/?starseed_os=1&full=1" target="_blank" rel="noopener noreferrer"
                    title="Abrir en pestaña" aria-label="Abrir en pestaña"
                    className="grid place-items-center size-8 rounded-full text-muted-foreground/70 hover:text-foreground hover:bg-white/10 transition-colors cursor-pointer">
                    <ExternalLink className="size-4" />
                </a>
            }
            toolbar={
                <>
                    {!isActive ? (
                        <button type="button" onClick={activate}
                            className="inline-flex items-center gap-1.5 rounded-full border border-purple-400/50 bg-purple-400/15 px-3 py-1 text-[11px] font-bold text-purple-100 hover:bg-purple-400/25 transition-colors cursor-pointer">
                            <Power className="size-3.5" /> Activar como fondo del sistema
                        </button>
                    ) : (
                        <>
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-[11px] font-bold text-emerald-200">
                                <Zap className="size-3.5" /> Fondo activo
                            </span>
                            <button type="button" onClick={deactivate}
                                className="inline-flex items-center gap-1.5 rounded-full border border-border/50 px-3 py-1 text-[11px] font-bold text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors cursor-pointer">
                                <X className="size-3.5" /> Quitar fondo
                            </button>
                        </>
                    )}
                    <span className="text-[10px] text-muted-foreground/55 ml-auto">Los ajustes se guardan automáticamente</span>
                </>
            }
        >
            <div className="absolute inset-0 flex flex-col lg:flex-row">
                {/* Vista previa en vivo (interactiva → concede permisos aquí) */}
                <div className="relative flex-1 min-h-[42%] bg-black">
                    <iframe
                        key={previewUrl}
                        src={previewUrl}
                        title="Vista previa Audiomorphic"
                        className="absolute inset-0 w-full h-full border-0 bg-black"
                        allow={IFRAME_ALLOW}
                        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                        referrerPolicy="no-referrer"
                    />
                    <div className="pointer-events-none absolute top-2 left-2 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white/70 backdrop-blur">
                        Vista previa en vivo · concede aquí micrófono/cámara
                    </div>
                </div>

                {/* Controles */}
                <div className="w-full lg:w-[330px] shrink-0 overflow-auto custom-scrollbar p-4 space-y-4 border-t lg:border-t-0 lg:border-l border-border/40 bg-card/70">
                    <div>
                        <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/60">Modo</div>
                        <div className="grid grid-cols-2 gap-2">
                            <button type="button" onClick={() => setMode("auto")} aria-pressed={mode === "auto"}
                                className={cn("flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-left transition-colors cursor-pointer",
                                    mode === "auto" ? "border-purple-400/50 bg-purple-400/10" : "border-border/50 hover:bg-white/[0.04]")}>
                                <span className="flex items-center gap-1.5 text-xs font-bold"><Mic className="size-3.5" /> Automático</span>
                                <span className="text-[10px] text-muted-foreground/60">Reactivo al micrófono</span>
                            </button>
                            <button type="button" onClick={() => setMode("manual")} aria-pressed={mode === "manual"}
                                className={cn("flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-left transition-colors cursor-pointer",
                                    mode === "manual" ? "border-purple-400/50 bg-purple-400/10" : "border-border/50 hover:bg-white/[0.04]")}>
                                <span className="flex items-center gap-1.5 text-xs font-bold"><Wand2 className="size-3.5" /> Manual</span>
                                <span className="text-[10px] text-muted-foreground/60">Animación autónoma</span>
                            </button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Toggle on={!!a.mic} onClick={() => patch({ mic: !a.mic })} icon={Mic} label="Micrófono" hint="Alimenta el visualizador (audio del entorno)" />
                        <Toggle on={!!a.camera} onClick={() => patch({ camera: !a.camera })} icon={Camera} label="Cámara · AR" hint="Realidad aumentada como fondo" />
                    </div>

                    <div>
                        <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/60 flex items-center gap-1"><Sparkles className="size-3" /> Preset visual</div>
                        <div className="flex flex-wrap gap-1.5">
                            {PRESETS.map((p) => (
                                <button key={p.id} type="button" onClick={() => patch({ preset: p.id })} aria-pressed={preset === p.id}
                                    className={cn("rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer",
                                        preset === p.id ? "border-purple-400/50 bg-purple-400/15 text-purple-100" : "border-border/50 text-muted-foreground hover:bg-white/[0.04]")}>
                                    {p.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <div className="mb-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/60">
                            <span>Opacidad del overlay</span>
                            <span className="tabular-nums text-purple-200">{Math.round(overlay * 100)}%</span>
                        </div>
                        <input type="range" min={0} max={0.8} step={0.01} value={overlay}
                            onChange={(e) => patch({ overlay: Number(e.target.value) })}
                            aria-label="Opacidad del overlay" className="w-full cursor-pointer accent-purple-400" />
                        <p className="mt-1 text-[10px] text-muted-foreground/55">Oscurece el fondo para legibilidad de la interfaz.</p>
                    </div>

                    <p className="text-[10px] leading-relaxed text-muted-foreground/55 border-t border-border/30 pt-3">
                        Versión completa, gratis dentro de StarSeed OS. Los permisos de micrófono y cámara se conceden
                        en la vista previa y persisten para el fondo. Tus ajustes quedan vinculados a tu cuenta.
                    </p>
                </div>
            </div>
        </OSWindow>
    );
}

export function AudiomorphicConfigHost() {
    const [open, setOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    useEffect(() => {
        const h = () => setOpen(true);
        window.addEventListener("starseed:open-audiomorphic-config", h);
        return () => window.removeEventListener("starseed:open-audiomorphic-config", h);
    }, []);
    if (!mounted || !open) return null;
    return createPortal(<ConfigWindow onClose={() => setOpen(false)} />, document.body);
}
