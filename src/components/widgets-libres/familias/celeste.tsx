"use client";
/**
 * Piezas celestes de los widgets de tiempo (reloj, clima y agenda): la Luna dibujada con su fase
 * REAL, el Sol según su altura real y el color del cielo que le corresponde, para ESTE lugar (la
 * ubicación del clima), más todo lo que el cielo dice ahora: planetas, ascendente, hora
 * planetaria, salida y puesta de la Luna, horas doradas y los próximos acontecimientos (fases,
 * eclipses, estaciones). Todo sale de `src/lib/astro/cielo.ts` (puro, sin red); sin ubicación,
 * lo que depende de ella es null y el widget lo dice. Si la ubicación es la de fábrica del clima
 * (nadie la eligió), se marca `porDefecto` para no hacer pasar un orto ajeno por el tuyo.
 */
import * as React from "react";
import {
    alturaLuna as alturaLunaEn, alturaSol, ascendente as ascendenteEn, horaPlanetaria as horaPlanetariaEn, horasDelSol, horasDoradas,
    medioCielo as medioCieloEn, PLANETAS, posicionesPlanetas, proximasFases, proximaEstacion, proximoCambioDeSigno, proximoEclipse,
    regenteDelDia, salidaPuestaLuna, signoDeGrados, faseLunar, signosDelCielo,
    type ClavePlaneta, type Eclipse, type FaseLunar, type HoraPlanetaria, type PosicionPlaneta, type Signo, type Tramo, type TipoFase,
} from "@/lib/astro/cielo";
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

/** La Luna con su fase real, como grupo SVG centrado en (x, y): luz cenicienta en la parte en
 *  sombra, mares y un halo que crece con la iluminación. */
export function LunaSVG({ x = 0, y = 0, r, fase, id, halo = true }: { x?: number; y?: number; r: number; fase: FaseLunar; id: string; halo?: boolean }) {
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
                <radialGradient id={`sombra-${id}`} cx="45%" cy="40%" r="70%">
                    <stop offset="0%" stopColor="#2a2d52" />
                    <stop offset="100%" stopColor="#15132b" />
                </radialGradient>
            </defs>
            {halo && <circle r={r * 2.4} fill={`url(#halo-${id})`} />}
            <circle r={r} fill={`url(#sombra-${id})`} stroke="#ffffff26" strokeWidth={0.6} />
            <path d={trazoLuna(r, fase.fase)} fill={`url(#luz-${id})`} />
            <circle cx={-r * 0.3} cy={-r * 0.2} r={r * 0.16} fill="#00000014" />
            <circle cx={r * 0.25} cy={r * 0.3} r={r * 0.11} fill="#00000012" />
            <circle cx={r * 0.05} cy={-r * 0.48} r={r * 0.08} fill="#00000010" />
        </g>
    );
}

