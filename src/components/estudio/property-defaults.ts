"use client";

/*
 * property-defaults — el traductor HONESTO de `ElementOverride` a CSS real.
 * -----------------------------------------------------------------------
 * Dos capas, nunca se edita un componente base:
 *
 *  1) `overrideToWrapperVars(o)` — variables CSS ESCOPADAS a un contenedor
 *     que envuelve la vista previa. Como los componentes base (Button,
 *     Tabs, WidgetShell…) ya usan clases Tailwind compiladas que leen
 *     `hsl(var(--primary-hsl))` / `var(--radius)` / `var(--glass-blur)`,
 *     sobrescribir esas variables en un ancestro cercano cambia su render
 *     REAL sin tocar ni una línea de esos componentes ni el :root global.
 *
 *  2) `overrideToDirectStyle(o)` — propiedades CSS que los componentes base
 *     aplican hoy vía clases ESTÁTICAS (p.ej. Button usa `rounded-full`
 *     fijo, no `var(--radius)`), así que para esas SOLO un `style` inline
 *     en el nodo previsualizado gana por especificidad. Se usa `style`
 *     directo — nunca clases Tailwind arbitrarias generadas en runtime,
 *     porque Tailwind JIT solo genera CSS para clases que puede LEER como
 *     texto literal en el código fuente; un string interpolado como
 *     `shadow-[${x}]` no se compila y silenciosamente no hace nada.
 *
 * Todo devuelve `undefined`/omite propiedades cuando el usuario no ha
 * tocado ese control: el valor por defecto ES el aspecto real del sistema.
 */

import type { CSSProperties } from "react";
import type {
    AnimationOverride, EasingPreset, ElementOverride, HoverEffect, EntryEffect, ShadowLayer,
} from "./types";
import { makeId } from "./types";

/* ───────────────────────── Presets de curva / duración ───────────────────────── */

export const EASE_CSS: Record<EasingPreset, string> = {
    linear: "linear",
    ease: "ease",
    "ease-in-out": "ease-in-out",
    // --ease-glide ya existe en starseed-materials.css (barrido de .ss-metal);
    // el fallback garantiza que funcione aunque ese token no esté definido.
    glide: "var(--ease-glide, cubic-bezier(0.16, 1, 0.3, 1))",
    spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
};

export const EASE_LABEL: Record<EasingPreset, string> = {
    linear: "Lineal",
    ease: "Suave",
    "ease-in-out": "Entrada/salida",
    glide: "Deslizar (glide)",
    spring: "Rebote (spring)",
};

export const HOVER_LABEL: Record<HoverEffect, string> = {
    none: "Ninguno",
    sheen: "Destello (sheen)",
    lift: "Elevar",
    pulse: "Pulso",
    glow: "Resplandor",
};

export const ENTRY_LABEL: Record<EntryEffect, string> = {
    none: "Ninguna",
    fade: "Desvanecer",
    scale: "Escalar",
    slide: "Deslizar",
};

/** Valores que se MUESTRAN en los controles cuando el usuario aún no ha
 *  sobrescrito nada (no se escriben en el estado hasta que se tocan). */
export const DISPLAY_DEFAULTS = {
    radiusPx: 20,
    blurPx: 20,
    opacity: 1,
    border: { widthPx: 1, color: "rgba(255,255,255,0.16)", glow: 0 },
    typography: { sizePx: 14, weight: 500, trackingEm: 0 },
    padding: { xPx: 20, yPx: 10 },
    animation: { durationMs: 220, easing: "ease-in-out" as EasingPreset, hover: "lift" as HoverEffect, entry: "fade" as EntryEffect },
};

/** Los 6 slots de color con más impacto visual, en el vocabulario REAL de
 *  variables que el sistema ya consume (ver src/app/globals.css). */
export const COLOR_SLOTS: { key: string; label: string }[] = [
    { key: "primary-hsl", label: "Primario" },
    { key: "secondary-hsl", label: "Secundario" },
    { key: "accent-hsl", label: "Acento" },
    { key: "card-hsl", label: "Tarjeta / fondo" },
    { key: "border-hsl", label: "Borde" },
    { key: "destructive-hsl", label: "Destructivo" },
];

