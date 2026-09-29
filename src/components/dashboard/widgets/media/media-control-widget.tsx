'use client';

// ════════════════════════════════════════════════════════════════
// MediaControlWidget — Control de medios (Ola 0929 · paquete E, familia de medios)
// ----------------------------------------------------------------
// El mando de TODO lo que suena en el OS, en un sitio:
//   · sonando ahora (Reproductor o Radio, el mismo motor compartido) con mandos,
//     onda/ecualizador y volumen maestro;
//   · Omnifrecuencias (su propio motor): cuántas capas suenan y «detener»;
//   · fuentes rápidas (tus audios abiertos, pistas y emisoras) en lista vertical;
//   · salida: la visualización Audiomorphic como capa del fondo (su interruptor) y
//     los dispositivos de salida. Honesto: el navegador no deja elegir la salida de
//     este motor, así que se listan (tras tu gesto) y se dice «la decide el sistema».
// El audio solo arranca con un toque; el movimiento se para en pausa, en «eco»,
// con movimiento reducido o fuera de la vista.
// Composición: micro = play/pausa · s = portada + título + play · m = sonando + mandos +
// volumen · l = + fuentes y salida · xl = dos columnas · panorámico = barra de mando ·
// torre = columna. Estados: cargando (el stream), vacío (nada sonando: invita a
// elegir una fuente), error (no se pudieron listar las salidas).
// ════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useState } from 'react';
import { SlidersHorizontal, Music, Radio as RadioIcon, AudioWaveform, Speaker, Waves, Square, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { conAlfa } from '@/components/widgets-libres/acentos-categoria';
import { useAppearance } from '@/context/appearance-context';
import { audiomorphicLayer, normalizeLayers, setAudiomorphicEnabled } from '@/lib/appearance/background-layers';
import { useMediaPlayer, type MediaTrack } from '@/components/dashboard/apps/media/media-engine';
import { SAMPLE_TRACKS, RADIO_STATIONS } from '@/components/dashboard/apps/media/media-catalog';
import { useAudio } from '@/components/dashboard/apps/omnifrecuencias/frecuencias/hooks/useAudio';
import { useLienzoE, px } from '../paquete-e/lienzo';
import { BotonE, EncabezadoE, RaizE, SelloE, estilosE, tintaE } from '../paquete-e/piezas';
import { EqE, OndaE, PortadaE, TransporteE, VolumenE, tiempoE } from '../paquete-e/medios';
import { usePistasLocalesE } from '../paquete-e/pistas-locales';

interface Salida { id: string; nombre: string }

/** Interruptor accesible (role=switch) con la voz del acento. */
function Interruptor({ activo, onCambio, etiqueta, acento }: { activo: boolean; onCambio: () => void; etiqueta: string; acento: string }) {
    return (
        <button type="button" role="switch" aria-checked={activo} aria-label={etiqueta} onClick={onCambio}
            className="ss-redondo relative h-6 w-11 shrink-0 cursor-pointer rounded-full outline-none transition-colors duration-200 focus-visible:ring-2"
            style={{ background: activo ? conAlfa(acento, 0.6) : 'rgba(255,255,255,.14)', ['--tw-ring-color' as string]: acento } as React.CSSProperties}>
            <span aria-hidden className="absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform duration-200" style={{ transform: `translateX(${activo ? 22 : 2}px)` }} />
        </button>
    );
}

export function MediaControlWidget() {
    const { ref, lienzo } = useLienzoE();
    const { config, updateConfig } = useAppearance();
    const { state, playTrack, toggle, next, prev, seek, setVolume } = useMediaPlayer();
    const omni = useAudio();
    const locales = usePistasLocalesE();
    const pista = state.track;
    const esRadio = pista?.kind === 'radio';
    const duracion = Number.isFinite(state.duration) && state.duration > 0 ? state.duration : 0;
    const progreso = duracion && !esRadio ? Math.min(1, state.currentTime / duracion) : 0;
    const cargando = state.loading && !state.playing;
    const capasOmni = omni.oscillators.filter((o) => o.isPlaying).length;
    const omniSuena = omni.isPlaying && capasOmni > 0;

    // ── Capa Audiomorphic (nunca toca el fondo base del usuario) ──
    const capas = normalizeLayers(config.background?.layers);
    const audiomorphicActivo = !!audiomorphicLayer(capas);
    const alternarAudiomorphic = useCallback(() => {
        updateConfig({ background: { layers: setAudiomorphicEnabled(capas, !audiomorphicActivo) } } as never);
    }, [capas, audiomorphicActivo, updateConfig]);

    // ── Salidas de audio (solo tras un gesto; honesto sobre lo que se puede hacer) ──
    const [soportaSalidas, setSoportaSalidas] = useState(false);
    const [salidas, setSalidas] = useState<Salida[] | null>(null);
    const [errorSalidas, setErrorSalidas] = useState<string | null>(null);
    useEffect(() => {
        setSoportaSalidas(typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.enumerateDevices === 'function');
    }, []);
    const listarSalidas = async () => {
        setErrorSalidas(null);
        try {
            const todos = await navigator.mediaDevices.enumerateDevices();
            setSalidas(todos.filter((d) => d.kind === 'audiooutput').map((d, i) => ({ id: d.deviceId || `s-${i}`, nombre: d.label || (d.deviceId === 'default' ? 'Salida predeterminada' : `Salida ${i + 1}`) })));
        } catch {
            setErrorSalidas('El navegador no dejó listar las salidas.');
        }
    };

    const tocar = (t: MediaTrack, cola: MediaTrack[]) => { if (pista?.id === t.id) toggle(); else playTrack(t, cola); };
    const alternar = () => { if (pista) toggle(); else playTrack(locales[0] ?? SAMPLE_TRACKS[0], locales.length ? locales : SAMPLE_TRACKS); };

    const { base, clase, horizontal } = lienzo;
    const titulo = pista?.title ?? 'Nada sonando';
    const sub = cargando ? 'Cargando…' : pista ? (esRadio ? `En vivo · ${pista.artist ?? ''}` : pista.artist ?? '') : 'Elige una fuente';
    const raiz = { lienzo, refRaiz: ref, etiqueta: `Control de medios: ${pista ? `${titulo}${state.playing ? ', sonando' : ', en pausa'}` : 'nada sonando'}`, tipo: 'MEDIA_CONTROL' } as const;

    const info = (tam = 14) => (
        <div className="min-w-0" aria-live="polite">
            <p className="truncate font-semibold text-white" style={{ fontSize: px(lienzo, tam) }} title={titulo}>{titulo}</p>
            <p className="truncate text-white/55" style={{ fontSize: px(lienzo, 12) }}>{sub}</p>
        </div>
    );
    const progresoEl = (alto: number) => esRadio
        ? <EqE suena={state.playing} lienzo={lienzo} barras={11} alto={alto * 0.8} />
        : pista ? <div className="flex w-full min-w-0 items-center gap-2">
            <OndaE id={pista.id} progreso={progreso} alto={alto} lienzo={lienzo} etiqueta={`Posición ${tiempoE(state.currentTime)} de ${tiempoE(duracion)}`} onSaltar={duracion ? (f) => seek(f * duracion) : undefined} barras={40} />
            <span className="shrink-0 text-[11px] tabular-nums text-white/50">{tiempoE(duracion - state.currentTime)}</span>
        </div> : null;

    const frecuencias = (
        <div className="flex min-w-0 items-center gap-2.5 rounded-2xl px-2.5 py-2" style={{ background: conAlfa('#22d3ee', omniSuena ? 0.12 : 0.05) }}>
            <Waves aria-hidden className="size-4 shrink-0" style={{ color: omniSuena ? '#67e8f9' : 'rgba(255,255,255,.45)' }} />
            <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-semibold text-white/90">Omnifrecuencias</span>
                <span className="block truncate text-[11px] text-white/50">{omniSuena ? `${capasOmni} ${capasOmni === 1 ? 'capa sonando' : 'capas sonando'}` : omni.oscillators.length ? 'En pausa' : 'En silencio'}</span>
            </span>
            {omni.oscillators.length > 0 && (
                <BotonE lienzo={{ ...lienzo, acento: '#22d3ee' }} compacto icono={Square} onClick={() => omni.oscillators.forEach((o) => omni.removeOscillator(o.id))}>Detener</BotonE>
            )}
        </div>
    );

    const fuentes = (max: number) => {
        const lista: { t: MediaTrack; cola: MediaTrack[]; radio: boolean }[] = [
            ...locales.slice(0, 2).map((t) => ({ t, cola: locales, radio: false })),
            ...SAMPLE_TRACKS.slice(0, 2).map((t) => ({ t, cola: SAMPLE_TRACKS, radio: false })),
            ...RADIO_STATIONS.slice(0, 3).map((t) => ({ t, cola: RADIO_STATIONS, radio: true })),
        ].slice(0, max);
        return (
            <section aria-label="Fuentes rápidas" className="flex min-h-0 min-w-0 flex-col gap-1">
                <div className="flex items-center gap-2"><span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">Fuentes</span><SelloE title="Pistas SoundHelix para probar; las emisoras son reales">pistas de demostración</SelloE></div>
                <ul className={cn('flex min-h-0 flex-col gap-0.5', estilosE.desliza)}>
                    {lista.map(({ t, cola, radio }) => {
                        const activa = pista?.id === t.id;
                        return (
                            <li key={t.id}>
                                <button type="button" onClick={() => tocar(t, cola)} aria-pressed={activa} aria-label={`${activa && state.playing ? 'Pausar' : radio ? 'Sintonizar' : 'Reproducir'} ${t.title}`}
                                    className={cn('flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-xl px-2 text-left transition-colors duration-150', activa ? 'bg-white/[0.08]' : 'hover:bg-white/[0.05]')}>
                                    {activa && state.playing ? <EqE suena lienzo={lienzo} barras={3} alto={12} /> : radio ? <RadioIcon aria-hidden className="size-3.5 shrink-0 text-white/45" /> : <Music aria-hidden className="size-3.5 shrink-0 text-white/45" />}
                                    <span className="min-w-0 flex-1 truncate text-[12px] text-white/85">{t.title}</span>
                                    <span className="shrink-0 text-[10px] uppercase tracking-[0.1em] text-white/40">{radio ? 'radio' : t.id.startsWith('local-') ? 'tuyo' : 'pista'}</span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </section>
        );
    };

    const salida = (
        <section aria-label="Salida de medios" className="flex min-w-0 flex-col gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">Salida</span>
            <div className="flex min-w-0 items-center gap-2.5">
                <AudioWaveform aria-hidden className="size-4 shrink-0" style={{ color: audiomorphicActivo ? tintaE(lienzo.acento) : 'rgba(255,255,255,.45)' }} />
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-semibold text-white/90">Visualización al fondo</span>
                    <span className="block truncate text-[11px] text-white/50">Audiomorphic como capa del fondo</span>
                </span>
                <Interruptor activo={audiomorphicActivo} onCambio={alternarAudiomorphic} etiqueta="Visualización Audiomorphic en el fondo" acento={lienzo.acento} />
            </div>
            <div className="flex min-w-0 items-start gap-2.5">
                <Speaker aria-hidden className="mt-0.5 size-4 shrink-0 text-white/45" />
                <div className="min-w-0 flex-1">
                    {salidas === null ? (
                        <span className="block text-[12px] text-white/70">{soportaSalidas ? 'Salidas de audio' : 'Salida: la del sistema'}</span>
                    ) : salidas.length === 0 ? (
                        <span className="block text-[12px] text-white/70">El navegador no enseña salidas.</span>
                    ) : (
                        <ul className="flex flex-col gap-0.5">{salidas.slice(0, 4).map((s) => <li key={s.id} className="truncate text-[12px] text-white/80">{s.nombre}</li>)}</ul>
                    )}
                    <span className="block text-[11px] text-white/45">{errorSalidas ?? 'La salida la decide el sistema.'}</span>
                </div>
                {soportaSalidas && <BotonE lienzo={lienzo} variante="fantasma" compacto icono={RefreshCw} onClick={() => void listarSalidas()}>{salidas ? 'Actualizar' : 'Ver'}</BotonE>}
            </div>
        </section>
    );

    if (base === 'micro') {
        return (
            <RaizE {...raiz}>
                <div className="m-auto"><TransporteE lienzo={lienzo} suena={state.playing} cargando={cargando} hayPista={!!pista} onAlternar={alternar} sinSaltos /></div>
            </RaizE>
        );
    }

    if (base === 's') {
        return (
            <RaizE {...raiz}>
                <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center">
                    <PortadaE id={pista?.id ?? 'nada'} arte={pista?.art} lado={Math.max(48, Math.min(72, (lienzo.alto || 150) * 0.4))} suena={state.playing} lienzo={lienzo} radio={esRadio} />
                    <div className="w-full">{info(12)}</div>
                    <TransporteE lienzo={lienzo} suena={state.playing} cargando={cargando} hayPista={!!pista} onAlternar={alternar} sinSaltos />
                </div>
            </RaizE>
        );
    }

    if (horizontal) {
        const ancho = lienzo.ancho || 800;
        return (
            <RaizE {...raiz}>
                <div className="flex h-full min-h-0 items-center gap-3 px-1">
                    <PortadaE id={pista?.id ?? 'nada'} arte={pista?.art} lado={Math.max(44, Math.min(80, (lienzo.alto || 100) - 20))} suena={state.playing} lienzo={lienzo} radio={esRadio} />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">{info()}{progresoEl(18)}</div>
                    <TransporteE lienzo={lienzo} suena={state.playing} cargando={cargando} hayPista={!!pista} onAnterior={prev} onAlternar={alternar} onSiguiente={next} />
                    {ancho > 620 && <VolumenE lienzo={lienzo} volumen={state.volume} onCambio={setVolume} className="w-32 shrink-0" />}
                    {ancho > 820 && <Interruptor activo={audiomorphicActivo} onCambio={alternarAudiomorphic} etiqueta="Visualización Audiomorphic en el fondo" acento={lienzo.acento} />}
                </div>
            </RaizE>
        );
    }

    const sonando = (
        <div className="flex min-w-0 flex-col gap-2.5">
            <div className="flex min-w-0 items-center gap-3">
                <PortadaE id={pista?.id ?? 'nada'} arte={pista?.art} lado={base === 'xl' ? 88 : 60} suena={state.playing} lienzo={lienzo} radio={esRadio} />
                <div className="min-w-0 flex-1">{info(base === 'xl' ? 16 : 14)}</div>
            </div>
            {progresoEl(20)}
            <TransporteE lienzo={lienzo} suena={state.playing} cargando={cargando} hayPista={!!pista} onAnterior={prev} onAlternar={alternar} onSiguiente={next} grande={base !== 'm'} />
            <VolumenE lienzo={lienzo} volumen={state.volume} onCambio={setVolume} />
        </div>
    );

    if (base === 'm' && clase !== 'torre') {
        return <RaizE {...raiz}><div className="flex h-full min-h-0 flex-col justify-center gap-2 p-1">{sonando}{omni.oscillators.length > 0 && frecuencias}</div></RaizE>;
    }

    if (base === 'xl') {
        return (
            <RaizE {...raiz}>
                <div className="flex h-full min-h-0 flex-col gap-2 p-1">
                    <EncabezadoE lienzo={lienzo} icono={SlidersHorizontal} titulo="Control de medios" vivo={esRadio && state.playing} />
                    <div className="grid min-h-0 flex-1 grid-cols-2 gap-4">
                        <div className="flex min-h-0 flex-col gap-3">{sonando}{frecuencias}</div>
                        <div className="flex min-h-0 flex-col gap-3">{fuentes(7)}{salida}</div>
                    </div>
                </div>
            </RaizE>
        );
    }

    // l y torre.
    return (
        <RaizE {...raiz}>
            <div className={cn('flex h-full min-h-0 flex-col gap-2.5 p-1', estilosE.desliza)}>
                <EncabezadoE lienzo={lienzo} icono={SlidersHorizontal} titulo="Control de medios" vivo={esRadio && state.playing} />
                {sonando}
                {frecuencias}
                {fuentes(clase === 'torre' ? 7 : 4)}
                {salida}
            </div>
        </RaizE>
    );
}
