'use client';

// ════════════════════════════════════════════════════════════════
// MateriaVivaBackground — Tema "Materia Viva" (v1)
// Familia de fondos portada del rediseño Nexus/Café: oro + cristal +
// geometría sagrada sobre verde-negro profundo. Canvas 2D ligero,
// SIN three.js/WebGL. Se activa cuando config.background.type
// empieza por "materia-" (mismo patrón que LiquidPsychedelicBackground).
// SOP: architecture/integracion-portal-starseed-os.md → "Tema Materia Viva (v1)"
// ════════════════════════════════════════════════════════════════

import { useEffect, useRef } from "react";
import { useAppearance } from "@/context/appearance-context";

export type MateriaVivaVariant = "oro-vivo" | "cristal-liquido" | "bosque-dorado";

export const MATERIA_VIVA_VARIANTS: readonly MateriaVivaVariant[] = [
    "oro-vivo",
    "cristal-liquido",
    "bosque-dorado",
];

export const MATERIA_PREFIX = "materia-";

interface MateriaPalette {
    /** Colores de partículas (hex) */
    particles: string[];
    /** RGB "r, g, b" del brillo especular que sigue al cursor */
    glow: string;
}

// oro-vivo: ámbar/oro · cristal-liquido: cian/lavanda · bosque-dorado: lima/musgo
const PALETTES: Record<MateriaVivaVariant, MateriaPalette> = {
    "oro-vivo": { particles: ["#e9c46a", "#f4d58d", "#d9ed92", "#8be0c9"], glow: "233, 196, 106" },
    "cristal-liquido": { particles: ["#7fd8e8", "#9aa7ff", "#cdb9ff", "#e9c46a"], glow: "143, 196, 222" },
    "bosque-dorado": { particles: ["#a8c66c", "#d9ed92", "#7a9b4e", "#e9c46a"], glow: "168, 198, 108" },
};

// Centros de la Flor de la Vida (19 círculos), en unidades de radio r:
// 1 central + 6 a distancia 1 + 6 a distancia 2 + 6 a distancia √3 (girados 30°).
const FLOWER_OFFSETS: ReadonlyArray<readonly [number, number]> = (() => {
    const pts: Array<[number, number]> = [[0, 0]];
    for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k;
        pts.push([Math.cos(a), Math.sin(a)]);
    }
    for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k;
        pts.push([2 * Math.cos(a), 2 * Math.sin(a)]);
    }
    for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k + Math.PI / 6;
        pts.push([Math.sqrt(3) * Math.cos(a), Math.sqrt(3) * Math.sin(a)]);
    }
    return pts;
})();

interface Particle {
    x: number;
    y: number;
    r: number;
    vy: number;      // velocidad ascendente (px/s)
    wobble: number;  // amplitud de deriva horizontal (px)
    wf: number;      // frecuencia de deriva
    phase: number;
    alpha: number;
    color: string;
}

export interface MateriaVivaBackgroundProps {
    variant: MateriaVivaVariant;
    /** 0..1 — escala cantidad de partículas y alfa del patrón. Por defecto 0.7 */
    intensity?: number;
}

