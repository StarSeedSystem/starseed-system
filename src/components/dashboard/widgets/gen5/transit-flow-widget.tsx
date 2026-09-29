'use client';

// ════════════════════════════════════════════════════════════════
// TransitFlowWidget — Flujo de Tránsito (rediseño Ola 0929-C)
// ----------------------------------------------------------------
// Movilidad real a pie de tu lugar: la parada más cercana de cada modo
// (metro, tren, tranvía, autobús, bici y coche compartidos) según el
// mapa común de OpenStreetMap —la misma consulta compartida del Radar
// de Abundancia, cada 12 h y solo a la vista— sobre una «línea de
// cercanía» en minutos a pie, con la ruta a pie hasta cada una. Y el
// consejo de cómo moverte en las próximas 3 horas con el tiempo REAL
// (lluvia, viento y temperatura). Sin horarios en vivo inventados.
// Estados honestos: sin ubicación (vacío), cargando, error y zona sin
// paradas mapeadas.
// ════════════════════════════════════════════════════════════════

import * as React from "react";
import { Bike, Bus, CarFront, CloudRain, ExternalLink, Footprints, TrainFront, TrainFrontTunnel, TramFront, Umbrella, Waves, type LucideIcon } from "lucide-react";
import { conAlfa } from "@/components/widgets-libres/acentos-categoria";
import { Lienzo, useLienzo, type EstadoLienzo } from "./_catalogo/lienzo";
import { CargandoSilueta, ErrorHonesto, VacioHonesto, tinta } from "./_catalogo/piezas";
import { distanciaTexto, minutosAPie, useEntorno, type SitioCerca, type TipoSitio } from "./_catalogo/entorno";
import { horasDesde, useMeteo } from "./_catalogo/meteo";
import { NOMBRE_MODO, consejoMovilidad, masCercanaPorModo, urlRutaAPie, type Consejo } from "./transit-flow-partes";

const MODO: Partial<Record<TipoSitio, { color: string; icono: LucideIcon }>> = {
    metro: { color: "#ef4444", icono: TrainFrontTunnel },
    tren: { color: "#a78bfa", icono: TrainFront },
    tranvia: { color: "#22d3ee", icono: TramFront },
    bus: { color: "#FFBF00", icono: Bus },
    bici: { color: "#10B981", icono: Bike },
    coche: { color: "#60a5fa", icono: CarFront },
};
const modo = (t: TipoSitio) => MODO[t] ?? MODO.bus!;
const COLOR_CONSEJO: Record<Consejo["tipo"], string> = { activo: "#10B981", paraguas: "#FFBF00", publico: "#60a5fa" };
const ICONO_CONSEJO: Record<Consejo["tipo"], LucideIcon> = { activo: Footprints, paraguas: Umbrella, publico: CloudRain };
const MAX_MIN = 15;

