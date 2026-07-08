"use client";

/*
 * PropertyPanel — controles de propiedades por elemento, organizados en
 * secciones plegables (Accordion) y filtrados por lo que esa FAMILIA
 * realmente soporta (element-catalog.ts `groups`). Todo cambio es
 * inmutable: recibe `value` + `onChange(next)`, nunca muta.
 */

import React, { useMemo } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EasingPreset, ElementFamily, ElementOverride, EntryEffect, GradientStop, HoverEffect } from "./types";
import { makeId } from "./types";
import { familyMeta, type PropertyGroup } from "./element-catalog";
import {
    COLOR_SLOTS, DISPLAY_DEFAULTS, EASE_LABEL, ENTRY_LABEL, HOVER_LABEL,
    addShadowLayer, defaultOverride, removeShadowLayer, removeToken, setToken, updateShadowLayer,
} from "./property-defaults";
import { hexToHslTriplet, hslTripletToHex } from "./color-utils";

const FALLBACK_HEX: Record<string, string> = {
    "primary-hsl": "#c77df8",
    "secondary-hsl": "#22d3ee",
    "accent-hsl": "#22c1e8",
    "card-hsl": "#0c0a16",
    "border-hsl": "#3a3350",
    "destructive-hsl": "#e14b4b",
};

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between">
                <label className="text-[11px] font-medium uppercase tracking-wide text-white/50">{label}</label>
                {hint && <span className="text-[10px] text-white/30">{hint}</span>}
            </div>
            {children}
        </div>
    );
}

function LabeledSlider({
    label, value, min, max, step = 1, suffix = "", onChange,
}: { label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange: (v: number) => void }) {
    return (
        <Row label={label} hint={`${value}${suffix}`}>
            <Slider value={[value]} min={min} max={max} step={step} onValueChange={([v]) => onChange(v)} />
        </Row>
    );
}

export interface PropertyPanelProps {
    family: ElementFamily;
    value: ElementOverride;
    onChange: (next: ElementOverride) => void;
    onOpenCanvas2D?: () => void;
}

