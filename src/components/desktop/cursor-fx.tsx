'use client';

// ════════════════════════════════════════════════════════════════
// StarSeed OS — Cursor FX (cursor personalizado + animaciones de clic)
// ----------------------------------------------------------------
// <CursorFxHost/>          → aplica el cursor elegido (CSS data-uri) y
//                            pinta las animaciones de clic en una capa
//                            fixed pointer-events-none.
// <CursorSettingsPanel/>   → panel de configuración (glass) reutilizable.
//
// Config persistida en localStorage 'starseed.cursorfx.v1' (SSR-safe,
// useSyncExternalStore). Respeta prefers-reduced-motion: si el usuario
// pide menos movimiento, NO se pintan animaciones de clic.
// Los ids coinciden con desktop-listings.ts (publicables en la Librería).
// ════════════════════════════════════════════════════════════════

import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { MousePointer2, MousePointerClick, Accessibility } from "lucide-react";
import { cn } from "@/lib/utils";
import { CURSOR_LISTINGS, GESTURE_ANIMATION_LISTINGS } from "./desktop-listings";

// ── Config + store mínimo ────────────────────────────────────────
export type CursorOption = "system" | "starseed-triangle" | "orb";
export type ClickFxOption = "none" | "liquid-ripple" | "star-burst" | "neon-bubble";

export interface CursorFxConfig {
    cursor: CursorOption;
    click: ClickFxOption;
}

const LS_KEY = "starseed.cursorfx.v1";
const FX_EVENT = "starseed:cursorfx";
const DEFAULT_CONFIG: CursorFxConfig = { cursor: "system", click: "liquid-ripple" };

