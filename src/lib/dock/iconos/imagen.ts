/**
 * Imágenes para los diseños de iconos (Ola 1025U · V1b) — solo navegador, sin red propia.
 *
 *   · `reducirAPng`     — baja una imagen a un icono pequeño (data URL PNG) que cabe en el tope del modelo.
 *   · `paletaDeBlob`    — los colores dominantes de una imagen de referencia.
 *   · `esImagenPermitida` — qué archivos se aceptan como referencia o como glifo.
 *
 * Todo devuelve `null`/`[]` cuando el navegador no puede (sin lienzo, imagen de otro origen que no deja
 * leer sus píxeles, formato raro): la interfaz lo dice en vez de fingir que funcionó.
 */

import { LIMITES } from "./modelo";
import { paletaDePixeles } from "./ia-prompt";

export const TIPOS_IMAGEN_PERMITIDOS = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export const MAX_IMAGEN_BYTES = 5 * 1024 * 1024;

export function esImagenPermitida(f: { type: string; size: number }): { ok: boolean; motivo?: string } {
    if (!(TIPOS_IMAGEN_PERMITIDOS as readonly string[]).includes(f.type)) {
        return { ok: false, motivo: "Solo se aceptan imágenes PNG, JPG, WebP o GIF." };
    }
    if (f.size > MAX_IMAGEN_BYTES) return { ok: false, motivo: "La imagen pesa más de 5 MB." };
    return { ok: true };
}

type Fuente = { ancho: number; alto: number; dibujar: (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => void; cerrar: () => void };

async function abrir(blob: Blob): Promise<Fuente | null> {
    if (typeof document === "undefined") return null;
    try {
        if (typeof createImageBitmap === "function") {
            const bmp = await createImageBitmap(blob);
            return { ancho: bmp.width, alto: bmp.height, dibujar: (c, x, y, w, h) => c.drawImage(bmp, x, y, w, h), cerrar: () => bmp.close?.() };
        }
    } catch { /* se prueba con <img> */ }
    if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return null;
    const url = URL.createObjectURL(blob);
    try {
        const img = await new Promise<HTMLImageElement>((ok, mal) => {
            const i = new Image();
            i.onload = () => ok(i);
            i.onerror = () => mal(new Error("imagen"));
            i.src = url;
        });
        return { ancho: img.naturalWidth, alto: img.naturalHeight, dibujar: (c, x, y, w, h) => c.drawImage(img, x, y, w, h), cerrar: () => URL.revokeObjectURL(url) };
    } catch {
        URL.revokeObjectURL(url);
        return null;
    }
}

function lienzo(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
    try {
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        return ctx ? { canvas, ctx } : null;
    } catch { return null; }
}

/**
 * Reduce la imagen a un cuadrado (recorte centrado «cover») y la devuelve como `data:image/png` que quepa en
 * `LIMITES.imagenMaxCaracteres`, probando lados cada vez menores. `null` si no se puede o no cabe.
 */
export async function reducirAPng(blob: Blob, lados: readonly number[] = [96, 80, 64, 48, 32]): Promise<string | null> {
    const f = await abrir(blob);
    if (!f || !f.ancho || !f.alto) return null;
    try {
        const corte = Math.min(f.ancho, f.alto);
        for (const lado of lados) {
            const l = lienzo(lado, lado);
            if (!l) return null;
            // «cover»: se dibuja la imagen entera escalada para que el lado corto llene el cuadrado
            const escala = lado / corte;
            const w = f.ancho * escala;
            const h = f.alto * escala;
            f.dibujar(l.ctx, (lado - w) / 2, (lado - h) / 2, w, h);
            let url: string;
            try { url = l.canvas.toDataURL("image/png"); } catch { return null; } // lienzo «manchado» por otro origen
            if (url.startsWith("data:image/png;base64,") && url.length <= LIMITES.imagenMaxCaracteres) return url;
        }
        return null;
    } finally {
        f.cerrar();
    }
}

/** Colores dominantes de una imagen (hasta 5). `[]` si el navegador no deja leer sus píxeles. */
export async function paletaDeBlob(blob: Blob): Promise<string[]> {
    const f = await abrir(blob);
    if (!f || !f.ancho || !f.alto) return [];
    try {
        const lado = 48;
        const l = lienzo(lado, lado);
        if (!l) return [];
        f.dibujar(l.ctx, 0, 0, lado, lado);
        try { return paletaDePixeles(l.ctx.getImageData(0, 0, lado, lado).data); } catch { return []; }
    } finally {
        f.cerrar();
    }
}

/** Trae una imagen de una URL o `data:` a un Blob. `null` si el servidor no lo permite (CORS) o falla. */
export async function blobDeUrl(url: string, signal?: AbortSignal): Promise<Blob | null> {
    try {
        const res = await fetch(url, { signal, credentials: "omit", mode: "cors" });
        if (!res.ok) return null;
        const b = await res.blob();
        return b.size > 0 && b.size <= MAX_IMAGEN_BYTES ? b : null;
    } catch { return null; }
}
