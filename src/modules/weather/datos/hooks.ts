"use client";
/**
 * Hooks de «Clima y cosmos»: fuentes compartidas que solo piden cuando el widget se ve y la
 * pestaña está visible, la ubicación del clima (contexto o, fuera de él, la guardada) y las
 * unidades preferidas (°C/°F, km/h, m/s, mph, nudos), comunes a todos los widgets.
 */
import * as React from "react";
import { useWeatherLocationOpcional, type LocationData } from "@/modules/weather/context/weather-location-context";
import { reverseGeocode, searchPlaces } from "@/lib/geocoding";
import { RESPIRO_ERROR_MS, instantaneaVacia, type Fuente, type Instantanea } from "./cache-compartida";

// ── Visibilidad ───────────────────────────────────────────────────────

function pestanaVisible(): boolean {
    return typeof document === "undefined" || document.visibilityState !== "hidden";
}

/** ¿El elemento está en pantalla y la pestaña visible? (sin IntersectionObserver → sí). */
export function useEnPantalla(ref: React.RefObject<Element | null>): boolean {
    const [enVista, setEnVista] = React.useState(true);
    const [visible, setVisible] = React.useState(true);
    React.useEffect(() => {
        const alCambiar = () => setVisible(pestanaVisible());
        alCambiar();
        document.addEventListener("visibilitychange", alCambiar);
        return () => document.removeEventListener("visibilitychange", alCambiar);
    }, []);
    React.useEffect(() => {
        const el = ref.current;
        if (!el || typeof IntersectionObserver === "undefined") return;
        const io = new IntersectionObserver((e) => setEnVista(e.some((x) => x.isIntersecting)), { rootMargin: "120px" });
        io.observe(el);
        return () => io.disconnect();
    }, [ref]);
    return enVista && visible;
}

// ── Fuente compartida ─────────────────────────────────────────────────

export type EstadoFuente<T> = Instantanea<T> & { refrescar: () => void };

/**
 * Lee una fuente compartida y, mientras `activo`, la mantiene al día sin sondear: una petición
 * al caducar (≥ 15 min), solo con la pestaña visible, y ninguna si otra instancia ya la hizo.
 * `args === null` → sin datos ni peticiones (p. ej. sin ubicación).
 */
