// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Biblioteca · Rotación de consultas de actualizaciones (Ola 1104R)
// ------------------------------------------------------------------------------
// Módulo PURO (sin fs ni node:*): decide qué upstreams se consultan en cada
// pasada y fusiona lo leído con lo ya sabido, sin perder una versión remota
// buena por un fallo de red o porque se agotó el límite de la API.
// ════════════════════════════════════════════════════════════════════════════

/** Una fuente que la Biblioteca puede consultar. */
export interface EntradaRotacion {
    id: string;
    upstream?: string;
}

/** Lo último bueno que se sabe de una fuente. */
export interface ConocidaActualizacion {
    remota: string | null;
    fecha: string | null;
    t: number;
}

/** Lo sabido por id de fuente. */
export type ConocidasActualizacion = Record<string, ConocidaActualizacion>;

/** Lo que devolvió una consulta: `remota: null` cuando no se pudo leer. */
export interface ResultadoConsulta {
    id: string;
    remota: string | null;
    fecha: string | null;
}

/** Tope de la pasada y edad mínima para volver a preguntar. */
export interface OpcionesLote {
    maxLote: number;
    edadMinMs: number;
}

/**
 * Ids que toca consultar en esta pasada: primero los nunca vistos (en el
 * orden de las entradas) y después los más viejos que ya superaron
 * `edadMinMs`, de más antiguo a más reciente. Como mucho `maxLote`. Una
 * fuente sin upstream no se consulta nunca y un id repetido cuenta una vez.
 */
export function loteAConsultar(
    entradas: EntradaRotacion[],
    conocidas: ConocidasActualizacion,
    ahora: number,
    opciones: OpcionesLote,
): string[] {
    const maxLote = Math.max(0, Math.floor(opciones.maxLote));
    if (maxLote === 0) return [];
    const edadMinMs = Math.max(0, opciones.edadMinMs);
    const vistos = new Set<string>();
    const nuevos: string[] = [];
    const viejos: { id: string; t: number; orden: number }[] = [];

    entradas.forEach((entrada, orden) => {
        if (!entrada.id || vistos.has(entrada.id)) return;
        if (entrada.upstream !== undefined && entrada.upstream.trim() === "") return;
        vistos.add(entrada.id);
        const conocida = conocidas[entrada.id];
        if (!conocida) {
            nuevos.push(entrada.id);
            return;
        }
        if (ahora - conocida.t >= edadMinMs) {
            viejos.push({ id: entrada.id, t: conocida.t, orden });
        }
    });

    viejos.sort((a, b) => a.t - b.t || a.orden - b.orden);
    return [...nuevos, ...viejos.map((v) => v.id)].slice(0, maxLote);
}

/** Topes de serie del lote (GitHub da 60 consultas por hora sin token y 5000 con él). */
export interface TopesLote {
    sinToken: number;
    conToken: number;
}

/**
 * Tope del lote de esta pasada. `forzado` (la variable `STARSEED_LOTE_ACTUALIZACIONES`) manda si es
 * un entero positivo escrito tal cual; si no, `conToken` con token y `sinToken` sin él.
 */
export function topeDelLote(
    forzado: string | undefined,
    conToken: boolean,
    topes: TopesLote = { sinToken: 40, conToken: 300 },
): number {
    const texto = (forzado ?? "").trim();
    if (/^\d+$/.test(texto)) {
        const n = Number.parseInt(texto, 10);
        if (n > 0) return n;
    }
    return conToken ? topes.conToken : topes.sinToken;
}

/**
 * Guarda por id `{ remota, fecha, t }` lo leído en la pasada sin mutar lo que
 * ya se sabía. Una remota buena NUNCA se borra por un fallo (`remota: null`):
 * el fallo solo actualiza `t` para no repetir la intentona en cada pasada y,
 * si no había nada bueno, deja constancia honesta de que sigue sin saberse.
 */
export function fusionar(
    conocidas: ConocidasActualizacion,
    resultados: ResultadoConsulta[],
    ahora: number,
): ConocidasActualizacion {
    const salida: ConocidasActualizacion = { ...conocidas };
    for (const resultado of resultados) {
        if (!resultado.id) continue;
        const anterior = salida[resultado.id];
        if (resultado.remota) {
            salida[resultado.id] = {
                remota: resultado.remota,
                fecha: resultado.fecha,
                t: ahora,
            };
        } else if (anterior?.remota) {
            salida[resultado.id] = { ...anterior, t: ahora };
        } else {
            salida[resultado.id] = { remota: null, fecha: null, t: ahora };
        }
    }
    return salida;
}
