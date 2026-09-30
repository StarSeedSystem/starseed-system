'use client';
/**
 * Temperatura (WEATHER_TEMPERATURE) — Ola 0929 · paquete A.
 * Real (Open-Meteo, tu ubicación). El foco es un arco térmico de −10° a 45° teñido por la
 * temperatura, con la sensación como segunda marca y la comparación con ayer a esta hora.
 *   micro → la cifra · s → arco + sensación · m → + horquilla de hoy y próximas 12 h
 *   l → curva de 24 h (con sensación) + días · xl → + rocío, confort y cuándo llega la máxima
 *   panorámico → cifra | curva · torre → cifra + línea del día.
 */
import * as React from 'react';
import { Thermometer } from 'lucide-react';
import { colorTemperatura, confortRocio } from '@/modules/weather/datos/interpretar';
import { horaDeAyer } from '@/modules/weather/datos/open-meteo';
import { aTemp, type Unidades } from '@/modules/weather/datos/hooks';
import { FilaDias, GraficaHoras, grados, LineaDia, RangoHoy } from '../_clima/graficas';
import { Datos, WidgetMagnitud, type CtxMagnitud } from '../_clima/magnitud';
import { estilosClima as s } from '../_clima/piezas';
import { Encajar, PilaAjustable, Prescindible } from '@/components/dashboard/kit/pila-ajustable';

const MIN = -10, MAX = 45;

/** Arco de 240° con el tramo de color hasta la temperatura y la sensación como punto. */
function ArcoTermico({ temp, sensacion, u, lado }: { temp: number | null; sensacion: number | null; u: Unidades; lado: number }) {
    const ang = (c: number) => (-210 + ((Math.min(MAX, Math.max(MIN, c)) - MIN) / (MAX - MIN)) * 240) * (Math.PI / 180);
    const p = (a: number, r: number) => [Math.cos(a) * r, Math.sin(a) * r] as const;
    const arco = (a0: number, a1: number, r: number) => {
        const [x0, y0] = p(a0, r), [x1, y1] = p(a1, r);
        return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
    };
    const id = React.useId().replace(/:/g, '');
    const color = colorTemperatura(temp);
    return (
        <div className="relative shrink-0" style={{ width: lado, height: lado }} role="img" aria-label={temp === null ? 'Sin dato de temperatura' : `${grados(temp, u)}, sensación ${grados(sensacion, u)}`}>
            <svg viewBox="-50 -50 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
                <defs>
                    <linearGradient id={`at-${id}`} x1="0" y1="1" x2="1" y2="0">
                        {[-10, 0, 10, 20, 30, 40].map((c, i) => <stop key={c} offset={`${i * 20}%`} stopColor={colorTemperatura(c)} />)}
                    </linearGradient>
                </defs>
                <path d={arco(ang(MIN), ang(MAX), 42)} stroke="#ffffff" strokeOpacity={0.1} strokeWidth={7} fill="none" strokeLinecap="round" />
                {temp !== null && <path d={arco(ang(MIN), ang(temp), 42)} stroke={`url(#at-${id})`} strokeWidth={7} fill="none" strokeLinecap="round" />}
                {sensacion !== null && (() => { const [x, y] = p(ang(sensacion), 42); return <circle cx={x} cy={y} r={3.2} fill="#0c0f24" stroke="#fff" strokeWidth={1.6} />; })()}
                {[0, 20, 40].map((c) => { const [x, y] = p(ang(c), 31); return <text key={c} x={x} y={y + 2} textAnchor="middle" fontSize={6} fill="#fff" fillOpacity={0.45}>{Math.round(aTemp(c, u.temp))}°</text>; })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`${s.cifra} font-extralight leading-none`} style={{ fontSize: lado * 0.28, color }}>{grados(temp, u)}</span>
            </div>
        </div>
    );
}

