/**
 * Exportar mis ajustes locales (PURO).
 * ─────────────────────────────────────────────────────────────────────────────
 * «Exportar mis ajustes locales» descarga un JSON con las preferencias de
 * StarSeed que viven en ESTE navegador, para que la persona vea (y guarde) lo
 * que el sistema recuerda de ella. Es un archivo que se va a mover, adjuntar o
 * subir a cualquier sitio, así que la regla es no llevar NADA que sirva para
 * entrar en una cuenta o gastar un servicio:
 *
 *   1. Solo claves `starseed.*` (lo demás no es nuestro).
 *   2. Fuera toda clave cuyo NOMBRE contenga token/key/secret/auth/password/
 *      session (y otras palabras de credencial). Es deliberadamente amplio: más
 *      vale dejar fuera una preferencia inocente que filtrar una credencial.
 *   3. Fuera las claves que el propio OS marca como secretas aunque su nombre
 *      no lo diga (p. ej. `starseed.ai.providers`): se reciben como predicado
 *      para no acoplar este módulo puro al motor de sincronización.
 *   4. Dentro de los valores JSON, se podan los CAMPOS con nombre de secreto
 *      (un chat puede guardar `apiKey` dentro de un objeto con nombre inocente).
 */

/** Palabras que convierten una clave en sensible (se comparan en minúsculas). */
export const PALABRAS_SENSIBLES: readonly string[] = [
    "token",
    "key",
    "secret",
    "auth",
    "password",
    "session",
    // Defensa extra: variantes de credencial que no contienen las anteriores.
    "passwd",
    "passphrase",
    "credential",
    "cred",
    "cookie",
    "bearer",
    "jwt",
    "private",
    "salt",
    "verifier",
];

/** ¿El nombre de la clave (o de un campo) delata un secreto? */
export function esClaveSensible(nombre: string): boolean {
    const n = nombre.toLowerCase();
    return PALABRAS_SENSIBLES.some((p) => n.includes(p));
}

/** Máximo de niveles que se recorren al podar (evita estructuras patológicas). */
const PROFUNDIDAD_MAXIMA = 12;

/**
 * Quita de un valor JSON todos los campos cuyo nombre es sensible, a cualquier
 * profundidad. Devuelve una copia; nunca modifica la entrada.
 */
export function podarSecretos(valor: unknown, profundidad = 0): unknown {
    if (profundidad > PROFUNDIDAD_MAXIMA) return null;
    if (Array.isArray(valor)) return valor.map((v) => podarSecretos(v, profundidad + 1));
    if (valor && typeof valor === "object") {
        const salida: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
            if (esClaveSensible(k)) continue;
            salida[k] = podarSecretos(v, profundidad + 1);
        }
        return salida;
    }
    return valor;
}

/** Interpreta el texto guardado: JSON si lo es (ya podado), si no el texto tal cual. */
function valorLegible(texto: string): unknown {
    const t = texto.trim();
    if (t.startsWith("{") || t.startsWith("[")) {
        try {
            return podarSecretos(JSON.parse(t) as unknown);
        } catch {
            return texto;
        }
    }
    return texto;
}

export interface OpcionesExportacion {
    /** Claves que el OS considera secretas por su cuenta (lista de nunca-sincronizar). */
    esSecretaDelSistema?: (clave: string) => boolean;
    /** Momento de la exportación (inyectable para pruebas). */
    ahora?: Date;
}

export interface ExportacionAjustes {
    formato: "starseed-ajustes-locales";
    version: 1;
    exportado: string;
    /** Cuántas claves se dejaron fuera por seguridad (solo el número, nunca sus nombres). */
    omitidas: number;
    ajustes: Record<string, unknown>;
}

/** Decide si una clave entra en la exportación. */
export function claveExportable(clave: string, esSecretaDelSistema?: (clave: string) => boolean): boolean {
    if (!clave.startsWith("starseed.")) return false;
    if (esClaveSensible(clave)) return false;
    try {
        if (esSecretaDelSistema?.(clave)) return false;
    } catch {
        // Si el predicado falla, se trata como secreta: ante la duda, fuera.
        return false;
    }
    return true;
}

/**
 * Construye el objeto a descargar a partir de pares [clave, valor] (lo que hay
 * en localStorage). Ordena las claves para que dos exportaciones se puedan
 * comparar a simple vista.
 */
export function construirExportacion(
    entradas: Iterable<readonly [string, string]>,
    opciones: OpcionesExportacion = {},
): ExportacionAjustes {
    const ajustes: Record<string, unknown> = {};
    let omitidas = 0;
    const lista = [...entradas].sort(([a], [b]) => a.localeCompare(b));
    for (const [clave, valor] of lista) {
        if (!clave.startsWith("starseed.")) continue;
        if (!claveExportable(clave, opciones.esSecretaDelSistema)) {
            omitidas += 1;
            continue;
        }
        ajustes[clave] = valorLegible(valor);
    }
    return {
        formato: "starseed-ajustes-locales",
        version: 1,
        exportado: (opciones.ahora ?? new Date()).toISOString(),
        omitidas,
        ajustes,
    };
}

/** Lee todos los pares de un Storage (localStorage) sin lanzar. */
export function entradasDeStorage(storage: Pick<Storage, "length" | "key" | "getItem">): Array<[string, string]> {
    const pares: Array<[string, string]> = [];
    try {
        for (let i = 0; i < storage.length; i++) {
            const k = storage.key(i);
            if (!k) continue;
            const v = storage.getItem(k);
            if (v !== null) pares.push([k, v]);
        }
    } catch {
        /* modo privado o acceso bloqueado: lo que se haya leído */
    }
    return pares;
}

/** Nombre de archivo con la fecha: «starseed-ajustes-2026-09-25.json». */
export function nombreArchivoExportacion(ahora = new Date()): string {
    return `starseed-ajustes-${ahora.toISOString().slice(0, 10)}.json`;
}
