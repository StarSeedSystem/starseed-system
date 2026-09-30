'use client';

// ════════════════════════════════════════════════════════════════
// MusicPlayerWidget — el Reproductor (Ola 0929 · paquete E, familia de medios)
// ----------------------------------------------------------------
// Sonando ahora con portada viva, onda de la pista (tocar para saltar), mandos,
// volumen y cola. Comparte el motor global con la Radio y el Control de medios:
// una sola fuente de audio; si suena una radio, aquí se ve y se controla.
// Música de verdad: «Abrir audio» reproduce archivos de TU dispositivo (no se suben
// a ningún sitio). Las pistas de la cola que trae el OS son de demostración
// (SoundHelix, libres) y se rotulan así.
// El audio solo arranca con un toque; las animaciones se paran en pausa, en «eco»,
// con movimiento reducido o con el widget fuera de la vista.
// Composición: micro = portada con play · s = portada + título + play · m = portada,
// título, mandos y onda · l = + cola y volumen · xl = portada grande + cola al lado ·
// panorámico = tira horizontal · torre = columna. Estados: cargando (el stream),
// vacío (nada sonando: invita a elegir), error (la pista no arranca: reintentar).
// ════════════════════════════════════════════════════════════════

import React, { useEffect, useRef, useState } from 'react';
import { PilaAjustable, Prescindible } from '@/components/dashboard/kit/pila-ajustable';
import { Music, FolderOpen, X, Radio as RadioIcon, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMediaPlayer, type MediaTrack } from '@/components/dashboard/apps/media/media-engine';
import { SAMPLE_TRACKS } from '@/components/dashboard/apps/media/media-catalog';
import { useLienzoE, px } from '../paquete-e/lienzo';
import { BotonE, EncabezadoE, RaizE, SelloE, estilosE } from '../paquete-e/piezas';
import { EqE, OndaE, PortadaE, TransporteE, VolumenE, tiempoE } from '../paquete-e/medios';
import { anadirArchivosE, quitarPistaLocalE, usePistasLocalesE } from '../paquete-e/pistas-locales';

