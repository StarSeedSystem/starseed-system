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

/* ───────────────── Patrón de etiquetas (RuView) ───────────────── */

export interface PatronTagValidado {
    patron: string | null;
    regex: RegExp | null;
    aviso: string | null;
}

const MAX_PATRON_TAG = 80;

/**
 * Valida el patrón de etiquetas que llega en `payload.patronTag`.
 * Vacío → no hay patrón. Demasiado largo o regex inválida → se ignora y se
 * devuelve el motivo en `aviso` (nunca lanza).
 */
export function validarPatronTag(patron: unknown): PatronTagValidado {
    if (patron === null || patron === undefined || patron === "") {
        return { patron: null, regex: null, aviso: null };
    }
    if (typeof patron !== "string") {
        return {
            patron: null,
            regex: null,
            aviso: "Patrón de etiqueta ignorado: debe ser texto.",
        };
    }
    const texto = patron.trim();
    if (!texto) return { patron: null, regex: null, aviso: null };
    if (texto.length > MAX_PATRON_TAG) {
        return {
            patron: null,
            regex: null,
            aviso: `Patrón de etiqueta ignorado: supera ${MAX_PATRON_TAG} caracteres.`,
        };
    }
    try {
        return { patron: texto, regex: new RegExp(texto), aviso: null };
    } catch {
        return {
            patron: null,
            regex: null,
            aviso: "Patrón de etiqueta ignorado: no es una expresión regular válida.",
        };
    }
}

/* ───────────────────── URL pública de consulta ───────────────────── */

const RE_GITHUB = /^https?:\/\/github\.com\/([^/\s]+\/[^/\s]+?)(?:\/.*)?$/;
const RE_HF = /^https?:\/\/huggingface\.co\/([^/\s]+\/[^/\s]+?)(?:\/.*)?$/;

/** URL de las últimas 100 etiquetas de un repo de GitHub (o null). */
export function urlDeEtiquetas(upstream: string): string | null {
    const github = RE_GITHUB.exec(upstream);
    if (!github) return null;
    const ruta = github[1].replace(/\.git$/, "");
    return `https://api.github.com/repos/${ruta}/tags?per_page=100`;
}

/**
 * A qué URL pública hay que pedir para saber la versión de un upstream.
 * Con `patronTag` válido → etiquetas del repo (RuView solo sigue
 * `ruview-harness-*`); sin patrón → último commit. Hugging Face → ficha.
 * Un patrón inválido se ignora y se cae al canal normal.
 */
export function urlDeConsulta(upstream: string, patronTag?: unknown): string | null {
    const github = RE_GITHUB.exec(upstream);
    if (github) {
        if (validarPatronTag(patronTag).regex) {
            return urlDeEtiquetas(upstream);
        }
        const ruta = github[1].replace(/\.git$/, "");
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
 * Primera etiqueta de la lista `/tags?per_page=100` cuyo nombre case con el
 * patrón, en el orden que devuelve GitHub. Sin patrón válido o sin
 * coincidencias devuelve null: no se inventa una versión.
 */
export function leerEtiqueta(json: unknown, patronTag: unknown): VersionLeida | null {
    const { regex } = validarPatronTag(patronTag);
    if (!regex || !Array.isArray(json)) return null;
    for (const etiqueta of json) {
        const nombre = (etiqueta as { name?: unknown } | null)?.name;
        if (esCadena(nombre) && regex.test(nombre)) {
            return { version: nombre, fecha: null };
        }
    }
    return null;
}

/**
 * Saca `{version, fecha}` del JSON de la consulta: con `patronTag`, la primera
 * etiqueta que case (RuView); sin patrón, sha corto y fecha del commit en
 * GitHub (lista), o `sha`/`lastModified` del modelo en HF (objeto).
 * Si no se puede leer nada, devuelve null.
 */
export function leerVersion(
    upstream: string,
    json: unknown,
    patronTag?: unknown,
): VersionLeida | null {
    if (RE_GITHUB.test(upstream) && validarPatronTag(patronTag).regex) {
        return leerEtiqueta(json, patronTag);
    }
    if (urlDeConsulta(upstream)?.includes("api.github.com")) {
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