/** La línea de cercanía: tú en 0 y cada modo en sus minutos a pie. */
function Linea({ W, H, paradas, l }: { W: number; H: number; paradas: SitioCerca[]; l: EstadoLienzo }) {
    const base = H * 0.66, pad = 12, ancho = W - pad * 2;
    const x = (min: number) => pad + (Math.min(MAX_MIN, min) / MAX_MIN) * ancho;
    const ic = Math.max(14, Math.min(20, H * 0.26));
    const orden = [...paradas].sort((a, b) => a.dist - b.dist);
    let ultimo = -1e9, nivel = 0;
    const colocadas = orden.map((p) => {
        const px = x(minutosAPie(p.dist));
        nivel = px - ultimo < ic + 6 ? (nivel + 1) % 2 : 0;
        ultimo = px;
        return { p, px, py: base - ic * 0.9 - nivel * (ic + 4) };
    });
    return (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden className="block overflow-visible">
            <line x1={pad} x2={W - pad} y1={base} y2={base} stroke="#fff" strokeOpacity={0.18} strokeWidth={2} strokeLinecap="round" />
            <line x1={pad} x2={W - pad} y1={base} y2={base} stroke={l.acento} strokeOpacity={0.6} strokeWidth={2} strokeDasharray="4 8"
                className={l.animar ? "ss-derivar" : undefined} style={{ ["--ss-dur" as string]: "6s" }} />
            {[0, 5, 10, 15].map((m) => (
                <g key={m}>
                    <line x1={x(m)} x2={x(m)} y1={base - 3} y2={base + 3} stroke="#fff" strokeOpacity={0.35} />
                    <text x={x(m)} y={base + 15} textAnchor="middle" fill="#fff" opacity={0.45} style={{ fontSize: 10 }}>{m === 0 ? "tú" : m === 15 ? "15 min" : m}</text>
                </g>
            ))}
            <circle cx={x(0)} cy={base} r={4.5} fill="#fff" />
            {colocadas.map(({ p, px, py }) => {
                const m = modo(p.tipo), I = m.icono;
                return (
                    <g key={p.id}>
                        <line x1={px} x2={px} y1={py + ic / 2} y2={base} stroke={m.color} strokeOpacity={0.5} />
                        <circle cx={px} cy={base} r={3.5} fill={m.color} />
                        <circle cx={px} cy={py} r={ic * 0.72} fill={conAlfa(m.color, 0.18)} stroke={conAlfa(m.color, 0.6)} />
                        <I x={px - ic * 0.4} y={py - ic * 0.4} width={ic * 0.8} height={ic * 0.8} color={tinta(m.color, 0.3)} strokeWidth={2} />
                    </g>
                );
            })}
        </svg>
    );
}

