"use client";
/**
 * Clima libre (Ola 383 · WL2, rediseño ola 0929 · F) — el tiempo de AQUÍ como escena: sol que
 * gira, Luna con su fase real, nubes que derivan, lluvia que cae dentro, tormenta con destello,
 * nieve y niebla, dibujada sin caja: la escena ES la forma del widget. En grande, al lado va lo
 * útil: próximas 12 horas (temperatura y
 * lluvia), aviso de lluvia, viento, humedad, UV, orto y ocaso reales y los próximos días.
 * Fuente: la de siempre (`fetchWeatherData`, Open-Meteo sin clave) a través de una caché
 * compartida (clima-partes.ts: una petición por lugar cada 20 min, solo con el widget a la
 * vista). Sin dato real: «sin dato». Con el proveedor de ejemplo: «datos de ejemplo».
 * La ubicación de fábrica se marca «por defecto» y se ofrece «Usar mi ubicación».
 */
import * as React from "react";
import { CloudSun, Droplets, MapPin, RefreshCw, Sun as SolIcono, Wind } from "lucide-react";
import { WidgetLibre } from "@/components/widgets-libres/widget-libre";
import { WeatherLocationProvider, useWeatherLocationOpcional } from "@/modules/weather/context/weather-location-context";
import { MOCK_WEATHER_DATA } from "@/lib/weather-mock";
import { useWidgetProvider } from "@/components/dashboard/widgets/widget-data-source-control";
import type { TipoForma } from "@/lib/widgets/forma/formas";
import type { FaseLunar } from "@/lib/astro/cielo";
import { Rotulo, SinDato, disenoDe } from "./comun";
import { LunaSVG, useCieloAqui } from "./celeste";
import {
    NOMBRE_CIELO, REFRESCO_MS, avisoLluvia, cieloPorCodigo, climaCompartido, climaGuardado, proximasHoras, proximosDias, rumbo,
    type Cielo, type DatosClima, type Instantanea,
} from "./clima-partes";
import { BotonUbicacion } from "./reloj-esfera";
import { Accion, escalaTipo, esTactil, haceCuanto, horaCorta, useAhoraVivo, useClaseForzada, useDispositivo, useEnPantalla } from "./inicio-piezas";

export { cieloPorCodigo } from "./clima-partes";
export type { Cielo } from "./clima-partes";

/** Color (y forma de referencia) de cada cielo. */
export const ESCENA: Record<Cielo, { forma: TipoForma; a: string; b: string }> = {
    sol: { forma: "orbe", a: "#FFBF00", b: "#ff8a5c" },
    luna: { forma: "orbe", a: "#a5b4fc", b: "#7c5cff" },
    "sol-nubes": { forma: "mancha", a: "#ffcf5c", b: "#9fb6d8" },
    "luna-nubes": { forma: "mancha", a: "#a5b4fc", b: "#64748b" },
    nubes: { forma: "mancha", a: "#8fa6c8", b: "#cbd5e1" },
    lluvia: { forma: "gota", a: "#007FFF", b: "#23d5ab" },
    tormenta: { forma: "gema", a: "#7c5cff", b: "#FF4D6A" },
    nieve: { forma: "hexagono", a: "#e0f2ff", b: "#23d5ab" },
    niebla: { forma: "onda", a: "#9aa5b1", b: "#cbd5e1" },
};

