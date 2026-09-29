'use client';
/**
 * El tiempo (WEATHER_BASIC, cuerpo clásico) — Ola 0929 · paquete A.
 *
 * Datos REALES de Open-Meteo para tu ubicación (la del clima del OS; si nunca la elegiste, se
 * dice «por defecto» y se ofrece cambiarla), cacheados y compartidos. El fondo es el cielo de
 * ahora: color por la altura real del Sol, nubes/lluvia/niebla/tormenta/nieve por el código
 * WMO, y de noche la Luna con su fase. Cada tamaño es un diseño:
 *   micro → icono + temperatura · s → ahora + sensación · m → + próximas horas
 *   l → curva de 24 h + días · xl → panel completo (viento, UV, aire, Sol y Luna, avisos)
 *   panorámico → ahora | horas | días · torre → línea del día hora a hora.
 * Acciones: cambiar ubicación, °C/°F y unidad del viento, actualizar y abrir /clima.
 */
import * as React from 'react';
import { fraseProximas, avisosClima, nivelAire, nivelUv, procedencia, textoCielo, type Aviso } from '@/modules/weather/datos/interpretar';
import { diaDeHoy, horaDeAyer, proximasHoras } from '@/modules/weather/datos/open-meteo';
import { CieloVivo, colorIcono, iconoCielo, type VarianteCielo } from '../_clima/cielo';
import {
    ArcoSolar, ArcoUV, BrujulaViento, FilaDias, FranjaHoras, GraficaHoras, grados, LineaDia, MedidorAire, RangoHoy, velocidad,
} from '../_clima/graficas';
import {
    CargandoClima, ErrorClima, LugarClima, MarcoClima, MenuClima, RotuloClima, SelloFuente, SinUbicacion, estilosClima as s, type InfoMarco,
} from '../_clima/piezas';
import { useDatosClima } from '../_clima/use-clima';

const RUTA = '/clima';

function ChipAviso({ aviso }: { aviso: Aviso }) {
    const color = aviso.severidad === 'peligro' ? '#f43f5e' : aviso.severidad === 'atencion' ? '#fbbf24' : '#7dd3fc';
    return (
        <span role="note" className="inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium" style={{ background: `${color}22`, boxShadow: `inset 0 0 0 1px ${color}66`, color: '#fff' }} title={aviso.texto}>
            <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: color }} />
            <span className="truncate">{aviso.texto}</span>
        </span>
    );
}

/** El cuerpo del tiempo con un estilo de cielo (lo comparten las variantes). */
export function CuerpoClima({ variante = 'clasico', etiqueta = 'El tiempo' }: { variante?: VarianteCielo; etiqueta?: string }) {
    return (
        <MarcoClima etiqueta={etiqueta} acento="#38bdf8" acento2="#fde047">
            {(info) => <Contenido info={info} variante={variante} />}
        </MarcoClima>
    );
}

