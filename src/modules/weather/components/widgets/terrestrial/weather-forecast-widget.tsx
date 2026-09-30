'use client';
/**
 * Pronóstico — Ola 0929 · paquete A.
 *
 * Datos REALES de Open-Meteo (7 días y 48 h por horas), compartidos y cacheados con el resto del
 * clima: ninguna cifra de relleno; si un día no trae un dato, se ve «—».
 * Lo que se abre cinco veces al día: ¿llueve esta semana y cuándo? Por eso arriba va la semana en
 * una frase («Lluvia el miércoles y el jueves · mejor día: el sábado») y cada día se puede tocar
 * para ver su detalle (cielo, lluvia en mm, viento y su dirección, UV, Sol y horas de luz) y sus
 * horas en temperatura, lluvia o viento.
 *   micro → hoy · s → hoy y mañana · m → frase + días · l → días | horas con modo
 *   xl → días + detalle del día elegido con sus horas · panorámico → la semana en columnas
 *   torre → la semana entera con frase y las próximas horas.
 */
import * as React from 'react';
import { CalendarDays, CloudRain, Sunrise, Thermometer, Wind } from 'lucide-react';
import { fraseSemana, horasDelDia, textoLuz } from '@/modules/weather/datos/barometro';
import { colorTemperatura, nivelUv, procedencia, textoCielo } from '@/modules/weather/datos/interpretar';
import type { DiaClima, HoraClima } from '@/modules/weather/datos/open-meteo';
import { colorIcono, iconoCielo } from '../_clima/cielo';
import { BarrasHoras, FranjaHoras, GraficaHoras, grados, velocidad } from '../_clima/graficas';
import { Datos, WidgetMagnitud, type CtxMagnitud } from '../_clima/magnitud';
import { MicroDato, RotuloClima, estilosClima as s, type InfoMarco } from '../_clima/piezas';

const COLOR = '#fde047';
type Modo = 'temp' | 'lluvia' | 'viento';
const MODOS: { id: Modo; etiqueta: string; icono: typeof Thermometer }[] = [
    { id: 'temp', etiqueta: 'Temperatura', icono: Thermometer },
    { id: 'lluvia', etiqueta: 'Lluvia', icono: CloudRain },
    { id: 'viento', etiqueta: 'Viento', icono: Wind },
];

const r0 = (v: number) => Math.round(v);
const pct = (v: number | null) => (v === null ? '—' : `${r0(v)} %`);

// ── Lista de días seleccionable ───────────────────────────────────────

