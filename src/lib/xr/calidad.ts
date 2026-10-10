/**
 * StarSeed XR · CALIDAD AUTOMÁTICA. Nivel inicial según el aparato y ajuste dinámico por tiempo de
 * fotograma con HISTÉRESIS (bajar es rápido, subir es lento y con cerrojo) para que no oscile.
 * Módulo PURO: el reloj entra como dato (`t`, `dt` en ms); nada de `performance.now()` aquí.
 */
import type { PlataformaVisor, NivelCalidad } from "./tipos";
import { indiceNivel, nivelEn } from "./tipos";
import { PERFILES, type PerfilCalidad } from "./calidad-perfiles";

export interface PerfilDispositivo {
    plataforma: PlataformaVisor;
    /** Modelo de Quest si se conoce (`modeloQuest`). */
    modelo?: "quest-1" | "quest-2" | "quest-pro" | "quest-3" | null;
    /** `detect-gpu`: 0 = GPU en lista negra o sin aceleración … 3 = potente. Sólo cuenta fuera de los visores autónomos. */
    gpuTier?: 0 | 1 | 2 | 3;
    memoriaGB?: number;
    nucleos?: number;
    refrescoHz?: number;
    /** 0–1. */
    bateria?: number;
    cargando?: boolean;
    termica?: "nominal" | "fair" | "serious" | "critical";
}

/** Punto de partida por plataforma (0 = mínima … 4 = máxima). */
const BASE: Record<PlataformaVisor, number> = {
    quest: 2, pico: 2, visionos: 3, "android-xr": 3, "magic-leap": 1, spectacles: 1,
    "android-movil": 1, ios: 2, escritorio: 3, desconocida: 1,
};
const AUTONOMOS: readonly PlataformaVisor[] = ["quest", "pico", "visionos", "android-xr", "magic-leap", "spectacles"];

export function nivelInicial(p: PerfilDispositivo): NivelCalidad {
    let n = BASE[p.plataforma];
    if (p.modelo === "quest-3") n += 1;
    if (p.modelo === "quest-2" || p.modelo === "quest-1") n -= 1;
    if (!AUTONOMOS.includes(p.plataforma)) {
        if (p.gpuTier !== undefined) n += p.gpuTier - 2;
        if (p.nucleos !== undefined && p.nucleos <= 4) n -= 1;
    }
    if (p.memoriaGB !== undefined && p.memoriaGB <= 3) n -= 1;
    if ((p.refrescoHz ?? 0) >= 120 && n < 4) n -= 1;
    if (p.bateria !== undefined && p.bateria < 0.2 && !p.cargando) n -= 1;
    if (p.termica === "serious") n -= 1;
    if (p.termica === "critical") n -= 2;
    return nivelEn(n);
}

export const perfilDeNivel = (n: NivelCalidad): PerfilCalidad => PERFILES[n];

/** Ajustes de la histéresis (ms y segundos). Se exportan para probarlos y para afinarlos con medidas reales. */
export const AJUSTES = {
    graciaMs: 2500,
    umbralSobre: 1.08,
    umbralHolgado: 0.62,
    bajarTrasS: 1.2,
    bajarUrgenteTrasS: 0.5,
    subirTrasS: 10,
    cerrojoTrasBajarMs: 20_000,
    cerrojoTrasSubirMs: 30_000,
    bajadasParaCerrojoLargo: 3,
    cerrojoLargoMs: 120_000,
    refrescoTrasS: 3,
} as const;

export interface EstadoCalidad {
    nivel: NivelCalidad;
    /** Techo para subir: el nivel inicial más uno (nunca se promete más de lo que el aparato mostró). */
    techo: NivelCalidad;
    inicio: number | null;
    ms: number | null;
    sobreS: number;
    holgadoS: number;
    cerrojoHasta: number;
    bajadas: number[];
}

export interface CambioCalidad {
    tipo: "nivel" | "refresco";
    de: string;
    a: string;
    motivo: string;
}

export const estadoInicialCalidad = (nivel: NivelCalidad): EstadoCalidad => ({
    nivel, techo: nivelEn(indiceNivel(nivel) + 1), inicio: null, ms: null, sobreS: 0, holgadoS: 0, cerrojoHasta: 0, bajadas: [],
});

