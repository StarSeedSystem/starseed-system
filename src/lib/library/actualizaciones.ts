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
export type CanalActualizacion = "releases" | "tags" | "commits";

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
 * El canal se puede pasar como `payload` completo (lo que usan la ruta y las
 * fichas) o como texto suelto (`"releases"`), la firma antigua y más directa.
 */
type EntradaCanal = PayloadActualizacion | CanalActualizacion | undefined;

function comoPayload(entrada: EntradaCanal): PayloadActualizacion | undefined {
    return typeof entrada === "string" ? { canal: entrada } : entrada;
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

function canalDeGitHub(entrada?: EntradaCanal): "commits" | "releases" | "tags" {
    const payload = comoPayload(entrada);
    if (validarPatronTag(payload?.patronTag).patron) return "tags";
    if (payload?.canal === "tags") return "tags";
    if (payload?.canal === "releases") return "releases";
    return "commits";
}

/**
 * A qué URL pública hay que pedir para saber la versión de un upstream.
 * Un `trasladadoA: "codeberg:dueño/repo"` manda la consulta a Codeberg
 * (primero releases; el respaldo a tags lo hace `consultarCodeberg` con el
 * `fetch` en cadena). GitHub → commits, releases o tags según `payload`; si
 * hay un `patronTag` válido manda el canal de etiquetas. Hugging Face →
 * ficha del modelo. Un patrón inválido se ignora (vuelve al canal sin filtro).
 * Cualquier otra forma devuelve null.
 */
export function urlDeConsulta(upstream: string, entrada?: EntradaCanal): string | null {
    const payload = comoPayload(entrada);
    const traslado = rutaTrasladoCodeberg(payload?.trasladadoA);
    if (traslado) return urlCodeberg(traslado, "releases");
    const github = RE_GITHUB.exec(upstream);
    if (github) {
        const ruta = github[1].replace(/\.git$/, "");
        const canal = canalDeGitHub(payload);
        if (canal === "tags") return `https://api.github.com/repos/${ruta}/tags?per_page=100`;
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
 * Saca `{version, fecha}` del JSON de la consulta: sha corto y fecha del
 * commit en GitHub (lista), la primera etiqueta que case con `patronTag`, la
 * última release, o `sha`/`lastModified` del modelo en HF (objeto). Sin
 * etiqueta coincidente devuelve null: no se inventa una versión.
 */
export function leerVersion(
    upstream: string,
    json: unknown,
    entrada?: EntradaCanal,
): VersionLeida | null {
    const payload = comoPayload(entrada);
    if (rutaTrasladoCodeberg(payload?.trasladadoA)) return leerVersionCodeberg(json);
    if (RE_GITHUB.test(upstream)) {
        const canal = canalDeGitHub(payload);
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

/** Quita la «v» inicial de una etiqueta y la deja comparable; vacía → null. */
function normalizarTag(valor: string): string | null {
    const limpio = valor.trim().replace(/^v/i, "");
    return limpio.length > 0 ? limpio : null;
}

/**
 * Compara identificadores del mismo tipo:
 * · los dos shas → por prefijo (como siempre);
 * · los dos tags → normalizados (sin «v» inicial) por igualdad textual:
 *   iguales → «igual», distintos → «hay-actualizacion»;
 * · mezcla de sha y tag, o texto que no es ni una cosa ni la otra →
 *   «desconocida»: no se inventa una alarma.
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
        const local = normalizarTag(instalada);
        const upstream = normalizarTag(remota);
        if (!local || !upstream) return "desconocida";
        return local === upstream ? "igual" : "hay-actualizacion";
    }
    return "desconocida";
}