export function defaultOverride(): ElementOverride {
    return { tokens: { vars: {} } };
}

export function cloneOverride(o: ElementOverride): ElementOverride {
    return JSON.parse(JSON.stringify(o)) as ElementOverride;
}

/* ───────────────────────── Mutadores inmutables ───────────────────────── */

export function setToken(o: ElementOverride, key: string, value: string): ElementOverride {
    return { ...o, tokens: { ...o.tokens, vars: { ...o.tokens.vars, [key]: value } } };
}

export function removeToken(o: ElementOverride, key: string): ElementOverride {
    const vars = { ...o.tokens.vars };
    delete vars[key];
    return { ...o, tokens: { ...o.tokens, vars } };
}

export function addShadowLayer(o: ElementOverride): ElementOverride {
    const layer: ShadowLayer = { id: makeId("shadow"), x: 0, y: 12, blur: 30, spread: -10, color: "rgba(0,0,0,0.35)" };
    return { ...o, shadow: [...(o.shadow ?? []), layer] };
}

export function updateShadowLayer(o: ElementOverride, id: string, patch: Partial<ShadowLayer>): ElementOverride {
    return { ...o, shadow: (o.shadow ?? []).map((l) => (l.id === id ? { ...l, ...patch } : l)) };
}

export function removeShadowLayer(o: ElementOverride, id: string): ElementOverride {
    return { ...o, shadow: (o.shadow ?? []).filter((l) => l.id !== id) };
}

/* ───────────────────────── Traducción a CSS real ───────────────────────── */

export function shadowCss(layers: ShadowLayer[] | undefined): string | undefined {
    if (!layers || !layers.length) return undefined;
    return layers.map((l) => `${l.inset ? "inset " : ""}${l.x}px ${l.y}px ${l.blur}px ${l.spread}px ${l.color}`).join(", ");
}

/** Variables CSS a fijar en el CONTENEDOR envolvente (cascada real, jamás :root). */
export function overrideToWrapperVars(o: ElementOverride): CSSProperties {
    const style: Record<string, string> = {};
    for (const [k, v] of Object.entries(o.tokens.vars || {})) style[`--${k}`] = v;
    if (o.tokens.motion !== undefined) style["--ss-motion"] = String(o.tokens.motion);
    if (o.blurPx !== undefined) style["--glass-blur"] = `${o.blurPx}px`; // .ss-crystal* ya lee --glass-blur
    return style as CSSProperties;
}

/** Propiedades CSS a fijar DIRECTAMENTE en el nodo previsualizado (gana por
 *  especificidad sobre las clases estáticas del componente base). Solo
 *  incluye lo que el usuario ha tocado. */
export function overrideToDirectStyle(o: ElementOverride): CSSProperties {
    const s: Record<string, string | number> = {};

    if (o.radiusPx !== undefined) s.borderRadius = o.radiusPx;

    const shadow = shadowCss(o.shadow);
    if (shadow) s.boxShadow = shadow;

    if (o.border?.glow) {
        const glowShadow = `0 0 ${Math.round(28 * o.border.glow)}px rgba(var(--primary-rgb, 160, 43, 238), ${o.border.glow})`;
        s.boxShadow = shadow ? `${shadow}, ${glowShadow}` : glowShadow;
    }

    if (o.blurPx !== undefined) {
        s.backdropFilter = `blur(${o.blurPx}px)`;
        s.WebkitBackdropFilter = `blur(${o.blurPx}px)`;
    }

    if (o.opacity !== undefined) s.opacity = o.opacity;

    if (o.border?.widthPx !== undefined || o.border?.color !== undefined) {
        s.borderWidth = o.border?.widthPx ?? DISPLAY_DEFAULTS.border.widthPx;
        s.borderStyle = "solid";
        s.borderColor = o.border?.color ?? DISPLAY_DEFAULTS.border.color;
    }

    if (o.typography?.sizePx !== undefined) s.fontSize = o.typography.sizePx;
    if (o.typography?.weight !== undefined) s.fontWeight = o.typography.weight;
    if (o.typography?.trackingEm !== undefined) s.letterSpacing = `${o.typography.trackingEm}em`;

    if (o.padding?.xPx !== undefined) { s.paddingLeft = o.padding.xPx; s.paddingRight = o.padding.xPx; }
    if (o.padding?.yPx !== undefined) { s.paddingTop = o.padding.yPx; s.paddingBottom = o.padding.yPx; }

    const dur = o.animation?.durationMs;
    const ease = o.animation?.easing;
    if (dur !== undefined || ease !== undefined) {
        s.transitionProperty = "color, background-color, border-color, box-shadow, transform, opacity, backdrop-filter";
        s.transitionDuration = `${dur ?? DISPLAY_DEFAULTS.animation.durationMs}ms`;
        s.transitionTimingFunction = EASE_CSS[ease ?? DISPLAY_DEFAULTS.animation.easing];
    }

    return s as CSSProperties;
}

