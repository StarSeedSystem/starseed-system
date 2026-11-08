"use client";

/**
 * vista-previa-envio — la vista previa que viaja con una oferta de archivo (ARC1108A · 2026-11-08).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Para que quien recibe vea qué le mandan ANTES de aceptarlo: una miniatura JPEG (≤ 160 px, ≤ 24 000
 * caracteres en data URL) de las imágenes que el navegador sabe decodificar, o los primeros
 * caracteres de los archivos de texto (también el SVG, como texto: nunca se dibuja). El resto, nada
 * (la ventana del receptor enseña un icono con su tipo y tamaño). Nunca lanza: sin vista, undefined.
 */

import { MAX_VISTA_IMAGEN, MAX_VISTA_TEXTO, sanearVista, type VistaOferta } from "./archivos-malla";

/** Imágenes de más de esto no se decodifican para la miniatura (memoria del aparato que envía). */
const MAX_IMAGEN_BYTES = 40 * 1024 * 1024;
const RASTER = /^image\/(png|jpeg|jpg|gif|webp|bmp|avif|heic|heif)$/;
const TEXTO = /^(text\/|application\/(json|xml|x-yaml|yaml|csv)$|image\/svg\+xml$)/;
const EXT_TEXTO = new Set(["txt", "md", "markdown", "csv", "tsv", "json", "xml", "yaml", "yml", "log", "ini", "toml", "srt", "vtt", "svg"]);

function extension(nombre: string): string {
  const i = nombre.lastIndexOf(".");
  return i > 0 ? nombre.slice(i + 1).toLowerCase() : "";
}

async function miniatura(blob: Blob, lado: number, calidad: number): Promise<string | null> {
  if (typeof createImageBitmap !== "function") return null;
  const bmp = await createImageBitmap(blob);
  try {
    const escala = Math.min(1, lado / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * escala));
    const h = Math.max(1, Math.round(bmp.height * escala));
    if (typeof document === "undefined") return null;
    const lienzo = document.createElement("canvas");
    lienzo.width = w;
    lienzo.height = h;
    const ctx = lienzo.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0, w, h);
    return lienzo.toDataURL("image/jpeg", calidad);
  } finally {
    bmp.close?.();
  }
}

/** La vista previa de un archivo para su oferta, o undefined. */
export async function vistaParaOferta(archivo: Blob, nombre: string, tipo?: string | null): Promise<VistaOferta | undefined> {
  const t = String(tipo || archivo.type || "").toLowerCase();
  try {
    if (RASTER.test(t) && archivo.size > 0 && archivo.size <= MAX_IMAGEN_BYTES) {
      for (const [lado, calidad] of [
        [160, 0.7],
        [112, 0.55],
      ] as const) {
        const url = await miniatura(archivo, lado, calidad);
        if (url && url.length <= MAX_VISTA_IMAGEN) return sanearVista({ tipo: "imagen", datosUrl: url });
      }
      return undefined;
    }
    if (TEXTO.test(t) || EXT_TEXTO.has(extension(nombre))) {
      const texto = await archivo.slice(0, MAX_VISTA_TEXTO * 4).text();
      return sanearVista({ tipo: "texto", texto: texto.slice(0, MAX_VISTA_TEXTO) });
    }
  } catch {
    return undefined;
  }
  return undefined;
}
