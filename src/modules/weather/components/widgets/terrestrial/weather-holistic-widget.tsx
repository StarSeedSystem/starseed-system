'use client';
/**
 * Esfera del tiempo (WEATHER_HOLISTIC) — Ola 0929 · paquete A.
 *
 * Todo el tiempo de tu sitio en un solo objeto: un planeta con el color del cielo de ahora y,
 * a su alrededor, un anillo por capa, de dentro afuera — temperatura, humedad, viento (con su
 * rumbo), UV, aire — y un halo exterior con el campo magnético de la Tierra (Kp de NOAA): el
 * clima de abajo y el de arriba juntos. Cada anillo se llena con el dato REAL; si una capa no
 * tiene dato, su anillo queda vacío y la leyenda lo dice. Pasar por la leyenda resalta su anillo.
 * Sustituye a la escena 3D anterior: SVG ligero, sin WebGL, que se congela en modo eco.
 *   micro → planeta + cifra · s → esfera · m → esfera + leyenda · l → + frase de cada capa
 *   xl → + avisos y clima espacial · panorámico → esfera | leyenda a dos columnas · torre → en columna.
 */
import * as React from 'react';
import Link from 'next/link';
import { Orbit } from 'lucide-react';
import {
    avisosClima, colorTemperatura, COLOR_SEVERIDAD, explicarKp, familiaCielo, nivelAire, nivelUv, nombreG, escalaG, procedencia,
    severidadKp, textoCielo,
} from '@/modules/weather/datos/interpretar';
import { fuenteKp, resumirKp } from '@/modules/weather/datos/noaa';
import { useFuente } from '@/modules/weather/datos/hooks';
import { paletaCielo } from '../_clima/cielo';
import { grados, velocidad } from '../_clima/graficas';
import { CargandoClima, ErrorClima, LugarClima, MarcoClima, MenuClima, RotuloClima, SelloFuente, SinUbicacion, estilosClima as s, type InfoMarco } from '../_clima/piezas';
import { Encajar, PilaAjustable, Prescindible } from '@/components/dashboard/kit/pila-ajustable';
import { useDatosClima } from '../_clima/use-clima';

interface Capa { id: string; nombre: string; valor: string; nota: string; fraccion: number | null; color: string; rumbo?: number | null }

