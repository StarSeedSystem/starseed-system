"use client";
/**
 * Piezas celestes de los widgets de tiempo (reloj y clima): la Luna dibujada con su fase REAL,
 * el Sol según su altura real y el color del cielo que le corresponde, para ESTE lugar (la
 * ubicación del clima). Todo sale de `src/lib/astro/cielo.ts`; sin ubicación, lo que depende de
 * ella se dice «sin dato».
 */
import * as React from "react";
import { alturaSol, faseLunar, horasDelSol, proximaFase, proximoCambioDeSigno, signosDelCielo, type FaseLunar, type Signo } from "@/lib/astro/cielo";
import { useWeatherLocationOpcional } from "@/modules/weather/context/weather-location-context";
import { mezclar } from "./comun";

/** Trazo SVG de la parte iluminada de la Luna (centrada en 0,0; creciente = luz a la derecha). */
export function trazoLuna(r: number, fase: number): string {
    const rx = Math.max(0.01, Math.abs(Math.cos(2 * Math.PI * fase)) * r);
    const n = (v: number) => Math.round(v * 100) / 100;
    if (fase < 0.5) {
        const barrido = fase < 0.25 ? 0 : 1;
        return `M0 ${n(-r)}A${n(r)} ${n(r)} 0 0 1 0 ${n(r)}A${n(rx)} ${n(r)} 0 0 ${barrido} 0 ${n(-r)}Z`;
    }
    const barrido = fase < 0.75 ? 0 : 1;
    return `M0 ${n(-r)}A${n(r)} ${n(r)} 0 0 0 0 ${n(r)}A${n(rx)} ${n(r)} 0 0 ${barrido} 0 ${n(-r)}Z`;
}

/** La Luna con su fase real, como grupo SVG centrado en (x, y). */
export function LunaSVG({ x = 0, y = 0, r, fase, id }: { x?: number; y?: number; r: number; fase: FaseLunar; id: string }) {
    return (
        <g transform={`translate(${x} ${y})`}>
            <defs>
                <radialGradient id={`halo-${id}`}>
                    <stop offset="0%" stopColor="#fff4d6" stopOpacity={0.28 * fase.iluminada + 0.04} />
                    <stop offset="68%" stopColor="#fff4d6" stopOpacity={0} />
                </radialGradient>
                <radialGradient id={`luz-${id}`} cx="40%" cy="35%" r="75%">
                    <stop offset="0%" stopColor="#fffdf5" />
                    <stop offset="70%" stopColor="#e9e4d4" />
                    <stop offset="100%" stopColor="#c9c2ad" />
                </radialGradient>
            </defs>
            <circle r={r * 2.4} fill={`url(#halo-${id})`} />
            <circle r={r} fill="#1d1a33" stroke="#ffffff22" strokeWidth={0.6} />
            <path d={trazoLuna(r, fase.fase)} fill={`url(#luz-${id})`} />
            <circle cx={-r * 0.3} cy={-r * 0.2} r={r * 0.16} fill="#00000014" />
            <circle cx={r * 0.25} cy={r * 0.3} r={r * 0.11} fill="#00000012" />
        </g>
    );
}

/** Color del cielo según la altura del Sol (grados): noche, crepúsculo, hora dorada, día. */
export function coloresCielo(altura: number | null): { alto: string; bajo: string; horizonte: string } {
    if (altura === null) return { alto: "#1d1650", bajo: "#0a0822", horizonte: "#7c5cff" };
    if (altura < -12) return { alto: "#141046", bajo: "#05041a", horizonte: "#3b2f8f" };
    if (altura < 0) {
        const t = (altura + 12) / 12;
        return { alto: mezclar("#141046", "#3b2a7a", t), bajo: mezclar("#05041a", "#2a1640", t), horizonte: mezclar("#3b2f8f", "#ff7a59", t) };
    }
    if (altura < 12) {
        const t = altura / 12;
        return { alto: mezclar("#3b2a7a", "#1f7ae0", t), bajo: mezclar("#2a1640", "#0b3f8f", t), horizonte: mezclar("#ff7a59", "#ffd27a", t) };
    }
    return { alto: "#2b8cff", bajo: "#0a3d8f", horizonte: "#9fdcff" };
}

/** Ubicación del clima (contexto o, fuera de él, la guardada por el clima). */
function useUbicacion(): { lat: number; lon: number; nombre: string } | null {
    const ctx = useWeatherLocationOpcional();
    const [guardada, setGuardada] = React.useState<{ lat: number; lon: number; nombre: string } | null>(null);
    React.useEffect(() => {
        if (ctx) return;
        try {
            const j = JSON.parse(localStorage.getItem("starseed_weather_location") || "null");
            if (j && typeof j.lat === "number" && typeof j.lon === "number") setGuardada({ lat: j.lat, lon: j.lon, nombre: j.name ?? "" });
        } catch { /* sin almacén */ }
    }, [ctx]);
    if (ctx) return { lat: ctx.location.lat, lon: ctx.location.lon, nombre: ctx.location.name };
    return guardada;
}

export interface CieloAqui {
    altura: number | null;
    orto: Date | null;
    ocaso: Date | null;
    luna: FaseLunar;
    signos: ReturnType<typeof signosDelCielo>;
    proximaLlena: Date;
    proximaNueva: Date;
    proximoSigno: { fecha: Date; signo: Signo };
    lugar: string;
}

/** El cielo de ahora (se recalcula al cambiar el minuto; las próximas fases, una vez por hora). */
export function useCieloAqui(ahora: Date | null): CieloAqui | null {
    const ub = useUbicacion();
    const minuto = ahora ? Math.floor(ahora.getTime() / 60_000) : 0;
    const hora = Math.floor(minuto / 60);
    const proximas = React.useMemo(() => {
        const t = new Date(hora * 3_600_000);
        return { llena: proximaFase(t, "llena"), nueva: proximaFase(t, "nueva"), signo: proximoCambioDeSigno(t) };
    }, [hora]);
    return React.useMemo(() => {
        if (!ahora) return null;
        const f = new Date(minuto * 60_000);
        const sol = ub ? horasDelSol(f, ub.lat, ub.lon) : null;
        return {
            altura: ub ? alturaSol(f, ub.lat, ub.lon) : null,
            orto: sol?.orto ?? null,
            ocaso: sol?.ocaso ?? null,
            luna: faseLunar(f),
            signos: signosDelCielo(f),
            proximaLlena: proximas.llena,
            proximaNueva: proximas.nueva,
            proximoSigno: proximas.signo,
            lugar: ub?.nombre ?? "",
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [minuto, ub?.lat, ub?.lon, proximas]);
}

/** «en 3 d», «en 14 h»: cuánto falta hasta `fecha`. */
export function falta(fecha: Date, ahora: Date): string {
    const h = Math.round((fecha.getTime() - ahora.getTime()) / 3_600_000);
    return h >= 36 ? `en ${Math.round(h / 24)} d` : `en ${Math.max(0, h)} h`;
}