function Cuerpo(x: CtxMagnitud) {
    const { info, a, c, d, hoy, prox, ahora, id, cabecera, sello } = x;
    const { base, clase } = info;
    const u = d.u;
    const lado = Math.max(80, Math.min(info.ancho || 200, info.alto || 200) * (base === 's' ? 0.66 : 0.52));
    const ayer = horaDeAyer(c.horas, ahora);
    const dif = ayer?.temp != null && a.temp !== null ? Math.round(aTemp(a.temp, u.temp) - aTemp(ayer.temp, u.temp)) : null;
    const frase = dif === null ? null : dif === 0 ? 'Igual que ayer a esta hora' : `${Math.abs(dif)}° ${dif > 0 ? 'más' : 'menos'} que ayer a esta hora`;
    const hoyHoras = prox.filter((h) => hoy && h.t < hoy.t + 86_400_000);
    const pico = hoyHoras.reduce<typeof prox[number] | null>((m, h) => (h.temp !== null && (!m || (h.temp as number) > (m.temp as number)) ? h : m), null);

    if (base === 'micro') {
        return (
            <div className="flex h-full flex-col items-center justify-center" role="img" aria-label={`Temperatura ${grados(a.temp, u)}`}>
                <span className={`${s.cifra} text-[30px] font-extralight leading-none`} style={{ color: colorTemperatura(a.temp) }}>{grados(a.temp, u)}</span>
            </div>
        );
    }
    if (base === 's') {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-1 p-2">
                <ArcoTermico temp={a.temp} sensacion={a.sensacion} u={u} lado={lado} />
                <span className="text-[12px] text-white/75">Sensación {grados(a.sensacion, u)}</span>
            </div>
        );
    }
    if (clase === 'panoramico') {
        return (
            <div className="grid h-full items-center gap-4 px-4 py-2" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.3fr)' }}>
                <div className="flex min-w-0 items-center gap-3">
                    <ArcoTermico temp={a.temp} sensacion={a.sensacion} u={u} lado={Math.min(110, (info.alto || 130) - 20)} />
                    <div className="min-w-0">{cabecera('Temperatura')}<p className="truncate text-[12px] text-white/70">Sensación {grados(a.sensacion, u)}</p>{frase && <p className="line-clamp-2 text-[11px] text-white/55" title={frase}>{frase}</p>}</div>
                </div>
                <GraficaHoras horas={prox} hora={d.fmt.hora} u={u} id={id} alto={Math.max(64, (info.alto || 130) - 26)} mostrarSensacion />
            </div>
        );
    }
    if (clase === 'torre') {
        return (
            <PilaAjustable className="gap-3 p-3.5">
                {cabecera('Temperatura')}
                <Encajar minimo={72} className="flex items-center justify-center">
                    {({ ancho, alto }) => <ArcoTermico temp={a.temp} sensacion={a.sensacion} u={u} lado={Math.max(64, Math.min(150, ancho - 6, alto))} />}
                </Encajar>
                <p className="line-clamp-2 shrink-0 text-center text-[12px] text-white/70">Sensación {grados(a.sensacion, u)}{frase ? ` · ${frase}` : ''}</p>
                <Prescindible nivel={1}><div className="shrink-0 overflow-hidden"><LineaDia horas={prox.slice(0, 8)} hora={d.fmt.hora} u={u} orto={hoy?.orto ?? null} ocaso={hoy?.ocaso ?? null} /></div></Prescindible>
                <Prescindible nivel={1}>{sello}</Prescindible>
            </PilaAjustable>
        );
    }
    if (base === 'm') {
        return (
            <PilaAjustable className="gap-2 p-3.5">
                {cabecera('Temperatura')}
                <Encajar minimo={64} className="flex items-center gap-3">
                    {({ ancho, alto }) => (
                        <>
                            <ArcoTermico temp={a.temp} sensacion={a.sensacion} u={u} lado={Math.max(56, Math.min(118, lado, alto, ancho * 0.45))} />
                            <div className="min-w-0 flex-1 space-y-1.5">
                                <p className="truncate text-[13px]">Sensación <span className={`${s.cifra} font-semibold`}>{grados(a.sensacion, u)}</span></p>
                                {frase && alto >= 84 && <p className="line-clamp-2 text-[11px] text-white/60" title={frase}>{frase}</p>}
                                {hoy && <RangoHoy min={hoy.min} max={hoy.max} ahora={a.temp} u={u} />}
                            </div>
                        </>
                    )}
                </Encajar>
                <Prescindible nivel={1}><GraficaHoras horas={prox.slice(0, 12)} hora={d.fmt.hora} u={u} id={id} alto={58} etiquetas={4} /></Prescindible>
            </PilaAjustable>
        );
    }
    const confort = confortRocio(a.rocio);
    const nDias = base === 'xl' ? 5 : info.alto > 0 ? Math.max(2, Math.min(4, Math.floor((info.alto - 290) / 26))) : 3;
    return (
        <PilaAjustable className="gap-2.5 p-4">
            {cabecera('Temperatura')}
            <div className="flex shrink-0 items-center gap-4">
                <ArcoTermico temp={a.temp} sensacion={a.sensacion} u={u} lado={Math.min(base === 'xl' ? 150 : 118, Math.max(72, (info.ancho || 300) * 0.4))} />
                <div className="min-w-0 flex-1 space-y-2">
                    <p className="text-[14px]">Sensación <span className={`${s.cifra} font-semibold`}>{grados(a.sensacion, u)}</span></p>
                    {frase && <p className="text-[12px] text-white/65">{frase}</p>}
                    {hoy && <RangoHoy min={hoy.min} max={hoy.max} ahora={a.temp} u={u} />}
                    {base === 'xl' && (
                        <Datos columnas={3} filas={[
                            { t: 'Punto de rocío', v: grados(a.rocio, u), n: confort?.texto, color: confort?.color },
                            { t: 'Humedad', v: a.humedad === null ? '—' : `${Math.round(a.humedad)} %` },
                            { t: 'Máxima de hoy', v: pico ? grados(pico.temp, u) : '—', n: pico ? `a las ${d.fmt.hora(pico.t)}` : undefined },
                        ]} />
                    )}
                </div>
            </div>
            <Prescindible nivel={3}><GraficaHoras horas={prox} hora={d.fmt.hora} u={u} id={id} alto={base === 'xl' ? 100 : 80} mostrarSensacion /></Prescindible>
            <Prescindible nivel={2}><div className="min-h-0 shrink-0 overflow-hidden"><FilaDias dias={c.dias.slice(0, nDias)} dia={d.fmt.dia} u={u} ahoraTemp={a.temp} compacta /></div></Prescindible>
            <Prescindible nivel={1}><div className="mt-auto">{sello}</div></Prescindible>
        </PilaAjustable>
    );
}

export function WeatherTemperatureWidget() {
    return <WidgetMagnitud etiqueta="Temperatura" acento="#fb923c" acento2="#38bdf8" icono={Thermometer} render={Cuerpo} />;
}

export default WeatherTemperatureWidget;
