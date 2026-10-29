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
// Un paquete que se muda puede declarar `payload.trasladadoA` con la forma
// «codeberg:dueño/repo»: la consulta de versiones se sigue allí (Codeberg es
// Forgejo, con API compatible con Gitea).
// ════════════════════════════════════════════════════════════════════════════

/* ───────────────────────────── Tipos ───────────────────────────── */

export type EstadoActualizacion = "igual" | "hay-actualizacion" | "desconocida";

/** Canal por el que se sigue la versión de un upstream de GitHub. */
export type CanalActualizacion = "commits" | "releases" | "tags";

export interface VersionLeida {
    version: string;
    fecha: string | null;
}

/** Datos del paquete que eligen el canal de consulta. */
export interface PayloadActualizacion {
    canal?: unknown;
    patronTag?: unknown;
    /** «codeberg:dueño/repo»: el upstream del paquete se mudó ahí. */
    trasladadoA?: unknown;
}

/**
 * Segundo argumento de `urlDeConsulta`/`leerVersion`: un canal suelto
 * (`"releases"`, `"tags"`, `"commits"`) o el `payload` completo del paquete.
 * Se aceptan las dos formas para no romper a quien ya pasaba el payload.
 */
export type OpcionesActualizacion = CanalActualizacion | PayloadActualizacion;

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

/* ───────────────────── Traslado a Codeberg ───────────────────── */

