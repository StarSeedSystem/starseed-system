// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Conversión de archivos · formatos (módulo PURO)
// ----------------------------------------------------------------------------
// Alex (2026-10-23): instalar KnifeLemon/Filee «para todo el OS y la Biblioteca,
// usado desde cualquier medio con clic derecho a cada archivo, pidiéndoselo a
// Astraura o en la Protomolécula». Filee (MIT) convierte 255 formatos sin
// conexión; su orden `filee formats <formato>` dice a qué convierte cada uno.
// Este módulo lee esa salida y ordena los destinos para los menús. Sin red,
// sin disco, sin `node:*`: lo usan el servidor, el cliente y las pruebas.
// Contrato: `architecture/conversion-archivos.md`.
// ════════════════════════════════════════════════════════════════════════════

/** Lo que Filee dice de un formato de origen. */
export interface DestinosFormato {
    /** Nombre legible del origen («Markdown», «PNG»…). */
    nombre: string;
    /** Ids que Filee acepta para ese origen («md», «markdown»). */
    ids: string[];
    /** Destinos que funcionan YA con lo instalado. */
    destinos: string[];
    /** Destinos que piden un motor opcional (LibreOffice, Pandoc, Ghostscript, calibre, FFmpeg). */
    conMotor: string[];
}

/** Un formato de la lista completa de `filee formats`. */
export interface FormatoFilee {
    familia: string;
    id: string;
    nombre: string;
    extensiones: string[];
    soloLectura: boolean;
}

/** Destinos que la gente pide más: van primero en el menú (en este orden). */
export const DESTINOS_HABITUALES = [
    "pdf", "docx", "png", "jpg", "webp", "txt", "md", "html", "epub",
    "mp4", "webm", "gif", "mp3", "m4a", "wav", "csv", "xlsx", "json",
    "svg", "glb", "zip", "avif", "heic", "pptx",
] as const;

/** Formatos «hermanos» que no aportan nada en un menú corto (se ven en «Más formatos…»). */
const ALIAS: Record<string, string> = { jpeg: "jpg", jpe: "jpg", jfif: "jpg", tif: "tiff", htm: "html", markdown: "md", yml: "yaml" };

const ID_FORMATO = /^[a-z0-9][a-z0-9+_-]{0,15}$/;