function Esfera({ capas, lado, centro, altura, codigo, foco, animar, etiqueta }: {
    capas: Capa[]; lado: number; centro: React.ReactNode; altura: number | null; codigo: number | null; foco: string | null; animar: boolean; etiqueta: string;
}) {
    const id = React.useId().replace(/:/g, '');
    const p = paletaCielo(altura, familiaCielo(codigo));
    const arco = (r: number, f: number) => {
        const a1 = -Math.PI / 2 + Math.max(0.001, Math.min(0.999, f)) * 2 * Math.PI;
        const x1 = Math.cos(a1) * r, y1 = Math.sin(a1) * r;
        return `M0 ${-r} A${r} ${r} 0 ${f > 0.5 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
    };
    return (
        <div className="relative shrink-0" style={{ width: lado, height: lado }} role="img" aria-label={etiqueta}>
            <svg viewBox="-100 -100 200 200" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
                <defs>
                    <radialGradient id={`ep-${id}`} cx="38%" cy="32%" r="80%">
                        <stop offset="0%" stopColor={p.horizonte} />
                        <stop offset="55%" stopColor={p.alto} />
                        <stop offset="100%" stopColor={p.bajo} />
                    </radialGradient>
                    <radialGradient id={`eh-${id}`}>
                        <stop offset="60%" stopColor={p.horizonte} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={p.horizonte} stopOpacity={0} />
                    </radialGradient>
                </defs>
                <circle r={46} fill={`url(#eh-${id})`} />
                <circle r={37} fill={`url(#ep-${id})`} />
                <ellipse cx={-10} cy={-14} rx={16} ry={9} fill="#fff" opacity={0.12} transform="rotate(-25 -10 -14)" />
                {animar && <circle r={98} fill="none" stroke="#fff" strokeOpacity={0.08} strokeDasharray="1 6" className={s.gira} style={{ ['--dur' as string]: '90s' }} />}
                {capas.map((c, i) => {
                    const r = 47 + i * 9.5;
                    const tenue = foco !== null && foco !== c.id;
                    return (
                        <g key={c.id} opacity={tenue ? 0.25 : 1} style={{ transition: 'opacity 200ms' }}>
                            <circle r={r} fill="none" stroke="#fff" strokeOpacity={0.08} strokeWidth={c.id === 'kp' ? 2 : 5} />
                            {c.fraccion !== null && c.fraccion > 0 && (
                                <path d={arco(r, c.fraccion)} fill="none" stroke={c.color} strokeWidth={c.id === 'kp' ? 2.4 : 5} strokeLinecap="round" strokeDasharray={c.id === 'kp' ? '2 3' : undefined} />
                            )}
                            {c.rumbo !== undefined && c.rumbo !== null && (() => {
                                const a = ((c.rumbo + 180) % 360) * (Math.PI / 180);
                                return <path d="M0 -4 L3 3 L-3 3 Z" fill={c.color} transform={`translate(${(Math.sin(a) * r).toFixed(2)} ${(-Math.cos(a) * r).toFixed(2)}) rotate(${(c.rumbo + 180) % 360})`} />;
                            })()}
                        </g>
                    );
                })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{centro}</div>
        </div>
    );
}

function Leyenda({ capas, foco, setFoco, conNotas, columnas = 1, fijas }: { capas: Capa[]; foco: string | null; setFoco: (id: string | null) => void; conNotas: boolean; columnas?: number; /** Dentro de una pila: las capas a partir de esta se retiran (las últimas primero) si no caben. */ fijas?: number }) {
    return (
        <ul className="grid gap-x-3 gap-y-1" style={{ gridTemplateColumns: `repeat(${columnas}, minmax(0,1fr))` }} aria-label="Capas de la esfera">
            {capas.map((c, i) => (
                <Prescindible key={c.id} nivel={fijas === undefined || i < fijas ? 0 : 2 + capas.length - 1 - i}>
                <li>
                    <button type="button" className={`${s.foco} flex w-full cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors duration-150 hover:bg-white/[0.06]`}
                        onMouseEnter={() => setFoco(c.id)} onMouseLeave={() => setFoco(null)} onFocus={() => setFoco(c.id)} onBlur={() => setFoco(null)}
                        aria-label={`${c.nombre}: ${c.valor}${c.nota ? `, ${c.nota}` : ''}`}>
                        <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: c.fraccion === null ? 'transparent' : c.color, boxShadow: `inset 0 0 0 1.5px ${c.color}` }} />
                        <span className={`${conNotas ? 'w-[4.6rem] shrink-0' : 'min-w-0 flex-1'} truncate text-[12px] text-white/70`} title={c.nombre}>{c.nombre}</span>
                        <span className={`${s.cifra} shrink-0 text-[13px] font-semibold`}>{c.valor}</span>
                        {conNotas && <span className="min-w-0 truncate text-[11px] text-white/50" title={c.nota}>{c.nota}</span>}
                    </button>
                </li>
                </Prescindible>
            ))}
        </ul>
    );
}

