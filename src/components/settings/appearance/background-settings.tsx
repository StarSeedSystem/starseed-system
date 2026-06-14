"use client";

/*
 * Ajustes → Apariencia → "Fondo".
 * ----------------------------------------------------------------------
 * Panel unificado para elegir y personalizar el fondo del OS. Integra TODAS
 * las familias de fondo en un solo lugar, cada una con una TARJETA de VISTA
 * PREVIA EN VIVO en miniatura:
 *
 *   • Vivos / canvas  → 10 variantes "living" (aurora, nebula, starfield,
 *     mycelium, plasma, prisma, ocean + ribbons, petals, grid-pulse). El
 *     preview reutiliza el mismo motor de dibujo de LivingBackground a
 *     pequeña escala (mini-canvas performante).
 *   • Fluidos líquidos → liquid-aurora / plasma / lava / oceanic / iris
 *     (preview CSS de blobs radiales animados, fiel al fondo real).
 *   • Materia Viva → materia-oro-vivo / cristal-liquido / bosque-dorado
 *     (preview CSS de partículas/gradiente representativo).
 *   • Básicos → un par de gradientes listos.
 *
 * Al pulsar una tarjeta se aplica el `type` (y `variant` si es living) al
 * instante — el fondo global ya tiene live-preview real. Sliders, paleta y
 * auto-cycle actualizan el preview en vivo. Todo se autoguarda vía
 * useAppearance().updateConfig (deep-merge → localStorage + perfil).
 * SOP: architecture/integracion-portal-starseed-os.md
 */

import React from "react";
import {
    Sparkles,
    Waves,
    Star,
    Network,
    Flame,
    Sun,
    Aperture,
    Gauge,
    Palette,
    Timer,
    RotateCcw,
    Power,
    Maximize2,
    Wand2,
    Wind,
    Flower2,
    Grid3x3,
    Droplets,
    Gem,
    Layers,
    Boxes,
    Box,
    AudioLines,
    Link2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppearance } from "@/context/appearance-context";

/* ──────────────────────────────────────────────────────────────────────
 * Tipos y catálogos
 * ──────────────────────────────────────────────────────────────────── */

type Variant =
    | "aurora"
    | "nebula"
    | "starfield"
    | "mycelium"
    | "plasma"
    | "prisma"
    | "ocean"
    | "ribbons"
    | "petals"
    | "grid-pulse";

const VARIANTS: Array<{
    value: Variant;
    label: string;
    desc: string;
    Icon: React.ComponentType<{ className?: string }>;
}> = [
    { value: "aurora", label: "Aurora", desc: "Velos de luz que ondulan en calma.", Icon: Sparkles },
    { value: "nebula", label: "Nebulosa", desc: "Nubes cosmicas densas y profundas.", Icon: Aperture },
    { value: "starfield", label: "Campo estelar", desc: "Lluvia de estrellas en parallax.", Icon: Star },
    { value: "mycelium", label: "Micelio", desc: "Red viva de nodos interconectados.", Icon: Network },
    { value: "plasma", label: "Plasma", desc: "Energia fluida en movimiento rapido.", Icon: Flame },
    { value: "prisma", label: "Prisma", desc: "Abanico radial de colores girando.", Icon: Sun },
    { value: "ocean", label: "Oceano", desc: "Olas en capas que respiran.", Icon: Waves },
    { value: "ribbons", label: "Cintas", desc: "Cintas sinusoidales que fluyen.", Icon: Wind },
    { value: "petals", label: "Petalos", desc: "Particulas que caen con vaiven.", Icon: Flower2 },
    { value: "grid-pulse", label: "Rejilla viva", desc: "Puntos que laten en ondas.", Icon: Grid3x3 },
];

// Familias no-living seleccionables desde este panel.
interface FluidOption {
    type: string;
    label: string;
    desc: string;
    colors: string[];
    Icon: React.ComponentType<{ className?: string }>;
}

// Paletas tomadas de liquid-psychedelic-background.tsx (fieles al fondo real).
const LIQUID_OPTIONS: FluidOption[] = [
    { type: "liquid-aurora", label: "Aurora Liquida", desc: "Cintas verde-cian que respiran", colors: ["#10b981", "#22d3ee", "#3b82f6", "#a855f7"], Icon: Droplets },
    { type: "liquid-plasma", label: "Plasma Psicodelico", desc: "Magenta y cian en fusion fluida", colors: ["#ec4899", "#8b5cf6", "#06b6d4", "#f59e0b"], Icon: Droplets },
    { type: "liquid-lava", label: "Lava Solar", desc: "Naranjas y rojos en movimiento", colors: ["#f59e0b", "#ef4444", "#ec4899", "#fb7185"], Icon: Flame },
    { type: "liquid-oceanic", label: "Marea Profunda", desc: "Azules abisales y turquesa", colors: ["#0ea5e9", "#2563eb", "#06b6d4", "#14b8a6"], Icon: Waves },
    { type: "liquid-iris", label: "Iris Cuantica", desc: "Espectro completo iridiscente", colors: ["#a855f7", "#ec4899", "#22d3ee", "#84cc16"], Icon: Aperture },
];

// Paletas tomadas de materia-viva-background.tsx.
const MATERIA_OPTIONS: FluidOption[] = [
    { type: "materia-oro-vivo", label: "Oro Vivo", desc: "Ambar y oro en suspension", colors: ["#e9c46a", "#f4d58d", "#d9ed92", "#8be0c9"], Icon: Gem },
    { type: "materia-cristal-liquido", label: "Cristal Liquido", desc: "Cian y lavanda cristalinos", colors: ["#7fd8e8", "#9aa7ff", "#cdb9ff", "#e9c46a"], Icon: Gem },
    { type: "materia-bosque-dorado", label: "Bosque Dorado", desc: "Lima, musgo y oro vegetal", colors: ["#a8c66c", "#d9ed92", "#7a9b4e", "#e9c46a"], Icon: Layers },
];

// Gradientes básicos listos para aplicar.
interface GradientOption {
    label: string;
    desc: string;
    value: string;
    colors: string[];
}

const GRADIENT_OPTIONS: GradientOption[] = [
    {
        label: "Crepusculo cosmico",
        desc: "Indigo a magenta profundo",
        value: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)",
        colors: ["#0f0c29", "#302b63", "#24243e"],
    },
    {
        label: "Amanecer dorado",
        desc: "Ambar calido a violeta",
        value: "linear-gradient(135deg, #1a1a2e 0%, #533483 60%, #e9c46a 140%)",
        colors: ["#1a1a2e", "#533483", "#e9c46a"],
    },
];