export function useFuente<A, T>(fuente: Fuente<A, T>, args: A | null, activo: boolean): EstadoFuente<T> {
    const k = args === null ? null : fuente.clave(args);
    const argsRef = React.useRef(args);
    argsRef.current = args;
    const suscribir = React.useCallback(
        (cb: () => void) => (argsRef.current === null ? () => {} : fuente.suscribir(argsRef.current, cb)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [fuente, k],
    );
    const leer = React.useCallback(
        () => (argsRef.current === null ? instantaneaVacia<T>() : fuente.leer(argsRef.current)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [fuente, k],
    );
    const foto = React.useSyncExternalStore(suscribir, leer, instantaneaVacia<T>);

    React.useEffect(() => {
        if (k === null || !activo) return;
        let reloj: number | undefined;
        const programar = () => {
            window.clearTimeout(reloj);
            const a = argsRef.current;
            if (a === null) return;
            const s = fuente.leer(a);
            const espera = s.error ? RESPIRO_ERROR_MS : s.en ? Math.max(60_000, s.en + fuente.ttlMs - Date.now() + 1_000) : RESPIRO_ERROR_MS;
            reloj = window.setTimeout(revisar, espera);
        };
        const revisar = () => {
            const a = argsRef.current;
            if (a === null) return;
            if (pestanaVisible() && !fuente.vigente(a)) {
                void fuente.obtener(a).then(programar);
                return;
            }
            programar();
        };
        revisar();
        const alVolver = () => { if (pestanaVisible()) revisar(); };
        document.addEventListener("visibilitychange", alVolver);
        return () => {
            window.clearTimeout(reloj);
            document.removeEventListener("visibilitychange", alVolver);
        };
    }, [fuente, k, activo]);

    const refrescar = React.useCallback(() => {
        if (argsRef.current !== null) void fuente.obtener(argsRef.current, { forzar: true });
    }, [fuente]);

    return React.useMemo(() => ({ ...foto, refrescar }), [foto, refrescar]);
}

// ── Ubicación ─────────────────────────────────────────────────────────

export const CLAVE_UBICACION = "starseed_weather_location";
const EVENTO_UBICACION = "starseed:clima-ubicacion";

export interface UbicacionClima { lat: number; lon: number; nombre: string; pais?: string; zona?: string; elegida: boolean }

export interface ControlUbicacion {
    ubicacion: UbicacionClima | null;
    fijar: (l: LocationData) => void;
    usarMia: () => Promise<void>;
    buscar: (q: string) => Promise<LocationData[]>;
}

function leerGuardada(): LocationData | null {
    try {
        const j = JSON.parse(window.localStorage.getItem(CLAVE_UBICACION) || "null");
        if (j && typeof j.lat === "number" && typeof j.lon === "number" && typeof j.name === "string") return j as LocationData;
    } catch { /* sin almacén */ }
    return null;
}

function geolocalizar(): Promise<LocationData> {
    return new Promise((resolver, rechazar) => {
        if (typeof navigator === "undefined" || !navigator.geolocation) {
            rechazar(new Error("Este navegador no da la ubicación"));
            return;
        }
        navigator.geolocation.getCurrentPosition(
            async (p) => {
                const { latitude: lat, longitude: lon } = p.coords;
                const r = await reverseGeocode(lat, lon).catch(() => null);
                resolver({ lat, lon, name: r?.name ?? "Tu ubicación", country: r?.country, timezone: r?.timezone });
            },
            () => rechazar(new Error("No se pudo leer tu ubicación")),
            { enableHighAccuracy: false, timeout: 10_000, maximumAge: 30 * 60_000 },
        );
    });
}

export function useUbicacionClima(): ControlUbicacion {
    const ctx = useWeatherLocationOpcional();
    const [guardada, setGuardada] = React.useState<LocationData | null>(null);
    const [hayGuardada, setHayGuardada] = React.useState(false);

    React.useEffect(() => {
        const leer = () => {
            const g = leerGuardada();
            setGuardada(g);
            setHayGuardada(!!g);
        };
        leer();
        window.addEventListener(EVENTO_UBICACION, leer);
        window.addEventListener("storage", leer);
        return () => {
            window.removeEventListener(EVENTO_UBICACION, leer);
            window.removeEventListener("storage", leer);
        };
    }, [ctx?.location.lat, ctx?.location.lon]);

    const fijar = React.useCallback((l: LocationData) => {
        if (ctx) ctx.setLocation(l);
        else {
            try { window.localStorage.setItem(CLAVE_UBICACION, JSON.stringify(l)); } catch { /* sin almacén */ }
        }
        window.dispatchEvent(new Event(EVENTO_UBICACION));
    }, [ctx]);

    const usarMia = React.useCallback(async () => {
        if (ctx) {
            await ctx.requestGeolocation();
            window.dispatchEvent(new Event(EVENTO_UBICACION));
            return;
        }
        fijar(await geolocalizar());
    }, [ctx, fijar]);

    const buscar = React.useCallback(async (q: string): Promise<LocationData[]> => {
        if (!q.trim()) return [];
        if (ctx) return ctx.searchLocation(q);
        const r = await searchPlaces(q, 5).catch(() => []);
        return r.map((x) => ({ lat: x.lat, lon: x.lon, name: x.name, country: x.country, timezone: x.timezone }));
    }, [ctx]);

    const l = ctx ? ctx.location : guardada;
    const ubicacion = l ? { lat: l.lat, lon: l.lon, nombre: l.name, pais: l.country, zona: l.timezone, elegida: hayGuardada } : null;
    return { ubicacion, fijar, usarMia, buscar };
}

// ── Unidades ──────────────────────────────────────────────────────────

export type UnidadTemp = "c" | "f";
export type UnidadViento = "kmh" | "ms" | "mph" | "kn";
export interface Unidades { temp: UnidadTemp; viento: UnidadViento }

const CLAVE_UNIDADES = "starseed.clima.unidades.v1";
const EVENTO_UNIDADES = "starseed:clima-unidades";
const POR_DEFECTO: Unidades = { temp: "c", viento: "kmh" };
let unidadesCache: Unidades | null = null;

function leerUnidades(): Unidades {
    if (unidadesCache) return unidadesCache;
    try {
        const j = JSON.parse(window.localStorage.getItem(CLAVE_UNIDADES) || "null");
        unidadesCache = {
            temp: j?.temp === "f" ? "f" : "c",
            viento: ["kmh", "ms", "mph", "kn"].includes(j?.viento) ? j.viento : "kmh",
        };
    } catch {
        unidadesCache = POR_DEFECTO;
    }
    return unidadesCache;
}

function suscribirUnidades(cb: () => void) {
    const alCambiar = () => { unidadesCache = null; cb(); };
    window.addEventListener(EVENTO_UNIDADES, alCambiar);
    window.addEventListener("storage", alCambiar);
    return () => {
        window.removeEventListener(EVENTO_UNIDADES, alCambiar);
        window.removeEventListener("storage", alCambiar);
    };
}

export function useUnidades(): [Unidades, (p: Partial<Unidades>) => void] {
    const u = React.useSyncExternalStore(suscribirUnidades, leerUnidades, () => POR_DEFECTO);
    const fijar = React.useCallback((p: Partial<Unidades>) => {
        const nuevo = { ...leerUnidades(), ...p };
        try { window.localStorage.setItem(CLAVE_UNIDADES, JSON.stringify(nuevo)); } catch { /* sin almacén */ }
        unidadesCache = nuevo;
        window.dispatchEvent(new Event(EVENTO_UNIDADES));
    }, []);
    return [u, fijar];
}

export function aTemp(c: number, u: UnidadTemp): number {
    return u === "f" ? c * 1.8 + 32 : c;
}

export function aViento(kmh: number, u: UnidadViento): number {
    switch (u) {
        case "ms": return kmh / 3.6;
        case "mph": return kmh / 1.609344;
        case "kn": return kmh / 1.852;
        default: return kmh;
    }
}

export const ETIQUETA_VIENTO: Record<UnidadViento, string> = { kmh: "km/h", ms: "m/s", mph: "mph", kn: "nudos" };

/** Formateadores de hora y día en la zona del sitio (si el navegador la conoce). */
export function formateadores(zona?: string) {
    const crear = (o: Intl.DateTimeFormatOptions) => {
        try { return new Intl.DateTimeFormat("es-ES", { ...o, timeZone: zona }); } catch { return new Intl.DateTimeFormat("es-ES", o); }
    };
    const hora = crear({ hour: "2-digit", minute: "2-digit", hour12: false });
    const soloHora = crear({ hour: "2-digit", hour12: false });
    const dia = crear({ weekday: "short" });
    const diaLargo = crear({ weekday: "long", day: "numeric", month: "long" });
    return {
        hora: (t: number) => hora.format(new Date(t)),
        soloHora: (t: number) => `${soloHora.format(new Date(t))} h`,
        dia: (t: number) => dia.format(new Date(t + 12 * 3_600_000)).replace(".", ""),
        diaLargo: (t: number) => diaLargo.format(new Date(t)),
    };
}

/** Hora actual refrescada cada `ms` (null hasta montar: el servidor no sabe tu hora). */
export function useReloj(ms = 60_000): number | null {
    const [t, setT] = React.useState<number | null>(null);
    React.useEffect(() => {
        setT(Date.now());
        const id = window.setInterval(() => { if (pestanaVisible()) setT(Date.now()); }, ms);
        return () => window.clearInterval(id);
    }, [ms]);
    return t;
}
