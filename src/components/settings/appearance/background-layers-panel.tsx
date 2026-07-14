"use client";

/*
 * BackgroundLayersPanel — Ajustes → Apariencia → Fondos (Adenda 68 · D)
 * ----------------------------------------------------------------------------
 * Lista de CAPAS de fondo: miniatura · orden (arrastrar) · opacidad (slider) ·
 * visibilidad (ojo) · mezcla · eliminar · "Añadir capa" con el catálogo del OS
 * (incluido Audiomorphic). La vista previa es EL PROPIO FONDO DEL OS: cada
 * cambio se aplica en vivo detrás de los ajustes.
 *
 * Ámbito: cuenta · perfil activo · página/programa actual (overrides reales,
 * resueltos en el AppearanceProvider — página > perfil > cuenta).
 *
 * AUDIOMORPHIC — AHORA ES NATIVO (Adenda 68 · E)
 *  • El visualizador está PORTADO al OS desde la repo del usuario
 *    (StarSeedSystem/Audiomorphic-AR-app) ⇒ ya no es un iframe.
 *  • Transparencia REAL (canvas con alfa): el espiral se compone de verdad
 *    sobre las capas de abajo. Ya no hace falta `mix-blend-mode: screen`.
 *  • TODOS sus parámetros son configurables desde aquí: piloto (Deriva ·
 *    Armónico · Génesis), geometría en resonancia, sensibilidad del micro,
 *    color, velocidad, viscosidad, estela, detalle, zoom…
 *  • El micrófono se concede con un CLIC (nunca al cargar). Sin micrófono el
 *    espiral sigue vivo: el piloto lo anima igual.
 *  • `engine: "iframe"` sigue disponible como RESPALDO (la app externa es el
 *    único sitio con VR/AR). Con él vuelven sus límites: body opaco (conviene
 *    "screen") y parámetros no configurables desde el OS.
 */

import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import {
    AudioWaveform, Cpu, Eye, EyeOff, GripVertical, Image as ImageIcon, Layers,
    Mic, Plus, RotateCcw, Sparkles, SlidersHorizontal, Trash2, Video, Paintbrush, Globe, User, FileCode,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppearance, type BackgroundScopeMode } from "@/context/appearance-context";
import {
    LAYER_CATALOG,
    addLayer,
    audiomorphicFilter,
    normalizeLayers,
    patchAudiomorphic,
    patchAudiomorphicVisual,
    patchLayer,
    removeLayer,
    reorderLayers,
    replaceAudiomorphicVisual,
    type BackgroundLayer,
    type BlendMode,
    type LayerKind,
} from "@/lib/appearance/background-layers";
// Motor NATIVO (Adenda 68·E; COMPLETO en la 69·K): los parámetros REALES.
import {
    DEFAULT_PARAMS,
    SG_MODES as ALL_SG_MODES,
    SG_MODE_LABELS,
    resolveParams,
    type AutoPilotMode,
    type SacredGeometryMode,
    type VisualizerParams,
} from "@/lib/audiomorphic/types";
import {
    AUDIOMORPHIC_MIC_EVENT,
    getMetrics,
    getMicError,
    getMicState,
    startMic,
    stopMic,
    type MicState,
} from "@/lib/audiomorphic/audio-analyzer";
// El MISMO panel de la app: la capa de fondo tiene el menú de ajustes COMPLETO.
import AudiomorphicControlPanel from "@/components/dashboard/apps/audiomorphic/control-panel";

const BLENDS: { id: BlendMode; label: string }[] = [
    { id: "normal", label: "Normal" },
    { id: "screen", label: "Screen (quita el negro)" },
    { id: "lighten", label: "Aclarar" },
    { id: "overlay", label: "Superponer" },
    { id: "soft-light", label: "Luz suave" },
    { id: "multiply", label: "Multiplicar" },
    { id: "color-dodge", label: "Sobreexponer" },
    { id: "difference", label: "Diferencia" },
    { id: "hard-light", label: "Luz fuerte" },
    { id: "luminosity", label: "Luminosidad" },
];

const KIND_ICON: Record<LayerKind, typeof Layers> = {
    audiomorphic: AudioWaveform,
    color: Paintbrush,
    gradiente: Sparkles,
    imagen: ImageIcon,
    video: Video,
};