/** El Sol: núcleo blanco, corona dorada que respira (se apaga bajo el horizonte). */
export function SolSVG({ x = 0, y = 0, r, id, bajo = false, vivo = true }: { x?: number; y?: number; r: number; id: string; bajo?: boolean; vivo?: boolean }) {
    return (
        <g transform={`translate(${x} ${y})`} opacity={bajo ? 0.4 : 1}>
            <defs>
                <radialGradient id={`sol-${id}`}>
                    <stop offset="0%" stopColor="#ffffff" />
                    <stop offset="32%" stopColor="#ffe7a3" />
                    <stop offset="58%" stopColor="#FFBF00" stopOpacity={0.85} />
                    <stop offset="100%" stopColor="#FFBF00" stopOpacity={0} />
                </radialGradient>
            </defs>
            <circle r={r * 2.6} fill={`url(#sol-${id})`} className={vivo && !bajo ? "ss-respirar" : undefined}
                style={{ ["--ss-dur" as string]: "6s", transformBox: "fill-box", transformOrigin: "center" }} />
            <circle r={r} fill="#fff8e1" />
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

/** Glifo, nombre y color de cada astro por su clave. */
export const ASTRO: Record<ClavePlaneta, { nombre: string; glifo: string; color: string }> = Object.fromEntries(
    PLANETAS.map((p) => [p.clave, { nombre: p.nombre, glifo: p.glifo, color: p.color }]),
) as Record<ClavePlaneta, { nombre: string; glifo: string; color: string }>;

/** Pila de fuentes con glifos astronómicos (Inter no los trae). */
export const FUENTE_GLIFOS = '"Segoe UI Symbol","Apple Symbols","Noto Sans Symbols 2","Noto Sans Symbols","DejaVu Sans",sans-serif';

export const NOMBRE_FASE: Record<TipoFase, string> = { nueva: "Luna nueva", creciente: "Cuarto creciente", llena: "Luna llena", menguante: "Cuarto menguante" };

// ── Ubicación ───────────────────────────────────────────────────────────────────────────────

export interface UbicacionCielo { lat: number; lon: number; nombre: string; porDefecto: boolean }
const CLAVE_UBICACION = "starseed_weather_location";

/** Ubicación del clima (contexto o, fuera de él, la guardada por el clima) y cómo pedir la real. */
export function useUbicacion(): { ubicacion: UbicacionCielo | null; pedir: (() => Promise<void>) | null } {
    const ctx = useWeatherLocationOpcional();
    const [guardada, setGuardada] = React.useState<{ lat: number; lon: number; nombre: string } | null>(null);
    React.useEffect(() => {
        const leer = () => {
            try {
                const j = JSON.parse(localStorage.getItem(CLAVE_UBICACION) || "null");
                setGuardada(j && typeof j.lat === "number" && typeof j.lon === "number" ? { lat: j.lat, lon: j.lon, nombre: j.name ?? "" } : null);
            } catch { setGuardada(null); }
        };
        leer();
        const otro = (e: StorageEvent) => { if (e.key === CLAVE_UBICACION) leer(); };
        window.addEventListener("storage", otro);
        return () => window.removeEventListener("storage", otro);
    }, [ctx?.location.lat, ctx?.location.lon]);
    const pedir = ctx ? () => ctx.requestGeolocation() : null;
    if (ctx) {
        // El proveedor siempre tiene una ubicación: la de fábrica si nadie eligió ninguna.
        const elegida = !!guardada && Math.abs(guardada.lat - ctx.location.lat) < 1e-6 && Math.abs(guardada.lon - ctx.location.lon) < 1e-6;
        return { ubicacion: { lat: ctx.location.lat, lon: ctx.location.lon, nombre: ctx.location.name, porDefecto: !elegida }, pedir };
    }
    return { ubicacion: guardada ? { ...guardada, porDefecto: false } : null, pedir };
}

// ── El cielo de ahora ───────────────────────────────────────────────────────────────────────

export interface CieloAqui {
    altura: number | null;
    orto: Date | null;
    ocaso: Date | null;
    mediodia: Date | null;
    luna: FaseLunar;
    signos: ReturnType<typeof signosDelCielo>;
    proximaLlena: Date;
    proximaNueva: Date;
    proximoSigno: { fecha: Date; signo: Signo };
    lugar: string;
    ubicacion: UbicacionCielo | null;
    pedirUbicacion: (() => Promise<void>) | null;
    planetas: PosicionPlaneta[];
    ascendente: { lon: number; signo: Signo; grado: number } | null;
    medioCielo: number | null;
    horaPlanetaria: HoraPlanetaria | null;
    regenteDia: ClavePlaneta;
    alturaLuna: number | null;
    lunaHorizonte: { salida: Date | null; puesta: Date | null } | null;
    doradas: { manana: Tramo | null; tarde: Tramo | null } | null;
    fases: { tipo: TipoFase; fecha: Date }[];
    eclipse: Eclipse | null;
    estacion: ReturnType<typeof proximaEstacion>;
}

/**
 * El cielo de ahora. Cada cosa se recalcula a su ritmo: lo que se mueve (Sol, Luna, ascendente,
 * hora planetaria) una vez por minuto; lo del día (orto, ocaso, horas doradas, salida de la
 * Luna) cada diez; lo lejano (fases, eclipses, estaciones) una vez por hora.
 */
export function useCieloAqui(ahora: Date | null): CieloAqui | null {
    const { ubicacion: ub, pedir } = useUbicacion();
    const minuto = ahora ? Math.floor(ahora.getTime() / 60_000) : 0;
    const decena = Math.floor(minuto / 10);
    const hora = Math.floor(minuto / 60);
    const lat = ub?.lat, lon = ub?.lon;
    const lejano = React.useMemo(() => {
        const t = new Date(hora * 3_600_000);
        const fases = proximasFases(t, 4);
        return {
            fases,
            llena: fases.find((f) => f.tipo === "llena")!.fecha,
            nueva: fases.find((f) => f.tipo === "nueva")!.fecha,
            signo: proximoCambioDeSigno(t),
            eclipse: proximoEclipse(t),
            estacion: proximaEstacion(t),
        };
    }, [hora]);
    const delDia = React.useMemo(() => {
        if (lat === undefined || lon === undefined || !ahora) return null;
        const t = new Date(decena * 600_000);
        return { sol: horasDelSol(t, lat, lon), doradas: horasDoradas(t, lat, lon), luna: salidaPuestaLuna(t, lat, lon) };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [decena, lat, lon]);
    return React.useMemo(() => {
        if (!ahora) return null;
        const f = new Date(minuto * 60_000);
        const asc = lat !== undefined && lon !== undefined ? ascendenteEn(f, lat, lon) : null;
        return {
            altura: lat !== undefined && lon !== undefined ? alturaSol(f, lat, lon) : null,
            orto: delDia?.sol.orto ?? null,
            ocaso: delDia?.sol.ocaso ?? null,
            mediodia: delDia?.sol.mediodia ?? null,
            luna: faseLunar(f),
            signos: signosDelCielo(f),
            proximaLlena: lejano.llena,
            proximaNueva: lejano.nueva,
            proximoSigno: lejano.signo,
            lugar: ub?.nombre ?? "",
            ubicacion: ub,
            pedirUbicacion: pedir,
            planetas: posicionesPlanetas(f),
            ascendente: asc === null ? null : { lon: asc, signo: signoDeGrados(asc), grado: Math.floor(asc % 30) },
            medioCielo: lon !== undefined ? medioCieloEn(f, lon) : null,
            horaPlanetaria: lat !== undefined && lon !== undefined ? horaPlanetariaEn(f, lat, lon) : null,
            regenteDia: regenteDelDia(f),
            alturaLuna: lat !== undefined && lon !== undefined ? alturaLunaEn(f, lat, lon) : null,
            lunaHorizonte: delDia?.luna ?? null,
            doradas: delDia?.doradas ?? null,
            fases: lejano.fases,
            eclipse: lejano.eclipse,
            estacion: lejano.estacion,
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [minuto, lat, lon, ub?.nombre, ub?.porDefecto, delDia, lejano]);
}

/** Alturas del Sol y la Luna a lo largo del día LOCAL de `fecha` (de 00:00 a 24:00), cada `paso` minutos. */
export function muestrasDelDia(fecha: Date, lat: number, lon: number, paso = 20): { t: Date; sol: number; luna: number }[] {
    const inicio = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()).getTime();
    const n = Math.round((24 * 60) / paso);
    return Array.from({ length: n + 1 }, (_, i) => {
        const t = new Date(inicio + i * paso * 60_000);
        return { t, sol: alturaSol(t, lat, lon), luna: alturaLunaEn(t, lat, lon) };
    });
}

/** «en 3 d», «en 14 h», «en 25 min»: cuánto falta hasta `fecha`. */
export function falta(fecha: Date, ahora: Date): string {
    const min = Math.round((fecha.getTime() - ahora.getTime()) / 60_000);
    if (min < 60) return `en ${Math.max(0, min)} min`;
    const h = Math.round(min / 60);
    return h >= 36 ? `en ${Math.round(h / 24)} d` : `en ${h} h`;
}

/** «2 oct», «6 feb 2027» (el año solo si no es el de `ahora`). */
export function fechaCorta(d: Date, ahora: Date = new Date()): string {
    const txt = d.toLocaleDateString("es-ES", { day: "numeric", month: "short", ...(d.getFullYear() !== ahora.getFullYear() ? { year: "numeric" } : {}) });
    return txt.replace(/\./g, "");
}