export function MateriaVivaBackground({ variant, intensity = 0.7 }: MateriaVivaBackgroundProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const palette = PALETTES[variant];
        const inten = Math.min(1, Math.max(0, intensity));

        let width = 0;
        let height = 0;
        let raf = 0;
        let running = false;
        let last = 0;
        let t = 0;
        let particles: Particle[] = [];

        // Posición del brillo especular (normalizada 0..1), con suavizado.
        const pointer = { x: 0.5, y: 0.42, tx: 0.5, ty: 0.42 };

        const mql = window.matchMedia("(prefers-reduced-motion: reduce)");

        const seedParticles = () => {
            const count = Math.round(130 * inten); // ~90 con la intensidad por defecto (0.7)
            particles = Array.from({ length: count }, () => ({
                x: Math.random() * width,
                y: Math.random() * height,
                r: 0.6 + Math.random() * 1.7,
                vy: 8 + Math.random() * 26,
                wobble: 6 + Math.random() * 18,
                wf: 0.2 + Math.random() * 0.6,
                phase: Math.random() * Math.PI * 2,
                alpha: 0.18 + Math.random() * 0.5,
                color: palette.particles[Math.floor(Math.random() * palette.particles.length)],
            }));
        };

        const drawBase = () => {
            // Base radial verde-negra profunda (#0d130e → #16210f)
            const rMax = Math.hypot(width, height) * 0.62;
            const g = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, rMax);
            g.addColorStop(0, "#0d130e");
            g.addColorStop(1, "#16210f");
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, width, height);
        };

        const drawFlower = (time: number) => {
            const R = Math.min(width, height) * 0.46;
            const r = R / 3;
            const rot = time * 0.012; // rotación muy lenta
            const breathe = 0.85 + 0.15 * Math.sin(time * 0.25);
            const alpha = (0.05 + 0.11 * inten) * breathe;
            ctx.save();
            ctx.translate(width / 2, height / 2);
            ctx.rotate(rot);
            ctx.strokeStyle = `rgba(233,196,106,${alpha.toFixed(4)})`;
            ctx.lineWidth = 1;
            for (const [ox, oy] of FLOWER_OFFSETS) {
                ctx.beginPath();
                ctx.arc(ox * r, oy * r, r, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.restore();
        };

        const stepParticles = (dt: number, time: number) => {
            const alphaScale = 0.35 + 0.65 * inten;
            for (const p of particles) {
                p.y -= p.vy * dt; // deriva ascendente
                if (p.y < -12) {
                    p.y = height + 12;
                    p.x = Math.random() * width;
                }
                const rawX = p.x + Math.sin(time * p.wf + p.phase) * p.wobble;
                const x = ((rawX % width) + width) % width; // wrap horizontal
                const twinkle = 0.75 + 0.25 * Math.sin(time * 1.7 + p.phase * 3);
                ctx.globalAlpha = Math.min(1, p.alpha * alphaScale * twinkle);
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(x, p.y, p.r, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        };

        const drawGlow = () => {
            const gx = pointer.x * width;
            const gy = pointer.y * height;
            const radius = Math.min(width, height) * 0.38;
            const a = 0.1 + 0.12 * inten;
            const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, radius);
            g.addColorStop(0, `rgba(${palette.glow}, ${a.toFixed(3)})`);
            g.addColorStop(0.5, `rgba(${palette.glow}, ${(a * 0.35).toFixed(3)})`);
            g.addColorStop(1, "rgba(0,0,0,0)");
            ctx.save();
            ctx.globalCompositeOperation = "lighter";
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, width, height);
            ctx.restore();
        };

        const drawFrame = (time: number, dt = 0) => {
            // Suavizado del brillo hacia el cursor
            pointer.x += (pointer.tx - pointer.x) * 0.06;
            pointer.y += (pointer.ty - pointer.y) * 0.06;
            drawBase();
            drawFlower(time);
            stepParticles(dt, time);
            drawGlow();
        };

        const loop = (now: number) => {
            const dt = Math.min((now - last) / 1000, 0.05);
            last = now;
            t += dt;
            drawFrame(t, dt);
            raf = requestAnimationFrame(loop);
        };

        const start = () => {
            if (running || mql.matches) return;
            running = true;
            last = performance.now();
            raf = requestAnimationFrame(loop);
        };

        const stop = () => {
            running = false;
            cancelAnimationFrame(raf);
        };

        const resize = () => {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            width = window.innerWidth;
            height = window.innerHeight;
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            seedParticles();
            if (mql.matches) drawFrame(t); // re-pintar fotograma estático tras redimensionar
        };

        const onPointerMove = (e: PointerEvent) => {
            pointer.tx = e.clientX / Math.max(1, width);
            pointer.ty = e.clientY / Math.max(1, height);
        };

        const onVisibility = () => {
            if (document.hidden) stop();
            else start();
        };

        const onMotionChange = () => {
            if (mql.matches) {
                stop();
                drawFrame(t); // fotograma estático
            } else {
                start();
            }
        };

        resize();
        if (mql.matches) {
            drawFrame(0); // prefers-reduced-motion → un solo fotograma estático
        } else {
            start();
        }

        window.addEventListener("resize", resize);
        window.addEventListener("pointermove", onPointerMove, { passive: true });
        document.addEventListener("visibilitychange", onVisibility);
        mql.addEventListener("change", onMotionChange);

        return () => {
            stop();
            window.removeEventListener("resize", resize);
            window.removeEventListener("pointermove", onPointerMove);
            document.removeEventListener("visibilitychange", onVisibility);
            mql.removeEventListener("change", onMotionChange);
        };
    }, [variant, intensity]);

    return (
        <div
            className="fixed inset-0 -z-10 overflow-hidden pointer-events-none"
            style={{ background: "#0d130e" }}
            aria-hidden
        >
            <canvas ref={canvasRef} className="block h-full w-full" />
        </div>
    );
}

/**
 * Host global: lee la configuración de apariencia y monta el fondo
 * Materia Viva cuando config.background.type empieza por "materia-".
 * Montado en src/app/layout.tsx junto al resto de fondos.
 */
export function MateriaVivaBackgroundHost() {
    const { config } = useAppearance();
    const type = (config.background?.type ?? "") as string;
    if (!type.startsWith(MATERIA_PREFIX)) return null;
    const variant = type.slice(MATERIA_PREFIX.length) as MateriaVivaVariant;
    if (!MATERIA_VIVA_VARIANTS.includes(variant)) return null;
    return (
        <MateriaVivaBackground
            variant={variant}
            intensity={config.background.intensity ?? 0.7}
        />
    );
}
