"use client";

/*
 * LivingBackground — fondo animado "vivo" del OS.
 * ----------------------------------------------------------------------
 * Canvas 2D performante con varias variantes creativas (aurora, nebula,
 * starfield, mycelium, plasma, prisma, ocean). Se monta en el layout raíz,
 * así que la animación es CONTINUA y NO se interrumpe al cambiar de sección
 * (el layout no se desmonta). Lee config.background.living (variante,
 * velocidad, intensidad, colores, auto-cycle). Si la paleta está vacía usa
 * los acentos del tema activo (CSS vars). Respeta prefers-reduced-motion
 * (fotograma estático) y pausa al ocultar la pestaña (ahorra batería).
 *
 * Visible solo cuando config.background.type === "living" (opacidad 0/1),
 * pero el componente permanece montado para no cortar la animación.
 */

import React, { useEffect, useRef, useState } from "react";
import { useAppearance } from "@/context/appearance-context";
import { applyAlpha } from "@/lib/utils";

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

const VARIANTS: Variant[] = [
    "aurora",
    "nebula",
    "starfield",
    "mycelium",
    "plasma",
    "prisma",
    "ocean",
    "ribbons",
    "petals",
    "grid-pulse",
];

function readThemeColors(): string[] {
    if (typeof window === "undefined") return ["#E9C46A", "#9FE870", "#7FB8FF", "#C9A8FF"];
    const cs = getComputedStyle(document.documentElement);
    const hsl = (v: string) => {
        const raw = cs.getPropertyValue(v).trim();
        return raw ? `hsl(${raw})` : "";
    };
    const out = [hsl("--primary-hsl"), hsl("--secondary-hsl"), hsl("--accent-hsl"), hsl("--ring-hsl")].filter(Boolean);
    return out.length ? out : ["#E9C46A", "#9FE870", "#7FB8FF", "#C9A8FF"];
}