/** La nube: cuatro círculos fundidos con un vientre plano. */
function Nube({ x = 0, y = 0, s = 1, oscura, id }: { x?: number; y?: number; s?: number; oscura?: boolean; id: string }) {
    return (
        <g transform={`translate(${x} ${y}) scale(${s})`}>
            <defs>
                <linearGradient id={`nube-${id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={oscura ? "#8a93b8" : "#ffffff"} />
                    <stop offset="100%" stopColor={oscura ? "#454c6e" : "#b9c6dc"} />
                </linearGradient>
            </defs>
            <path d="M-26 12a12 12 0 0 1 3-23.6A17 17 0 0 1 8-15a13 13 0 0 1 20 9A10.5 10.5 0 0 1 27 12Z" fill={`url(#nube-${id})`} opacity={0.96} />
        </g>
    );
}

/** La escena del tiempo (SVG, centrada, 100×100). */
function EscenaClima({ cielo, tam, fase, id, vivo }: { cielo: Cielo; tam: number; fase: FaseLunar | null; id: string; vivo: boolean }) {
    const gira = vivo ? "ss-girar" : undefined, deriva = vivo ? "ss-derivar" : undefined;
    const sol = (x: number, y: number, r: number) => (
        <g transform={`translate(${x} ${y})`}>
            <defs>
                <radialGradient id={`s-${id}`}>
                    <stop offset="0%" stopColor="#fffbe8" />
                    <stop offset="45%" stopColor="#ffd27a" />
                    <stop offset="100%" stopColor="#FFBF00" stopOpacity={0.9} />
                </radialGradient>
            </defs>
            <g className={gira} style={{ ["--ss-dur" as string]: "48s", transformBox: "fill-box", transformOrigin: "center" }}>
                {Array.from({ length: 12 }, (_, i) => (
                    <line key={i} x1={0} y1={-r * 1.35} x2={0} y2={-r * (i % 2 ? 1.6 : 1.8)} stroke="#FFBF00" strokeWidth={r * 0.12} strokeLinecap="round" opacity={0.75} transform={`rotate(${i * 30})`} />
                ))}
            </g>
            <circle r={r * 1.2} fill="#FFBF00" opacity={0.18} />
            <circle r={r} fill={`url(#s-${id})`} />
        </g>
    );
    const luna = (x: number, y: number, r: number) => fase
        ? <LunaSVG x={x} y={y} r={r} fase={fase} id={`e${id}`} />
        : <circle cx={x} cy={y} r={r} fill="#e9e4d4" />;
    const gotas = (color: string, nieve?: boolean) => (
        <g>
            {Array.from({ length: 6 }, (_, i) => (
                <g key={i} transform={`translate(${-17 + i * 7} 18)`}>
                    <g className={vivo ? "ss-caer" : undefined} style={{ ["--ss-dur" as string]: nieve ? "3.6s" : "1.2s", animationDelay: `${(i * 0.37) % 1.2}s`, transformBox: "fill-box" }}>
                        {nieve ? <circle r={1.8} fill="#ffffff" /> : <line x1={0} y1={0} x2={-1.5} y2={7} stroke={color} strokeWidth={1.6} strokeLinecap="round" />}
                    </g>
                </g>
            ))}
        </g>
    );
    return (
        <svg width={tam} height={tam} viewBox="-50 -50 100 100" aria-hidden className="shrink-0 overflow-visible">
            {cielo === "sol" && sol(0, 0, 20)}
            {cielo === "luna" && <>{luna(0, 0, 21)}{[[-28, -22], [26, -26], [30, 18]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={1.1} fill="#fff" opacity={0.7} className={vivo && i === 1 ? "ss-respirar" : undefined} />)}</>}
            {cielo === "sol-nubes" && <>{sol(-12, -12, 15)}<g className={deriva} style={{ ["--ss-dur" as string]: "11s" }}><Nube x={8} y={10} s={0.95} id={id} /></g></>}
            {cielo === "luna-nubes" && <>{luna(-12, -12, 15)}<g className={deriva} style={{ ["--ss-dur" as string]: "11s" }}><Nube x={8} y={10} s={0.95} id={id} /></g></>}
            {cielo === "nubes" && <><g className={deriva} style={{ ["--ss-dur" as string]: "14s" }}><Nube x={-10} y={-8} s={0.7} id={`${id}b`} /></g><g className={deriva} style={{ ["--ss-dur" as string]: "10s" }}><Nube x={6} y={6} s={1} id={id} /></g></>}
            {cielo === "lluvia" && <><Nube y={-4} s={1.05} oscura id={id} />{gotas("#7dd3fc")}</>}
            {cielo === "nieve" && <><Nube y={-4} s={1.05} id={id} />{gotas("#fff", true)}</>}
            {cielo === "tormenta" && (
                <>
                    <Nube y={-6} s={1.08} oscura id={id} />
                    <path d="M2 6 L-7 22 L0 22 L-4 36 L10 16 L3 16 L8 6Z" fill="#ffe066" className={vivo ? "ss-destello" : undefined} style={{ ["--ss-dur" as string]: "5s" }} opacity={vivo ? undefined : 0.9} />
                </>
            )}
            {cielo === "niebla" && [0, 1, 2, 3].map((i) => (
                <g key={i} className={deriva} style={{ ["--ss-dur" as string]: `${7 + i * 2}s` }}>
                    <rect x={-30 + (i % 2) * 6} y={-18 + i * 11} width={54} height={5} rx={2.5} fill="#e2e8f0" opacity={0.55 - i * 0.08} />
                </g>
            ))}
        </svg>
    );
}

/** Próximas horas: la curva de la temperatura y la lluvia en barras. */
function GraficoHoras({ horas, ancho, alto, color }: { horas: ReturnType<typeof proximasHoras>; ancho: number; alto: number; color: string }) {
    if (horas.length < 2) return null;
    const W = Math.max(120, ancho), H = Math.max(56, alto), arriba = 14, abajo = 16, zonaLluvia = Math.min(18, H * 0.22);
    const temps = horas.map((h) => h.temp), min = Math.min(...temps), max = Math.max(...temps);
    const x = (i: number) => 8 + (i / (horas.length - 1)) * (W - 16);
    const y = (t: number) => arriba + (1 - (t - min) / Math.max(1, max - min)) * (H - arriba - abajo - zonaLluvia - 4);
    const linea = horas.map((h, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(h.temp).toFixed(1)}`).join("");
    const cada = horas.length > 8 ? 3 : 2;
    const lluviaMax = Math.max(0, ...horas.map((h) => h.lluvia ?? 0));
    return (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" className="overflow-visible"
            aria-label={`Próximas ${horas.length} horas: de ${Math.round(min)}° a ${Math.round(max)}°${lluviaMax ? `, lluvia hasta el ${lluviaMax} %` : ", sin lluvia"}`}>
            <defs>
                <linearGradient id="area-clima" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
            </defs>
            {horas.map((h, i) => h.lluvia ? (
                <rect key={`l${i}`} x={x(i) - 3} y={H - abajo - (h.lluvia / 100) * zonaLluvia} width={6} height={(h.lluvia / 100) * zonaLluvia} rx={3} fill="#38a7ff" opacity={0.35 + (h.lluvia / 100) * 0.6} />
            ) : null)}
            <path d={`${linea}L${x(horas.length - 1)} ${H - abajo - zonaLluvia}L${x(0)} ${H - abajo - zonaLluvia}Z`} fill="url(#area-clima)" />
            <path d={linea} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            {horas.map((h, i) => i % cada === 0 ? (
                <g key={i}>
                    <circle cx={x(i)} cy={y(h.temp)} r={2.4} fill="#fff" />
                    <text x={x(i)} y={y(h.temp) - 6} textAnchor="middle" fontSize={10.5} fill="#fff" opacity={0.9}>{Math.round(h.temp)}°</text>
                    <text x={x(i)} y={H - 3} textAnchor="middle" fontSize={10} fill="#fff" opacity={0.5}>{h.hora}</text>
                </g>
            ) : null)}
        </svg>
    );
}

function Dato({ icono: Icono, children, titulo }: { icono: typeof Wind; children: React.ReactNode; titulo: string }) {
    return <span className="flex items-center gap-1 whitespace-nowrap text-[12px] text-white/75" title={titulo}><Icono aria-hidden className="size-3.5 shrink-0 text-white/50" />{children}</span>;
}

function ClimaInterno({ widgetId }: { widgetId: string }) {
    const ctx = useWeatherLocationOpcional();
    const { providerId } = useWidgetProvider(widgetId, "weather");
    const [ref, visible] = useEnPantalla<HTMLDivElement>();
    const ahora = useAhoraVivo(60_000, visible);
    const astros = useCieloAqui(ahora);
    const dispositivo = useDispositivo();
    const forzada = useClaseForzada();
    const k = escalaTipo(dispositivo), tactil = esTactil(dispositivo);
    const id = React.useId().replace(/:/g, "");
    const [inst, setInst] = React.useState<(Instantanea & { ejemplo?: boolean }) | null>(null);
    const [recargando, setRecargando] = React.useState(false);
    const lat = ctx?.location.lat, lon = ctx?.location.lon;

    React.useEffect(() => {
        if (lat === undefined || lon === undefined) return;
        if (providerId === "mock") { setInst({ t: Date.now(), clave: "ejemplo", real: true, ejemplo: true, datos: (MOCK_WEATHER_DATA as { terrestrial?: DatosClima }).terrestrial ?? null }); return; }
        const guardado = climaGuardado(lat, lon);
        if (guardado) setInst(guardado);
        if (!visible) return;
        let vivo = true;
        const cargar = () => climaCompartido(lat, lon).then((x) => { if (vivo) setInst(x); });
        void cargar();
        const idIntervalo = window.setInterval(cargar, REFRESCO_MS);
        return () => { vivo = false; window.clearInterval(idIntervalo); };
    }, [lat, lon, providerId, visible]);

    const recargar = async () => {
        if (lat === undefined || lon === undefined || recargando) return;
        setRecargando(true);
        try { setInst(await climaCompartido(lat, lon, { forzar: true })); } finally { setRecargando(false); }
    };

    const cur = inst?.real ? inst.datos?.current : undefined;
    const cielo = cieloPorCodigo(cur?.weather_code, cur?.is_day !== 0);
    const esc = cielo ? ESCENA[cielo] : { forma: "onda" as TipoForma, a: "#23d5ab", b: "#7c5cff" };
    const temp = typeof cur?.temperature_2m === "number" ? Math.round(cur.temperature_2m) : null;
    const lugar = astros?.ubicacion ?? null;
    const horas = proximasHoras(inst?.datos ?? null, 12);
    const aviso = avisoLluvia(horas);
    const dias = proximosDias(inst?.datos ?? null, 4);
    const d = inst?.datos?.daily;
    const maxHoy = typeof d?.temperature_2m_max?.[0] === "number" ? Math.round(d.temperature_2m_max[0]) : null;
    const minHoy = typeof d?.temperature_2m_min?.[0] === "number" ? Math.round(d.temperature_2m_min[0]) : null;
    const nombre = cielo ? NOMBRE_CIELO[cielo] : "";
    const vivo = visible;
    const etiqueta = temp !== null ? `Clima en ${lugar?.nombre ?? "tu zona"}: ${temp}°, ${nombre}${aviso ? `. ${aviso}` : ""}` : "Clima";
    const grande = (tam: number) => <span className="font-extralight tabular-nums leading-none text-white" style={{ fontSize: tam * k }}>{temp}°</span>;
    const maxmin = maxHoy !== null && minHoy !== null ? <span className="tabular-nums text-[12px] text-white/75">↑ {maxHoy}° · ↓ {minHoy}°</span> : null;
    const lineaLugar = lugar ? (
        <span className="flex min-w-0 items-center gap-1 text-[11.5px] text-white/55" title={lugar.porDefecto ? `${lugar.nombre}: ubicación por defecto, no la tuya` : lugar.nombre}>
            <MapPin aria-hidden className="size-3 shrink-0" /><span className="truncate">{lugar.nombre}</span>{lugar.porDefecto && <span className="shrink-0 text-amber-200/70">· por defecto</span>}
        </span>
    ) : null;
    const ejemplo = inst?.ejemplo ? <span className="text-[10px] font-semibold uppercase tracking-widest text-amber-300/80">datos de ejemplo</span> : null;
    const fase = astros?.luna ?? null;

    return (
        <div ref={ref} className="h-full w-full">
            <WidgetLibre forma="ninguna" acento={esc.a} acento2={esc.b} etiqueta={etiqueta} semilla={lugar?.nombre || "clima"}>
                {({ clase: medida, ancho, alto }) => {
                    const clase = forzada ?? medida;
                    const { base: b, horizontal } = disenoDe(clase);
                    const lado = Math.min(ancho, alto);
                    if (!inst) return <SinDato texto="leyendo el cielo…" micro={b === "micro" && { icono: CloudSun, color: "#23d5ab" }} />;
                    if (temp === null || !cielo) {
                        return <SinDato texto="sin dato del clima" micro={b === "micro" && { icono: RefreshCw, etiqueta: "Reintentar", onClick: recargar, color: "#23d5ab" }} accion={b !== "micro" ? <Accion icono={RefreshCw} color="#23d5ab" grande={tactil} onClick={recargar} disabled={recargando}>Reintentar</Accion> : undefined} />;
                    }

                    // ── micro ──
                    if (b === "micro") {
                        return (
                            <div className="flex h-full flex-col items-center justify-center" data-diseno="micro">
                                <EscenaClima cielo={cielo} tam={lado * 0.42} fase={fase} id={id} vivo={false} />
                                <span className="-mt-1 font-light tabular-nums text-white" style={{ fontSize: lado * 0.26 }}>{temp}°</span>
                            </div>
                        );
                    }

                    // ── s ──
                    if (b === "s") {
                        return (
                            <div className="flex h-full flex-col items-center justify-center gap-0.5 text-center" data-diseno="s">
                                <EscenaClima cielo={cielo} tam={lado * 0.4} fase={fase} id={id} vivo={vivo} />
                                {grande(lado * 0.24)}
                                <Rotulo color={esc.b}>{nombre}</Rotulo>
                                {maxmin}
                            </div>
                        );
                    }

                    const detalles = (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            {typeof cur?.apparent_temperature === "number" && <span className="text-[12px] text-white/75">sensación {Math.round(cur.apparent_temperature)}°</span>}
                            {typeof cur?.wind_speed_10m === "number" && <Dato icono={Wind} titulo="Viento">{Math.round(cur.wind_speed_10m)} km/h {rumbo(cur.wind_direction_10m)}</Dato>}
                            {typeof cur?.relative_humidity_2m === "number" && <Dato icono={Droplets} titulo="Humedad">{Math.round(cur.relative_humidity_2m)} %</Dato>}
                            {typeof cur?.uv_index === "number" && <Dato icono={SolIcono} titulo="Índice UV">UV {Math.round(cur.uv_index)}</Dato>}
                        </div>
                    );
                    const orto = astros?.orto && astros?.ocaso ? <span className="text-[12px] tabular-nums text-white/60">Sol ↑ {horaCorta(astros.orto)} · ↓ {horaCorta(astros.ocaso)}</span> : null;
                    const actualizado = inst.real && !inst.ejemplo ? (
                        <span className="flex items-center gap-1.5 text-[11px] text-white/45">
                            {haceCuanto(inst.t)}
                            <button type="button" onClick={recargar} disabled={recargando || Date.now() - inst.t < 120_000} aria-label="Actualizar el clima"
                                title={Date.now() - inst.t < 120_000 ? "Recién actualizado" : "Actualizar ahora"}
                                className="ss-redondo grid size-6 cursor-pointer place-items-center rounded-full outline-none transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-teal-300/70 disabled:cursor-default disabled:opacity-40">
                                <RefreshCw className={`size-3 ${recargando ? "animate-spin" : ""}`} />
                            </button>
                        </span>
                    ) : ejemplo;

                    // ── panorámico ──
                    if (clase === "panoramico" && horizontal) {
                        return (
                            <div className="flex h-full w-full items-center gap-4 px-3" data-diseno="panoramico">
                                <EscenaClima cielo={cielo} tam={Math.min(alto * 0.8, 110)} fase={fase} id={id} vivo={vivo} />
                                <div className="flex shrink-0 flex-col gap-0.5">{grande(Math.min(alto * 0.36, 52))}<Rotulo color={esc.b}>{nombre}</Rotulo>{maxmin}</div>
                                <div className="min-w-0 flex-1"><GraficoHoras horas={horas} ancho={ancho - Math.min(alto * 0.8, 110) - 180} alto={alto - 24} color={esc.a} /></div>
                            </div>
                        );
                    }

                    // ── torre ──
                    if (clase === "torre") {
                        return (
                            <div className="flex h-full w-full flex-col items-center gap-2 px-2 py-3 text-center" data-diseno="torre">
                                <EscenaClima cielo={cielo} tam={Math.min(ancho * 0.7, 120)} fase={fase} id={id} vivo={vivo} />
                                {grande(Math.min(ancho * 0.34, 60))}
                                <Rotulo color={esc.b}>{nombre}</Rotulo>
                                {maxmin}
                                {aviso && <span className="text-[11.5px] text-sky-200">{aviso}</span>}
                                <ul className="mt-1 flex w-full flex-col gap-1">
                                    {dias.slice(0, Math.max(1, Math.floor((alto - 330) / 26))).map((x) => (
                                        <li key={x.dia} className="flex items-center justify-between text-[12px] tabular-nums">
                                            <span className="capitalize text-white/70">{new Date(x.dia + "T12:00").toLocaleDateString("es-ES", { weekday: "short" })}</span>
                                            <span className="text-white">{Math.round(x.max)}° <span className="text-white/45">{Math.round(x.min)}°</span></span>
                                        </li>
                                    ))}
                                </ul>
                                <div className="mt-auto">{lineaLugar}</div>
                            </div>
                        );
                    }

                    // ── m cuadrado: la escena y lo esencial ──
                    const apaisado = ancho >= alto * 1.3;
                    if (b === "m" && !apaisado) {
                        return (
                            <div className="flex h-full flex-col items-center justify-center gap-1 px-3 text-center" data-diseno="m">
                                <EscenaClima cielo={cielo} tam={lado * 0.34} fase={fase} id={id} vivo={vivo} />
                                {grande(lado * 0.2)}
                                <Rotulo color={esc.b}>{nombre}</Rotulo>
                                {maxmin}
                                {aviso ? <span className="text-[11.5px] text-sky-200">{aviso}</span> : typeof cur?.apparent_temperature === "number" && <span className="text-[11.5px] text-white/65">sensación {Math.round(cur.apparent_temperature)}°</span>}
                                {lineaLugar}
                                {ejemplo}
                            </div>
                        );
                    }

                    // ── m apaisado, l y xl: escena a la izquierda, lo útil a la derecha ──
                    const izq = Math.min(alto * (b === "xl" ? 0.5 : 0.62), ancho * 0.36, 190);
                    const derecha = ancho - izq - 48;
                    const conGrafico = b !== "m" || alto >= 230;
                    return (
                        <div className="flex h-full w-full items-center gap-4 px-4 py-3" data-diseno={`${b}-apaisado`}>
                            <div className="flex shrink-0 flex-col items-center gap-1 text-center" style={{ width: izq }}>
                                <EscenaClima cielo={cielo} tam={izq * 0.78} fase={fase} id={id} vivo={vivo} />
                                {grande(Math.min(izq * 0.36, 64))}
                                <Rotulo color={esc.b}>{nombre}</Rotulo>
                                {maxmin}
                            </div>
                            <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
                                {lineaLugar}
                                {detalles}
                                {aviso && <span className="text-[12px] font-medium text-sky-200">{aviso}</span>}
                                {conGrafico && <GraficoHoras horas={horas.slice(0, b === "m" ? 8 : 12)} ancho={derecha} alto={b === "m" ? 70 : Math.min(110, alto * 0.34)} color={esc.a} />}
                                {b === "xl" && dias.length > 0 && (
                                    <div className="flex justify-between gap-2 pt-1">
                                        {dias.map((x) => (
                                            <div key={x.dia} className="flex flex-col items-center text-[11.5px] tabular-nums">
                                                <span className="capitalize text-white/60">{new Date(x.dia + "T12:00").toLocaleDateString("es-ES", { weekday: "short" }).replace(".", "")}</span>
                                                <span className="text-white">{Math.round(x.max)}°</span>
                                                <span className="text-white/45">{Math.round(x.min)}°</span>
                                                {x.lluvia !== null && x.lluvia >= 30 && <span className="text-[10.5px] text-sky-300">{x.lluvia} %</span>}
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    {orto}
                                    {actualizado}
                                </div>
                                {lugar?.porDefecto && b !== "m" && astros && <div><BotonUbicacion cielo={astros} grande={tactil} /></div>}
                            </div>
                        </div>
                    );
                }}
            </WidgetLibre>
        </div>
    );
}

export function ClimaLibre({ widgetId = "weather-basic" }: { widgetId?: string }) {
    const ctx = useWeatherLocationOpcional();
    if (!ctx) return <WeatherLocationProvider><ClimaInterno widgetId={widgetId} /></WeatherLocationProvider>;
    return <ClimaInterno widgetId={widgetId} />;
}

export default ClimaLibre;