function isClient(): boolean {
    return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

let cfgCache: { raw: string; value: CursorFxConfig } = { raw: "", value: DEFAULT_CONFIG };

function readConfig(): CursorFxConfig {
    if (!isClient()) return DEFAULT_CONFIG;
    let raw = "";
    try {
        raw = localStorage.getItem(LS_KEY) ?? "";
    } catch {
        raw = "";
    }
    if (raw === cfgCache.raw) return cfgCache.value;
    let value = DEFAULT_CONFIG;
    if (raw) {
        try {
            const p = JSON.parse(raw) as Partial<CursorFxConfig>;
            const cursor: CursorOption =
                p.cursor === "starseed-triangle" || p.cursor === "orb" ? p.cursor : "system";
            const click: ClickFxOption =
                p.click === "none" || p.click === "star-burst" || p.click === "neon-bubble" || p.click === "liquid-ripple"
                    ? p.click
                    : DEFAULT_CONFIG.click;
            value = { cursor, click };
        } catch {
            value = DEFAULT_CONFIG;
        }
    }
    cfgCache = { raw, value };
    return value;
}

export function setCursorFxConfig(patch: Partial<CursorFxConfig>): void {
    if (!isClient()) return;
    const next = { ...readConfig(), ...patch };
    try {
        localStorage.setItem(LS_KEY, JSON.stringify(next));
    } catch { /* noop */ }
    try {
        window.dispatchEvent(new Event(FX_EVENT));
    } catch { /* noop */ }
}

function subscribeConfig(cb: () => void): () => void {
    if (!isClient()) return () => { };
    const onStorage = (e: StorageEvent) => {
        if (e.key === LS_KEY || e.key === null) cb();
    };
    window.addEventListener(FX_EVENT, cb);
    window.addEventListener("storage", onStorage);
    return () => {
        window.removeEventListener(FX_EVENT, cb);
        window.removeEventListener("storage", onStorage);
    };
}

export function useCursorFxConfig(): CursorFxConfig {
    return useSyncExternalStore(subscribeConfig, readConfig, () => DEFAULT_CONFIG);
}

// ── Cursores SVG (data-uri) ──────────────────────────────────────
function svgUri(svg: string): string {
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Triángulo StarSeed: punta afilada, cristal oscuro, borde neón azur→violeta. */
const TRIANGLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#66E3FF"/><stop offset="0.55" stop-color="#007FFF"/><stop offset="1" stop-color="#7C3AED"/></linearGradient></defs><path d="M3.5 1.5 L24.5 13.2 L13.4 16.3 L8.8 26.5 Z" fill="rgba(8,12,24,0.92)" stroke="url(#g)" stroke-width="1.5" stroke-linejoin="round"/><path d="M7 6 L17.6 12.3 L11.9 13.9 L9.5 19 Z" fill="url(#g)" opacity="0.4"/><circle cx="5.2" cy="3.4" r="1" fill="#BFF3FF" opacity="0.9"/></svg>`;

/** Orbe mini: esfera de luz líquida con brillo interior. */
const ORB_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><defs><radialGradient id="o" cx="0.35" cy="0.3" r="0.85"><stop offset="0" stop-color="#EAF6FF" stop-opacity="0.95"/><stop offset="0.45" stop-color="#3FB6FF" stop-opacity="0.85"/><stop offset="1" stop-color="#6D28D9" stop-opacity="0.9"/></radialGradient></defs><circle cx="10" cy="10" r="8.2" fill="url(#o)" stroke="rgba(255,255,255,0.75)" stroke-width="1"/><circle cx="7.2" cy="6.4" r="2.3" fill="rgba(255,255,255,0.55)"/></svg>`;

export const CURSOR_PREVIEW_URI: Record<Exclude<CursorOption, "system">, string> = {
    "starseed-triangle": svgUri(TRIANGLE_SVG),
    orb: svgUri(ORB_SVG),
};

function cursorCssValue(cursor: CursorOption): string | null {
    if (cursor === "starseed-triangle") return `url("${CURSOR_PREVIEW_URI["starseed-triangle"]}") 3 2, auto`;
    if (cursor === "orb") return `url("${CURSOR_PREVIEW_URI.orb}") 10 10, auto`;
    return null;
}

// ── Preferencia de movimiento reducido (viva) ────────────────────
export function useReducedMotionPref(): boolean {
    const [reduced, setReduced] = useState(false);
    useEffect(() => {
        if (typeof window === "undefined" || !window.matchMedia) return;
        const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
        const update = () => setReduced(mq.matches);
        update();
        try {
            mq.addEventListener("change", update);
            return () => mq.removeEventListener("change", update);
        } catch {
            // Safari antiguo
            mq.addListener(update);
            return () => mq.removeListener(update);
        }
    }, []);
    return reduced;
}

// ── Host: cursor + capa de efectos de clic ───────────────────────
interface ClickEffect {
    id: number;
    x: number;
    y: number;
    kind: Exclude<ClickFxOption, "none">;
}

const MAX_EFFECTS = 24;
const EFFECT_TTL: Record<Exclude<ClickFxOption, "none">, number> = {
    "liquid-ripple": 750,
    "star-burst": 700,
    "neon-bubble": 850,
};

// Un solo host activo aunque se monte dos veces (página + orquestador global futuro).
let hostActive = false;

export function CursorFxHost(): React.ReactElement | null {
    const cfg = useCursorFxConfig();
    const reduced = useReducedMotionPref();
    const [effects, setEffects] = useState<ClickEffect[]>([]);
    const idRef = useRef(0);
    const [mounted, setMounted] = useState(false);
    
    useEffect(() => {
        setMounted(true);
    }, []);

    const [isPrimary] = useState<boolean>(() => {
        if (typeof window === "undefined") return false;
        if (hostActive) return false;
        hostActive = true;
        return true;
    });

    useEffect(() => {
        if (!isPrimary) return;
        return () => {
            hostActive = false;
        };
    }, [isPrimary]);

    // Cursor personalizado: hoja de estilo global (opt-in, reversible).
    useEffect(() => {
        if (!isPrimary || typeof document === "undefined") return;
        const value = cursorCssValue(cfg.cursor);
        const STYLE_ID = "starseed-cursorfx-style";
        const prevEl = document.getElementById(STYLE_ID);
        if (prevEl) prevEl.remove();
        if (!value) return;
        const el = document.createElement("style");
        el.id = STYLE_ID;
        el.textContent = [
            `*, *::before, *::after { cursor: ${value} !important; }`,
            // Los campos de texto conservan el caret para no perder usabilidad.
            `input:not([type="range"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]), textarea, [contenteditable="true"] { cursor: text !important; }`,
        ].join("\n");
        document.head.appendChild(el);
        return () => {
            try {
                document.getElementById(STYLE_ID)?.remove();
            } catch { /* noop */ }
        };
    }, [cfg.cursor, isPrimary]);

    // Animación de clic: escucha global de pointerdown → pinta en la capa.
    useEffect(() => {
        if (!isPrimary || typeof window === "undefined") return;
        if (cfg.click === "none" || reduced) return;
        const kind = cfg.click;
        const onDown = (e: PointerEvent) => {
            // Solo interacciones principales (botón izq. / toque / stylus).
            if (e.button !== 0 && e.pointerType === "mouse") return;
            const id = ++idRef.current;
            setEffects((list) => {
                const next = [...list, { id, x: e.clientX, y: e.clientY, kind }];
                return next.length > MAX_EFFECTS ? next.slice(next.length - MAX_EFFECTS) : next;
            });
            window.setTimeout(() => {
                setEffects((list) => list.filter((fx) => fx.id !== id));
            }, EFFECT_TTL[kind] + 80);
        };
        window.addEventListener("pointerdown", onDown, { capture: true, passive: true });
        return () => window.removeEventListener("pointerdown", onDown, { capture: true } as EventListenerOptions);
    }, [cfg.click, reduced, isPrimary]);

    if (!mounted || !isPrimary) return null;

    return (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-[200] overflow-hidden">
            <style>{CLICK_FX_CSS}</style>
            {effects.map((fx) => (
                <ClickFxNode key={fx.id} fx={fx} />
            ))}
        </div>
    );
}

function ClickFxNode({ fx }: { fx: ClickEffect }): React.ReactElement {
    const base: React.CSSProperties = { position: "absolute", left: fx.x, top: fx.y };
    if (fx.kind === "liquid-ripple") {
        return (
            <span style={base}>
                <span className="ss-cfx-ring" style={{ borderColor: "rgba(255,255,255,0.85)" }} />
                <span className="ss-cfx-ring" style={{ borderColor: "rgba(102,227,255,0.8)", animationDelay: "90ms", width: 18, height: 18 }} />
                <span className="ss-cfx-ring" style={{ borderColor: "rgba(0,127,255,0.55)", animationDelay: "170ms", width: 26, height: 26 }} />
            </span>
        );
    }
    if (fx.kind === "star-burst") {
        const sparks = [
            { dx: "0px", dy: "-30px" },
            { dx: "30px", dy: "0px" },
            { dx: "0px", dy: "30px" },
            { dx: "-30px", dy: "0px" },
        ];
        return (
            <span style={base}>
                <svg className="ss-cfx-star" width="34" height="34" viewBox="0 0 24 24">
                    <defs>
                        <linearGradient id={`ssg-${fx.id}`} x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0" stopColor="#FFFFFF" />
                            <stop offset="0.6" stopColor="#66E3FF" />
                            <stop offset="1" stopColor="#FFBF00" />
                        </linearGradient>
                    </defs>
                    <path
                        d="M12 0 C13 8 16 11 24 12 C16 13 13 16 12 24 C11 16 8 13 0 12 C8 11 11 8 12 0 Z"
                        fill={`url(#ssg-${fx.id})`}
                    />
                </svg>
                {sparks.map((s, i) => (
                    <span
                        key={i}
                        className="ss-cfx-spark"
                        style={{ ["--dx" as string]: s.dx, ["--dy" as string]: s.dy, animationDelay: `${i * 20}ms` }}
                    />
                ))}
            </span>
        );
    }
    // neon-bubble
    return (
        <span style={base}>
            <span className="ss-cfx-bubble" />
        </span>
    );
}

