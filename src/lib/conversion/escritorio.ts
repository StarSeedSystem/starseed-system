// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Convertir a… (Filee) para los iconos del escritorio
// ----------------------------------------------------------------------------
// PURO: dado un icono del escritorio, decide si apunta a un archivo convertible
// (con URL y en un formato que Filee reconoce) y devuelve lo que necesita
// `useConversionMenu`. Sin red, sin disco. Entrada → salida.
// Contrato: `architecture/conversion-archivos.md`.
// ════════════════════════════════════════════════════════════════════════════

import type { ArchivoConvertible } from "@/components/conversion/use-conversion-menu";
import { formatoDe } from "./formatos";

/** Datos mínimos de un icono del escritorio (DesktopIcon, recortado). */
export interface IconoEscritorioConvertible {
    kind: "app" | "file" | "folder" | "widget" | "link";
    name: string;
    url?: string;
}

/** El icono como archivo convertible si procede; null si no (apps, folders, widgets o URLs sin formato conocido). */
export function archivoConvertibleDeIcono(icono: IconoEscritorioConvertible): ArchivoConvertible | null {
    if (!icono || (icono.kind !== "file" && icono.kind !== "link")) return null;
    const url = typeof icono.url === "string" ? icono.url.trim() : "";
    if (!url) return null;
    let ruta = "";
    try {
        ruta = new URL(url, "http://x").pathname;
    } catch {
        return null;
    }
    const nombre = (icono.name || "").trim();
    if (!parConExtension(nombre) && !parConExtension(ruta)) return null;
    return { nombre, url };
}

/** Tramo final con punto (extensión real de archivo, no una palabra suelta) en un formato que Filee reconoce. */
function parConExtension(entrada: string): boolean {
    const tramo = entrada.split(/[?#]/)[0].split("/").filter(Boolean).pop() ?? entrada;
    return Boolean(formatoDe(tramo)) && tramo.toLowerCase().includes(".");
}