/* ── Miniatura real de la capa ─────────────────────────────────────────── */
function LayerThumb({ layer }: { layer: BackgroundLayer }) {
    const common = "relative h-11 w-16 shrink-0 overflow-hidden rounded-lg border border-border/40 bg-black";
    if (layer.kind === "audiomorphic") {
        const a = layer.audiomorphic;
        return (
            <div className={common} style={{ filter: a ? audiomorphicFilter(a) : undefined }}>
                <div
                    className="absolute inset-0"
                    style={{
                        background:
                            "radial-gradient(circle at 50% 50%, rgba(168,85,247,0.95) 0%, rgba(34,211,238,0.55) 35%, rgba(0,0,0,1) 72%)",
                    }}
                />
                <AudioWaveform className="absolute inset-0 m-auto size-4 text-white/80" />
            </div>
        );
    }
    if (layer.kind === "imagen") {
        return (
            <div className={cn(common, "bg-cover bg-center")} style={layer.value ? { backgroundImage: `url('${layer.value}')` } : undefined}>
                {!layer.value && <ImageIcon className="absolute inset-0 m-auto size-4 text-muted-foreground/60" />}
            </div>
        );
    }
    if (layer.kind === "video") {
        return (
            <div className={common}>
                <Video className="absolute inset-0 m-auto size-4 text-muted-foreground/60" />
            </div>
        );
    }
    return <div className={common} style={{ background: layer.value || "#000" }} />;
}

/* ── Ajustes específicos de una capa Audiomorphic ──────────────────────── */

const PILOT_MODES: { id: AutoPilotMode; label: string; hint: string }[] = [
    { id: "drift", label: "Deriva", hint: "La espiral deriva sola; los golpes de sonido cambian su ángulo." },
    { id: "harmonic", label: "Armónico", hint: "La nota dominante elige el polígono (tritono, triángulo, hexágono…)." },
    { id: "genesis", label: "Génesis", hint: "La energía del sonido escala la creación: Vacío → Vesica → Flor → Metatrón." },
];

/**
 * Las **20** geometrías reales (Adenda 69·K). Antes solo se ofrecían 4 porque el
 * port venía de la repo equivocada.
 */
const SG_MODES: { id: SacredGeometryMode; label: string }[] = ALL_SG_MODES.map((id) => ({
    id,
    label: SG_MODE_LABELS[id],
}));

/**
 * Solo se persiste lo que DIFIERE del defecto de la app original.
 * Guardar los ~90 parámetros enteros (con los `sgSettings` de las 20 geometrías)
 * engordaría `user_settings.prefs` en cada cambio — justo el problema que la
 * Adenda 68 se pasó arreglando. Con el diff, una capa típica ocupa cuatro claves.
 */
function diffFromDefaults(next: VisualizerParams): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    const d = DEFAULT_PARAMS as unknown as Record<string, unknown>;
    const n = next as unknown as Record<string, unknown>;
    for (const key of Object.keys(n)) {
        if (key === "geometryData") continue; // dato vivo: nunca se persiste
        const a = n[key];
        const b = d[key];
        if (typeof a === "object" && a !== null) {
            if (JSON.stringify(a) !== JSON.stringify(b)) out[key] = a;
        } else if (a !== b) {
            out[key] = a;
        }
    }
    return out;
}

/** El menú de ajustes COMPLETO (el mismo de la app) para una capa de fondo. */
function AudiomorphicFullSettings({ visual, onReplaceVisual, onClose }: {
    visual: Record<string, unknown>;
    onReplaceVisual: (v: Record<string, unknown>) => void;
    onClose: () => void;
}) {
    const params = resolveParams(visual as Partial<VisualizerParams>);
    const [micState, setMicState] = useState<MicState>(getMicState());

    useEffect(() => {
        const on = (e: Event) => setMicState((e as CustomEvent<{ state: MicState }>).detail.state);
        window.addEventListener(AUDIOMORPHIC_MIC_EVENT, on);
        setMicState(getMicState());
        return () => window.removeEventListener(AUDIOMORPHIC_MIC_EVENT, on);
    }, []);

    // `setParams` del panel → parche de la capa (solo el diff con los defectos).
    const setParams: React.Dispatch<React.SetStateAction<VisualizerParams>> = (upd) => {
        const next = typeof upd === "function"
            ? (upd as (p: VisualizerParams) => VisualizerParams)(resolveParams(visual as Partial<VisualizerParams>))
            : upd;
        onReplaceVisual(diffFromDefaults(next));
    };

    const toggleAudio = async () => {
        if (getMicState() === "live") {
            stopMic();
            return;
        }
        const ok = await startMic(params.audioSource);
        if (!ok) toast.error(getMicError() ?? "No se pudo abrir el audio");
    };

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm">
            <div className="flex h-[92vh] w-full max-w-5xl flex-col">
                <AudiomorphicControlPanel
                    params={params}
                    setParams={setParams}
                    audioActive={micState === "live"}
                    toggleAudio={toggleAudio}
                    onClose={onClose}
                    getAudioMetrics={getMetrics}
                    context="background"
                />
            </div>
        </div>
    );
}

