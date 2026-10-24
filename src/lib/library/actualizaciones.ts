// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Biblioteca · Actualizaciones de fuentes (JV12 · Ola 360)
// ------------------------------------------------------------------------------
// Módulo PURO (sin fs ni node:*): construye la URL pública de consulta de cada
// upstream, extrae la versión remota de la respuesta JSON y compara versiones.
// Importable desde componentes de cliente.
//
// Canales (RLB1020Bd): commits (por defecto), releases y tags. Se pueden pasar
// como texto (`"releases"`) o como `payload` con `canal`; en tags,
// `payload.patronTag` filtra por expresión regular: RuView publica releases
// numéricas de CI y sus versiones reales son las etiquetas ruview-harness-*.
// ════════════════════════════════════════════════════════════════════════════

/* ───────────────────────────── Tipos ───────────────────────────── */

export type EstadoActualizacion = "igual" | "hay-actualizacion" | "desconocida";

/** Canal por el que se sigue la versión de un upstream de GitHub. */
export type CanalActualizacion = "releases" | "tags" | "commits";

export interface VersionLeida {
    version: string;
    fecha: string | null;
}

/** Datos del paquete que eligen el canal de consulta. */
export interface PayloadActualizacion {
    canal?: unknown;
    patronTag?: unknown;
}

/** El segundo argumento puede ser el canal como texto o el payload del paquete. */
export type CanalOPayload = CanalActualizacion | PayloadActualizacion;

/* ─────────────────── Validación del patrón de etiqueta ─────────────────── */

export const MAX_LONGITUD_PATRON_TAG = 80;

export interface PatronTagValidado {
    patron: RegExp | null;
    error: string | null;
}

/**
 * Valida `payload.patronTag` (texto) antes de usarlo. Máximo 80 caracteres;
 * si `new RegExp` lanza, se ignora y se devuelve el motivo para poder decirlo.
 */
export function validarPatronTag(texto: unknown): PatronTagValidado {
    if (typeof texto !== "string" || texto.trim() === "") {
        return { patron: null, error: "El patrón de etiqueta está vacío." };
    }
    if (texto.length > MAX_LONGITUD_PATRON_TAG) {
        return {
            patron: null,
            error: `El patrón de etiqueta supera los ${MAX_LONGITUD_PATRON_TAG} caracteres.`,
        };
    }
    try {
        return { patron: new RegExp(texto), error: null };
    } catch {
        return { patron: null, error: "El patrón de etiqueta no es una expresión regular válida." };
    }
}

/* ───────────────────── URL pública de consulta ───────────────────── */

const RE_GITHUB = /^https?:\/\/github\.com\/([^/\s]+\/[^/\s]+?)(?:\/.*)?$/;
const RE_HF = /^https?:\/\/huggingface\.co\/([^/\s]+\/[^/\s]+?)(?:\/.*)?$/;

interface CanalElegido {
    canal: CanalActualizacion;
    patron: RegExp | null;
}

const SOLO_COMMITS: CanalElegido = { canal: "commits", patron: null };

/**
 * Valora el segundo argumento de `urlDeConsulta`/`leerVersion`: un texto
 * (`"releases"` | `"tags"` | `"commits"`) o un `payload` con `canal` y, en
 * tags, `patronTag`. Un patrón válido manda, porque refina el canal de
 * etiquetas; uno inválido se ignora y cae al canal que toque.
 */
function elegirCanal(opcion?: CanalOPayload): CanalElegido {
    if (typeof opcion === "string") {
        if (opcion === "tags" || opcion === "releases") return { canal: opcion, patron: null };
        return SOLO_COMMITS;
    }
    const patron = validarPatronTag(opcion?.patronTag).patron;
    if (patron) return { canal: "tags", patron };
    if (opcion?.canal === "tags") return { canal: "tags", patron: null };
    if (opcion?.canal === "releases") return { canal: "releases", patron: null };
    return SOLO_COMMITS;
}

/**
 * A qué URL pública hay que pedir para saber la versión de un upstream.
 * GitHub → commits, releases o tags según el canal (texto o payload); si hay
 * un `patronTag` válido manda el canal de etiquetas y pide suficientes para
 * poder filtrar. Hugging Face → ficha del modelo. Cualquier otra forma
 * devuelve null.
 */
export function urlDeConsulta(upstream: string, canal?: CanalOPayload): string | null {
    const github = RE_GITHUB.exec(upstream);
    if (github) {
        const ruta = github[1].replace(/\.git$/, "");
        const elegido = elegirCanal(canal);
        if (elegido.canal === "tags") {
            const limite = elegido.patron ? 100 : 1;
            return `https://api.github.com/repos/${ruta}/tags?per_page=${limite}`;
        }
        if (elegido.canal === "releases") {
            return `https://api.github.com/repos/${ruta}/releases/latest`;
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

function leerEtiqueta(json: unknown, patron: RegExp | null): VersionLeida | null {
    if (!Array.isArray(json)) return null;
    for (const item of json) {
        const etiqueta = item as { name?: unknown };
        if (!esCadena(etiqueta?.name)) continue;
        if (patron) {
            patron.lastIndex = 0;
            if (!patron.test(etiqueta.name)) continue;
        }
        return { version: etiqueta.name, fecha: null };
    }
    return null;
}

function leerRelease(json: unknown): VersionLeida | null {
    const release = json as { tag_name?: unknown; published_at?: unknown };
    if (!esCadena(release?.tag_name)) return null;
    return {
        version: release.tag_name,
        fecha: esCadena(release.published_at) ? release.published_at : null,
    };
}

/**
 * Saca `{version, fecha}` del JSON de la consulta, según el canal (texto o
 * payload): sha corto y fecha del commit en GitHub (lista), la primera
 * etiqueta que case con `patronTag`, la última release
 * (`tag_name`/`published_at`), o `sha`/`lastModified` del modelo en HF
 * (objeto). Sin etiqueta coincidente devuelve null: no se inventa una
 * versión.
 */
export function leerVersion(upstream: string, json: unknown, canal?: CanalOPayload): VersionLeida | null {
    if (RE_GITHUB.test(upstream)) {
        const elegido = elegirCanal(canal);
        if (elegido.canal === "tags") return leerEtiqueta(json, elegido.patron);
        if (elegido.canal === "releases") return leerRelease(json);
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

/** Quita la «v» inicial y el caso, para comparar tags por igualdad textual. */
function normalizarTag(tag: string): string {
    return tag.replace(/^v/i, "").toLowerCase();
}

/**
 * Compara identificadores del mismo tipo:
 * · los dos shas → comparación por prefijo (como siempre);
 * · los dos tags (un tag no es un sha) → se normaliza (sin «v» inicial) y
 *   se compara por igualdad textual: iguales → «igual», distintos →
 *   «hay-actualizacion»;
 * · mezcla de sha y tag, o un lado vacío → «desconocida», porque un tag no
 *   demuestra nada de un sha y viceversa.
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
        return normalizarTag(instalada) === normalizarTag(remota)
            ? "igual"
            : "hay-actualizacion";
    }
    return "desconocida";
}
