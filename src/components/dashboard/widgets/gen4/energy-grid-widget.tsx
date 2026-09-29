'use client';

// ════════════════════════════════════════════════════════════════
// EnergyGridWidget — Energía del Sol (rediseño Ola 0929-C)
// ----------------------------------------------------------------
// Comunismo de abundancia práctico: CUÁNDO sobra energía hoy en tu
// lugar. La curva es la radiación solar REAL de Open-Meteo (la misma
// lectura compartida de 30 min que usan los demás widgets, solo a la
// vista); la franja de abundancia son las horas seguidas cerca del
// pico: ahí van las lavadoras, las cargas y el trabajo que gasta. La
// producción es una estimación por cada kWp de paneles (rendimiento
// 80 %), dicha como tal. Además, la batería de ESTE dispositivo (si el
// navegador la expone) y la energía que hay en el procomún de la red.
// Estados honestos: cargando, sin ubicación (vacío) y error.
// ════════════════════════════════════════════════════════════════

import * as React from "react";
import Link from "next/link";
import { BatteryCharging, BatteryMedium, LocateFixed, Sun, Zap } from "lucide-react";
import { conAlfa } from "@/components/widgets-libres/acentos-categoria";
import { useWeatherLocationOpcional } from "@/modules/weather/context/weather-location-context";
import { Lienzo, useIdSvg, useLienzo, type EstadoLienzo } from "../gen5/_catalogo/lienzo";
import { Accion, CargandoSilueta, ErrorHonesto, VacioHonesto, tinta } from "../gen5/_catalogo/piezas";
import { useMeteo } from "../gen5/_catalogo/meteo";
import { useProcomun } from "../gen5/_catalogo/procomun";
import { cambioPct, diaSolar, horaLocal, kwhTexto, RENDIMIENTO, type DiaSolar } from "./energy-grid-partes";

const SOL = "#FFBF00";

function useBateria(): { nivel: number; cargando: boolean } | null {
    const [b, setB] = React.useState<{ nivel: number; cargando: boolean } | null>(null);
    React.useEffect(() => {
        const nav = navigator as Navigator & { getBattery?: () => Promise<EventTarget & { level: number; charging: boolean }> };
        if (!nav.getBattery) return;
        let vivo = true;
        let bat: (EventTarget & { level: number; charging: boolean }) | null = null;
        const leer = () => { if (vivo && bat) setB({ nivel: bat.level, cargando: bat.charging }); };
        nav.getBattery().then((x) => {
            bat = x;
            leer();
            x.addEventListener("levelchange", leer);
            x.addEventListener("chargingchange", leer);
        }).catch(() => undefined);
        return () => {
            vivo = false;
            bat?.removeEventListener("levelchange", leer);
            bat?.removeEventListener("chargingchange", leer);
        };
    }, []);
    return b;
}

