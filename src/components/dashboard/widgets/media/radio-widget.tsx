'use client';

// ════════════════════════════════════════════════════════════════
// RadioWidget — Radio en vivo (Ola 0929 · paquete E, familia de medios)
// ----------------------------------------------------------------
// Emisoras REALES (SomaFM, streams públicos de la comunidad) por el motor compartido:
// un dial de sintonía con la aguja en la emisora que suena, ecualizador en vivo,
// emisora anterior/siguiente, volumen y la lista con su estilo. Recuerda la última
// emisora que escuchaste para volver a ella con un toque.
// Honesto: los streams en vivo no tienen duración (nunca hay barra de progreso) y si
// una emisora no arranca se dice («no responde») con reintentar.
// El audio solo arranca con un toque; el movimiento se para en pausa, en «eco», con
// movimiento reducido o fuera de la vista.
// Composición: micro = play de la última · s = nombre + play + ecualizador · m = dial
// + emisora + mandos · l/xl = + lista y volumen · panorámico = dial + lista en fila ·
// torre = dial arriba y lista. Estados: cargando (sintonizando), vacío (sin emisora
// elegida: invita), error (no responde: reintentar).
// ════════════════════════════════════════════════════════════════

import React, { useEffect, useState } from 'react';
import { Radio as RadioIcon, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { conAlfa } from '@/components/widgets-libres/acentos-categoria';
import { useMediaPlayer, type MediaTrack } from '@/components/dashboard/apps/media/media-engine';
import { RADIO_STATIONS } from '@/components/dashboard/apps/media/media-catalog';
import { useLienzoE, px, type LienzoE } from '../paquete-e/lienzo';
import { BotonE, EncabezadoE, RaizE, estilosE } from '../paquete-e/piezas';
import { EqE, TransporteE, VolumenE } from '../paquete-e/medios';

const CLAVE_ULTIMA = 'starseed.radio.ultima.v1';

function leerUltima(): string | null {
    try { return window.localStorage.getItem(CLAVE_ULTIMA); } catch { return null; }
}

/** Dial de sintonía: un arco con una marca por emisora y la aguja en la que suena. */
function Dial({ ancho, alto, indice, suena, lienzo, onElegir, conMarcas = true }: { ancho: number; alto: number; indice: number; suena: boolean; lienzo: LienzoE; onElegir: (i: number) => void; conMarcas?: boolean }) {
    const n = RADIO_STATIONS.length;
    const cx = ancho / 2, cy = alto * 0.95, r = Math.min(ancho * 0.46, alto * 0.85);
    const ang = (i: number) => Math.PI * (1 - (i + 0.5) / n);
    const punto = (a: number, rr: number) => [cx + Math.cos(a) * rr, cy - Math.sin(a) * rr] as const;
    const aguja = indice >= 0 ? ang(indice) : Math.PI / 2;
    const [ax, ay] = punto(aguja, r * 0.92);
    const id = React.useId().replace(/:/g, '');
    return (
        <svg width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} className="block max-w-full overflow-visible" role="group" aria-label="Dial de emisoras">
            <defs>
                <linearGradient id={`dl-${id}`} x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0%" stopColor={lienzo.acento} stopOpacity={0.2} />
                    <stop offset="50%" stopColor={lienzo.acento} stopOpacity={0.8} />
                    <stop offset="100%" stopColor={lienzo.acento2} stopOpacity={0.2} />
                </linearGradient>
            </defs>
            <path d={`M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke={`url(#dl-${id})`} strokeWidth={2} />
            {Array.from({ length: 31 }, (_, k) => {
                const a = Math.PI * (1 - k / 30);
                const [x1, y1] = punto(a, r * 0.97), [x2, y2] = punto(a, r * (k % 5 === 0 ? 0.88 : 0.93));
                return <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,.25)" strokeWidth={k % 5 === 0 ? 1.2 : 0.7} />;
            })}
            {RADIO_STATIONS.map((s, i) => {
                const [x, y] = punto(ang(i), r * 0.72);
                const activa = i === indice;
                return (
                    <g key={s.id} role={conMarcas ? "button" : undefined} tabIndex={conMarcas ? 0 : -1} aria-label={conMarcas ? `Sintonizar ${s.title}` : undefined} aria-hidden={conMarcas ? undefined : true} className="cursor-pointer outline-none"
                        onClick={() => onElegir(i)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onElegir(i); } }}>
                        <title>{s.title}</title>
                        <circle cx={x} cy={y} r={12} fill="transparent" />
                        <circle cx={x} cy={y} r={activa ? 5 : 3.5} fill={activa ? lienzo.acento : 'rgba(255,255,255,.45)'} style={activa ? { filter: `drop-shadow(0 0 6px ${lienzo.acento})` } : undefined} />
                    </g>
                );
            })}
            <line x1={cx} y1={cy} x2={ax} y2={ay} stroke={lienzo.acento} strokeWidth={2} strokeLinecap="round" style={{ transition: 'all 400ms cubic-bezier(.22,1,.36,1)', filter: `drop-shadow(0 0 4px ${conAlfa(lienzo.acento, 0.8)})` }} />
            <circle cx={cx} cy={cy} r={5} fill="#fff" />
            {suena && lienzo.animar && <circle cx={cx} cy={cy} r={10} fill="none" stroke={lienzo.acento} className={estilosE.onda} />}
        </svg>
    );
}