function Contenido({ info }: { info: InfoMarco }) {
    const { base, clase } = info;
    const d = useDatosClima(info, { aire: base !== 'micro' && base !== 's' });
    const kpDatos = useFuente(fuenteKp, undefined, info.visible && base !== 'micro');
    const [foco, setFoco] = React.useState<string | null>(null);

    if (d.estado === 'sin-ubicacion') return <SinUbicacion info={info} />;
    if (d.estado === 'cargando') return <CargandoClima base={base} texto="Reuniendo las capas…" />;
    if (!d.clima.datos) return <ErrorClima mensaje={d.clima.error ?? 'Open-Meteo no respondió'} onReintentar={d.clima.refrescar} />;

    const c = d.clima.datos, a = c.actual, u = d.u;
    const ahora = d.ahora ?? a.t;
    const na = nivelAire(d.aire.datos);
    const uv = nivelUv(a.uv);
    const rk = kpDatos.datos ? resumirKp(kpDatos.datos, ahora) : null;
    const kp = rk?.actual?.kp ?? null;
    const capas: Capa[] = [
        { id: 'temp', nombre: 'Temperatura', valor: grados(a.temp, u), nota: `sensación ${grados(a.sensacion, u)}`, fraccion: a.temp === null ? null : (a.temp + 10) / 55, color: colorTemperatura(a.temp) },
        { id: 'hum', nombre: 'Humedad', valor: a.humedad === null ? '—' : `${Math.round(a.humedad)} %`, nota: `rocío ${grados(a.rocio, u)}`, fraccion: a.humedad === null ? null : a.humedad / 100, color: '#60a5fa' },
        { id: 'viento', nombre: 'Viento', valor: velocidad(a.viento, u), nota: procedencia(a.dirViento), fraccion: a.viento === null ? null : a.viento / 60, color: '#5eead4', rumbo: a.dirViento },
        { id: 'uv', nombre: 'UV', valor: a.uv === null ? '—' : String(Math.round(a.uv)), nota: uv?.texto.toLowerCase() ?? 'sin dato', fraccion: a.uv === null ? null : a.uv / 11, color: uv?.color ?? '#facc15' },
        { id: 'aire', nombre: 'Aire', valor: na ? String(na.indice) : '—', nota: na ? na.texto.toLowerCase() : d.aire.error ? 'sin dato' : base === 's' ? '' : 'leyendo…', fraccion: na ? Math.max(0.03, na.fraccion) : null, color: na?.color ?? '#50ccaa' },
        { id: 'kp', nombre: 'Magnetosfera', valor: kp === null ? '—' : `Kp ${kp.toFixed(1).replace('.', ',')}`, nota: kp === null ? (kpDatos.error ? 'sin dato' : 'leyendo…') : nombreG(escalaG(kp)).toLowerCase(), fraccion: kp === null ? null : Math.max(0.03, kp / 9), color: COLOR_SEVERIDAD[severidadKp(kp)] },
    ];
    const cielo = textoCielo(a.codigo, a.esDia);
    const etiqueta = `Esfera del tiempo en ${d.ubicacion?.nombre ?? ''}: ${capas.map((x) => `${x.nombre} ${x.valor}`).join(', ')}`;
    const centro = (tam: number) => (
        <>
            <span className={`${s.cifra} ${s.sombraTexto} font-extralight leading-none`} style={{ fontSize: tam }}>{grados(a.temp, u)}</span>
            {base !== 'micro' && base !== 's' && <span className={`${s.sombraTexto} mt-0.5 max-w-[5.5rem] truncate text-[10px] text-white/80`} title={cielo}>{cielo}</span>}
        </>
    );
    const menu = <MenuClima info={info} ruta="/clima" rutaEtiqueta="Abrir el tiempo" alActualizar={() => { d.clima.refrescar(); d.aire.refrescar(); kpDatos.refrescar(); }}
        extra={[]} />;
    const cabecera = (
        <div className="flex min-w-0 items-center gap-2">
            <Orbit aria-hidden className="size-4 shrink-0" style={{ color: info.acento }} />
            <div className="min-w-0 flex-1"><RotuloClima>Esfera del tiempo</RotuloClima>{d.ubicacion && <LugarClima nombre={d.ubicacion.nombre} elegida={d.ubicacion.elegida} className="text-[11px]" />}</div>
            {menu}
        </div>
    );
    const lado = (fr: number) => Math.max(90, Math.min(info.ancho || 300, info.alto || 300) * fr);
    const esfera = (l: number, tam: number) => <Esfera capas={base === 'micro' ? [] : capas} lado={l} centro={centro(tam)} altura={d.astro.altura} codigo={a.codigo} foco={foco} animar={info.animar && info.visible} etiqueta={etiqueta} />;

    // (Pulido 0930) En micro la esfera se mide por la tesela (antes nunca bajaba de 90 px y en una
    // de 46-65 de alto se salía por arriba y por abajo).
    if (base === 'micro') {
        const l = Math.max(34, Math.min(info.ancho || 64, info.alto || 64) - 10);
        return <div className="grid h-full place-items-center overflow-hidden">{esfera(l, Math.min(18, Math.round(l * 0.34)))}</div>;
    }
    if (base === 's') return <div className="grid h-full place-items-center p-1">{esfera(lado(0.92), lado(0.92) * 0.16)}</div>;
    if (clase === 'panoramico') {
        return (
            <div className="grid h-full items-center gap-4 px-4 py-2" style={{ gridTemplateColumns: 'auto minmax(0,1fr)' }}>
                {esfera(Math.min(170, (info.alto || 150) - 8), 24)}
                <div className="min-w-0 space-y-1">{cabecera}<Leyenda capas={capas} foco={foco} setFoco={setFoco} conNotas={false} columnas={2} /></div>
            </div>
        );
    }
    if (base === 'm' && clase !== 'torre') {
        const ancho = info.ancho >= info.alto * 1.25;
        // (Pulido 0930) La esfera cede ancho a las capas y las capas que no quepan se retiran (antes
        // «Aire», «Kp» y «Magnetosfera» quedaban 15-48 px bajo la tarjeta).
        if (ancho) {
            const t = Math.max(90, Math.min(lado(0.86), (info.alto || 150) - 24, (info.ancho || 300) * 0.45));
            return (
                <div className="flex h-full min-h-0 flex-row items-center gap-3 p-3">
                    <div className="flex shrink-0 items-center justify-center">{esfera(t, 22)}</div>
                    <PilaAjustable niveles={10} className="min-w-0 flex-1">
                        <div className="my-auto min-w-0 space-y-1">{cabecera}<Leyenda capas={capas} foco={foco} setFoco={setFoco} conNotas={false} columnas={1} fijas={2} /></div>
                    </PilaAjustable>
                </div>
            );
        }
        return (
            <PilaAjustable niveles={4} className="gap-2 p-3">
                {cabecera}
                <Encajar minimo={80} className="flex items-center justify-center">
                    {({ ancho: a, alto: h }) => esfera(Math.max(80, Math.min(lado(0.6), a, h)), 22)}
                </Encajar>
                <div className="min-w-0 shrink-0"><Leyenda capas={capas.slice(0, 4)} foco={foco} setFoco={setFoco} conNotas={false} columnas={2} fijas={2} /></div>
            </PilaAjustable>
        );
    }
    const avisos = avisosClima(c, d.aire.datos, d.fmt.hora, ahora);
    const xl = base === 'xl';
    const extra = xl && (
        <div className="space-y-1.5 rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.06]">
            {avisos.slice(0, 2).map((av) => <p key={av.id} role="note" className="line-clamp-2 text-[12px] text-amber-100" title={av.texto}>{av.texto}</p>)}
            <p className="line-clamp-3 text-[12px] text-white/75" title={explicarKp(kp)}>{explicarKp(kp)}</p>
            <Link href="/atmosphere" className={`${s.foco} inline-flex cursor-pointer text-[12px] font-semibold text-sky-300 hover:underline`}>Ver el clima espacial</Link>
        </div>
    );
    const sellos = (
        <div className="flex shrink-0 flex-wrap gap-x-3">
            <SelloFuente fuente="Open-Meteo" en={d.clima.en} />
            {kpDatos.en && <SelloFuente fuente="NOAA SWPC" en={kpDatos.en} />}
        </div>
    );
    // Tarjeta apaisada (el héroe 6×6 de Astronomía): esfera a la izquierda y capas a la derecha.
    // Antes todo iba en columna y las capas de abajo («Viento», «UV»…) quedaban cortadas.
    if (clase !== 'torre' && (info.ancho || 0) >= (info.alto || 0) * 1.15) {
        return (
            <PilaAjustable className="gap-3 p-4">
                {cabecera}
                <div className="flex min-h-0 flex-1 gap-4">
                    <Encajar minimo={110} className="flex max-w-[58%] items-center justify-center">
                        {({ ancho, alto }) => { const t = Math.max(100, Math.min(xl ? 320 : 250, ancho, alto)); return esfera(t, t * 0.13); }}
                    </Encajar>
                    <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 overflow-hidden">
                        <Leyenda capas={capas} foco={foco} setFoco={setFoco} conNotas={(info.ancho || 0) > 480} columnas={1} />
                        <Prescindible nivel={2}>{extra}</Prescindible>
                    </div>
                </div>
                <Prescindible nivel={1}>{sellos}</Prescindible>
            </PilaAjustable>
        );
    }
    const dosColumnas = (info.ancho || 0) >= 300 && clase !== 'torre';
    return (
        <PilaAjustable niveles={8} className="gap-3 p-4">
            {cabecera}
            <Encajar minimo={110} className="flex items-center justify-center">
                {({ ancho, alto }) => { const t = Math.max(100, Math.min(clase === 'torre' ? 260 : xl ? 300 : 230, ancho, alto)); return esfera(t, t * 0.13); }}
            </Encajar>
            <div className="shrink-0"><Leyenda capas={capas} foco={foco} setFoco={setFoco} conNotas={xl || clase === 'torre' || (info.ancho || 0) > 330} columnas={dosColumnas ? 2 : 1} fijas={dosColumnas ? 4 : 3} /></div>
            <Prescindible nivel={1}>{extra}</Prescindible>
            <Prescindible nivel={1}>{sellos}</Prescindible>
        </PilaAjustable>
    );
}

export function WeatherHolisticWidget() {
    return (
        <MarcoClima etiqueta="Esfera del tiempo" acento="#5eead4" acento2="#a78bfa">
            {(info) => <Contenido info={info} />}
        </MarcoClima>
    );
}

export default WeatherHolisticWidget;
