/**
 * Receta de limpieza de OpenRefine 3.10.1 como DATO (INV1025F · architecture/repos-libreria-1025.md §3.4).
 *
 * Una receta es la lista de operaciones JSON que OpenRefine exporta («Extraer»), envuelta aquí con la
 * declaración `datos: "publicos"` (R5, R9): toda receta nace para tablas públicas pues el servicio
 * local corre sin autenticación, y porque la reconciliación manda valores a un servicio externo.
 *
 * Lista blanca estricta: solo operaciones de limpieza con expresión GREL y, como única operación con
 * red, la reconciliación contra servicios https de la lista (Wikidata). Fuera: `jython:` y `clojure:`
 * (ejecutan código), `core/column-addition-by-fetching-urls` (SSRF, R10) y toda `op` fuera de la
 * lista. Nombres verificados contra recetas exportadas de OpenRefine 3.10. Puro: sin `node:*`.
 */

const CORE = "core/";

export const DATOS_PUBLICOS = "publicos";
export const MAX_OPERACIONES = 100;
/** Tope de tamaño serializado (≈ bytes) de toda la receta. */
export const MAX_BYTES = 200 * 1024;

/** Claves cuyos valores son expresiones GREL (nombres usados por OpenRefine 3.10). */
const CLAVES_EXPRESION = new Set(["expression", "urlExpression", "url_expression"]);
/** Lenguajes que ejecutan código dentro de una expresión: nunca (R10). */
const LENGUAJES_PROHIBIDOS = ["jython:", "clojure:"];

/** Operaciones de limpieza permitidas (nombres exactos de OpenRefine 3.10). */
export const OPS_PERMITIDAS = new Set([
    `${CORE}text-transform`,
    `${CORE}mass-edit`,
    `${CORE}column-removal`,
    `${CORE}column-rename`,
    `${CORE}column-split`,
    `${CORE}column-addition`,
    `${CORE}blank-down`,
    `${CORE}fill-down`,
    `${CORE}row-removal`,
    `${CORE}multivalued-cell-split`,
    `${CORE}multivalued-cell-join`,
    `${CORE}column-reorder`,
]);

/** Única operación con red admitida; exige servicio https de `SERVICIOS_RECONCILIACION`. */
export const OPS_RECONCILIACION = new Set([`${CORE}recon`]);

/** Servicios de reconciliación permitidos (R5, R9): solo el de Wikidata y sus espejos oficiales. */
export const SERVICIOS_RECONCILIACION = [
    "https://wikidata.reconci.link",
    "https://wikidata.reconci.de",
    "https://wikidata-reconciliation.wmcloud.org",
];

export interface OperacionOpenRefine {
    op: string;
    [clave: string]: unknown;
}

export interface RecetaLimpieza {
    datos: typeof DATOS_PUBLICOS;
    operaciones: OperacionOpenRefine[];
}

export interface VeredictoReceta {
    ok: boolean;
    /** Con ok: la receta declarada en público. */
    receta?: RecetaLimpieza;
    /** Con ok: false, los motivos en español, para mostrar o registrar. */
    errores?: string[];
}

type Diccionario = Record<string, unknown>;

function esObjeto(x: unknown): x is Diccionario {
    return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** Acepta el nombre exacto («core/column-rename») y su forma corta («column-rename»). */
function canonico(op: string): string {
    const limpio = op.trim();
    return limpio.startsWith(CORE) ? limpio : `${CORE}${limpio}`;
}

/** Tamaño serializado (≈ bytes); null si no es JSON (BigInt, ciclos…). */
function Tamano(x: unknown): number | null {
    try {
        return JSON.stringify(x).length;
    } catch {
        return null;
    }
}

/** ¿Servicio https de la lista blanca Wikidata? */
function servicioValido(url: string): boolean {
    try {
        const u = new URL(url);
        return u.protocol === "https:" && SERVICIOS_RECONCILIACION.some((b) => new URL(b).host === u.host);
    } catch {
        return false;
    }
}

/**
 * Recorre la operación en profundidad: rechaza cualquier string con lenguaje prohibido
 * (`jython:`, `clojure:`) y exige que toda expresión declarada empiece por «grel:».
 */
function escanear(valor: unknown, clave: string | null, errores: string[], donde: string, profundidad: number): void {
    if (profundidad > 12 || valor === null || valor === undefined) return;
    if (typeof valor === "string") {
        const texto = valor.toLowerCase();
        if (LENGUAJES_PROHIBIDOS.some((l) => texto.includes(l))) {
            errores.push(`${donde}: solo expresiones GREL; «${clave}» trae otro lenguaje (R10)`);
        } else if (clave !== null && CLAVES_EXPRESION.has(clave) && !texto.startsWith("grel:")) {
            errores.push(`${donde}: toda expresión debe empezar por «grel:»`);
        }
    } else if (typeof valor === "object") {
        for (const [k, v] of Object.entries(valor as Diccionario)) {
            escanear(v, k, errores, donde, profundidad + 1);
        }
    }
}

/** Valida una operación aislada contra la lista blanca y anota los motivos en `errores`. */
function validarOperacion(o: unknown, i: number, errores: string[]): void {
    const donde = `operación ${i + 1}`;
    if (!esObjeto(o) || typeof o.op !== "string") {
        errores.push(`${donde}: falta su «op» textual`);
        return;
    }
    const op = canonico(o.op);
    if (op === `${CORE}column-addition-by-fetching-urls`) {
        errores.push(`${donde}: «${o.op}» descarga URLs desde la receta (SSRF; R10): fuera`);
        return;
    }
    if (!OPS_PERMITIDAS.has(op) && !OPS_RECONCILIACION.has(op)) {
        errores.push(`${donde}: la operación «${o.op}» no está en la lista blanca`);
        return;
    }
    if (OPS_RECONCILIACION.has(op)) {
        const servicio = esObjeto(o.config) ? o.config.service : null;
        if (typeof servicio !== "string" || !servicioValido(servicio)) {
            errores.push(`${donde}: la reconciliación solo admite servicios https de la lista blanca (Wikidata; R5, R9)`);
            return;
        }
    }
    escanear(o, null, errores, donde, 0);
}

/** Valida la receta completa contra la lista blanca. Nunca lanza: devuelve su veredicto. */
export function validarReceta(x: unknown): VeredictoReceta {
    if (!esObjeto(x)) return { ok: false, errores: ["la receta debe ser un objeto con «datos» y «operaciones»"] };
    const errores: string[] = [];
    if (x.datos !== DATOS_PUBLICOS) {
        errores.push(`la receta debe declarar datos: "${DATOS_PUBLICOS}" (R5, R9)`);
    }
    const crudas = x.operaciones;
    if (!Array.isArray(crudas)) {
        errores.push("«operaciones» debe ser la lista de operaciones que OpenRefine exporta");
    } else {
        if (crudas.length > MAX_OPERACIONES) {
            errores.push(`demasiadas operaciones: ${crudas.length} > ${MAX_OPERACIONES}`);
        }
        const tamano = Tamano(x);
        if (tamano === null) errores.push("la receta no se puede serializar a JSON");
        else if (tamano > MAX_BYTES) errores.push(`la receta excede el tope de ${MAX_BYTES}`);
        crudas.forEach((o, i) => validarOperacion(o, i, errores));
    }
    return errores.length
        ? { ok: false, errores }
        : { ok: true, receta: x as unknown as RecetaLimpieza };
}
