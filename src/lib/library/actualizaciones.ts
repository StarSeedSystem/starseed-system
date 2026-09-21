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

/* ───────────────────── URL pública de consulta ───────────────────── */

const RE_GITHUB = /^https?:\/\/github\.com\/([^/\s]+\/[^/\s]+?)(?:\/.*)?$/;
const RE_HF = /^https?:\/\/huggingface\.co\/([^/\s]+\/[^/\s]+?)(?:\/.*)?$/;

/**
 * A qué URL pública hay que pedir para saber la versión de un upstream.
 * GitHub → último commit del repo; Hugging Face → ficha del modelo.
 * Cualquier otra forma devuelve null.
 */
export function urlDeConsulta(upstream: string): string | null {
    const github = RE_GITHUB.exec(upstream);
    if (github) {
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
 * Saca `{version, fecha}` del JSON de la consulta: sha corto y fecha del
 * commit en GitHub (lista), o `sha`/`lastModified` del modelo en HF (objeto).
 * Si no se puede leer nada, devuelve null.
 */
export function leerVersion(upstream: string, json: unknown): VersionLeida | null {
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
 * Compara la versión instalada con la remota.
 * Solo se atreve a decir «hay-actualizacion» cuando AMBAS cosas tienen forma
 * de sha (7-40 hex): si la instalada es una versión escrita a mano («1.0.0»)
 * y la remota es un sha, no son comparables y se dice «desconocida», no
 * alarma. Que no sepamos algo se dice; no se disfraza de aviso.
 */
export function compararVersiones(
    instalada: string | null | undefined,
    remota: string | null | undefined,
): EstadoActualizacion {
    if (!instalada || !remota) return "desconocida";
    if (!RE_SHA.test(instalada) || !RE_SHA.test(remota)) return "desconocida";
    return instalada.toLowerCase() === remota.toLowerCase() ? "igual" : "hay-actualizacion";
}

/**
 * Regla de persistencia para la ruta: el sha remoto se guarda la PRIMERA vez
 * que se ve por fuente, y a partir de ahí se compara sha contra sha.
 * Devuelve el sha que debe quedar registrado como «instalada conocida».
 */
export function resolverInstaladaConocida(
    guardada: string | null | undefined,
    remota: string | null | undefined,
): string | null {
    if (guardada && RE_SHA.test(guardada)) return guardada;
    if (remota && RE_SHA.test(remota)) return remota;
    return null;
}
