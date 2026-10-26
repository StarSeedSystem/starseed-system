// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — «Convertir a…» en los iconos del escritorio · módulo PURO
// ----------------------------------------------------------------------------
// Un icono del escritorio que apunta a un archivo (kind «file» con URL) se
// puede convertir con Filee desde su clic derecho. Este módulo decide, sin
// tocar red ni disco, qué iconos son convertibles y con qué nombre se le
// piden los formatos a la neurona. Contrato: `architecture/conversion-archivos.md`.
// ════════════════════════════════════════════════════════════════════════════

import { formatoDe } from "./formatos";

/** Lo mínimo de un icono del escritorio que hace falta para convertirlo. */
export interface IconoDeArchivo {
    kind: string;
    name?: string;
    url?: string;
    /** Pista de tipo del icono («pdf», «image», «markdown»…). */
    fileKind?: string;
}

/** Archivo convertible tal como lo espera `useConversionMenu`. */
export interface ArchivoDeIcono {
    nombre: string;
    url: string;
    tipoMime?: string;
}

/** Pistas que son familias del OS, no extensiones: no sirven para nombrar la salida. */
const FAMILIAS = new Set([
    "image", "gif", "gallery", "video", "audio", "document", "doc", "code",
    "html", "model3d", "markdown", "text", "dataset", "csv", "archive",
    "folder", "link", "entity", "app", "widget", "unknown", "other",
    "note", "comando", "pizarra", "canvas", "post", "publicacion", "publication",
]);

/**
 * Devuelve el archivo que se puede convertir si el icono es un archivo con
 * URL; `null` para folders, apps, widgets, enlaces y archivos sin URL.
 * La pista de tipo solo se usa cuando es un formato real (p. ej. «pdf»).
 */
export function archivoConvertibleDeIcono(icono: IconoDeArchivo | null | undefined): ArchivoDeIcono | null {
    if (!icono || icono.kind !== "file") return null;
    const url = String(icono.url ?? "").trim();
    if (!url) return null;
    const nombre = String(icono.name ?? "").trim() || "archivo";
    const pista = String(icono.fileKind ?? "").trim().toLowerCase();
    const formato = FAMILIAS.has(pista) ? "" : formatoDe(pista);
    return formato ? { nombre, url, tipoMime: formato } : { nombre, url };
}
