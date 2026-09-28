/**
 * Calidad de conexión a partir de `RTCPeerConnection.getStats()` — lógica PURA.
 * Recibe las entradas del informe como objetos planos (así se prueba sin navegador).
 */
import type { CalidadConexion } from "@/lib/llamadas/tipos";

export interface MetricasPar {
    /** Ida y vuelta del par de candidatos elegido, en ms. */
    rttMs: number | null;
    /** Paquetes perdidos y recibidos (acumulados, de todas las pistas entrantes). */
    perdidos: number;
    recibidos: number;
    /** Jitter del audio entrante, en ms. */
    jitterMs: number | null;
}

type EntradaStats = Record<string, unknown> & { type?: unknown };

function num(v: unknown): number | null {
    return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Extrae lo que importa de un informe de estadísticas (Map o lista de entradas). */
export function extraerMetricas(entradas: Iterable<EntradaStats> | { forEach: (cb: (v: EntradaStats) => void) => void }): MetricasPar {
    // `RTCStatsReport` es un Map: su iterador da pares [clave, valor], su forEach da valores.
    const lista: EntradaStats[] = [];
    const forEach = (entradas as { forEach?: unknown } | null)?.forEach;
    if (typeof forEach === "function") {
        (entradas as { forEach: (cb: (v: EntradaStats) => void) => void }).forEach((v) => {
            if (v && typeof v === "object") lista.push(v);
        });
    } else if (entradas) {
        for (const v of entradas as Iterable<EntradaStats>) if (v && typeof v === "object") lista.push(v);
    }

    let rttMs: number | null = null;
    let perdidos = 0;
    let recibidos = 0;
    let jitterMs: number | null = null;

    // El par elegido: por el transporte (selectedCandidatePairId) o, si no, el nominado con éxito.
    const transporte = lista.find((s) => s.type === "transport" && typeof s.selectedCandidatePairId === "string");
    const elegido =
        (transporte && lista.find((s) => s.type === "candidate-pair" && s.id === transporte.selectedCandidatePairId)) ||
        lista.find((s) => s.type === "candidate-pair" && s.nominated === true && s.state === "succeeded") ||
        lista.find((s) => s.type === "candidate-pair" && s.selected === true);
    const rtt = elegido ? num(elegido.currentRoundTripTime) : null;
    if (rtt !== null) rttMs = Math.round(rtt * 1000);

    for (const s of lista) {
        if (s.type === "inbound-rtp") {
            perdidos += Math.max(0, num(s.packetsLost) ?? 0);
            recibidos += Math.max(0, num(s.packetsReceived) ?? 0);
            const kind = s.kind ?? s.mediaType;
            const j = num(s.jitter);
            if (kind === "audio" && j !== null) jitterMs = Math.round(j * 1000);
        }
        if (rttMs === null && s.type === "remote-inbound-rtp") {
            const r = num(s.roundTripTime);
            if (r !== null) rttMs = Math.round(r * 1000);
        }
    }
    return { rttMs, perdidos, recibidos, jitterMs };
}

/** Porcentaje de pérdida entre dos muestras (la pérdida reciente, no la acumulada). */
export function perdidaEntre(previo: MetricasPar | null, actual: MetricasPar): number | null {
    const dp = actual.perdidos - (previo?.perdidos ?? 0);
    const dr = actual.recibidos - (previo?.recibidos ?? 0);
    const total = dp + dr;
    if (total <= 0) return previo ? 0 : null;
    return Math.max(0, Math.min(100, (dp / total) * 100));
}

export function calidadDesde(m: { rttMs: number | null; perdidaPct: number | null; jitterMs: number | null }): CalidadConexion {
    const { rttMs, perdidaPct, jitterMs } = m;
    if (rttMs === null && perdidaPct === null && jitterMs === null) return "desconocida";
    if ((rttMs ?? 0) > 600 || (perdidaPct ?? 0) > 8 || (jitterMs ?? 0) > 80) return "mala";
    if ((rttMs ?? 0) > 250 || (perdidaPct ?? 0) > 2 || (jitterMs ?? 0) > 30) return "regular";
    return "buena";
}

const ORDEN: Record<CalidadConexion, number> = { desconocida: 0, buena: 1, regular: 2, mala: 3 };

/** La peor calidad conocida de una lista (lo que se enseña en la cabecera). */
export function peorCalidad(lista: CalidadConexion[]): CalidadConexion {
    return lista.reduce<CalidadConexion>((peor, c) => (ORDEN[c] > ORDEN[peor] ? c : peor), "desconocida");
}

export const ETIQUETA_CALIDAD: Record<CalidadConexion, string> = {
    buena: "Conexión buena",
    regular: "Conexión regular",
    mala: "Conexión débil",
    desconocida: "Midiendo la conexión",
};