// Variantes del fondo WebGL 3D (shader). Coinciden con config.background.webglVariant.
type WebglVariant = "nebula" | "grid" | "waves" | "hex" | "liquid";

const WEBGL_OPTIONS: Array<{
    value: WebglVariant;
    label: string;
    desc: string;
    colors: string[];
    Icon: React.ComponentType<{ className?: string }>;
}> = [
    { value: "liquid", label: "Liquido 3D", desc: "Gradiente liquido fluido (Spline-like)", colors: ["#F15A22", "#0A0E27", "#7FB8FF"], Icon: Droplets },
    { value: "nebula", label: "Nebulosa 3D", desc: "Ruido fractal cosmico animado", colors: ["#302b63", "#a855f7", "#22d3ee"], Icon: Aperture },
    { value: "grid", label: "Rejilla 3D", desc: "Cuadricula con profundidad y warp", colors: ["#0A0E27", "#06B6D4", "#39FF14"], Icon: Grid3x3 },
    { value: "waves", label: "Olas 3D", desc: "Superficie ondulante metalica", colors: ["#0ea5e9", "#2563eb", "#14b8a6"], Icon: Waves },
    { value: "hex", label: "Hexagonos", desc: "Teselado hexagonal psicodelico", colors: ["#FFBF00", "#F15A22", "#DC143C"], Icon: Box },
];

// Colores solidos basicos.
const SOLID_OPTIONS: Array<{ label: string; value: string }> = [
    { label: "Vacio cosmico", value: "#0A0E27" },
    { label: "Negro profundo", value: "#05060a" },
    { label: "Carbon", value: "#101216" },
    { label: "Indigo nocturno", value: "#0f0c29" },
];

interface Preset {
    name: string;
    desc: string;
    variant: Variant;
    speed: number;
    intensity: number;
    colors: string[];
    Icon: React.ComponentType<{ className?: string }>;
}

const PRESETS: Preset[] = [
    {
        name: "Aurora boreal",
        desc: "Verdes y cianes serenos",
        variant: "aurora",
        speed: 0.6,
        intensity: 0.7,
        colors: ["#39FF14", "#10B981", "#7FB8FF", "#C9A8FF"],
        Icon: Sparkles,
    },
    {
        name: "Nebulosa dorada",
        desc: "Oro y purpura cosmico",
        variant: "nebula",
        speed: 0.5,
        intensity: 0.85,
        colors: ["#E9C46A", "#D4AF37", "#C9A8FF", "#7FB8FF"],
        Icon: Aperture,
    },
    {
        name: "Micelio vivo",
        desc: "Red organica luminosa",
        variant: "mycelium",
        speed: 0.8,
        intensity: 0.6,
        colors: ["#9FE870", "#39FF14", "#10B981"],
        Icon: Network,
    },
    {
        name: "Oceano cristal",
        desc: "Olas azuladas profundas",
        variant: "ocean",
        speed: 0.7,
        intensity: 0.75,
        colors: ["#007FFF", "#7FB8FF", "#10B981", "#0A0E27"],
        Icon: Waves,
    },
    {
        name: "Plasma solar",
        desc: "Energia calida y rapida",
        variant: "plasma",
        speed: 1.4,
        intensity: 0.9,
        colors: ["#F15A22", "#FFBF00", "#DC143C", "#E9C46A"],
        Icon: Flame,
    },
    {
        name: "Cintas iris",
        desc: "Cintas multicolor suaves",
        variant: "ribbons",
        speed: 0.9,
        intensity: 0.8,
        colors: ["#a855f7", "#ec4899", "#22d3ee", "#84cc16"],
        Icon: Wind,
    },
];

const AUTO_CYCLE_OPTS: Array<{ value: number; label: string }> = [
    { value: 0, label: "Off" },
    { value: 15, label: "15 s" },
    { value: 30, label: "30 s" },
    { value: 60, label: "60 s" },
    { value: 120, label: "120 s" },
];

const DEFAULT_PALETTE = ["#E9C46A", "#9FE870", "#7FB8FF", "#C9A8FF"];

/* ──────────────────────────────────────────────────────────────────────
 * Mini-preview en vivo para variantes "living" (mini-canvas).
 * Reutiliza la misma lógica de dibujo del motor a pequeña escala. Cada
 * tarjeta monta un canvas diminuto; DPR capado, rAF compartido por tile,
 * respeta prefers-reduced-motion y pausa en pestaña oculta.
 * ──────────────────────────────────────────────────────────────────── */