/** La curva del sol de hoy, la franja de abundancia y el momento actual. */
function Curva({ W, H, dia, ahora, l, zona, rotulos }: { W: number; H: number; dia: DiaSolar; ahora: number; l: EstadoLienzo; zona: string; rotulos?: boolean }) {
    const id = useIdSvg("sol");
    const pts = dia.puntos;
    if (pts.length < 2) return <svg width={W} height={H} aria-hidden />;
    const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
    const max = Math.max(700, dia.pico?.w ?? 0);
    const pie = rotulos ? 14 : 2;
    const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * W;
    const y = (w: number) => (H - pie) - (w / max) * (H - pie - 6);
    const linea = pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)} ${y(p.w).toFixed(1)}`).join("");
    const area = `${linea}L${x(t1).toFixed(1)} ${H - pie}L${x(t0).toFixed(1)} ${H - pie}Z`;
    const dentro = ahora >= t0 && ahora <= t1;
    // Radiación interpolada en «ahora» para sentar el sol sobre la curva.
    let wAhora = 0;
    for (let i = 1; i < pts.length; i++) if (pts[i].t >= ahora) { const a = pts[i - 1], b = pts[i]; wAhora = a.w + ((b.w - a.w) * (ahora - a.t)) / Math.max(1, b.t - a.t); break; }
    return (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden className="block overflow-visible">
            <defs>
                <linearGradient id={`${id}-a`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={SOL} stopOpacity={0.55} />
                    <stop offset="100%" stopColor={SOL} stopOpacity={0.02} />
                </linearGradient>
                <radialGradient id={`${id}-s`} cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#fff" />
                    <stop offset="45%" stopColor={tinta(SOL, 0.3)} />
                    <stop offset="100%" stopColor={SOL} stopOpacity={0} />
                </radialGradient>
            </defs>
            {dia.franja && (
                <rect x={x(Math.max(t0, dia.franja.desde))} y={0} width={Math.max(2, x(Math.min(t1, dia.franja.hasta)) - x(Math.max(t0, dia.franja.desde)))} height={H - pie}
                    rx={6} fill={conAlfa(l.acento2, 0.14)} stroke={conAlfa(l.acento2, 0.45)} strokeWidth={1} strokeDasharray="3 3" />
            )}
            <line x1={0} x2={W} y1={H - pie} y2={H - pie} stroke="#fff" strokeOpacity={0.15} />
            <path d={area} fill={`url(#${id}-a)`} />
            <path d={linea} fill="none" stroke={tinta(SOL, 0.15)} strokeWidth={1.8} strokeLinejoin="round" />
            {dentro && (
                <g>
                    <line x1={x(ahora)} x2={x(ahora)} y1={y(wAhora)} y2={H - pie} stroke="#fff" strokeOpacity={0.35} strokeDasharray="2 3" />
                    <circle cx={x(ahora)} cy={y(wAhora)} r={Math.max(7, H * 0.09)} fill={`url(#${id}-s)`}
                        className={l.animar ? "ss-respirar" : undefined} style={{ ["--ss-dur" as string]: "5s", transformBox: "fill-box", transformOrigin: "center" }} />
                </g>
            )}
            {rotulos && (
                <>
                    <text x={0} y={H - 2} fill="#fff" opacity={0.45} style={{ fontSize: 10 }}>{horaLocal(dia.orto ?? t0, zona)}</text>
                    <text x={W} y={H - 2} textAnchor="end" fill="#fff" opacity={0.45} style={{ fontSize: 10 }}>{horaLocal(dia.ocaso ?? t1, zona)}</text>
                </>
            )}
        </svg>
    );
}

/** El sol como glifo (micro): rayos según la energía del día. */
function Glifo({ D, kwh, l }: { D: number; kwh: number; l: EstadoLienzo }) {
    const c = D / 2, n = 12, fuerza = Math.min(1, kwh / 6);
    return (
        <svg width={D} height={D} viewBox={`0 0 ${D} ${D}`} aria-hidden className="block">
            <g className={l.animar ? "ss-girar" : undefined} style={{ ["--ss-dur" as string]: "90s", transformOrigin: `${c}px ${c}px` }}>
                {Array.from({ length: n }, (_, i) => {
                    const a = (i / n) * Math.PI * 2, r0 = D * 0.3, r1 = D * (0.36 + 0.1 * fuerza);
                    return <line key={i} x1={c + Math.cos(a) * r0} y1={c + Math.sin(a) * r0} x2={c + Math.cos(a) * r1} y2={c + Math.sin(a) * r1} stroke={SOL} strokeOpacity={0.3 + 0.6 * fuerza} strokeWidth={1.6} strokeLinecap="round" />;
                })}
            </g>
            <circle cx={c} cy={c} r={D * 0.25} fill={conAlfa(SOL, 0.18 + 0.3 * fuerza)} stroke={SOL} strokeOpacity={0.6} />
            <text x={c} y={c + D * 0.05} textAnchor="middle" fill="#fff" style={{ fontSize: Math.max(11, D * 0.16), fontWeight: 400 }}>{kwhTexto(kwh)}</text>
        </svg>
    );
}

