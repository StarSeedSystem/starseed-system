"use client";
/**
 * Telemetría de ESTA neurona (paquete E) — solo medidas reales y locales, cero peticiones:
 *  · red del navegador (en línea, tipo, bajada estimada, latencia) — Network Information API
 *    donde existe; donde no, se dice «sin dato»;
 *  · consumo de la nube que ya cuenta el guardián del cliente (hoy/presupuesto del dispositivo,
 *    peticiones de esta pestaña, pausas, rutas que más piden);
 *  · el dispositivo: núcleos, memoria y montón de JS (Chrome), y el nivel de render del OS.
 */
import * as React from "react";
import { leerAvisoConsumo, leerContadores, suscribirConsumo } from "@/lib/consumo/guardian";
import { useFreno } from "@/lib/consumo/freno";

export interface MedidaRed { enLinea: boolean; tipo: string | null; bajadaMbps: number | null; latenciaMs: number | null; ahorro: boolean }
export interface MedidaNube { hoy: number; presupuesto: number; pestana: number; bloqueadas: number; frenos: number; corteHasta: number | null; frenoRemoto: boolean; diaAgotado: boolean; rutas: { ruta: string; n: number; bytes: number }[] }
export interface MedidaDispositivo { nucleos: number | null; memoriaGB: number | null; montonMB: number | null; limiteMB: number | null }
export interface Telemetria { red: MedidaRed; nube: MedidaNube; disp: MedidaDispositivo; serie: number[]; t: number }

export type Salud = "bien" | "atencion" | "mal";

/** Semáforo honesto a partir de lo medido (sin red o nube cortada = mal; lento o >70 % del día = atención). */
export function saludDe(red: MedidaRed, nube: MedidaNube): { nivel: Salud; texto: string } {
    if (!red.enLinea) return { nivel: "mal", texto: "Sin conexión" };
    if (nube.corteHasta && nube.corteHasta > Date.now()) return { nivel: "mal", texto: "La nube pidió una pausa" };
    if (nube.diaAgotado || nube.frenoRemoto) return { nivel: "atencion", texto: "Lecturas de la nube en pausa hasta las 00:00 UTC" };
    const pct = nube.presupuesto > 0 ? nube.hoy / nube.presupuesto : 0;
    if (pct >= 0.7) return { nivel: "atencion", texto: `Llevas el ${Math.round(pct * 100)} % del presupuesto de hoy` };
    if (red.latenciaMs !== null && red.latenciaMs > 600) return { nivel: "atencion", texto: "Red lenta" };
    return { nivel: "bien", texto: "Todo en orden" };
}

/** Nombre corto de una ruta de Supabase: «/rest/v1/os_pages» → «os_pages». */
export function nombreRuta(r: string): string {
    const m = r.match(/\/(?:rest|auth|storage|functions|realtime)\/v1\/(?:rpc\/|object\/)?([^/?]+)/);
    return m ? m[1] : r;
}

function medir(prev: number[]): Telemetria {
    const nav = (typeof navigator !== "undefined" ? navigator : {}) as Navigator & { connection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean }; deviceMemory?: number };
    const c = nav.connection;
    const red: MedidaRed = {
        enLinea: typeof nav.onLine === "boolean" ? nav.onLine : true,
        tipo: c?.effectiveType ?? null,
        bajadaMbps: typeof c?.downlink === "number" ? c.downlink : null,
        latenciaMs: typeof c?.rtt === "number" ? c.rtt : null,
        ahorro: !!c?.saveData,
    };
    let nube: MedidaNube;
    try {
        const k = leerContadores();
        const a = leerAvisoConsumo();
        nube = {
            hoy: k.hoy, presupuesto: k.presupuestoDia, pestana: k.total, bloqueadas: k.bloqueadas, frenos: k.frenos,
            corteHasta: k.corteHasta, frenoRemoto: k.frenoRemoto, diaAgotado: a.diaAgotado,
            rutas: Object.entries(k.porRuta).map(([ruta, v]) => ({ ruta, n: v.n, bytes: v.bytes })).sort((x, y) => y.n - x.n).slice(0, 5),
        };
    } catch {
        nube = { hoy: 0, presupuesto: 0, pestana: 0, bloqueadas: 0, frenos: 0, corteHasta: null, frenoRemoto: false, diaAgotado: false, rutas: [] };
    }
    const mem = (typeof performance !== "undefined" ? (performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory : undefined);
    const disp: MedidaDispositivo = {
        nucleos: typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : null,
        memoriaGB: typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
        montonMB: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null,
        limiteMB: mem ? Math.round(mem.jsHeapSizeLimit / 1048576) : null,
    };
    return { red, nube, disp, serie: prev, t: Date.now() };
}

/**
 * Lee la telemetría cada `cadaMs` (5 s por defecto) SOLO mientras se ve; guarda una serie de las
 * peticiones de la pestaña por muestra (para la curva). Nada de esto toca la red.
 */
export function useTelemetriaE(visible: boolean, cadaMs = 5000): Telemetria | null {
    const [t, setT] = React.useState<Telemetria | null>(null);
    const serie = React.useRef<number[]>([]);
    const ultimo = React.useRef<number | null>(null);
    const freno = useFreno();
    const tomar = React.useCallback(() => {
        const m = medir(serie.current);
        const delta = ultimo.current === null ? 0 : Math.max(0, m.nube.pestana - ultimo.current);
        ultimo.current = m.nube.pestana;
        serie.current = [...serie.current, delta].slice(-40);
        setT({ ...m, serie: serie.current });
    }, []);
    React.useEffect(() => { tomar(); }, [tomar, freno.activo]);
    React.useEffect(() => {
        if (!visible) return;
        const id = window.setInterval(tomar, Math.max(2000, cadaMs));
        const quitar = (() => { try { return suscribirConsumo(tomar); } catch { return () => undefined; } })();
        window.addEventListener("online", tomar);
        window.addEventListener("offline", tomar);
        return () => { window.clearInterval(id); quitar(); window.removeEventListener("online", tomar); window.removeEventListener("offline", tomar); };
    }, [visible, cadaMs, tomar]);
    return t;
}
