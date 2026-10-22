// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Biblioteca · Actualizaciones de fuentes (JV12 · Ola 360)
// ------------------------------------------------------------------------------
// Módulo PURO (sin fs ni node:*): construye la URL pública de consulta de cada
// upstream, extrae la versión remota de la respuesta JSON y compara versiones.
// Importable desde componentes de cliente.
// ════════════════════════════════════════════════════════════════════════════

/* ───────────────────────────── Tipos ───────────────────────────── */

export type EstadoActualizacion = "igual" | "hay-actualizacion" | "desconocida";

/** Canal por el que se sigue la versión de un upstream de GitHub. */
export type CanalActualizacion = "releases" | "tags" | "commits";

export interface VersionLeida {
    version: string;
    fecha: string | null;
}

/* ───────────────────── URL pública de consulta ───────────────────── */

const RE_GITHUB = /^https?:\/\/github\.com\/([^/\s]+\/[^/\s]+?)(?:\/.*)?$/;
const RE_HF = /^https?:\/\/huggingface\.co\/([^/\s]+\/[^/\s]+?)(?:\/.*)?$/;

/**
 * A qué URL pública hay que pedir para saber la versión de un upstream.
 * GitHub → según `canal`: releases (`/releases/latest`), tags (`/tags`) o
 * commits (por defecto, igual que siempre). Hugging Face → ficha del modelo
 * (el canal se ignora). Cualquier otra forma devuelve null.
 */
export function urlDeConsulta(
    upstream: string,
    canal?: CanalActualizacion,
): string | null {
    const github = RE_GITHUB.exec(upstream);
    if (github) {
        const ruta = github[1].replace(/\.git$/, "");
        if (canal === "releases") {
            return `https://api.github.com/repos/${ruta}/releases/latest`;
        }
        if (canal === "tags") {
            return `https://api.github.com/repos/${ruta}/tags?per_page=1`;
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
 * Saca `{version, fecha}` del JSON de la consulta, según el canal:
 * releases → `tag_name`/`published_at`; tags → el `name` del primero (sin
 * fecha); commits → sha corto y fecha del commit (como siempre); Hugging Face
 * → sha corto y `lastModified` (el canal se ignora). Si no se puede leer nada,
 * devuelve null.
 */
export function leerVersion(
    upstream: string,
    json: unknown,
    canal?: CanalActualizacion,
): VersionLeida | null {
    const github = urlDeConsulta(upstream, canal);
    if (github?.includes("api.github.com")) {
        if (canal === "releases") {
            const release = json as { tag_name?: unknown; published_at?: unknown };
            if (!esCadena(release?.tag_name)) return null;
            const fecha = release.published_at;
            return { version: release.tag_name, fecha: esCadena(fecha) ? fecha : null };
        }
        if (canal === "tags") {
            if (!Array.isArray(json) || json.length === 0) return null;
            const primero = json[0] as { name?: unknown };
            if (!esCadena(primero?.name)) return null;
            return { version: primero.name, fecha: null };
        }
        if (!Array.isArray(json) || json.length === 0) return null;
        const primero = json[0] as { sha?: unknown; commit?: { committer?: { date?: unknown } } };
        if (!esCadena(primero?.sha)) return null;
        const fecha = primero.commit?.committer?.date;
        return { version: primero.sha.slice(0, 7), fecha: esCadena(fecha) ? fecha : null };
    }
    if (urlDeConsulta(upstream, canal)?.includes("huggingface.co/api")) {
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
 * Compara identificadores del mismo tipo:
 * · los dos shas → comparación por prefijo (como siempre);
 * · los dos tags → se normaliza (sin «v» inicial) y se comparan por igualdad
 *   textual: iguales → «igual», distintos → «hay-actualizacion»;
 * · mezcla de sha y tag → «desconocida» (un tag no demuestra nada de un sha).
 */
export function compararVersiones(
    instalada: string | null | undefined,
    remota: string | null | undefined,
): EstadoActualizacion {
    if (!instalada || !remota) return "desconocida";
    const localEsSha = RE_SHA.test(instalada);
    const remotaEsSha = RE_SHA.test(remota);
    if (localEsSha && remotaEsSha) {
        const local = instalada.toLowerCase();
        const upstream = remota.toLowerCase();
        return local.startsWith(upstream) || upstream.startsWith(local)
            ? "igual"
            : "hay-actualizacion";
    }
    if (!localEsSha && !remotaEsSha) {
        const sinV = (tag: string): string => tag.replace(/^v/i, "");
        return sinV(instalada) === sinV(remota) ? "igual" : "hay-actualizacion";
    }
    return "desconocida";
}
