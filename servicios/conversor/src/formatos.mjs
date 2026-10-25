// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Conversor por la malla · formatos (módulo PURO, en .mjs)
// ----------------------------------------------------------------------------
// Copia de la lógica pura de `src/lib/conversion/formatos.ts`: desde un .mjs no
// se puede importar TypeScript, y este servicio necesita lo mismo que el
// servidor HTTP del OS (formato de una cadena, lectura de `filee formats`,
// orden del menú, nombres seguros). Sin red, sin disco, sin `node:*`.
// Contrato: `architecture/conversion-archivos.md`.
// ════════════════════════════════════════════════════════════════════════════

/** Destinos que la gente pide más: van primero (en este orden). */
export const DESTINOS_HABITUALES = [
    "pdf", "docx", "png", "jpg", "webp", "txt", "md", "html", "epub",
    "mp4", "webm", "gif", "mp3", "m4a", "wav", "csv", "xlsx", "json",
    "svg", "glb", "zip", "avif", "heic", "pptx",
];

const ALIAS = { jpeg: "jpg", jpe: "jpg", jfif: "jpg", tif: "tiff", htm: "html", markdown: "md", yml: "yaml" };

const ID_FORMATO = /^[a-z0-9][a-z0-9+_-]{0,15}$/;

/** «md», «.md», «image/png» → «md»/«png». Vacío si no se reconoce. */
export function formatoDe(entrada) {
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
export function esFormatoValido(f) {
    return ID_FORMATO.test(String(f ?? ""));
}

/**
 * Lee la salida de `filee formats <formato>`:
 *   «Markdown (md, markdown) converts to:\n  png, jpg, …\nWith optional engines (…):\n  svg, eps, …»
 * Devuelve null si no tiene esa forma (formato desconocido, error…).
 */
export function leerDestinos(texto) {
    const lineas = String(texto ?? "").split(/\r?\n/);
    const i = lineas.findIndex((l) => /converts to:\s*$/i.test(l));
    if (i < 0) return null;
    const cab = lineas[i].match(/^\s*(.+?)\s*\(([^)]*)\)\s*converts to:\s*$/i);
    if (!cab) return null;
    const out = { nombre: cab[1].trim(), ids: lista(cab[2]), destinos: [], conMotor: [] };
    let modo = "destinos";
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
export function leerListaFormatos(texto) {
    const out = [];
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

/**
 * Orden del menú: primero los habituales (en su orden), luego el resto
 * alfabético. Quita el propio origen y duplicados.
 */
export function ordenarDestinos(destinos, origen = "") {
    const o = formatoDe(origen);
    const unicos = [...new Set(destinos.map((d) => d.toLowerCase()))].filter((d) => esFormatoValido(d) && d !== o);
    const peso = (d) => {
        const i = DESTINOS_HABITUALES.indexOf(d);
        return i < 0 ? 1000 : i;
    };
    return unicos.sort((a, b) => peso(a) - peso(b) || a.localeCompare(b));
}

/** «Viaje a Oaxaca.HEIC» + «jpg» → «Viaje a Oaxaca.jpg». Nunca vacío, nunca con rutas. */
export function nombreDeSalida(nombre, destino) {
    const base = String(nombre ?? "").split(/[\\/]/).pop() ?? "";
    const sinExt = base.includes(".") ? base.slice(0, base.lastIndexOf(".")) : base;
    const limpio = sinExt.replace(/[\u0000-\u001f<>:"|?*]/g, "").trim() || "archivo";
    return `${limpio}.${formatoDe(destino) || destino}`;
}

const TIPOS = {
    pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", webp: "image/webp", gif: "image/gif", avif: "image/avif",
    svg: "image/svg+xml", txt: "text/plain; charset=utf-8", md: "text/markdown; charset=utf-8", html: "text/html; charset=utf-8",
    json: "application/json", csv: "text/csv; charset=utf-8", mp4: "video/mp4", webm: "video/webm", mp3: "audio/mpeg",
    m4a: "audio/mp4", wav: "audio/wav", ogg: "audio/ogg", zip: "application/zip", glb: "model/gltf-binary",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    epub: "application/epub+zip",
};

/** Tipo MIME de un nombre de archivo por su extensión. */
export function tipoDe(nombre) {
    return TIPOS[formatoDe(nombre)] ?? "application/octet-stream";
}

/** Nombre seguro para el disco: sin rutas, sin caracteres raros. */
export function nombreSeguro(nombre) {
    const base = (String(nombre ?? "").split(/[\\/]/).pop() ?? "").normalize("NFC");
    const limpio = base.replace(/[\u0000-\u001f<>:"|?*]/g, "_").replace(/^\.+/, "").slice(-180).trim();
    return limpio || "archivo";
}
