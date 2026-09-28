/**
 * Descargar y leer archivos del navegador para la tabla (CSV). Sin dependencias: un `Blob`, un
 * enlace temporal y un `FileReader`.
 */
import { MAX_BYTES_IMPORTAR } from "@/lib/vivo/tabla/csv";

/** Un nombre de archivo seguro a partir del título (sin barras, puntos raros ni emojis). */
export function nombreArchivo(titulo: string, extension: string): string {
    const base =
        titulo
            .normalize("NFKD")
            .replace(/[̀-ͯ]/g, "")
            .replace(/[^a-zA-Z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 60) || "tabla";
    return `${base}.${extension}`;
}

/** Descarga un texto como archivo. `bom` añade la marca UTF-8 que Excel necesita para las tildes. */
export function descargarTexto(nombre: string, texto: string, tipo = "text/csv", bom = false): void {
    if (typeof document === "undefined") return;
    const blob = new Blob([bom ? "﻿" : "", texto], { type: `${tipo};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Se libera tras un momento: algunos navegadores empiezan la descarga de forma asíncrona.
    setTimeout(() => URL.revokeObjectURL(url), 4_000);
}

export type LecturaArchivo = { ok: true; texto: string } | { ok: false; mensaje: string };

/** Lee un archivo de texto elegido por la persona (con tope de tamaño). */
export function leerArchivoTexto(archivo: File): Promise<LecturaArchivo> {
    if (archivo.size > MAX_BYTES_IMPORTAR) {
        return Promise.resolve({ ok: false, mensaje: "El archivo es demasiado grande. El máximo es de unos 4 MB." });
    }
    return new Promise((resolver) => {
        try {
            const lector = new FileReader();
            lector.onerror = () => resolver({ ok: false, mensaje: "No se pudo leer el archivo." });
            lector.onload = () => {
                const t = typeof lector.result === "string" ? lector.result : "";
                resolver({ ok: true, texto: t.charCodeAt(0) === 0xfeff ? t.slice(1) : t });
            };
            lector.readAsText(archivo, "utf-8");
        } catch {
            resolver({ ok: false, mensaje: "No se pudo leer el archivo." });
        }
    });
}
