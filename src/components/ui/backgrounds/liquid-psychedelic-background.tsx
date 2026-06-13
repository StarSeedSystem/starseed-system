"use client";

// ════════════════════════════════════════════════════════════════
// LiquidPsychedelicBackground — fondos psicodélicos de colores
// líquidos, fluidos, dinámicos e interactivos. Sin dependencias 3D:
// usa blobs SVG con gradientes animados + reacción sutil al cursor.
// Se activa cuando config.background.type ∈ LIQUID_PRESETS.
// ════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from "react";
import { useAppearance } from "@/context/appearance-context";

export interface LiquidPreset {
    id: string;
    name: string;
    desc: string;
    colors: [string, string, string, string];
    blend: "screen" | "soft-light" | "overlay" | "lighten";
    speed: number; // segundos por ciclo
}

export const LIQUID_PRESETS: LiquidPreset[] = [
    { id: "liquid-aurora", name: "Aurora Líquida", desc: "Cintas verde-cian que respiran", colors: ["#10b981", "#22d3ee", "#3b82f6", "#a855f7"], blend: "screen", speed: 26 },
    { id: "liquid-plasma", name: "Plasma Psicodélico", desc: "Magenta y cian en fusión fluida", colors: ["#ec4899", "#8b5cf6", "#06b6d4", "#f59e0b"], blend: "screen", speed: 18 },
    { id: "liquid-lava", name: "Lava Solar", desc: "Naranjas y rojos en movimiento", colors: ["#f59e0b", "#ef4444", "#ec4899", "#fb7185"], blend: "lighten", speed: 30 },
    { id: "liquid-oceanic", name: "Marea Profunda", desc: "Azules abisales y turquesa", colors: ["#0ea5e9", "#2563eb", "#06b6d4", "#14b8a6"], blend: "screen", speed: 34 },
    { id: "liquid-iris", name: "Iris Cuántica", desc: "Espectro completo iridiscente", colors: ["#a855f7", "#ec4899", "#22d3ee", "#84cc16"], blend: "soft-light", speed: 22 },
];

const PRESET_IDS = new Set(LIQUID_PRESETS.map((p) => p.id));

export function LiquidPsychedelicBackground() {
    const { config } = useAppearance();
    const [mounted, setMounted] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => setMounted(true), []);

    // Reacción suave al cursor (parallax líquido)
    useEffect(() => {
        if (!mounted) return;
        const el = ref.current;
        if (!el) return;
        let raf = 0;
        const onMove = (e: MouseEvent) => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
                const x = (e.clientX / window.innerWidth - 0.5) * 2;
                const y = (e.clientY / window.innerHeight - 0.5) * 2;
                el.style.setProperty("--mx", `${x * 6}%`);
                el.style.setProperty("--my", `${y * 6}%`);
            });
        };
        window.addEventListener("mousemove", onMove, { passive: true });
        return () => { window.removeEventListener("mousemove", onMove); cancelAnimationFrame(raf); };
    }, [mounted]);

    if (!mounted) return null;
    const type = (config.background as any)?.type;
    if (!type || !PRESET_IDS.has(type)) return null;
    const preset = LIQUID_PRESETS.find((p) => p.id === type)!;
    const [c0, c1, c2, c3] = preset.colors;

    return (
        <div ref={ref} className="fixed inset-0 -z-10 overflow-hidden pointer-events-none" style={{ background: "#05060a" }} aria-hidden>
            <style>{`
                @keyframes ssLiquidA { 0%,100%{transform:translate(calc(-10% + var(--mx,0%)),calc(-5% + var(--my,0%))) scale(1.1) rotate(0deg)} 33%{transform:translate(calc(20% + var(--mx,0%)),calc(15% + var(--my,0%))) scale(1.3) rotate(60deg)} 66%{transform:translate(calc(-5% + var(--mx,0%)),calc(25% + var(--my,0%))) scale(1.0) rotate(120deg)} }
                @keyframes ssLiquidB { 0%,100%{transform:translate(calc(30% + var(--mx,0%)),calc(20% + var(--my,0%))) scale(1.2) rotate(0deg)} 50%{transform:translate(calc(-15% + var(--mx,0%)),calc(-10% + var(--my,0%))) scale(1.4) rotate(-90deg)} }
                @keyframes ssLiquidC { 0%,100%{transform:translate(calc(15% + var(--mx,0%)),calc(-20% + var(--my,0%))) scale(1.3) rotate(0deg)} 50%{transform:translate(calc(-20% + var(--mx,0%)),calc(20% + var(--my,0%))) scale(1.1) rotate(180deg)} }
                @keyframes ssHue { from{filter:hue-rotate(0deg)} to{filter:hue-rotate(360deg)} }
            `}</style>
            <div className="absolute inset-0" style={{ mixBlendMode: preset.blend as any, animation: `ssHue ${preset.speed * 4}s linear infinite` }}>
                <div className="absolute rounded-full" style={{ width: "70vw", height: "70vw", left: "-10%", top: "-15%", background: `radial-gradient(circle at 50% 50%, ${c0}cc, transparent 60%)`, filter: "blur(70px)", animation: `ssLiquidA ${preset.speed}s ease-in-out infinite` }} />
                <div className="absolute rounded-full" style={{ width: "60vw", height: "60vw", right: "-10%", top: "0%", background: `radial-gradient(circle at 50% 50%, ${c1}cc, transparent 60%)`, filter: "blur(80px)", animation: `ssLiquidB ${preset.speed * 1.2}s ease-in-out infinite` }} />
                <div className="absolute rounded-full" style={{ width: "65vw", height: "65vw", left: "10%", bottom: "-20%", background: `radial-gradient(circle at 50% 50%, ${c2}cc, transparent 60%)`, filter: "blur(75px)", animation: `ssLiquidC ${preset.speed * 0.9}s ease-in-out infinite` }} />
                <div className="absolute rounded-full" style={{ width: "55vw", height: "55vw", right: "5%", bottom: "-10%", background: `radial-gradient(circle at 50% 50%, ${c3}cc, transparent 60%)`, filter: "blur(85px)", animation: `ssLiquidA ${preset.speed * 1.4}s ease-in-out infinite reverse` }} />
            </div>
            {/* Velo de contraste para legibilidad de la UI */}
            <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center, transparent 35%, rgba(5,6,10,0.55) 100%)" }} />
        </div>
    );
}
