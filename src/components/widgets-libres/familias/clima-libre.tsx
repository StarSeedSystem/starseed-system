"use client";
/**
 * Clima libre (Ola 383 · WL2) — la FORMA es el tiempo: sol = orbe dorado que respira, luna =
 * orbe violeta, nubes = mancha que deriva, lluvia = gota con gotas cayendo, tormenta = cristal
 * con relámpagos, nieve = hexágono, niebla = onda. Misma fuente que el clima clásico
 * (`fetchWeatherData` con la ubicación del usuario y el proveedor elegido por widget).
 * Si la respuesta no es real (el clon de ejemplo sin Open-Meteo), dice «sin dato».
 */
import * as React from "react";
import { WidgetLibre } from "@/components/widgets-libres/widget-libre";
import { WeatherLocationProvider, useWeatherLocationOpcional } from "@/modules/weather/context/weather-location-context";
import { fetchWeatherData, MOCK_WEATHER_DATA } from "@/lib/weather-mock";
import { useWidgetProvider } from "@/components/dashboard/widgets/widget-data-source-control";
import type { TipoForma } from "@/lib/widgets/forma/formas";
import { Rotulo, SinDato, disenoDe } from "./comun";

export type Cielo = "sol" | "luna" | "nubes" | "lluvia" | "tormenta" | "nieve" | "niebla";

/** Código WMO de Open-Meteo → estado del cielo. */
export function cieloPorCodigo(codigo: number | undefined, esDia = true): Cielo | null {
    if (codigo === undefined || codigo === null || Number.isNaN(codigo)) return null;
    if (codigo <= 1) return esDia ? "sol" : "luna";
    if (codigo <= 3) return "nubes";
    if (codigo === 45 || codigo === 48) return "niebla";
    if (codigo >= 95) return "tormenta";
    if ((codigo >= 71 && codigo <= 77) || codigo === 85 || codigo === 86) return "nieve";
    return "lluvia";
}

export const ESCENA: Record<Cielo, { forma: TipoForma; a: string; b: string; nombre: string }> = {
    sol: { forma: "orbe", a: "#FFBF00", b: "#ff8a5c", nombre: "Despejado" },
    luna: { forma: "orbe", a: "#a5b4fc", b: "#7c5cff", nombre: "Noche despejada" },
    nubes: { forma: "mancha", a: "#8fa6c8", b: "#cbd5e1", nombre: "Nublado" },
    lluvia: { forma: "gota", a: "#007FFF", b: "#23d5ab", nombre: "Lluvia" },
    tormenta: { forma: "cristal", a: "#7c5cff", b: "#DC143C", nombre: "Tormenta" },
    nieve: { forma: "hexagono", a: "#e0f2ff", b: "#23d5ab", nombre: "Nieve" },
    niebla: { forma: "onda", a: "#9aa5b1", b: "#cbd5e1", nombre: "Niebla" },
};

function Particulas({ cielo }: { cielo: Cielo }) {
    const n = cielo === "lluvia" ? 7 : cielo === "nieve" ? 6 : 0;
    return (
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            {cielo === "sol" && <div className="ss-girar absolute inset-[12%] rounded-full opacity-40" style={{ ["--ss-dur" as string]: "40s", background: "repeating-conic-gradient(#FFBF0055 0 6deg, transparent 6deg 30deg)", maskImage: "radial-gradient(closest-side, transparent 55%, #000 60%, transparent)" }} />}
            {cielo === "nubes" && [0, 1].map((i) => <div key={i} className="ss-derivar absolute rounded-full" style={{ ["--ss-dur" as string]: `${9 + i * 4}s`, left: `${15 + i * 30}%`, top: `${22 + i * 18}%`, width: "45%", height: "30%", background: "radial-gradient(closest-side, #e2e8f055, transparent)" }} />)}
            {cielo === "tormenta" && <div className="ss-destello absolute inset-0 rounded-full" style={{ background: "radial-gradient(closest-side, #ffffffaa, transparent)" }} />}
            {cielo === "niebla" && [0, 1, 2].map((i) => <div key={i} className="ss-derivar absolute left-[10%] h-[8%] w-[80%] rounded-full bg-white/15" style={{ ["--ss-dur" as string]: `${7 + i * 3}s`, top: `${30 + i * 18}%` }} />)}
            {Array.from({ length: n }, (_, i) => (
                <span key={i} className="ss-caer absolute top-0" style={{ ["--ss-dur" as string]: cielo === "nieve" ? "4.5s" : "1.4s", animationDelay: `${(i * 0.37) % 1.4}s`, left: `${12 + i * 12}%`, width: cielo === "nieve" ? 5 : 1.5, height: cielo === "nieve" ? 5 : 12, borderRadius: 9, background: cielo === "nieve" ? "#fff" : "#7dd3fc" }} />
            ))}
        </div>
    );
}