export function RadioWidget() {
    const { ref, lienzo } = useLienzoE();
    const { state, playTrack, pause, setVolume } = useMediaPlayer();
    const [ultima, setUltima] = useState<string | null>(null);
    const [intento, setIntento] = useState<string | null>(null);
    const [caida, setCaida] = useState<string | null>(null);
    useEffect(() => { setUltima(leerUltima()); }, []);

    const pista = state.track;
    const enRadio = pista?.kind === 'radio' ? pista : null;
    const actual: MediaTrack | null = enRadio ?? RADIO_STATIONS.find((s) => s.id === ultima) ?? null;
    const indice = actual ? RADIO_STATIONS.findIndex((s) => s.id === actual.id) : -1;
    const suena = !!enRadio && state.playing;
    const sintonizando = !!enRadio && state.loading && !state.playing;

    useEffect(() => {
        if (!intento || enRadio?.id !== intento) return;
        if (state.playing) { setCaida(null); setIntento(null); return; }
        if (!state.loading) { const id = window.setTimeout(() => setCaida(intento), 700); return () => window.clearTimeout(id); }
    }, [intento, enRadio, state.playing, state.loading]);

    const sintonizar = (s: MediaTrack) => {
        if (enRadio?.id === s.id && state.playing) { pause(); return; }
        setCaida(null);
        setIntento(s.id);
        setUltima(s.id);
        try { window.localStorage.setItem(CLAVE_ULTIMA, s.id); } catch { /* sin almacenamiento */ }
        playTrack(s, RADIO_STATIONS);
    };
    const mover = (d: number) => {
        const i = indice < 0 ? 0 : (indice + d + RADIO_STATIONS.length) % RADIO_STATIONS.length;
        sintonizar(RADIO_STATIONS[i]);
    };
    const alternar = () => (actual ? sintonizar(actual) : sintonizar(RADIO_STATIONS[0]));

    const { base, clase, horizontal } = lienzo;
    const estadoTexto = sintonizando ? 'Sintonizando…' : caida === actual?.id ? 'No responde' : suena ? 'En vivo' : actual ? 'En pausa' : 'Elige una emisora';
    const raiz = { lienzo, refRaiz: ref, etiqueta: `Radio: ${actual ? `${actual.title}, ${estadoTexto.toLowerCase()}` : 'sin emisora'}`, tipo: 'RADIO_LIVE' } as const;
    const reintento = caida && caida === actual?.id ? <BotonE lienzo={{ ...lienzo, acento: '#f59e0b' }} compacto icono={RotateCcw} onClick={() => actual && sintonizar(actual)}>Reintentar</BotonE> : null;

    const lista = (horizontalLista = false, max = 8) => (
        <ul className={cn('flex min-h-0 gap-1', horizontalLista ? 'overflow-x-auto' : 'flex-col', estilosE.desliza)} aria-label="Emisoras">
            {RADIO_STATIONS.slice(0, max).map((s) => {
                const activa = actual?.id === s.id;
                const vivaEsta = activa && suena;
                return (
                    <li key={s.id} className={horizontalLista ? 'shrink-0' : undefined}>
                        <button type="button" onClick={() => sintonizar(s)} aria-pressed={activa}
                            aria-label={vivaEsta ? `Detener ${s.title}` : caida === s.id ? `Reintentar ${s.title}` : `Sintonizar ${s.title}`}
                            className={cn('flex min-h-10 cursor-pointer items-center gap-2.5 rounded-xl px-2.5 text-left transition-colors duration-150', horizontalLista ? 'min-w-[160px]' : 'w-full', activa ? 'bg-white/[0.08]' : 'hover:bg-white/[0.05]')}>
                            {vivaEsta ? <EqE suena lienzo={lienzo} barras={3} alto={14} /> : <RadioIcon aria-hidden className="size-4 shrink-0 text-white/45" />}
                            <span className="min-w-0 flex-1">
                                <span className={cn('block truncate text-[12px]', activa ? 'font-semibold text-white' : 'text-white/85')}>{s.title}</span>
                                <span className={cn('block truncate text-[11px]', caida === s.id ? 'text-amber-300' : 'text-white/45')}>{caida === s.id ? 'No responde · toca para reintentar' : s.artist}</span>
                            </span>
                        </button>
                    </li>
                );
            })}
        </ul>
    );

    const cabecera = (
        <div className="min-w-0 text-center" aria-live="polite">
            <p className="truncate font-semibold text-white" style={{ fontSize: px(lienzo, base === 'xl' ? 17 : 15) }} title={actual?.title}>{actual?.title ?? 'Radio en vivo'}</p>
            <p className={cn('flex items-center justify-center gap-1.5 truncate', caida === actual?.id ? 'text-amber-300' : 'text-white/55')} style={{ fontSize: px(lienzo, 12) }}>
                {suena && <span aria-hidden className={cn('size-1.5 rounded-full bg-rose-400', lienzo.animar && 'ss-respirar')} />}
                {estadoTexto}{actual && !caida ? ` · ${actual.artist}` : ''}
            </p>
        </div>
    );

    if (base === 'micro') {
        return (
            <RaizE {...raiz}>
                <button type="button" onClick={alternar} aria-label={suena ? `Detener ${actual?.title}` : `Escuchar ${actual?.title ?? 'la radio'}`}
                    className="ss-redondo m-auto grid size-[76%] max-h-20 max-w-20 cursor-pointer place-items-center rounded-full outline-none focus-visible:ring-2"
                    style={{ background: `radial-gradient(closest-side, ${conAlfa(lienzo.acento, 0.4)}, ${conAlfa(lienzo.acento, 0.05)})` }}>
                    {suena ? <EqE suena lienzo={lienzo} alto={22} /> : <RadioIcon aria-hidden className="size-6 text-white" />}
                </button>
            </RaizE>
        );
    }

    if (base === 's') {
        return (
            <RaizE {...raiz}>
                <div className="flex h-full flex-col items-center justify-center gap-2">
                    <EqE suena={suena} lienzo={lienzo} alto={26} barras={7} />
                    {cabecera}
                    <TransporteE lienzo={lienzo} suena={suena} cargando={sintonizando} hayPista onAlternar={alternar} sinSaltos />
                </div>
            </RaizE>
        );
    }

    const anchoDial = Math.max(160, Math.min(420, (lienzo.ancho || 260) - 16));
    const altoDial = Math.max(70, Math.min(150, anchoDial * 0.46));

    if (horizontal) {
        return (
            <RaizE {...raiz}>
                <div className="flex h-full min-h-0 items-center gap-3 px-1">
                    <Dial ancho={Math.min(220, (lienzo.alto || 120) * 1.9)} alto={Math.min(110, (lienzo.alto || 120) - 12)} indice={indice} suena={suena} lienzo={lienzo} onElegir={(i) => sintonizar(RADIO_STATIONS[i])} conMarcas={false} />
                    <div className="flex w-44 shrink-0 flex-col items-center gap-1.5">{cabecera}<TransporteE lienzo={lienzo} suena={suena} cargando={sintonizando} hayPista onAnterior={() => mover(-1)} onAlternar={alternar} onSiguiente={() => mover(1)} /></div>
                    <div className="min-w-0 flex-1">{lista(true)}</div>
                </div>
            </RaizE>
        );
    }

    const grande = base === 'l' || base === 'xl' || clase === 'torre';
    return (
        <RaizE {...raiz}>
            <div className="flex h-full min-h-0 flex-col items-center gap-2 p-1">
                {grande && <EncabezadoE lienzo={lienzo} icono={RadioIcon} titulo="Radio en vivo" vivo={suena} className="w-full" detalle="SomaFM · emisoras libres" />}
                <Dial ancho={anchoDial} alto={altoDial} indice={indice} suena={suena} lienzo={lienzo} onElegir={(i) => sintonizar(RADIO_STATIONS[i])} conMarcas={!grande} />
                {cabecera}
                {reintento}
                <TransporteE lienzo={lienzo} suena={suena} cargando={sintonizando} hayPista onAnterior={() => mover(-1)} onAlternar={alternar} onSiguiente={() => mover(1)} grande={grande} />
                {grande && <VolumenE lienzo={lienzo} volumen={state.volume} onCambio={setVolume} className="w-full" />}
                {grande && <div className="min-h-0 w-full flex-1">{lista(false)}</div>}
            </div>
        </RaizE>
    );
}