function Contenido({ info, variante }: { info: InfoMarco; variante: VarianteCielo }) {
    const { base, clase, horizontal } = info;
    const conCapas = base === 'xl' || (variante === 'omni' && (base === 'l' || base === 'm'));
    const d = useDatosClima(info, { aire: conCapas });
    const { clima, u, fmt, astro, ubicacion } = d;
    const id = React.useId().replace(/:/g, '');

    if (d.estado === 'sin-ubicacion') return <SinUbicacion info={info} />;
    if (d.estado === 'cargando') return <CargandoClima base={base} />;
    if (d.estado === 'error' || !clima.datos) return <ErrorClima mensaje={clima.error ?? 'Open-Meteo no respondió'} onReintentar={clima.refrescar} />;

    const c = clima.datos;
    const a = c.actual;
    const ahora = d.ahora ?? a.t;
    const Icono = iconoCielo(a.codigo, a.esDia);
    const cielo = textoCielo(a.codigo, a.esDia);
    const hoy = diaDeHoy(c.dias, ahora);
    const prox = proximasHoras(c.horas, 24, ahora);
    const ayer = horaDeAyer(c.horas, ahora);
    const avisos = avisosClima(c, d.aire.datos, fmt.hora, ahora);
    const frase = fraseProximas(c.horas, fmt.hora, ahora);
    const lugar = ubicacion?.nombre ?? '';
    const elegida = !!ubicacion?.elegida;
    const resumen = `${lugar}: ${grados(a.temp, u)}, ${cielo.toLowerCase()}. Sensación ${grados(a.sensacion, u)}.${hoy ? ` Máxima ${grados(hoy.max, u)}, mínima ${grados(hoy.min, u)}.` : ''}`;
    const diferencia = ayer?.temp != null && a.temp !== null ? Math.round(a.temp - ayer.temp) : null;
    const menu = <MenuClima info={info} ruta={RUTA} rutaEtiqueta="Abrir el tiempo" alActualizar={clima.refrescar} />;
    const sello = <SelloFuente fuente="Open-Meteo" en={clima.en} />;
    const fondo = (
        <>
            <CieloVivo codigo={a.codigo} alturaSol={astro.altura} fase={astro.fase} nubes={a.nubes} variante={variante}
                densidad={base === 'micro' || base === 's' ? 'baja' : 'normal'} xAstro={horizontal ? 88 : 76} />
            {(base === 'l' || base === 'xl' || clase === 'torre') && <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0a0d22]/45 to-[#0a0d22]/85" />}
        </>
    );

    // ── micro: el icono y la cifra ──
    if (base === 'micro') {
        return (
            <div className="relative h-full w-full" role="img" aria-label={resumen}>
                {fondo}
                <div className={`${s.sombraTexto} relative flex h-full flex-col items-center justify-center gap-0.5`}>
                    <Icono aria-hidden className="size-6" style={{ color: colorIcono(a.codigo, a.esDia) }} />
                    <span className={`${s.cifra} text-[26px] font-light leading-none`}>{grados(a.temp, u)}</span>
                </div>
            </div>
        );
    }

    // ── s: ahora y sensación ──
    if (base === 's') {
        return (
            <div className="relative h-full w-full">
                {fondo}
                <div className={`${s.sombraTexto} relative flex h-full flex-col justify-between p-3`} aria-label={resumen}>
                    <div className="flex items-start justify-between gap-1">
                        <span className={`${s.cifra} text-[40px] font-extralight leading-[0.9]`}>{grados(a.temp, u)}</span>
                        {menu}
                    </div>
                    <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium" title={cielo}>{cielo}</p>
                        <p className="truncate text-[11px] text-white/70">Sensación {grados(a.sensacion, u)}</p>
                        <LugarClima nombre={lugar} elegida={elegida} className="mt-0.5 text-[11px]" />
                    </div>
                </div>
            </div>
        );
    }

    const bloqueAhora = (tam: 'm' | 'l') => (
        <div className="min-w-0">
            <div className="flex items-end gap-2">
                <span className={`${s.cifra} font-extralight leading-[0.85] ${tam === 'l' ? 'text-[64px]' : 'text-[52px]'}`}>{grados(a.temp, u)}</span>
                <div className="mb-1 min-w-0">
                    <p className="flex items-center gap-1.5 truncate text-[14px] font-medium" title={cielo}>
                        <Icono aria-hidden className="size-4 shrink-0" style={{ color: colorIcono(a.codigo, a.esDia) }} />
                        <span className="truncate">{cielo}</span>
                    </p>
                    <p className="truncate text-[12px] text-white/70">
                        Sensación {grados(a.sensacion, u)}
                        {diferencia !== null && diferencia !== 0 && tam === 'l' && <span className="text-white/55"> · {diferencia > 0 ? `${diferencia}° más` : `${-diferencia}° menos`} que ayer</span>}
                    </p>
                </div>
            </div>
            {hoy && <div className="mt-2 max-w-[18rem]"><RangoHoy min={hoy.min} max={hoy.max} ahora={a.temp} u={u} /></div>}
        </div>
    );

    // ── torre: la línea del día ──
    if (clase === 'torre') {
        const nHoras = Math.max(6, Math.min(14, Math.floor(((info.alto || 520) - 190) / 26)));
        return (
            <div className="relative h-full w-full">
                {fondo}
                <div className={`${s.sombraTexto} relative flex h-full flex-col gap-3 p-3.5`}>
                    <div className="flex items-center justify-between gap-2"><LugarClima nombre={lugar} elegida={elegida} />{menu}</div>
                    {bloqueAhora('m')}
                    {avisos[0] && <ChipAviso aviso={avisos[0]} />}
                    <div className="min-h-0 flex-1 overflow-hidden">
                        <LineaDia horas={prox.slice(0, nHoras)} hora={fmt.hora} u={u} orto={hoy?.orto ?? null} ocaso={hoy?.ocaso ?? null} />
                    </div>
                    {sello}
                </div>
            </div>
        );
    }

    // ── panorámico: ahora | horas | días ──
    if (clase === 'panoramico') {
        const conDias = info.ancho === 0 || info.ancho > 640;
        const nHoras = info.ancho > 0 ? Math.max(4, Math.min(12, Math.floor((info.ancho - (conDias ? 470 : 230)) / 52))) : 8;
        return (
            <div className="relative h-full w-full">
                {fondo}
                <div className={`${s.sombraTexto} relative grid h-full items-center gap-4 px-4 py-2`} style={{ gridTemplateColumns: conDias ? 'minmax(10rem,auto) minmax(0,1fr) 14rem' : 'minmax(10rem,auto) minmax(0,1fr)' }}>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2"><LugarClima nombre={lugar} elegida={elegida} />{menu}</div>
                        <div className="mt-1 flex items-end gap-2">
                            <span className={`${s.cifra} text-[44px] font-extralight leading-[0.85]`}>{grados(a.temp, u)}</span>
                            <span className="mb-0.5 min-w-0"><span className="block truncate text-[13px]">{cielo}</span><span className="block truncate text-[11px] text-white/65">Sensación {grados(a.sensacion, u)}</span></span>
                        </div>
                    </div>
                    <FranjaHoras horas={prox.slice(0, nHoras)} hora={fmt.hora} u={u} />
                    {conDias && <FilaDias dias={c.dias.slice(0, 3)} dia={fmt.dia} u={u} ahoraTemp={a.temp} compacta />}
                </div>
            </div>
        );
    }

    // ── m: ahora + próximas horas (omni: + capas) ──
    if (base === 'm') {
        return (
            <div className="relative h-full w-full">
                {fondo}
                <div className={`${s.sombraTexto} relative flex h-full flex-col justify-between gap-2 p-3.5`} aria-label={resumen}>
                    <div className="flex items-center justify-between gap-2"><LugarClima nombre={lugar} elegida={elegida} />{menu}</div>
                    {bloqueAhora('m')}
                    {avisos[0] ? <ChipAviso aviso={avisos[0]} /> : frase ? <p className="truncate text-[12px] text-white/75" title={frase}>{frase}</p> : null}
                    {variante === 'omni' ? <CapasMini d={d} /> : <FranjaHoras horas={prox.slice(0, 5)} hora={fmt.hora} u={u} compacta />}
                </div>
            </div>
        );
    }

    // ── l: curva de 24 h + días ──
    if (base === 'l') {
        const nDias = info.alto > 0 ? Math.max(2, Math.min(5, Math.floor((info.alto - 262) / 26))) : 3;
        return (
            <div className="relative h-full w-full">
                {fondo}
                <div className={`${s.sombraTexto} relative flex h-full flex-col gap-2.5 p-4`}>
                    <div className="flex items-center justify-between gap-2"><LugarClima nombre={lugar} elegida={elegida} />{menu}</div>
                    <div className="flex items-start justify-between gap-3">
                        {bloqueAhora('l')}
                        <div className="flex min-w-0 max-w-[11rem] flex-col items-end gap-1 text-right">
                            {avisos.slice(0, 2).map((av) => <ChipAviso key={av.id} aviso={av} />)}
                            {!avisos.length && frase && <p className="text-[12px] text-white/75">{frase}</p>}
                        </div>
                    </div>
                    {variante === 'omni' ? <CapasMini d={d} /> : <GraficaHoras horas={prox} hora={fmt.hora} u={u} id={id} alto={78} />}
                    <div className="min-h-0 flex-1 overflow-hidden"><FilaDias dias={c.dias.slice(0, nDias)} dia={fmt.dia} u={u} ahoraTemp={a.temp} compacta /></div>
                    {sello}
                </div>
            </div>
        );
    }

    // ── xl: el panel completo ──
    const na = nivelAire(d.aire.datos);
    const uv = nivelUv(a.uv);
    return (
        <div className="relative h-full w-full">
            {fondo}
            <div className={`${s.sombraTexto} relative grid h-full gap-4 p-5`} style={{ gridTemplateColumns: 'minmax(0,1.35fr) minmax(0,1fr)', gridTemplateRows: 'auto minmax(0,1fr)' }}>
                <div className="col-span-2 flex items-center justify-between gap-3">
                    <LugarClima nombre={lugar} elegida={elegida} className="text-[13px]" />
                    <div className="flex min-w-0 items-center gap-2">
                        <div className="flex min-w-0 gap-1.5 overflow-hidden">{avisos.slice(0, 2).map((av) => <ChipAviso key={av.id} aviso={av} />)}</div>
                        {menu}
                    </div>
                </div>
                <div className="flex min-h-0 flex-col gap-3">
                    {bloqueAhora('l')}
                    {frase && <p className="text-[12px] text-white/75">{frase}</p>}
                    <GraficaHoras horas={prox} hora={fmt.hora} u={u} id={id} alto={96} mostrarSensacion />
                    <div className="min-h-0 flex-1 overflow-hidden"><FilaDias dias={c.dias.slice(0, 7)} dia={fmt.dia} u={u} ahoraTemp={a.temp} compacta /></div>
                    {sello}
                </div>
                <div className="grid min-h-0 grid-cols-2 gap-3" style={{ gridTemplateRows: 'minmax(0,1fr) minmax(0,1fr)' }}>
                    <Capa titulo="Viento" detalle={a.dirViento !== null ? procedencia(a.dirViento) : undefined}>
                        <BrujulaViento dir={a.dirViento} kmh={a.viento} rachas={a.rachas} u={u} lado={96} />
                        {a.rachas !== null && <span className={`${s.cifra} text-[11px] text-white/65`}>Rachas {velocidad(a.rachas, u)}</span>}
                    </Capa>
                    <Capa titulo="UV" detalle={uv?.texto}>
                        <ArcoUV uv={a.uv} lado={110} />
                        {uv && <span className="line-clamp-2 text-center text-[10px] text-white/60" title={uv.consejo}>{uv.consejo}</span>}
                    </Capa>
                    <Capa titulo="Aire" detalle={na ? (na.escala === 'europeo' ? 'Índice europeo' : 'Índice EE. UU.') : undefined}>
                        {d.aire.datos ? <MedidorAire nivel={na} lado={92} /> : <span className="text-[11px] text-white/55">{d.aire.error ? 'sin dato del aire' : 'leyendo…'}</span>}
                    </Capa>
                    <Capa titulo={hoy?.orto ? 'Sol y Luna' : 'Luna'} detalle={astro.fase ? `${astro.fase.nombre} · ${Math.round(astro.fase.iluminada * 100)} %` : undefined}>
                        <ArcoSolar orto={hoy?.orto ?? astro.orto} ocaso={hoy?.ocaso ?? astro.ocaso} ahora={ahora} fase={astro.fase} hora={fmt.hora} id={`${id}s`} alto={78} />
                    </Capa>
                </div>
            </div>
        </div>
    );
}

function Capa({ titulo, detalle, children }: { titulo: string; detalle?: string; children: React.ReactNode }) {
    return (
        <section className="flex min-h-0 min-w-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl bg-white/[0.04] p-2 ring-1 ring-white/[0.06]" aria-label={detalle ? `${titulo}: ${detalle}` : titulo}>
            <div className="flex w-full items-baseline justify-between gap-1">
                <RotuloClima>{titulo}</RotuloClima>
                {detalle && <span className="truncate text-[10px] text-white/55" title={detalle}>{detalle}</span>}
            </div>
            {children}
        </section>
    );
}

/** Capas compactas del estilo «omni» en m/l: viento, humedad, UV y aire en una fila. */
function CapasMini({ d }: { d: ReturnType<typeof useDatosClima> }) {
    const a = d.clima.datos?.actual;
    if (!a) return null;
    const na = nivelAire(d.aire.datos);
    const uv = nivelUv(a.uv);
    const celdas = [
        { t: 'Viento', v: velocidad(a.viento, d.u, false), n: `${procedencia(a.dirViento)}` },
        { t: 'Humedad', v: a.humedad === null ? '—' : `${Math.round(a.humedad)}%`, n: a.rocio === null ? '' : `rocío ${grados(a.rocio, d.u)}` },
        { t: 'UV', v: a.uv === null ? '—' : String(Math.round(a.uv)), n: uv?.texto ?? '' },
        { t: 'Aire', v: na ? String(na.indice) : '—', n: na?.texto ?? (d.aire.error ? 'sin dato' : '…') },
    ];
    return (
        <div className="grid grid-cols-4 gap-1.5" aria-label="Capas del tiempo">
            {celdas.map((c) => (
                <div key={c.t} className="min-w-0 rounded-xl bg-white/[0.06] px-1.5 py-1 text-center" title={`${c.t}: ${c.v} ${c.n}`}>
                    <RotuloClima className="text-[9px]">{c.t}</RotuloClima>
                    <span className={`${s.cifra} block text-[15px] font-semibold leading-tight`}>{c.v}</span>
                    <span className="block truncate text-[9px] text-white/55">{c.n}</span>
                </div>
            ))}
        </div>
    );
}

export function WeatherBasicWidget({ widgetId = 'weather-basic' }: { widgetId?: string } = {}) {
    void widgetId;
    return <CuerpoClima variante="clasico" etiqueta="El tiempo" />;
}

export default WeatherBasicWidget;