function OlaHoras({ temps, color }: { temps: number[]; color: string }) {
    if (temps.length < 2) return null;
    const min = Math.min(...temps), max = Math.max(...temps), W = 100, H = 30;
    const pts = temps.map((v, i) => [(i / (temps.length - 1)) * W, H - ((v - min) / Math.max(1, max - min)) * (H - 6) - 3]);
    const d = pts.map(([x, y], i) => (i ? `L${x.toFixed(1)} ${y.toFixed(1)}` : `M${x} ${y.toFixed(1)}`)).join("");
    return (
        <svg aria-label={`Próximas ${temps.length} horas: de ${Math.round(min)}° a ${Math.round(max)}°`} viewBox={`0 0 ${W} ${H}`} className="h-8 w-full overflow-visible">
            <path d={`${d}L${W} ${H}L0 ${H}Z`} fill={`${color}22`} />
            <path d={d} fill="none" stroke={color} strokeWidth={1.4} strokeLinecap="round" />
        </svg>
    );
}

function ClimaInterno({ widgetId }: { widgetId: string }) {
    const ctx = useWeatherLocationOpcional();
    const { providerId } = useWidgetProvider(widgetId, "weather");
    const [estado, setEstado] = React.useState<{ datos: any; real: boolean; ejemplo: boolean } | null>(null);
    const lat = ctx?.location.lat, lon = ctx?.location.lon;
    React.useEffect(() => {
        if (lat === undefined || lon === undefined) return;
        let vivo = true;
        if (providerId === "mock") { setEstado({ datos: MOCK_WEATHER_DATA.terrestrial, real: true, ejemplo: true }); return; }
        fetchWeatherData(lat, lon)
            .then((j) => vivo && setEstado({ datos: j?.terrestrial ?? j, real: !Array.isArray(j?._sources) || j._sources.includes("open-meteo"), ejemplo: false }))
            .catch(() => vivo && setEstado({ datos: null, real: false, ejemplo: false }));
        return () => { vivo = false; };
    }, [lat, lon, providerId]);

    const cur = estado?.real ? estado.datos?.current : undefined;
    const cielo = cieloPorCodigo(cur?.weather_code, cur?.is_day !== 0);
    const esc = cielo ? ESCENA[cielo] : { forma: "onda" as TipoForma, a: "#23d5ab", b: "#7c5cff", nombre: "" };
    const temp = typeof cur?.temperature_2m === "number" ? Math.round(cur.temperature_2m) : null;
    const lugar = ctx?.location.name ?? "";

    return (
        <WidgetLibre forma={esc.forma} acento={esc.a} acento2={esc.b} etiqueta={temp !== null ? `Clima en ${lugar}: ${temp}°, ${esc.nombre}` : "Clima"} semilla={lugar || "clima"}>
            {({ clase }) => {
                const { base: b } = disenoDe(clase);
                if (!estado) return <SinDato texto="leyendo el cielo…" />;
                if (temp === null || !cielo) return <SinDato texto="sin dato del clima" />;
                const d = estado.datos?.daily, horas: number[] = (estado.datos?.hourly?.temperature_2m ?? []).slice(0, 12);
                const tamTemp = b === "micro" ? "text-3xl" : b === "s" ? "text-4xl" : "text-5xl";
                return (
                    <div className="relative flex h-full w-full flex-col items-center justify-center gap-1 px-3 text-center text-white">
                        {b !== "micro" && <Particulas cielo={cielo} />}
                        <span className={`${tamTemp} ss-flotar relative font-extralight tabular-nums`}>{temp}°</span>
                        {b !== "micro" && <Rotulo color={esc.b}>{esc.nombre}</Rotulo>}
                        {(b === "m" || b === "l" || b === "xl") && (
                            <div className="relative flex flex-col items-center gap-0.5 text-[11px] text-white/80">
                                {Array.isArray(d?.temperature_2m_max) && <span className="tabular-nums">↑ {Math.round(d.temperature_2m_max[0])}° · ↓ {Math.round(d.temperature_2m_min[0])}°</span>}
                                {typeof cur.apparent_temperature === "number" && <span>sensación {Math.round(cur.apparent_temperature)}°</span>}
                                {lugar && <span className="max-w-[12rem] truncate text-white/60">{lugar}</span>}
                            </div>
                        )}
                        {(b === "l" || b === "xl") && <div className="relative w-4/5"><OlaHoras temps={horas} color={esc.a} /></div>}
                        {b === "xl" && Array.isArray(d?.time) && (
                            <div className="relative flex gap-3 pt-1">
                                {d.time.slice(1, 5).map((dia: string, i: number) => (
                                    <div key={dia} className="flex flex-col items-center text-[10px] text-white/75">
                                        <span className="capitalize">{new Date(dia + "T12:00").toLocaleDateString("es-ES", { weekday: "short" })}</span>
                                        <span className="tabular-nums text-white">{Math.round(d.temperature_2m_max[i + 1])}°</span>
                                        <span className="tabular-nums text-white/50">{Math.round(d.temperature_2m_min[i + 1])}°</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {estado.ejemplo && <span className="relative text-[9px] uppercase tracking-widest text-amber-300/80">datos de ejemplo</span>}
                    </div>
                );
            }}
        </WidgetLibre>
    );
}

export function ClimaLibre({ widgetId = "weather-basic" }: { widgetId?: string }) {
    const ctx = useWeatherLocationOpcional();
    if (!ctx) return <WeatherLocationProvider><ClimaInterno widgetId={widgetId} /></WeatherLocationProvider>;
    return <ClimaInterno widgetId={widgetId} />;
}

export default ClimaLibre;