function LivingMiniPreview({
    variant,
    speed,
    intensity,
    colors,
}: {
    variant: Variant;
    speed: number;
    intensity: number;
    colors: string[];
}) {
    const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
    // Refs para que el loop lea siempre el valor actual sin re-montar.
    const paramsRef = React.useRef({ variant, speed, intensity, colors });
    paramsRef.current = { variant, speed, intensity, colors };

    React.useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d", { alpha: true });
        if (!ctx) return;

        const reduce =
            typeof window !== "undefined" &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        let raf = 0;
        let w = 0,
            h = 0,
            dpr = 1;
        const stars: Array<{ x: number; y: number; z: number; r: number }> = [];
        const nodes: Array<{ x: number; y: number; vx: number; vy: number }> = [];
        const petals: Array<{ x: number; y: number; vy: number; sway: number; phase: number; size: number; ci: number }> = [];

        const resize = () => {
            dpr = Math.min(window.devicePixelRatio || 1, 1.5);
            w = canvas.clientWidth || 1;
            h = canvas.clientHeight || 1;
            canvas.width = Math.max(1, Math.floor(w * dpr));
            canvas.height = Math.max(1, Math.floor(h * dpr));
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            stars.length = 0;
            const sc = Math.max(10, Math.floor((w * h) / 600));
            for (let i = 0; i < sc; i++) stars.push({ x: Math.random() * w, y: Math.random() * h, z: Math.random(), r: Math.random() * 1.2 + 0.3 });
            nodes.length = 0;
            const nc = Math.min(16, Math.max(6, Math.floor((w * h) / 2400)));
            for (let i = 0; i < nc; i++) nodes.push({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25 });
            petals.length = 0;
            const pc = Math.min(20, Math.max(8, Math.floor((w * h) / 1600)));
            for (let i = 0; i < pc; i++) petals.push({ x: Math.random() * w, y: Math.random() * h, vy: 0.2 + Math.random() * 0.6, sway: 3 + Math.random() * 8, phase: Math.random() * Math.PI * 2, size: 1.5 + Math.random() * 2.5, ci: Math.floor(Math.random() * 6) });
        };
        resize();
        const ro = new ResizeObserver(resize);
        ro.observe(canvas);

        const draw = (t: number) => {
            const { variant: v, speed: sp, intensity: it, colors: cl } = paramsRef.current;
            const cols = cl && cl.length ? cl : DEFAULT_PALETTE;
            const time = t * 0.001 * sp;
            ctx.clearRect(0, 0, w, h);

            if (v === "starfield") {
                for (const s of stars) {
                    s.y += (0.05 + s.z * 0.5) * sp;
                    if (s.y > h) { s.y = 0; s.x = Math.random() * w; }
                    const tw = 0.5 + 0.5 * Math.sin(time * 2 + s.x);
                    ctx.beginPath();
                    ctx.fillStyle = cols[Math.floor(s.z * cols.length) % cols.length];
                    ctx.globalAlpha = (0.2 + s.z * 0.8) * tw * (0.5 + it);
                    ctx.arc(s.x, s.y, s.r * (0.6 + s.z), 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.globalAlpha = 1;
                return;
            }

            if (v === "mycelium") {
                for (const n of nodes) { n.x += n.vx * sp; n.y += n.vy * sp; if (n.x < 0 || n.x > w) n.vx *= -1; if (n.y < 0 || n.y > h) n.vy *= -1; }
                const maxD = 40 + it * 30;
                for (let i = 0; i < nodes.length; i++) {
                    for (let j = i + 1; j < nodes.length; j++) {
                        const a = nodes[i], b = nodes[j];
                        const d = Math.hypot(a.x - b.x, a.y - b.y);
                        if (d < maxD) {
                            ctx.strokeStyle = cols[(i + j) % cols.length];
                            ctx.globalAlpha = (1 - d / maxD) * 0.4 * (0.5 + it);
                            ctx.lineWidth = 1;
                            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
                        }
                    }
                }
                ctx.globalAlpha = 0.9;
                for (let i = 0; i < nodes.length; i++) {
                    ctx.fillStyle = cols[i % cols.length];
                    ctx.beginPath(); ctx.arc(nodes[i].x, nodes[i].y, 1.6, 0, Math.PI * 2); ctx.fill();
                }
                ctx.globalAlpha = 1;
                return;
            }

            if (v === "ocean") {
                for (let layer = 0; layer < 4; layer++) {
                    ctx.fillStyle = cols[layer % cols.length];
                    ctx.globalAlpha = (0.12 + layer * 0.06) * (0.5 + it);
                    ctx.beginPath();
                    ctx.moveTo(0, h);
                    const amp = 4 + layer * 3, yBase = h * (0.5 + layer * 0.12);
                    for (let x = 0; x <= w; x += 4) {
                        const y = yBase + Math.sin(x * 0.05 + time * (1 + layer * 0.3) + layer) * amp + Math.sin(x * 0.12 - time) * (amp * 0.3);
                        ctx.lineTo(x, y);
                    }
                    ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
                }
                ctx.globalAlpha = 1;
                return;
            }

            if (v === "prisma") {
                const cx = w / 2, cy = h / 2;
                const rot = time * 0.3;
                for (let i = 0; i < cols.length * 2; i++) {
                    const a0 = rot + (i / (cols.length * 2)) * Math.PI * 2;
                    const a1 = a0 + Math.PI / cols.length;
                    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h));
                    g.addColorStop(0, "transparent");
                    g.addColorStop(1, cols[i % cols.length]);
                    ctx.fillStyle = g;
                    ctx.globalAlpha = 0.22 * (0.5 + it);
                    ctx.beginPath(); ctx.moveTo(cx, cy);
                    ctx.arc(cx, cy, Math.max(w, h), a0, a1); ctx.closePath(); ctx.fill();
                }
                ctx.globalAlpha = 1;
                return;
            }

            if (v === "ribbons") {
                ctx.globalCompositeOperation = "screen";
                const bands = Math.min(cols.length * 2, 8);
                for (let b = 0; b < bands; b++) {
                    const yBase = h * ((b + 0.5) / bands);
                    const amp = (5 + b * 1.5) * (0.5 + it);
                    const ph = b * 0.9;
                    ctx.beginPath();
                    ctx.moveTo(0, yBase);
                    for (let x = 0; x <= w; x += 4) {
                        const y = yBase + Math.sin(x * 0.04 + time * (0.8 + b * 0.12) + ph) * amp + Math.sin(x * 0.09 - time * 0.6) * (amp * 0.35);
                        ctx.lineTo(x, y);
                    }
                    ctx.lineWidth = 1.5 + it * 1.5;
                    ctx.strokeStyle = cols[b % cols.length];
                    ctx.globalAlpha = 0.3 * (0.5 + it);
                    ctx.stroke();
                }
                ctx.globalCompositeOperation = "source-over";
                ctx.globalAlpha = 1;
                return;
            }

            if (v === "petals") {
                for (const p of petals) {
                    p.y += p.vy * sp;
                    p.phase += 0.02 * sp;
                    const x = p.x + Math.sin(p.phase) * p.sway;
                    if (p.y > h + 4) { p.y = -4; p.x = Math.random() * w; }
                    ctx.save();
                    ctx.translate(x, p.y);
                    ctx.rotate(p.phase);
                    ctx.fillStyle = cols[p.ci % cols.length];
                    ctx.globalAlpha = (0.4 + p.size / 8) * (0.5 + it);
                    ctx.beginPath();
                    ctx.ellipse(0, 0, p.size, p.size * 0.5, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                }
                ctx.globalAlpha = 1;
                return;
            }

            if (v === "grid-pulse") {
                const cx = w / 2, cy = h / 2;
                const step = 12;
                for (let gx = step / 2; gx < w; gx += step) {
                    for (let gy = step / 2; gy < h; gy += step) {
                        const d = Math.hypot(gx - cx, gy - cy);
                        const pulse = 0.5 + 0.5 * Math.sin(time * 2 - d * 0.06);
                        const r = (0.6 + pulse * 1.6) * (0.5 + it);
                        const ci = Math.floor(d / step) % cols.length;
                        ctx.fillStyle = cols[ci];
                        ctx.globalAlpha = (0.15 + pulse * 0.55) * (0.5 + it);
                        ctx.beginPath();
                        ctx.arc(gx, gy, r, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
                ctx.globalAlpha = 1;
                return;
            }

            // aurora / nebula / plasma → blobs radiales
            const blobs = v === "plasma" ? 5 : v === "nebula" ? 4 : 4;
            ctx.globalCompositeOperation = "screen";
            for (let i = 0; i < blobs; i++) {
                const col = cols[i % cols.length];
                const phase = i * 1.7;
                const speedMul = v === "plasma" ? 1.4 : v === "aurora" ? 0.8 : 0.5;
                const x = w * (0.5 + 0.42 * Math.sin(time * speedMul + phase) * Math.cos(time * 0.3 + i));
                const y = h * (0.5 + 0.42 * Math.cos(time * speedMul * 0.9 + phase));
                const rad = (v === "nebula" ? 0.6 : 0.45) * Math.min(w, h) * (0.7 + it * 0.6);
                const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
                g.addColorStop(0, col);
                g.addColorStop(0.5, col + "66");
                g.addColorStop(1, "transparent");
                ctx.fillStyle = g;
                ctx.globalAlpha = (v === "aurora" ? 0.32 : 0.28) * (0.5 + it);
                ctx.fillRect(0, 0, w, h);
            }
            ctx.globalCompositeOperation = "source-over";
            ctx.globalAlpha = 1;
        };

        if (reduce) {
            draw(1500);
        } else {
            const loop = (t: number) => {
                if (typeof document === "undefined" || !document.hidden) draw(t);
                raf = requestAnimationFrame(loop);
            };
            raf = requestAnimationFrame(loop);
        }
        return () => { cancelAnimationFrame(raf); ro.disconnect(); };
        // El loop lee paramsRef en vivo; no necesitamos re-montar al cambiar params.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="relative w-full h-16 rounded-lg overflow-hidden bg-[#0A0E27] border border-border/30">
            <canvas ref={canvasRef} className="w-full h-full" style={{ display: "block" }} />
        </div>
    );
}

/* ──────────────────────────────────────────────────────────────────────
 * Mini-preview CSS para fondos líquidos / materia (blobs radiales animados).
 * No usa canvas — gradientes con keyframes inline, fiel al fondo real.
 * ──────────────────────────────────────────────────────────────────── */

function FluidMiniPreview({ colors, base = "#05060a" }: { colors: string[]; base?: string }) {
    const c = colors.length ? colors : DEFAULT_PALETTE;
    return (
        <div
            className="relative w-full h-16 rounded-lg overflow-hidden border border-border/30"
            style={{ background: base }}
        >
            <div className="ss-fluid-prev absolute" style={{ width: "70%", height: "70%", left: "-10%", top: "-15%", background: `radial-gradient(circle at 50% 50%, ${c[0]}cc, transparent 60%)`, filter: "blur(8px)", animation: "ssFluidPrevA 7s ease-in-out infinite" }} />
            <div className="ss-fluid-prev absolute" style={{ width: "60%", height: "60%", right: "-10%", top: "0%", background: `radial-gradient(circle at 50% 50%, ${(c[1] ?? c[0])}cc, transparent 60%)`, filter: "blur(9px)", animation: "ssFluidPrevB 8s ease-in-out infinite" }} />
            <div className="ss-fluid-prev absolute" style={{ width: "65%", height: "65%", left: "10%", bottom: "-20%", background: `radial-gradient(circle at 50% 50%, ${(c[2] ?? c[0])}cc, transparent 60%)`, filter: "blur(8px)", animation: "ssFluidPrevC 6.5s ease-in-out infinite" }} />
            <div className="ss-fluid-prev absolute" style={{ width: "55%", height: "55%", right: "5%", bottom: "-10%", background: `radial-gradient(circle at 50% 50%, ${(c[3] ?? c[1] ?? c[0])}cc, transparent 60%)`, filter: "blur(9px)", animation: "ssFluidPrevA 9s ease-in-out infinite reverse" }} />
            <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center, transparent 35%, rgba(5,6,10,0.5) 100%)" }} />
        </div>
    );
}

function GradientMiniPreview({ value }: { value: string }) {
    return (
        <div
            className="relative w-full h-16 rounded-lg overflow-hidden border border-border/30"
            style={{ background: value }}
        />
    );
}

/* Keyframes inyectados una sola vez para los previews fluidos. */
const FLUID_KEYFRAMES = `
@keyframes ssFluidPrevA { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(12%,8%) scale(1.15); } }
@keyframes ssFluidPrevB { 0%,100% { transform: translate(0,0) scale(1.05); } 50% { transform: translate(-10%,10%) scale(0.92); } }
@keyframes ssFluidPrevC { 0%,100% { transform: translate(0,0) scale(0.95); } 50% { transform: translate(8%,-10%) scale(1.1); } }
@media (prefers-reduced-motion: reduce) { .ss-fluid-prev { animation: none !important; } }
`;

/* ──────────────────────────────────────────────────────────────────────
 * Componente principal
 * ──────────────────────────────────────────────────────────────────── */

export function BackgroundSettings() {
    const { config, updateConfig } = useAppearance();

    const living = config.background.living ?? {
        variant: "aurora" as Variant,
        speed: 0.8,
        intensity: 0.7,
        colors: [] as string[],
        autoCycleSec: 0,
    };
    const currentType = config.background.type;
    const isLiving = currentType === "living";

    // Recuerda el tipo de fondo previo para poder volver al desactivar.
    const prevTypeRef = React.useRef<string>("materia-oro-vivo");
    React.useEffect(() => {
        if (config.background.type !== "living") {
            prevTypeRef.current = config.background.type;
        }
    }, [config.background.type]);

    const setLiving = (patch: Partial<typeof living>) => {
        updateConfig({ background: { living: patch } } as any);
    };

    const enableLiving = () => {
        updateConfig({ background: { type: "living" } } as any);
    };

    const disableLiving = () => {
        const back = prevTypeRef.current === "living" ? "materia-oro-vivo" : prevTypeRef.current;
        updateConfig({ background: { type: back } } as any);
    };

    const pickVariant = (variant: Variant) => {
        updateConfig({ background: { type: "living", living: { variant } } } as any);
    };

    const pickType = (type: string) => {
        updateConfig({ background: { type } } as any);
    };

    const pickGradient = (value: string) => {
        updateConfig({ background: { type: "gradient", value } } as any);
    };

    const pickSolid = (value: string) => {
        updateConfig({ background: { type: "solid", value } } as any);
    };

    const pickSpline = () => {
        updateConfig({ background: { type: "spline" } } as any);
    };

    const pickAudiomorphic = () => {
        updateConfig({ background: { type: "audiomorphic" } } as any);
    };

    // ── WebGL 3D ──────────────────────────────────────────────────────────
    const webglVariant = (config.background.webglVariant ?? "liquid") as WebglVariant;
    const webglSpeed = config.background.webglSpeed ?? 0.22;
    const webglZoom = config.background.webglZoom ?? 1.0;
    const isWebgl = currentType === "webgl";

    const pickWebgl = (variant: WebglVariant) => {
        updateConfig({ background: { type: "webgl", webglVariant: variant } } as any);
    };
    const setWebglSpeed = (v: number) => updateConfig({ background: { webglSpeed: v } } as any);
    const setWebglZoom = (v: number) => updateConfig({ background: { webglZoom: v } } as any);

    // ── Audiomorphic ──────────────────────────────────────────────────────
    const audiomorphic = config.background.audiomorphic ?? { url: "https://audiomorphic.vercel.app", overlay: 0.15 };
    const isAudiomorphic = currentType === "audiomorphic";
    const setAudioUrl = (url: string) => updateConfig({ background: { audiomorphic: { url } } } as any);
    const setAudioOverlay = (overlay: number) => updateConfig({ background: { audiomorphic: { overlay } } } as any);

    const isSpline = currentType === "spline";

    const useThemeColors = living.colors.length === 0;

    // Colores efectivos para el preview de las variantes living.
    const livingPreviewColors = living.colors.length ? living.colors : DEFAULT_PALETTE;

    const setColorAt = (idx: number, hex: string) => {
        const base = living.colors.length ? [...living.colors] : [...DEFAULT_PALETTE];
        base[idx] = hex;
        setLiving({ colors: base });
    };

    const removeColorAt = (idx: number) => {
        const base = living.colors.length ? [...living.colors] : [...DEFAULT_PALETTE];
        base.splice(idx, 1);
        setLiving({ colors: base });
    };

    const addColor = () => {
        const base = living.colors.length ? [...living.colors] : [...DEFAULT_PALETTE];
        if (base.length >= 6) return;
        base.push("#7FB8FF");
        setLiving({ colors: base });
    };

    const applyPreset = (p: Preset) => {
        updateConfig({
            background: {
                type: "living",
                living: {
                    variant: p.variant,
                    speed: p.speed,
                    intensity: p.intensity,
                    colors: p.colors,
                },
            },
        } as any);
    };

    const resetDefault = () => {
        updateConfig({
            background: {
                type: "living",
                living: {
                    variant: "aurora",
                    speed: 0.8,
                    intensity: 0.7,
                    colors: [],
                    autoCycleSec: 0,
                },
            },
        } as any);
    };

    const toggleFullscreen = () => {
        if (typeof window !== "undefined") {
            window.dispatchEvent(
                new CustomEvent("starseed:toggle-fullscreen", { detail: { active: true } })
            );
        }
    };

    const paletteColors = living.colors.length ? living.colors : DEFAULT_PALETTE;

    return (
        <div className="rounded-2xl border border-border/50 bg-card/30 p-4 mt-4 space-y-6">
            {/* Keyframes para previews fluidos */}
            <style>{FLUID_KEYFRAMES}</style>

            {/* Cabecera + activacion */}
            <div>
                <h3 className="text-sm font-semibold flex items-center gap-2 mb-1">
                    <Sparkles className="w-4 h-4 text-primary" /> Fondo
                </h3>
                <p className="text-[11px] text-muted-foreground/70 mb-3 max-w-prose">
                    Elige el fondo del OS entre todas las familias disponibles. Cada tarjeta muestra una vista previa en vivo;
                    al pulsarla se aplica al instante. Las variantes vivas se ajustan con velocidad, intensidad, paleta y auto-rotacion.
                    Todo se guarda en este dispositivo y en tu cuenta.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                        type="button"
                        aria-pressed={isLiving}
                        onClick={enableLiving}
                        className={cn(
                            "text-left p-3 rounded-xl border transition-all cursor-pointer flex items-center gap-2",
                            isLiving
                                ? "border-primary/50 bg-primary/10 ring-1 ring-primary/30"
                                : "border-border/60 bg-card/40 hover:bg-card/70 hover:border-primary/25"
                        )}
                    >
                        <Power className={cn("w-4 h-4 shrink-0", isLiving ? "text-primary" : "text-muted-foreground")} />
                        <div className="min-w-0">
                            <span className="text-sm font-semibold block truncate">Activar fondo vivo</span>
                            <span className="text-xs text-muted-foreground">Pinta el canvas animado</span>
                        </div>
                        {isLiving && (
                            <span className="ml-auto w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />
                        )}
                    </button>
                    <button
                        type="button"
                        aria-pressed={!isLiving}
                        onClick={disableLiving}
                        className={cn(
                            "text-left p-3 rounded-xl border transition-all cursor-pointer flex items-center gap-2",
                            !isLiving
                                ? "border-primary/50 bg-primary/10 ring-1 ring-primary/30"
                                : "border-border/60 bg-card/40 hover:bg-card/70 hover:border-primary/25"
                        )}
                    >
                        <RotateCcw className={cn("w-4 h-4 shrink-0", !isLiving ? "text-primary" : "text-muted-foreground")} />
                        <div className="min-w-0">
                            <span className="text-sm font-semibold block truncate">Volver al anterior</span>
                            <span className="text-xs text-muted-foreground">Restaura tu fondo previo</span>
                        </div>
                        {!isLiving && (
                            <span className="ml-auto w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />
                        )}
                    </button>
                </div>
            </div>

            {/* ── Familia: Vivos / canvas ── */}
            <div>
                <h4 className="text-xs font-semibold text-muted-foreground/90 mb-2 flex items-center gap-1.5">
                    <Wand2 className="w-3.5 h-3.5" /> Vivos / canvas
                    <span className="text-muted-foreground/50 font-normal">({VARIANTS.length} variantes)</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {VARIANTS.map(({ value, label, desc, Icon }) => {
                        const active = isLiving && living.variant === value;
                        return (
                            <button
                                key={value}
                                type="button"
                                aria-pressed={active}
                                onClick={() => pickVariant(value)}
                                className={cn(
                                    "text-left p-2.5 rounded-xl border transition-all cursor-pointer",
                                    active
                                        ? "border-primary/50 bg-primary/10 ring-1 ring-primary/30"
                                        : "border-border/60 bg-card/40 hover:bg-card/70 hover:border-primary/25"
                                )}
                            >
                                <LivingMiniPreview
                                    variant={value}
                                    speed={living.speed}
                                    intensity={living.intensity}
                                    colors={livingPreviewColors}
                                />
                                <div className="flex items-center gap-2 mt-2 mb-0.5">
                                    <Icon className={cn("w-4 h-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
                                    <span className="text-sm font-semibold truncate">{label}</span>
                                    {active && (
                                        <span className="ml-auto w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ── Familia: Spline (escena 3D liquida por defecto) ── */}
            <div>
                <h4 className="text-xs font-semibold text-muted-foreground/90 mb-2 flex items-center gap-1.5">
                    <Boxes className="w-3.5 h-3.5" /> Spline 3D (predeterminado)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <button
                        type="button"
                        aria-pressed={isSpline}
                        onClick={pickSpline}
                        className={cn(
                            "text-left p-2.5 rounded-xl border transition-all cursor-pointer",
                            isSpline
                                ? "border-primary/50 bg-primary/10 ring-1 ring-primary/30"
                                : "border-border/60 bg-card/40 hover:bg-card/70 hover:border-primary/25"
                        )}
                    >
                        <FluidMiniPreview colors={["#F15A22", "#0A0E27", "#7FB8FF", "#C9A8FF"]} base="#05060a" />
                        <div className="flex items-center gap-2 mt-2 mb-0.5">
                            <Boxes className={cn("w-4 h-4 shrink-0", isSpline ? "text-primary" : "text-muted-foreground")} />
                            <span className="text-sm font-semibold truncate">Liquido Spline</span>
                            {isSpline && (
                                <span className="ml-auto w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">Escena 3D fluida y organica (la predeterminada).</p>
                    </button>
                </div>
            </div>

            {/* ── Familia: WebGL 3D (shader, con variante / velocidad / zoom) ── */}
            <div>
                <h4 className="text-xs font-semibold text-muted-foreground/90 mb-2 flex items-center gap-1.5">
                    <Box className="w-3.5 h-3.5" /> WebGL 3D
                    <span className="text-muted-foreground/50 font-normal">({WEBGL_OPTIONS.length} variantes)</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {WEBGL_OPTIONS.map(({ value, label, desc, colors, Icon }) => {
                        const active = isWebgl && webglVariant === value;
                        return (
                            <button
                                key={value}
                                type="button"
                                aria-pressed={active}
                                onClick={() => pickWebgl(value)}
                                className={cn(
                                    "text-left p-2.5 rounded-xl border transition-all cursor-pointer",
                                    active
                                        ? "border-primary/50 bg-primary/10 ring-1 ring-primary/30"
                                        : "border-border/60 bg-card/40 hover:bg-card/70 hover:border-primary/25"
                                )}
                            >
                                <FluidMiniPreview colors={colors} base="#05060a" />
                                <div className="flex items-center gap-2 mt-2 mb-0.5">
                                    <Icon className={cn("w-4 h-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
                                    <span className="text-sm font-semibold truncate">{label}</span>
                                    {active && (
                                        <span className="ml-auto w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                            </button>
                        );
                    })}
                </div>
                {/* Controles especificos WebGL: velocidad + zoom (solo afectan al fondo WebGL). */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                    <div className="rounded-xl border border-border/60 bg-card/40 p-3">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold flex items-center gap-1.5">
                                <Gauge className="w-3.5 h-3.5 text-primary" /> Velocidad (WebGL)
                            </span>
                            <span className="text-xs font-mono text-muted-foreground tabular-nums">
                                {webglSpeed.toFixed(2)}x
                            </span>
                        </div>
                        <input
                            type="range"
                            min={0.05}
                            max={2}
                            step={0.01}
                            value={webglSpeed}
                            onChange={(e) => setWebglSpeed(parseFloat(e.target.value))}
                            className="w-full accent-primary cursor-pointer"
                        />
                    </div>
                    <div className="rounded-xl border border-border/60 bg-card/40 p-3">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold flex items-center gap-1.5">
                                <Maximize2 className="w-3.5 h-3.5 text-primary" /> Zoom (WebGL)
                            </span>
                            <span className="text-xs font-mono text-muted-foreground tabular-nums">
                                {webglZoom.toFixed(2)}x
                            </span>
                        </div>
                        <input
                            type="range"
                            min={0.5}
                            max={3}
                            step={0.05}
                            value={webglZoom}
                            onChange={(e) => setWebglZoom(parseFloat(e.target.value))}
                            className="w-full accent-primary cursor-pointer"
                        />
                    </div>
                </div>
            </div>

            {/* ── Familia: Fluidos líquidos ── */}
            <div>
                <h4 className="text-xs font-semibold text-muted-foreground/90 mb-2 flex items-center gap-1.5">
                    <Droplets className="w-3.5 h-3.5" /> Fluidos liquidos
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {LIQUID_OPTIONS.map(({ type, label, desc, colors, Icon }) => {
                        const active = currentType === type;
                        return (
                            <button
                                key={type}
                                type="button"
                                aria-pressed={active}
                                onClick={() => pickType(type)}
                                className={cn(
                                    "text-left p-2.5 rounded-xl border transition-all cursor-pointer",
                                    active
                                        ? "border-primary/50 bg-primary/10 ring-1 ring-primary/30"
                                        : "border-border/60 bg-card/40 hover:bg-card/70 hover:border-primary/25"
                                )}
                            >
                                <FluidMiniPreview colors={colors} base="#05060a" />
                                <div className="flex items-center gap-2 mt-2 mb-0.5">
                                    <Icon className={cn("w-4 h-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
                                    <span className="text-sm font-semibold truncate">{label}</span>
                                    {active && (
                                        <span className="ml-auto w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ── Familia: Materia Viva ── */}
            <div>
                <h4 className="text-xs font-semibold text-muted-foreground/90 mb-2 flex items-center gap-1.5">
                    <Gem className="w-3.5 h-3.5" /> Materia Viva
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {MATERIA_OPTIONS.map(({ type, label, desc, colors, Icon }) => {
                        const active = currentType === type;
                        return (
                            <button
                                key={type}
                                type="button"
                                aria-pressed={active}
                                onClick={() => pickType(type)}
                                className={cn(
                                    "text-left p-2.5 rounded-xl border transition-all cursor-pointer",
                                    active
                                        ? "border-primary/50 bg-primary/10 ring-1 ring-primary/30"
                                        : "border-border/60 bg-card/40 hover:bg-card/70 hover:border-primary/25"
                                )}
                            >
                                <FluidMiniPreview colors={colors} base="#0d130e" />
                                <div className="flex items-center gap-2 mt-2 mb-0.5">
                                    <Icon className={cn("w-4 h-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
                                    <span className="text-sm font-semibold truncate">{label}</span>
                                    {active && (
                                        <span className="ml-auto w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ── Familia: Básicos ── */}
            <div>
                <h4 className="text-xs font-semibold text-muted-foreground/90 mb-2 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5" /> Basicos
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {GRADIENT_OPTIONS.map(({ label, desc, value, colors }) => {
                        const active = currentType === "gradient" && config.background.value === value;
                        return (
                            <button
                                key={label}
                                type="button"
                                aria-pressed={active}
                                onClick={() => pickGradient(value)}
                                className={cn(
                                    "text-left p-2.5 rounded-xl border transition-all cursor-pointer",
                                    active
                                        ? "border-primary/50 bg-primary/10 ring-1 ring-primary/30"
                                        : "border-border/60 bg-card/40 hover:bg-card/70 hover:border-primary/25"
                                )}
                            >
                                <GradientMiniPreview value={value} />
                                <div className="flex items-center gap-2 mt-2 mb-0.5">
                                    <Palette className={cn("w-4 h-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
                                    <span className="text-sm font-semibold truncate">{label}</span>
                                    {active && (
                                        <span className="ml-auto w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ── Familia: Colores solidos ── */}
            <div>
                <h4 className="text-xs font-semibold text-muted-foreground/90 mb-2 flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5" /> Colores solidos
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {SOLID_OPTIONS.map(({ label, value }) => {
                        const active = currentType === "solid" && config.background.value === value;
                        return (
                            <button
                                key={value}
                                type="button"
                                aria-pressed={active}
                                onClick={() => pickSolid(value)}
                                className={cn(
                                    "text-left p-2.5 rounded-xl border transition-all cursor-pointer",
                                    active
                                        ? "border-primary/50 bg-primary/10 ring-1 ring-primary/30"
                                        : "border-border/60 bg-card/40 hover:bg-card/70 hover:border-primary/25"
                                )}
                            >
                                <div className="relative w-full h-16 rounded-lg overflow-hidden border border-border/30" style={{ background: value }} />
                                <div className="flex items-center gap-2 mt-2 mb-0.5">
                                    <Palette className={cn("w-4 h-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
                                    <span className="text-sm font-semibold truncate">{label}</span>
                                    {active && (
                                        <span className="ml-auto w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground leading-relaxed font-mono">{value}</p>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ── Familia: Audiomorphic (visualizador embebido) ── */}
            <div>
                <h4 className="text-xs font-semibold text-muted-foreground/90 mb-2 flex items-center gap-1.5">
                    <AudioLines className="w-3.5 h-3.5" /> Audiomorphic
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <button
                        type="button"
                        aria-pressed={isAudiomorphic}
                        onClick={pickAudiomorphic}
                        className={cn(
                            "text-left p-2.5 rounded-xl border transition-all cursor-pointer",
                            isAudiomorphic
                                ? "border-primary/50 bg-primary/10 ring-1 ring-primary/30"
                                : "border-border/60 bg-card/40 hover:bg-card/70 hover:border-primary/25"
                        )}
                    >
                        <div className="relative w-full h-16 rounded-lg overflow-hidden border border-border/30 flex items-center justify-center" style={{ background: "linear-gradient(135deg, #1a0b2e 0%, #0a0e27 50%, #2e1065 100%)" }}>
                            <AudioLines className="w-7 h-7 text-primary/80" />
                        </div>
                        <div className="flex items-center gap-2 mt-2 mb-0.5">
                            <AudioLines className={cn("w-4 h-4 shrink-0", isAudiomorphic ? "text-primary" : "text-muted-foreground")} />
                            <span className="text-sm font-semibold truncate">Audiomorphic</span>
                            {isAudiomorphic && (
                                <span className="ml-auto w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">Visualizador embebido a pantalla completa.</p>
                    </button>
                </div>
                {/* Controles especificos Audiomorphic: URL + overlay. */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                    <div className="rounded-xl border border-border/60 bg-card/40 p-3">
                        <span className="text-xs font-semibold flex items-center gap-1.5 mb-2">
                            <Link2 className="w-3.5 h-3.5 text-primary" /> URL del visualizador
                        </span>
                        <input
                            type="url"
                            value={audiomorphic.url}
                            onChange={(e) => setAudioUrl(e.target.value)}
                            placeholder="https://audiomorphic.vercel.app"
                            className="w-full text-xs px-2.5 py-2 rounded-lg border border-border/60 bg-background/60 text-foreground focus:outline-none focus:border-primary/40"
                        />
                    </div>
                    <div className="rounded-xl border border-border/60 bg-card/40 p-3">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold flex items-center gap-1.5">
                                <Layers className="w-3.5 h-3.5 text-primary" /> Overlay
                            </span>
                            <span className="text-xs font-mono text-muted-foreground tabular-nums">
                                {Math.round((audiomorphic.overlay ?? 0.15) * 100)}%
                            </span>
                        </div>
                        <input
                            type="range"
                            min={0}
                            max={0.8}
                            step={0.05}
                            value={audiomorphic.overlay ?? 0.15}
                            onChange={(e) => setAudioOverlay(parseFloat(e.target.value))}
                            className="w-full accent-primary cursor-pointer"
                        />
                    </div>
                </div>
                <p className="text-[11px] text-muted-foreground/70 mt-2">
                    Si el sitio bloquea el embebido (X-Frame-Options), el fondo podria no mostrarse; la opcion permanece disponible.
                </p>
            </div>

            {/* ── Ajustes de las variantes vivas ── */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-5">
                <p className="text-[11px] text-muted-foreground/80">
                    Ajustes de las variantes vivas (canvas). Afectan a las miniaturas y al fondo en vivo.
                </p>

                {/* Sliders */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-border/60 bg-card/40 p-3">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold flex items-center gap-1.5">
                                <Gauge className="w-3.5 h-3.5 text-primary" /> Velocidad
                            </span>
                            <span className="text-xs font-mono text-muted-foreground tabular-nums">
                                {living.speed.toFixed(1)}x
                            </span>
                        </div>
                        <input
                            type="range"
                            min={0.2}
                            max={2}
                            step={0.1}
                            value={living.speed}
                            onChange={(e) => setLiving({ speed: parseFloat(e.target.value) })}
                            className="w-full accent-primary cursor-pointer"
                        />
                    </div>
                    <div className="rounded-xl border border-border/60 bg-card/40 p-3">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5 text-primary" /> Intensidad
                            </span>
                            <span className="text-xs font-mono text-muted-foreground tabular-nums">
                                {Math.round(living.intensity * 100)}%
                            </span>
                        </div>
                        <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.05}
                            value={living.intensity}
                            onChange={(e) => setLiving({ intensity: parseFloat(e.target.value) })}
                            className="w-full accent-primary cursor-pointer"
                        />
                    </div>
                </div>

                {/* Paleta */}
                <div className="rounded-xl border border-border/60 bg-card/40 p-3">
                    <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                        <span className="text-xs font-semibold flex items-center gap-1.5">
                            <Palette className="w-3.5 h-3.5 text-primary" /> Paleta de colores
                        </span>
                        <button
                            type="button"
                            aria-pressed={useThemeColors}
                            onClick={() => setLiving({ colors: useThemeColors ? [...DEFAULT_PALETTE] : [] })}
                            className={cn(
                                "text-xs px-2.5 py-1 rounded-full border transition-all cursor-pointer",
                                useThemeColors
                                    ? "border-primary/50 bg-primary/10 text-primary ring-1 ring-primary/30"
                                    : "border-border/60 bg-card/40 text-muted-foreground hover:border-primary/25"
                            )}
                        >
                            {useThemeColors ? "Usando colores del tema" : "Usar colores del tema"}
                        </button>
                    </div>
                    {useThemeColors ? (
                        <p className="text-xs text-muted-foreground">
                            El fondo hereda automaticamente los acentos de tu tema activo.
                        </p>
                    ) : (
                        <div className="flex flex-wrap items-center gap-2">
                            {paletteColors.map((c, i) => (
                                <div key={i} className="relative group">
                                    <input
                                        type="color"
                                        value={c}
                                        onChange={(e) => setColorAt(i, e.target.value)}
                                        className="w-10 h-10 rounded-lg border border-border/60 bg-transparent cursor-pointer p-0.5"
                                        aria-label={`Color ${i + 1}`}
                                    />
                                    {paletteColors.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => removeColorAt(i)}
                                            aria-label={`Quitar color ${i + 1}`}
                                            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[10px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                                        >
                                            x
                                        </button>
                                    )}
                                </div>
                            ))}
                            {paletteColors.length < 6 && (
                                <button
                                    type="button"
                                    onClick={addColor}
                                    className="w-10 h-10 rounded-lg border border-dashed border-border/60 text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors cursor-pointer flex items-center justify-center text-lg"
                                    aria-label="Anadir color"
                                >
                                    +
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Auto-rotacion */}
                <div className="rounded-xl border border-border/60 bg-card/40 p-3">
                    <span className="text-xs font-semibold flex items-center gap-1.5 mb-2">
                        <Timer className="w-3.5 h-3.5 text-primary" /> Auto-rotacion
                        <span className="text-muted-foreground font-normal">(Automatico)</span>
                    </span>
                    <div className="flex flex-wrap gap-2">
                        {AUTO_CYCLE_OPTS.map((opt) => {
                            const active = (living.autoCycleSec ?? 0) === opt.value;
                            return (
                                <button
                                    key={opt.value}
                                    type="button"
                                    aria-pressed={active}
                                    onClick={() => setLiving({ autoCycleSec: opt.value })}
                                    className={cn(
                                        "text-xs px-3 py-1.5 rounded-full border transition-all cursor-pointer",
                                        active
                                            ? "border-primary/50 bg-primary/10 text-primary ring-1 ring-primary/30"
                                            : "border-border/60 bg-card/40 text-muted-foreground hover:border-primary/25"
                                    )}
                                >
                                    {opt.label}
                                </button>
                            );
                        })}
                    </div>
                    <p className="text-[11px] text-muted-foreground/70 mt-2">
                        Rota entre las {VARIANTS.length} variantes vivas cada cierto tiempo. "Off" mantiene la elegida.
                    </p>
                </div>
            </div>

            {/* Presets */}
            <div>
                <h4 className="text-xs font-semibold text-muted-foreground/90 mb-2 flex items-center gap-1.5">
                    <Wand2 className="w-3.5 h-3.5" /> Presets creativos
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {PRESETS.map((p) => (
                        <button
                            key={p.name}
                            type="button"
                            onClick={() => applyPreset(p)}
                            className="text-left p-3 rounded-xl border border-border/60 bg-card/40 hover:bg-card/70 hover:border-primary/25 transition-all cursor-pointer"
                        >
                            <div className="flex items-center gap-2 mb-1.5">
                                <p.Icon className="w-4 h-4 shrink-0 text-muted-foreground" />
                                <span className="text-sm font-semibold truncate">{p.name}</span>
                            </div>
                            <p className="text-xs text-muted-foreground mb-2 truncate">{p.desc}</p>
                            <div className="flex gap-1">
                                {p.colors.map((c, i) => (
                                    <span
                                        key={i}
                                        className="w-4 h-4 rounded-full border border-border/40"
                                        style={{ backgroundColor: c }}
                                    />
                                ))}
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Acciones finales */}
            <div className="flex flex-wrap gap-2 pt-1">
                <button
                    type="button"
                    onClick={resetDefault}
                    className="text-xs px-3 py-2 rounded-lg border border-border/60 bg-card/40 text-muted-foreground hover:border-primary/30 hover:text-foreground transition-all cursor-pointer flex items-center gap-1.5"
                >
                    <RotateCcw className="w-3.5 h-3.5" /> Restablecer a predeterminado
                </button>
                <button
                    type="button"
                    onClick={toggleFullscreen}
                    className="text-xs px-3 py-2 rounded-lg border border-border/60 bg-card/40 text-muted-foreground hover:border-primary/30 hover:text-foreground transition-all cursor-pointer flex items-center gap-1.5"
                >
                    <Maximize2 className="w-3.5 h-3.5" /> Modo wallpaper / pantalla completa
                </button>
            </div>
        </div>
    );
}