/** «md», «MD», «.md», «nota.MD», «image/png» → «md»/«png». Vacío si no se reconoce. */
export function formatoDe(entrada: string): string {
    const crudo = String(entrada ?? "").trim().toLowerCase();
    if (!crudo) return "";
    let f = crudo;
    if (f.includes("/") && !f.includes(".")) f = f.split("/").pop() ?? "";
    else if (f.includes(".")) f = f.slice(f.lastIndexOf(".") + 1);
    f = f.replace(/^x-/, "").replace(/\+.*$/, "").replace(/[?#].*$/, "");
    f = ALIAS[f] ?? f;
    return ID_FORMATO.test(f) ? f : "";
}

/** ¿Es un id de formato que se puede pasar a `filee convert --to`? */
export function esFormatoValido(f: string): boolean {
    return ID_FORMATO.test(String(f ?? ""));
}

function lista(linea: string): string[] {
    return linea.split(",").map((x) => x.trim().toLowerCase()).filter((x) => ID_FORMATO.test(x));
}

/**
 * Lee la salida de `filee formats <formato>`:
 *   «Markdown (md, markdown) converts to:\n  png, jpg, …\nWith optional engines (…):\n  svg, eps, …»
 * Devuelve null si no tiene esa forma (formato desconocido, error…).
 */
export function leerDestinos(texto: string): DestinosFormato | null {
    const lineas = String(texto ?? "").split(/\r?\n/);
    const i = lineas.findIndex((l) => /converts to:\s*$/i.test(l));
    if (i < 0) return null;
    const cab = lineas[i].match(/^\s*(.+?)\s*\(([^)]*)\)\s*converts to:\s*$/i);
    if (!cab) return null;
    const out: DestinosFormato = { nombre: cab[1].trim(), ids: lista(cab[2]), destinos: [], conMotor: [] };
    let modo: "destinos" | "conMotor" = "destinos";
    for (const l of lineas.slice(i + 1)) {
        if (/^\s*with optional engines/i.test(l)) { modo = "conMotor"; continue; }
        if (/converts to:\s*$/i.test(l)) break; // otro bloque pegado detrás
        if (!/^\s+\S/.test(l)) continue;
        for (const f of lista(l)) if (!out[modo].includes(f)) out[modo].push(f);
    }
    out.conMotor = out.conMotor.filter((f) => !out.destinos.includes(f));
    return out;
}

/** Lee la lista completa de `filee formats` («Image:\n  png  PNG  .png …»). */
export function leerListaFormatos(texto: string): FormatoFilee[] {
    const out: FormatoFilee[] = [];
    let familia = "";
    for (const l of String(texto ?? "").split(/\r?\n/)) {
        const fam = l.match(/^([A-Za-z][A-Za-z0-9 &/-]*):\s*$/);
        if (fam) { familia = fam[1].trim(); continue; }
        const m = l.match(/^\s+([a-z0-9][a-z0-9+_-]*)\s{2,}(.+?)\s{2,}((?:\.[^\s]+\s*)+)$/i);
        if (!m || !familia) continue;
        const nombre = m[2].trim();
        out.push({
            familia,
            id: m[1].toLowerCase(),
            nombre: nombre.replace(/\s*\(read only\)\s*$/i, ""),
            extensiones: m[3].trim().split(/\s+/).map((e) => e.replace(/^\./, "").toLowerCase()),
            soloLectura: /read only/i.test(nombre),
        });
    }
    return out;
}

/** Id de formato de un nombre de archivo según la lista de Filee (la extensión manda). */
export function idPorExtension(nombreArchivo: string, formatos: FormatoFilee[]): string {
    const ext = formatoDe(nombreArchivo);
    if (!ext) return "";
    const hit = formatos.find((f) => f.id === ext || f.extensiones.includes(ext));
    return hit?.id ?? ext;
}

/**
 * Orden del menú: primero los habituales (en su orden), luego el resto
 * alfabético. Quita el propio origen y duplicados.
 */
export function ordenarDestinos(destinos: string[], origen = ""): string[] {
    const o = formatoDe(origen);
    const unicos = [...new Set(destinos.map((d) => d.toLowerCase()))].filter((d) => esFormatoValido(d) && d !== o);
    const peso = (d: string) => {
        const i = (DESTINOS_HABITUALES as readonly string[]).indexOf(d);
        return i < 0 ? 1000 : i;
    };
    return unicos.sort((a, b) => peso(a) - peso(b) || a.localeCompare(b));
}

/** Para el clic derecho: los N primeros y cuántos quedan para «Más formatos…». */
export function destinosParaMenu(d: DestinosFormato | null, origen: string, n = 8): { principales: string[]; resto: number } {
    if (!d) return { principales: [], resto: 0 };
    const todos = ordenarDestinos(d.destinos, origen);
    return { principales: todos.slice(0, n), resto: Math.max(0, todos.length - n) };
}

/** «Viaje a Oaxaca.HEIC» + «jpg» → «Viaje a Oaxaca.jpg». Nunca vacío, nunca con rutas. */
export function nombreDeSalida(nombre: string, destino: string): string {
    const base = String(nombre ?? "").split(/[\\/]/).pop() ?? "";
    const sinExt = base.includes(".") ? base.slice(0, base.lastIndexOf(".")) : base;
    const limpio = sinExt.replace(/[\u0000-\u001f<>:"|?*]/g, "").trim() || "archivo";
    return `${limpio}.${formatoDe(destino) || destino}`;
}

/** Etiqueta corta de un formato para el menú («pdf» → «PDF», «md» → «Markdown»). */
export function etiquetaFormato(f: string): string {
    const especiales: Record<string, string> = {
        md: "Markdown", txt: "Texto", html: "HTML (web)", epub: "EPUB (libro)", glb: "GLB (3D)",
        zip: "ZIP", jpg: "JPG", webp: "WebP", avif: "AVIF", heic: "HEIC", docx: "Word (DOCX)",
        xlsx: "Excel (XLSX)", pptx: "PowerPoint (PPTX)", mp3: "MP3 (audio)", m4a: "M4A (audio)",
        wav: "WAV (audio)", mp4: "MP4 (vídeo)", webm: "WebM (vídeo)", gif: "GIF animado",
    };
    return especiales[f] ?? f.toUpperCase();
}

function sinAcentos(s: string): string {
    return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

/**
 * Elige el archivo que la persona nombró («el informe de octubre», «informe.pdf»)
 * entre los suyos: nombre exacto > empieza igual > lo contiene > más palabras en
 * común; a igualdad, el que tiene la misma extensión y el primero de la lista
 * (los más recientes van primero). Null si nada se parece.
 */
export function elegirPorNombre<T extends { name: string }>(lista: T[], consulta: string): T | null {
    const q = sinAcentos(consulta).replace(/^(el|la|los|las|mi|mis)\s+/, "");
    if (!q) return null;
    const extQ = q.includes(".") ? formatoDe(q) : "";
    const palabras = q.split(/[^a-z0-9ñ]+/).filter((p) => p.length > 2);
    let mejor: { t: T; p: number } | null = null;
    for (const t of lista) {
        const n = sinAcentos(t.name ?? "");
        if (!n) continue;
        const base = n.includes(".") ? n.slice(0, n.lastIndexOf(".")) : n;
        let p = 0;
        if (n === q || base === q) p = 100;
        else if (n.startsWith(q) || base.startsWith(q)) p = 80;
        else if (n.includes(q)) p = 60;
        else {
            const comunes = palabras.filter((w) => n.includes(w)).length;
            p = palabras.length ? Math.round((comunes / palabras.length) * 50) : 0;
        }
        if (p === 0) continue;
        if (extQ && formatoDe(n) === extQ) p += 5;
        if (!mejor || p > mejor.p) mejor = { t, p };
    }
    return mejor && mejor.p >= 25 ? mejor.t : null;
}
