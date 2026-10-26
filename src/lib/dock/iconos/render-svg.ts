/**
 * Dibujo de un diseño de icono como SVG (Ola 1025U · V1b) — puro, sin React ni DOM.
 *
 * La TESELA (forma + fondo + borde + brillo) se dibuja aquí como un SVG propio de 100×100 y el dock la
 * pinta con `<img src="data:image/svg+xml…">`: el mismo dibujo se exporta como archivo y se ve igual en
 * el dock, en la vista previa y en la galería. El GLIFO va encima (Lucide como componente; un SVG
 * saneado o una imagen como `<img>`); para exportar un SVG autosuficiente, `disenoASvg` lo integra.
 *
 * Todo lo que se escribe aquí sale de valores YA validados (colores hexadecimales, números acotados,
 * SVG del saneador, imagen `data:` de mapa de bits): ninguna cadena del usuario llega sin pasar por
 * `normalizarDiseno`. Aun así, los colores y números se vuelven a comprobar al escribir.
 */

import { colorearSvg, sanearSvg, svgADataUrl } from "./sanear-svg";
import { esColorHex, normalizarColor, type DisenoIcono, type FormaIcono } from "./modelo";

/* ─────────────────────────── Formas (lienzo 100×100, margen de 3) ─────────────────────────── */

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Polígono con las esquinas redondeadas con curvas de Bézier cuadráticas. */
function poligonoRedondeado(pts: ReadonlyArray<readonly [number, number]>, radio: number): string {
    const n = pts.length;
    let d = "";
    for (let i = 0; i < n; i++) {
        const prev = pts[(i + n - 1) % n];
        const cur = pts[i];
        const next = pts[(i + 1) % n];
        const mover = (a: readonly [number, number], b: readonly [number, number]) => {
            const dx = a[0] - b[0];
            const dy = a[1] - b[1];
            const len = Math.hypot(dx, dy) || 1;
            const t = Math.min(radio, len / 2) / len;
            return [b[0] + dx * t, b[1] + dy * t] as const;
        };
        const entrada = mover(prev, cur);
        const salida = mover(next, cur);
        d += `${i === 0 ? "M" : "L"}${r2(entrada[0])} ${r2(entrada[1])}Q${r2(cur[0])} ${r2(cur[1])} ${r2(salida[0])} ${r2(salida[1])}`;
    }
    return d + "Z";
}

function hexagono(): string {
    const pts: Array<[number, number]> = [];
    for (let k = 0; k < 6; k++) {
        const a = ((-90 + 60 * k) * Math.PI) / 180;
        pts.push([50 + 47 * Math.cos(a), 50 + 47 * Math.sin(a)]);
    }
    return poligonoRedondeado(pts, 9);
}

/** Círculo festoneado de seis pétalos: la flor de la vida en una silueta. */
function flor(): string {
    const lobulos = 6;
    const R = 40;
    const pts = Array.from({ length: lobulos }, (_, k) => {
        const a = ((-90 + (360 / lobulos) * k) * Math.PI) / 180;
        return [50 + R * Math.cos(a), 50 + R * Math.sin(a)] as const;
    });
    const cuerda = 2 * R * Math.sin(Math.PI / lobulos);
    const rArco = r2(cuerda * 0.62);
    let d = `M${r2(pts[0][0])} ${r2(pts[0][1])}`;
    for (let k = 1; k <= lobulos; k++) {
        const p = pts[k % lobulos];
        d += `A${rArco} ${rArco} 0 0 1 ${r2(p[0])} ${r2(p[1])}`;
    }
    return d + "Z";
}

const RUTAS: Record<FormaIcono, () => string> = {
    circulo: () => "M50 3a47 47 0 1 1 0 94a47 47 0 1 1 0-94Z",
    "cuadrado-suave": () => "M29 3H71A26 26 0 0 1 97 29V71A26 26 0 0 1 71 97H29A26 26 0 0 1 3 71V29A26 26 0 0 1 29 3Z",
    gota: () => "M50 3C50 3 85 36 85 62A35 35 0 0 1 15 62C15 36 50 3 50 3Z",
    hexagono,
    flor,
    rombo: () => poligonoRedondeado([[50, 3], [97, 50], [50, 97], [3, 50]], 11),
    escudo: () => poligonoRedondeado([[50, 3], [90, 16], [90, 52], [50, 97], [10, 52], [10, 16]], 14),
};

const CACHE_RUTAS = new Map<FormaIcono, string>();

