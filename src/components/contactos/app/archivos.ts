/**
 * archivos — importar/exportar vCard desde el navegador (lectura de .vcf y descarga).
 * La vCard exportada NUNCA lleva notas privadas: lo garantiza `exportarVCard`.
 */

import { exportarVCard, parseVCard } from "@/lib/contactos/vcard";
import type { Contacto, ContactoEntrada } from "@/lib/contactos/tipos";

/** Tope de tamaño de un .vcf (una libreta de miles de personas cabe de sobra). */
export const MAX_BYTES_VCF = 8 * 1024 * 1024;

export type ResultadoLectura = { ok: true; entradas: ContactoEntrada[] } | { ok: false; error: string };

export async function leerArchivoVcf(archivo: File): Promise<ResultadoLectura> {
    if (archivo.size > MAX_BYTES_VCF) {
        return { ok: false, error: "Ese archivo es demasiado grande (máximo 8 MB)." };
    }
    try {
        const texto = await archivo.text();
        const entradas = parseVCard(texto);
        if (!entradas.length) return { ok: false, error: "No encontramos ningún contacto en ese archivo." };
        return { ok: true, entradas };
    } catch {
        return { ok: false, error: "No se pudo leer el archivo." };
    }
}

/** Descarga un texto como archivo. Devuelve false si el navegador no lo permite. */
export function descargarTexto(nombre: string, texto: string, mime: string): boolean {
    if (typeof document === "undefined" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return false;
    try {
        const blob = new Blob([texto], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = nombre;
        a.rel = "noopener";
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return true;
    } catch {
        return false;
    }
}

export function descargarVcf(contactos: Contacto[], nombre: string): boolean {
    return descargarTexto(nombre, exportarVCard(contactos), "text/vcard;charset=utf-8");
}
