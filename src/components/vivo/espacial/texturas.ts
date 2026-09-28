"use client";

/**
 * Texturas de texto dibujadas en un <canvas> (sin fuentes remotas ni HTML): sirven igual en 3D,
 * en VR y en AR, donde el DOM no llega. El texto es siempre texto plano (nunca HTML).
 */

import * as THREE from "three";

export interface TexturaTexto {
    textura: THREE.CanvasTexture;
    /** Relación ancho/alto para dimensionar el plano. */
    aspecto: number;
}

const FUENTE = `600 64px Inter, "Segoe UI", system-ui, -apple-system, sans-serif`;

/** Parte el texto en líneas que caben en `anchoMax` píxeles (respeta los saltos de línea). */
export function partirLineas(texto: string, medir: (s: string) => number, anchoMax: number, maxLineas = 8): string[] {
    const salida: string[] = [];
    for (const parrafo of texto.split("\n")) {
        const palabras = parrafo.split(" ");
        let linea = "";
        for (const p of palabras) {
            const prueba = linea ? `${linea} ${p}` : p;
            if (medir(prueba) <= anchoMax || !linea) linea = prueba;
            else {
                salida.push(linea);
                linea = p;
            }
            if (salida.length >= maxLineas) break;
        }
        if (salida.length >= maxLineas) break;
        salida.push(linea);
    }
    if (salida.length > maxLineas) salida.length = maxLineas;
    return salida.length ? salida : [""];
}

export function crearTexturaTexto(
    texto: string,
    opciones: { color?: string; fondo?: string | null; relleno?: number; anchoMax?: number; etiqueta?: string | null } = {},
): TexturaTexto | null {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const relleno = opciones.relleno ?? 28;
    const anchoMax = opciones.anchoMax ?? 900;
    ctx.font = FUENTE;
    const lineas = partirLineas(texto || " ", (s) => ctx.measureText(s).width, anchoMax);
    const altoLinea = 78;
    const anchoTexto = Math.max(...lineas.map((l) => ctx.measureText(l).width), 10);
    const extraEtiqueta = opciones.etiqueta ? 44 : 0;
    const w = Math.min(2048, Math.ceil(anchoTexto + relleno * 2));
    const h = Math.min(2048, Math.ceil(lineas.length * altoLinea + relleno * 2 + extraEtiqueta));
    canvas.width = w;
    canvas.height = h;
    if (opciones.fondo) {
        ctx.fillStyle = opciones.fondo;
        const r = Math.min(40, h / 2);
        ctx.beginPath();
        ctx.moveTo(r, 0);
        ctx.arcTo(w, 0, w, h, r);
        ctx.arcTo(w, h, 0, h, r);
        ctx.arcTo(0, h, 0, 0, r);
        ctx.arcTo(0, 0, w, 0, r);
        ctx.closePath();
        ctx.fill();
    }
    ctx.font = FUENTE;
    ctx.textBaseline = "top";
    ctx.textAlign = "center";
    ctx.fillStyle = opciones.color ?? "#ffffff";
    lineas.forEach((l, i) => ctx.fillText(l, w / 2, relleno + i * altoLinea));
    if (opciones.etiqueta) {
        ctx.font = `600 32px Inter, system-ui, sans-serif`;
        ctx.fillStyle = "rgba(255,255,255,0.65)";
        ctx.fillText(opciones.etiqueta, w / 2, relleno + lineas.length * altoLinea + 4);
    }
    const textura = new THREE.CanvasTexture(canvas);
    textura.colorSpace = THREE.SRGBColorSpace;
    textura.anisotropy = 4;
    textura.needsUpdate = true;
    return { textura, aspecto: w / h };
}
