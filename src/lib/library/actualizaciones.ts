// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Biblioteca · Actualizaciones de fuentes (JV12 · Ola 360)
// ------------------------------------------------------------------------------
// Módulo PURO (sin fs ni node:*): construye la URL pública de consulta de cada
// upstream, extrae la versión remota de la respuesta JSON y compara versiones.
// Importable desde componentes de cliente.
//
// Canales por `payload`: commits (por defecto), releases y tags. En tags,
// `payload.patronTag` filtra por expresión regular: RuView publica releases
// numéricas de CI y sus versiones reales son las etiquetas ruview-harness-*.
// El canal también puede pedirse directo como segunda cadena (RLB1020Bd):
// urlDeConsulta(upstream, "releases"), equivalente a pasar payload.canal.
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

/** Segundo parámetro aceptado: el canal directo o el payload del paquete. */
export type OpcionesActualizacion = CanalActualizacion | PayloadActualizacion;

function opcionesDe(opciones?: OpcionesActualizacion): {
    payload?: PayloadActualizacion;
    canalDirecto?: CanalActualizacion;
} {
    if (opciones === "releases" || opciones === "tags" || opciones === "commits") {
        return { canalDirecto: opciones };
    }
    if (opciones && typeof opciones === "object") {
        return { payload: opciones as PayloadActualizacion };
    }
    return {};
}

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

function canalDeGitHub(
    payload?: PayloadActualizacion,
    canalDirecto?: CanalActualizacion,
): "releases" | "tags" | "commits" {
    if (canalDirecto === "releases") return "releases";
    if (canalDirecto === "tags") return "tags";
    if (canalDirecto === "commits") return "commits";
    if (validarPatronTag(payload?.patronTag).patron) return "tags";
    if (payload?.canal === "tags") return "tags";
    if (payload?.canal === "releases") return "releases";
    return "commits";
}

/**
 * A qué URL pública hay que pedir para saber la versión de un upstream.
 * GitHub → commits, releases o tags según el canal: el segundo parámetro
 * acepta el canal directo (una cadena, p. ej. "releases") o el `payload` del
 * paquete; si hay un `patronTag` válido manda el canal de etiquetas y pide
 * 100 etiquetas para poder filtrar. Hugging Face → ficha del modelo (el canal
 * se ignora). Un patrón inválido se ignora (vuelve al canal sin filtro).
 * Cualquier otra forma devuelve null; sin canal, igual que siempre.
 */
export function urlDeConsulta(
    upstream: string,
    opciones?: OpcionesActualizacion,
): string | null {
    const { payload, canalDirecto } = opcionesDe(opciones);
    const github = RE_GITHUB.exec(upstream);
    if (github) {
        const ruta = github[1].replace(/\.git$/, "");
        const canal = canalDeGitHub(payload, canalDirecto);
        if (canal === "tags") {
            const patron = validarPatronTag(payload?.patronTag).patron;
            return patron
                ? `https://api.github.com/repos/${ruta}/tags?per_page=100`
                : `https://api.github.com/repos/${ruta}/tags?per_page=1`;
        }
        if (canal === "releases") {
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

function leerEtiqueta(json: unknown, payload?: PayloadActualizacion): VersionLeida | null {
    if (!Array.isArray(json)) return null;
    const { patron } = validarPatronTag(payload?.patronTag);
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
 * Saca `{version, fecha}` del JSON de la consulta, según el canal: la release
 * da `tag_name`/`published_at`; tags, el `name` de la etiqueta que case con
 * `patronTag` (o el primero); commits, el sha corto y la fecha del commit
 * (como siempre); HF, `sha`/`lastModified` del modelo (el canal se ignora).
 * El tercer parámetro acepta el canal directo o el `payload` del paquete.
 * Sin etiqueta ni commit legible devuelve null: no se inventa una versión.
 */
export function leerVersion(
    upstream: string,
    json: unknown,
    opciones?: OpcionesActualizacion,
): VersionLeida | null {
    const { payload, canalDirecto } = opcionesDe(opciones);
    if (RE_GITHUB.test(upstream)) {
        const canal = canalDeGitHub(payload, canalDirecto);
        if (canal === "tags") return leerEtiqueta(json, payload);
        if (canal === "releases") return leerRelease(json);
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
const RE_ETIQUETA = /^[A-Za-z0-9.+\-_~]{1,60}$/;

/**
 * Compara identificadores del mismo tipo:
 * · los dos shas → comparación por prefijo (como siempre);
 * · los dos tags → se quita la «v» inicial y se compara por igualdad
 *   textual: iguales → «igual», distintos → «hay-actualizacion». Un tag no
 *   es un sha, pero versión contra versión sí dice algo;
 * · mezcla de sha y tag, o cadenas que no son ni shas ni tags (con espacios,
 *   barras…) ni una versión manual como «1.0.0» contra un sha → «desconocida»:
 *   no demuestran ni igualdad ni cambio.
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
    if (
        !localEsSha &&
        !remotaEsSha &&
        RE_ETIQUETA.test(instalada) &&
        RE_ETIQUETA.test(remota)
    ) {
        const sinV = (tag: string) => tag.replace(/^v/i, "");
        return sinV(instalada) === sinV(remota) ? "igual" : "hay-actualizacion";
    }
    return "desconocida";
}