export function TransitFlowWidget() {
    const l = useLienzo("#22d3ee", "#10B981");
    const ent = useEntorno(l.visible);
    const meteo = useMeteo(l.visible);
    const [ahora, setAhora] = React.useState(() => Date.now());
    React.useEffect(() => {
        if (!l.visible) return;
        setAhora(Date.now());
        const t = window.setInterval(() => setAhora(Date.now()), 10 * 60_000);
        return () => window.clearInterval(t);
    }, [l.visible]);

    const paradas = React.useMemo(() => masCercanaPorModo(ent.cerca), [ent.cerca]);
    const consejo = React.useMemo(() => (meteo.datos ? consejoMovilidad(horasDesde(meteo.datos, ahora, 3)) : null), [meteo.datos, ahora]);
    const sinLugar = !ent.lugar;
    const cargando = !sinLugar && !ent.datos && !ent.error;
    const sinDatos = !ent.datos && !!ent.error;
    const lugar = ent.lugar?.nombre || "tu lugar";
    const cerca = paradas[0];

    const etiqueta = sinLugar ? "Flujo de tránsito: vacío, sin ubicación"
        : cargando ? "Flujo de tránsito: cargando las paradas cercanas"
        : sinDatos ? "Flujo de tránsito: error, el mapa común no respondió"
        : `Flujo de tránsito en ${lugar}: ${paradas.length ? paradas.map((p) => `${NOMBRE_MODO[p.tipo]} a ${minutosAPie(p.dist)} min${p.nombre ? ` (${p.nombre})` : ""}`).join(", ") : "ninguna parada mapeada a 1 km"}${consejo ? `. ${consejo.titulo}: ${consejo.razon.toLowerCase()}` : ""}. Datos de OpenStreetMap`;

    const especial = (compacto: boolean) => {
        if (sinLugar) return <VacioHonesto icono={Waves} color={l.acento} compacto={compacto} titulo="Sin ubicación" ayuda="Elige tu lugar en el clima para ver cómo moverte." />;
        if (cargando) return <CargandoSilueta color={l.acento} etiqueta="Cargando las paradas cercanas…" />;
        if (sinDatos) return <ErrorHonesto error={ent.error} color={l.acento} onReintentar={ent.recargar} compacto={compacto} />;
        return null;
    };

    const tarjetaConsejo = (compacto: boolean) => {
        if (!consejo) return meteo.error ? <p className="text-[11px] text-white/45">Sin el tiempo de las próximas horas (error de la fuente).</p> : null;
        const c = COLOR_CONSEJO[consejo.tipo], I = ICONO_CONSEJO[consejo.tipo];
        return (
            <div className="flex min-w-0 items-center gap-2.5 rounded-xl px-2.5 py-2" style={{ background: conAlfa(c, 0.1), boxShadow: `inset 0 0 0 1px ${conAlfa(c, 0.3)}` }} role="status">
                <I className="size-4 shrink-0" style={{ color: tinta(c, 0.3) }} aria-hidden />
                <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] leading-snug text-white/90" title={`${consejo.titulo}: ${consejo.razon}`}>{l.ancho < 240 ? consejo.corto : consejo.titulo}</span>
                    {!compacto && <span className="block truncate text-[11px] text-white/55">{consejo.razon}</span>}
                </span>
            </div>
        );
    };

    const fila = (p: SitioCerca, detalle: boolean) => {
        const m = modo(p.tipo), I = m.icono;
        const nombre = p.nombre ?? NOMBRE_MODO[p.tipo]!;
        const ruta = ent.lugar ? urlRutaAPie(ent.lugar, p) : undefined;
        return (
            <li key={p.id}>
                <a href={ruta} target="_blank" rel="noopener noreferrer" title={`${NOMBRE_MODO[p.tipo]}: ${nombre}${p.detalle ? ` (${p.detalle})` : ""} · ${distanciaTexto(p.dist)}, unos ${minutosAPie(p.dist)} min a pie`}
                    aria-label={`${NOMBRE_MODO[p.tipo]}, ${nombre}, a ${minutosAPie(p.dist)} min a pie: ruta a pie en OpenStreetMap (se abre fuera)`}
                    className="flex min-w-0 cursor-pointer items-center gap-2.5 rounded-xl px-2 transition-colors duration-200 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
                    style={{ minHeight: l.toque + 4 }}>
                    <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full" style={{ background: conAlfa(m.color, 0.16), color: tinta(m.color, 0.3) }}><I className="size-3.5" /></span>
                    <span className="min-w-0 flex-1">
                        <span className={`block text-[12.5px] leading-snug text-white/90 ${detalle ? "truncate" : "line-clamp-2"}`}>{nombre}</span>
                        {detalle && <span className="block truncate text-[11px] text-white/50">{NOMBRE_MODO[p.tipo]}{p.detalle ? ` · ${p.detalle}` : ""}</span>}
                        {l.torre && <span className="block text-[11px] tabular-nums text-white/60">{minutosAPie(p.dist)} min a pie</span>}
                    </span>
                    {!l.torre && (
                        <span className="shrink-0 text-right">
                            <span className="block text-[13px] tabular-nums text-white/90">{minutosAPie(p.dist)} min</span>
                            {detalle && <span className="block text-[10.5px] tabular-nums text-white/45">{distanciaTexto(p.dist)}</span>}
                        </span>
                    )}
                    {detalle && <ExternalLink className="size-3.5 shrink-0 text-white/30" aria-hidden />}
                </a>
            </li>
        );
    };

    const lista = (max: number, detalle = true) => paradas.length ? (
        <ul className="flex min-w-0 flex-col gap-0.5" aria-label="La parada más cercana de cada modo">{paradas.slice(0, max).map((p) => fila(p, detalle))}</ul>
    ) : (
        <div role="status" className="min-w-0">
            <p className="text-[13.5px] font-medium text-white/90">Ninguna parada mapeada a 1&nbsp;km</p>
            <p className="line-clamp-3 text-[11.5px] leading-snug text-white/55">Si hay una y no sale, añádela al mapa común de OpenStreetMap.</p>
        </div>
    );

    const atribucion = (
        <p className="text-[10.5px] text-white/40">Datos © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="cursor-pointer underline-offset-2 hover:text-white/70 hover:underline">OpenStreetMap</a> y Open-Meteo</p>
    );

    if (l.base === "micro") {
        const I = cerca ? modo(cerca.tipo).icono : Waves;
        return (
            <Lienzo l={l} titulo="Flujo de Tránsito" etiqueta={etiqueta} sinCabecera>
                <div className="flex h-full flex-col items-center justify-center gap-0.5">
                    <I className="size-6" style={{ color: cerca ? tinta(modo(cerca.tipo).color, 0.3) : "rgba(255,255,255,.4)" }} aria-hidden />
                    {cerca && <span className="text-[15px] tabular-nums text-white">{minutosAPie(cerca.dist)}′</span>}
                </div>
            </Lienzo>
        );
    }

    if (l.base === "s") {
        return (
            <Lienzo l={l} titulo="Flujo de Tránsito" etiqueta={etiqueta} sinCabecera>
                {especial(true) ?? (
                    <div className="flex h-full flex-col justify-center gap-2" title="Datos © OpenStreetMap y Open-Meteo">
                        {consejo && (() => { const I = ICONO_CONSEJO[consejo.tipo]; return <p className="flex items-center gap-1.5 text-[12px] leading-snug text-white/85" title={`${consejo.titulo}: ${consejo.razon}`}><I className="size-4 shrink-0" style={{ color: tinta(COLOR_CONSEJO[consejo.tipo], 0.3) }} aria-hidden /><span className="line-clamp-2">{consejo.corto}</span></p>; })()}
                        {cerca ? (
                            <p className="min-w-0 text-[12px] text-white/70">
                                <span className="block truncate">{NOMBRE_MODO[cerca.tipo]}{cerca.nombre ? ` · ${cerca.nombre}` : ""}</span>
                                <span className="text-[18px] tabular-nums text-white">{minutosAPie(cerca.dist)} min</span> a pie
                            </p>
                        ) : <p className="text-[12px] text-white/60">Sin paradas a 1&nbsp;km</p>}
                    </div>
                )}
            </Lienzo>
        );
    }

    const hb = Math.max(80, l.alto - 64);
    const esp = especial(false);
    if (esp) {
        return (
            <Lienzo l={l} titulo="Flujo de Tránsito" subtitulo={l.ancho >= 300 ? "Cómo moverte ahora" : undefined} icono={Waves} etiqueta={etiqueta}>
                <div className="flex h-full flex-col justify-center">{esp}</div>
            </Lienzo>
        );
    }

    if (l.horizontal) {
        const wLinea = Math.max(220, l.ancho * 0.4);
        return (
            <Lienzo l={l} titulo="Flujo de Tránsito" subtitulo={`A pie de ${lugar}`} icono={Waves} etiqueta={etiqueta}>
                <div className="flex h-full min-h-0 items-center gap-4">
                    <div className="flex shrink-0 flex-col gap-2" style={{ width: wLinea }}>
                        <Linea W={wLinea} H={Math.min(110, hb * 0.6)} paradas={paradas} l={l} />
                        {tarjetaConsejo(false)}
                    </div>
                    <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-1 overflow-y-auto">{lista(Math.max(1, Math.floor((hb - 16) / 46)))}{atribucion}</div>
                </div>
            </Lienzo>
        );
    }

    if (l.torre) {
        return (
            <Lienzo l={l} titulo="Tránsito" subtitulo={lugar} icono={Waves} etiqueta={etiqueta}>
                <div className="flex h-full min-h-0 flex-col gap-2.5">
                    {tarjetaConsejo(true)}
                    <div className="min-h-0 flex-1 overflow-y-auto">{lista(Math.max(1, Math.floor((hb - 110) / 56)), false)}</div>
                    <p className="text-[10.5px] text-white/40" title="Datos © colaboradores de OpenStreetMap y Open-Meteo">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="cursor-pointer underline-offset-2 hover:text-white/70 hover:underline">OSM</a> · Open-Meteo</p>
                </div>
            </Lienzo>
        );
    }

    const grande = l.base === "xl";
    const W = l.ancho - 40;
    return (
        <Lienzo l={l} titulo="Flujo de Tránsito" subtitulo={l.ancho >= 300 ? `A pie de ${lugar}` : undefined} icono={Waves} etiqueta={etiqueta}>
            <div className="flex h-full min-h-0 flex-col gap-2.5">
                <Linea W={W} H={grande ? 96 : l.base === "l" ? 78 : 66} paradas={paradas} l={l} />
                {tarjetaConsejo(l.base === "m")}
                <div className="min-h-0 flex-1 overflow-y-auto">{lista(grande ? Math.max(3, Math.floor((hb - 210) / 38)) : l.base === "l" ? 3 : 2, l.base !== "m")}</div>
                {(grande || l.base === "l") && atribucion}
            </div>
        </Lienzo>
    );
}