/** El trazado de una forma en un lienzo de 100×100. */
export function rutaForma(forma: FormaIcono): string {
    let r = CACHE_RUTAS.get(forma);
    if (!r) {
        r = (RUTAS[forma] ?? RUTAS.circulo)();
        CACHE_RUTAS.set(forma, r);
    }
    return r;
}

/* ─────────────────────────── Tesela ─────────────────────────── */

const n3 = (n: number) => String(Math.round(n * 1000) / 1000);
const hex = (c: string, respaldo = "#ffffff") => normalizarColor(c, respaldo);

/** Color #rrggbb(aa) → [#rrggbb, alfa 0..1]. */
function separarAlfa(c: string): [string, number] {
    const v = hex(c);
    return v.length === 9 ? [v.slice(0, 7), parseInt(v.slice(7), 16) / 255] : [v, 1];
}

export interface OpcionesTesela {
    /** Anchura/altura en px del `<svg>` (por defecto 100). */
    lado?: number;
}

/**
 * Sufijo de los `id` internos (clipPath y degradados). Depende solo del dibujo, así que es estable, y hace
 * que dos teselas distintas no compartan `id` si se incrustan en un mismo documento (un SVG exportado y
 * pegado en una página, una hoja de muestras): con `id` iguales, todas tomarían los colores de la primera.
 */