const CLICK_FX_CSS = `
.ss-cfx-ring{
  position:absolute; left:0; top:0; width:12px; height:12px; border-radius:9999px;
  border:2px solid rgba(255,255,255,.85);
  transform:translate(-50%,-50%) scale(.3); opacity:.9;
  box-shadow:0 0 12px rgba(102,227,255,.45);
  animation:ss-cfx-ripple .72s cubic-bezier(.22,.85,.35,1) forwards;
}
@keyframes ss-cfx-ripple{
  from{transform:translate(-50%,-50%) scale(.3);opacity:.9}
  60%{opacity:.5}
  to{transform:translate(-50%,-50%) scale(2.8);opacity:0}
}
.ss-cfx-star{
  position:absolute; left:0; top:0;
  transform:translate(-50%,-50%) scale(.3); opacity:0;
  filter:drop-shadow(0 0 8px rgba(102,227,255,.8));
  animation:ss-cfx-starburst .68s cubic-bezier(.2,.9,.3,1) forwards;
}
@keyframes ss-cfx-starburst{
  0%{transform:translate(-50%,-50%) scale(.3) rotate(0deg);opacity:0}
  22%{opacity:1}
  60%{transform:translate(-50%,-50%) scale(1.12) rotate(14deg);opacity:.95}
  100%{transform:translate(-50%,-50%) scale(.8) rotate(22deg);opacity:0}
}
.ss-cfx-spark{
  position:absolute; left:0; top:0; width:4px; height:4px; border-radius:9999px;
  background:linear-gradient(135deg,#FFFFFF,#66E3FF);
  transform:translate(-50%,-50%); opacity:.95;
  box-shadow:0 0 6px rgba(102,227,255,.9);
  animation:ss-cfx-spark .55s ease-out forwards;
}
@keyframes ss-cfx-spark{
  from{transform:translate(-50%,-50%) scale(1);opacity:.95}
  to{transform:translate(calc(-50% + var(--dx)),calc(-50% + var(--dy))) scale(.35);opacity:0}
}
.ss-cfx-bubble{
  position:absolute; left:0; top:0; width:22px; height:22px; border-radius:9999px;
  border:2px solid rgba(57,255,20,.85);
  background:radial-gradient(circle at 32% 28%, rgba(255,255,255,.5), rgba(34,211,238,.12) 55%, rgba(168,85,247,.14));
  transform:translate(-50%,-50%) scale(.35); opacity:.95;
  box-shadow:0 0 14px rgba(57,255,20,.35), inset 0 0 8px rgba(255,255,255,.25);
  animation:ss-cfx-bubble .82s cubic-bezier(.3,.7,.4,1) forwards;
}
@keyframes ss-cfx-bubble{
  0%{transform:translate(-50%,-50%) scale(.35);opacity:.95}
  45%{transform:translate(-50%,calc(-50% - 12px)) scale(1.06,.92);opacity:.9}
  75%{transform:translate(-50%,calc(-50% - 22px)) scale(.94,1.08);opacity:.75}
  100%{transform:translate(-50%,calc(-50% - 32px)) scale(1.35);opacity:0}
}
`;