/** Clases ESTÁTICAS (strings fijos, seguras para Tailwind JIT) para el efecto
 *  hover elegido. `sheen` reutiliza el destello YA existente en
 *  starseed-materials.css (pensado para superficies .ss-crystal*). */
export function hoverClassName(hover: HoverEffect | undefined): string {
    switch (hover) {
        case "lift": return "hover:-translate-y-1 hover:brightness-110";
        case "pulse": return "ss-estudio-hover-pulse";
        case "sheen": return "ss-crystal-sheen";
        case "glow": return "hover:shadow-[0_0_32px_rgba(160,43,238,0.55)]";
        default: return "";
    }
}

/** Variantes framer-motion para la animación de ENTRADA (fade/scale/slide). */
export const ENTRY_MOTION: Record<EntryEffect, { initial: Record<string, number>; animate: Record<string, number> }> = {
    none: { initial: {}, animate: {} },
    fade: { initial: { opacity: 0 }, animate: { opacity: 1 } },
    scale: { initial: { opacity: 0, scale: 0.85 }, animate: { opacity: 1, scale: 1 } },
    slide: { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 } },
};

/* ───────────────────────── Diff (panel de Aurora) ───────────────────────── */

export interface TokenDiffEntry { key: string; before?: string; after?: string }
export interface TokenDiff { added: TokenDiffEntry[]; changed: TokenDiffEntry[]; removed: TokenDiffEntry[] }

export function diffVars(before: Record<string, string>, after: Record<string, string>): TokenDiff {
    const added: TokenDiffEntry[] = [];
    const changed: TokenDiffEntry[] = [];
    const removed: TokenDiffEntry[] = [];
    for (const [k, v] of Object.entries(after)) {
        if (!(k in before)) added.push({ key: k, after: v });
        else if (before[k] !== v) changed.push({ key: k, before: before[k], after: v });
    }
    for (const [k, v] of Object.entries(before)) {
        if (!(k in after)) removed.push({ key: k, before: v });
    }
    return { added, changed, removed };
}

export function isDiffEmpty(d: TokenDiff): boolean {
    return d.added.length === 0 && d.changed.length === 0 && d.removed.length === 0;
}

/* ───────────────────────── Parseo tolerante de Aurora ───────────────────────── */

const KNOWN_EASINGS: EasingPreset[] = ["linear", "ease", "ease-in-out", "glide", "spring"];
const KNOWN_HOVERS: HoverEffect[] = ["none", "sheen", "lift", "pulse", "glow"];
const KNOWN_ENTRIES: EntryEffect[] = ["none", "fade", "scale", "slide"];