function sufijoDeIds(d: DisenoIcono): string {
    const texto = JSON.stringify([d.forma, d.fondo, d.brillo, d.borde ?? null]);
    let h = 0x811c9dc5;
    for (let i = 0; i < texto.length; i++) {
        h ^= texto.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
}

/**
 * La tesela del diseño: SVG autosuficiente de 100×100 sin glifo. El interior se puede reutilizar para
 * componer el icono entero (`disenoASvg`).
 */
export function interiorTesela(d: DisenoIcono): string {
    const ruta = rutaForma(d.forma);
    const u = sufijoDeIds(d);
    const defs: string[] = d.fondo.tipo === "ninguno" ? [] : [`<clipPath id="ss-f-${u}"><path d="${ruta}"/></clipPath>`];
    const capas: string[] = [];
    const f = d.fondo;

    if (f.tipo === "color") {
        const [c, a] = separarAlfa(f.color);
        capas.push(`<path d="${ruta}" fill="${c}"${a < 1 ? ` fill-opacity="${n3(a)}"` : ""}/>`);
        capas.push(`<path d="${ruta}" fill="url(#ss-h-${u})" clip-path="url(#ss-f-${u})"/>`);
        defs.push(`<linearGradient id="ss-h-${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.22"/><stop offset="0.55" stop-color="#fff" stop-opacity="0"/></linearGradient>`);
    } else if (f.tipo === "degradado") {
        defs.push(
            `<linearGradient id="ss-g-${u}" x1="0" y1="0" x2="1" y2="0" gradientTransform="rotate(${Math.round(f.angulo)} 0.5 0.5)">` +
            `<stop offset="0" stop-color="${hex(f.desde)}"/><stop offset="1" stop-color="${hex(f.hasta, "#0b1220")}"/></linearGradient>`,
            `<linearGradient id="ss-h-${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.2"/><stop offset="0.55" stop-color="#fff" stop-opacity="0"/></linearGradient>`,
        );
        capas.push(`<path d="${ruta}" fill="url(#ss-g-${u})"/>`);
        capas.push(`<path d="${ruta}" fill="url(#ss-h-${u})" clip-path="url(#ss-f-${u})"/>`);
    } else if (f.tipo === "cristal") {
        const t = hex(f.tinte, "#22d3ee");
        const i = Math.min(1, Math.max(0, f.intensidad));
        defs.push(
            `<linearGradient id="ss-t-${u}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t}" stop-opacity="${n3(i * 0.78)}"/><stop offset="1" stop-color="${t}" stop-opacity="${n3(i * 0.2)}"/></linearGradient>`,
            `<linearGradient id="ss-h-${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`,
            `<radialGradient id="ss-r-${u}" cx="0.5" cy="0.5" r="0.55"><stop offset="0" stop-color="${t}" stop-opacity="${n3(0.55 * d.brillo)}"/><stop offset="1" stop-color="${t}" stop-opacity="0"/></radialGradient>`,
        );
        // base oscura que da lectura sobre fondos claros, el tinte del cristal, resplandor interior y brillo especular
        capas.push(`<path d="${ruta}" fill="#0b1220" fill-opacity="0.38"/>`);
        capas.push(`<path d="${ruta}" fill="url(#ss-t-${u})"/>`);
        if (d.brillo > 0) capas.push(`<path d="${ruta}" fill="url(#ss-r-${u})" clip-path="url(#ss-f-${u})"/>`);
        capas.push(`<ellipse cx="50" cy="24" rx="33" ry="17" fill="url(#ss-h-${u})" clip-path="url(#ss-f-${u})"/>`);
        capas.push(`<path d="${ruta}" fill="none" stroke="#fff" stroke-opacity="0.24" stroke-width="1.6"/>`);
        capas.push(`<path d="${ruta}" fill="none" stroke="${t}" stroke-opacity="0.55" stroke-width="1"/>`);
    }

    if (d.borde && d.borde.ancho > 0) {
        const [c, a] = separarAlfa(d.borde.color);
        capas.push(`<path d="${ruta}" fill="none" stroke="${c}"${a < 1 ? ` stroke-opacity="${n3(a)}"` : ""} stroke-width="${n3(Math.min(6, d.borde.ancho))}" stroke-linejoin="round"/>`);
    }
    return `${defs.length ? `<defs>${defs.join("")}</defs>` : ""}${capas.join("")}`;
}

/** La tesela como SVG completo (sin glifo). */
export function teselaSvg(d: DisenoIcono, opciones: OpcionesTesela = {}): string {
    const lado = Math.max(8, Math.min(1024, Math.round(opciones.lado ?? 100)));
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${lado}" height="${lado}">${interiorTesela(d)}</svg>`;
}

/** La tesela como `data:` URL, lista para `<img src>`. */
export function teselaDataUrl(d: DisenoIcono): string {
    return svgADataUrl(teselaSvg(d));
}

/** El glifo SVG del diseño, coloreado y como `data:` URL (un `<img>` no hereda `currentColor`). */
export function glifoSvgDataUrl(svgSaneado: string, colorGlifo: string): string {
    return svgADataUrl(colorearSvg(svgSaneado, hex(colorGlifo)));
}

/* ─────────────────────────── Icono entero (exportar) ─────────────────────────── */

export interface OpcionesExportar {
    /**
     * Para glifos de Lucide: el `<svg>` del icono tal como lo dibuja la vista previa (outerHTML), porque
     * las rutas de Lucide solo existen en su componente. Se vuelve a sanear antes de integrarlo.
     */
    glifoLucideSvg?: string;
    lado?: number;
}

/**
 * El icono completo como un SVG suelto (para «Exportar SVG»). El glifo SVG o de Lucide se integra como
 * `<svg>` anidado; la imagen, como `<image>` con su `data:`. Sin glifo disponible, solo la tesela.
 */
export function disenoASvg(d: DisenoIcono, opciones: OpcionesExportar = {}): string {
    const lado = Math.max(16, Math.min(1024, Math.round(opciones.lado ?? 256)));
    const tam = Math.round(100 * d.escala * 100) / 100;
    const pos = Math.round(((100 - tam) / 2) * 100) / 100;
    const color = hex(d.colorGlifo);
    let glifo = "";
    if (d.glifo.tipo === "imagen") {
        glifo = `<image href="${d.glifo.src}" x="${pos}" y="${pos}" width="${tam}" height="${tam}"/>`;
    } else {
        const fuente = d.glifo.tipo === "svg" ? d.glifo.svg : (opciones.glifoLucideSvg ?? "");
        if (fuente) {
            // Lo que no es un SVG saneado (el de Lucide viene del DOM) vuelve a pasar por el saneador.
            const interior = sanearInterior(fuente, color);
            const raiz = interior?.match(/^<svg([^>]*)>/);
            if (interior && raiz) {
                // se conservan los atributos de dibujo de la raíz (fill, stroke…); solo se recoloca y escala
                const atributos = raiz[1].replace(/\s(?:x|y|width|height)="[^"]*"/g, "");
                glifo = interior.replace(/^<svg[^>]*>/, `<svg${atributos} x="${pos}" y="${pos}" width="${tam}" height="${tam}">`);
            }
        }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${lado}" height="${lado}">${interiorTesela(d)}${glifo}</svg>`;
}


function sanearInterior(svg: string, color: string): string | null {
    // Lucide dibuja con currentColor; el SVG exportado no hereda color, así que se fija.
    const r = sanearSvg(svg.replace(/currentColor/gi, esColorHex(color) ? color : "#ffffff"), { maxCaracteres: 24_000 });
    return r.ok ? r.svg : null;
}
