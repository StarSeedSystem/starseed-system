/**
 * DeckCraft ↔ presentación viva (contrato: `architecture/artcraft-y-rare.md` §4.2 y §4.3).
 * La Entidad es `src/lib/vivo/presentacion.ts`; este módulo solo produce derivados y el plan de
 * llamadas del MCP de DeckCraft. PURO: sin `node:*`, sin React y sin red.
 */
import type { BloqueDoc } from "@/lib/mensajeria/formato-tipos";
import type { Diapositiva, MetaPresentacion } from "@/lib/vivo/presentacion";

export type FormatoExporte = "pptx" | "pdf" | "png" | "jpeg" | "gif";
export interface LlamadaDeckcraft { herramienta: string; parametros: Record<string, unknown>; }
export interface PlanDeckcraft { llamadas: LlamadaDeckcraft[]; pendientes: string[]; }
export interface DerivadoDeckcraft { fuente: string; generadoCon: "DeckCraft"; version: string; }

export const FORMATOS_EXPORTE: FormatoExporte[] = ["pptx", "pdf", "png", "jpeg", "gif"];
/** La publicación lo enseña junto al PDF: no hay texto seleccionable ni vectores. */
export const AVISO_PDF_IMAGEN =
    "DeckCraft exporta cada diapositiva como imagen a resolución de impresión: el PDF no tiene texto seleccionable ni es vectorial";

const EXTENSION: Record<FormatoExporte, string> = { pptx: "pptx", pdf: "pdf", png: "png", jpeg: "jpeg", gif: "gif" };
const texto = (tramos: { texto: string }[]): string => tramos.map((t) => t.texto).join("").trim();

function lineasDeBloques(bloques: BloqueDoc[]): string[] {
    const lineas: string[] = [];
    for (const b of bloques) {
        if (b.tipo === "parrafo" || b.tipo === "titulo" || b.tipo === "cita") {
            const t = texto(b.tramos);
            if (t) lineas.push(t);
        } else if (b.tipo === "lista") {
            for (const it of b.items) { const t = texto(it); if (t) lineas.push("\t" + t); }
        } else if (b.tipo === "tareas") {
            for (const it of b.items) {
                const t = texto(it.tramos);
                if (t) lineas.push("\t" + (it.hecha ? "[x] " : "[ ] ") + t);
            }
        } else if (b.tipo === "codigo") {
            for (const l of b.texto.split("\n")) if (l.trim()) lineas.push("\t" + l.trim());
        }
    }
    return lineas;
}

/** Líneas de la diapositiva en orden de lectura, conservando párrafos y sangría de listas. */
export function lineasDeDiapositiva(d: Diapositiva): string[] {
    const elementos = [...d.lienzo.elementos].sort((a, b) => (Math.abs(a.y - b.y) > 8 ? a.y - b.y : a.x - b.x));
    const lineas: string[] = [];
    for (const el of elementos) {
        if (el.tipo === "texto" && el.texto) lineas.push(...lineasDeBloques(el.texto.bloques));
    }
    return lineas;
}

export function sanearArchivo(archivo: string): string {
    const limpio = (archivo ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
        .replace(/[^a-z0-9-_]+/g, "-").replace(/-+/g, "-").replace(/^[-_]+|[-_]+$/g, "").slice(0, 80)
        .replace(/[-_]+$/, "");
    return limpio || "presentacion";
}

export function planDeckcraftDesdeMazo(
    meta: MetaPresentacion,
    diapositivas: Diapositiva[],
    o: { tema?: string } = {},
): PlanDeckcraft {
    const llamadas: LlamadaDeckcraft[] = [{ herramienta: "new_presentation", parametros: o.tema ? { theme: o.tema } : {} }];
    const pendientes: string[] = [];
    diapositivas.forEach((d, i) => {
        const n = i + 1;
        const lineas = lineasDeDiapositiva(d);
        if (i === 0) {
            llamadas.push({ herramienta: "add_slide", parametros: { layout: "title", title: meta.titulo, body: lineas.join("\n") } });
        } else {
            const titulo = (lineas[0] ?? "").replace(/^\t+/, "");
            llamadas.push({ herramienta: "add_slide", parametros: { layout: "titleAndContent", title: titulo, body: lineas.slice(1).join("\n") } });
        }
        if (d.notas?.trim()) {
            pendientes.push(`notas de la diapositiva ${n}: aplicar con el comando de notas que devuelva \`list_commands\``);
        }
        const tipos = new Set(d.lienzo.elementos.map((e) => e.tipo));
        if (tipos.has("imagen") || tipos.has("gif")) {
            pendientes.push(`imágenes de la diapositiva ${n}: no se transfieren a DeckCraft; insertarlas a mano`);
        }
        if (tipos.has("forma")) {
            pendientes.push(`formas de la diapositiva ${n}: no se transfieren a DeckCraft; redibujarlas a mano`);
        }
    });
    return { llamadas, pendientes };
}

export function planExporteDeck(
    formato: FormatoExporte,
    archivo: string,
    o: { notas?: boolean } = {},
): { herramienta: "export"; parametros: Record<string, unknown> } {
    if (!FORMATOS_EXPORTE.includes(formato)) {
        throw new Error(`Formato de exporte no válido: «${String(formato)}». Usa ${FORMATOS_EXPORTE.join(", ")}.`);
    }
    const parametros: Record<string, unknown> = {
        path: `salida/${sanearArchivo(archivo)}.${EXTENSION[formato]}`,
        format: formato,
    };
    if (o.notas) parametros.layout = "notes";
    return { herramienta: "export", parametros };
}

export function derivadoDe(meta: MetaPresentacion, version: string): DerivadoDeckcraft {
    return { fuente: meta.titulo, generadoCon: "DeckCraft", version };
}
