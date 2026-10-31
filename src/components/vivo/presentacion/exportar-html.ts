"use client";

/**
 * Presentación en vivo → «Exportar a HTML» (Ola 1025R · DSN1025E).
 *
 * Nada se sube ni se publica: se genera el archivo en el navegador y se descarga. El núcleo que
 * produce el HTML y su nombre vive en `src/lib/vivo/presentacion-html.ts` (DSN1025D); aquí solo
 * está el puente al DOM, que no toca `node:*` y se puede sustituir en las pruebas.
 */

import type { Diapositiva, MetaPresentacion } from "@/lib/vivo/presentacion";
import { nombreArchivoPresentacion, presentacionAHtml } from "@/lib/vivo/presentacion-html";

export type Descargar = (nombre: string, texto: string, mime: string) => void;

/** Descarga un texto como archivo sin pasar por el servidor. */
export function descargarTexto(nombre: string, texto: string, mime: string): void {
    const blob = new Blob([texto], { type: mime });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = nombre;
    enlace.rel = "noopener";
    enlace.style.display = "none";
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    URL.revokeObjectURL(url);
}

/** Fecha local en AAAA-MM-DD (no UTC: la que ve quien exporta). */
function fechaDeHoy(): string {
    const hoy = new Date();
    const mes = String(hoy.getMonth() + 1).padStart(2, "0");
    const dia = String(hoy.getDate()).padStart(2, "0");
    return `${hoy.getFullYear()}-${mes}-${dia}`;
}

/**
 * Exporta las diapositivas como un HTML autónomo.
 * Con cero diapositivas devuelve `false` y no descarga nada.
 */
export function exportarPresentacionHtml(
    meta: MetaPresentacion,
    diapositivas: Diapositiva[],
    descargar: Descargar = descargarTexto,
): boolean {
    if (diapositivas.length === 0) return false;
    const html = presentacionAHtml(meta, diapositivas, { fecha: fechaDeHoy(), incluirNotas: true });
    descargar(nombreArchivoPresentacion(meta), html, "text/html;charset=utf-8");
    return true;
}