/** Refresco inmediatamente menor entre los que ofrece el visor, o `null` si ya está en el más bajo. */
export function refrescoInferior(actual: number, soportados: readonly number[]): number | null {
    const menores = soportados.filter((h) => h < actual).sort((a, b) => b - a);
    return menores.length ? menores[0] : null;
}

/**
 * Un fotograma entra, sale el estado nuevo y, si toca, un cambio. `hz` es el refresco objetivo actual;
 * `soportados` los que admite el visor (`session.supportedFrameRates`).
 */
export function siguienteCalidad(
    e: EstadoCalidad,
    m: { t: number; dt: number },
    hz: number,
    soportados: readonly number[] = [],
): { estado: EstadoCalidad; cambio: CambioCalidad | null } {
    const presupuesto = 1000 / Math.max(30, hz);
    const dt = Math.max(0, Math.min(m.dt, presupuesto * 3));
    const inicio = e.inicio ?? m.t;
    const alfa = 1 - Math.exp(-dt / 400);
    const ms = e.ms === null ? dt : e.ms + alfa * (dt - e.ms);
    const s = Math.min(dt, 250) / 1000;
    let sobreS = e.sobreS;
    let holgadoS = e.holgadoS;
    if (ms > presupuesto * AJUSTES.umbralSobre) { sobreS += s; holgadoS = 0; }
    else if (ms < presupuesto * AJUSTES.umbralHolgado) { holgadoS += s; sobreS = Math.max(0, sobreS - s); }
    else { sobreS = Math.max(0, sobreS - s * 0.5); holgadoS = Math.max(0, holgadoS - s * 0.5); }
    const base: EstadoCalidad = { ...e, inicio, ms, sobreS, holgadoS };
    if (m.t - inicio < AJUSTES.graciaMs) return { estado: base, cambio: null };

    const i = indiceNivel(e.nivel);
    const urgente = ms > presupuesto * 1.5 && sobreS >= AJUSTES.bajarUrgenteTrasS;
    if (i > 0 && (sobreS >= AJUSTES.bajarTrasS || urgente)) {
        const bajadas = [...e.bajadas.filter((t) => m.t - t < 60_000), m.t];
        const largo = bajadas.length >= AJUSTES.bajadasParaCerrojoLargo;
        const nuevo = nivelEn(i - 1);
        return {
            estado: { ...base, nivel: nuevo, ms: null, sobreS: 0, holgadoS: 0, bajadas, cerrojoHasta: m.t + (largo ? AJUSTES.cerrojoLargoMs : AJUSTES.cerrojoTrasBajarMs) },
            cambio: { tipo: "nivel", de: e.nivel, a: nuevo, motivo: `El fotograma tarda ${ms.toFixed(1)} ms de media y el presupuesto es de ${presupuesto.toFixed(1)} ms: se baja un nivel.` },
        };
    }
    if (i === 0 && sobreS >= AJUSTES.refrescoTrasS) {
        const menor = refrescoInferior(hz, soportados);
        if (menor !== null) {
            return {
                estado: { ...base, ms: null, sobreS: 0, holgadoS: 0, cerrojoHasta: m.t + AJUSTES.cerrojoTrasBajarMs },
                cambio: { tipo: "refresco", de: `${hz} Hz`, a: `${menor} Hz`, motivo: "En el nivel mínimo y aun así no se llega al fotograma: se baja el refresco." },
            };
        }
    }
    if (holgadoS >= AJUSTES.subirTrasS && m.t >= e.cerrojoHasta && i < indiceNivel(e.techo)) {
        const nuevo = nivelEn(i + 1);
        return {
            estado: { ...base, nivel: nuevo, ms: null, sobreS: 0, holgadoS: 0, cerrojoHasta: m.t + AJUSTES.cerrojoTrasSubirMs },
            cambio: { tipo: "nivel", de: e.nivel, a: nuevo, motivo: `Hay holgura sostenida (${ms.toFixed(1)} ms de ${presupuesto.toFixed(1)} ms de presupuesto): se sube un nivel.` },
        };
    }
    return { estado: base, cambio: null };
}
