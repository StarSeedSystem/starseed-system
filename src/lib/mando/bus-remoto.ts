/**
 * Bus remoto del enjambre (`relevo_eventos` en Supabase) con DIETA DE TRÁFICO.
 * ─────────────────────────────────────────────────────────────────────────────
 * (2026-09-25) Supabase restringió el proyecto del OS por `exceed_egress_quota` y nadie
 * podía iniciar sesión. Medido en sus registros: el Mando pedía el historial del bus
 * una y otra vez, cada petición entera desde cero —la ramificación, 30 días y 2000 filas
 * con la cola completa de cada `arranque` (~8 KB por fila, unos 10 MB por petición); las
 * colas, otros 200 `arranque`; los latidos, la foto completa— y lo repetía cada 20 s por
 * cada ruta abierta. Con el proyecto ya bloqueado seguía insistiendo: 66.000 peticiones
 * en 24 h.
 *
 * Aquí se lee UNA vez y luego solo lo nuevo:
 *   · carga inicial acotada (eventos ligeros 30 días, `arranque` 72 h, latidos 10 min);
 *   · después, cada ≥ 180 s y solo si alguien pregunta, las filas con `id` mayor que la
 *     última vista;
 *   · todas las rutas comparten la misma memoria (en `globalThis`) y la misma petición
 *     en curso;
 *   · si Supabase contesta 402 (restringido) se deja de preguntar 30 min; 429 o 5xx, 5 min;
 *     sin red, 2 min. Mientras tanto se sirve lo que hay en memoria.
 *   · mientras la nube esté en pausa (~/.starseed/nube-pausada.json con hasta: null o fecha futura),
 *     no se consulta a Supabase y se sirve lo que hay en memoria.
 * Solo de servidor (usa `process.env` con la clave pública del proyecto).
 */

import { readFile } from "fs/promises";

export interface FilaBusRemoto {
    id: number;
    t: string;
    quien: string;
    tipo: string;
    tarea: string;
    texto: string;
    datos: unknown;
}

export interface EstadoBusRemoto {
    filas: number;
    ultimaCarga: number | null;
    pausadoHasta: number | null;
    motivo: string | null;
    peticiones: number;
}

export const REFRESCO_MS = 180_000;
const DIA_MS = 24 * 3600 * 1000;
const MAX_FILAS = 4000;
const SELECT = "select=id,t,quien,tipo,tarea,texto,datos";

interface Memoria {
    filas: Map<number, FilaBusRemoto>;
    maxId: number;
    ultimaCarga: number;
    enCurso: Promise<void> | null;
    pausaHasta: number;
    motivo: string | null;
    peticiones: number;
}

const CLAVE_GLOBAL = "__starseedBusRemoto";

function memoria(): Memoria {
    const g = globalThis as unknown as Record<string, Memoria | undefined>;
    if (!g[CLAVE_GLOBAL]) {
        g[CLAVE_GLOBAL] = {
            filas: new Map(),
            maxId: 0,
            ultimaCarga: 0,
            enCurso: null,
            pausaHasta: 0,
            motivo: null,
            peticiones: 0,
        };
    }
    return g[CLAVE_GLOBAL] as Memoria;
}

/** Solo para pruebas: olvida todo lo leído. */
export function reiniciarBusRemoto(): void {
    (globalThis as unknown as Record<string, unknown>)[CLAVE_GLOBAL] = undefined;
}

function texto(v: unknown): string {
    return typeof v === "string" ? v : v == null ? "" : String(v);
}

function aFila(bruta: unknown): FilaBusRemoto | null {
    if (!bruta || typeof bruta !== "object") return null;
    const d = bruta as Record<string, unknown>;
    const id = typeof d.id === "number" ? d.id : Number(d.id);
    if (!Number.isFinite(id) || id <= 0) return null;
    return {
        id,
        t: texto(d.t),
        quien: texto(d.quien),
        tipo: texto(d.tipo),
        tarea: texto(d.tarea),
        texto: texto(d.texto),
        datos: d.datos,
    };
}

/** Cuánto se deja de preguntar según la respuesta (ms), o 0 si fue bien. */
export function pausaPorEstado(estado: number | "red"): number {
    if (estado === "red") return 2 * 60_000;
    if (estado === 402) return 30 * 60_000;
    if (estado === 429 || estado >= 500) return 5 * 60_000;
    return 0;
}