export function MusicPlayerWidget() {
    const { ref, lienzo } = useLienzoE();
    const { state, playTrack, toggle, next, prev, seek, setVolume } = useMediaPlayer();
    const locales = usePistasLocalesE();
    const archivo = useRef<HTMLInputElement>(null);
    const [intento, setIntento] = useState<string | null>(null);
    const pista = state.track;
    const esRadio = pista?.kind === 'radio';
    const cola: MediaTrack[] = [...locales, ...SAMPLE_TRACKS];
    const duracion = Number.isFinite(state.duration) && state.duration > 0 ? state.duration : 0;
    const progreso = duracion && !esRadio ? Math.min(1, state.currentTime / duracion) : 0;
    const cargando = state.loading && !state.playing;
    // Pista que no arrancó (red caída o formato): si tras intentarlo no carga ni suena, se ofrece reintentar.
    const [fallo, setFallo] = useState<string | null>(null);

    useEffect(() => {
        if (!intento || pista?.id !== intento) return;
        if (state.playing) { setIntento(null); setFallo(null); return; }
        if (!state.loading) { const id = window.setTimeout(() => setFallo(intento), 700); return () => window.clearTimeout(id); }
    }, [intento, pista, state.playing, state.loading]);

    const tocar = (t: MediaTrack) => {
        if (pista?.id === t.id && !fallo) { toggle(); return; }
        setFallo(null);
        setIntento(t.id);
        playTrack(t, t.id.startsWith('local-') ? locales : cola);
    };
    const alternar = () => { if (pista) toggle(); else tocar(cola[0]); };
    const abrirArchivos = (e: React.ChangeEvent<HTMLInputElement>) => {
        const nuevas = e.target.files ? anadirArchivosE(e.target.files) : [];
        e.target.value = '';
        if (nuevas[0]) { setIntento(nuevas[0].id); playTrack(nuevas[0], [...locales, ...nuevas]); }
    };

    const { base, clase, horizontal } = lienzo;
    const titulo = pista?.title ?? 'Nada sonando';
    const subtitulo = cargando ? 'Cargando…' : fallo === pista?.id ? 'No se pudo reproducir' : pista?.artist ?? 'Elige una pista o abre un audio';
    const raiz = { lienzo, refRaiz: ref, etiqueta: `Reproductor: ${pista ? `${titulo}${state.playing ? ', sonando' : ', en pausa'}` : 'nada sonando'}`, tipo: 'MUSIC_PLAYER' } as const;
    const entradaArchivo = <input ref={archivo} type="file" accept="audio/*" multiple hidden onChange={abrirArchivos} aria-hidden tabIndex={-1} />;
    const botonAbrir = <BotonE lienzo={lienzo} variante="suave" compacto icono={FolderOpen} onClick={() => archivo.current?.click()}>Abrir audio</BotonE>;

    const onda = (alto: number) => esRadio
        ? <div className="flex items-center gap-2 text-[11px] text-white/60"><EqE suena={state.playing} lienzo={lienzo} alto={alto * 0.8} barras={9} /><span className="uppercase tracking-[0.14em]">En vivo</span></div>
        : <div className="flex w-full min-w-0 items-center gap-2">
            <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-white/50">{tiempoE(state.currentTime)}</span>
            <OndaE id={pista?.id ?? 'nada'} progreso={progreso} alto={alto} lienzo={lienzo} etiqueta={duracion ? `Posición ${tiempoE(state.currentTime)} de ${tiempoE(duracion)}` : 'Posición'} onSaltar={duracion ? (f) => seek(f * duracion) : undefined} />
            <span className="w-9 shrink-0 text-[11px] tabular-nums text-white/50">{tiempoE(duracion)}</span>
        </div>;

    const reintento = fallo && fallo === pista?.id ? (
        <BotonE lienzo={{ ...lienzo, acento: '#f59e0b' }} compacto icono={RotateCcw} onClick={() => pista && tocar(pista)}>Reintentar</BotonE>
    ) : null;

    const colaEl = (max: number) => (
        <section aria-label="Cola de reproducción" className="flex min-h-0 min-w-0 flex-col gap-1">
            <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">Cola</span>
                <SelloE title="Pistas libres de SoundHelix que trae el OS para probar el reproductor">demostración</SelloE>
                <span className="flex-1" />
                {botonAbrir}
            </div>
            <ol className={cn('flex min-h-0 flex-col gap-0.5', estilosE.desliza)}>
                {cola.slice(0, max).map((t) => {
                    const activa = pista?.id === t.id;
                    const local = t.id.startsWith('local-');
                    return (
                        <li key={t.id} className="flex items-center gap-1">
                            <button type="button" onClick={() => tocar(t)} aria-current={activa ? 'true' : undefined}
                                aria-label={`${activa && state.playing ? 'Pausar' : 'Reproducir'} ${t.title}`}
                                className={cn('flex min-h-9 min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-xl px-2 text-left transition-colors duration-150', activa ? 'bg-white/[0.08]' : 'hover:bg-white/[0.05]')}>
                                {activa ? <EqE suena={state.playing} lienzo={lienzo} barras={3} alto={12} /> : <Music aria-hidden className="size-3.5 shrink-0 text-white/40" />}
                                <span className="min-w-0 flex-1">
                                    <span className={cn('block truncate text-[12px]', activa ? 'font-semibold text-white' : 'text-white/85')}>{t.title}</span>
                                    <span className="block truncate text-[11px] text-white/45">{local ? 'De tu dispositivo' : t.artist}</span>
                                </span>
                            </button>
                            {local && <BotonE lienzo={lienzo} variante="fantasma" compacto icono={X} etiqueta={`Quitar ${t.title}`} onClick={() => quitarPistaLocalE(t.id)} />}
                        </li>
                    );
                })}
            </ol>
        </section>
    );

    // micro: portada con play encima.
    if (base === 'micro') {
        const lado = Math.max(44, Math.min(lienzo.ancho || 80, lienzo.alto || 80) * 0.8);
        return (
            <RaizE {...raiz}>
                <button type="button" onClick={alternar} aria-label={state.playing ? `Pausar ${titulo}` : `Reproducir ${pista ? titulo : 'música'}`}
                    className="ss-redondo relative m-auto grid cursor-pointer place-items-center rounded-full outline-none focus-visible:ring-2" style={{ width: lado, height: lado }}>
                    <PortadaE id={pista?.id ?? 'nada'} arte={pista?.art} lado={lado} suena={state.playing} lienzo={lienzo} radio={esRadio} />
                </button>
            </RaizE>
        );
    }

    // s: portada + título + play.
    if (base === 's') {
        const lado = Math.max(56, Math.min(88, (lienzo.alto || 150) * 0.5));
        return (
            <RaizE {...raiz}>
                <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center">
                    <PortadaE id={pista?.id ?? 'nada'} arte={pista?.art} lado={lado} suena={state.playing} lienzo={lienzo} radio={esRadio} />
                    <span className="line-clamp-1 max-w-full text-[12px] font-semibold text-white" title={titulo}>{titulo}</span>
                    <TransporteE lienzo={lienzo} suena={state.playing} cargando={cargando} hayPista={!!pista} onAlternar={alternar} sinSaltos />
                </div>
                {entradaArchivo}
            </RaizE>
        );
    }

    const info = (tam: number) => (
        <div className="min-w-0" aria-live="polite">
            <p className="truncate font-semibold text-white" style={{ fontSize: px(lienzo, tam) }} title={titulo}>{titulo}</p>
            <p className={cn('truncate', fallo === pista?.id ? 'text-amber-300' : 'text-white/55')} style={{ fontSize: px(lienzo, 12) }}>{subtitulo}</p>
        </div>
    );

    // panorámico: tira horizontal.
    if (horizontal) {
        const lado = Math.max(48, Math.min(96, (lienzo.alto || 120) - 16));
        return (
            <RaizE {...raiz}>
                <div className="flex h-full min-h-0 items-center gap-3 px-1">
                    <PortadaE id={pista?.id ?? 'nada'} arte={pista?.art} lado={lado} suena={state.playing} lienzo={lienzo} radio={esRadio} />
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">{info(14)}{onda(22)}</div>
                    <TransporteE lienzo={lienzo} suena={state.playing} cargando={cargando} hayPista={!!pista} onAnterior={prev} onAlternar={alternar} onSiguiente={next} />
                    {(lienzo.ancho || 0) > 640 && <VolumenE lienzo={lienzo} volumen={state.volume} onCambio={setVolume} className="w-36 shrink-0" />}
                    {reintento}
                </div>
                {entradaArchivo}
            </RaizE>
        );
    }

    const grande = base === 'l' || base === 'xl';
    const alLado = base === 'xl' && (lienzo.ancho || 0) >= (lienzo.alto || 0) * 1.1;
    const ladoPortada = base === 'xl' ? Math.max(120, Math.min(220, (lienzo.alto || 400) * 0.42)) : base === 'l' ? 96 : Math.max(64, Math.min(96, (lienzo.alto || 240) * 0.34));

    return (
        <RaizE {...raiz}>
            {/* Si la columna no cabe, se retiran la onda y luego la cabecera: «Abrir audio» (la acción
                cuando no suena nada) ya no se corta por abajo. */}
            <PilaAjustable niveles={2} className={cn('gap-4 p-1', alLado ? '!flex-row' : 'gap-2.5')}>
                <div className={cn('flex min-w-0 flex-col gap-2.5', alLado ? 'min-h-0 w-[46%] shrink-0 justify-center' : 'shrink-0')}>
                    {grande && !alLado && <Prescindible nivel={2}><EncabezadoE lienzo={lienzo} icono={esRadio ? RadioIcon : Music} titulo={esRadio ? 'Radio' : 'Reproductor'} vivo={esRadio && state.playing} /></Prescindible>}
                    <div className={cn('flex min-w-0 gap-3', base === 'xl' ? 'flex-col items-center text-center' : 'items-center')}>
                        <PortadaE id={pista?.id ?? 'nada'} arte={pista?.art} lado={ladoPortada} suena={state.playing} lienzo={lienzo} radio={esRadio} />
                        <div className="flex min-w-0 flex-1 flex-col gap-1">{info(base === 'xl' ? 17 : 15)}{reintento}</div>
                    </div>
                    <Prescindible nivel={1}>{onda(base === 'm' ? 22 : 28)}</Prescindible>
                    <TransporteE lienzo={lienzo} suena={state.playing} cargando={cargando} hayPista={!!pista} onAnterior={prev} onAlternar={alternar} onSiguiente={next} grande={grande} />
                    {grande && <VolumenE lienzo={lienzo} volumen={state.volume} onCambio={setVolume} />}
                    {base === 'm' && clase !== 'torre' && !pista && <div className="flex justify-center">{botonAbrir}</div>}
                </div>
                {/* (Pulido 0930) Caja flexible: la cola se desplaza dentro en vez de crecer bajo la tarjeta. */}
                {(grande || clase === 'torre') && <div className="flex min-h-0 min-w-0 flex-1 flex-col">{colaEl(base === 'xl' ? 14 : 8)}</div>}
            </PilaAjustable>
            {entradaArchivo}
        </RaizE>
    );
}
