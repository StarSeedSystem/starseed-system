"use client";

/*
 * color-utils — conversión HEX ⇄ "H S% L%" (el formato EXACTO en el que
 * StarSeed OS guarda sus variables de color semánticas: --primary-hsl,
 * --secondary-hsl, --card-hsl… ver src/app/globals.css). Los pickers nativos
 * (<input type="color">) trabajan en HEX; el sistema trabaja en triples HSL
 * sin la función hsl() alrededor — estas funciones tienden el puente.
 * Puras, tolerantes: ante una entrada inválida devuelven un valor neutro en
 * vez de lanzar.
 */

export function hexToHslTriplet(hex: string): string {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec((hex || "").trim());
    if (!m) return "0 0% 50%";
    const r = parseInt(m[1], 16) / 255;
    const g = parseInt(m[2], 16) / 255;
    const b = parseInt(m[3], 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;
    const d = max - min;
    if (d !== 0) {
        s = d / (1 - Math.abs(2 * l - 1));
        switch (max) {
            case r: h = ((g - b) / d) % 6; break;
            case g: h = (b - r) / d + 2; break;
            default: h = (r - g) / d + 4;
        }
        h *= 60;
        if (h < 0) h += 360;
    }
    return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function hslTripletToHex(triplet: string): string {
    const m = /(-?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%/.exec(triplet || "");
    if (!m) return "#8850ee";
    const h = (((Number(m[1]) % 360) + 360) % 360) / 360;
    const s = Number(m[2]) / 100;
    const l = Number(m[3]) / 100;
    if (s === 0) {
        const v = Math.round(l * 255);
        const hex = v.toString(16).padStart(2, "0");
        return `#${hex}${hex}${hex}`;
    }
    const hue2rgb = (p: number, q: number, t: number) => {
        let tt = t;
        if (tt < 0) tt += 1;
        if (tt > 1) tt -= 1;
        if (tt < 1 / 6) return p + (q - p) * 6 * tt;
        if (tt < 1 / 2) return q;
        if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
        return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const r = hue2rgb(p, q, h + 1 / 3);
    const g = hue2rgb(p, q, h);
    const b = hue2rgb(p, q, h - 1 / 3);
    const toHex = (x: number) => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Deriva el triple "r, g, b" (decimal, sin espacios extra) desde un HSL — para
 *  variables companion tipo --primary-rgb usadas en glows `rgba(var(--x-rgb),a)`. */
export function hslTripletToRgbTriplet(triplet: string): string {
    const hex = hslTripletToHex(triplet);
    const m = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return "160, 43, 238";
    return `${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}`;
}

/** Aplica un giro de matiz (grados) a un triple HSL — usado por el mapeo
 *  "honesto" de tinte de materiales (ss-metal/ss-wood no exponen su color
 *  base como variable, así que el tinte se aproxima con filter:hue-rotate). */
export function clampPct(n: number): number {
    return Math.max(0, Math.min(100, Math.round(n)));
}