function Slider({ label, value, min, max, step, onChange, fmt }: {
    label: string; value: number; min: number; max: number; step: number;
    onChange: (v: number) => void; fmt: (v: number) => string;
}) {
    return (
        <label className="block">
            <span className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                {label} <span className="tabular-nums text-purple-300">{fmt(value)}</span>
            </span>
            <input
                type="range" min={min} max={max} step={step} value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                aria-label={label}
                className="w-full cursor-pointer accent-purple-400"
            />
        </label>
    );
}

function AudiomorphicControls({ layer, onPatch, onPatchVisual, onReplaceVisual }: {
    layer: BackgroundLayer;
    onPatch: (p: Partial<NonNullable<BackgroundLayer["audiomorphic"]>>) => void;
    onPatchVisual: (p: Record<string, unknown>) => void;
    onReplaceVisual: (v: Record<string, unknown>) => void;
}) {
    const a = layer.audiomorphic!;
    const native = a.engine !== "iframe";
    // Los parámetros REALES del motor (lo que no esté guardado = defecto original).
    const v = resolveParams(a.visual as Partial<VisualizerParams>);
    const [micState, setMicState] = useState<MicState>(getMicState());
    /** Menú de ajustes COMPLETO (el mismo de la app) sobre esta capa. */
    const [fullOpen, setFullOpen] = useState(false);

    useEffect(() => {
        const on = (e: Event) => setMicState((e as CustomEvent<{ state: MicState }>).detail.state);
        window.addEventListener(AUDIOMORPHIC_MIC_EVENT, on);
        setMicState(getMicState());
        return () => window.removeEventListener(AUDIOMORPHIC_MIC_EVENT, on);
    }, []);

    /** El permiso SIEMPRE nace de este clic. Nunca se pide al cargar. */
    const toggleMic = async () => {
        if (micState === "live") {
            stopMic();
            onPatch({ mic: false });
            toast.message("Micrófono apagado");
            return;
        }
        const ok = await startMic(); // ← gesto del usuario
        onPatch({ mic: ok });
        if (ok) toast.success("Micrófono activo: el espiral reacciona al sonido");
        else toast.error(getMicError() ?? "No se pudo abrir el micrófono");
    };

    const toggleSg = (mode: SacredGeometryMode) => {
        const cur = v.spiralResonanceModes;
        const next = cur.includes(mode) ? cur.filter((m) => m !== mode) : [...cur, mode];
        onPatchVisual({ spiralResonanceModes: next });
    };

    return (
        <div className="mt-2 space-y-3 rounded-xl border border-purple-400/25 bg-purple-400/[0.04] p-3">
            {fullOpen && (
                <AudiomorphicFullSettings
                    visual={a.visual ?? {}}
                    onReplaceVisual={onReplaceVisual}
                    onClose={() => setFullOpen(false)}
                />
            )}
            {/* Motor */}
            <div>
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                    Motor
                </span>
                <div className="flex flex-wrap gap-1.5">
                    {([
                        { id: "nativo", label: "Nativo", icon: Cpu },
                        { id: "iframe", label: "App externa (respaldo)", icon: Globe },
                    ] as const).map((e) => (
                        <button
                            key={e.id}
                            type="button"
                            onClick={() => onPatch({ engine: e.id })}
                            aria-pressed={a.engine === e.id}
                            className={cn(
                                "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold transition-colors",
                                a.engine === e.id
                                    ? "border-purple-400/60 bg-purple-400/15 text-purple-100"
                                    : "border-border/50 text-muted-foreground hover:bg-white/5",
                            )}
                        >
                            <e.icon className="size-3.5" /> {e.label}
                        </button>
                    ))}
                </div>
                <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground/60">
                    {native ? (
                        <>
                            <b className="text-emerald-300">Nativo</b>: el visualizador corre <b>dentro del OS</b> con
                            <b> transparencia real</b> (canvas con alfa) — se compone de verdad sobre las capas de abajo, sin
                            trucos de mezcla. Todos sus parámetros son configurables aquí.
                        </>
                    ) : (
                        <>
                            <b>App externa</b> (respaldo por iframe): su <code>body</code> es negro opaco ⇒ conviene la mezcla
                            «Screen». Sus controles solo se tocan en «modo interacción», y sus parámetros <b>no</b> se pueden
                            configurar desde aquí. Es el <b>único</b> sitio con <b>VR/AR</b>.
                        </>
                    )}
                </p>
            </div>

            {native ? (
                <>
                    {/* Micrófono — el permiso nace SIEMPRE de este clic */}
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={toggleMic}
                            aria-pressed={micState === "live"}
                            className={cn(
                                "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold transition-colors",
                                micState === "live"
                                    ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-100"
                                    : "border-border/50 text-muted-foreground hover:bg-white/5",
                            )}
                        >
                            <Mic className="size-3.5" />
                            {micState === "live" ? "Micrófono activo" : micState === "requesting" ? "Pidiendo permiso…" : "Activar micrófono"}
                        </button>
                        {micState === "denied" && (
                            <span className="text-[10px] font-semibold text-rose-300">
                                Permiso denegado — actívalo en el candado del navegador.
                            </span>
                        )}
                    </div>
                    <p className="text-[10px] leading-relaxed text-muted-foreground/60">
                        El permiso lo pides <b>tú</b>, con este botón: el OS <b>nunca</b> lo solicita al cargar (y tras recargar
                        hay que volver a pulsarlo — es deliberado). <b>Sin micrófono el espiral sigue vivo</b>: el piloto
                        automático lo anima igual; el sonido solo añade reactividad.
                    </p>

                    {/* Piloto automático */}
                    <div>
                        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                            Piloto automático
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                            {PILOT_MODES.map((m) => (
                                <button
                                    key={m.id}
                                    type="button"
                                    title={m.hint}
                                    onClick={() => onPatchVisual({ autoPilot: true, autoPilotMode: m.id })}
                                    aria-pressed={v.autoPilot && v.autoPilotMode === m.id}
                                    className={cn(
                                        "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold transition-colors",
                                        v.autoPilot && v.autoPilotMode === m.id
                                            ? "border-purple-400/60 bg-purple-400/15 text-purple-100"
                                            : "border-border/50 text-muted-foreground hover:bg-white/5",
                                    )}
                                >
                                    {m.label}
                                </button>
                            ))}
                            <button
                                type="button"
                                onClick={() => onPatchVisual({ autoPilot: !v.autoPilot })}
                                aria-pressed={!v.autoPilot}
                                className={cn(
                                    "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold transition-colors",
                                    !v.autoPilot ? "border-amber-400/60 bg-amber-400/15 text-amber-100" : "border-border/50 text-muted-foreground hover:bg-white/5",
                                )}
                            >
                                {v.autoPilot ? "Congelar" : "Congelado"}
                            </button>
                        </div>
                        <p className="mt-1 text-[10px] text-muted-foreground/55">
                            {PILOT_MODES.find((m) => m.id === v.autoPilotMode)?.hint}
                        </p>
                    </div>

                    {/* MENÚ COMPLETO (Adenda 69·K) — el MISMO panel de la app.
                        Lo de aquí abajo son solo los atajos más usados. */}
                    <button
                        type="button"
                        onClick={() => setFullOpen(true)}
                        className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-cyan-400/50 bg-cyan-400/10 px-3 py-2 text-[11px] font-bold text-cyan-100 transition-colors hover:bg-cyan-400/20"
                    >
                        <SlidersHorizontal className="size-3.5" />
                        Menú de ajustes COMPLETO (todas las opciones)
                    </button>
                    <p className="text-[10px] leading-relaxed text-muted-foreground/60">
                        Abre el panel entero de Audiomorphic: aleatorizador, autorregeneración, las{" "}
                        <b>20 geometrías sagradas</b>, perturbación de la espiral, temas, color, reactividad y
                        presets. Todo <b>desbloqueado</b>. Abajo quedan los atajos rápidos.
                    </p>

                    {/* Geometría en resonancia (perturba la espiral) — las 20 reales */}
                    <div>
                        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                            Geometría en resonancia
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                            {SG_MODES.map((m) => (
                                <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => toggleSg(m.id)}
                                    aria-pressed={v.spiralResonanceModes.includes(m.id)}
                                    className={cn(
                                        "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                                        v.spiralResonanceModes.includes(m.id)
                                            ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-100"
                                            : "border-border/50 text-muted-foreground hover:bg-white/5",
                                    )}
                                >
                                    {m.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Parámetros REALES del motor */}
                    <div className="grid gap-2.5 sm:grid-cols-2">
                        <Slider label="Sensibilidad del micro" value={v.sensitivity} min={0.5} max={15} step={0.1}
                            onChange={(n) => onPatchVisual({ sensitivity: n })} fmt={(n) => n.toFixed(1)} />
                        <Slider label="Velocidad" value={v.autoSpeed} min={0.1} max={3} step={0.05}
                            onChange={(n) => onPatchVisual({ autoSpeed: n })} fmt={(n) => `${n.toFixed(2)}×`} />
                        <Slider label="Viscosidad" value={v.autoViscosity} min={0} max={0.995} step={0.005}
                            onChange={(n) => onPatchVisual({ autoViscosity: n })} fmt={(n) => (n > 0.9 ? "miel" : n > 0.6 ? "aceite" : "agua")} />
                        <Slider label="Color base" value={v.baseHue} min={0} max={360} step={1}
                            onChange={(n) => onPatchVisual({ baseHue: n })} fmt={(n) => `${Math.round(n)}°`} />
                        <Slider label="Rango de color" value={v.hueRange} min={0} max={360} step={1}
                            onChange={(n) => onPatchVisual({ hueRange: n })} fmt={(n) => `${Math.round(n)}°`} />
                        <Slider label="Saturación" value={v.saturation} min={0} max={100} step={1}
                            onChange={(n) => onPatchVisual({ saturation: n })} fmt={(n) => `${Math.round(n)}%`} />
                        <Slider label="Intensidad (brillo)" value={v.brightness} min={0} max={100} step={1}
                            onChange={(n) => onPatchVisual({ brightness: n })} fmt={(n) => `${Math.round(n)}%`} />
                        <Slider label="Ciclo de color" value={v.hueSpeed} min={0} max={2} step={0.05}
                            onChange={(n) => onPatchVisual({ hueSpeed: n })} fmt={(n) => n.toFixed(2)} />
                        <Slider label="Estela" value={v.trail} min={0.02} max={1} step={0.01}
                            onChange={(n) => onPatchVisual({ trail: n })} fmt={(n) => (n >= 1 ? "sin estela" : `${Math.round((1 - n) * 100)}%`)} />
                        <Slider label="Detalle (iteraciones)" value={v.iter} min={200} max={4000} step={50}
                            onChange={(n) => onPatchVisual({ iter: n })} fmt={(n) => String(Math.round(n))} />
                        <Slider label="Profundidad (zoom)" value={v.zoom} min={0.0002} max={0.006} step={0.0001}
                            onChange={(n) => onPatchVisual({ zoom: n })} fmt={(n) => n.toFixed(4)} />
                        <Slider label="Color armónico" value={v.harmonicSensitivity} min={0} max={15} step={0.1}
                            onChange={(n) => onPatchVisual({ harmonicSensitivity: n })} fmt={(n) => n.toFixed(1)} />
                    </div>

                    <button
                        type="button"
                        onClick={() => { onPatchVisual({ ...DEFAULT_PARAMS, showIndicators: false, geometryData: undefined }); toast.success("Parámetros restaurados"); }}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border/50 px-3 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-white/5"
                    >
                        <RotateCcw className="size-3.5" /> Restaurar valores originales
                    </button>
                </>
            ) : (
                <>
                    {/* Respaldo por iframe: lo de siempre */}
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => { onPatch({ mic: !a.mic, interactive: !a.mic ? true : a.interactive }); }}
                            aria-pressed={a.mic}
                            className={cn(
                                "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold transition-colors",
                                a.mic ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-100" : "border-border/50 text-muted-foreground hover:bg-white/5",
                            )}
                        >
                            <Mic className="size-3.5" /> {a.mic ? "Micrófono activado" : "Activar micrófono"}
                        </button>
                        <button
                            type="button"
                            onClick={() => onPatch({ interactive: true })}
                            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-purple-400/50 bg-purple-400/15 px-3 py-1 text-[11px] font-bold text-purple-100 transition-colors hover:bg-purple-400/25"
                        >
                            <SlidersHorizontal className="size-3.5" /> Interactuar con el visualizador
                        </button>
                    </div>
                    <label className="block">
                        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                            URL del visualizador
                        </span>
                        <input
                            type="url"
                            value={a.url}
                            onChange={(e) => onPatch({ url: e.target.value })}
                            placeholder="https://audiomorphic.vercel.app"
                            className="w-full rounded-lg border border-border/50 bg-black/20 px-2 py-1.5 text-xs outline-none focus:border-purple-400/60"
                        />
                    </label>
                </>
            )}

            {/* Filtros CSS de la capa (valen para los dos motores) */}
            <div className="grid gap-2.5 border-t border-border/30 pt-2.5 sm:grid-cols-2">
                <Slider label="Escala" value={a.scale} min={1} max={2} step={0.05} onChange={(n) => onPatch({ scale: n })} fmt={(n) => `${n.toFixed(2)}×`} />
                <Slider label="Tono (filtro)" value={a.hue} min={-180} max={180} step={1} onChange={(n) => onPatch({ hue: n })} fmt={(n) => `${n}°`} />
                <Slider label="Saturación (filtro)" value={a.saturate} min={0} max={2} step={0.05} onChange={(n) => onPatch({ saturate: n })} fmt={(n) => `${Math.round(n * 100)}%`} />
                <Slider label="Brillo (filtro)" value={a.brightness} min={0.2} max={2} step={0.05} onChange={(n) => onPatch({ brightness: n })} fmt={(n) => `${Math.round(n * 100)}%`} />
                <Slider label="Contraste (filtro)" value={a.contrast} min={0.2} max={2} step={0.05} onChange={(n) => onPatch({ contrast: n })} fmt={(n) => `${Math.round(n * 100)}%`} />
            </div>
        </div>
    );
}

/* ── Panel ─────────────────────────────────────────────────────────────── */
export function BackgroundLayersPanel() {
    const {
        config, updateConfig,
        bgScopeMode, setBgScopeMode, bgScopeHasOverride, clearBackgroundScope,
        bgScopePath, bgScopeProfileId,
    } = useAppearance();

    const layers = normalizeLayers(config.background.layers);
    const [openId, setOpenId] = useState<string | null>(null);
    const [dragIdx, setDragIdx] = useState<number | null>(null);
    const [adding, setAdding] = useState(false);

    const setLayers = (next: BackgroundLayer[]) => {
        updateConfig({ background: { layers: next } } as never);
    };

    const onAdd = (kind: LayerKind) => {
        setLayers(addLayer(layers, kind));
        setAdding(false);
        toast.success(kind === "audiomorphic" ? "Audiomorphic añadido como capa" : "Capa añadida");
    };

    const SCOPES: { id: BackgroundScopeMode; label: string; icon: typeof Globe; hint: string }[] = [
        { id: "cuenta", label: "Cuenta", icon: Globe, hint: "Fondo de toda la cuenta (se sincroniza entre dispositivos)." },
        { id: "perfil", label: "Este perfil", icon: User, hint: bgScopeProfileId ? "Solo cuando este perfil está activo." : "No hay perfil activo." },
        { id: "pagina", label: "Esta página", icon: FileCode, hint: `Solo en ${bgScopePath}` },
    ];

    return (
        <div className="rounded-2xl border border-border/50 bg-card/30 p-4 space-y-4">
            <div>
                <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
                    <Layers className="h-4 w-4 text-primary" /> Capas de fondo
                </h3>
                <p className="max-w-prose text-[11px] text-muted-foreground/70">
                    El fondo del OS puede tener <b>varias capas</b>: el fondo base (el motor elegido abajo) y, encima,
                    las capas de esta lista — en orden, con su propia opacidad y modo de mezcla. Arrastra para reordenar.
                    Con la pila vacía funciona exactamente como siempre: un solo fondo.
                </p>
            </div>

            {/* Ámbito */}
            <div className="rounded-xl border border-border/40 bg-white/[0.02] p-2.5">
                <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                    Ámbito de estos cambios
                </div>
                <div className="flex flex-wrap gap-1.5">
                    {SCOPES.map((s) => {
                        const disabled = s.id === "perfil" && !bgScopeProfileId;
                        const active = bgScopeMode === s.id;
                        return (
                            <button
                                key={s.id}
                                type="button"
                                disabled={disabled}
                                onClick={() => setBgScopeMode(s.id)}
                                aria-pressed={active}
                                title={s.hint}
                                className={cn(
                                    "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                                    active ? "border-primary/60 bg-primary/15 text-primary" : "border-border/50 text-muted-foreground hover:bg-white/5",
                                )}
                            >
                                <s.icon className="size-3.5" /> {s.label}
                            </button>
                        );
                    })}
                    {bgScopeMode !== "cuenta" && bgScopeHasOverride && (
                        <button
                            type="button"
                            onClick={() => { clearBackgroundScope(); toast.success("Override eliminado: vuelve a heredar el fondo de la cuenta"); }}
                            className="ml-auto inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border/50 px-3 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-white/5"
                        >
                            <Trash2 className="size-3.5" /> Quitar override
                        </button>
                    )}
                </div>
                <p className="mt-1.5 text-[10px] text-muted-foreground/55">
                    {SCOPES.find((s) => s.id === bgScopeMode)?.hint} Resolución: página → perfil → cuenta.
                </p>
            </div>

            {/* Lista de capas (arriba = la de encima) */}
            <div className="space-y-2">
                {[...layers].reverse().map((layer, revIdx) => {
                    const idx = layers.length - 1 - revIdx;
                    const Icon = KIND_ICON[layer.kind];
                    const open = openId === layer.id;
                    return (
                        <div
                            key={layer.id}
                            draggable
                            onDragStart={() => setDragIdx(idx)}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                                e.preventDefault();
                                if (dragIdx !== null && dragIdx !== idx) setLayers(reorderLayers(layers, dragIdx, idx));
                                setDragIdx(null);
                            }}
                            onDragEnd={() => setDragIdx(null)}
                            className={cn(
                                "rounded-xl border bg-card/40 p-2.5 transition-colors",
                                dragIdx === idx ? "border-primary/60 opacity-60" : "border-border/50",
                                !layer.visible && "opacity-55",
                            )}
                        >
                            <div className="flex items-center gap-2.5">
                                <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground/50 active:cursor-grabbing" />
                                <LayerThumb layer={layer} />
                                <div className="min-w-0 flex-1">
                                    <p className="flex items-center gap-1.5 truncate text-xs font-bold">
                                        <Icon className="size-3.5 shrink-0 text-primary" />
                                        {layer.name ?? layer.kind}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground/60">
                                        {Math.round(layer.opacity * 100)}% · {BLENDS.find((b) => b.id === layer.blend)?.label ?? layer.blend}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setLayers(patchLayer(layers, layer.id, { visible: !layer.visible }))}
                                    aria-pressed={layer.visible}
                                    aria-label={layer.visible ? "Ocultar capa" : "Mostrar capa"}
                                    title={layer.visible ? "Ocultar" : "Mostrar"}
                                    className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
                                >
                                    {layer.visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setOpenId(open ? null : layer.id)}
                                    aria-expanded={open}
                                    aria-label="Ajustes de la capa"
                                    title="Ajustes"
                                    className={cn(
                                        "grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg transition-colors hover:bg-white/10",
                                        open ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
                                    )}
                                >
                                    <SlidersHorizontal className="size-4" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setLayers(removeLayer(layers, layer.id)); toast.success("Capa eliminada"); }}
                                    aria-label="Eliminar capa"
                                    title="Eliminar"
                                    className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-rose-500/15 hover:text-rose-300"
                                >
                                    <Trash2 className="size-4" />
                                </button>
                            </div>

                            {open && (
                                <div className="mt-2.5 space-y-2.5 border-t border-border/30 pt-2.5">
                                    <label className="block">
                                        <span className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                                            Opacidad <span className="tabular-nums text-primary">{Math.round(layer.opacity * 100)}%</span>
                                        </span>
                                        <input
                                            type="range" min={0} max={1} step={0.01} value={layer.opacity}
                                            onChange={(e) => setLayers(patchLayer(layers, layer.id, { opacity: Number(e.target.value) }))}
                                            aria-label="Opacidad de la capa"
                                            className="w-full cursor-pointer accent-primary"
                                        />
                                    </label>

                                    <label className="block">
                                        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                                            Modo de mezcla
                                        </span>
                                        <select
                                            value={layer.blend}
                                            onChange={(e) => setLayers(patchLayer(layers, layer.id, { blend: e.target.value as BlendMode }))}
                                            className="w-full cursor-pointer rounded-lg border border-border/50 bg-black/20 px-2 py-1.5 text-xs outline-none focus:border-primary/60"
                                        >
                                            {BLENDS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                                        </select>
                                    </label>

                                    {(layer.kind === "color" || layer.kind === "gradiente" || layer.kind === "imagen" || layer.kind === "video") && (
                                        <label className="block">
                                            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                                                {layer.kind === "color" ? "Color CSS" : layer.kind === "gradiente" ? "Degradado CSS" : "URL"}
                                            </span>
                                            <input
                                                type="text"
                                                value={layer.value ?? ""}
                                                onChange={(e) => setLayers(patchLayer(layers, layer.id, { value: e.target.value }))}
                                                placeholder={
                                                    layer.kind === "color" ? "#0a0118"
                                                        : layer.kind === "gradiente" ? "linear-gradient(135deg, #7C3AED, #22D3EE)"
                                                            : "https://…"
                                                }
                                                className="w-full rounded-lg border border-border/50 bg-black/20 px-2 py-1.5 text-xs outline-none focus:border-primary/60"
                                            />
                                        </label>
                                    )}

                                    {layer.kind === "audiomorphic" && layer.audiomorphic && (
                                        <AudiomorphicControls
                                            layer={layer}
                                            onPatch={(p) => setLayers(patchAudiomorphic(layers, layer.id, p))}
                                            onPatchVisual={(p) => setLayers(patchAudiomorphicVisual(layers, layer.id, p))}
                                            onReplaceVisual={(v) => setLayers(replaceAudiomorphicVisual(layers, layer.id, v))}
                                        />
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}

                {layers.length === 0 && (
                    <p className="rounded-xl border border-dashed border-border/50 px-3 py-4 text-center text-[11px] text-muted-foreground/60">
                        Sin capas: el OS usa solo el <b>fondo base</b> de abajo. Añade una capa para superponer
                        (por ejemplo, el espiral de Audiomorphic sobre tu degradado).
                    </p>
                )}

                {/* Fondo base (siempre la capa de abajo) */}
                <div className="flex items-center gap-2.5 rounded-xl border border-border/40 bg-white/[0.02] p-2.5">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-border/40 text-muted-foreground">
                        <Layers className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold text-muted-foreground">
                            Fondo base · <span className="text-foreground/80">{String(config.background.type)}</span>
                        </p>
                        <p className="text-[10px] text-muted-foreground/55">
                            El motor del OS (se elige más abajo). Siempre es la capa inferior.
                        </p>
                    </div>
                </div>
            </div>

            {/* Añadir capa */}
            {adding ? (
                <div className="space-y-1.5 rounded-xl border border-primary/40 bg-primary/[0.05] p-2.5">
                    <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">Catálogo de capas</div>
                    {LAYER_CATALOG.map((c) => {
                        const Icon = KIND_ICON[c.kind];
                        return (
                            <button
                                key={c.kind}
                                type="button"
                                onClick={() => onAdd(c.kind)}
                                className="flex w-full cursor-pointer items-start gap-2.5 rounded-lg border border-border/40 px-2.5 py-2 text-left transition-colors hover:border-primary/40 hover:bg-white/5"
                            >
                                <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
                                <span className="min-w-0">
                                    <span className="block text-xs font-bold">{c.label}</span>
                                    <span className="block text-[10px] leading-snug text-muted-foreground/65">{c.hint}</span>
                                </span>
                            </button>
                        );
                    })}
                    <button
                        type="button"
                        onClick={() => setAdding(false)}
                        className="w-full cursor-pointer rounded-lg px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                    >
                        Cancelar
                    </button>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => setAdding(true)}
                    disabled={layers.length >= 8}
                    className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-primary/40 px-3 py-2.5 text-xs font-bold text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <Plus className="size-4" /> Añadir capa
                </button>
            )}
        </div>
    );
}