function num(v: unknown): number | undefined {
    return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
function str(v: unknown): string | undefined {
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** Whitelist estricta: solo copia claves/formas conocidas de un objeto NO
 *  fiable (respuesta de un LLM). Nunca lanza, nunca copia campos extra. */
export function sanitizeOverridePatch(raw: unknown): Partial<ElementOverride> & { name?: string } {
    const out: Partial<ElementOverride> & { name?: string } = {};
    if (!raw || typeof raw !== "object") return out;
    const r = raw as Record<string, unknown>;

    if (typeof r.name === "string") out.name = r.name;

    if (r.vars && typeof r.vars === "object") {
        const vars: Record<string, string> = {};
        for (const [k, v] of Object.entries(r.vars as Record<string, unknown>)) {
            if (typeof k === "string" && typeof v === "string" && k.length < 64 && v.length < 256) vars[k] = v;
        }
        out.tokens = { vars };
        if (typeof r.materialClass === "string") out.tokens.materialClass = r.materialClass;
        if (typeof r.motion === "number") out.tokens.motion = r.motion;
    } else if (typeof r.materialClass === "string" || typeof r.motion === "number") {
        out.tokens = { vars: {} };
        if (typeof r.materialClass === "string") out.tokens.materialClass = r.materialClass;
        if (typeof r.motion === "number") out.tokens.motion = r.motion;
    }

    if (num(r.radiusPx) !== undefined) out.radiusPx = num(r.radiusPx);
    if (num(r.blurPx) !== undefined) out.blurPx = num(r.blurPx);
    if (num(r.opacity) !== undefined) out.opacity = Math.max(0, Math.min(1, num(r.opacity)!));

    if (r.border && typeof r.border === "object") {
        const b = r.border as Record<string, unknown>;
        out.border = {
            widthPx: num(b.widthPx),
            color: str(b.color),
            glow: num(b.glow) !== undefined ? Math.max(0, Math.min(1, num(b.glow)!)) : undefined,
        };
    }

    if (r.typography && typeof r.typography === "object") {
        const t = r.typography as Record<string, unknown>;
        out.typography = { sizePx: num(t.sizePx), weight: num(t.weight), trackingEm: num(t.trackingEm) };
    }

    if (r.padding && typeof r.padding === "object") {
        const p = r.padding as Record<string, unknown>;
        out.padding = { xPx: num(p.xPx), yPx: num(p.yPx) };
    }

    if (r.animation && typeof r.animation === "object") {
        const a = r.animation as Record<string, unknown>;
        const easing = str(a.easing) as EasingPreset | undefined;
        const hover = str(a.hover) as HoverEffect | undefined;
        const entry = str(a.entry) as EntryEffect | undefined;
        out.animation = {
            durationMs: num(a.durationMs),
            easing: easing && KNOWN_EASINGS.includes(easing) ? easing : undefined,
            hover: hover && KNOWN_HOVERS.includes(hover) ? hover : undefined,
            entry: entry && KNOWN_ENTRIES.includes(entry) ? entry : undefined,
        };
    }

    if (Array.isArray(r.shadow)) {
        out.shadow = (r.shadow as unknown[]).slice(0, 6).map((raw2) => {
            const l = (raw2 && typeof raw2 === "object" ? raw2 : {}) as Record<string, unknown>;
            return {
                id: makeId("shadow"),
                x: num(l.x) ?? 0,
                y: num(l.y) ?? 8,
                blur: num(l.blur) ?? 20,
                spread: num(l.spread) ?? -6,
                color: str(l.color) ?? "rgba(0,0,0,0.3)",
            } satisfies ShadowLayer;
        });
    }

    return out;
}

/** Fusiona un patch saneado sobre el override actual (merge superficial por grupo). */
export function mergeOverride(base: ElementOverride, patch: Partial<ElementOverride>): ElementOverride {
    return {
        ...base,
        ...patch,
        tokens: patch.tokens ? { ...base.tokens, ...patch.tokens, vars: { ...base.tokens.vars, ...patch.tokens.vars } } : base.tokens,
        border: patch.border ? { ...base.border, ...patch.border } : base.border,
        typography: patch.typography ? { ...base.typography, ...patch.typography } : base.typography,
        padding: patch.padding ? { ...base.padding, ...patch.padding } : base.padding,
        animation: patch.animation ? { ...base.animation, ...patch.animation } : base.animation,
        shadow: patch.shadow ?? base.shadow,
    };
}
