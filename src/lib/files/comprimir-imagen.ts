/*
 * comprimir-imagen — (Ola 225) compresión de imágenes EN CLIENTE antes de subir.
 *
 * Reduce el peso de jpeg/png/webp grandes (redimensiona a maxLado y reexporta
 * a WebP calidad 0.86, o JPEG si WebP no está disponible) para ahorrar ancho de
 * banda y egress de Supabase. NUNCA lanza: ante cualquier fallo (entorno sin
 * DOM, formato no soportado, error de decodificado) devuelve el File original.
 */

export interface ComprimirImagenOpts {
    /** Lado máximo permitido (ancho/alto) tras redimensionar. Por defecto 2048. */
    maxLado?: number;
    /** Calidad de exportación 0–1. Por defecto 0.86. */
    calidad?: number;
    /** Umbral de peso: por debajo de esto (y del maxLado) se deja intacto. Por defecto 1,5 MB. */
    maxBytes?: number;
}

const TIPOS_COMPRIMIBLES = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Comprime una imagen en el navegador si supera los umbrales. Si `file` no es
 * una imagen comprimible, estamos en SSR o algo falla, devuelve `file` intacto.
 */
export async function comprimirImagen(file: File, opts: ComprimirImagenOpts = {}): Promise<File> {
    try {
        // SSR-safe: sin navegador / canvas no hacemos nada.
        if (typeof window === "undefined" || typeof document === "undefined") return file;
        if (!file || !TIPOS_COMPRIMIBLES.has(file.type)) return file;

        const maxLado = opts.maxLado ?? 2048;
        const calidad = opts.calidad ?? 0.86;
        const maxBytes = opts.maxBytes ?? Math.round(1.5 * 1024 * 1024);

        const bitmap = await createImageBitmap(file);
        try {
            const { width, height } = bitmap;
            const lado = Math.max(width, height);
            const excedeLado = lado > maxLado;
            const excedePeso = file.size > maxBytes;
            if (!excedeLado && !excedePeso) return file;

            const escala = excedeLado ? maxLado / lado : 1;
            const w = Math.max(1, Math.round(width * escala));
            const h = Math.max(1, Math.round(height * escala));

            const canvas =
                typeof OffscreenCanvas !== "undefined"
                    ? new OffscreenCanvas(w, h)
                    : Object.assign(document.createElement("canvas"), { width: w, height: h });
            const ctx = canvas.getContext("2d");
            if (!ctx) return file;
            ctx.drawImage(bitmap, 0, 0, w, h);
            bitmap.close?.();

            const toBlob = (tipo: string): Promise<Blob | null> =>
                "convertToBlob" in canvas
                    ? (canvas as OffscreenCanvas).convertToBlob({ type: tipo, quality: calidad })
                    : new Promise<Blob | null>((resolve) =>
                          (canvas as HTMLCanvasElement).toBlob((b) => resolve(b), tipo, calidad),
                      );

            // WebP primero; si el navegador no lo soporta (tolerancia a tupla) → JPEG.
            let blob = await toBlob("image/webp");
            let tipo = "image/webp";
            if (!blob || blob.type !== "image/webp") {
                blob = await toBlob("image/jpeg");
                tipo = "image/jpeg";
            }
            if (!blob) return file;

            // Si la compresión no ahorra (o crece), conservamos el original.
            if (blob.size >= file.size) return file;

            const base = (file.name || "imagen").replace(/\.[a-z0-9]+$/i, "");
            const ext = tipo === "image/webp" ? ".webp" : ".jpg";
            return new File([blob], `${base}${ext}`, { type: tipo, lastModified: file.lastModified });
        } finally {
            bitmap.close?.();
        }
    } catch {
        // Nunca lanzar: cualquier error deja el archivo original tal cual.
        return file;
    }
}
