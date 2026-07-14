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
 * Honestidad sobre Audiomorphic (verificado leyendo su bundle y en vivo):
 *  • La app NO acepta parámetros visuales por URL (preset/colores/velocidad/
 *    sensibilidad NO existen como querystring). Lo único que entiende es
 *    `source=starseed…` (vinculación con la cuenta StarSeed).
 *  • Su <body> es opaco (#050505) ⇒ NO hay transparencia de iframe posible.
 *    Se usa `mix-blend-mode: screen`, que hace desaparecer el negro y deja
 *    únicamente el espiral sobre la capa de abajo.
 *  • Sus propios controles (Deriva/Armónico/Génesis, Iniciar Micrófono) se usan
 *    con el "modo interacción". El micrófono lo concede el usuario ahí dentro.
 *  • Lo que el OS SÍ controla de verdad: opacidad, mezcla, escala y filtros CSS
 *    (tono, saturación, brillo, contraste).
 */

import React, { useState } from "react";
import { toast } from "sonner";
import {
    AudioWaveform, Eye, EyeOff, GripVertical, Image as ImageIcon, Layers,
    Mic, Plus, Sparkles, SlidersHorizontal, Trash2, Video, Paintbrush, Globe, User, FileCode,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppearance, type BackgroundScopeMode } from "@/context/appearance-context";
import {
    LAYER_CATALOG,
    addLayer,
    audiomorphicFilter,
    normalizeLayers,
    patchAudiomorphic,
    patchLayer,
    removeLayer,
    reorderLayers,
    type BackgroundLayer,
    type BlendMode,
    type LayerKind,
} from "@/lib/appearance/background-layers";

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
function AudiomorphicControls({ layer, onPatch }: {
    layer: BackgroundLayer;
    onPatch: (p: Partial<NonNullable<BackgroundLayer["audiomorphic"]>>) => void;
}) {
    const a = layer.audiomorphic!;
    const Row = ({ label, value, min, max, step, onChange, fmt }: {
        label: string; value: number; min: number; max: number; step: number;
        onChange: (v: number) => void; fmt: (v: number) => string;
    }) => (
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

    return (
        <div className="mt-2 space-y-3 rounded-xl border border-purple-400/25 bg-purple-400/[0.04] p-3">
            {/* Micrófono + modo interacción (el ÚNICO camino real al audio) */}
            <div className="flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    onClick={() => {
                        const on = !a.mic;
                        onPatch({ mic: on, interactive: on ? true : a.interactive });
                        toast[on ? "success" : "message"](
                            on
                                ? "Modo interacción activo: pulsa «Iniciar Micrófono» dentro del visualizador"
                                : "Micrófono desactivado",
                        );
                    }}
                    aria-pressed={a.mic}
                    className={cn(
                        "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold transition-colors",
                        a.mic
                            ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-100"
                            : "border-border/50 text-muted-foreground hover:bg-white/5",
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
            <p className="text-[10px] leading-relaxed text-muted-foreground/60">
                El permiso de micrófono lo concedes <b>tú</b>, dentro del visualizador (botón «Iniciar Micrófono»):
                el OS nunca lo pide solo. Al salir del modo interacción el sonido y la escena siguen vivos, porque el
                iframe no se recarga. Los presets del espiral (Deriva · Armónico · Génesis) también se eligen ahí:
                la app <b>no</b> los acepta por URL.
            </p>

            <Row label="Escala" value={a.scale} min={1} max={2} step={0.05} onChange={(v) => onPatch({ scale: v })} fmt={(v) => `${v.toFixed(2)}×`} />
            <Row label="Tono" value={a.hue} min={-180} max={180} step={1} onChange={(v) => onPatch({ hue: v })} fmt={(v) => `${v}°`} />
            <Row label="Saturación" value={a.saturate} min={0} max={2} step={0.05} onChange={(v) => onPatch({ saturate: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
            <Row label="Brillo" value={a.brightness} min={0.2} max={2} step={0.05} onChange={(v) => onPatch({ brightness: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
            <Row label="Contraste" value={a.contrast} min={0.2} max={2} step={0.05} onChange={(v) => onPatch({ contrast: v })} fmt={(v) => `${Math.round(v * 100)}%`} />

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
