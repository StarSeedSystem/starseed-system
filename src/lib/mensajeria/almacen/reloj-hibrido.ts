/**
 * Reloj lógico híbrido (HLC) para ordenar mensajes entre aparatos (MSJ1108C · F1).
 * ═══════════════════════════════════════════════════════════════════════════════════
 * Los relojes de pared de una Mac y una tableta no coinciden. Un HLC lleva la hora física
 * (ms) más un contador y el nodo que lo estampó: si un mensaje llega "del futuro", el reloj
 * propio avanza para que lo que se escriba después SIEMPRE ordene después (causalidad), y la
 * hora sigue siendo legible. Se serializa como texto ordenable: `<13 dígitos ms>.<4 cifras>.<nodo>`.
 * PURO: sin DOM ni red. El reloj físico se inyecta.
 */

export interface PartesHlc {
    ms: number;
    n: number;
    nodo: string;
}

const MAX_CONTADOR = 9999;
/** Un mensaje que dice venir de más allá de esto se trata con la hora local (no arrastra el reloj). */
export const MAX_ADELANTO_MS = 24 * 60 * 60 * 1000;

export function formatearHlc(p: PartesHlc): string {
    return `${String(Math.max(0, Math.floor(p.ms))).padStart(13, "0")}.${String(Math.min(MAX_CONTADOR, Math.max(0, Math.floor(p.n)))).padStart(4, "0")}.${p.nodo}`;
}

export function leerHlc(h: unknown): PartesHlc | null {
    if (typeof h !== "string" || h.length > 120) return null;
    const m = /^(\d{13})\.(\d{4})\.(.*)$/.exec(h);
    if (!m) return null;
    return { ms: Number(m[1]), n: Number(m[2]), nodo: m[3] };
}

/** HLC de una hora física sin historia (mensajes del servidor y de la migración). */
export function hlcDeMs(ms: number, nodo = ""): string {
    return formatearHlc({ ms, n: 0, nodo });
}

/** Orden total: hora, contador y, a igualdad, nodo. Los textos inválidos van primero. */
export function compararHlc(a: string, b: string): number {
    const pa = leerHlc(a);
    const pb = leerHlc(b);
    if (!pa || !pb) return pa ? 1 : pb ? -1 : 0;
    return pa.ms - pb.ms || pa.n - pb.n || (pa.nodo < pb.nodo ? -1 : pa.nodo > pb.nodo ? 1 : 0);
}

export interface RelojHibrido {
    /** Evento local: devuelve el HLC a estampar en lo que se envía. */
    tic(): string;
    /** Llegó un HLC de fuera: el reloj avanza lo necesario. */
    observar(h: string | undefined): void;
    ultimo(): string;
}

export function crearRelojHibrido(nodo: string, ahora: () => number = () => Date.now(), inicial?: string): RelojHibrido {
    const ini = leerHlc(inicial);
    let ms = ini?.ms ?? 0;
    let n = ini?.n ?? 0;
    const nodoLimpio = nodo.replace(/[^\w:.-]/g, "").slice(0, 40);
    return {
        tic() {
            const fisico = ahora();
            if (fisico > ms) {
                ms = fisico;
                n = 0;
            } else {
                n += 1;
                if (n > MAX_CONTADOR) {
                    ms += 1;
                    n = 0;
                }
            }
            return formatearHlc({ ms, n, nodo: nodoLimpio });
        },
        observar(h) {
            const p = leerHlc(h);
            if (!p) return;
            const fisico = ahora();
            if (p.ms > fisico + MAX_ADELANTO_MS) return; // reloj ajeno absurdo: no se arrastra
            const nuevoMs = Math.max(ms, p.ms, fisico);
            if (nuevoMs === ms && nuevoMs === p.ms) n = Math.max(n, p.n) + 1;
            else if (nuevoMs === ms) n += 1;
            else if (nuevoMs === p.ms) n = p.n + 1;
            else n = 0;
            ms = nuevoMs;
            if (n > MAX_CONTADOR) {
                ms += 1;
                n = 0;
            }
        },
        ultimo() {
            return formatearHlc({ ms, n, nodo: nodoLimpio });
        },
    };
}
