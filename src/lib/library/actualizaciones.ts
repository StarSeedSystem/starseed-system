// ══════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Biblioteca · Actualizaciones de fuentes (JV12 · Ola 360)
// ------------------------------------------------------------------------------
// Módulo PURO (sin fs ni node:*): construye la URL pública de consulta de cada
// upstream, extrae la versión remota de la respuesta JSON y compara versiones.
// Importable desde componentes de cliente.
// ═════════════════════════════════════════════════════════════════════════════

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
 * GitHub → según canal: releases, tags o commits (por defecto).
 * Hugging Face → ficha del modelo (canal ignorado).
 * Cualquier otra forma devuelve null.
 */
export function urlDeConsulta(
    upstream: string,
    canal?: 'releases' | 'tags' | 'commits'
): string | null {
    const github = RE_GITHUB.exec(upstream);
    if (github) {
        const ruta = github[1].replace(/\.git$/, "");
        switch (canal) {
            case 'releases':
                return `https://api.github.com/repos/${ruta}/releases/latest`;
            case 'tags':
                return `https://api.github.com/repos/${ruta}/tags?per_page=1`;
            default: // commits o undefined
                return `https://api.github.com/repos/${ruta}/commits?per_page=1`;
        }
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
 * Saca `{version, fecha}` del JSON de la consulta:
 * - GitHub releases: { tag_name, published_at }
 * - GitHub tags: array[0].name (fecha: null)
 * - GitHub commits: array[0].sha corto y fecha del commit
 * - Hugging Face: sha corto y lastModified
 * Si no se puede leer nada, devuelve null.
 */
export function leerVersion(
    upstream: string,
    json: unknown,
    canal?: 'releases' | 'tags' | 'commits'
): VersionLeida | null {
    const githubUrl = urlDeConsulta(upstream, canal);
    if (githubUrl && githubUrl.includes("api.github.com")) {
        // GitHub
        if (canal === 'releases') {
            const release = json as { tag_name?: unknown; published_at?: unknown };
            if (esCadena(release?.tag_name)) {
                return { version: release.tag_name, fecha: esCadena(release?.published_at) ? release.published_at : null };
            }
            return null;
        }
        if (canal === 'tags') {
            // URL: /tags?per_page=1 -> array de un tag
            if (Array.isArray(json) && json.length > 0) {
                const tag = json[0] as { name?: unknown };
                if (esCadena(tag?.name)) {
                    return { version: tag.name, fecha: null };
                }
            }
            return null;
        }
        // default: commits
        if (!Array.isArray(json) || json.length === 0) return null;
        const primero = json[0] as { sha?: unknown; commit?: { committer?: { date?: unknown } } };
        if (!esCadena(primero?.sha)) return null;
        const fecha = primero.commit?.committer?.date;
        return { version: primero.sha.slice(0, 7), fecha: esCadena(fecha) ? fecha : null };
    }
    if (urlDeConsulta(upstream)?.includes("huggingface.co/api")) {
        // Hugging Face (canal ignorado)
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
 * Compara identificadores del mismo tipo.
 * - Si ambos son SHAs: compara por prefijo (como antes).
 * - Si ambos son tags (no SHAs): normaliza quitando 'v' inicial y compara igualdad textual.
 * - En cualquier otro caso (incluido mezclar SHA y tag): desconocida.
 */
export function compararVersiones(
    instalada: string | null | undefined,
    remota: string | null | undefined,
): EstadoActualizacion {
    if (!instalada || !remota) return "desconocida";
    const isSHA = (s: string): boolean => RE_SHA.test(s);
    const instaladaIsSHA = isSHA(instalada);
    const remotaIsSHA = isSHA(remota);
    if (instaladaIsSHA && remotaIsSHA) {
        const local = instalada.toLowerCase();
        const upstream = remota.toLowerCase();
        return local.startsWith(upstream) || upstream.startsWith(local)
            ? "igual"
            : "hay-actualizacion";
    }
    if (!instaladaIsSHA && !remotaIsSHA) {
        // Ambos no son SHAs: los tratamos como tags
        const normalizeTag = (s: string): string =>
            s.replace(/^v/i, ""); // quita 'v' inicial (case-insensitive)
        const localNorm = normalizeTag(instalada);
        const upstreamNorm = normalizeTag(remota);
        return localNorm === upstreamNorm ? "igual" : "hay-actualizacion";
    }
    // Uno es SHA y el otro no: desconocida
    return "desconocida";
}