export function PropertyPanel({ family, value: o, onChange, onOpenCanvas2D }: PropertyPanelProps) {
    const groups = familyMeta(family).groups;
    const has = (g: PropertyGroup) => groups.includes(g);
    const openByDefault = useMemo(() => (["color", "animation"] as PropertyGroup[]).filter(has).slice(), [family]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <p className="text-xs text-white/40">Ajustes de «{familyMeta(family).label}» — se aplican solo a esta vista previa hasta que guardes o apliques.</p>
                <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-[11px] text-white/50 hover:text-white/80" onClick={() => onChange(defaultOverride())}>
                    <RotateCcw className="h-3 w-3" /> Restablecer
                </Button>
            </div>

            <Accordion type="multiple" defaultValue={openByDefault} className="w-full">
                {has("color") && (
                    <AccordionItem value="color" className="border-white/10">
                        <AccordionTrigger className="text-sm">Colores</AccordionTrigger>
                        <AccordionContent className="space-y-3 pt-1">
                            <div className="grid grid-cols-2 gap-3">
                                {COLOR_SLOTS.map((slot) => {
                                    const current = o.tokens.vars[slot.key];
                                    const hex = current ? hslTripletToHex(current) : FALLBACK_HEX[slot.key] ?? "#8850ee";
                                    return (
                                        <div key={slot.key} className="flex items-center gap-2">
                                            <input
                                                type="color"
                                                value={hex}
                                                onChange={(e) => onChange(setToken(o, slot.key, hexToHslTriplet(e.target.value)))}
                                                className="h-8 w-8 shrink-0 cursor-pointer rounded-lg border border-white/15 bg-transparent"
                                                title={slot.label}
                                            />
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-[11px] text-white/60">{slot.label}</p>
                                                {current && (
                                                    <button
                                                        type="button"
                                                        onClick={() => onChange(removeToken(o, slot.key))}
                                                        className="text-[10px] text-white/30 hover:text-white/60"
                                                    >
                                                        quitar override
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                )}

                {has("gradient") && (
                    <AccordionItem value="gradient" className="border-white/10">
                        <AccordionTrigger className="text-sm">Degradado</AccordionTrigger>
                        <AccordionContent className="space-y-2 pt-1">
                            {(o.gradient ?? []).map((stop) => (
                                <div key={stop.id} className="flex items-center gap-2">
                                    <input
                                        type="color"
                                        value={/^#/.test(stop.color) ? stop.color : "#8850ee"}
                                        onChange={(e) => onChange({ ...o, gradient: (o.gradient ?? []).map((s) => (s.id === stop.id ? { ...s, color: e.target.value } : s)) })}
                                        className="h-7 w-7 shrink-0 cursor-pointer rounded-lg border border-white/15 bg-transparent"
                                    />
                                    <Slider
                                        value={[stop.offset]} min={0} max={100} step={1}
                                        onValueChange={([v]) => onChange({ ...o, gradient: (o.gradient ?? []).map((s) => (s.id === stop.id ? { ...s, offset: v } : s)) })}
                                        className="flex-1"
                                    />
                                    <button type="button" onClick={() => onChange({ ...o, gradient: (o.gradient ?? []).filter((s) => s.id !== stop.id) })} className="text-white/30 hover:text-red-300">
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            ))}
                            <Button
                                size="sm" variant="outline" className="h-7 gap-1.5 text-[11px]"
                                onClick={() => {
                                    const stop: GradientStop = { id: makeId("stop"), color: "#8850ee", offset: (o.gradient?.length ?? 0) * 50 };
                                    onChange({ ...o, gradient: [...(o.gradient ?? []), stop] });
                                }}
                            >
                                <Plus className="h-3 w-3" /> Añadir parada
                            </Button>
                        </AccordionContent>
                    </AccordionItem>
                )}

                {has("radius") && (
                    <AccordionItem value="radius" className="border-white/10">
                        <AccordionTrigger className="text-sm">Radio de esquina</AccordionTrigger>
                        <AccordionContent className="pt-1">
                            <LabeledSlider
                                label="Radio" suffix="px" min={0} max={48}
                                value={o.radiusPx ?? DISPLAY_DEFAULTS.radiusPx}
                                onChange={(v) => onChange({ ...o, radiusPx: v })}
                            />
                        </AccordionContent>
                    </AccordionItem>
                )}

                {has("shadow") && (
                    <AccordionItem value="shadow" className="border-white/10">
                        <AccordionTrigger className="text-sm">Sombra (capas)</AccordionTrigger>
                        <AccordionContent className="space-y-3 pt-1">
                            {(o.shadow ?? []).map((l) => (
                                <div key={l.id} className="space-y-1.5 rounded-lg border border-white/10 p-2.5">
                                    <div className="grid grid-cols-4 gap-1.5 text-[10px] text-white/40">
                                        <input type="number" value={l.x} onChange={(e) => onChange(updateShadowLayer(o, l.id, { x: Number(e.target.value) }))} className="rounded border border-white/10 bg-black/30 px-1 py-0.5" title="X" />
                                        <input type="number" value={l.y} onChange={(e) => onChange(updateShadowLayer(o, l.id, { y: Number(e.target.value) }))} className="rounded border border-white/10 bg-black/30 px-1 py-0.5" title="Y" />
                                        <input type="number" value={l.blur} onChange={(e) => onChange(updateShadowLayer(o, l.id, { blur: Number(e.target.value) }))} className="rounded border border-white/10 bg-black/30 px-1 py-0.5" title="Difuminado" />
                                        <input type="number" value={l.spread} onChange={(e) => onChange(updateShadowLayer(o, l.id, { spread: Number(e.target.value) }))} className="rounded border border-white/10 bg-black/30 px-1 py-0.5" title="Extensión" />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value="#000000"
                                            onChange={(e) => onChange(updateShadowLayer(o, l.id, { color: `${e.target.value}80` }))}
                                            className="h-6 w-6 cursor-pointer rounded border border-white/15 bg-transparent"
                                        />
                                        <span className="flex-1 truncate text-[10px] text-white/40">{l.color}</span>
                                        <button type="button" onClick={() => onChange(removeShadowLayer(o, l.id))} className="text-white/30 hover:text-red-300">
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-[11px]" onClick={() => onChange(addShadowLayer(o))}>
                                <Plus className="h-3 w-3" /> Añadir capa
                            </Button>
                        </AccordionContent>
                    </AccordionItem>
                )}

                {has("blur") && (
                    <AccordionItem value="blur" className="border-white/10">
                        <AccordionTrigger className="text-sm">Blur / transparencia</AccordionTrigger>
                        <AccordionContent className="space-y-3 pt-1">
                            <LabeledSlider label="Desenfoque de cristal" suffix="px" min={0} max={40} value={o.blurPx ?? DISPLAY_DEFAULTS.blurPx} onChange={(v) => onChange({ ...o, blurPx: v })} />
                            <LabeledSlider label="Opacidad" suffix="" min={0.2} max={1} step={0.05} value={o.opacity ?? DISPLAY_DEFAULTS.opacity} onChange={(v) => onChange({ ...o, opacity: v })} />
                        </AccordionContent>
                    </AccordionItem>
                )}

                {has("border") && (
                    <AccordionItem value="border" className="border-white/10">
                        <AccordionTrigger className="text-sm">Borde / resplandor</AccordionTrigger>
                        <AccordionContent className="space-y-3 pt-1">
                            <LabeledSlider label="Grosor" suffix="px" min={0} max={6} value={o.border?.widthPx ?? DISPLAY_DEFAULTS.border.widthPx} onChange={(v) => onChange({ ...o, border: { ...o.border, widthPx: v } })} />
                            <Row label="Color del borde">
                                <input
                                    type="color"
                                    value="#ffffff"
                                    onChange={(e) => onChange({ ...o, border: { ...o.border, color: `${e.target.value}44` } })}
                                    className="h-8 w-8 cursor-pointer rounded-lg border border-white/15 bg-transparent"
                                />
                            </Row>
                            <LabeledSlider label="Resplandor" min={0} max={1} step={0.05} value={o.border?.glow ?? DISPLAY_DEFAULTS.border.glow} onChange={(v) => onChange({ ...o, border: { ...o.border, glow: v } })} />
                        </AccordionContent>
                    </AccordionItem>
                )}

                {has("typography") && (
                    <AccordionItem value="typography" className="border-white/10">
                        <AccordionTrigger className="text-sm">Tipografía</AccordionTrigger>
                        <AccordionContent className="space-y-3 pt-1">
                            <LabeledSlider label="Tamaño" suffix="px" min={10} max={28} value={o.typography?.sizePx ?? DISPLAY_DEFAULTS.typography.sizePx} onChange={(v) => onChange({ ...o, typography: { ...o.typography, sizePx: v } })} />
                            <Row label="Peso">
                                <Select value={String(o.typography?.weight ?? DISPLAY_DEFAULTS.typography.weight)} onValueChange={(v) => onChange({ ...o, typography: { ...o.typography, weight: Number(v) } })}>
                                    <SelectTrigger className="h-8 border-white/15 bg-black/30 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent className="border-white/10 bg-black/90">
                                        {[300, 400, 500, 600, 700, 800, 900].map((w) => (
                                            <SelectItem key={w} value={String(w)} className="text-xs">{w}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </Row>
                            <LabeledSlider label="Espaciado" suffix="em" min={-0.03} max={0.2} step={0.01} value={o.typography?.trackingEm ?? DISPLAY_DEFAULTS.typography.trackingEm} onChange={(v) => onChange({ ...o, typography: { ...o.typography, trackingEm: v } })} />
                        </AccordionContent>
                    </AccordionItem>
                )}

                {has("padding") && (
                    <AccordionItem value="padding" className="border-white/10">
                        <AccordionTrigger className="text-sm">Padding / densidad</AccordionTrigger>
                        <AccordionContent className="space-y-3 pt-1">
                            <LabeledSlider label="Horizontal" suffix="px" min={0} max={48} value={o.padding?.xPx ?? DISPLAY_DEFAULTS.padding.xPx} onChange={(v) => onChange({ ...o, padding: { ...o.padding, xPx: v } })} />
                            <LabeledSlider label="Vertical" suffix="px" min={0} max={32} value={o.padding?.yPx ?? DISPLAY_DEFAULTS.padding.yPx} onChange={(v) => onChange({ ...o, padding: { ...o.padding, yPx: v } })} />
                        </AccordionContent>
                    </AccordionItem>
                )}

                {has("material") && (
                    <AccordionItem value="material" className="border-white/10">
                        <AccordionTrigger className="text-sm">Material</AccordionTrigger>
                        <AccordionContent className="space-y-2 pt-1">
                            <Select
                                value={o.tokens.materialClass ?? "none"}
                                onValueChange={(v) => onChange({ ...o, tokens: { ...o.tokens, materialClass: v === "none" ? undefined : v } })}
                            >
                                <SelectTrigger className="h-8 border-white/15 bg-black/30 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent className="border-white/10 bg-black/90">
                                    <SelectItem value="none" className="text-xs">Sin material (base del sistema)</SelectItem>
                                    <SelectItem value="ss-crystal" className="text-xs">Cristal líquido</SelectItem>
                                    <SelectItem value="ss-crystal--deep" className="text-xs">Cristal profundo</SelectItem>
                                    <SelectItem value="ss-metal" className="text-xs">Metal orgánico</SelectItem>
                                    <SelectItem value="ss-wood" className="text-xs">Madera realista</SelectItem>
                                </SelectContent>
                            </Select>
                            <p className="text-[10px] text-white/30">Ajusta parámetros finos (rugosidad/metalicidad/tinte) en la pestaña «Material 3D».</p>
                        </AccordionContent>
                    </AccordionItem>
                )}

                {has("background") && (
                    <AccordionItem value="background" className="border-white/10">
                        <AccordionTrigger className="text-sm">Fondo personalizado</AccordionTrigger>
                        <AccordionContent className="space-y-2 pt-1">
                            {o.customBackgroundUrl ? (
                                <div className="flex items-center gap-2">
                                    <img src={o.customBackgroundUrl} alt="" className="h-10 w-10 rounded-lg border border-white/10 object-cover" />
                                    <Button size="sm" variant="ghost" className="h-7 text-[11px] text-white/50" onClick={() => onChange({ ...o, customBackgroundUrl: undefined })}>Quitar imagen</Button>
                                </div>
                            ) : (
                                <p className="text-[11px] text-white/40">Sin imagen personalizada — usa el degradado o crea una en «Diseño 2D».</p>
                            )}
                            {onOpenCanvas2D && (
                                <Button size="sm" variant="outline" className="h-7 gap-1.5 text-[11px]" onClick={onOpenCanvas2D}>
                                    Abrir Diseño 2D
                                </Button>
                            )}
                        </AccordionContent>
                    </AccordionItem>
                )}

                {has("animation") && (
                    <AccordionItem value="animation" className="border-white/10">
                        <AccordionTrigger className="text-sm">Animación</AccordionTrigger>
                        <AccordionContent className="space-y-3 pt-1">
                            <LabeledSlider label="Duración" suffix="ms" min={80} max={800} step={20} value={o.animation?.durationMs ?? DISPLAY_DEFAULTS.animation.durationMs} onChange={(v) => onChange({ ...o, animation: { ...o.animation, durationMs: v } })} />
                            <Row label="Curva">
                                <Select value={o.animation?.easing ?? DISPLAY_DEFAULTS.animation.easing} onValueChange={(v) => onChange({ ...o, animation: { ...o.animation, easing: v as EasingPreset } })}>
                                    <SelectTrigger className="h-8 border-white/15 bg-black/30 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent className="border-white/10 bg-black/90">
                                        {Object.entries(EASE_LABEL).map(([k, label]) => (
                                            <SelectItem key={k} value={k} className="text-xs">{label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </Row>
                            <Row label="Efecto al pasar el cursor">
                                <Select value={o.animation?.hover ?? DISPLAY_DEFAULTS.animation.hover} onValueChange={(v) => onChange({ ...o, animation: { ...o.animation, hover: v as HoverEffect } })}>
                                    <SelectTrigger className="h-8 border-white/15 bg-black/30 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent className="border-white/10 bg-black/90">
                                        {Object.entries(HOVER_LABEL).map(([k, label]) => (
                                            <SelectItem key={k} value={k} className="text-xs">{label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </Row>
                            <Row label="Animación de entrada">
                                <Select value={o.animation?.entry ?? DISPLAY_DEFAULTS.animation.entry} onValueChange={(v) => onChange({ ...o, animation: { ...o.animation, entry: v as EntryEffect } })}>
                                    <SelectTrigger className="h-8 border-white/15 bg-black/30 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent className="border-white/10 bg-black/90">
                                        {Object.entries(ENTRY_LABEL).map(([k, label]) => (
                                            <SelectItem key={k} value={k} className="text-xs">{label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </Row>
                        </AccordionContent>
                    </AccordionItem>
                )}
            </Accordion>
        </div>
    );
}

export default PropertyPanel;