// --- Nube pausada ---

function getPausaFilePath(): string | null {
    // DEBUG: log the override value
    console.log(`getPausaFilePath: overridePausaFilePath=${overridePausaFilePath}`);
    if (overridePausaFilePath !== null) {
        // DEBUG: log that we are using the override
        console.log(`getPausaFilePath: using override: ${overridePausaFilePath}`);
        return overridePausaFilePath;
    }
    const result = process.env.STARSEED_NUBE_PAUSADA || 
        (() => {
            const home = process.env.HOME || process.env.USERPROFILE;
            return home ? `${home}/.starseed/nube-pausada.json` : null;
        })();
    // DEBUG: log the result
    console.log(`getPausaFilePath: STARSEED_NUBE_PAUSADA=${process.env.STARSEED_NUBE_PAUSADA}, result=${result}`);
    return result;
}

interface PausaInfo {
    paused: boolean;
    reason: string | null;
    hasta: number | null;
}

let ultimaComprobacionPausa = 0;
let pausaCache: PausaInfo = { paused: false, reason: null, hasta: null };
let overridePausaFilePath: string | null = null;
export function setOverridePausaFilePath(path: string | null) {
    // DEBUG: log that we are setting the override
    console.log(`setOverridePausaFilePath: path=${path}, overridePausaFilePath after=${overridePausaFilePath}`);
    overridePausaFilePath = path;
    console.log(`setOverridePausaFilePath: after setting, overridePausaFilePath=${overridePausaFilePath}`);
}

async function comprobarNubePausada(ahora: number = Date.now()): Promise<PausaInfo> {
    if (ahora - ultimaComprobacionPausa < 60_000) {
        return pausaCache;
    }

    ultimaComprobacionPausa = ahora;
    const pausaFilePath = getPausaFilePath();
    // DEBUG: log the pause file path and environment
    console.log(`comprobarNubePausada: ahora=${ahora}, STARSEED_NUBE_PAUSADA=${process.env.STARSEED_NUBE_PAUSADA}, pausaFilePath=${pausaFilePath}`);

    if (!pausaFilePath) {
        pausaCache = { paused: false, reason: null, hasta: null };
        return pausaCache;
    }

    try {
        const contenido = await readFile(pausaFilePath, 'utf-8');
        const pausa = JSON.parse(contenido);
        const hasta = pausa.hasta ? new Date(pausa.hasta).getTime() : null;
        const paused = hasta === null || hasta > ahora;
        pausaCache = {
            paused,
            reason: paused ? null : `nube no pausada (hasta: ${pausa.hasta})`,
            hasta
        };
    } catch (error) {
        // Si no se puede leer el archivo, se trata como no pausada.
        pausaCache = { paused: false, reason: `no se pudo leer el archivo de pausa: ${error.message}`, hasta: null };
    }

    return pausaCache;
}

async function pedir(m: Memoria, consulta: string, ahora: number): Promise<FilaBusRemoto[] | null> {
    // DEBUG: log that we are entering pedir
    console.log(`pedir: ahora=${ahora}, consulta=${consulta}`);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !clave) return null;
    m.peticiones += 1;
    let r: Response;
    try {
        r = await fetch(`${url}/rest/v1/relevo_eventos?${SELECT}&${consulta}`, {
            headers: { apikey: clave, Authorization: `Bearer ${clave}` },
            cache: "no-store",
            signal: AbortSignal.timeout(5000),
        });
    } catch {
        m.pausaHasta = ahora + pausaPorEstado("red");
        m.motivo = "sin conexión con el bus";
        return null;
    }
    if (!r.ok) {
        const pausa = pausaPorEstado(r.status);
        if (pausa) {
            m.pausaHasta = ahora + pausa;
            m.motivo = r.status === 402
                ? "Supabase restringido (402): se deja de preguntar 30 min"
                : `Supabase respondió ${r.status}`;
        }
        return null;
    }
    const cuerpo = (await r.json().catch(() => null)) as unknown;
    if (!Array.isArray(cuerpo)) return null;
    m.motivo = null;
    return cuerpo.map(aFila).filter((f): f is FilaBusRemoto => f !== null);
}

function guardar(m: Memoria, filas: FilaBusRemoto[]): void {
    for (const f of filas) {
        m.filas.set(f.id, f);
        if (f.id > m.maxId) m.maxId = f.id;
    }
}