export function EnergyGridWidget() {
    const l = useLienzo("#38bdf8", "#FFBF00");
    const meteo = useMeteo(l.visible);
    const bateria = useBateria();
    const grande = l.base === "xl";
    const pc = useProcomun(l.visible && grande);
    const ubic = useWeatherLocationOpcional();
    const [localizando, setLocalizando] = React.useState(false);
    const [ahora, setAhora] = React.useState(() => Date.now());

    // El «ahora» avanza cada 5 min y solo a la vista (la curva no necesita más).
    React.useEffect(() => {
        if (!l.visible) return;
        setAhora(Date.now());
        const t = window.setInterval(() => setAhora(Date.now()), 5 * 60_000);
        return () => window.clearInterval(t);
    }, [l.visible]);

    const m = meteo.datos;
    const hoy = React.useMemo(() => (m ? diaSolar(m, 0) : null), [m]);
    const manana = React.useMemo(() => (m ? diaSolar(m, 1) : null), [m]);
    const zona = m?.zona ?? "";
    const cambio = hoy && manana ? cambioPct(hoy.kwh, manana.kwh) : null;
    // Pasada la puesta de sol (o sin sol hoy), lo útil es mañana: se enseña su curva y su franja.
    const verManana = !!manana && manana.puntos.length > 1 && (!hoy || hoy.puntos.length < 2 || (hoy.ocaso !== null ? ahora > hoy.ocaso : !!hoy.franja && ahora > hoy.franja.hasta));
    const foco = verManana ? manana : hoy;
    const cuando = verManana ? "mañana" : "hoy";
    const enFranja = !verManana && !!hoy?.franja && ahora >= hoy.franja.desde && ahora <= hoy.franja.hasta;
    const franjaTxt = foco?.franja ? `${horaLocal(foco.franja.desde, zona)}–${horaLocal(foco.franja.hasta, zona)}` : null;
    const pasada = !verManana && !!hoy?.franja && ahora > hoy.franja.hasta;
    const energiaComun = (pc.datos?.recursos ?? []).filter((r) => r.tipo === "Energía");
    const libresEnergia = energiaComun.filter((r) => r.estado === "Disponible").length;
    const lugar = meteo.lugar?.nombre || "tu lugar";

    const cargando = !!meteo.lugar && !m && !meteo.error;
    const sinLugar = !meteo.lugar;
    const sinDatos = !m && !!meteo.error;

    const consejoBateria = bateria && (
        bateria.cargando ? `${Math.round(bateria.nivel * 100)} % · cargando${enFranja ? " con el sol alto" : ""}`
            : `${Math.round(bateria.nivel * 100)} %${enFranja && bateria.nivel < 0.8 ? " · buen momento para cargar" : ""}`
    );

    const etiqueta = sinLugar ? "Energía del Sol: vacío, sin ubicación del clima"
        : cargando ? "Energía del Sol: cargando la radiación de hoy"
        : sinDatos ? "Energía del Sol: error, la fuente del tiempo no respondió"
        : foco ? `Energía del Sol en ${lugar}: ${cuando} ${kwhTexto(foco.kwh)} kWh por cada kWp de paneles (estimación)${franjaTxt ? `, franja de abundancia ${franjaTxt}${enFranja ? " (ahora)" : pasada ? " (ya pasó)" : ""}` : ""}${verManana && hoy ? `. Hoy fueron ${kwhTexto(hoy.kwh)} kWh` : manana ? `. Mañana ${kwhTexto(manana.kwh)} kWh` : ""}${bateria ? `. Batería de este dispositivo: ${consejoBateria}` : ""}`
        : "Energía del Sol: sin datos del día";

    const localizar = async () => {
        if (!ubic?.requestGeolocation) return;
        setLocalizando(true);
        try { await ubic.requestGeolocation(); } catch { /* permiso denegado: se queda el lugar actual */ } finally { setLocalizando(false); }
    };

    const estadoEspecial = (compacto: boolean) => {
        if (sinLugar) return <VacioHonesto icono={Sun} color={SOL} compacto={compacto} titulo="Sin ubicación" ayuda="Elige tu lugar en el clima para ver el sol de hoy." />;
        if (cargando) return <CargandoSilueta color={SOL} etiqueta="Cargando la radiación de hoy…" />;
        if (sinDatos) return <ErrorHonesto error={meteo.error} color={SOL} onReintentar={meteo.recargar} compacto={compacto} />;
        if (!foco) return <VacioHonesto icono={Sun} color={SOL} compacto={compacto} titulo="Sin datos del día" />;
        return null;
    };

    if (l.base === "micro") {
        return (
            <Lienzo l={l} titulo="Energía del Sol" etiqueta={etiqueta} sinCabecera>
                <div className="grid h-full place-items-center">{foco ? <Glifo D={l.lado - 8} kwh={foco.kwh} l={l} /> : <Sun className="size-7 text-white/40" aria-hidden />}</div>
            </Lienzo>
        );
    }

    const cifra = (tam: number) => foco && (
        <div className="min-w-0" title={`Estimación: radiación del día (${kwhTexto(foco.kwh / RENDIMIENTO)} kWh/m²) × rendimiento ${Math.round(RENDIMIENTO * 100)} %`}>
            <p className="font-light leading-none text-white tabular-nums" style={{ fontSize: tam }}>{kwhTexto(foco.kwh)}<span className="ml-1 text-[0.4em] text-white/60">kWh</span></p>
            <p className="mt-1 text-[11px] text-white/55">por cada kWp {cuando}</p>
        </div>
    );

    const franja = (conConsejo: boolean) => franjaTxt && (
        <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.12em] text-white/45">{enFranja ? "Abundancia ahora" : pasada ? "La abundancia fue" : verManana ? "Franja de mañana" : "Franja de abundancia"}</p>
            <p className="text-[14px] tabular-nums text-white/90" style={{ color: enFranja ? tinta(l.acento2, 0.25) : undefined }}>{franjaTxt}</p>
            {conConsejo && <p className="line-clamp-2 text-[11.5px] leading-snug text-white/55">{enFranja ? "Pon ahora lavadoras, cargas y lo que más gasta." : pasada ? "Para hoy ya pasó: mañana, otra." : "Guarda para entonces lo que más energía gasta."}</p>}
        </div>
    );

    const lineaManana = verManana ? (hoy && <p className="text-[11.5px] text-white/60">Hoy fueron <span className="tabular-nums text-white/85">{kwhTexto(hoy.kwh)} kWh</span>{cambio !== null && <span className="tabular-nums" style={{ color: cambio >= 0 ? "#10B981" : "#fca5a5" }}> (mañana {cambio > 0 ? "+" : ""}{cambio} %)</span>}</p>)
        : manana && (
            <p className="text-[11.5px] text-white/60">Mañana <span className="tabular-nums text-white/85">{kwhTexto(manana.kwh)} kWh</span>{cambio !== null && <span className="tabular-nums" style={{ color: cambio >= 0 ? "#10B981" : "#fca5a5" }}> ({cambio > 0 ? "+" : ""}{cambio} %)</span>}</p>
        );

    const lineaBateria = bateria && (
        <p className="flex items-center gap-1.5 text-[11.5px] text-white/60">
            {bateria.cargando ? <BatteryCharging className="size-3.5 shrink-0" aria-hidden /> : <BatteryMedium className="size-3.5 shrink-0" aria-hidden />}
            <span className="line-clamp-2">Este dispositivo: {consejoBateria}</span>
        </p>
    );

    if (l.base === "s") {
        return (
            <Lienzo l={l} titulo="Energía del Sol" etiqueta={etiqueta} sinCabecera>
                {estadoEspecial(true) ?? (
                    <div className="flex h-full flex-col justify-between gap-1">
                        {cifra(26)}
                        <Curva W={l.ancho - 24} H={Math.max(34, l.alto - 96)} dia={foco!} ahora={ahora} l={l} zona={zona} />
                        {franjaTxt && <p className="truncate text-[11px] text-white/60">{enFranja ? "Ahora: " : ""}{franjaTxt}</p>}
                    </div>
                )}
            </Lienzo>
        );
    }

    const ancho = l.ancho - 40;
    const hb = Math.max(80, l.alto - 64);
    const especial = estadoEspecial(false);
    const botonLugar = ubic?.requestGeolocation && (
        <Accion color={l.acento} alto={l.toque} icono={LocateFixed} soloIcono={!grande} disabled={localizando} onClick={() => void localizar()} etiqueta="Usar mi ubicación para el sol">{localizando ? "Buscando…" : "Mi ubicación"}</Accion>
    );

    if (especial) {
        return (
            <Lienzo l={l} titulo={l.ancho < 230 ? "Energía" : "Energía del Sol"} subtitulo={l.ancho >= 300 ? `Cuándo sobra energía en ${lugar}` : undefined} icono={Sun} etiqueta={etiqueta}>
                <div className="flex h-full flex-col justify-center gap-2">{especial}{sinLugar && botonLugar && <div className="flex justify-center">{botonLugar}</div>}</div>
            </Lienzo>
        );
    }

    if (l.horizontal) {
        return (
            <Lienzo l={l} titulo="Energía del Sol" subtitulo={`${verManana ? "Mañana" : "Hoy"} en ${lugar}`} icono={Sun} etiqueta={etiqueta}>
                <div className="flex h-full min-h-0 items-center gap-5">
                    <div className="min-w-0 flex-1"><Curva W={Math.max(200, l.ancho - 40 - Math.min(240, l.ancho * 0.34) - 20)} H={Math.max(70, hb - 10)} dia={foco!} ahora={ahora} l={l} zona={zona} rotulos /></div>
                    <div className="flex shrink-0 flex-col gap-2.5" style={{ width: Math.min(240, l.ancho * 0.34) }}>
                        {cifra(30)}
                        {franja(false)}
                        {lineaManana}
                    </div>
                </div>
            </Lienzo>
        );
    }

    if (l.torre) {
        return (
            <Lienzo l={l} titulo="Energía" subtitulo={lugar} icono={Sun} etiqueta={etiqueta}>
                <div className="flex h-full min-h-0 flex-col gap-3">
                    {cifra(30)}
                    <Curva W={ancho} H={Math.max(70, hb * 0.3)} dia={foco!} ahora={ahora} l={l} zona={zona} rotulos />
                    {franja(true)}
                    {lineaManana}
                    {lineaBateria}
                </div>
            </Lienzo>
        );
    }

    if (grande) {
        return (
            <Lienzo l={l} titulo="Energía del Sol" subtitulo={`Cuándo sobra energía en ${lugar}`} icono={Sun} etiqueta={etiqueta} acciones={botonLugar || undefined}>
                <div className="flex h-full min-h-0 flex-col gap-3">
                    <Curva W={ancho} H={Math.max(110, hb * 0.42)} dia={foco!} ahora={ahora} l={l} zona={zona} rotulos />
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-2">{cifra(38)}{lineaManana}</div>
                        {franja(true)}
                    </div>
                    <div className="flex flex-col gap-1.5">
                        {lineaBateria}
                        <p className="flex items-center gap-1.5 text-[11.5px] text-white/60">
                            <Zap className="size-3.5 shrink-0" aria-hidden />
                            <span className="min-w-0 flex-1 truncate">
                                {pc.datos ? (energiaComun.length ? `Procomún: ${energiaComun.length} recurso${energiaComun.length === 1 ? "" : "s"} de energía, ${libresEnergia} libre${libresEnergia === 1 ? "" : "s"}` : "Procomún: aún no hay recursos de energía") : pc.error ? "Procomún: sin conexión (error)" : "Procomún: cargando…"}
                            </span>
                            <Link href="/network/politics" className="shrink-0 cursor-pointer text-white/60 underline-offset-2 transition-colors duration-200 hover:text-white hover:underline">Ver</Link>
                        </p>
                        <p className="text-[11px] text-white/40">Estimación con la radiación real de Open-Meteo y un rendimiento del {Math.round(RENDIMIENTO * 100)} %.</p>
                    </div>
                </div>
            </Lienzo>
        );
    }

    // M y L
    return (
        <Lienzo l={l} titulo="Energía del Sol" subtitulo={l.ancho >= 300 ? `${verManana ? "Mañana" : "Hoy"} en ${lugar}` : undefined} icono={Sun} etiqueta={etiqueta} acciones={l.base === "l" ? botonLugar || undefined : undefined}>
            <div className="flex h-full min-h-0 flex-col gap-3">
                <Curva W={ancho} H={Math.max(64, hb * (l.base === "l" ? 0.38 : 0.36))} dia={foco!} ahora={ahora} l={l} zona={zona} rotulos={l.base === "l"} />
                <div className="flex min-h-0 items-start gap-4">
                    {cifra(l.base === "l" ? 32 : 28)}
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">{franja(l.base === "l")}{lineaManana}</div>
                </div>
                {l.base === "l" && lineaBateria}
            </div>
        </Lienzo>
    );
}
