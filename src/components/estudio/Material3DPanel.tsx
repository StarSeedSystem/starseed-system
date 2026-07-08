"use client";

/*
 * Material3DPanel — calibra un material (Cristal/Metal/Madera/Neón) con una
 * vista previa 3D REAL (react-three-fiber + luz de entorno) y lo traduce a
 * los tokens de material CSS que el sistema YA tiene (.ss-crystal/.ss-metal/
 * .ss-wood en src/styles/starseed-materials.css). El mapeo NUNCA finge ser
 * 1:1: se documenta abajo tal cual es.
 *
 * MAPEO HONESTO (3D físico → CSS 2D):
 *  · roughness  → --glass-blur (más rugoso = más difuminado/dispersión).
 *  · metalness  → intensifica saturación del filtro (más metálico = tono
 *                 más saturado); NO cambia el degradado base de .ss-metal
 *                 (son colores fijos en el CSS), solo lo tiñe por encima.
 *  · tinte      → SOLO en metal/madera, vía filter: hue-rotate() — esas
 *                 clases no exponen su color base como variable CSS, así
 *                 que el tinte es una aproximación por filtro, no un
 *                 reemplazo real del degradado.
 *  · transmisión → en Cristal, el mapeo es directo y real: es exactamente
 *                 lo que ya hace `.ss-crystal` con blur+opacidad de capas.
 */

import React, { useState } from "react";
import dynamic from "next/dynamic";
import type { CSSProperties } from "react";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ElementOverride } from "./types";
import { hslTripletToHex } from "./color-utils";

const Material3DScene = dynamic(() => import("./Material3DScene").then((m) => m.Material3DScene), {
    ssr: false,
    loading: () => <div className="grid h-full place-items-center text-xs text-white/30">Cargando visor 3D…</div>,
});

type MaterialFamily = "crystal" | "metal" | "wood" | "neon";

const FAMILY_TO_CLASS: Record<MaterialFamily, string> = {
    crystal: "ss-crystal", metal: "ss-metal", wood: "ss-wood", neon: "ss-neon",
};

const FAMILY_LABEL: Record<MaterialFamily, string> = {
    crystal: "Cristal", metal: "Metal", wood: "Madera", neon: "Neón",
};

const FAMILY_DEFAULTS: Record<MaterialFamily, { roughness: number; metalness: number; transmission: number }> = {
    crystal: { roughness: 0.12, metalness: 0.05, transmission: 0.75 },
    metal: { roughness: 0.35, metalness: 0.9, transmission: 0 },
    wood: { roughness: 0.75, metalness: 0, transmission: 0 },
    neon: { roughness: 0.2, metalness: 0.1, transmission: 0.15 },
};

export interface Material3DPanelProps {
    value: ElementOverride;
    onChange: (next: ElementOverride) => void;
}

function Row({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] text-white/50">
                <span>{label}</span><span>{Math.round(value * 100)}%</span>
            </div>
            <Slider value={[value]} min={0} max={1} step={0.02} onValueChange={([v]) => onChange(v)} />
        </div>
    );
}

export function Material3DPanel({ value: o, onChange }: Material3DPanelProps) {
    const [family, setFamily] = useState<MaterialFamily>("crystal");
    const [roughness, setRoughness] = useState(FAMILY_DEFAULTS.crystal.roughness);
    const [metalness, setMetalness] = useState(FAMILY_DEFAULTS.crystal.metalness);
    const [transmission, setTransmission] = useState(FAMILY_DEFAULTS.crystal.transmission);
    const [hue, setHue] = useState(0);
    const [shape, setShape] = useState<"sphere" | "panel">("sphere");

    const tint = o.tokens.vars["primary-hsl"] ? hslTripletToHex(o.tokens.vars["primary-hsl"]) : "#8850ee";

    function pickFamily(f: MaterialFamily) {
        setFamily(f);
        const d = FAMILY_DEFAULTS[f];
        setRoughness(d.roughness);
        setMetalness(d.metalness);
        setTransmission(d.transmission);
    }

    function applyToElement() {
        onChange({ ...o, tokens: { ...o.tokens, materialClass: FAMILY_TO_CLASS[family] } });
    }

    const cssPreviewStyle: CSSProperties = {
        "--glass-blur": `${Math.round(8 + roughness * 24)}px`,
        filter: family === "metal" || family === "wood" ? `hue-rotate(${hue}deg) saturate(${(0.7 + metalness * 0.6).toFixed(2)})` : undefined,
    } as CSSProperties;

    return (
        <div className="space-y-3">
            <p className="text-xs leading-relaxed text-white/40">
                Vista previa 3D real con luz de entorno para calibrar el material antes de aplicarlo. El panel de la
                derecha muestra la aproximación CSS 2D que usa el resto del sistema — el mapeo exacto está documentado
                como comentario en <code className="text-white/60">Material3DPanel.tsx</code>.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
                <div className="h-56 overflow-hidden rounded-xl border border-white/10 bg-black/30">
                    <Material3DScene shape={shape} color={tint} roughness={roughness} metalness={metalness} transmission={transmission} />
                </div>
                <div className={cn("grid h-56 place-items-center overflow-hidden rounded-xl border border-white/15", FAMILY_TO_CLASS[family])} style={cssPreviewStyle}>
                    <span className="text-xs text-white/50">Aproximación CSS 2D</span>
                </div>
            </div>

            <div className="grid grid-cols-4 gap-1.5">
                {(Object.keys(FAMILY_LABEL) as MaterialFamily[]).map((f) => (
                    <Button key={f} size="sm" variant={family === f ? "default" : "outline"} className="h-8 px-1 text-[11px]" onClick={() => pickFamily(f)}>
                        {FAMILY_LABEL[f]}
                    </Button>
                ))}
            </div>

            <div className="space-y-2">
                <Row label="Rugosidad" value={roughness} onChange={setRoughness} />
                <Row label="Metalicidad" value={metalness} onChange={setMetalness} />
                <Row label="Transmisión (vidrio)" value={transmission} onChange={setTransmission} />
                {(family === "metal" || family === "wood") && (
                    <div>
                        <p className="text-[11px] text-white/40">Tinte (aproximado con hue-rotate — {FAMILY_LABEL[family].toLowerCase()} no expone su color base como variable)</p>
                        <Slider value={[hue]} min={0} max={360} onValueChange={([v]) => setHue(v)} />
                    </div>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <Select value={shape} onValueChange={(v) => setShape(v as "sphere" | "panel")}>
                    <SelectTrigger className="h-8 w-28 border-white/15 bg-black/30 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent className="border-white/10 bg-black/90">
                        <SelectItem value="sphere" className="text-xs">Esfera</SelectItem>
                        <SelectItem value="panel" className="text-xs">Panel</SelectItem>
                    </SelectContent>
                </Select>
                <Button size="sm" className="h-8 gap-1.5 bg-cyan-500/80 text-xs text-white hover:bg-cyan-500" onClick={applyToElement}>
                    Usar este material en el elemento
                </Button>
            </div>

            <p className="text-[10px] leading-relaxed text-white/30">
                ¿Buscas VR/AR? El sistema ya tiene un modo inmersivo en{" "}
                <a href="/immersive" target="_blank" rel="noopener" className="underline hover:text-white/60">/immersive</a>.
                Un visor AR dedicado (model-viewer vía CDN) queda anotado como mejora futura — excede el alcance de esta ola.
            </p>
        </div>
    );
}

export default Material3DPanel;