function hexToRgb(c: string): [number, number, number] {
    if (c.startsWith("hsl")) {
        // dejar que el canvas lo resuelva vía fillStyle; devolvemos blanco para mezclas numéricas
        return [200, 200, 200];
    }
    const h = c.replace("#", "");
    const n = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
    const num = parseInt(n, 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function LivingBackground() {
    const { config } = useAppearance();
    const [mounted, setMounted] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const cfgRef = useRef(config.background.living);
    const typeRef = useRef(config.background.type);
    const cycleStartRef = useRef(Date.now());
    const cycleIdxRef = useRef(0);

    useEffect(() => { cfgRef.current = config.background.living; typeRef.current = config.background.type; }, [config.background.living, config.background.type]);
    useEffect(() => { setMounted(true); }, []);

    const active = config.background.type === "living";

    useEffect(() => {
        if (!mounted) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d", { alpha: true });
        if (!ctx) return;

        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        let raf = 0;
        let w = 0, h = 0, dpr = 1;
        const stars: Array<{ x: number; y: number; z: number; r: number }> = [];
        const nodes: Array<{ x: number; y: number; vx: number; vy: number }> = [];
        const petals: Array<{ x: number; y: number; vy: number; sway: number; phase: number; size: number; ci: number }> = [];

        const resize = () => {
            dpr = Math.min(window.devicePixelRatio || 1, 1.5);
            w = canvas.clientWidth; h = canvas.clientHeight;
            canvas.width = Math.max(1, Math.floor(w * dpr));
            canvas.height = Math.max(1, Math.floor(h * dpr));
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            // re-sembrar campos dependientes del tamaño
            stars.length = 0;
            const sc = Math.floor((w * h) / 6000);
            for (let i = 0; i < sc; i++) stars.push({ x: Math.random() * w, y: Math.random() * h, z: Math.random(), r: Math.random() * 1.4 + 0.2 });
            nodes.length = 0;
            const nc = Math.min(48, Math.floor((w * h) / 26000));
            for (let i = 0; i < nc; i++) nodes.push({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25 });
            petals.length = 0;
            const pc = Math.min(60, Math.floor((w * h) / 22000));
            for (let i = 0; i < pc; i++) petals.push({ x: Math.random() * w, y: Math.random() * h, vy: 0.2 + Math.random() * 0.6, sway: 8 + Math.random() * 22, phase: Math.random() * Math.PI * 2, size: 3 + Math.random() * 5, ci: Math.floor(Math.random() * 6) });
        };
        resize();
        const ro = new ResizeObserver(resize);
        ro.observe(canvas);

        const colorsFor = () => {
            const c = cfgRef.current?.colors;
            return c && c.length ? c : readThemeColors();
        };

        const draw = (t: number) => {
            const cfg = cfgRef.current || { variant: "aurora", speed: 0.8, intensity: 0.7, colors: [], autoCycleSec: 0 };
            const speed = (cfg.speed ?? 0.8);
            const intensity = (cfg.intensity ?? 0.7);
            let variant = (cfg.variant ?? "aurora") as Variant;
            // auto-cycle de variantes
            if (cfg.autoCycleSec && cfg.autoCycleSec > 0) {
                if ((Date.now() - cycleStartRef.current) / 1000 > cfg.autoCycleSec) {
                    cycleStartRef.current = Date.now();
                    cycleIdxRef.current = (cycleIdxRef.current + 1) % VARIANTS.length;
                }
                variant = VARIANTS[cycleIdxRef.current];
            }
            const cols = colorsFor();
            const time = t * 0.001 * speed;

            ctx.clearRect(0, 0, w, h);

            if (variant === "starfield") {
                ctx.globalAlpha = 1;
                for (const s of stars) {
                    s.y += (0.05 + s.z * 0.5) * speed;
                    if (s.y > h) { s.y = 0; s.x = Math.random() * w; }
                    const tw = 0.5 + 0.5 * Math.sin(time * 2 + s.x);
                    ctx.beginPath();
                    ctx.fillStyle = cols[Math.floor(s.z * cols.length) % cols.length];
                    ctx.globalAlpha = (0.2 + s.z * 0.8) * tw * (0.5 + intensity);
                    ctx.arc(s.x, s.y, s.r * (0.6 + s.z), 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.globalAlpha = 1;
                return;
            }

            if (variant === "mycelium") {
                for (const n of nodes) { n.x += n.vx * speed; n.y += n.vy * speed; if (n.x < 0 || n.x > w) n.vx *= -1; if (n.y < 0 || n.y > h) n.vy *= -1; }
                const maxD = 150 + intensity * 120;
                for (let i = 0; i < nodes.length; i++) {
                    for (let j = i + 1; j < nodes.length; j++) {
                        const a = nodes[i], b = nodes[j];
                        const dx = a.x - b.x, dy = a.y - b.y; const d = Math.hypot(dx, dy);
                        if (d < maxD) {
                            ctx.strokeStyle = cols[(i + j) % cols.length];
                            ctx.globalAlpha = (1 - d / maxD) * 0.35 * (0.5 + intensity);
                            ctx.lineWidth = 1;
                            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
                        }
                    }
                }
                ctx.globalAlpha = 0.9;
                for (let i = 0; i < nodes.length; i++) {
                    ctx.fillStyle = cols[i % cols.length];
                    ctx.beginPath(); ctx.arc(nodes[i].x, nodes[i].y, 2.2, 0, Math.PI * 2); ctx.fill();
                }
                ctx.globalAlpha = 1;
                return;
            }

            if (variant === "ocean") {
                for (let layer = 0; layer < 4; layer++) {
                    const col = cols[layer % cols.length];
                    ctx.fillStyle = col;
                    ctx.globalAlpha = (0.10 + layer * 0.05) * (0.5 + intensity);
                    ctx.beginPath();
                    ctx.moveTo(0, h);
                    const amp = 22 + layer * 16, yBase = h * (0.5 + layer * 0.12);
                    for (let x = 0; x <= w; x += 8) {
                        const y = yBase + Math.sin(x * 0.008 + time * (1 + layer * 0.3) + layer) * amp + Math.sin(x * 0.02 - time) * (amp * 0.3);
                        ctx.lineTo(x, y);
                    }
                    ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
                }
                ctx.globalAlpha = 1;
                return;
            }

            if (variant === "prisma") {
                const cx = w / 2, cy = h / 2;
                const rot = time * 0.3;
                for (let i = 0; i < cols.length * 2; i++) {
                    const a0 = rot + (i / (cols.length * 2)) * Math.PI * 2;
                    const a1 = a0 + Math.PI / cols.length;
                    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h));
                    g.addColorStop(0, "transparent");
                    g.addColorStop(1, cols[i % cols.length]);
                    ctx.fillStyle = g;
                    ctx.globalAlpha = 0.18 * (0.5 + intensity);
                    ctx.beginPath(); ctx.moveTo(cx, cy);
                    ctx.arc(cx, cy, Math.max(w, h), a0, a1); ctx.closePath(); ctx.fill();
                }
                ctx.globalAlpha = 1;
                return;
            }

            if (variant === "ribbons") {
                // Cintas sinusoidales horizontales que ondulan y se desplazan.
                ctx.globalCompositeOperation = "screen";
                const bands = Math.min(cols.length * 2, 8);
                for (let b = 0; b < bands; b++) {
                    const col = cols[b % cols.length];
                    const yBase = h * ((b + 0.5) / bands);
                    const amp = (28 + b * 6) * (0.5 + intensity);
                    const ph = b * 0.9;
                    ctx.beginPath();
                    ctx.moveTo(0, yBase);
                    for (let x = 0; x <= w; x += 10) {
                        const y = yBase + Math.sin(x * 0.006 + time * (0.8 + b * 0.12) + ph) * amp + Math.sin(x * 0.015 - time * 0.6) * (amp * 0.35);
                        ctx.lineTo(x, y);
                    }
                    ctx.lineWidth = 3 + intensity * 4;
                    ctx.strokeStyle = col;
                    ctx.globalAlpha = 0.22 * (0.5 + intensity);
                    ctx.stroke();
                }
                ctx.globalCompositeOperation = "source-over";
                ctx.globalAlpha = 1;
                return;
            }

            if (variant === "petals") {
                // Pétalos / partículas que caen con vaivén lateral.
                for (const p of petals) {
                    p.y += p.vy * speed;
                    p.phase += 0.02 * speed;
                    const x = p.x + Math.sin(p.phase) * p.sway;
                    if (p.y > h + 12) { p.y = -12; p.x = Math.random() * w; }
                    ctx.save();
                    ctx.translate(x, p.y);
                    ctx.rotate(p.phase);
                    ctx.fillStyle = cols[p.ci % cols.length];
                    ctx.globalAlpha = (0.35 + p.size / 16) * (0.5 + intensity);
                    ctx.beginPath();
                    ctx.ellipse(0, 0, p.size, p.size * 0.5, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                }
                ctx.globalAlpha = 1;
                return;
            }

            if (variant === "grid-pulse") {
                // Rejilla de puntos que late en ondas radiales desde el centro.
                const cx = w / 2, cy = h / 2;
                const step = 34;
                for (let gx = step / 2; gx < w; gx += step) {
                    for (let gy = step / 2; gy < h; gy += step) {
                        const d = Math.hypot(gx - cx, gy - cy);
                        const pulse = 0.5 + 0.5 * Math.sin(time * 2 - d * 0.02);
                        const r = (1 + pulse * 3) * (0.5 + intensity);
                        const ci = Math.floor(d / step) % cols.length;
                        ctx.fillStyle = cols[ci];
                        ctx.globalAlpha = (0.15 + pulse * 0.5) * (0.5 + intensity);
                        ctx.beginPath();
                        ctx.arc(gx, gy, r, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
                ctx.globalAlpha = 1;
                return;
            }

            // aurora / nebula / plasma → blobs radiales en movimiento (gaussian-ish)
            const blobs = variant === "plasma" ? 6 : variant === "nebula" ? 5 : 4;
            ctx.globalCompositeOperation = "screen";
            for (let i = 0; i < blobs; i++) {
                const col = cols[i % cols.length];
                const phase = i * 1.7;
                const speedMul = variant === "plasma" ? 1.4 : variant === "aurora" ? 0.8 : 0.5;
                const x = w * (0.5 + 0.42 * Math.sin(time * speedMul + phase) * Math.cos(time * 0.3 + i));
                const y = h * (0.5 + 0.42 * Math.cos(time * speedMul * 0.9 + phase));
                const rad = (variant === "nebula" ? 0.55 : 0.4) * Math.min(w, h) * (0.7 + intensity * 0.6);
                const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
                g.addColorStop(0, col);
                g.addColorStop(0.5, applyAlpha(col, "66", "0.4"));
                g.addColorStop(1, "transparent");
                ctx.fillStyle = g;
                ctx.globalAlpha = (variant === "aurora" ? 0.30 : 0.26) * (0.5 + intensity);
                ctx.fillRect(0, 0, w, h);
            }
            ctx.globalCompositeOperation = "source-over";
            ctx.globalAlpha = 1;
        };

        if (reduce) {
            draw(1000); // un solo fotograma estático
        } else {
            const loop = (t: number) => { if (!document.hidden) draw(t); raf = requestAnimationFrame(loop); };
            raf = requestAnimationFrame(loop);
        }
        return () => { cancelAnimationFrame(raf); ro.disconnect(); };
    }, [mounted]);

    if (!mounted) return null;

    return (
        <div
            aria-hidden
            className="fixed inset-0 -z-40 pointer-events-none transition-opacity duration-1000"
            style={{ opacity: active ? 1 : 0 }}
        >
            <canvas ref={canvasRef} className="w-full h-full" style={{ display: "block" }} />
        </div>
    );
}
