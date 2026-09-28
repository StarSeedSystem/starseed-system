/**
 * Presupuesto de render de los widgets libres (Ola 380 · FL3).
 *
 * Los widgets son animados y en 3D, pero una tablet vieja o un móvil en ahorro de batería no
 * deben pagarlo. `nivelRender` decide ligero/normal/pleno con señales reales del dispositivo y
 * `presupuesto` traduce ese nivel a lo que cada widget puede permitirse. Solo `transform` y
 * `opacity`: nada que obligue al navegador a recalcular el layout.
 */
import { useEffect, useState } from "react";

export interface SenalesDispositivo {
    nucleos?: number;
    memoriaGB?: number;
    movimientoReducido: boolean;
    ahorroDatos: boolean;
    bateriaBaja: boolean;
    enXR: boolean;
}

export type NivelRender = "ligero" | "normal" | "pleno";

export interface Presupuesto {
    parallax: boolean;
    particulas: number;
    inclinacionMax: number;
    duracionEntradaMs: number;
    halo: "suave" | "vivo";
}

export function nivelRender(s: SenalesDispositivo): NivelRender {
    if (s.movimientoReducido || s.ahorroDatos || s.bateriaBaja) return "ligero";
    if (s.enXR) return "normal";
    if ((s.nucleos !== undefined && s.nucleos <= 4) || (s.memoriaGB !== undefined && s.memoriaGB <= 4)) return "normal";
    return "pleno";
}

const PRESUPUESTOS: Record<NivelRender, Presupuesto> = {
    ligero: { parallax: false, particulas: 0, inclinacionMax: 0, duracionEntradaMs: 0, halo: "suave" },
    normal: { parallax: true, particulas: 6, inclinacionMax: 5, duracionEntradaMs: 280, halo: "suave" },
    pleno: { parallax: true, particulas: 16, inclinacionMax: 8, duracionEntradaMs: 420, halo: "vivo" },
};

export function presupuesto(n: NivelRender): Presupuesto {
    return PRESUPUESTOS[n];
}

export function leerSenalesDispositivo(): SenalesDispositivo {
    const prudente: SenalesDispositivo = { nucleos: 4, memoriaGB: 4, movimientoReducido: false, ahorroDatos: false, bateriaBaja: false, enXR: false };
    if (typeof window === "undefined" || typeof navigator === "undefined") return prudente;
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
    let reducido = false;
    try { reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { /* sin matchMedia */ }
    return {
        nucleos: typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : undefined,
        memoriaGB: typeof nav.deviceMemory === "number" ? nav.deviceMemory : undefined,
        movimientoReducido: reducido,
        ahorroDatos: !!nav.connection?.saveData,
        bateriaBaja: false,
        enXR: false,
    };
}

/** Nivel del dispositivo, calculado una vez al montar («normal» mientras tanto: sin saltos). */
/** El modo de rendimiento del OS (`<html data-perf>`, src/lib/perf/device-tier.ts) manda: en
 *  «eco» el sistema entero ya congela sus bucles, así que los widgets pasan a «ligero». */
export function conModoDelSistema(nivel: NivelRender, perf: string | undefined): NivelRender {
    return perf === "eco" ? "ligero" : nivel;
}

export function useNivelRender(): NivelRender {
    const [nivel, setNivel] = useState<NivelRender>("normal");
    useEffect(() => {
        const calcular = () => setNivel(conModoDelSistema(nivelRender(leerSenalesDispositivo()), document.documentElement.dataset.perf));
        calcular();
        window.addEventListener("starseed:perf-changed", calcular);
        return () => window.removeEventListener("starseed:perf-changed", calcular);
    }, []);
    return nivel;
}
