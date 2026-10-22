// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Biblioteca · Actualizaciones de fuentes (JV12 · Ola 360)
// ------------------------------------------------------------------------------
// Módulo PURO (sin fs ni node:*): construye la URL pública de consulta de cada
// upstream, extrae la versión remota de la respuesta JSON y compara versiones.
// Importable desde componentes de cliente.
// ════════════════════════════════════════════════════════════════════════════

/* ───────────────────────────── Tipos ───────────────────────────── */

export type EstadoActualizacion = "igual" | "hay-actualizacion" | "desconocida";

export interface VersionLeida {
    version: string;
    fecha: string | null;
}

export interface PatronTag {
    regex: RegExp | null;
    aviso: string | null;
}

/* ───────────────────── Patrón de etiquetas ───────────────────── */

const MAX_PATRON_TAG = 80;

/**
 * Valida `payload.patronTag` (expresión regular en texto, como la declara el
 * catálogo de RuView: `^ruview-harness-`). Un patrón ausente no activa el canal
 * de etiquetas; uno inválido o de más de 80 caracteres se ignora y se devuelve
 * el motivo para que la ficha pueda decirlo sin inventar una versión.
 */
export function leerPatronTag(valor: unknown): PatronTag {
    if (valor === undefined || valor === null) return { regex: null, aviso: null };
    if (typeof valor !== "string") {
        return { regex: null, aviso: "El patrón de etiquetas debe ser texto: se ignora." };
    }
    if (valor.trim() === "") {
        return { regex: null, aviso: "El patrón de etiquetas está vacío: se ignora." };
    }
    if (valor.length > MAX_PATRON_TAG) {
        return {
            regex: null,
            aviso: `El patrón de etiquetas supera ${MAX_PATRON_TAG} caracteres: se ignora.`,
        };
    }
    try {
        return { regex: new RegExp(valor), aviso: null };
    } catch {
        return {
            regex: null,
            aviso: "El patrón de etiquetas no es una expresión regular válida: se ignora.",
        };
    }
}

/* ───────────────────── URL pública de consulta ───────────────────── */

const RE_GITHUB = /^https?:\/\/github\.com\/([^/\s]+\/[^/\s]+?)(?:\/.*)?$/;
const RE_HF = /^https?:\/\/huggingface\.co\/([^/\s]+\/[^/\s]+?)(?:\/.*)?$/;

/**
 * A qué URL pública hay que pedir para saber la versión de un upstream.
 * GitHub → etiquetas (si llega un `patronTag` válido) o último commit del repo;
 * Hugging Face → ficha del modelo. Cualquier otra forma devuelve null.
 */
export function urlDeConsulta(upstream: string, patronTag?: unknown): string | null {
    const github = RE_GITHUB.exec(upstream);
    if (github) {
        const ruta = github[1].replace(/\.git$/, "");
        if (leerPatronTag(patronTag).regex) {
            return `https://api.github.com/repos/${ruta}/tags?per_page=100`;
        }
        return `https://api.github.com/repos/${ruta}/commits?per_page=1`;
    }
    const hf = RE_HF.exec(upstream);
    if (hf) {
        return `https://huggingface.co/api/models/${hf[1]}`;
    }
    return null;
}

/* ───────────────────── Lectura de la respuesta ───────────────────── */

function esCadena(v: unknown): v is string {
    return typeof v === "string" && v.length > 0;
}

/**
 * Saca `{version, fecha}` del JSON de la consulta: con un `patronTag` válido
 * toma la PRIMERA etiqueta de GitHub cuyo nombre case (RuView publica
 * `ruview-harness-*` y sus releases numéricas son solo CI); sin coincidencia
 * devuelve null. Sin patrón lee el sha corto y la fecha del commit, o
 * `sha`/`lastModified` del modelo en HF. Si no hay nada legible, null.
 */
export function leerVersion(
    upstream: string,
    json: unknown,
    patronTag?: unknown,
): VersionLeida | null {
    const esGitHub = urlDeConsulta(upstream)?.includes("api.github.com") === true;
    const patron = leerPatronTag(patronTag).regex;
    if (esGitHub && patron) {
        if (!Array.isArray(json)) return null;
        for (const etiqueta of json) {
            const nombre =
                etiqueta && typeof etiqueta === "object"
                    ? (etiqueta as { name?: unknown }).name
                    : undefined;
            if (esCadena(nombre) && patron.test(nombre)) {
                return { version: nombre, fecha: null };
            }
        }
        return null;
    }
    if (esGitHub) {
        if (!Array.isArray(json) || json.length === 0) return null;
        const primero = json[0] as { sha?: unknown; commit?: { committer?: { date?: unknown } } };
        if (!esCadena(primero?.sha)) return null;
        const fecha = primero.commit?.committer?.date;
        return { version: primero.sha.slice(0, 7), fecha: esCadena(fecha) ? fecha : null };
    }
    if (urlDeConsulta(upstream)?.includes("huggingface.co/api")) {
        const modelo = json as { sha?: unknown; lastModified?: unknown };
        if (!esCadena(modelo?.sha)) return null;
        const fecha = modelo.lastModified;
        return { version: modelo.sha.slice(0, 7), fecha: esCadena(fecha) ? fecha : null };
    }
    return null;
}

/* ───────────────────── Comparación de versiones ───────────────────── */

const RE_SHA = /^[0-9a-f]{7,40}$/i;

/**
 * Compara identificadores del mismo tipo. Los upstream consultados entregan un
 * sha, por lo que una versión manual como «1.0.0» no demuestra ni igualdad ni
 * cambio y debe quedar como «desconocida».
 */
export function compararVersiones(
    instalada: string | null | undefined,
    remota: string | null | undefined,
): EstadoActualizacion {
    if (!instalada || !remota) return "desconocida";
    if (!RE_SHA.test(instalada) || !RE_SHA.test(remota)) return "desconocida";
    const local = instalada.toLowerCase();
    const upstream = remota.toLowerCase();
    return local.startsWith(upstream) || upstream.startsWith(local)
        ? "igual"
        : "hay-actualizacion";
}