function ListaDias({ dias, dia, u, ahoraTemp, elegido, alElegir, info, compacta }: {
    dias: DiaClima[]; dia: (t: number) => string; u: CtxMagnitud['d']['u']; ahoraTemp: number | null; elegido: number | null;
    alElegir?: (i: number) => void; info: InfoMarco; compacta?: boolean;
}) {
    const mins = dias.map((d) => d.min).filter((v): v is number => v !== null);
    const maxs = dias.map((d) => d.max).filter((v): v is number => v !== null);
    if (!mins.length || !maxs.length) return <p className="text-[12px] text-white/60">Open-Meteo no trajo máximas y mínimas.</p>;
    const lo = Math.min(...mins), hi = Math.max(...maxs), rango = Math.max(1, hi - lo);
    return (
        <ul className="flex w-full flex-col gap-0.5" aria-label="Próximos días">
            {dias.map((d, i) => {
                const Icono = iconoCielo(d.codigo, true);
                const a = d.min === null ? 0 : ((d.min - lo) / rango) * 100, b = d.max === null ? 100 : ((d.max - lo) / rango) * 100;
                const nombre = i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : dia(d.t);
                const lluvia = (d.probLluvia ?? 0) >= 20 ? `${r0(d.probLluvia as number)}%` : '';
                const texto = `${nombre}: ${textoCielo(d.codigo)}, de ${grados(d.min, u)} a ${grados(d.max, u)}${lluvia ? `, lluvia ${lluvia}` : ''}`;
                const contenido = (
                    <>
                        <span className="truncate text-left text-[12px] capitalize text-white/85">{nombre}</span>
                        <Icono aria-hidden className="size-4" style={{ color: colorIcono(d.codigo) }} />
                        <span className={`${s.cifra} text-[10px] text-sky-300/90`}>{lluvia}</span>
                        <span className={`${s.cifra} text-right text-[12px] text-white/55`}>{grados(d.min, u)}</span>
                        <span className="relative h-1.5 rounded-full bg-white/10" aria-hidden>
                            <span className="absolute inset-y-0 rounded-full" style={{ left: `${a}%`, right: `${100 - b}%`, background: `linear-gradient(90deg, ${colorTemperatura(d.min)}, ${colorTemperatura(d.max)})` }} />
                            {i === 0 && ahoraTemp !== null && <span className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#0c0f24] bg-white" style={{ left: `${Math.min(100, Math.max(0, ((ahoraTemp - lo) / rango) * 100))}%` }} />}
                        </span>
                        <span className={`${s.cifra} text-[12px] font-semibold`}>{grados(d.max, u)}</span>
                    </>
                );
                const rejilla = { gridTemplateColumns: '3.6rem 1.2rem 2.1rem 2.1rem minmax(2rem,1fr) 2.1rem' };
                if (!alElegir) {
                    return <li key={d.t} className={`grid items-center gap-2 ${compacta ? 'py-0.5' : 'py-1'}`} style={rejilla} aria-label={texto}>{contenido}</li>;
                }
                const activo = elegido === i;
                return (
                    <li key={d.t}>
                        <button type="button" onClick={() => alElegir(i)} aria-pressed={activo} aria-label={texto}
                            className={`${s.foco} grid w-full cursor-pointer items-center gap-2 rounded-xl px-2 transition-colors duration-150 ${info.tactil ? 'min-h-11' : compacta ? 'min-h-7' : 'min-h-8'} ${activo ? 'bg-white/[0.12] ring-1 ring-white/20' : 'hover:bg-white/[0.06]'}`}
                            style={rejilla}>
                            {contenido}
                        </button>
                    </li>
                );
            })}
        </ul>
    );
}

// ── Modos de horas ────────────────────────────────────────────────────

function SelectorModo({ modo, alCambiar, info }: { modo: Modo; alCambiar: (m: Modo) => void; info: InfoMarco }) {
    return (
        <div role="tablist" aria-label="Qué mirar por horas" className="grid grid-cols-3 gap-1 rounded-2xl bg-white/[0.05] p-1">
            {MODOS.map((m) => (
                <button key={m.id} type="button" role="tab" aria-selected={modo === m.id} onClick={() => alCambiar(m.id)}
                    className={`${s.foco} ss-redondo flex min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-2 text-[12px] font-semibold transition-colors duration-150 ${info.tactil ? 'min-h-11' : 'min-h-8'} ${modo === m.id ? 'bg-white/15 text-white' : 'text-white/60 hover:text-white'}`}>
                    <m.icono aria-hidden className="size-3.5 shrink-0" />
                    <span className="truncate">{m.etiqueta}</span>
                </button>
            ))}
        </div>
    );
}

function Horas({ horas, modo, d, id, alto }: { horas: HoraClima[]; modo: Modo; d: CtxMagnitud['d']; id: string; alto: number }) {
    if (horas.length < 2) return <p className="text-[12px] text-white/60">Por horas solo hay pronóstico de las próximas 48 h.</p>;
    if (modo === 'temp') return <GraficaHoras horas={horas} hora={d.fmt.hora} u={d.u} id={id} alto={alto} mostrarSensacion />;
    if (modo === 'lluvia') {
        return <BarrasHoras horas={horas} valor={(h) => h.probLluvia} color={(v) => (v >= 60 ? '#38bdf8' : v >= 30 ? '#7dd3fc' : '#7dd3fc88')} hora={d.fmt.hora}
            formato={(v) => `${r0(v)} %`} maximo={100} etiqueta={`Probabilidad de lluvia por horas, de ${d.fmt.hora(horas[0].t)} a ${d.fmt.hora(horas[horas.length - 1].t)}`} />;
    }
    return <BarrasHoras horas={horas} valor={(h) => h.viento} color={(v) => (v >= 50 ? '#fb923c' : v >= 30 ? '#fbbf24' : '#5eead4')} hora={d.fmt.hora}
        formato={(v) => velocidad(v, d.u)} etiqueta={`Viento por horas, de ${d.fmt.hora(horas[0].t)} a ${d.fmt.hora(horas[horas.length - 1].t)}`} />;
}

// ── Detalle de un día ─────────────────────────────────────────────────

function DetalleDia({ dia, i, d, tv }: { dia: DiaClima; i: number; d: CtxMagnitud['d']; tv: boolean }) {
    const Icono = iconoCielo(dia.codigo, true);
    const uv = nivelUv(dia.uvMax);
    const nombre = i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : d.fmt.diaLargo(dia.t + 12 * 3_600_000);
    const sol = dia.orto && dia.ocaso ? `sol de ${d.fmt.hora(dia.orto)} a ${d.fmt.hora(dia.ocaso)} · ${textoLuz(dia.luzSeg)} de luz` : null;
    return (
        <section className="flex flex-col gap-2.5" aria-label={`Detalle de ${nombre}`}>
            <div className="flex items-center gap-3">
                <Icono aria-hidden className="size-10 shrink-0" style={{ color: colorIcono(dia.codigo) }} />
                <div className="min-w-0">
                    <p className={`truncate font-semibold capitalize ${tv ? 'text-[18px]' : 'text-[15px]'}`}>{nombre}</p>
                    <p className="truncate text-[12px] text-white/70">{textoCielo(dia.codigo)}</p>
                    {sol && <p className="flex min-w-0 items-center gap-1 text-[11px] text-white/55" title={sol}><Sunrise aria-hidden className="size-3.5 shrink-0 text-amber-300" /><span className="truncate">{sol}</span></p>}
                </div>
                <p className={`${s.cifra} ml-auto shrink-0 text-[22px] font-light`}>
                    <span style={{ color: colorTemperatura(dia.max) }}>{grados(dia.max, d.u)}</span>
                    <span className="text-white/45"> / </span>
                    <span className="text-white/70">{grados(dia.min, d.u)}</span>
                </p>
            </div>
            <Datos columnas={2} filas={[
                { t: 'Lluvia', v: pct(dia.probLluvia), n: dia.lluviaMm === null ? undefined : `${dia.lluviaMm.toFixed(1).replace('.', ',')} mm` },
                { t: 'Viento máx.', v: velocidad(dia.vientoMax, d.u), n: dia.dirDominante === null ? undefined : procedencia(dia.dirDominante) },
                { t: 'Rachas', v: velocidad(dia.rachasMax, d.u) },
                { t: 'UV máx.', v: dia.uvMax === null ? '—' : String(r0(dia.uvMax)), n: uv?.texto, color: uv?.color },
            ]} />
        </section>
    );
}

// ── Composición por tamaño ────────────────────────────────────────────

function Cuerpo({ info, a, c, d, ahora, prox, id, cabecera, sello }: CtxMagnitud) {
    const { base, clase } = info;
    const tv = info.dispositivo === 'tv';
    const [elegido, setElegido] = React.useState(0);
    const [modo, setModo] = React.useState<Modo>('temp');
    const [vista, setVista] = React.useState<'dias' | 'horas'>('dias');
    const dias = c.dias;
    const frase = fraseSemana(dias, d.fmt.dia);
    const fraseEl = (lineas: number) => frase && (
        <p className={`${tv ? 'text-[15px]' : 'text-[12px]'} leading-snug text-white/80`} style={{ display: '-webkit-box', WebkitLineClamp: lineas, WebkitBoxOrient: 'vertical', overflow: 'hidden' }} title={frase}>{frase}</p>
    );
    if (!dias.length) {
        return (
            <div role="status" className="flex h-full flex-col items-center justify-center gap-1 px-3 text-center">
                <CalendarDays aria-hidden className="size-5 text-white/60" />
                <p className="text-[12px] text-white/75">Open-Meteo respondió sin días de pronóstico.</p>
            </div>
        );
    }
    const hoy = dias[0], manana = dias[1] ?? null;
    const sel = dias[Math.min(elegido, dias.length - 1)];
    const horasSel = horasDelDia(c.horas, sel, dias[Math.min(elegido, dias.length - 1) + 1]).filter((h) => h.t >= ahora - 3_600_000);

    if (base === 'micro') {
        const Icono = iconoCielo(hoy.codigo, true);
        return (
            <MicroDato info={info} etiqueta={`Hoy: ${textoCielo(hoy.codigo)}, de ${grados(hoy.min, d.u)} a ${grados(hoy.max, d.u)}`}
                glifo={<Icono style={{ color: colorIcono(hoy.codigo) }} />} cifra={grados(hoy.max, d.u)} unidad={grados(hoy.min, d.u)} peso="semibold" maximo={20} />
        );
    }
    if (base === 's') {
        const fila = (dd: DiaClima, nombre: string) => {
            const Icono = iconoCielo(dd.codigo, true);
            return (
                <div className="flex min-w-0 items-center gap-2" aria-label={`${nombre}: ${textoCielo(dd.codigo)}, de ${grados(dd.min, d.u)} a ${grados(dd.max, d.u)}, lluvia ${pct(dd.probLluvia)}`}>
                    <Icono aria-hidden className="size-7 shrink-0" style={{ color: colorIcono(dd.codigo) }} />
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-semibold">{nombre}</p>
                        <p className="truncate text-[10px] text-sky-300/90">{(dd.probLluvia ?? 0) >= 20 ? `Lluvia ${pct(dd.probLluvia)}` : textoCielo(dd.codigo)}</p>
                    </div>
                    <span className={`${s.cifra} shrink-0 text-[15px] font-semibold`}>{grados(dd.max, d.u)}<span className="text-[12px] font-normal text-white/50"> {grados(dd.min, d.u)}</span></span>
                </div>
            );
        };
        return (
            <div className="flex h-full flex-col justify-center gap-2.5 p-3">
                <RotuloClima>Pronóstico</RotuloClima>
                {fila(hoy, 'Hoy')}
                {manana && fila(manana, 'Mañana')}
            </div>
        );
    }
    if (clase === 'panoramico') {
        const mins = dias.map((x) => x.min).filter((v): v is number => v !== null), maxs = dias.map((x) => x.max).filter((v): v is number => v !== null);
        const lo = mins.length ? Math.min(...mins) : 0, hi = maxs.length ? Math.max(...maxs) : 1, rango = Math.max(1, hi - lo);
        const n = info.ancho > 0 ? Math.max(4, Math.min(dias.length, Math.floor((info.ancho - 240) / 64))) : 7;
        return (
            <div className="grid h-full items-center gap-4 px-4 py-2" style={{ gridTemplateColumns: 'minmax(10rem,14rem) minmax(0,1fr)' }}>
                <div className="min-w-0 space-y-1.5">{cabecera('Pronóstico')}{fraseEl(3)}</div>
                <ol className="grid h-full min-h-0 py-1" style={{ gridTemplateColumns: `repeat(${n}, minmax(0,1fr))` }} aria-label="La semana">
                    {dias.slice(0, n).map((dd, i) => {
                        const Icono = iconoCielo(dd.codigo, true);
                        const top = dd.max === null ? 0 : ((hi - dd.max) / rango) * 100, bottom = dd.min === null ? 0 : ((dd.min - lo) / rango) * 100;
                        return (
                            <li key={dd.t} className="flex min-h-0 min-w-0 flex-col items-center gap-1" aria-label={`${i === 0 ? 'Hoy' : d.fmt.dia(dd.t)}: de ${grados(dd.min, d.u)} a ${grados(dd.max, d.u)}, lluvia ${pct(dd.probLluvia)}`}>
                                <span className="text-[11px] capitalize text-white/70">{i === 0 ? 'Hoy' : d.fmt.dia(dd.t)}</span>
                                <Icono aria-hidden className="size-4" style={{ color: colorIcono(dd.codigo) }} />
                                <span className={`${s.cifra} text-[12px] font-semibold`}>{grados(dd.max, d.u)}</span>
                                <span className="relative min-h-[18px] w-1.5 flex-1 rounded-full bg-white/10" aria-hidden>
                                    <span className="absolute inset-x-0 rounded-full" style={{ top: `${top}%`, bottom: `${bottom}%`, background: `linear-gradient(180deg, ${colorTemperatura(dd.max)}, ${colorTemperatura(dd.min)})` }} />
                                </span>
                                <span className={`${s.cifra} text-[11px] text-white/55`}>{grados(dd.min, d.u)}</span>
                                <span className={`${s.cifra} h-3 text-[10px] text-sky-300/90`}>{(dd.probLluvia ?? 0) >= 20 ? `${r0(dd.probLluvia as number)}%` : ''}</span>
                            </li>
                        );
                    })}
                </ol>
            </div>
        );
    }
    if (clase === 'torre') {
        return (
            <div className="flex h-full flex-col gap-3 p-3.5">
                {cabecera('Pronóstico')}
                {fraseEl(4)}
                <ListaDias dias={dias} dia={d.fmt.dia} u={d.u} ahoraTemp={a.temp} elegido={null} info={info} />
                <div className="mt-auto space-y-2">
                    <RotuloClima>Próximas horas</RotuloClima>
                    <FranjaHoras horas={prox.slice(0, Math.max(4, Math.min(6, Math.floor((info.ancho || 200) / 44))))} hora={d.fmt.hora} u={d.u} compacta />
                </div>
                {sello}
            </div>
        );
    }
    if (base === 'm') {
        const n = info.alto > 0 ? Math.max(2, Math.min(dias.length, Math.floor((info.alto - 110) / 26))) : 4;
        return (
            <div className="flex h-full flex-col gap-2 p-3.5">
                {cabecera('Pronóstico')}
                {fraseEl(2)}
                <div className="min-h-0 flex-1 overflow-hidden"><ListaDias dias={dias.slice(0, n)} dia={d.fmt.dia} u={d.u} ahoraTemp={a.temp} elegido={null} info={info} compacta /></div>
            </div>
        );
    }
    if (base === 'l') {
        return (
            <div className="flex h-full flex-col gap-2.5 p-4">
                {cabecera('Pronóstico')}
                {(vista === 'dias' || info.alto === 0 || info.alto >= 360) && fraseEl(2)}
                <div role="tablist" aria-label="Vista del pronóstico" className="grid grid-cols-2 gap-1 rounded-2xl bg-white/[0.05] p-1">
                    {(['dias', 'horas'] as const).map((v) => (
                        <button key={v} type="button" role="tab" aria-selected={vista === v} onClick={() => setVista(v)}
                            className={`${s.foco} ss-redondo cursor-pointer rounded-xl px-2 text-[12px] font-semibold transition-colors duration-150 ${info.tactil ? 'min-h-11' : 'min-h-8'} ${vista === v ? 'bg-white/15 text-white' : 'text-white/60 hover:text-white'}`}>
                            {v === 'dias' ? '7 días' : '48 horas'}
                        </button>
                    ))}
                </div>
                <div role="tabpanel" className="min-h-0 flex-1 overflow-hidden">
                    {vista === 'dias' ? (
                        <ListaDias dias={info.alto > 0 ? dias.slice(0, Math.max(2, Math.floor((info.alto - 190) / (info.tactil ? 46 : 30)))) : dias} dia={d.fmt.dia} u={d.u} ahoraTemp={a.temp} elegido={null} info={info} compacta />
                    ) : (
                        <div className="flex flex-col gap-3">
                            <SelectorModo modo={modo} alCambiar={setModo} info={info} />
                            <Horas horas={prox} modo={modo} d={d} id={id} alto={Math.max(60, Math.min(130, (info.alto || 400) - 200))} />
                        </div>
                    )}
                </div>
                {sello}
            </div>
        );
    }
    return (
        <div className="grid h-full gap-5 p-5" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.1fr)', gridTemplateRows: 'auto minmax(0,1fr) auto' }}>
            <div className="col-span-2">{cabecera('Pronóstico')}</div>
            <div className="flex min-h-0 flex-col gap-2.5">
                {fraseEl(2)}
                <div className="min-h-0 flex-1 overflow-hidden"><ListaDias dias={dias} dia={d.fmt.dia} u={d.u} ahoraTemp={a.temp} elegido={elegido} alElegir={setElegido} info={info} /></div>
            </div>
            <div className="flex min-h-0 flex-col gap-3 rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/[0.06]">
                <DetalleDia dia={sel} i={elegido} d={d} tv={tv} />
                <SelectorModo modo={modo} alCambiar={setModo} info={info} />
                <div className="min-h-0 flex-1 overflow-hidden"><Horas horas={horasSel} modo={modo} d={d} id={`${id}x`} alto={Math.max(64, Math.min(140, (info.alto || 520) - 350))} /></div>
            </div>
            <div className="col-span-2">{sello}</div>
        </div>
    );
}

export function WeatherForecastWidget() {
    return <WidgetMagnitud etiqueta="Pronóstico" acento={COLOR} acento2="#38bdf8" icono={CalendarDays} render={Cuerpo} />;
}

export default WeatherForecastWidget;
