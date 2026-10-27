/**
 * Exportación de la presentación en vivo a un HTML autónomo (2026-10-27 · tarea DSN1025D,
 * reglas del escenario de lib-frontend-slides en config/repos-libreria-1025.json).
 *
 * Núcleo PURO (sin `node:*`, sin DOM, sin red): produce UN archivo HTML con escenario fijo
 * (1080 de alto, ancho según la proporción del mazo) escalado entero al visor, CSP estricta,
 * cero peticiones externas (ni fuentes ni CSS remotos) y cero animaciones: el archivo es
 * estático a propósito (nav de la presentación en vivo deja los fondos y el texto quietos).
 */
import { FONDOS_BURBUJA } from "@/lib/mensajeria/formato-tipos";
import type { Diapositiva, MetaPresentacion } from "@/lib/vivo/presentacion";
import { elementoAHtml, escaparHtml, hexValido } from "./presentacion-html-piezas";
import { dimensionesDe, lienzoEfectivo, temaDe } from "./presentacion";

const ALTO_ESCENARIO = 1080;

const CONTENIDO_CSP =
    "default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";

/** */
export function nombreArchivoPresentacion(meta: Pick<MetaPresentacion, "titulo">): string {
    const base = (meta.titulo ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return `${base || "presentacion"}.html`;
}

/** */
function fondoACss(fondo: unknown, meta?: MetaPresentacion): string {
    const hex = hexValido(fondo);
    if (hex) return hex;
    const burbuja = FONDOS_BURBUJA.find((f) => f.id === fondo);
    if (burbuja) return burbuja.css;
    const delTema = temaDe(meta ?? { titulo: "", tema: "cosmos", proporcion: "16:9" }).fondo;
    if (meta && delTema !== fondo) return fondoACss(delTema);
    return "#0B0D1A";
}

// ─── Pendiente: diapositivaAHtml, scriptDe, estilo, presentacionAHtml ───
