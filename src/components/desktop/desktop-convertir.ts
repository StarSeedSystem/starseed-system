// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — «Convertir a…» (Filee) desde los iconos del escritorio.
// ----------------------------------------------------------------------------
// Puro (entrada → salida, sin red ni disco): decide si un icono del escritorio
// puede ofrecer el submenú de conversión y con qué archivo. El clic derecho de
// los iconos lo llama (`desktop-context-menu.tsx`); el resultado se DESCARGA en
// este dispositivo (contrato: `architecture/conversion-archivos.md` §4).
// ════════════════════════════════════════════════════════════════════════════

import type { ArchivoConvertible } from "@/components/conversion/use-conversion-menu";
import type { DesktopIcon } from "./desktop-store";

/**
 * El archivo convertible detrás de un icono: solo los de kind 'file' con URL
 * real (recursos de la Biblioteca y subidas). Los folders, apps, widgets,
 * enlaces y notas embebidas no se convierten; de ellos devuelve `null`.
 */
export function iconoConvertible(icon: DesktopIcon): ArchivoConvertible | null {
    if (icon.kind !== "file" || !icon.url) return null;
    return { nombre: icon.name || "archivo", url: icon.url };
}