const RE_TRASLADO_CODEBERG = /^codeberg:([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)$/;

export const BASE_CODEBERG = "https://codeberg.org";

/**
 * «dueño/repo» de un `payload.trasladadoA` con la forma `codeberg:dueño/repo`.
 * Otra forja, otra forma o caracteres inválidos: null (no se sigue el traslado).
 */
export function rutaTrasladoCodeberg(trasladadoA: unknown): string | null {
    if (typeof trasladadoA !== "string") return null;
    const m = RE_TRASLADO_CODEBERG.exec(trasladadoA.trim());
    return m ? m[1] : null;
}

function urlCodeberg(ruta: string, endpoint: "releases" | "tags"): string {
    return `${BASE_CODEBERG}/api/v1/repos/${ruta}/${endpoint}?limit=1`;
}

/* ───────────────────── URL pública de consulta ───────────────────── */

const RE_GITHUB = /^https?:\/\/github\.com\/([^/\s]+\/[^/\s]+?)(?:\/.*)?$/;
const RE_HF = /^https?:\/\/huggingface\.co\/([^/\s]+\/[^/\s]+?)(?:\/.*)?$/;

function canalDeGitHub(payload?: PayloadActualizacion): CanalActualizacion {
    if (validarPatronTag(payload?.patronTag).patron) return "tags";
    if (payload?.canal === "tags") return "tags";
    if (payload?.canal === "releases") return "releases";
    return "commits";
}

/** Canal efectivo: acepta un canal suelto o el `payload` del paquete. */
function canalDe(opciones?: OpcionesActualizacion): CanalActualizacion {
    if (typeof opciones === "string") return opciones;
    return canalDeGitHub(opciones);
}

function payloadDe(opciones?: OpcionesActualizacion): PayloadActualizacion | undefined {
    return typeof opciones === "string" || !opciones ? undefined : opciones;
}

/**
 * A qué URL pública hay que pedir para saber la versión de un upstream.
 * Un `trasladadoA: "codeberg:dueño/repo"` manda la consulta a Codeberg
 * (primero releases; el respaldo a tags lo hace `consultarCodeberg` con el
 * `fetch` en cadena). GitHub → commits (por defecto), releases
 * (`/releases/latest`) o tags (`/tags?per_page=1`) según el canal; si hay un
 * `patronTag` válido manda el canal de etiquetas y se piden 100 para poder
 * filtrar. El canal se puede pasar suelto (`"releases"`) o dentro del
 * `payload` del paquete. Hugging Face → ficha del modelo (el canal se ignora).
 * Un patrón inválido se ignora (vuelve al canal sin filtro). Cualquier otra
 * forma devuelve null.
 */
export function urlDeConsulta(
    upstream: string,
    opciones?: OpcionesActualizacion,
): string | null {
    const payload = payloadDe(opciones);
    const traslado = rutaTrasladoCodeberg(payload?.trasladadoA);
    if (traslado) return urlCodeberg(traslado, "releases");
    const github = RE_GITHUB.exec(upstream);
    if (github) {
        const ruta = github[1].replace(/\.git$/, "");
        const canal = canalDe(opciones);
        if (canal === "tags") {
            const perPage = validarPatronTag(payload?.patronTag).patron ? 100 : 1;
            return `https://api.github.com/repos/${ruta}/tags?per_page=${perPage}`;
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
    const candidatas: string[] = [];
    for (const item of json) {
        const etiqueta = item as { name?: unknown };
        if (!esCadena(etiqueta?.name)) continue;
        if (patron) {
            patron.lastIndex = 0;
            if (!patron.test(etiqueta.name)) continue;
        }
        candidatas.push(etiqueta.name);
    }
    if (candidatas.length === 0) return null;
    // Si hay patrón (caso típico de repo-blender con muchas etiquetas), elegir la MÁS ALTA
    if (patron && payload?.patronTag) {
        let mejor = candidatas[0];
        let mejorNums = extraerNumerosVersion(mejor);
        for (let i = 1; i < candidatas.length; i++) {
            const c = candidatas[i];
            const cNums = extraerNumerosVersion(c);
            const cmp = compararTuplasVersion(cNums, mejorNums);
            if (cmp > 0) {
                mejor = c;
                mejorNums = cNums;
            } else if (cmp === 0 && mejorNums) {
                // Si numéricamente igual, preferir la más larga o mantener
            }
        }
        return { version: mejor, fecha: null };
    }
    return { version: candidatas[0], fecha: null };
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
 * Saca `{version, fecha}` del JSON de la consulta según el canal (suelto o
 * dentro del `payload`): releases → `tag_name`/`published_at`; tags → la
 * primera etiqueta (filtrada por `patronTag` si lo hay, sin fecha); commits →
 * sha corto y fecha del commit (como siempre); Hugging Face → sha corto y
 * `lastModified` del modelo (el canal se ignora). Sin nada legible devuelve
 * null: no se inventa una versión.
 */
export function leerVersion(
    upstream: string,
    json: unknown,
    opciones?: OpcionesActualizacion,
): VersionLeida | null {
    const payload = payloadDe(opciones);
    if (rutaTrasladoCodeberg(payload?.trasladadoA)) return leerVersionCodeberg(json);
    if (RE_GITHUB.test(upstream)) {
        const canal = canalDe(opciones);
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

/**
 * Saca `{version, fecha}` del JSON de Codeberg (Forgejo): releases con
 * `tag_name`/`published_at` o etiquetas con `name`. Sin nada legible devuelve
 * null: no se inventa una versión (el respaldo a tags lo decide la consulta).
 */
export function leerVersionCodeberg(json: unknown): VersionLeida | null {
    if (!Array.isArray(json) || json.length === 0) return null;
    const primero = json[0] as { tag_name?: unknown; published_at?: unknown; name?: unknown };
    if (esCadena(primero?.tag_name)) {
        return {
            version: primero.tag_name,
            fecha: esCadena(primero.published_at) ? primero.published_at : null,
        };
    }
    return esCadena(primero?.name) ? { version: primero.name, fecha: null } : null;
}

/* ───────────────────── Consulta de Codeberg (fetch inyectado) ───────────────────── */

/** Resultado de `consultarCodeberg`: una versión o el motivo honesto de no tenerla. */
export type LecturaCodeberg =
    | { version: string; fecha: string | null; error: null }
    | { version: null; fecha: null; error: string };

/**
 * Sigue un traslado a Codeberg (`codeberg:dueño/repo`) hasta su versión.
 * Codeberg es Forgejo con API compatible con Gitea: pregunta releases y, si
 * no hay, etiquetas. El `fetch` va inyectado para que el módulo siga puro
 * (pruebas sin red). El error es honesto: dice qué falló, sin inventar nada.
 */
export async function consultarCodeberg(
    trasladadoA: unknown,
    fetchFn: typeof fetch,
): Promise<LecturaCodeberg> {
    const ruta = rutaTrasladoCodeberg(trasladadoA);
    if (!ruta) {
        return {
            version: null,
            fecha: null,
            error: "El traslado a Codeberg no tiene la forma codeberg:dueño/repo.",
        };
    }
    let motivo = `No hay versión ni etiqueta en Codeberg para ${ruta}.`;
    for (const endpoint of ["releases", "tags"] as const) {
        try {
            const respuesta = await fetchFn(urlCodeberg(ruta, endpoint), {
                headers: { Accept: "application/json", "User-Agent": "starseed-os-biblioteca" },
            });
            if (!respuesta.ok) {
                motivo = `Codeberg respondió ${respuesta.status} al pedir ${endpoint}.`;
                continue;
            }
            const leida = leerVersionCodeberg(await respuesta.json());
            if (leida) return { version: leida.version, fecha: leida.fecha, error: null };
        } catch {
            motivo = `No se pudo consultar ${endpoint} de Codeberg (${ruta}): fallo en la petición.`;
        }
    }
    return { version: null, fecha: null, error: motivo };
}

/* ───────────────────── Comparación de versiones ───────────────────── */

const RE_SHA = /^[0-9a-f]{7,40}$/i;
const RE_TAG_COMPARABLE = /^[0-9a-z][0-9a-z._+-]*$/i;

/** Un tag se normaliza quitando el «v» inicial (v1.2.3 → 1.2.3). */
function normalizarTag(tag: string): string {
    return tag.trim().replace(/^v/i, "");
}

function extraerNumerosVersion(tag: string): number[] | null {
    const normalizado = normalizarTag(tag);
    // Elimina sufijos como " LTS", "release-", separadores comunes
    const sinSufijos = normalizado
        .replace(/\b(lts|rc|beta|alpha|preview|dev)\b/gi, "")
        .replace(/^release[-_.]?/i, "")
        .replace(/[-_+].*$/, "");
    const numeros = sinSufijos.match(/\d+/g);
    if (!numeros || numeros.length === 0) return null;
    return numeros.map((n) => parseInt(n, 10));
}

function compararTuplasVersion(a: number[] | null, b: number[] | null): number {
    if (!a || !b) return 0;
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
        const va = a[i] ?? 0;
        const vb = b[i] ?? 0;
        if (va !== vb) return va > vb ? 1 : -1;
    }
    return 0;
}

/** ¿Es una etiqueta de versión que se puede comparar textualmente? */
function esTagComparable(tag: string): boolean {
    const normalizado = normalizarTag(tag);
    return (
        normalizado.length > 0 &&
        normalizado.length <= 120 &&
        /\d/.test(normalizado) &&
        RE_TAG_COMPARABLE.test(normalizado)
    );
}

/**
 * Compara identificadores del mismo tipo:
 * · dos shas → comparación por prefijo (como siempre);
 * · dos tags → se normalizan (sin «v» inicial) y se comparan por tupla numérica
 *   si es posible; iguales → «igual», si la remota es mayor → «hay-actualizacion»,
 *   si la instalada es mayor o no se puede comparar numéricamente → según corresponda
 *   (para tags con números, comparamos por tupla);
 * · mezcla de sha y tag, o textos que no son etiquetas de versión →
 *   «desconocida» (no se inventa un cambio).
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
    if (localEsSha || remotaEsSha) return "desconocida";
    const localNorm = normalizarTag(instalada);
    const upstreamNorm = normalizarTag(remota);
    if (localNorm === upstreamNorm) return "igual";
    const localNums = extraerNumerosVersion(instalada);
    const remotaNums = extraerNumerosVersion(remota);
    if (localNums && remotaNums) {
        const cmp = compararTuplasVersion(localNums, remotaNums);
        if (cmp === 0) return "igual";
        if (cmp < 0) return "hay-actualizacion";
        return "igual"; // instalada es mayor
    }
    return esTagComparable(instalada) && esTagComparable(remota)
        ? "hay-actualizacion"
        : "desconocida";
}