// ── Panel de ajustes (reutilizable desde la barra del escritorio) ─
export function CursorSettingsPanel({ className }: { className?: string }): React.ReactElement {
    const cfg = useCursorFxConfig();
    const reduced = useReducedMotionPref();

    return (
        <div className={cn("space-y-5", className)}>
            <section className="space-y-2">
                <h4 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                    <MousePointer2 className="size-3.5" /> Cursor
                </h4>
                <div className="grid grid-cols-3 gap-2">
                    {CURSOR_LISTINGS.map((c) => {
                        const selected = cfg.cursor === c.id;
                        const uri = c.id === "starseed-triangle" || c.id === "orb"
                            ? CURSOR_PREVIEW_URI[c.id]
                            : null;
                        return (
                            <button
                                key={c.id}
                                type="button"
                                onClick={() => setCursorFxConfig({ cursor: c.id as CursorOption })}
                                title={c.descripcion}
                                className={cn(
                                    "group flex flex-col items-center gap-1.5 rounded-2xl border p-3 transition-all duration-200 cursor-pointer",
                                    selected
                                        ? "border-sky-400/60 bg-sky-400/10 shadow-[0_0_18px_rgba(56,189,248,0.25)]"
                                        : "border-white/10 bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/20",
                                )}
                            >
                                <span className="grid size-10 place-items-center rounded-xl border border-white/10 bg-black/30">
                                    {uri ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={uri} alt="" className="size-6" draggable={false} />
                                    ) : (
                                        <MousePointer2 className="size-5 text-white/80" />
                                    )}
                                </span>
                                <span className="text-[11px] font-bold leading-tight text-center">{c.nombre}</span>
                            </button>
                        );
                    })}
                </div>
            </section>

            <section className="space-y-2">
                <h4 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                    <MousePointerClick className="size-3.5" /> Animación de clic
                </h4>
                <div className="grid grid-cols-2 gap-2">
                    {GESTURE_ANIMATION_LISTINGS.map((g) => {
                        const selected = cfg.click === g.id;
                        return (
                            <button
                                key={g.id}
                                type="button"
                                onClick={() => setCursorFxConfig({ click: g.id as ClickFxOption })}
                                title={g.descripcion}
                                className={cn(
                                    "flex items-center gap-2.5 rounded-2xl border p-2.5 text-left transition-all duration-200 cursor-pointer",
                                    selected
                                        ? "border-emerald-400/50 bg-emerald-400/10 shadow-[0_0_18px_rgba(52,211,153,0.2)]"
                                        : "border-white/10 bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/20",
                                )}
                            >
                                <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-black/30 text-base">
                                    {g.preview}
                                </span>
                                <span className="min-w-0">
                                    <span className="block truncate text-[11px] font-bold">{g.nombre}</span>
                                    <span className="mt-0.5 flex gap-1">
                                        {g.paleta.slice(0, 3).map((p) => (
                                            <span key={p} className="size-1.5 rounded-full" style={{ background: p }} />
                                        ))}
                                    </span>
                                </span>
                            </button>
                        );
                    })}
                </div>
            </section>

            <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2.5 text-center">
                <p className="text-[11px] text-muted-foreground">
                    Haz clic en cualquier parte para probar la animación.
                </p>
                {reduced && (
                    <p className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-300/90">
                        <Accessibility className="size-3.5" />
                        Movimiento reducido activo: las animaciones de clic se pausan.
                    </p>
                )}
            </div>
        </div>
    );
}
