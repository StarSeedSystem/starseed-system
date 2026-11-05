/**
 * Resumen de la memoria del servidor de Genesis (puro, sin `node:*`).
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ: `resumenMemoria` traduce las tres lecturas crudas de Node (uso del proceso,
 *      estadísticas del montón y sus espacios) a MB redondeados, el porcentaje del
 *      techo del montón, los espacios ordenados por tamaño, los minutos desde el
 *      arranque y un `nivel`: «holgado» (menos del 70 % del techo), «justo» (hasta el
 *      85 %) y «al límite» (por encima). Sin dato válido: `nivel: "sin dato"`.
 *
 * POR QUÉ: el servidor de Genesis murió tres veces el 04-11 con «heap out of memory»
 *      y nadie sabía si el montón era código o datos. Aquí solo se CUENTA: sin
 *      archivos, sin procesos y sin copiar el montón (`writeHeapSnapshot` está
 *      prohibido: duplicaría la memoria y tiraría el servidor).
 *
 * Puro: sin `node:*`, sin disco, sin red y sin reloj propio (el tiempo llega como dato).
 */

/** Nivel de presión sobre el techo del montón. */
export type NivelMemoria = "holgado" | "justo" | "al límite" | "sin dato";

/** Un espacio del montón de V8 y los MB que usa. */
export interface EspacioMonton {
    nombre: string;
    mb: number;
}

/** `process.memoryUsage()`: todo opcional para que un dato raro no rompa nada. */
export type UsoMemoria = Partial<Record<"rss" | "heapUsed" | "heapTotal" | "external" | "arrayBuffers", number>>;

/** `v8.getHeapStatistics()`: aquí solo importa el techo del montón. */
export type EstadisticasMonton = { heap_size_limit?: number };

/** `v8.getHeapSpaceStatistics()`: nombre y tamaño usado de cada espacio. */
export type EspacioHeap = { space_name?: string; space_used_size?: number };

/** Todo lo que entra a `resumenMemoria`. */
export interface DatosMemoria {
    uso?: UsoMemoria | null;
    montón?: EstadisticasMonton | null;
    espacios?: EspacioHeap[] | null;
    arranqueMs?: number;
    ahoraMs?: number;
}

/** Lo que sale: MB (salvo el porcentaje), más el veredicto. */
export interface ResumenMemoria {
    rssMb: number;
    heapUsedMb: number;
    heapTotalMb: number;
    externalMb: number;
    arrayBuffersMb: number;
    heapSizeLimitMb: number;
    porcentajeTecho: number | null;
    espacios: EspacioMonton[];
    minutosArranque: number;
    nivel: NivelMemoria;
}

const BYTES_POR_MB = 1024 * 1024;

/** Un número finito y no negativo, o `null` si el dato no sirve. */
function numero(value: unknown): number | null {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
    return value;
}

/** Bytes → MB con un decimal. Lo que no vale, 0 MB (nunca `NaN` en la respuesta). */
function aMb(value: unknown): number {
    const n = numero(value);
    return n === null ? 0 : Math.round((n / BYTES_POR_MB) * 10) / 10;
}

/** El nivel según el porcentaje del techo: <70 holgado, ≤85 justo, >85 al límite. */
function nivelDe(porcentaje: number | null): NivelMemoria {
    if (porcentaje === null) return "sin dato";
    if (porcentaje < 70) return "holgado";
    if (porcentaje <= 85) return "justo";
    return "al límite";
}

/**
 * Resumen de la memoria del servidor. Nunca lanza: con datos vacíos o raros devuelve
 * lo que pueda y `nivel: "sin dato"`.
 */
export function resumenMemoria(datos: DatosMemoria): ResumenMemoria {
    const uso = datos.uso ?? {};
    const limite = numero(datos.montón?.heap_size_limit);
    const usado = numero(uso.heapUsed);
    const exacto = limite !== null && limite > 0 && usado !== null ? (usado / limite) * 100 : null;

    const crudos = Array.isArray(datos.espacios) ? datos.espacios : [];
    const espacios = crudos
        .map((e) => ({ nombre: typeof e?.space_name === "string" ? e.space_name : "", bytes: numero(e?.space_used_size) }))
        .filter((e): e is { nombre: string; bytes: number } => e.nombre !== "" && e.bytes !== null)
        .sort((a, b) => b.bytes - a.bytes || a.nombre.localeCompare(b.nombre))
        .map((e) => ({ nombre: e.nombre, mb: aMb(e.bytes) }));

    const arranque = numero(datos.arranqueMs);
    const ahora = numero(datos.ahoraMs);
    const minutos = arranque !== null && ahora !== null && ahora >= arranque ? Math.round(((ahora - arranque) / 60_000) * 10) / 10 : 0;

    return {
        rssMb: aMb(uso.rss),
        heapUsedMb: aMb(uso.heapUsed),
        heapTotalMb: aMb(uso.heapTotal),
        externalMb: aMb(uso.external),
        arrayBuffersMb: aMb(uso.arrayBuffers),
        heapSizeLimitMb: aMb(limite),
        porcentajeTecho: exacto === null ? null : Math.round(exacto * 10) / 10,
        espacios,
        minutosArranque: minutos,
        nivel: nivelDe(exacto),
    };
}
