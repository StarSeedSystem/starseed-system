/**
 * Audiomorphic — FONDO PROPIO DEL VISUALIZADOR (Adenda 69 · K)
 * ============================================================================
 * Port de `components/BackgroundLayer.tsx` de la repo CORRECTA
 * (github.com/alexbordongarrigos/audiomorphic-ar) a una clase sin React.
 *
 * Es la capa que va DEBAJO de la espiral dentro de la propia app: 6 modos
 * (sólido · degradado · arcoíris líquido · burbujas de cristal · fundido
 * orgánico · colores mutantes) + viñeta. En el port de la Adenda 68·E no
 * existía: la sección «Fondo» del menú de ajustes no tenía a qué hablarle.
 *
 * ⚠️ En la **CAPA DE FONDO del OS** esta clase NO se monta: el fondo lo pone el
 * OS (Spline/WebGL/color/degradado…) y la espiral se compone encima con alfa
 * real. Si además pintara aquí su propio fondo, taparía el del OS — que es
 * exactamente el fantasma que se arregló en la Adenda 68·D.
 */

import type { AudioMetrics, VisualizerParams } from "./types";

interface Bubble {
    x: number;
    y: number;
    r: number;
    vx: number;
    vy: number;
    hue: number;
}

export class AudiomorphicBackground {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D | null;
    private time = 0;
    private width = 0;
    private height = 0;
    private bubbles: Bubble[] = [];

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d", { alpha: true });
    }

    resize(width: number, height: number): void {
        if (width <= 0 || height <= 0) return;
        this.canvas.width = Math.round(width);
        this.canvas.height = Math.round(height);
        this.canvas.style.width = `${width}px`;
        this.canvas.style.height = `${height}px`;
        this.width = width;
        this.height = height;

        // Las burbujas se siembran una vez, en el espacio real del lienzo.
        if (this.bubbles.length === 0) {
            this.bubbles = Array.from({ length: 30 }, () => ({
                x: Math.random() * width,
                y: Math.random() * height,
                r: Math.random() * 50 + 10,
                vx: (Math.random() - 0.5) * 2,
                vy: (Math.random() - 0.5) * 2,
                hue: Math.random() * 360,
            }));
        }
    }

    render(p: VisualizerParams, metrics: AudioMetrics): void {
        const ctx = this.ctx;
        if (!ctx || this.width <= 0 || this.height <= 0) return;

        const w = this.width;
        const h = this.height;
        this.time += 0.01 * p.bgSpeed * (p.bgAnimatable ? 1 : 0);
        const t = this.time;

        ctx.clearRect(0, 0, w, h);

        const bgColors = p.bgColors?.length ? p.bgColors : ["#000000", "#1a1a2e"];

        if (p.bgMode === "solid") {
            ctx.fillStyle = bgColors[0] || "#000000";
            ctx.fillRect(0, 0, w, h);
        } else if (p.bgMode === "gradient") {
            const grad = ctx.createLinearGradient(
                0, 0,
                p.bgAnimatable ? w * Math.cos(t) : w,
                p.bgAnimatable ? h * Math.sin(t) : h,
            );
            bgColors.forEach((color, i) => grad.addColorStop(i / Math.max(1, bgColors.length - 1), color));
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, h);
        } else if (p.bgMode === "liquid-rainbow") {
            for (let x = 0; x < w; x += 20) {
                for (let y = 0; y < h; y += 20) {
                    const hue = (x * 0.1 + y * 0.1 + t * 50 + metrics.volume * 100) % 360;
                    ctx.fillStyle = `hsl(${hue}, 80%, 20%)`;
                    ctx.fillRect(x, y, 20, 20);
                }
            }
        } else if (p.bgMode === "crystal-bubbles") {
            ctx.fillStyle = bgColors[0] || "#000000";
            ctx.fillRect(0, 0, w, h);

            for (const b of this.bubbles) {
                b.x += b.vx * (1 + metrics.volume * 5);
                b.y += b.vy * (1 + metrics.volume * 5);
                if (b.x < -b.r) b.x = w + b.r;
                if (b.x > w + b.r) b.x = -b.r;
                if (b.y < -b.r) b.y = h + b.r;
                if (b.y > h + b.r) b.y = -b.r;

                const grad = ctx.createRadialGradient(
                    b.x - b.r * 0.3, b.y - b.r * 0.3, Math.max(0, b.r * 0.1),
                    b.x, b.y, Math.max(0.01, b.r),
                );
                grad.addColorStop(0, `hsla(${b.hue + t * 50}, 80%, 80%, 0.8)`);
                grad.addColorStop(1, `hsla(${b.hue + t * 50}, 80%, 20%, 0.1)`);

                ctx.beginPath();
                ctx.arc(b.x, b.y, Math.max(0, b.r), 0, Math.PI * 2);
                ctx.fillStyle = grad;
                ctx.fill();

                ctx.beginPath();
                ctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, Math.max(0, b.r * 0.2), 0, Math.PI * 2);
                ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
                ctx.fill();
            }
        } else if (p.bgMode === "organic-fade") {
            const c1 = bgColors[0] || "#000000";
            const c2 = bgColors[1] || "#1a1a2e";
            const hex = (c: string, i: number) => parseInt(c.slice(i, i + 2), 16) || 0;
            const mix = (Math.sin(t) + 1) / 2;
            const r = Math.round(hex(c1, 1) * mix + hex(c2, 1) * (1 - mix));
            const g = Math.round(hex(c1, 3) * mix + hex(c2, 3) * (1 - mix));
            const b = Math.round(hex(c1, 5) * mix + hex(c2, 5) * (1 - mix));
            ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            ctx.fillRect(0, 0, w, h);
        } else if (p.bgMode === "morphing-colors") {
            const grad = ctx.createRadialGradient(
                w / 2 + Math.cos(t * 0.5) * w * 0.2, h / 2 + Math.sin(t * 0.7) * h * 0.2, 0,
                w / 2, h / 2, Math.max(w, h),
            );
            if (bgColors.length) {
                bgColors.forEach((color, i) => grad.addColorStop(i / Math.max(1, bgColors.length - 1), color));
            } else {
                grad.addColorStop(0, `hsl(${(t * 20) % 360}, 70%, 20%)`);
                grad.addColorStop(0.5, `hsl(${(t * 20 + 120) % 360}, 70%, 15%)`);
                grad.addColorStop(1, `hsl(${(t * 20 + 240) % 360}, 70%, 10%)`);
            }
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, h);
        }

        if (p.bgVignette) {
            const vignette = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) / 2);
            vignette.addColorStop(0, "rgba(0,0,0,0)");
            vignette.addColorStop(1, `rgba(0,0,0,${p.bgVignetteIntensity})`);
            ctx.fillStyle = vignette;
            ctx.fillRect(0, 0, w, h);
        }
    }
}