/** Quita lo que ya no sirve: latidos de más de 15 min y cualquier cosa de más de 30 días. */
function podar(m: Memoria, ahora: number): void {
    for (const [id, f] of m.filas) {
        const edad = ahora - new Date(f.t).getTime();
        if (!Number.isFinite(edad)) continue;
        if ((f.tipo === "latido" && edad > 15 * 60_000) || edad > 30 * DIA_MS) m.filas.delete(id);
    }
    if (m.filas.size > MAX_FILAS) {
        const orden = [...m.filas.keys()].sort((a, b) => a - b);
        for (const id of orden.slice(0, m.filas.size - MAX_FILAS)) m.filas.delete(id);
    }
}

async function refrescar(m: Memoria, ahora: number): Promise<void> {
    // DEBUG: log that we are entering refrescar
    console.log(`refrescar: ahora=${ahora}, m.enCurso=${m.enCurso !== null}`);

    // Comprobar si la nube está pausada
    console.log(`refrescar: entrada, ahora=${ahora}`);
    const pausaInfo = await comprobarNubePausada(ahora);
    console.log(`refrescar: después de comprobarNubePausada, pausaInfo=${JSON.stringify(pausaInfo)}`);
    if (pausaInfo.paused) {
        console.log(`refrescar: entrando en el bloque de pausa`);
        m.motivo = pausaInfo.reason ?? "nube en pausa: el bus remoto no se consulta";
        return;
    }

    // Pausa existente por errores de Supabase
    if (ahora < m.pausaHasta) return;
    if (m.ultimaCarga && ahora - m.ultimaCarga < REFRESCO_MS) return;
    if (m.maxId === 0) {
        const hace = (ms: number) => encodeURIComponent(new Date(ahora - ms).toISOString());
        const ligeros = await pedir(m, `tipo=not.in.(latido,tunel,arranque)&t=gte.${hace(30 * DIA_MS)}&order=id.desc&limit=1500`, ahora);
        if (!ligeros) return;
        guardar(m, ligeros);
        guardar(m, (await pedir(m, `tipo=eq.arranque&t=gte.${hace(3 * DIA_MS)}&order=id.desc&limit=40`, ahora)) ?? []);
        guardar(m, (await pedir(m, `tipo=eq.latido&t=gte.${hace(10 * 60_000)}&order=id.desc&limit=30`, ahora)) ?? []);
    } else {
        const nuevas = await pedir(m, `id=gt.${m.maxId}&tipo=neq.tunel&order=id.asc&limit=500`, ahora);
        if (!nuevas) return;
        guardar(m, nuevas);
    }
    m.ultimaCarga = ahora;
    podar(m, ahora);
}

/**
 * Todas las filas del bus en memoria (más recientes primero), refrescadas si toca.
 * Nunca lanza: sin bus, devuelve lo que haya (o nada).
 */
export async function filasDelBus(ahora = Date.now()): Promise<FilaBusRemoto[]> {
    const m = memoria();
    if (!m.enCurso) {
        m.enCurso = refrescar(m, ahora)
            .catch(() => undefined)
            .finally(() => {
                m.enCurso = null;
            });
    }
    await m.enCurso;
    return [...m.filas.values()].sort((a, b) => b.id - a.id);
}

/** Filas de ciertos tipos desde hace `ms`, más recientes primero. */
export async function filasRecientes(tipos: readonly string[] | null, ms: number, ahora = Date.now()): Promise<FilaBusRemoto[]> {
    const desde = ahora - ms;
    return (await filasDelBus(ahora)).filter(
        (f) => (!tipos || tipos.includes(f.tipo)) && new Date(f.t).getTime() >= desde,
    );
}

export function estadoBusRemoto(ahora = Date.now()): EstadoBusRemoto {
    const m = memoria();
    return {
        filas: m.filas.size,
        ultimaCarga: m.ultimaCarga || null,
        pausadoHasta: m.pausaHasta > ahora ? m.pausaHasta : null,
        motivo: m.motivo,
        peticiones: m.peticiones,
    };
}

// Para pruebas: reinicia el estado de la nube pausada
export function reiniciarEstadoNube() {
    if (process.env.NODE_ENV !== 'test') {
        // En entornos no de prueba, no hacemos nada.
        return;
    }
    ultimaComprobacionPausa = 0;
    pausaCache = { paused: false, reason: null, hasta: null };
}